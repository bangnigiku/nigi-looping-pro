import React, {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Info,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { ratioLabel, resolveOutputSize } from '@shared/aspect';
import { formatDuration, formatTimecode, resolveProjectFps, stepByFrames } from '@shared/time';
import { clipEnd, clipAt, activeVideoClipAt, globalTimeToClipSourceMs } from '@shared/timeline';
import type { MediaAsset, TimelineClip } from '@shared/types';
import { useEditor } from '../../context/EditorContext';
import { id } from '../../locales/id';

export const PreviewMonitor: React.FC = () => {
  const {
    project,
    playback,
    togglePlay,
    setIsPlaying,
    setCurrentTimeMs,
    stepFrameForward,
    stepFrameBackward,
    setVolume,
    setMuted,
    setLoopPreview,
    updateAsset,
    selectedAssetId,
    previewEpoch,
  } = useEditor();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const requestTokenRef = useRef<number>(0);

  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomMode, setZoomMode] = useState<'fit' | '50%' | '75%' | '100%'>('fit');
  const [isGeneratingProxy, setIsGeneratingProxy] = useState(false);
  const [proxyProgress, setProxyProgress] = useState(0);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticDetails, setDiagnosticDetails] = useState<string | null>(null);

  const fps = resolveProjectFps(project);
  const canvasSize = resolveOutputSize(project);
  const canvasAspect = canvasSize.width / canvasSize.height;

  const hasAssets = project.assets.length > 0;
  const hasClips = project.clips.length > 0;
  const hasAnyMedia = hasAssets || hasClips;

  // Determine current active media source:
  // If no media in project, mediaSrc MUST be null!
  // 1. Loop preview mode active: play loopPreviewUrl ONLY IF hasAssets
  // 2. Timeline playback: find video clip at current time across all video tracks
  // 3. Fallback: preview currently selected asset from Media Bin only if timeline is empty
  const currentClip: TimelineClip | undefined = (!hasAnyMedia || playback.loopPreviewMode)
    ? undefined
    : (activeVideoClipAt(project, playback.currentTimeMs) ?? undefined);

  const currentAsset: MediaAsset | undefined = (!hasAnyMedia)
    ? undefined
    : currentClip
      ? project.assets.find((a) => a.id === currentClip.assetId)
      : (!hasClips && selectedAssetId)
        ? project.assets.find((a) => a.id === selectedAssetId)
        : undefined;

  // Active audio clip on track-audio-1
  const currentAudioClip: TimelineClip | undefined = (!hasAnyMedia || playback.loopPreviewMode)
    ? undefined
    : clipAt(project, 'track-audio-1', playback.currentTimeMs);

  const currentAudioAsset: MediaAsset | undefined = (!hasAnyMedia)
    ? undefined
    : currentAudioClip
      ? project.assets.find((a) => a.id === currentAudioClip.assetId)
      : undefined;

  // Media source URLs (using robust query parameter format)
  let mediaSrc: string | null = null;
  if (hasAssets && playback.loopPreviewMode && playback.loopPreviewUrl) {
    mediaSrc = playback.loopPreviewUrl;
  } else if (hasAnyMedia && currentAsset) {
    const targetPath = currentAsset.proxyPath || currentAsset.path;
    mediaSrc = `nigi-media://load?path=${encodeURIComponent(targetPath)}`;
  }

  let audioSrc: string | null = null;
  if (hasAnyMedia && currentAudioAsset) {
    audioSrc = `nigi-media://load?path=${encodeURIComponent(currentAudioAsset.path)}`;
  }

  // Calculate timeline sequence duration or fallback to asset duration
  const totalSeqDurationMs = project.clips.reduce((max, c) => Math.max(max, clipEnd(c)), 0);
  const displayedDurationMs = !hasAnyMedia
    ? 0
    : playback.loopPreviewMode
      ? playback.loopPreviewDurationMs
      : hasClips
        ? totalSeqDurationMs
        : (currentAsset?.metadata.durationMs ?? 0);

  // Target video source position in seconds
  let targetVideoSec = 0;
  if (!hasAnyMedia) {
    targetVideoSec = 0;
  } else if (playback.loopPreviewMode) {
    targetVideoSec = playback.currentTimeMs / 1000;
  } else if (currentClip) {
    targetVideoSec = globalTimeToClipSourceMs(currentClip, playback.currentTimeMs) / 1000;
  } else if (currentAsset) {
    targetVideoSec = Math.min((currentAsset.metadata.durationMs || 0) / 1000, playback.currentTimeMs / 1000);
  }

  // Helper to completely flush, pause, and release HTMLVideoElement decoding buffers
  const flushVideoElement = (v: HTMLVideoElement | null) => {
    if (!v) return;
    try {
      if (!v.paused) {
        v.pause();
      }
      v.removeAttribute('src');
      v.src = '';
      v.load();
    } catch {
      // ignore
    }
  };

  const flushAudioElement = (a: HTMLAudioElement | null) => {
    if (!a) return;
    try {
      if (!a.paused) {
        a.pause();
      }
      a.removeAttribute('src');
      a.src = '';
      a.load();
    } catch {
      // ignore
    }
  };

  // Immediate effect when media source changes, media is deleted, or previewEpoch bumps
  useEffect(() => {
    const currentToken = ++requestTokenRef.current;

    if (!mediaSrc) {
      flushVideoElement(videoRef.current);
      flushAudioElement(audioRef.current);
      setHasError(false);
      setErrorMessage('');
      setDiagnosticDetails(null);
      setIsGeneratingProxy(false);
      setProxyProgress(0);
      return;
    }

    return () => {
      // Cleanup previous media playback before unmounting or switching source
      requestTokenRef.current++;
      flushVideoElement(videoRef.current);
      flushAudioElement(audioRef.current);
    };
  }, [mediaSrc, previewEpoch]);

  // Synchronize HTML5 video element with Master Timeline Clock
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    if (!mediaSrc) {
      if (!v.paused) v.pause();
      return;
    }

    if (playback.isPlaying) {
      if (v.paused) {
        v.currentTime = targetVideoSec;
        v.play().catch(() => {});
      } else if (Math.abs(v.currentTime - targetVideoSec) > 0.08) {
        v.currentTime = targetVideoSec;
      }
    } else {
      if (!v.paused) {
        v.pause();
      }
      // Precise frame seek when paused, scrubbing, or stepping (< 3ms tolerance)
      if (Math.abs(v.currentTime - targetVideoSec) > 0.003) {
        v.currentTime = targetVideoSec;
      }
    }
  }, [playback.isPlaying, targetVideoSec, mediaSrc]);

  // Synchronize audio track with timeline
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    if (!audioSrc || !currentAudioClip) {
      if (!a.paused) a.pause();
      return;
    }

    const targetAudioSec = globalTimeToClipSourceMs(currentAudioClip, playback.currentTimeMs) / 1000;
    a.volume = playback.volume * (currentAudioClip.volume ?? 1);
    a.muted = playback.muted || Boolean(currentAudioClip.muted);

    if (playback.isPlaying) {
      if (a.paused) {
        a.currentTime = targetAudioSec;
        a.play().catch(() => {});
      } else if (Math.abs(a.currentTime - targetAudioSec) > 0.08) {
        a.currentTime = targetAudioSec;
      }
    } else {
      if (!a.paused) a.pause();
      if (Math.abs(a.currentTime - targetAudioSec) > 0.005) {
        a.currentTime = targetAudioSec;
      }
    }
  }, [playback.isPlaying, playback.currentTimeMs, audioSrc, currentAudioClip, playback.volume, playback.muted]);

  // Handle Video Volume / Mute
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const clipVolume = currentClip?.volume ?? 1;
    v.volume = playback.volume * clipVolume;
    v.muted = playback.muted || Boolean(currentClip?.muted);
  }, [playback.volume, playback.muted, currentClip]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ms = parseInt(e.target.value, 10);
    setCurrentTimeMs(ms);
  };

  const handleStep = (framesDelta: number) => {
    if (framesDelta < 0) {
      stepFrameBackward();
    } else {
      stepFrameForward();
    }
  };

  const handleRetry = () => {
    setHasError(false);
    if (videoRef.current) {
      videoRef.current.load();
    }
  };

  const handleGenerateProxy = async () => {
    if (!currentAsset || !window.nigiApi) return;
    const currentToken = requestTokenRef.current;
    try {
      setIsGeneratingProxy(true);
      setProxyProgress(0);

      const unsubscribe = window.nigiApi.onProxyProgress((update) => {
        if (requestTokenRef.current === currentToken && update.assetPath === currentAsset.path && typeof update.progress === 'number') {
          setProxyProgress(update.progress);
        }
      });

      const proxyPath = await window.nigiApi.generatePreviewProxy(currentAsset.path);
      unsubscribe();

      if (requestTokenRef.current !== currentToken) {
        // Discard: media was deleted or source changed
        return;
      }

      updateAsset(currentAsset.id, { proxyPath });
      setHasError(false);
      setIsGeneratingProxy(false);
    } catch (err) {
      if (requestTokenRef.current !== currentToken) return;
      setIsGeneratingProxy(false);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Gagal membuat proxy H.264: ${msg}`);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const fitMode = currentClip?.fitMode ?? project.settings.defaultFitMode;
  let objectFit: React.CSSProperties['objectFit'] = 'contain';
  if (fitMode === 'fill') objectFit = 'cover';
  if (fitMode === 'stretch') objectFit = 'fill';

  return (
    <div
      ref={containerRef}
      className="center-panel"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0D0E11' }}
    >
      {/* Top monitor bar (Aspect ratio info, zoom, fullscreen) */}
      <div
        style={{
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-panel)',
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--text-muted)' }}>{id.preview.aspectRatio}:</span>
          <span style={{ color: 'var(--nigi-orange)', fontWeight: 600 }}>
            {ratioLabel(canvasSize.width, canvasSize.height)} ({canvasSize.width}x{canvasSize.height})
          </span>
          {playback.loopPreviewMode && hasAssets && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                backgroundColor: 'rgba(66, 214, 197, 0.15)',
                color: 'var(--teal-active)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 6px',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <span>{id.preview.loopPreviewBadge}</span>
              <button
                className="icon-btn"
                style={{ width: 16, height: 16, padding: 0 }}
                title="Tutup Pratinjau Pengulangan"
                onClick={() => setLoopPreview(null)}
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select
            value={zoomMode}
            onChange={(e) => setZoomMode(e.target.value as typeof zoomMode)}
            style={{ padding: '2px 6px', fontSize: 11 }}
          >
            <option value="fit">{id.preview.zoomFit}</option>
            <option value="50%">{id.preview.zoom50}</option>
            <option value="75%">{id.preview.zoom75}</option>
            <option value="100%">{id.preview.zoom100}</option>
          </select>

          <button className="icon-btn" onClick={toggleFullscreen} title={id.preview.fullscreen}>
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Video Canvas Stage */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          padding: 12,
        }}
      >
        {/* Canvas bounding box obeying target aspect ratio */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            maxWidth: `calc((100vh - 340px) * ${canvasAspect})`,
            maxHeight: `calc(100% / ${canvasAspect > 1 ? 1 : 1})`,
            aspectRatio: `${canvasSize.width} / ${canvasSize.height}`,
            backgroundColor: project.settings.aspect.backgroundColor,
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {mediaSrc ? (
            <>
              <video
                ref={videoRef}
                key={mediaSrc}
                src={mediaSrc}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit,
                }}
                onLoadedMetadata={() => {
                  setHasError(false);
                  setDiagnosticDetails(null);
                  const v = videoRef.current;
                  if (v) {
                    v.currentTime = targetVideoSec;
                    if (playback.isPlaying) {
                      v.play().catch(() => {});
                    }
                  }
                }}
                onCanPlay={() => {
                  setHasError(false);
                }}
                onStalled={() => {
                  console.warn('[PreviewMonitor] Playback stalled on src:', mediaSrc);
                }}
                onError={() => {
                  if (!mediaSrc) return;
                  const v = videoRef.current;
                  const err = v?.error;
                  const code = err?.code ?? 0;
                  const message = err?.message || '';
                  setHasError(true);

                  const diag = {
                    errorCode: code,
                    errorMessage: message,
                    mediaSrc,
                    assetPath: currentAsset?.path,
                    videoCodec: currentAsset?.metadata?.videoCodec,
                    audioCodec: currentAsset?.metadata?.audioCodec,
                    hasVideo: currentAsset?.metadata?.hasVideo,
                    container: currentAsset?.metadata?.formatName,
                    proxyPath: currentAsset?.proxyPath,
                  };

                  setDiagnosticDetails(JSON.stringify(diag, null, 2));
                  window.nigiApi?.logDiagnostic('VIDEO_ELEMENT_ERROR', diag);

                  if (code === 4 /* MEDIA_ERR_SRC_NOT_SUPPORTED */) {
                    setErrorMessage(
                      currentAsset?.metadata?.previewLikelyUnsupported
                        ? `Codec video (${currentAsset.metadata.videoCodec || 'tidak dikenal'}) memerlukan proxy H.264 untuk diputar di monitor.`
                        : 'Format berkas atau codec tidak didukung pemutar bawaan. Anda dapat membuat proxy H.264 untuk memutarnya.'
                    );
                  } else if (code === 2 /* MEDIA_ERR_NETWORK */) {
                    setErrorMessage('Terjadi gangguan jaringan atau protokol saat membaca berkas media dari disk.');
                  } else if (code === 3 /* MEDIA_ERR_DECODE */) {
                    setErrorMessage('Gagal mendekode video. Terjadi kerusakan data frame atau format tidak kompatibel.');
                  } else {
                    setErrorMessage(id.preview.previewError);
                  }
                }}
                onEnded={() => {
                  if (playback.loopPreviewMode) {
                    const v = videoRef.current;
                    if (v) {
                      v.currentTime = 0;
                      v.play().catch(() => {});
                    }
                  } else {
                    setIsPlaying(false);
                  }
                }}
              />
              {audioSrc && <audio ref={audioRef} key={audioSrc} src={audioSrc} style={{ display: 'none' }} />}
            </>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
              <p style={{ fontSize: 13, marginBottom: 4, fontWeight: 500 }}>{id.preview.noMediaToPreview}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {hasAssets
                  ? 'Pilih media di panel kiri atau tambahkan ke linimasa'
                  : 'Impor berkas video atau audio untuk memulai'}
              </p>
            </div>
          )}

          {hasError && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(21, 23, 27, 0.94)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                textAlign: 'center',
                zIndex: 10,
              }}
            >
              <AlertTriangle size={36} color="var(--danger)" style={{ marginBottom: 10 }} />
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--danger)', marginBottom: 6 }}>
                Gagal Memuat Pratinjau
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 420, lineHeight: 1.5, marginBottom: 16 }}>
                {errorMessage}
              </div>

              {isGeneratingProxy && (
                <div style={{ width: '100%', maxWidth: 320, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                    <span>Sedang memproses proxy H.264...</span>
                    <span>{Math.round(proxyProgress * 100)}%</span>
                  </div>
                  <div style={{ width: '100%', height: 6, backgroundColor: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.round(proxyProgress * 100)}%`,
                        height: '100%',
                        backgroundColor: 'var(--nigi-orange)',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                <button
                  className="btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12 }}
                  onClick={handleRetry}
                  disabled={isGeneratingProxy}
                >
                  <RotateCcw size={14} />
                  <span>Coba Lagi</span>
                </button>

                {currentAsset && !currentAsset.proxyPath && (
                  <button
                    className="btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12 }}
                    onClick={handleGenerateProxy}
                    disabled={isGeneratingProxy}
                  >
                    {isGeneratingProxy ? <RefreshCw size={14} className="spin" /> : <Zap size={14} />}
                    <span>{isGeneratingProxy ? 'Membuat Proxy...' : 'Buat Proxy Pratinjau (H.264)'}</span>
                  </button>
                )}

                {diagnosticDetails && (
                  <button
                    className="btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)' }}
                    onClick={() => setShowDiagnostics((prev) => !prev)}
                  >
                    <Info size={12} />
                    <span>{showDiagnostics ? 'Tutup Diagnostik' : 'Info Teknis'}</span>
                  </button>
                )}
              </div>

              {showDiagnostics && diagnosticDetails && (
                <div
                  style={{
                    marginTop: 14,
                    padding: 10,
                    backgroundColor: '#0D0E11',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    maxWidth: 420,
                    width: '100%',
                    textAlign: 'left',
                    fontFamily: 'monospace',
                    fontSize: 10,
                    color: 'var(--teal-active)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: 120,
                    overflowY: 'auto',
                  }}
                >
                  {diagnosticDetails}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Monitor Scrubber & Controls */}
      <div
        style={{
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-panel)',
          padding: '8px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {/* Scrubber slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="range"
            min={0}
            max={Math.max(1, displayedDurationMs)}
            value={hasAnyMedia ? playback.currentTimeMs : 0}
            disabled={!hasAnyMedia || displayedDurationMs === 0}
            onChange={handleSeek}
            style={{
              flex: 1,
              accentColor: 'var(--nigi-orange)',
              cursor: hasAnyMedia && displayedDurationMs > 0 ? 'pointer' : 'not-allowed',
              opacity: hasAnyMedia && displayedDurationMs > 0 ? 1 : 0.4,
            }}
          />
        </div>

        {/* Buttons and Timecode */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="icon-btn"
              disabled={!hasAnyMedia}
              onClick={() => handleStep(-1)}
              title={id.preview.stepBackward}
              style={{ opacity: hasAnyMedia ? 1 : 0.4, cursor: hasAnyMedia ? 'pointer' : 'not-allowed' }}
            >
              <ChevronLeft size={16} />
            </button>

            <button
              className="btn-primary"
              disabled={!hasAnyMedia}
              style={{
                width: 34,
                height: 34,
                padding: 0,
                justifyContent: 'center',
                borderRadius: '50%',
                opacity: hasAnyMedia ? 1 : 0.4,
                cursor: hasAnyMedia ? 'pointer' : 'not-allowed',
              }}
              onClick={togglePlay}
              title={playback.isPlaying ? id.preview.pause : id.preview.play}
            >
              {playback.isPlaying ? (
                <Pause size={16} fill="currentColor" />
              ) : (
                <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />
              )}
            </button>

            <button
              className="icon-btn"
              disabled={!hasAnyMedia}
              onClick={() => handleStep(1)}
              title={id.preview.stepForward}
              style={{ opacity: hasAnyMedia ? 1 : 0.4, cursor: hasAnyMedia ? 'pointer' : 'not-allowed' }}
            >
              <ChevronRight size={16} />
            </button>

            {/* Timecode */}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, marginLeft: 8 }}>
              <span style={{ color: hasAnyMedia ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 600 }}>
                {formatTimecode(hasAnyMedia ? playback.currentTimeMs : 0, fps)}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                {' / '}
                {formatDuration(hasAnyMedia ? displayedDurationMs : 0)}
              </span>
            </div>
          </div>

          {/* Volume controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="icon-btn"
              onClick={() => setMuted(!playback.muted)}
              title={playback.muted ? id.preview.unmute : id.preview.mute}
            >
              {playback.muted || playback.volume === 0 ? (
                <VolumeX size={16} color="var(--danger)" />
              ) : (
                <Volume2 size={16} />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={playback.muted ? 0 : playback.volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                if (playback.muted) setMuted(false);
              }}
              style={{ width: 70, accentColor: 'var(--teal-active)', cursor: 'pointer' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
