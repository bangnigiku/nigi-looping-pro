import React, { useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Heart,
  Sparkles,
  X,
} from 'lucide-react';
import logoApp from '../../assets/logo-app.png';
import { useEditor } from '../../context/EditorContext';
import { id } from '../../locales/id';
import './WelcomeDialog.css';

// Crisp inline brand SVGs to avoid adding heavy extra npm dependencies
const InstagramIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#E1306C' }}>
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const TikTokIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ color: '#00F2FE' }}>
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.32 0 .63.05.92.14V8.98a6.37 6.37 0 0 0-.92-.07 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.46a8.27 8.27 0 0 0 3.76.9V6.69z" />
  </svg>
);

const GitHubIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

const SaweriaIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <Heart size={size} fill="currentColor" />
);

export const WelcomeDialog: React.FC = () => {
  const { welcomeModalOpen, setWelcomeModalOpen } = useEditor();
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(false);
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);

  // Sync preference on open
  useEffect(() => {
    if (welcomeModalOpen && window.nigiApi?.getSettings) {
      window.nigiApi.getSettings().then((settings) => {
        setDontShowAgain(settings.showWelcomeOnStartup === false);
      }).catch(() => {
        // ignore
      });
    }
  }, [welcomeModalOpen]);

  // Focus primary button when dialog opens
  useEffect(() => {
    if (welcomeModalOpen) {
      const timer = setTimeout(() => {
        primaryButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [welcomeModalOpen]);

  // Close with Escape key
  useEffect(() => {
    if (!welcomeModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [welcomeModalOpen, dontShowAgain]);

  if (!welcomeModalOpen) return null;

  const handleCheckboxChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setDontShowAgain(checked);
    if (window.nigiApi?.updateSettings) {
      await window.nigiApi.updateSettings({
        showWelcomeOnStartup: !checked,
      });
    }
  };

  const handleClose = async () => {
    if (window.nigiApi?.updateSettings) {
      await window.nigiApi.updateSettings({
        showWelcomeOnStartup: !dontShowAgain,
      });
    }
    setWelcomeModalOpen(false);
  };

  const handleOpenLink = async (url: string) => {
    if (window.nigiApi?.openExternal) {
      const res = await window.nigiApi.openExternal(url);
      if (!res.ok) {
        alert(`${id.welcome.linkFailed}\n${url}`);
      }
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className="welcome-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="welcome-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="welcome-header">
          <div className="welcome-header-left">
            <img
              src={logoApp}
              alt="NIGI Looping Pro"
              className="welcome-logo"
            />
            <div className="welcome-title-group">
              <div className="welcome-brand-name">
                <span>NIGI Looping Pro</span>
                <span className="welcome-badge badge-beta" style={{ padding: '2px 7px', fontSize: '9.5px' }}>
                  Beta
                </span>
              </div>
              <span className="welcome-tagline">{id.welcome.tagline}</span>
            </div>
          </div>
          <button
            type="button"
            className="welcome-close-btn"
            title="Tutup (Esc)"
            onClick={handleClose}
            aria-label="Tutup dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="welcome-body">
          {/* Status Badges */}
          <div className="welcome-badges-row">
            <span className="welcome-badge badge-beta">
              <Sparkles size={11} />
              {id.welcome.badges.beta}
            </span>
            <span className="welcome-badge badge-free">
              {id.welcome.badges.free}
            </span>
            <span className="welcome-badge badge-opensource">
              {id.welcome.badges.openSource}
            </span>
          </div>

          {/* Description Card */}
          <div className="welcome-desc-card">
            <h2 id="welcome-title" className="welcome-headline">
              {id.welcome.title}
            </h2>
            <p className="welcome-text">
              {id.welcome.description}
            </p>
            <p className="welcome-note">
              {id.welcome.betaNote}
            </p>
          </div>

          {/* Connect With Developer */}
          <div className="welcome-section">
            <h3 className="welcome-section-title">
              {id.welcome.socialTitle}
            </h3>
            <div className="welcome-social-grid">
              <button
                type="button"
                className="welcome-social-card"
                onClick={() => handleOpenLink('https://www.instagram.com/bangnigi/')}
                title="Buka Instagram @bangnigi"
              >
                <div className="welcome-social-info">
                  <div className="welcome-social-icon">
                    <InstagramIcon size={20} />
                  </div>
                  <div>
                    <div className="welcome-social-platform">Instagram</div>
                    <div className="welcome-social-handle">@bangnigi</div>
                  </div>
                </div>
                <ExternalLink size={14} className="welcome-external-arrow" />
              </button>

              <button
                type="button"
                className="welcome-social-card"
                onClick={() => handleOpenLink('https://www.tiktok.com/@bangnigi')}
                title="Buka TikTok @bangnigi"
              >
                <div className="welcome-social-info">
                  <div className="welcome-social-icon">
                    <TikTokIcon size={20} />
                  </div>
                  <div>
                    <div className="welcome-social-platform">TikTok</div>
                    <div className="welcome-social-handle">@bangnigi</div>
                  </div>
                </div>
                <ExternalLink size={14} className="welcome-external-arrow" />
              </button>
            </div>
          </div>

          {/* Open Source & Support Section */}
          <div className="welcome-support-card">
            <p className="welcome-support-text">
              {id.welcome.supportText}
            </p>
            <div className="welcome-support-buttons">
              <button
                type="button"
                className="welcome-btn-github"
                onClick={() => handleOpenLink('https://github.com/bangnigiku')}
                title="Buka repositori GitHub"
              >
                <GitHubIcon size={15} />
                <span>{id.welcome.github}</span>
                <ExternalLink size={12} style={{ opacity: 0.7 }} />
              </button>

              <button
                type="button"
                className="welcome-btn-donate"
                onClick={() => handleOpenLink('https://saweria.co/bangnigi')}
                title="Dukung developer melalui Saweria"
              >
                <SaweriaIcon size={14} />
                <span>{id.welcome.donate}</span>
                <ExternalLink size={12} style={{ opacity: 0.85 }} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="welcome-footer">
          <div className="welcome-footer-actions">
            <label className="welcome-checkbox-label">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={handleCheckboxChange}
              />
              <span>{id.welcome.dontShowAgain}</span>
            </label>

            <button
              ref={primaryButtonRef}
              type="button"
              className="welcome-btn-primary"
              onClick={handleClose}
            >
              <span>{id.welcome.start}</span>
            </button>
          </div>

          <div className="welcome-copyright">
            <span>{id.welcome.copyright}</span>
            <span>{id.welcome.developedBy}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
