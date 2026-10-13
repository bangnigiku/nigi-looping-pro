import React, { useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Film,
  Magnet,
  Maximize,
  Minimize,
  Music,
  Pause,
  Play,
  Scissors,
  Trash2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { formatDuration, formatTimecode, resolveProjectFps } from '@shared/time';
import {
  clipDuration,
  clipEnd,
  sequenceDuration,
  snapTargets,
  snapTime,
} from '@shared/timeline';
import type { TimelineClip } from '@shared/types';
import { useEditor } from '../../context/EditorContext';
import { id } from '../../locales/id';

export const Timeline: React.FC = () => {
  const {
    project,
    playback,
    timelineView,
    selectedClipId,
    canUndo,
    canRedo,
    undo,
    redo,
    togglePlay,
    setCurrentTimeMs,
    stepFrameForward,
    stepFrameBackward,
    setSelectedClipId,
    splitClip,
    deleteClip,
    moveClip,
    trimClipStart,
    trimClipEnd,
    setZoom,
    setSnap,
  } = useEditor();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingPlayheadRef = useRef(false);

  const hasAnyMedia = project.assets.length > 0 || project.clips.length > 0;
  const fps = resolveProjectFps(project);
  const zoom = timelineView.zoom; // px per second
  const totalSeqMs = Math.max(30000, sequenceDuration(project) + 10000);
  const totalWidthPx = Math.max(800, (totalSeqMs / 1000) * zoom);

  // Helper to convert ms to pixels and vice versa
  const msToPx = (ms: number) => (ms / 1000) * zoom;
  const pxToMs = (px: number) => (px / zoom) * 1000;

  const updatePlayheadFromClientX = (clientX: number) => {
    if (!rulerRef.current || !hasAnyMedia) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    let targetMs = Math.max(0, pxToMs(clickX));

    if (timelineView.snap) {
      const targets = snapTargets(project, playback.currentTimeMs);
      const snapped = snapTime(targetMs, targets, pxToMs(8));
      targetMs = snapped.time;
    }

    setCurrentTimeMs(targetMs);
  };

  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !hasAnyMedia) return;
    isDraggingPlayheadRef.current = true;
    updatePlayheadFromClientX(e.clientX);

    const onMouseMove = (ev: MouseEvent) => {
      if (isDraggingPlayheadRef.current) {
        updatePlayheadFromClientX(ev.clientX);
      }
    };

    const onMouseUp = () => {
      isDraggingPlayheadRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleSplitAtPlayhead = () => {
    if (!selectedClipId) return;
    splitClip(selectedClipId, playback.currentTimeMs);
  };

  const handleDeleteSelected = () => {
    if (!selectedClipId) return;
    deleteClip(selectedClipId);
  };

  const videoTrackClips = project.clips.filter((c) => c.trackId === 'track-video-1');
  const audioTrackClips = project.clips.filter((c) => c.trackId === 'track-audio-1');

  return (
    <div className="timeline-section">
      {/* Timeline toolbar */}
      <div
        style={{
          height: 'var(--timeline-toolbar-height)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          backgroundColor: 'var(--bg-panel)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="btn-secondary"
            style={{ padding: '4px 8px', fontSize: 12 }}
            disabled={!selectedClipId}
            onClick={handleSplitAtPlayhead}
            title={id.timeline.split}
          >
            <Scissors size={14} />
            <span>{id.timeline.split}</span>
          </button>

          <button
            className="btn-secondary"
            style={{ padding: '4px 8px', fontSize: 12 }}
            disabled={!selectedClipId}
            onClick={handleDeleteSelected}
            title={id.timeline.delete}
          >
            <Trash2 size={14} color="var(--danger)" />
            <span>{id.timeline.delete}</span>
          </button>

          <div style={{ width: 1, height: 18, backgroundColor: 'var(--border-color)', margin: '0 4px' }} />

          <button className="icon-btn" disabled={!canUndo} onClick={undo} title={id.timeline.undo}>
            <Undo2 size={15} />
          </button>
          <button className="icon-btn" disabled={!canRedo} onClick={redo} title={id.timeline.redo}>
            <Redo2 size={15} />
          </button>

          <button
            className={`icon-btn ${timelineView.snap ? 'active' : ''}`}
            onClick={() => setSnap(!timelineView.snap)}
            title={id.timeline.snap}
          >
            <Magnet size={15} />
          </button>
        </div>

        {/* Center Frame-Step & Playback Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="icon-btn"
            disabled={!hasAnyMedia}
            onClick={stepFrameBackward}
            title="Bingkai Sebelumnya (Arrow Left)"
            style={{ opacity: hasAnyMedia ? 1 : 0.4, cursor: hasAnyMedia ? 'pointer' : 'not-allowed' }}
          >
            <ChevronLeft size={16} />
          </button>

          <button
            className="btn-primary"
            disabled={!hasAnyMedia}
            style={{
              width: 26,
              height: 26,
              padding: 0,
              justifyContent: 'center',
              borderRadius: '50%',
              opacity: hasAnyMedia ? 1 : 0.4,
              cursor: hasAnyMedia ? 'pointer' : 'not-allowed',
            }}
            onClick={togglePlay}
            title={playback.isPlaying ? id.preview.pause : id.preview.play}
          >
            {playback.isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>

          <button
            className="icon-btn"
            disabled={!hasAnyMedia}
            onClick={stepFrameForward}
            title="Bingkai Berikutnya (Arrow Right)"
            style={{ opacity: hasAnyMedia ? 1 : 0.4, cursor: hasAnyMedia ? 'pointer' : 'not-allowed' }}
          >
            <ChevronRight size={16} />
          </button>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: hasAnyMedia ? 'var(--teal-active)' : 'var(--text-muted)',
              backgroundColor: '#0D0E11',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              letterSpacing: 0.5,
              marginLeft: 4,
            }}
          >
            {formatTimecode(hasAnyMedia ? playback.currentTimeMs : 0, fps)}
          </div>
        </div>

        {/* Zoom controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="icon-btn" onClick={() => setZoom(zoom - 15)} title={id.timeline.zoomOut}>
            <ZoomOut size={15} />
          </button>
          <input
            type="range"
            min={20}
            max={300}
            value={zoom}
            onChange={(e) => setZoom(parseInt(e.target.value, 10))}
            style={{ width: 80, accentColor: 'var(--nigi-orange)' }}
          />
          <button className="icon-btn" onClick={() => setZoom(zoom + 15)} title={id.timeline.zoomIn}>
            <ZoomIn size={15} />
          </button>

          <button
            className="icon-btn"
            onClick={() => {
              const durSec = sequenceDuration(project) / 1000;
              if (durSec > 0 && containerRef.current) {
                const targetW = containerRef.current.clientWidth - 160;
                setZoom(Math.max(20, Math.min(300, targetW / durSec)));
              }
            }}
            title={id.timeline.fitToContent}
          >
            <Maximize size={14} />
          </button>
        </div>
      </div>

      {/* Main Track Scroll Area */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-main)',
          position: 'relative',
        }}
      >
        <div style={{ width: totalWidthPx, minWidth: '100%', height: '100%', position: 'relative' }}>
          {/* Time Ruler */}
          <div
            ref={rulerRef}
            onMouseDown={handleRulerMouseDown}
            style={{
              height: 24,
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-panel)',
              position: 'relative',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {renderRulerTicks(totalSeqMs, zoom)}
          </div>

          {/* Video Track */}
          <div
            style={{
              height: 64,
              borderBottom: '1px solid var(--border-subtle)',
              position: 'relative',
              backgroundColor: 'rgba(37, 42, 50, 0.4)',
            }}
          >
            {videoTrackClips.map((clip) => (
              <TimelineClipBlock
                key={clip.id}
                clip={clip}
                zoom={zoom}
                isSelected={selectedClipId === clip.id}
                onSelect={() => setSelectedClipId(clip.id)}
                onMove={(newStart) => moveClip(clip.id, newStart)}
                onTrimStart={(newStart) => trimClipStart(clip.id, newStart)}
                onTrimEnd={(newEnd) => trimClipEnd(clip.id, newEnd)}
                color="var(--teal-active)"
                icon={<Film size={12} />}
              />
            ))}
          </div>

          {/* Audio Track */}
          <div
            style={{
              height: 52,
              borderBottom: '1px solid var(--border-subtle)',
              position: 'relative',
              backgroundColor: 'rgba(29, 32, 38, 0.4)',
            }}
          >
            {audioTrackClips.map((clip) => (
              <TimelineClipBlock
                key={clip.id}
                clip={clip}
                zoom={zoom}
                isSelected={selectedClipId === clip.id}
                onSelect={() => setSelectedClipId(clip.id)}
                onMove={(newStart) => moveClip(clip.id, newStart)}
                onTrimStart={(newStart) => trimClipStart(clip.id, newStart)}
                onTrimEnd={(newEnd) => trimClipEnd(clip.id, newEnd)}
                color="var(--nigi-orange)"
                icon={<Music size={12} />}
              />
            ))}
          </div>

          {/* Playhead marker line */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: msToPx(playback.currentTimeMs),
              width: 2,
              backgroundColor: 'var(--nigi-orange)',
              zIndex: 30,
              pointerEvents: 'none',
            }}
          >
            {/* Playhead pointer tip */}
            <div
              onMouseDown={handleRulerMouseDown}
              style={{
                position: 'absolute',
                top: 0,
                left: -6,
                width: 14,
                height: 14,
                backgroundColor: 'var(--nigi-orange)',
                clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                cursor: 'ew-resize',
                pointerEvents: 'auto',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
              }}
              title="Geser Playhead (Drag)"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

function renderRulerTicks(totalMs: number, zoom: number): React.ReactNode {
  const stepSec = zoom > 120 ? 1 : zoom > 50 ? 5 : 10;
  const count = Math.ceil(totalMs / 1000 / stepSec);
  const ticks: React.ReactNode[] = [];

  for (let i = 0; i <= count; i++) {
    const sec = i * stepSec;
    const px = (sec * zoom);
    ticks.push(
      <div
        key={sec}
        style={{
          position: 'absolute',
          left: px,
          top: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          pointerEvents: 'none',
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 3 }}>
          {formatDuration(sec * 1000)}
        </span>
        <div style={{ width: 1, height: 6, backgroundColor: 'var(--border-color)' }} />
      </div>
    );
  }

  return ticks;
}

const TimelineClipBlock: React.FC<{
  clip: TimelineClip;
  zoom: number;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (newStartMs: number) => void;
  onTrimStart: (newStartMs: number) => void;
  onTrimEnd: (newEndMs: number) => void;
  color: string;
  icon: React.ReactNode;
}> = ({ clip, zoom, isSelected, onSelect, onMove, onTrimStart, onTrimEnd, color, icon }) => {
  const { project, timelineView, playback } = useEditor();
  const asset = project.assets.find((a) => a.id === clip.assetId);

  const dur = clipDuration(clip);
  const leftPx = (clip.startMs / 1000) * zoom;
  const widthPx = Math.max(12, (dur / 1000) * zoom);

  // Handle Dragging Clip Position
  const handleDragStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
    const startX = e.clientX;
    const originalStartMs = clip.startMs;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      const deltaMs = (deltaPx / zoom) * 1000;
      let nextStartMs = Math.max(0, originalStartMs + deltaMs);

      if (timelineView.snap) {
        const targets = snapTargets(project, playback.currentTimeMs, clip.id);
        const snapped = snapTime(nextStartMs, targets, (20 / zoom) * 1000);
        if (snapped.snapped) nextStartMs = snapped.time;
      }
      onMove(Math.round(nextStartMs));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Handle Trim Left
  const handleTrimLeftStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const origStart = clip.startMs;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      const nextStart = origStart + (deltaPx / zoom) * 1000;
      onTrimStart(Math.round(nextStart));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Handle Trim Right
  const handleTrimRightStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const origEnd = clipEnd(clip);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      const nextEnd = origEnd + (deltaPx / zoom) * 1000;
      onTrimEnd(Math.round(nextEnd));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onMouseDown={handleDragStart}
      style={{
        position: 'absolute',
        left: leftPx,
        width: widthPx,
        top: 4,
        bottom: 4,
        backgroundColor: 'var(--bg-surface)',
        border: `1.5px solid ${isSelected ? color : 'var(--border-color)'}`,
        borderLeftWidth: isSelected ? 3 : 1.5,
        borderRightWidth: isSelected ? 3 : 1.5,
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        cursor: 'grab',
        userSelect: 'none',
        overflow: 'hidden',
        boxShadow: isSelected ? `0 0 0 1px ${color}` : 'none',
        zIndex: isSelected ? 10 : 1,
      }}
    >
      {/* Trim Left Handle */}
      <div
        onMouseDown={handleTrimLeftStart}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: 'ew-resize',
          backgroundColor: isSelected ? color : 'transparent',
          opacity: 0.8,
        }}
      />

      {/* Clip Content label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, pointerEvents: 'none' }}>
        <span style={{ color }}>{icon}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {asset?.name ?? 'Klip Media'}
        </span>
      </div>

      {/* Trim Right Handle */}
      <div
        onMouseDown={handleTrimRightStart}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: 'ew-resize',
          backgroundColor: isSelected ? color : 'transparent',
          opacity: 0.8,
        }}
      />
    </div>
  );
};
