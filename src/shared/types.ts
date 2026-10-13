/**
 * Shared domain types used by main, preload and renderer.
 * All timeline times are integer milliseconds to avoid floating-point drift.
 */

export interface Rational {
  num: number;
  den: number;
}

export interface MediaMetadata {
  durationMs: number;
  formatName: string;
  sizeBytes: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width?: number;
  height?: number;
  /** Display aspect corrected width/height (accounts for SAR and rotation). */
  displayWidth?: number;
  displayHeight?: number;
  rotation?: number;
  frameRate?: Rational;
  videoCodec?: string;
  pixelFormat?: string;
  audioCodec?: string;
  sampleRate?: number;
  channels?: number;
  /** Heuristic: true when Chromium is not expected to decode this natively. */
  previewLikelyUnsupported: boolean;
}

export type MediaKind = 'video' | 'audio';

export interface MediaAsset {
  id: string;
  path: string;
  name: string;
  kind: MediaKind;
  metadata: MediaMetadata;
  /** Optional H.264/AAC proxy used only for preview. Exports always use `path`. */
  proxyPath?: string;
  importedAt: string;
}

export type TrackKind = 'video' | 'audio';

export interface TimelineTrack {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
}

export type FitMode = 'fit' | 'fill' | 'stretch';

export interface TimelineClip {
  id: string;
  assetId: string;
  trackId: string;
  /** Position on the timeline. */
  startMs: number;
  /** Source in point. */
  inMs: number;
  /** Source out point (exclusive). */
  outMs: number;
  /** Linear gain 0..1. */
  volume: number;
  muted: boolean;
  fitMode: FitMode;
}

export type AspectPreset = 'source' | '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | '3:2' | 'custom';

export type BackgroundMode = 'color' | 'blur';

export interface AspectRatioSettings {
  preset: AspectPreset;
  width: number;
  height: number;
  backgroundMode: BackgroundMode;
  backgroundColor: string;
}

export type FrameRateChoice = 'source' | '23.976' | '24' | '25' | '29.97' | '30' | '50' | '60';

export type LoopSource = 'sequence' | 'clip';

export type VideoTransition =
  | 'fade'
  | 'dissolve'
  | 'fadeblack'
  | 'fadewhite'
  | 'wipeleft'
  | 'slideleft'
  | 'smoothleft'
  | 'circleopen'
  | 'radial';

export type AudioCurve = 'tri' | 'qsin';

export interface LoopSettings {
  enabled: boolean;
  source: LoopSource;
  /** Clip used when source === 'clip'. */
  clipId: string | null;
  targetDurationMs: number;
  videoCrossfadeMs: number;
  videoTransition: VideoTransition;
  audioCrossfadeEnabled: boolean;
  audioCrossfadeMs: number;
  audioCurve: AudioCurve;
  /** Fade the final seconds of the output to avoid an abrupt ending. */
  endFadeMs: number;
  previewEnabled: boolean;
}

export type QualityPreset = 'draft' | 'balanced' | 'high' | 'custom';

export type OutputContainer = 'mp4' | 'm4a';

export interface ExportSettings {
  /** mp4 = H.264 + AAC video, m4a = AAC audio only. */
  container: OutputContainer;
  quality: QualityPreset;
  /** Used when quality === 'custom'. */
  crf: number;
  x264Preset: 'ultrafast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow';
  videoCodec: 'h264';
  audioCodec: 'aac';
  audioBitrateKbps: number;
  normalizeAudio: boolean;
  limitPeaks: boolean;
  outputFolder: string;
  fileName: string;
}

export interface ProjectSettings {
  aspect: AspectRatioSettings;
  frameRate: FrameRateChoice;
  defaultFitMode: FitMode;
  loop: LoopSettings;
  export: ExportSettings;
}

export interface ProjectDocument {
  schemaVersion: number;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  assets: MediaAsset[];
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  settings: ProjectSettings;
}

/* ------------------------------------------------------------------ */
/* Export / job types                                                  */
/* ------------------------------------------------------------------ */

export type ExportJobState = 'queued' | 'running' | 'finalizing' | 'completed' | 'failed' | 'cancelled';

export interface ExportRequest {
  project: ProjectDocument;
  outputPath: string;
  overwrite: boolean;
}

export interface ExportJob {
  id: string;
  state: ExportJobState;
  outputPath: string;
  stage: string;
  /** 0..1 when reliably known; null otherwise. */
  progress: number | null;
  startedAt: number;
  finishedAt?: number;
  expectedDurationMs: number;
  errorCode?: string;
  errorDetail?: string;
}

export interface SeamCandidate {
  /** Source time where the loop starts (in point). */
  inMs: number;
  /** Source time where the loop ends (out point). */
  outMs: number;
  /** Lower is better. */
  score: number;
  videoScore: number | null;
  audioScore: number | null;
  confidence: 'low' | 'medium' | 'high';
  clickRisk: boolean;
}

export interface SeamAnalysisRequest {
  path: string;
  durationMs: number;
  hasVideo: boolean;
  hasAudio: boolean;
  /** Limits of the clip in source time. */
  rangeInMs: number;
  rangeOutMs: number;
  /** Search window size at each end. */
  windowMs: number;
}

export interface SeamAnalysisResult {
  candidates: SeamCandidate[];
  analyzedVideo: boolean;
  analyzedAudio: boolean;
}

export interface ImportResult {
  path: string;
  ok: boolean;
  asset?: Omit<MediaAsset, 'id' | 'importedAt'>;
  previewUrl?: string;
  errorCode?: string;
  errorDetail?: string;
}

export interface FfmpegStatus {
  ok: boolean;
  ffmpegPath: string;
  ffprobePath: string;
  ffmpegVersion?: string;
  ffprobeVersion?: string;
  errorCode?: string;
}

export interface AppInfo {
  version: string;
  platform: string;
  arch: string;
  electron: string;
  packaged: boolean;
}

/** Persisted user preferences (stored as JSON in Electron userData). */
export interface AppSettings {
  /** Show the Welcome / About dialog automatically on startup. */
  showWelcomeOnStartup: boolean;
}

export interface OpenExternalResult {
  ok: boolean;
  /** Machine-readable reason when ok === false. */
  errorCode?: 'INVALID_URL' | 'DOMAIN_NOT_ALLOWED' | 'OPEN_FAILED';
}

export interface RecentProject {
  path: string;
  title: string;
  openedAt: string;
}

export interface OpenProjectResult {
  ok: boolean;
  canceled?: boolean;
  path?: string;
  project?: ProjectDocument;
  errorCode?: string;
  errorDetail?: string;
}

export interface SaveProjectResult {
  ok: boolean;
  canceled?: boolean;
  path?: string;
  errorCode?: string;
  errorDetail?: string;
}

export interface ProxyJobUpdate {
  assetPath: string;
  state: 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number | null;
  proxyPath?: string;
  previewUrl?: string;
  errorCode?: string;
}

export interface LoopPreviewResult {
  ok: boolean;
  url?: string;
  /** Time within the preview file where the seam (transition center) occurs. */
  seamAtMs?: number;
  durationMs?: number;
  errorCode?: string;
  errorDetail?: string;
}
