import React, { useState } from 'react';
import {
  Film,
  Music,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatDuration } from '@shared/time';
import type { MediaAsset } from '@shared/types';
import { useEditor } from '../../context/EditorContext';
import { id } from '../../locales/id';

export const MediaBin: React.FC = () => {
  const {
    project,
    activeLeftTab,
    setActiveLeftTab,
    addAsset,
    deleteAsset,
    deleteAllAssets,
    addClipToTimeline,
    selectedAssetId,
    setSelectedAssetId,
  } = useEditor();

  const [searchQuery, setSearchQuery] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleImportFiles = async (files: FileList | string[]) => {
    if (!window.nigiApi) return;
    const paths: string[] = [];

    if (files instanceof FileList) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file && 'path' in file && typeof (file as { path: string }).path === 'string') {
          paths.push((file as { path: string }).path);
        }
      }
    } else {
      paths.push(...files);
    }

    for (const p of paths) {
      const res = await window.nigiApi.inspectMediaFile(p);
      if (res.ok && res.asset) {
        addAsset({
          ...res.asset,
          id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          importedAt: new Date().toISOString(),
        });
      }
    }
  };

  const handleNativeOpen = async () => {
    if (!window.nigiApi) return;
    const paths = await window.nigiApi.openMediaDialog();
    if (paths.length) {
      handleImportFiles(paths);
    }
  };

  const filteredAssets = project.assets.filter((a) => {
    const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeLeftTab === 'audio') return matchesSearch && a.kind === 'audio';
    return matchesSearch;
  });

  return (
    <div className="left-panel">
      {/* Tabs */}
      <div className="panel-tabs">
        <button
          className={`panel-tab ${activeLeftTab === 'media' ? 'active' : ''}`}
          onClick={() => setActiveLeftTab('media')}
        >
          {id.mediaBin.tabs.media}
        </button>
        <button
          className={`panel-tab ${activeLeftTab === 'audio' ? 'active' : ''}`}
          onClick={() => setActiveLeftTab('audio')}
        >
          {id.mediaBin.tabs.audio}
        </button>
        <button
          className={`panel-tab ${activeLeftTab === 'text' ? 'active' : ''}`}
          onClick={() => setActiveLeftTab('text')}
        >
          {id.mediaBin.tabs.text}
        </button>
        <button
          className={`panel-tab ${activeLeftTab === 'transitions' ? 'active' : ''}`}
          onClick={() => setActiveLeftTab('transitions')}
        >
          {id.mediaBin.tabs.transitions}
        </button>
      </div>

      {activeLeftTab === 'text' || activeLeftTab === 'transitions' ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
          <p style={{ marginTop: 20 }}>
            {activeLeftTab === 'transitions'
              ? 'Efek transisi diatur langsung melalui Tab Proyek > Mesin Pengulangan Mulus.'
              : 'Fitur hamparan teks sederhana sedang disiapkan.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* Action & Search Bar */}
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={handleNativeOpen}
              >
                <Plus size={15} />
                <span>{id.mediaBin.importButton}</span>
              </button>
              {project.assets.length > 1 && (
                <button
                  className="btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 8px', fontSize: 11, color: 'var(--danger)', borderColor: 'rgba(240, 100, 100, 0.3)' }}
                  title={id.mediaBin.clearAll}
                  onClick={() => {
                    if (confirm(id.dialogs.confirmClearAll)) {
                      deleteAllAssets();
                    }
                  }}
                >
                  <Trash2 size={13} />
                  <span>{id.mediaBin.clearAll}</span>
                </button>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                placeholder={id.mediaBin.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', paddingLeft: 28 }}
              />
            </div>
          </div>

          {/* Drag & Drop Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOver(false);
              if (e.dataTransfer.files) handleImportFiles(e.dataTransfer.files);
            }}
            style={{
              margin: '0 12px 10px 12px',
              padding: '12px 8px',
              border: `1px dashed ${isDraggingOver ? 'var(--nigi-orange)' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-md)',
              backgroundColor: isDraggingOver ? 'rgba(255, 152, 89, 0.08)' : 'var(--bg-surface)',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onClick={handleNativeOpen}
          >
            <UploadCloud size={20} color={isDraggingOver ? 'var(--nigi-orange)' : 'var(--text-muted)'} style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {id.mediaBin.dragDropHint}
            </div>
          </div>

          {/* Media List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px 12px' }}>
            {filteredAssets.length === 0 ? (
              <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Film size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {id.mediaBin.emptyTitle}
                </div>
                <div style={{ fontSize: 11 }}>{id.mediaBin.emptyDesc}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredAssets.map((asset) => (
                  <MediaItemCard
                    key={asset.id}
                    asset={asset}
                    isSelected={selectedAssetId === asset.id}
                    onSelect={() => setSelectedAssetId(asset.id)}
                    onAddToTimeline={() => addClipToTimeline(asset.id)}
                    onDelete={() => {
                      if (confirm(id.dialogs.confirmDeleteAsset)) {
                        deleteAsset(asset.id);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const MediaItemCard: React.FC<{
  asset: MediaAsset;
  isSelected: boolean;
  onSelect: () => void;
  onAddToTimeline: () => void;
  onDelete: () => void;
}> = ({ asset, isSelected, onSelect, onAddToTimeline, onDelete }) => {
  const m = asset.metadata;
  return (
    <div
      onClick={onSelect}
      onDoubleClick={onAddToTimeline}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 10px',
        backgroundColor: isSelected ? 'var(--bg-surface-active)' : 'var(--bg-surface)',
        border: `1px solid ${isSelected ? 'var(--nigi-orange)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        gap: 10,
        cursor: 'pointer',
        transition: 'background-color 0.15s, border-color 0.15s',
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--bg-panel)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: asset.kind === 'video' ? 'var(--teal-active)' : 'var(--nigi-orange)',
        }}
      >
        {asset.kind === 'video' ? <Film size={18} /> : <Music size={18} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 500,
            fontSize: 12,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={asset.name}
        >
          {asset.name}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
          <span>{formatDuration(m.durationMs)}</span>
          {m.width && m.height && <span>• {m.width}x{m.height}</span>}
          {m.hasAudio ? (
            <span title={id.mediaBin.hasAudio} style={{ display: 'inline-flex' }}>
              <Volume2 size={11} color="var(--success)" />
            </span>
          ) : (
            <span title={id.mediaBin.noAudio} style={{ display: 'inline-flex' }}>
              <VolumeX size={11} color="var(--text-muted)" />
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button
          className="icon-btn"
          title={id.mediaBin.addToTimeline}
          onClick={(e) => {
            e.stopPropagation();
            onAddToTimeline();
          }}
        >
          <Plus size={15} />
        </button>
        <button
          className="icon-btn"
          title={id.mediaBin.deleteFromProject}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={13} color="var(--danger)" />
        </button>
      </div>
    </div>
  );
};
