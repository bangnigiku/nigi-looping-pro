import { describe, expect, it } from 'vitest';
import { validateExternalUrl } from '../../src/main/services/external.service';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../src/main/services/settings.service';

describe('Welcome / External Link & Settings Validation', () => {
  it('validates allowed social and support URLs', () => {
    const instagram = validateExternalUrl('https://www.instagram.com/bangnigi/');
    expect(instagram.ok).toBe(true);

    const tiktok = validateExternalUrl('https://www.tiktok.com/@bangnigi');
    expect(tiktok.ok).toBe(true);

    const github = validateExternalUrl('https://github.com/bangnigiku');
    expect(github.ok).toBe(true);

    const saweria = validateExternalUrl('https://saweria.co/bangnigi');
    expect(saweria.ok).toBe(true);
  });

  it('rejects unallowed domains, non-https schemes, and credential injections', () => {
    // Non-https
    expect(validateExternalUrl('http://github.com/bangnigiku').ok).toBe(false);

    // Unlisted domain
    const badDomain = validateExternalUrl('https://evil-site.com');
    expect(badDomain.ok).toBe(false);
    expect(badDomain.errorCode).toBe('DOMAIN_NOT_ALLOWED');

    // File or javascript protocol
    expect(validateExternalUrl('file:///C:/secret').ok).toBe(false);
    expect(validateExternalUrl('javascript:alert(1)').ok).toBe(false);

    // Embedded credentials
    expect(validateExternalUrl('https://user:pass@github.com').ok).toBe(false);

    // Malformed input
    expect(validateExternalUrl(null).ok).toBe(false);
    expect(validateExternalUrl(12345).ok).toBe(false);
  });

  it('sanitizes persistent app settings defensively', () => {
    // Empty or non-object falls back to defaults
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('string')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings([])).toEqual(DEFAULT_SETTINGS);

    // Valid boolean preference is preserved
    expect(sanitizeSettings({ showWelcomeOnStartup: false })).toEqual({
      showWelcomeOnStartup: false,
    });
    expect(sanitizeSettings({ showWelcomeOnStartup: true })).toEqual({
      showWelcomeOnStartup: true,
    });

    // Foreign keys and wrong types are stripped / ignored
    const stripped = sanitizeSettings({
      showWelcomeOnStartup: 'not-a-boolean',
      maliciousPayload: '<script>',
    });
    expect(stripped.showWelcomeOnStartup).toBe(true);
    expect((stripped as unknown as Record<string, unknown>).maliciousPayload).toBeUndefined();
  });
});
