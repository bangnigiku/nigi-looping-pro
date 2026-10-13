import {
  Check,
  CircleAlert,
  Download,
  FolderOpen,
  HelpCircle,
  Minus,
  Plus,
  Redo2,
  Save,
  Square,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import logoApp from '../../assets/logo-app.png';
import { useEditor } from '../../context/EditorContext';
import { id } from '../../locales/id';

export const AppHeader: React.FC = () => {
  const {
    project,
    isDirty,
    projectFilePath,
    canUndo,
    canRedo,
    undo,
    redo,
    setProjectTitle,
    addAsset,
    markSaved,
    loadProject,
    newProject,
    setExportModalOpen,
    setWelcomeModalOpen,
  } = useEditor();

  const handleImportClick = async () => {
    if (!window.nigiApi) return;
    try {
      const paths = await window.nigiApi.openMediaDialog();
      for (const p of paths) {
        const res = await window.nigiApi.inspectMediaFile(p);
        if (res.ok && res.asset) {
          addAsset({
            ...res.asset,
            id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            importedAt: new Date().toISOString(),
          });
        } else {
          alert(`Gagal mengimpor berkas:\n${res.errorDetail ?? res.errorCode}`);
        }
      }
    } catch (err) {
      console.error('Import error:', err);
    }
  };

  const handleSaveClick = async () => {
    if (!window.nigiApi) return;
    const res = await window.nigiApi.saveProject(project, projectFilePath ?? undefined);
    if (res.ok && res.path) {
      markSaved(res.path);
    }
  };

  const handleOpenClick = async () => {
    if (!window.nigiApi) return;
    if (isDirty && !confirm(id.dialogs.confirmNewProject)) return;
    const res = await window.nigiApi.openProject();
    if (res.ok && res.project && res.path) {
      loadProject(res.project, res.path);
    }
  };

  const handleNewClick = () => {
    if (isDirty && !confirm(id.dialogs.confirmNewProject)) return;
    newProject();
  };

  const handleMinimize = () => window.nigiApi?.minimizeWindow();
  const handleMaximize = () => window.nigiApi?.maximizeWindow();
  const handleClose = () => window.nigiApi?.closeWindow();

  return (
    <header className="app-header">
      <div className="header-left">
        <div
          className="app-brand"
          style={{ cursor: 'pointer' }}
          title={id.welcome.reopenHint}
          onClick={() => setWelcomeModalOpen(true)}
        >
          <img
            src={logoApp}
            alt={id.app.name}
            className="brand-logo"
            width={24}
            height={24}
          />
          <span>{id.app.name}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 12 }}>
          <button className="icon-btn" title={id.header.newProject} onClick={handleNewClick}>
            <Plus size={16} />
          </button>
          <button className="icon-btn" title={id.header.openProject} onClick={handleOpenClick}>
            <FolderOpen size={16} />
          </button>
          <button className="icon-btn" title={id.header.saveProject} onClick={handleSaveClick}>
            <Save size={16} />
          </button>
          <button className="icon-btn" title={id.welcome.reopenHint} onClick={() => setWelcomeModalOpen(true)}>
            <HelpCircle size={15} />
          </button>
        </div>

        <input
          type="text"
          className="project-title-input"
          value={project.title}
          onChange={(e) => setProjectTitle(e.target.value)}
          placeholder={id.header.untitledProject}
          title="Nama Proyek"
        />

        <div className={`save-status-badge ${isDirty ? 'unsaved' : ''}`}>
          {isDirty ? (
            <>
              <CircleAlert size={12} />
              <span>{id.header.unsaved}</span>
            </>
          ) : (
            <>
              <Check size={12} color="var(--success)" />
              <span>{id.header.saved}</span>
            </>
          )}
        </div>
      </div>

      <div className="header-center">
        <button className="icon-btn" title={id.header.undo} disabled={!canUndo} onClick={undo}>
          <Undo2 size={16} />
        </button>
        <button className="icon-btn" title={id.header.redo} disabled={!canRedo} onClick={redo}>
          <Redo2 size={16} />
        </button>
      </div>

      <div className="header-right">
        <button className="btn-secondary" onClick={handleImportClick}>
          <Upload size={14} />
          <span>{id.header.importMedia}</span>
        </button>

        <button className="btn-primary" onClick={() => setExportModalOpen(true)}>
          <Download size={14} />
          <span>{id.header.export}</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 8 }}>
          <button className="icon-btn" title="Minimalkan" onClick={handleMinimize}>
            <Minus size={14} />
          </button>
          <button className="icon-btn" title="Maksimalkan" onClick={handleMaximize}>
            <Square size={12} />
          </button>
          <button className="icon-btn" title="Tutup" onClick={handleClose}>
            <X size={14} />
          </button>
        </div>
      </div>
    </header>
  );
};
