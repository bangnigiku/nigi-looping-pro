import type {
  ExportSettings,
  LoopSettings,
  MediaAsset,
  ProjectDocument,
  ProjectSettings,
  TimelineClip,
  TimelineTrack,
} from './types';

export const PROJECT_SCHEMA_VERSION = 1;
export const PROJECT_FILE_EXTENSION = 'nigiloop';

export const VIDEO_TRACK_ID = 'track-video-1';
export const AUDIO_TRACK_ID = 'track-audio-1';

export function newId(prefix = 'id'): string {
  const c = globalThis.crypto;
  const uuid = c && 'randomUUID' in c ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

export function defaultLoopSettings(): LoopSettings {
  return {
    enabled: false,
    source: 'sequence',
    clipId: null,
    targetDurationMs: 60_000,
    videoCrossfadeMs: 1000,
    videoTransition: 'fade',
    audioCrossfadeEnabled: true,
    audioCrossfadeMs: 1000,
    audioCurve: 'tri',
    endFadeMs: 0,
    previewEnabled: true,
  };
}

export function defaultExportSettings(): ExportSettings {
  return {
    container: 'mp4',
    quality: 'balanced',
    crf: 20,
    x264Preset: 'medium',
    videoCodec: 'h264',
    audioCodec: 'aac',
    audioBitrateKbps: 192,
    normalizeAudio: false,
    limitPeaks: true,
    outputFolder: '',
    fileName: 'nigi-loop',
  };
}

export function defaultProjectSettings(): ProjectSettings {
  return {
    aspect: { preset: 'source', width: 1920, height: 1080, backgroundMode: 'color', backgroundColor: '#000000' },
    frameRate: 'source',
    defaultFitMode: 'fit',
    loop: defaultLoopSettings(),
    export: defaultExportSettings(),
  };
}

export function defaultTracks(): TimelineTrack[] {
  return [
    { id: VIDEO_TRACK_ID, kind: 'video', name: 'Video 1', muted: false, hidden: false },
    { id: AUDIO_TRACK_ID, kind: 'audio', name: 'Audio 1', muted: false, hidden: false },
  ];
}

export function createEmptyProject(title = 'Proyek Tanpa Judul'): ProjectDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: newId('project'),
    title,
    createdAt: now,
    updatedAt: now,
    assets: [],
    tracks: defaultTracks(),
    clips: [],
    settings: defaultProjectSettings(),
  };
}

/* ------------------------------------------------------------------ */
/* Validation & migration                                              */
/* ------------------------------------------------------------------ */

export class ProjectFormatError extends Error {
  constructor(
    public readonly code: 'invalid-json' | 'invalid-structure' | 'unsupported-version',
    message: string,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * Migrations keyed by the version they upgrade FROM.
 * Add an entry here whenever PROJECT_SCHEMA_VERSION increases.
 */
const MIGRATIONS: Record<number, (doc: Json) => Json> = {
  // Example for the future: 1: (doc) => ({ ...doc, schemaVersion: 2, newField: ... })
};

export function migrateProject(raw: Json): Json {
  let doc = raw;
  let version = num(doc.schemaVersion, 0);
  if (version > PROJECT_SCHEMA_VERSION) {
    throw new ProjectFormatError('unsupported-version', `Project schema ${version} is newer than supported ${PROJECT_SCHEMA_VERSION}`);
  }
  if (version < 1) throw new ProjectFormatError('invalid-structure', 'Missing schemaVersion');
  while (version < PROJECT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new ProjectFormatError('unsupported-version', `No migration from schema ${version}`);
    doc = step(doc);
    version = num(doc.schemaVersion, version + 1);
  }
  return doc;
}

/** Parses, migrates and sanitises a project document. Throws ProjectFormatError. */
export function parseProject(text: string): ProjectDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFormatError('invalid-json', 'File is not valid JSON');
  }
  if (!isObj(raw)) throw new ProjectFormatError('invalid-structure', 'Root must be an object');
  return sanitizeProject(migrateProject(raw));
}

export function sanitizeProject(doc: Json): ProjectDocument {
  const defaults = createEmptyProject();
  if (!Array.isArray(doc.assets) || !Array.isArray(doc.clips)) {
    throw new ProjectFormatError('invalid-structure', 'assets and clips must be arrays');
  }

  const assets: MediaAsset[] = [];
  for (const a of doc.assets) {
    if (!isObj(a) || typeof a.id !== 'string' || typeof a.path !== 'string' || !isObj(a.metadata)) continue;
    const m = a.metadata;
    const fr = isObj(m.frameRate) ? { num: num(m.frameRate.num, 30, 1), den: num(m.frameRate.den, 1, 1) } : undefined;
    assets.push({
      id: a.id,
      path: a.path,
      name: str(a.name, a.path.split(/[\\/]/).pop() ?? a.path),
      kind: oneOf(a.kind, ['video', 'audio'] as const, 'video'),
      importedAt: str(a.importedAt, defaults.createdAt),
      proxyPath: typeof a.proxyPath === 'string' ? a.proxyPath : undefined,
      metadata: {
        durationMs: num(m.durationMs, 0, 0),
        formatName: str(m.formatName, ''),
        sizeBytes: num(m.sizeBytes, 0, 0),
        hasVideo: bool(m.hasVideo, false),
        hasAudio: bool(m.hasAudio, false),
        width: typeof m.width === 'number' ? m.width : undefined,
        height: typeof m.height === 'number' ? m.height : undefined,
        displayWidth: typeof m.displayWidth === 'number' ? m.displayWidth : undefined,
        displayHeight: typeof m.displayHeight === 'number' ? m.displayHeight : undefined,
        rotation: typeof m.rotation === 'number' ? m.rotation : undefined,
        frameRate: fr,
        videoCodec: typeof m.videoCodec === 'string' ? m.videoCodec : undefined,
        pixelFormat: typeof m.pixelFormat === 'string' ? m.pixelFormat : undefined,
        audioCodec: typeof m.audioCodec === 'string' ? m.audioCodec : undefined,
        sampleRate: typeof m.sampleRate === 'number' ? m.sampleRate : undefined,
        channels: typeof m.channels === 'number' ? m.channels : undefined,
        previewLikelyUnsupported: bool(m.previewLikelyUnsupported, false),
      },
    });
  }
  const assetIds = new Set(assets.map((a) => a.id));

  const tracks: TimelineTrack[] = [];
  if (Array.isArray(doc.tracks)) {
    for (const t of doc.tracks) {
      if (!isObj(t) || typeof t.id !== 'string') continue;
      tracks.push({
        id: t.id,
        kind: oneOf(t.kind, ['video', 'audio'] as const, 'video'),
        name: str(t.name, t.id),
        muted: bool(t.muted, false),
        hidden: bool(t.hidden, false),
      });
    }
  }
  if (!tracks.some((t) => t.kind === 'video')) tracks.unshift(defaultTracks()[0]!);
  if (!tracks.some((t) => t.kind === 'audio')) tracks.push(defaultTracks()[1]!);
  const trackIds = new Set(tracks.map((t) => t.id));

  const clips: TimelineClip[] = [];
  for (const c of doc.clips) {
    if (!isObj(c) || typeof c.id !== 'string' || typeof c.assetId !== 'string' || typeof c.trackId !== 'string') continue;
    if (!assetIds.has(c.assetId) || !trackIds.has(c.trackId)) continue;
    const inMs = Math.round(num(c.inMs, 0, 0));
    const outMs = Math.round(num(c.outMs, 0, 0));
    if (outMs <= inMs) continue;
    clips.push({
      id: c.id,
      assetId: c.assetId,
      trackId: c.trackId,
      startMs: Math.round(num(c.startMs, 0, 0)),
      inMs,
      outMs,
      volume: num(c.volume, 1, 0, 1),
      muted: bool(c.muted, false),
      fitMode: oneOf(c.fitMode, ['fit', 'fill', 'stretch'] as const, 'fit'),
    });
  }

  const s = isObj(doc.settings) ? doc.settings : {};
  const d = defaults.settings;
  const asp = isObj(s.aspect) ? s.aspect : {};
  const loop = isObj(s.loop) ? s.loop : {};
  const exp = isObj(s.export) ? s.export : {};

  const settings: ProjectSettings = {
    aspect: {
      preset: oneOf(asp.preset, ['source', '16:9', '9:16', '1:1', '4:5', '4:3', '3:2', 'custom'] as const, d.aspect.preset),
      width: Math.round(num(asp.width, d.aspect.width, 2, 8192)),
      height: Math.round(num(asp.height, d.aspect.height, 2, 8192)),
      backgroundMode: oneOf(asp.backgroundMode, ['color', 'blur'] as const, d.aspect.backgroundMode),
      backgroundColor: typeof asp.backgroundColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(asp.backgroundColor) ? asp.backgroundColor : d.aspect.backgroundColor,
    },
    frameRate: oneOf(s.frameRate, ['source', '23.976', '24', '25', '29.97', '30', '50', '60'] as const, d.frameRate),
    defaultFitMode: oneOf(s.defaultFitMode, ['fit', 'fill', 'stretch'] as const, d.defaultFitMode),
    loop: {
      enabled: bool(loop.enabled, d.loop.enabled),
      source: oneOf(loop.source, ['sequence', 'clip'] as const, d.loop.source),
      clipId: typeof loop.clipId === 'string' && clips.some((c) => c.id === loop.clipId) ? loop.clipId : null,
      targetDurationMs: Math.round(num(loop.targetDurationMs, d.loop.targetDurationMs, 1000, 12 * 3600_000)),
      videoCrossfadeMs: Math.round(num(loop.videoCrossfadeMs, d.loop.videoCrossfadeMs, 0, 10_000)),
      videoTransition: oneOf(
        loop.videoTransition,
        ['fade', 'dissolve', 'fadeblack', 'fadewhite', 'wipeleft', 'slideleft', 'smoothleft', 'circleopen', 'radial'] as const,
        d.loop.videoTransition,
      ),
      audioCrossfadeEnabled: bool(loop.audioCrossfadeEnabled, d.loop.audioCrossfadeEnabled),
      audioCrossfadeMs: Math.round(num(loop.audioCrossfadeMs, d.loop.audioCrossfadeMs, 0, 10_000)),
      audioCurve: oneOf(loop.audioCurve, ['tri', 'qsin'] as const, d.loop.audioCurve),
      endFadeMs: Math.round(num(loop.endFadeMs, d.loop.endFadeMs, 0, 30_000)),
      previewEnabled: bool(loop.previewEnabled, d.loop.previewEnabled),
    },
    export: {
      container: oneOf(exp.container, ['mp4', 'm4a'] as const, d.export.container),
      quality: oneOf(exp.quality, ['draft', 'balanced', 'high', 'custom'] as const, d.export.quality),
      crf: Math.round(num(exp.crf, d.export.crf, 0, 51)),
      x264Preset: oneOf(exp.x264Preset, ['ultrafast', 'veryfast', 'faster', 'fast', 'medium', 'slow'] as const, d.export.x264Preset),
      videoCodec: 'h264',
      audioCodec: 'aac',
      audioBitrateKbps: Math.round(num(exp.audioBitrateKbps, d.export.audioBitrateKbps, 64, 320)),
      normalizeAudio: bool(exp.normalizeAudio, d.export.normalizeAudio),
      limitPeaks: bool(exp.limitPeaks, d.export.limitPeaks),
      outputFolder: str(exp.outputFolder, ''),
      fileName: str(exp.fileName, d.export.fileName),
    },
  };

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: str(doc.id, defaults.id),
    title: str(doc.title, defaults.title).slice(0, 200),
    createdAt: str(doc.createdAt, defaults.createdAt),
    updatedAt: str(doc.updatedAt, defaults.updatedAt),
    assets,
    tracks,
    clips,
    settings,
  };
}

export function serializeProject(doc: ProjectDocument): string {
  return JSON.stringify({ ...doc, schemaVersion: PROJECT_SCHEMA_VERSION }, null, 2);
}
