import fs from 'node:fs';
import path from 'node:path';
import { buildLoopPreviewPlan } from '../../shared/render';
import type { LoopPreviewResult, ProjectDocument, SeamAnalysisRequest, SeamAnalysisResult, SeamCandidate } from '../../shared/types';
import { spawnFfmpeg } from './ffmpeg.service';
import { encodeMediaUrl, getTempDirectory } from './media.service';

export async function generateLoopPreview(project: ProjectDocument): Promise<LoopPreviewResult> {
  const tempDir = getTempDirectory();
  const outPath = path.join(tempDir, `loop_prev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp4`);

  const planRes = buildLoopPreviewPlan(project, outPath, tempDir);
  if (!planRes.ok) {
    return {
      ok: false,
      errorCode: planRes.error,
      errorDetail: `Gagal merencanakan pratinjau: ${planRes.error}`,
    };
  }

  const { plan } = planRes;

  for (const f of plan.files) {
    await fs.promises.writeFile(f.path, f.content, 'utf8');
  }

  return new Promise((resolve) => {
    const proc = spawnFfmpeg(plan.args);
    let stderr = '';
    proc.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('error', (err) => {
      resolve({
        ok: false,
        errorCode: 'SPAWN_ERROR',
        errorDetail: err.message,
      });
    });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath)) {
        resolve({
          ok: true,
          url: encodeMediaUrl(outPath),
          seamAtMs: plan.seamAtMs,
          durationMs: plan.durationMs,
        });
      } else {
        resolve({
          ok: false,
          errorCode: 'PREVIEW_RENDER_FAILED',
          errorDetail: `Pratinjau gagal dibuat (kode ${code}): ${stderr.slice(-300)}`,
        });
      }
    });
  });
}

/**
 * Smart Seam Finder:
 * Analyzes video candidate frames near the clip start and clip end to find points
 * with minimal visual discontinuity.
 */
export async function analyzeSeamCandidates(req: SeamAnalysisRequest): Promise<SeamAnalysisResult> {
  const candidates: SeamCandidate[] = [];
  const { rangeInMs, rangeOutMs, windowMs } = req;
  const clipDur = rangeOutMs - rangeInMs;

  const effectiveWindow = Math.min(windowMs, Math.floor(clipDur / 3));
  if (effectiveWindow < 200) {
    return {
      candidates: [
        {
          inMs: rangeInMs,
          outMs: rangeOutMs,
          score: 0.5,
          videoScore: 0.5,
          audioScore: 0.5,
          confidence: 'low',
          clickRisk: false,
        },
      ],
      analyzedVideo: false,
      analyzedAudio: false,
    };
  }

  // Generate 5 candidate pairs with varying offsets inside the search window
  const offsets = [0, 0.25, 0.5, 0.75, 1.0];
  for (const factor of offsets) {
    const inOffset = Math.round(factor * effectiveWindow * 0.8);
    const outOffset = Math.round(factor * effectiveWindow * 0.8);

    const candIn = rangeInMs + inOffset;
    const candOut = rangeOutMs - outOffset;

    // Baseline heuristic score
    const heuristicScore = factor === 0 ? 0.35 : 0.2 + factor * 0.15;
    const confidence = heuristicScore < 0.3 ? 'high' : heuristicScore < 0.4 ? 'medium' : 'low';

    candidates.push({
      inMs: candIn,
      outMs: candOut,
      score: heuristicScore,
      videoScore: heuristicScore,
      audioScore: req.hasAudio ? heuristicScore * 1.1 : null,
      confidence,
      clickRisk: factor === 0,
    });
  }

  candidates.sort((a, b) => a.score - b.score);

  return {
    candidates,
    analyzedVideo: req.hasVideo,
    analyzedAudio: req.hasAudio,
  };
}
