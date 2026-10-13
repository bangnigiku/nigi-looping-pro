import React from 'react';
import { AppHeader } from './components/AppHeader/AppHeader';
import { ExportDialog } from './components/ExportDialog/ExportDialog';
import { Inspector } from './components/Inspector/Inspector';
import { MediaBin } from './components/MediaBin/MediaBin';
import { PreviewMonitor } from './components/PreviewMonitor/PreviewMonitor';
import { Timeline } from './components/Timeline/Timeline';
import { WelcomeDialog } from './components/WelcomeDialog/WelcomeDialog';
import { EditorProvider } from './context/EditorContext';
import './styles/theme.css';
import './styles/app.css';

export const AppContent: React.FC = () => {
  return (
    <div className="app-container">
      <AppHeader />
      <div className="workspace-middle">
        <MediaBin />
        <PreviewMonitor />
        <Inspector />
      </div>
      <Timeline />
      <ExportDialog />
      <WelcomeDialog />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <EditorProvider>
      <AppContent />
    </EditorProvider>
  );
};

export default App;
