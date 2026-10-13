import { type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { shell } from 'electron';
import { buildExportPlan, type RenderPlan } from '../../shared/render';
import type { ExportJob, ExportJobState, ExportRequest } from '../../shared/types';
import { spawnFfmpeg } from './ffmpeg.service';
import { getTempDirectory } from './media.service';

interface ActiveJob {
  job: ExportJob;
  plan: RenderPlan;
  proc: ChildProcess | null;
  cancelled: boolean;
  onUpdate: (job: ExportJob) => void;
}

const activeJobs = new Map<string, ActiveJob>();

export function getExportJob(id: string): ExportJob | undefined {
  return activeJobs.get(id)?.job;
}

export function cancelExportJob(id: string): boolean {
  const active = activeJobs.get(id);
  if (!active || active.cancelled || active.job.state === 'completed' || active.job.state === 'failed') {
    return false;
  }
  active.cancelled = true;
  active.job.state = 'cancelled';
  active.job.stage = 'Dibatalkan oleh pengguna';
  if (active.proc) {
    try {
      active.proc.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
  cleanupPlan(active.plan);
  active.onUpdate({ ...active.job });
  activeJobs.delete(id);
  return true;
}

export function openExportDestination(outputPath: string): void {
  if (fs.existsSync(outputPath)) {
    shell.showItemInFolder(outputPath);
  } else {
    const parent = path.dirname(outputPath);
    if (fs.existsSync(parent)) {
      shell.openPath(parent);
    }
  }
}

export function playExportFile(outputPath: string): void {
  if (fs.existsSync(outputPath)) {
    shell.openPath(outputPath);
  }
}

export async function startExport(
  request: ExportRequest,
  onUpdate: (job: ExportJob) => void
): Promise<ExportJob> {
  const { project, outputPath, overwrite } = request;

  if (fs.existsSync(outputPath) && !overwrite) {
    const errorJob: ExportJob = {
      id: `job-${Date.now()}`,
      state: 'failed',
      outputPath,
      stage: 'Berkas tujuan sudah ada',
      progress: null,
      startedAt: Date.now(),
      expectedDurationMs: 0,
      errorCode: 'FILE_EXISTS',
      errorDetail: 'Berkas tujuan sudah ada. Silakan konfirmasi untuk menimpa.',
    };
    onUpdate(errorJob);
    return errorJob;
  }

  const tempDir = path.join(getTempDirectory(), `export_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const finalTempPath = path.join(tempDir, `out_final_${path.basename(outputPath)}`);

  const planRes = buildExportPlan(project, { tempDir, finalTempPath });
  if (!planRes.ok) {
    const errorJob: ExportJob = {
      id: `job-${Date.now()}`,
      state: 'failed',
      outputPath,
      stage: 'Gagal membuat rencana ekspor',
      progress: null,
      startedAt: Date.now(),
      expectedDurationMs: 0,
      errorCode: planRes.error,
      errorDetail: `Rencana ekspor gagal: ${planRes.error}`,
    };
    onUpdate(errorJob);
    return errorJob;
  }

  const plan = planRes.plan;
  const jobId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const job: ExportJob = {
    id: jobId,
    state: 'running',
    outputPath,
    stage: 'Memulai pemrosesan...',
    progress: 0,
    startedAt: Date.now(),
    expectedDurationMs: plan.expectedDurationMs,
  };

  const active: ActiveJob = {
    job,
    plan,
    proc: null,
    cancelled: false,
    onUpdate,
  };
  activeJobs.set(jobId, active);
  onUpdate({ ...job });

  // Run asynchronously
  runExportSteps(active, outputPath).catch((err) => {
    if (!active.cancelled) {
      active.job.state = 'failed';
      active.job.stage = 'Ekspor gagal';
      active.job.errorCode = 'EXECUTION_ERROR';
      active.job.errorDetail = err instanceof Error ? err.message : String(err);
      active.onUpdate({ ...active.job });
      cleanupPlan(active.plan);
      activeJobs.delete(jobId);
    }
  });

  return job;
}

async function runExportSteps(active: ActiveJob, finalDestination: string): Promise<void> {
  const { plan, job, onUpdate } = active;
  const totalWeight = plan.steps.reduce((acc, s) => acc + s.weight, 0);
  let accumulatedProgressWeight = 0;

  for (let stepIndex = 0; stepIndex < plan.steps.length; stepIndex++) {
    if (active.cancelled) return;
    const step = plan.steps[stepIndex]!;

    // Write any script files needed for step
    for (const f of step.files) {
      await fs.promises.writeFile(f.path, f.content, 'utf8');
    }

    job.stage = getStageLabelIndonesian(step.stage, stepIndex + 1, plan.steps.length);
    onUpdate({ ...job });

    await new Promise<void>((resolve, reject) => {
      const proc = spawnFfmpeg(step.args);
      active.proc = proc;

      let stderr = '';
      proc.stderr?.on('data', (d) => {
        stderr += d.toString();
      });

      // Parse progress from stdout
      let buffer = '';
      proc.stdout?.on('data', (d) => {
        buffer += d.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('out_time_us=')) {
            const us = parseInt(trimmed.slice('out_time_us='.length), 10);
            if (Number.isFinite(us) && step.durationMs > 0) {
              const currentStepMs = us / 1000;
              const stepRatio = Math.min(1, Math.max(0, currentStepMs / step.durationMs));
              const currentOverall = (accumulatedProgressWeight + stepRatio * step.weight) / totalWeight;
              job.progress = Math.min(0.99, Math.max(0, currentOverall));
              onUpdate({ ...job });
            }
          }
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });

      proc.on('close', (code) => {
        active.proc = null;
        if (active.cancelled) {
          resolve();
          return;
        }
        if (code === 0) {
          accumulatedProgressWeight += step.weight;
          resolve();
        } else {
          reject(new Error(`FFmpeg langkah ${stepIndex + 1} keluar dengan kode ${code}: ${stderr.slice(-500)}`));
        }
      });
    });
  }

  if (active.cancelled) return;

  // Finalize: verify final temp file exists and move to final output destination
  job.stage = 'Menyelesaikan berkas akhir...';
  job.state = 'finalizing';
  onUpdate({ ...job });

  if (!fs.existsSync(plan.finalTempPath)) {
    throw new Error('Berkas hasil pemrosesan sementara tidak ditemukan.');
  }

  // Ensure target folder exists
  const targetDir = path.dirname(finalDestination);
  if (!fs.existsSync(targetDir)) {
    await fs.promises.mkdir(targetDir, { recursive: true });
  }

  // Copy or rename to target
  await fs.promises.copyFile(plan.finalTempPath, finalDestination);

  job.state = 'completed';
  job.stage = 'Ekspor selesai dengan sukses';
  job.progress = 1.0;
  job.finishedAt = Date.now();
  onUpdate({ ...job });

  cleanupPlan(plan);
  activeJobs.delete(job.id);
}

function getStageLabelIndonesian(stage: string, current: number, total: number): string {
  switch (stage) {
    case 'unit':
      return `Menyiapkan segmen dasar (${current}/${total})...`;
    case 'segments':
      return `Membuat transisi pengulangan (${current}/${total})...`;
    case 'final':
      return `Menggabungkan dan menyandikan video akhir (${current}/${total})...`;
    case 'render':
    default:
      return `Sedang memproses dan menyandikan media (${current}/${total})...`;
  }
}

function cleanupPlan(plan: RenderPlan): void {
  for (const f of plan.tempFiles) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {
      // ignore
    }
  }
  try {
    const parent = path.dirname(plan.finalTempPath);
    if (fs.existsSync(parent)) {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
}
