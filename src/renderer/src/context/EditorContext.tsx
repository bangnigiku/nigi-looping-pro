import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createEmptyProject } from '@shared/project';
import { resolveProjectFps, stepByFrames } from '@shared/time';
import {
  addClip as addClipOp,
  deleteClip as deleteClipOp,
  moveClip as moveClipOp,
  removeAsset as removeAssetOp,
  sequenceDuration,
  splitClip as splitClipOp,
  trimClipEnd as trimClipEndOp,
  trimClipStart as trimClipStartOp,
  updateClip as updateClipOp,
} from '@shared/timeline';
import type {
  MediaAsset,
  ProjectDocument,
  TimelineClip,
} from '@shared/types';

interface PlaybackState {
  isPlaying: boolean;
  currentTimeMs: number;
  volume: number;
  muted: boolean;
  loopPreviewMode: boolean;
  loopPreviewUrl: string | null;
  loopPreviewDurationMs: number;
  loopPreviewSeamMs: number;
}

interface TimelineViewState {
  zoom: number; // pixels per second
  snap: boolean;
}

interface EditorContextValue {
  project: ProjectDocument;
  isDirty: boolean;
  projectFilePath: string | null;
  playback: PlaybackState;
  timelineView: TimelineViewState;
  selectedClipId: string | null;
  selectedAssetId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  activeLeftTab: 'media' | 'audio' | 'text' | 'transitions' | 'effects';
  activeInspectorTab: 'project' | 'detail';
  exportModalOpen: boolean;
  welcomeModalOpen: boolean;
  previewEpoch: number;

  // Actions
  setProjectTitle: (title: string) => void;
  updateProjectSettings: (updater: (prev: ProjectDocument['settings']) => ProjectDocument['settings']) => void;
  addAsset: (asset: MediaAsset) => void;
  updateAsset: (assetId: string, patch: Partial<MediaAsset>) => void;
  deleteAsset: (assetId: string) => void;
  deleteAllAssets: () => void;
  addClipToTimeline: (assetId: string, trackId?: string, startMs?: number) => void;
  moveClip: (clipId: string, newStartMs: number, targetTrackId?: string) => void;
  trimClipStart: (clipId: string, newStartMs: number) => void;
  trimClipEnd: (clipId: string, newEndMs: number) => void;
  splitClip: (clipId: string, atMs: number) => void;
  deleteClip: (clipId: string) => void;
  updateClipProps: (clipId: string, patch: Partial<Pick<TimelineClip, 'volume' | 'muted' | 'fitMode'>>) => void;
  setSelectedClipId: (id: string | null) => void;
  setSelectedAssetId: (id: string | null) => void;
  setActiveLeftTab: (tab: 'media' | 'audio' | 'text' | 'transitions' | 'effects') => void;
  setActiveInspectorTab: (tab: 'project' | 'detail') => void;
  setExportModalOpen: (open: boolean) => void;
  setWelcomeModalOpen: (open: boolean) => void;

  // Playback actions
  setIsPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setCurrentTimeMs: (ms: number) => void;
  stepFrameForward: () => void;
  stepFrameBackward: () => void;
  setVolume: (vol: number) => void;
  setMuted: (muted: boolean) => void;
  setLoopPreview: (url: string | null, durationMs?: number, seamMs?: number) => void;
  resetPreview: (options?: { resetPlayhead?: boolean }) => void;

  // Timeline view actions
  setZoom: (zoom: number) => void;
  setSnap: (snap: boolean) => void;

  // Project persistence & history
  newProject: () => void;
  loadProject: (doc: ProjectDocument, filePath?: string) => void;
  markSaved: (filePath?: string) => void;
  undo: () => void;
  redo: () => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

const MAX_HISTORY = 40;

export const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [project, setProject] = useState<ProjectDocument>(() => createEmptyProject());
  const [projectFilePath, setProjectFilePath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const [historyPast, setHistoryPast] = useState<ProjectDocument[]>([]);
  const [historyFuture, setHistoryFuture] = useState<ProjectDocument[]>([]);

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [activeLeftTab, setActiveLeftTab] = useState<'media' | 'audio' | 'text' | 'transitions' | 'effects'>('media');
  const [activeInspectorTab, setActiveInspectorTab] = useState<'project' | 'detail'>('project');
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [welcomeModalOpen, setWelcomeModalOpen] = useState<boolean>(false);
  const [previewEpoch, setPreviewEpoch] = useState<number>(0);

  // Auto-display Welcome dialog on startup according to persistent setting
  useEffect(() => {
    if (window.nigiApi?.getSettings) {
      window.nigiApi
        .getSettings()
        .then((settings) => {
          if (settings && settings.showWelcomeOnStartup === false) {
            setWelcomeModalOpen(false);
          } else {
            setWelcomeModalOpen(true);
          }
        })
        .catch(() => {
          setWelcomeModalOpen(true);
        });
    }
  }, []);

  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    currentTimeMs: 0,
    volume: 1.0,
    muted: false,
    loopPreviewMode: false,
    loopPreviewUrl: null,
    loopPreviewDurationMs: 0,
    loopPreviewSeamMs: 0,
  });

  const [timelineView, setTimelineView] = useState<TimelineViewState>({
    zoom: 80, // 80px per second default
    snap: true,
  });

  // Keep a ref to current project for synchronous callbacks
  const projectRef = useRef(project);
  projectRef.current = project;

  const pushHistory = useCallback((nextDoc: ProjectDocument) => {
    setHistoryPast((past) => [...past.slice(-MAX_HISTORY), projectRef.current]);
    setHistoryFuture([]);
    projectRef.current = nextDoc;
    setProject(nextDoc);
    setIsDirty(true);
  }, []);

  const undo = useCallback(() => {
    setHistoryPast((past) => {
      if (!past.length) return past;
      const previous = past[past.length - 1]!;
      const remaining = past.slice(0, -1);
      setHistoryFuture((future) => [projectRef.current, ...future]);
      projectRef.current = previous;
      setProject(previous);
      setIsDirty(true);
      return remaining;
    });
  }, []);

  const redo = useCallback(() => {
    setHistoryFuture((future) => {
      if (!future.length) return future;
      const next = future[0]!;
      const remaining = future.slice(1);
      setHistoryPast((past) => [...past, projectRef.current]);
      projectRef.current = next;
      setProject(next);
      setIsDirty(true);
      return remaining;
    });
  }, []);

  const setProjectTitle = useCallback((title: string) => {
    setProject((prev) => {
      const next = { ...prev, title, updatedAt: new Date().toISOString() };
      projectRef.current = next;
      return next;
    });
    setIsDirty(true);
  }, []);

  const updateProjectSettings = useCallback(
    (updater: (prev: ProjectDocument['settings']) => ProjectDocument['settings']) => {
      pushHistory({
        ...projectRef.current,
        settings: updater(projectRef.current.settings),
        updatedAt: new Date().toISOString(),
      });
    },
    [pushHistory]
  );

  const addAsset = useCallback((asset: MediaAsset) => {
    const prev = projectRef.current;
    if (prev.assets.some((a) => a.id === asset.id || a.path === asset.path)) {
      return;
    }
    const next = {
      ...prev,
      assets: [...prev.assets, asset],
      updatedAt: new Date().toISOString(),
    };
    projectRef.current = next;
    setProject(next);
    setIsDirty(true);
    setSelectedAssetId(asset.id);
  }, []);

  const updateAsset = useCallback((assetId: string, patch: Partial<MediaAsset>) => {
    const prev = projectRef.current;
    const next = {
      ...prev,
      assets: prev.assets.map((a) => (a.id === assetId ? { ...a, ...patch } : a)),
      updatedAt: new Date().toISOString(),
    };
    projectRef.current = next;
    setProject(next);
    setIsDirty(true);
  }, []);

  const deleteAsset = useCallback(
    (assetId: string) => {
      const current = projectRef.current;
      const next = removeAssetOp(current, assetId);
      pushHistory(next);
      setPreviewEpoch((e) => e + 1);

      // 1. Sync asset selection
      if (selectedAssetId === assetId) {
        setSelectedAssetId(next.assets[0]?.id ?? null);
      } else if (next.assets.length === 0) {
        setSelectedAssetId(null);
      }

      // 2. Sync timeline clip selection
      if (selectedClipId) {
        const stillExists = next.clips.some((c) => c.id === selectedClipId);
        if (!stillExists) {
          setSelectedClipId(null);
          if (activeInspectorTab === 'detail') {
            setActiveInspectorTab('project');
          }
        }
      }

      // 3. Sync loop preview & playback
      if (next.assets.length === 0) {
        setPlayback((p) => ({
          ...p,
          isPlaying: false,
          currentTimeMs: 0,
          loopPreviewMode: false,
          loopPreviewUrl: null,
          loopPreviewDurationMs: 0,
          loopPreviewSeamMs: 0,
        }));
      } else {
        const newTotalMs = sequenceDuration(next);
        setPlayback((p) => ({
          ...p,
          loopPreviewMode: false,
          loopPreviewUrl: null,
          loopPreviewDurationMs: 0,
          loopPreviewSeamMs: 0,
          isPlaying: next.clips.length === 0 ? false : p.isPlaying,
          currentTimeMs: next.clips.length === 0 ? 0 : Math.min(p.currentTimeMs, newTotalMs),
        }));
      }
    },
    [pushHistory, selectedAssetId, selectedClipId, activeInspectorTab]
  );

  const deleteAllAssets = useCallback(() => {
    const current = projectRef.current;
    if (current.assets.length === 0 && current.clips.length === 0) return;
    const next: ProjectDocument = {
      ...current,
      assets: [],
      clips: [],
      settings: {
        ...current.settings,
        loop: {
          ...current.settings.loop,
          clipId: null,
        },
      },
      updatedAt: new Date().toISOString(),
    };
    pushHistory(next);
    setPreviewEpoch((e) => e + 1);
    setSelectedAssetId(null);
    setSelectedClipId(null);
    if (activeInspectorTab === 'detail') {
      setActiveInspectorTab('project');
    }
    setPlayback((p) => ({
      ...p,
      isPlaying: false,
      currentTimeMs: 0,
      loopPreviewMode: false,
      loopPreviewUrl: null,
      loopPreviewDurationMs: 0,
      loopPreviewSeamMs: 0,
    }));
  }, [pushHistory, activeInspectorTab]);

  const addClipToTimeline = useCallback(
    (assetId: string, trackId?: string, startMs?: number) => {
      const current = projectRef.current;
      const asset = current.assets.find((a) => a.id === assetId);
      if (!asset) return;

      const targetTrack = trackId ?? (asset.kind === 'video' ? 'track-video-1' : 'track-audio-1');
      try {
        const { doc, clip } = addClipOp(current, assetId, targetTrack, startMs);
        pushHistory(doc);
        setSelectedClipId(clip.id);
        setActiveInspectorTab('detail');
      } catch (err) {
        console.warn('Gagal menambahkan klip:', err);
      }
    },
    [pushHistory]
  );

  const moveClip = useCallback(
    (clipId: string, newStartMs: number, targetTrackId?: string) => {
      try {
        const doc = moveClipOp(projectRef.current, clipId, newStartMs, targetTrackId);
        pushHistory(doc);
      } catch (err) {
        console.warn('Gagal memindahkan klip:', err);
      }
    },
    [pushHistory]
  );

  const trimClipStart = useCallback(
    (clipId: string, newStartMs: number) => {
      try {
        const doc = trimClipStartOp(projectRef.current, clipId, newStartMs);
        pushHistory(doc);
      } catch (err) {
        console.warn('Gagal memotong awal klip:', err);
      }
    },
    [pushHistory]
  );

  const trimClipEnd = useCallback(
    (clipId: string, newEndMs: number) => {
      try {
        const doc = trimClipEndOp(projectRef.current, clipId, newEndMs);
        pushHistory(doc);
      } catch (err) {
        console.warn('Gagal memotong akhir klip:', err);
      }
    },
    [pushHistory]
  );

  const splitClip = useCallback(
    (clipId: string, atMs: number) => {
      const res = splitClipOp(projectRef.current, clipId, atMs);
      if (res) {
        pushHistory(res.doc);
        setSelectedClipId(res.right.id);
      }
    },
    [pushHistory]
  );

  const deleteClip = useCallback(
    (clipId: string) => {
      const doc = deleteClipOp(projectRef.current, clipId);
      pushHistory(doc);
      if (selectedClipId === clipId) {
        setSelectedClipId(null);
        if (activeInspectorTab === 'detail') {
          setActiveInspectorTab('project');
        }
      }

      const newDuration = sequenceDuration(doc);
      setPlayback((p) => ({
        ...p,
        loopPreviewMode: doc.clips.length === 0 ? false : p.loopPreviewMode,
        loopPreviewUrl: doc.clips.length === 0 ? null : p.loopPreviewUrl,
        loopPreviewDurationMs: doc.clips.length === 0 ? 0 : p.loopPreviewDurationMs,
        loopPreviewSeamMs: doc.clips.length === 0 ? 0 : p.loopPreviewSeamMs,
        isPlaying: doc.clips.length === 0 ? false : p.isPlaying,
        currentTimeMs: doc.clips.length === 0 ? 0 : Math.min(p.currentTimeMs, newDuration),
      }));
    },
    [pushHistory, selectedClipId, activeInspectorTab]
  );

  const updateClipProps = useCallback(
    (clipId: string, patch: Partial<Pick<TimelineClip, 'volume' | 'muted' | 'fitMode'>>) => {
      const doc = updateClipOp(projectRef.current, clipId, patch);
      pushHistory(doc);
    },
    [pushHistory]
  );

  const resetPreview = useCallback((options?: { resetPlayhead?: boolean }) => {
    setPreviewEpoch((e) => e + 1);
    setPlayback((p) => ({
      ...p,
      isPlaying: false,
      currentTimeMs: options?.resetPlayhead ? 0 : p.currentTimeMs,
      loopPreviewMode: false,
      loopPreviewUrl: null,
      loopPreviewDurationMs: 0,
      loopPreviewSeamMs: 0,
    }));
  }, []);

  const setIsPlaying = useCallback((playing: boolean) => {
    const hasAnyMedia = projectRef.current.assets.length > 0 || projectRef.current.clips.length > 0;
    if (!hasAnyMedia && playing) return;
    setPlayback((p) => ({ ...p, isPlaying: playing }));
  }, []);

  const togglePlay = useCallback(() => {
    const hasAnyMedia = projectRef.current.assets.length > 0 || projectRef.current.clips.length > 0;
    if (!hasAnyMedia) return;
    setPlayback((p) => ({ ...p, isPlaying: !p.isPlaying }));
  }, []);

  const setCurrentTimeMs = useCallback((ms: number) => {
    setPlayback((p) => ({ ...p, currentTimeMs: Math.max(0, ms) }));
  }, []);

  const stepFrameForward = useCallback(() => {
    const hasAnyMedia = projectRef.current.assets.length > 0 || projectRef.current.clips.length > 0;
    if (!hasAnyMedia) return;
    const fps = resolveProjectFps(projectRef.current);
    const totalMs = sequenceDuration(projectRef.current);
    setPlayback((p) => {
      const next = stepByFrames(p.currentTimeMs, fps, 1, Math.max(1000, totalMs));
      return { ...p, currentTimeMs: next, isPlaying: false };
    });
  }, []);

  const stepFrameBackward = useCallback(() => {
    const hasAnyMedia = projectRef.current.assets.length > 0 || projectRef.current.clips.length > 0;
    if (!hasAnyMedia) return;
    const fps = resolveProjectFps(projectRef.current);
    setPlayback((p) => {
      const next = stepByFrames(p.currentTimeMs, fps, -1);
      return { ...p, currentTimeMs: next, isPlaying: false };
    });
  }, []);

  // Master Timeline Clock loop for smooth multi-clip sequencing
  useEffect(() => {
    if (!playback.isPlaying) return;

    let animId: number;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const deltaMs = now - lastTime;
      lastTime = now;

      setPlayback((prev) => {
        if (!prev.isPlaying) return prev;
        const totalMs = prev.loopPreviewMode
          ? prev.loopPreviewDurationMs
          : sequenceDuration(projectRef.current);

        if (totalMs <= 0) {
          return { ...prev, isPlaying: false, currentTimeMs: 0 };
        }

        const nextMs = prev.currentTimeMs + deltaMs;
        if (nextMs >= totalMs) {
          if (prev.loopPreviewMode) {
            return { ...prev, currentTimeMs: 0 };
          } else {
            return { ...prev, isPlaying: false, currentTimeMs: totalMs };
          }
        }
        return { ...prev, currentTimeMs: nextMs };
      });

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [playback.isPlaying]);

  const setVolume = useCallback((volume: number) => {
    setPlayback((p) => ({ ...p, volume: Math.min(1, Math.max(0, volume)) }));
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    setPlayback((p) => ({ ...p, muted }));
  }, []);

  const setLoopPreview = useCallback((url: string | null, durationMs = 0, seamMs = 0) => {
    const hasAnyMedia = projectRef.current.assets.length > 0 || projectRef.current.clips.length > 0;
    if (!hasAnyMedia && url) return;
    setPlayback((p) => ({
      ...p,
      loopPreviewMode: Boolean(url),
      loopPreviewUrl: url,
      loopPreviewDurationMs: durationMs,
      loopPreviewSeamMs: seamMs,
      currentTimeMs: 0,
      isPlaying: Boolean(url),
    }));
  }, []);

  const setZoom = useCallback((zoom: number) => {
    setTimelineView((v) => ({ ...v, zoom: Math.min(400, Math.max(10, zoom)) }));
  }, []);

  const setSnap = useCallback((snap: boolean) => {
    setTimelineView((v) => ({ ...v, snap }));
  }, []);

  const newProject = useCallback(() => {
    const doc = createEmptyProject();
    setProject(doc);
    setProjectFilePath(null);
    setIsDirty(false);
    setHistoryPast([]);
    setHistoryFuture([]);
    setSelectedClipId(null);
    setSelectedAssetId(null);
    resetPreview({ resetPlayhead: true });
  }, [resetPreview]);

  const loadProject = useCallback((doc: ProjectDocument, filePath?: string) => {
    setProject(doc);
    if (filePath) setProjectFilePath(filePath);
    setIsDirty(false);
    setHistoryPast([]);
    setHistoryFuture([]);
    setSelectedClipId(null);
    setSelectedAssetId(doc.assets[0]?.id ?? null);
    resetPreview({ resetPlayhead: true });
  }, [resetPreview]);

  const markSaved = useCallback((filePath?: string) => {
    setIsDirty(false);
    if (filePath) setProjectFilePath(filePath);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // Don't trigger shortcuts if modal dialog is open
      if (exportModalOpen || welcomeModalOpen) {
        return;
      }

      const hasAnyMedia = projectRef.current.assets.length > 0 || projectRef.current.clips.length > 0;

      if (e.code === 'Space') {
        e.preventDefault();
        if (hasAnyMedia) {
          togglePlay();
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (hasAnyMedia) {
          stepFrameBackward();
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (hasAnyMedia) {
          stepFrameForward();
        }
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault();
          deleteClip(selectedClipId);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, stepFrameBackward, stepFrameForward, selectedClipId, deleteClip, undo, redo, exportModalOpen, welcomeModalOpen]);

  const value: EditorContextValue = {
    project,
    isDirty,
    projectFilePath,
    playback,
    timelineView,
    selectedClipId,
    selectedAssetId,
    canUndo: historyPast.length > 0,
    canRedo: historyFuture.length > 0,
    activeLeftTab,
    activeInspectorTab,
    exportModalOpen,
    welcomeModalOpen,
    previewEpoch,
    setProjectTitle,
    updateProjectSettings,
    addAsset,
    updateAsset,
    deleteAsset,
    deleteAllAssets,
    addClipToTimeline,
    moveClip,
    trimClipStart,
    trimClipEnd,
    splitClip,
    deleteClip,
    updateClipProps,
    setSelectedClipId,
    setSelectedAssetId,
    setActiveLeftTab,
    setActiveInspectorTab,
    setExportModalOpen,
    setWelcomeModalOpen,
    setIsPlaying,
    togglePlay,
    setCurrentTimeMs,
    stepFrameForward,
    stepFrameBackward,
    setVolume,
    setMuted,
    setLoopPreview,
    resetPreview,
    setZoom,
    setSnap,
    newProject,
    loadProject,
    markSaved,
    undo,
    redo,
  };

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
};

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}
