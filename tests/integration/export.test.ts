import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { spawnFfmpeg } from '../../src/main/services/ffmpeg.service';
import { probeMedia } from '../../src/main/services/ffprobe.service';
import { createEmptyProject } from '../../src/shared/project';
import { buildExportPlan } from '../../src/shared/render';
import { addClip } from '../../src/shared/timeline';

describe('ffmpeg export integration', () => {
  const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');
  const tempDir = path.join(os.tmpdir(), `nigi_test_${Date.now()}`);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  it('exports a direct sequence and verifies output properties', async () => {
    const fixturePath = path.join(fixturesDir, 'short_loop.mp4');
    const meta = await probeMedia(fixturePath);

    let proj = createEmptyProject();
    const asset = {
      id: 'fixture-video-1',
      name: 'short_loop.mp4',
      path: fixturePath,
      kind: 'video' as const,
      importedAt: new Date().toISOString(),
      metadata: meta,
    };
    proj.assets.push(asset);
    proj = addClip(proj, asset.id, 'track-video-1').doc;

    const finalPath = path.join(tempDir, 'output_direct.mp4');
    const res = buildExportPlan(proj, { tempDir, finalTempPath: finalPath });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Run the step
    const step = res.plan.steps[0]!;
    for (const f of step.files) {
      await fs.promises.writeFile(f.path, f.content, 'utf8');
    }

    await new Promise<void>((resolve, reject) => {
      const proc = spawnFfmpeg(step.args);
      proc.stdout?.resume();
      let stderr = '';
      proc.stderr?.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with ${code}: ${stderr.slice(-300)}`));
      });
    });

    expect(fs.existsSync(finalPath)).toBe(true);
    const outMeta = await probeMedia(finalPath);
    expect(outMeta.hasVideo).toBe(true);
    expect(outMeta.width).toBe(1920);
    expect(outMeta.height).toBe(1080);
    expect(outMeta.durationMs).toBeGreaterThanOrEqual(3900);
  });

  it('exports a seamless loop with crossfade and verifies target duration', async () => {
    const fixturePath = path.join(fixturesDir, 'short_loop.mp4');
    const meta = await probeMedia(fixturePath);

    let proj = createEmptyProject();
    const asset = {
      id: 'fixture-video-1',
      name: 'short_loop.mp4',
      path: fixturePath,
      kind: 'video' as const,
      importedAt: new Date().toISOString(),
      metadata: meta,
    };
    proj.assets.push(asset);
    proj = addClip(proj, asset.id, 'track-video-1').doc;

    // Target duration 8s (original clip is 4s, crossfade 0.8s)
    proj.settings.loop.enabled = true;
    proj.settings.loop.targetDurationMs = 8000;
    proj.settings.loop.videoCrossfadeMs = 800;
    proj.settings.loop.audioCrossfadeEnabled = true;
    proj.settings.loop.audioCrossfadeMs = 800;

    const finalPath = path.join(tempDir, 'output_loop.mp4');
    const res = buildExportPlan(proj, { tempDir, finalTempPath: finalPath });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    for (const step of res.plan.steps) {
      for (const f of step.files) {
        await fs.promises.writeFile(f.path, f.content, 'utf8');
      }

      await new Promise<void>((resolve, reject) => {
        const proc = spawnFfmpeg(step.args);
        proc.stdout?.resume();
        let stderr = '';
        proc.stderr?.on('data', (d) => {
          stderr += d.toString();
        });
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Step ${step.stage} failed: ${stderr.slice(-300)}`));
        });
      });
    }

    expect(fs.existsSync(finalPath)).toBe(true);
    const outMeta = await probeMedia(finalPath);
    expect(outMeta.hasVideo).toBe(true);
    // Output duration should be within 200ms of target 8000ms
    expect(outMeta.durationMs).toBeGreaterThanOrEqual(7800);
    expect(outMeta.durationMs).toBeLessThanOrEqual(8200);
  });

  it('supports repeated exports consecutively without restart', async () => {
    const fixturePath = path.join(fixturesDir, 'short_loop.mp4');
    const meta = await probeMedia(fixturePath);

    let proj = createEmptyProject();
    const asset = {
      id: 'fixture-video-1',
      name: 'short_loop.mp4',
      path: fixturePath,
      kind: 'video' as const,
      importedAt: new Date().toISOString(),
      metadata: meta,
    };
    proj.assets.push(asset);
    proj = addClip(proj, asset.id, 'track-video-1').doc;

    // Export 1
    const export1Path = path.join(tempDir, 'repeat_export_1.mp4');
    const res1 = buildExportPlan(proj, { tempDir, finalTempPath: export1Path });
    expect(res1.ok).toBe(true);
    if (!res1.ok) return;

    for (const step of res1.plan.steps) {
      for (const f of step.files) {
        await fs.promises.writeFile(f.path, f.content, 'utf8');
      }
      await new Promise<void>((resolve, reject) => {
        const proc = spawnFfmpeg(step.args);
        proc.stdout?.resume();
        proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Code ${code}`))));
      });
    }
    expect(fs.existsSync(export1Path)).toBe(true);

    // Export 2 immediately after Export 1 with different output destination
    const export2Path = path.join(tempDir, 'repeat_export_2.mp4');
    const res2 = buildExportPlan(proj, { tempDir, finalTempPath: export2Path });
    expect(res2.ok).toBe(true);
    if (!res2.ok) return;

    for (const step of res2.plan.steps) {
      for (const f of step.files) {
        await fs.promises.writeFile(f.path, f.content, 'utf8');
      }
      await new Promise<void>((resolve, reject) => {
        const proc = spawnFfmpeg(step.args);
        proc.stdout?.resume();
        proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Code ${code}`))));
      });
    }
    expect(fs.existsSync(export2Path)).toBe(true);

    // Verify both files are valid and exist independently
    const meta1 = await probeMedia(export1Path);
    const meta2 = await probeMedia(export2Path);
    expect(meta1.hasVideo).toBe(true);
    expect(meta2.hasVideo).toBe(true);
  });
});
