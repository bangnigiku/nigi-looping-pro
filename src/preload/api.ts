import type {
  AppInfo,
  AppSettings,
  ExportJob,
  ExportRequest,
  FfmpegStatus,
  ImportResult,
  LoopPreviewResult,
  OpenExternalResult,
  OpenProjectResult,
  ProjectDocument,
  ProxyJobUpdate,
  RecentProject,
  SaveProjectResult,
  SeamAnalysisRequest,
  SeamAnalysisResult,
} from '../shared/types';

export interface NigiApi {
  // App info
  getInfo: () => Promise<AppInfo>;
  checkFfmpeg: () => Promise<FfmpegStatus>;

  // Settings & external links
  getSettings: () => Promise<AppSettings>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  /** Opens an allowlisted https URL in the default browser (validated in main). */
  openExternal: (url: string) => Promise<OpenExternalResult>;

  // Media
  openMediaDialog: () => Promise<string[]>;
  inspectMediaFile: (filePath: string) => Promise<ImportResult>;
  generatePreviewProxy: (filePath: string) => Promise<string>;
  onProxyProgress: (callback: (update: ProxyJobUpdate) => void) => () => void;

  // Project
  newProject: (title?: string) => Promise<ProjectDocument>;
  openProject: (filePath?: string) => Promise<OpenProjectResult>;
  saveProject: (project: ProjectDocument, filePath?: string) => Promise<SaveProjectResult>;
  getRecentProjects: () => Promise<RecentProject[]>;

  // Export
  chooseExportLocation: (defaultName: string, container: string) => Promise<string | null>;
  startExport: (request: ExportRequest) => Promise<ExportJob>;
  cancelExport: (jobId: string) => Promise<boolean>;
  openExportFolder: (outputPath: string) => Promise<void>;
  playExportFile: (outputPath: string) => Promise<void>;
  onExportProgress: (callback: (job: ExportJob) => void) => () => void;
  checkFileExists: (filePath: string) => Promise<boolean>;

  // Loop
  generateLoopPreview: (project: ProjectDocument) => Promise<LoopPreviewResult>;
  analyzeSeam: (request: SeamAnalysisRequest) => Promise<SeamAnalysisResult>;

  // Diagnostics
  logDiagnostic: (event: string, data: Record<string, unknown>) => Promise<void>;
  getDiagnostics: () => Promise<unknown[]>;
  getDiagnosticLogPath: () => Promise<string>;

  // Native Window controls
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
}

declare global {
  interface Window {
    nigiApi: NigiApi;
  }
}
