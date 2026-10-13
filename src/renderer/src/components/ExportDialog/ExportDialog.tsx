import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FolderOpen,
  Loader2,
  Play,
  RefreshCw,
  X,
} from 'lucide-react';
import { ratioLabel, resolveOutputSize } from '@shared/aspect';
import { formatDuration, resolveProjectFps } from '@shared/time';
import { sequenceDuration } from '@shared/timeline';
import type { ExportJob, OutputContainer, QualityPreset } from '@shared/types';
import { useEditor } from '../../context/EditorContext';
import { id } from '../../locales/id';

export type ExportUiState = 'idle' | 'preparing' | 'running' | 'cancelling' | 'completed' | 'failed';

export const ExportDialog: React.FC = () => {
  const { project, exportModalOpen, setExportModalOpen, updateProjectSettings } = useEditor();

  const [exportState, setExportState] = useState<ExportUiState>('idle');
  const [activeJob, setActiveJob] = useState<ExportJob | null>(null);
  const [outputPath, setOutputPath] = useState<string>('');

  const exp = project.settings.export;
  const loop = project.settings.loop;
  const canvasSize = resolveOutputSize(project);
  const fps = resolveProjectFps(project);

  const timelineDurMs = loop.enabled ? loop.targetDurationMs : sequenceDuration(project);

  // Reset to idle whenever dialog is opened if previous job completed or failed
  useEffect(() => {
    if (exportModalOpen) {
      if (exportState === 'completed' || exportState === 'failed' || exportState === 'cancelling') {
        setExportState('idle');
        setActiveJob(null);
      }
    }
  }, [exportModalOpen]);

  useEffect(() => {
    if (!window.nigiApi) return;
    const unsub = window.nigiApi.onExportProgress((job) => {
      setActiveJob(job);
      if (job.state === 'running' || job.state === 'finalizing') {
        setExportState('running');
      } else if (job.state === 'completed') {
        setExportState('completed');
      } else if (job.state === 'failed') {
        setExportState('failed');
      } else if (job.state === 'cancelled') {
        setExportState('idle');
        setActiveJob(null);
      }
    });
    return () => unsub();
  }, []);

  if (!exportModalOpen) return null;

  const isExporting = exportState === 'preparing' || exportState === 'running' || exportState === 'cancelling';

  const handleResetToIdle = () => {
    setActiveJob(null);
    setExportState('idle');
  };

  const handleClose = () => {
    setActiveJob(null);
    setExportState('idle');
    setExportModalOpen(false);
  };

  const handleChooseLocation = async () => {
    if (!window.nigiApi) return;
    const pathChosen = await window.nigiApi.chooseExportLocation(exp.fileName, exp.container);
    if (pathChosen) {
      setOutputPath(pathChosen);
    }
  };

  const handleStartExport = async () => {
    if (!window.nigiApi) return;
    if (!outputPath) {
      alert('Silakan pilih lokasi penyimpanan berkas hasil terlebih dahulu.');
      return;
    }

    if (window.nigiApi.checkFileExists) {
      const exists = await window.nigiApi.checkFileExists(outputPath);
      if (exists) {
        const replace = confirm(
          `Berkas "${outputPath}" sudah ada.\n\nKlik "OK" untuk menimpa berkas ini, atau "Batal" untuk memilih lokasi / nama berkas lain.`
        );
        if (!replace) {
          const newPath = await window.nigiApi.chooseExportLocation(exp.fileName, exp.container);
          if (newPath) {
            setOutputPath(newPath);
          }
          return;
        }
      }
    }

    setExportState('preparing');
    setActiveJob(null);

    try {
      const job = await window.nigiApi.startExport({
        project,
        outputPath,
        overwrite: true,
      });
      if (job.state === 'failed') {
        setActiveJob(job);
        setExportState('failed');
      }
    } catch (err) {
      setExportState('failed');
      alert(`Gagal memulai ekspor: ${String(err)}`);
    }
  };

  const handleCancelExport = async () => {
    if (!window.nigiApi) return;
    setExportState('cancelling');
    if (activeJob) {
      await window.nigiApi.cancelExport(activeJob.id);
    } else {
      setExportState('idle');
    }
  };

  const handleOpenFolder = () => {
    if (window.nigiApi && outputPath) {
      window.nigiApi.openExportFolder(outputPath);
    }
  };

  const handlePlayFile = () => {
    if (window.nigiApi && outputPath) {
      window.nigiApi.playExportFile(outputPath);
    }
  };

  const progressPercent = activeJob?.progress !== null && activeJob?.progress !== undefined
    ? Math.round(activeJob.progress * 100)
    : 0;

  return (
    <div className="modal-overlay" onClick={() => !isExporting && handleClose()}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Download size={18} color="var(--nigi-orange)" />
            <span>{id.exportDialog.title}</span>
          </div>
          {!isExporting && (
            <button className="icon-btn" onClick={handleClose}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Format selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {id.exportDialog.format}:
            </label>
            <select
              disabled={isExporting}
              value={exp.container}
              onChange={(e) => {
                const container = e.target.value as OutputContainer;
                updateProjectSettings((prev) => ({
                  ...prev,
                  export: { ...prev.export, container },
                }));
              }}
            >
              <option value="mp4">{id.exportDialog.formats.mp4}</option>
              <option value="m4a">{id.exportDialog.formats.m4a}</option>
            </select>
          </div>

          {/* Quality preset */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {id.exportDialog.qualityPreset}:
            </label>
            <select
              disabled={isExporting}
              value={exp.quality}
              onChange={(e) => {
                const quality = e.target.value as QualityPreset;
                updateProjectSettings((prev) => ({
                  ...prev,
                  export: { ...prev.export, quality },
                }));
              }}
            >
              <option value="draft">{id.exportDialog.qualities.draft}</option>
              <option value="balanced">{id.exportDialog.qualities.balanced}</option>
              <option value="high">{id.exportDialog.qualities.high}</option>
              <option value="custom">{id.exportDialog.qualities.custom}</option>
            </select>
          </div>

          {/* Audio Normalization */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                disabled={isExporting}
                checked={exp.normalizeAudio}
                onChange={(e) => {
                  const normalizeAudio = e.target.checked;
                  updateProjectSettings((prev) => ({
                    ...prev,
                    export: { ...prev.export, normalizeAudio },
                  }));
                }}
                style={{ accentColor: 'var(--nigi-orange)' }}
              />
              <span>{id.exportDialog.normalizeAudio}</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                disabled={isExporting}
                checked={exp.limitPeaks}
                onChange={(e) => {
                  const limitPeaks = e.target.checked;
                  updateProjectSettings((prev) => ({
                    ...prev,
                    export: { ...prev.export, limitPeaks },
                  }));
                }}
                style={{ accentColor: 'var(--nigi-orange)' }}
              />
              <span>{id.exportDialog.limitPeaks}</span>
            </label>
          </div>

          {/* Destination file chooser */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {id.exportDialog.destination}:
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                readOnly
                value={outputPath}
                placeholder="Pilih lokasi penyimpanan..."
                style={{ flex: 1 }}
              />
              <button
                className="btn-secondary"
                disabled={isExporting}
                onClick={handleChooseLocation}
              >
                {id.exportDialog.chooseLocation}
              </button>
            </div>
          </div>

          {/* Export Summary Box */}
          <div
            style={{
              padding: '10px 12px',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              fontSize: 11,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
            }}
          >
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>{id.exportDialog.targetResolution}:</span>{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {canvasSize.width}x{canvasSize.height} ({ratioLabel(canvasSize.width, canvasSize.height)})
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>{id.exportDialog.targetFps}:</span>{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {(fps.num / fps.den).toFixed(2)} FPS
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>{id.exportDialog.expectedDuration}:</span>{' '}
              <strong style={{ color: 'var(--nigi-orange)' }}>
                {formatDuration(timelineDurMs)}
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Status Loop:</span>{' '}
              <strong style={{ color: loop.enabled ? 'var(--teal-active)' : 'var(--text-muted)' }}>
                {loop.enabled ? 'Aktif' : 'Nonaktif'}
              </strong>
            </div>
          </div>

          {/* Real-time Progress Bar & Status */}
          {activeJob && (
            <div
              style={{
                marginTop: 6,
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {activeJob.stage}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--nigi-orange)' }}>
                  {progressPercent}%
                </span>
              </div>

              {/* Progress bar line */}
              <div
                style={{
                  height: 6,
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: 3,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progressPercent}%`,
                    backgroundColor: activeJob.state === 'failed' ? 'var(--danger)' : 'var(--nigi-orange)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>

              {activeJob.state === 'completed' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 12 }}>
                  <CheckCircle2 size={16} />
                  <span>{id.exportDialog.complete}</span>
                </div>
              )}

              {activeJob.state === 'failed' && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, color: 'var(--danger)', fontSize: 11 }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <div>Ekspor Gagal: {activeJob.errorCode}</div>
                    <div style={{ opacity: 0.8 }}>{activeJob.errorDetail}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {exportState === 'completed' ? (
            <>
              <button className="btn-secondary" onClick={handleOpenFolder}>
                <FolderOpen size={14} />
                <span>{id.exportDialog.openFolder}</span>
              </button>
              <button className="btn-secondary" onClick={handlePlayFile}>
                <Play size={14} />
                <span>{id.exportDialog.playFile}</span>
              </button>
              <button className="btn-secondary" onClick={handleResetToIdle}>
                <Download size={14} />
                <span>Ekspor Lagi</span>
              </button>
              <button className="btn-primary" onClick={handleClose}>
                <span>{id.exportDialog.close}</span>
              </button>
            </>
          ) : exportState === 'failed' ? (
            <>
              <button className="btn-secondary" onClick={handleClose}>
                <span>{id.exportDialog.close}</span>
              </button>
              <button className="btn-primary" onClick={handleResetToIdle}>
                <span>Coba Lagi</span>
              </button>
            </>
          ) : isExporting ? (
            <button
              className="btn-danger"
              disabled={exportState === 'cancelling'}
              onClick={handleCancelExport}
            >
              <Loader2 size={14} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
              <span>{exportState === 'cancelling' ? 'Membatalkan...' : id.exportDialog.cancelExport}</span>
            </button>
          ) : (
            <>
              <button className="btn-secondary" onClick={handleClose}>
                <span>{id.exportDialog.close}</span>
              </button>
              <button className="btn-primary" onClick={handleStartExport} disabled={!outputPath}>
                <Download size={14} />
                <span>{id.exportDialog.startExport}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
