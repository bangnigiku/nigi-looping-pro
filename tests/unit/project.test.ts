import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  parseProject,
  serializeProject,
} from '../../src/shared/project';

describe('project schema & serialization', () => {
  it('creates a valid empty project', () => {
    const proj = createEmptyProject('Proyek Uji');
    expect(proj.title).toBe('Proyek Uji');
    expect(proj.schemaVersion).toBe(1);
    expect(proj.tracks.length).toBeGreaterThanOrEqual(2);
    expect(proj.clips).toEqual([]);
    expect(proj.assets).toEqual([]);
  });

  it('serializes and parses project document symmetrically', () => {
    const orig = createEmptyProject('Proyek Musik Ambience');
    orig.settings.aspect.preset = '9:16';
    orig.settings.loop.enabled = true;
    orig.settings.loop.targetDurationMs = 120000;

    const json = serializeProject(orig);
    const parsed = parseProject(json);

    expect(parsed.title).toBe(orig.title);
    expect(parsed.settings.aspect.preset).toBe('9:16');
    expect(parsed.settings.loop.enabled).toBe(true);
    expect(parsed.settings.loop.targetDurationMs).toBe(120000);
  });

  it('sanitizes and defends against malformed project data', () => {
    const badJson = JSON.stringify({
      schemaVersion: 1,
      id: 'bad',
      title: 'Hacked',
      assets: null, // invalid
      clips: null,
    });

    expect(() => parseProject(badJson)).toThrow();
  });
});
