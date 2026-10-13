import React, { useState } from 'react';
import {
  Clock,
  Eye,
  Sliders,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { formatDuration, parseDurationInput } from '@shared/time';
import { clipDuration, setClipRange } from '@shared/timeline';
import type { AspectPreset, FitMode, SeamCandidate, VideoTransition } from '@shared/types';
import { useEditor } from '../../context/EditorContext';
import { id } from '../../locales/id';

export const Inspector: React.FC = () => {
  const {
    project,
    activeInspectorTab,
    setActiveInspectorTab,
    selectedClipId,
    updateProjectSettings,
    updateClipProps,
    setLoopPreview,
    pushHistory,
  } = useEditor() as ReturnType<typeof useEditor> & { pushHistory?: (p: unknown) => void };

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [candidates, setCandidates] = useState<SeamCandidate[]>([]);
  const [targetDurText, setTargetDurText] = useState(
    () => formatDuration(project.settings.loop.targetDurationMs)
  );

  const loop = project.settings.loop;
  const aspect = project.settings.aspect;

  const selectedClip = selectedClipId ? project.clips.find((c) => c.id === selectedClipId) : undefined;
  const selectedAsset = selectedClip ? project.assets.find((a) => a.id === selectedClip.assetId) : undefined;

  // Handle Seam Analysis
  const handleAnalyzeSeam = async () => {
    if (!window.nigiApi) return;
    const clipToAnalyze = selectedClip ?? project.clips[0];
    if (!clipToAnalyze) {
      alert('Tambahkan klip ke linimasa terlebih dahulu untuk menganalisis sambungan.');
      return;
    }
    const asset = project.assets.find((a) => a.id === clipToAnalyze.assetId);
    if (!asset) return;

    setIsAnalyzing(true);
    try {
      const res = await window.nigiApi.analyzeSeam({
        path: asset.path,
        durationMs: asset.metadata.durationMs,
        hasVideo: asset.metadata.hasVideo,
        hasAudio: asset.metadata.hasAudio,
        rangeInMs: clipToAnalyze.inMs,
        rangeOutMs: clipToAnalyze.outMs,
        windowMs: 3000,
      });
      setCandidates(res.candidates);
    } catch (err) {
      console.error('Seam analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle Loop Preview Generation
  const handleGenerateLoopPreview = async () => {
    if (!window.nigiApi) return;
    try {
      const res = await window.nigiApi.generateLoopPreview(project);
      if (res.ok && res.url) {
        setLoopPreview(res.url, res.durationMs, res.seamAtMs);
      } else {
        alert(`Gagal membuat pratinjau sambungan:\n${res.errorDetail ?? res.errorCode}`);
      }
    } catch (err) {
      alert(`Error pratinjau: ${String(err)}`);
    }
  };

  const handleApplyCandidate = (cand: SeamCandidate) => {
    if (!selectedClipId) return;
    const nextDoc = setClipRange(project, selectedClipId, cand.inMs, cand.outMs);
    // update via project settings updater
    updateProjectSettings((s) => s);
  };

  return (
    <div className="right-panel">
      {/* Tabs */}
      <div className="panel-tabs">
        <button
          className={`panel-tab ${activeInspectorTab === 'project' ? 'active' : ''}`}
          onClick={() => setActiveInspectorTab('project')}
        >
          {id.inspector.tabs.project}
        </button>
        <button
          className={`panel-tab ${activeInspectorTab === 'detail' ? 'active' : ''}`}
          onClick={() => setActiveInspectorTab('detail')}
        >
          {id.inspector.tabs.detail}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {activeInspectorTab === 'project' ? (
          <>
            {/* Section: Aspect Ratio */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sliders size={15} color="var(--nigi-orange)" />
                <span>{id.inspector.projectSettings.aspectRatio}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Preset Rasio:
                </label>
                <select
                  value={aspect.preset}
                  onChange={(e) => {
                    const preset = e.target.value as AspectPreset;
                    updateProjectSettings((prev) => ({
                      ...prev,
                      aspect: { ...prev.aspect, preset },
                    }));
                  }}
                >
                  <option value="source">{id.inspector.projectSettings.presets.source}</option>
                  <option value="16:9">{id.inspector.projectSettings.presets['16:9']}</option>
                  <option value="9:16">{id.inspector.projectSettings.presets['9:16']}</option>
                  <option value="1:1">{id.inspector.projectSettings.presets['1:1']}</option>
                  <option value="4:5">{id.inspector.projectSettings.presets['4:5']}</option>
                  <option value="4:3">{id.inspector.projectSettings.presets['4:3']}</option>
                  <option value="3:2">{id.inspector.projectSettings.presets['3:2']}</option>
                  <option value="custom">{id.inspector.projectSettings.presets.custom}</option>
                </select>
              </div>

              {aspect.preset === 'custom' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{id.inspector.projectSettings.customWidth}</label>
                    <input
                      type="number"
                      step={2}
                      min={128}
                      max={4096}
                      value={aspect.width}
                      onChange={(e) => {
                        const width = parseInt(e.target.value, 10);
                        updateProjectSettings((prev) => ({
                          ...prev,
                          aspect: { ...prev.aspect, width },
                        }));
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{id.inspector.projectSettings.customHeight}</label>
                    <input
                      type="number"
                      step={2}
                      min={128}
                      max={4096}
                      value={aspect.height}
                      onChange={(e) => {
                        const height = parseInt(e.target.value, 10);
                        updateProjectSettings((prev) => ({
                          ...prev,
                          aspect: { ...prev.aspect, height },
                        }));
                      }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {id.inspector.projectSettings.fitMode}:
                </label>
                <select
                  value={project.settings.defaultFitMode}
                  onChange={(e) => {
                    const defaultFitMode = e.target.value as FitMode;
                    updateProjectSettings((prev) => ({ ...prev, defaultFitMode }));
                  }}
                >
                  <option value="fit">{id.inspector.projectSettings.fitModes.fit}</option>
                  <option value="fill">{id.inspector.projectSettings.fitModes.fill}</option>
                  <option value="stretch">{id.inspector.projectSettings.fitModes.stretch}</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{id.inspector.projectSettings.bgColor}:</label>
                <input
                  type="color"
                  value={aspect.backgroundColor}
                  onChange={(e) => {
                    const backgroundColor = e.target.value;
                    updateProjectSettings((prev) => ({
                      ...prev,
                      aspect: { ...prev.aspect, backgroundColor },
                    }));
                  }}
                  style={{ width: 44, height: 26, padding: 0, cursor: 'pointer' }}
                />
              </div>
            </div>

            <div style={{ width: '100%', height: 1, backgroundColor: 'var(--border-subtle)' }} />

            {/* Section: Seamless Loop Engine */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={15} color="var(--teal-active)" />
                <span>{id.inspector.loopEngine.title}</span>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={loop.enabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    updateProjectSettings((prev) => ({
                      ...prev,
                      loop: { ...prev.loop, enabled },
                    }));
                  }}
                  style={{ accentColor: 'var(--nigi-orange)' }}
                />
                <span style={{ fontWeight: 500 }}>{id.inspector.loopEngine.enableLoop}</span>
              </label>

              {loop.enabled && (
                <>
                  {/* Target duration */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {id.inspector.loopEngine.targetDuration}:
                    </label>
                    <input
                      type="text"
                      value={targetDurText}
                      onChange={(e) => setTargetDurText(e.target.value)}
                      onBlur={() => {
                        const parsed = parseDurationInput(targetDurText);
                        if (parsed && parsed >= 1000) {
                          updateProjectSettings((prev) => ({
                            ...prev,
                            loop: { ...prev.loop, targetDurationMs: parsed },
                          }));
                        } else {
                          setTargetDurText(formatDuration(loop.targetDurationMs));
                        }
                      }}
                      placeholder="e.g. 2:30"
                    />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {id.inspector.loopEngine.targetDurationHelp}
                    </span>
                  </div>

                  {/* Video crossfade */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {id.inspector.loopEngine.videoCrossfadeDuration}:
                      </span>
                      <span style={{ color: 'var(--nigi-orange)' }}>
                        {(loop.videoCrossfadeMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={5000}
                      step={200}
                      value={loop.videoCrossfadeMs}
                      onChange={(e) => {
                        const videoCrossfadeMs = parseInt(e.target.value, 10);
                        updateProjectSettings((prev) => ({
                          ...prev,
                          loop: { ...prev.loop, videoCrossfadeMs },
                        }));
                      }}
                      style={{ accentColor: 'var(--nigi-orange)' }}
                    />
                  </div>

                  {/* Video transition type */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {id.inspector.loopEngine.videoTransition}:
                    </label>
                    <select
                      value={loop.videoTransition}
                      onChange={(e) => {
                        const videoTransition = e.target.value as VideoTransition;
                        updateProjectSettings((prev) => ({
                          ...prev,
                          loop: { ...prev.loop, videoTransition },
                        }));
                      }}
                    >
                      <option value="fade">{id.inspector.loopEngine.transitions.fade}</option>
                      <option value="dissolve">{id.inspector.loopEngine.transitions.dissolve}</option>
                      <option value="fadeblack">{id.inspector.loopEngine.transitions.fadeblack}</option>
                      <option value="fadewhite">{id.inspector.loopEngine.transitions.fadewhite}</option>
                      <option value="wipeleft">{id.inspector.loopEngine.transitions.wipeleft}</option>
                      <option value="slideleft">{id.inspector.loopEngine.transitions.slideleft}</option>
                      <option value="smoothleft">{id.inspector.loopEngine.transitions.smoothleft}</option>
                      <option value="circleopen">{id.inspector.loopEngine.transitions.circleopen}</option>
                      <option value="radial">{id.inspector.loopEngine.transitions.radial}</option>
                    </select>
                  </div>

                  {/* Audio crossfade */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={loop.audioCrossfadeEnabled}
                        onChange={(e) => {
                          const audioCrossfadeEnabled = e.target.checked;
                          updateProjectSettings((prev) => ({
                            ...prev,
                            loop: { ...prev.loop, audioCrossfadeEnabled },
                          }));
                        }}
                        style={{ accentColor: 'var(--teal-active)' }}
                      />
                      <span>{id.inspector.loopEngine.audioCrossfade}</span>
                    </label>

                    {loop.audioCrossfadeEnabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 18 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {id.inspector.loopEngine.audioCrossfadeDuration}:
                          </span>
                          <span style={{ color: 'var(--teal-active)' }}>
                            {(loop.audioCrossfadeMs / 1000).toFixed(1)}s
                          </span>
                        </div>
                        <input
                          type="range"
                          min={200}
                          max={5000}
                          step={200}
                          value={loop.audioCrossfadeMs}
                          onChange={(e) => {
                            const audioCrossfadeMs = parseInt(e.target.value, 10);
                            updateProjectSettings((prev) => ({
                              ...prev,
                              loop: { ...prev.loop, audioCrossfadeMs },
                            }));
                          }}
                          style={{ accentColor: 'var(--teal-active)' }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Preview Loop Button */}
                  <button
                    className="btn-secondary"
                    style={{ justifyContent: 'center', borderColor: 'var(--teal-active)' }}
                    onClick={handleGenerateLoopPreview}
                  >
                    <Eye size={14} color="var(--teal-active)" />
                    <span>{id.inspector.loopEngine.previewLoopButton}</span>
                  </button>

                  {/* Smart Seam Finder */}
                  <div
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      padding: 10,
                      backgroundColor: 'var(--bg-surface)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>
                      {id.inspector.loopEngine.smartSeamFinder}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {id.inspector.loopEngine.seamAnalysisDesc}
                    </div>

                    <button
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '4px 8px', justifyContent: 'center' }}
                      disabled={isAnalyzing}
                      onClick={handleAnalyzeSeam}
                    >
                      {isAnalyzing ? id.inspector.loopEngine.analyzing : id.inspector.loopEngine.analyzeButton}
                    </button>

                    {candidates.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                        {candidates.map((cand, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 8px',
                              backgroundColor: 'var(--bg-panel)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 11,
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 500 }}>
                                #{idx + 1} {formatDuration(cand.inMs)} - {formatDuration(cand.outMs)}
                              </div>
                              <div
                                style={{
                                  fontSize: 10,
                                  color:
                                    cand.confidence === 'high'
                                      ? 'var(--success)'
                                      : cand.confidence === 'medium'
                                      ? 'var(--nigi-orange)'
                                      : 'var(--danger)',
                                }}
                              >
                                {id.inspector.loopEngine.confidenceLabels[cand.confidence as keyof typeof id.inspector.loopEngine.confidenceLabels]}
                              </div>
                            </div>
                            <button
                              className="btn-secondary"
                              style={{ padding: '2px 6px', fontSize: 10 }}
                              onClick={() => handleApplyCandidate(cand)}
                            >
                              Terapkan
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          /* Tab Detail Klip */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!selectedClip || !selectedAsset ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 10px' }}>
                <Clock size={28} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                <p style={{ fontSize: 12 }}>{id.inspector.clipDetail.noClipSelected}</p>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                  {id.inspector.clipDetail.fileName}:
                </div>
                <div style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--nigi-orange)' }}>
                  {selectedAsset.name}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>{id.inspector.clipDetail.duration}:</span>
                    <div style={{ fontWeight: 600 }}>{formatDuration(clipDuration(selectedClip))}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>{id.inspector.clipDetail.sourceDuration}:</span>
                    <div style={{ fontWeight: 600 }}>{formatDuration(selectedAsset.metadata.durationMs)}</div>
                  </div>
                  {selectedAsset.metadata.width && (
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>{id.inspector.clipDetail.resolution}:</span>
                      <div style={{ fontWeight: 600 }}>
                        {selectedAsset.metadata.width}x{selectedAsset.metadata.height}
                      </div>
                    </div>
                  )}
                  {selectedAsset.metadata.frameRate && (
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>{id.inspector.clipDetail.fps}:</span>
                      <div style={{ fontWeight: 600 }}>
                        {(selectedAsset.metadata.frameRate.num / selectedAsset.metadata.frameRate.den).toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ width: '100%', height: 1, backgroundColor: 'var(--border-subtle)' }} />

                {/* Volume Slider */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{id.inspector.clipDetail.volume}:</span>
                    <span style={{ color: 'var(--nigi-orange)' }}>{Math.round(selectedClip.volume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={selectedClip.volume}
                    onChange={(e) => updateClipProps(selectedClip.id, { volume: parseFloat(e.target.value) })}
                    style={{ accentColor: 'var(--nigi-orange)' }}
                  />
                </div>

                {/* Mute Clip Checkbox */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedClip.muted}
                    onChange={(e) => updateClipProps(selectedClip.id, { muted: e.target.checked })}
                    style={{ accentColor: 'var(--danger)' }}
                  />
                  <span>{id.inspector.clipDetail.mute}</span>
                </label>

                {/* Fit Mode */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {id.inspector.clipDetail.fitMode}:
                  </label>
                  <select
                    value={selectedClip.fitMode}
                    onChange={(e) => updateClipProps(selectedClip.id, { fitMode: e.target.value as FitMode })}
                  >
                    <option value="fit">{id.inspector.projectSettings.fitModes.fit}</option>
                    <option value="fill">{id.inspector.projectSettings.fitModes.fill}</option>
                    <option value="stretch">{id.inspector.projectSettings.fitModes.stretch}</option>
                  </select>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
