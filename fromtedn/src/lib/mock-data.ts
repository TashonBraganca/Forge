import type { HubModel, FineTunedModel, LogEntry } from '../types';

export const MOCK_HUB_MODELS: HubModel[] = [
  { id: 'llama3.2-3b', name: 'llama3.2:3b', params: '3B', format: 'GGUF Q4_K_M', size: '2.0 GB', status: 'downloaded', description: 'Compact Llama 3.2 model, great for local fine-tuning on consumer GPUs.' },
  { id: 'mistral-7b', name: 'mistral:7b', params: '7B', format: 'GGUF Q4_K_M', size: '4.1 GB', status: 'downloading', downloadProgress: 64, description: 'Mistral 7B — strong reasoning and instruction following.' },
  { id: 'phi3-mini', name: 'phi3:mini', params: '3.8B', format: 'GGUF Q4_0', size: '2.3 GB', status: 'downloaded', description: 'Microsoft Phi-3 Mini — small but surprisingly capable.' },
  { id: 'deepseek-r1-7b', name: 'deepseek-r1:7b', params: '7B', format: 'GGUF Q8_0', size: '7.7 GB', status: 'available', description: 'DeepSeek R1 with chain-of-thought reasoning built in.' },
  { id: 'gemma2-9b', name: 'gemma2:9b', params: '9B', format: 'SafeTensors', size: '18.2 GB', status: 'available', description: 'Google Gemma 2 — 9B parameter model with strong benchmarks.' },
  { id: 'codellama-13b', name: 'codellama:13b', params: '13B', format: 'GGUF Q4_K_M', size: '7.4 GB', status: 'available', description: 'Code Llama 13B — specialized for code generation tasks.' },
  { id: 'qwen25-7b', name: 'qwen2.5:7b', params: '7B', format: 'GGUF Q5_K_M', size: '5.0 GB', status: 'available', description: 'Alibaba Qwen 2.5 — multilingual with strong math ability.' },
  { id: 'llama31-8b', name: 'llama3.1:8b', params: '8B', format: 'SafeTensors', size: '16.0 GB', status: 'available', description: 'Meta Llama 3.1 8B — the workhorse open-source model.' },
];

export const MOCK_FINETUNED_MODELS: FineTunedModel[] = [];

/* ─── Realistic Training Simulation ──────────────────────── */

/** Compute cosine-decay learning rate */
export function cosineDecayLR(baseLR: number, currentStep: number, totalSteps: number): number {
  const progress = currentStep / totalSteps;
  return baseLR * 0.5 * (1 + Math.cos(Math.PI * progress));
}

/** Generate a realistic loss value for a given step.
 *  Uses exponential decay + noise, producing a smooth downward curve. */
export function realisticLoss(step: number, totalSteps: number, initialLoss = 2.8, finalLoss = 0.35): number {
  const progress = step / totalSteps;
  // Exponential decay curve
  const decayRate = 3.5;
  const baseLoss = initialLoss * Math.exp(-decayRate * progress) + finalLoss * (1 - Math.exp(-decayRate * progress));
  // Add small noise (±3% of current loss) — noise decreases as training progresses
  const noiseScale = baseLoss * 0.03 * (1 - progress * 0.5);
  const noise = (Math.random() - 0.5) * 2 * noiseScale;
  return Math.max(finalLoss * 0.8, baseLoss + noise);
}

/** Simulation state tracker — keeps things synchronized */
export interface SimulationState {
  epoch: number;
  batch: number;
  totalBatches: number;
  totalEpochs: number;
  globalStep: number;
  totalSteps: number;
  baseLR: number;
  modelName: string;
  datasetRows: number;
  batchSize: number;
  phase: 'init' | 'training' | 'checkpoint' | 'done';
  initStep: number;  // tracks which init message we're on
}

/** Create initial simulation state from training config */
export function createSimState(config: {
  epochs: number;
  batchSize: number;
  learningRate: string;
  seqLength: number;
  loraRank: number;
  loraAlpha: number;
  method: string;
  dataset: string;
}, modelName: string): SimulationState {
  const datasetRows = 200 + Math.floor(Math.random() * 800); // simulate 200-1000 rows
  const totalBatches = Math.ceil(datasetRows / config.batchSize);
  return {
    epoch: 1,
    batch: 0,
    totalBatches,
    totalEpochs: config.epochs,
    globalStep: 0,
    totalSteps: totalBatches * config.epochs,
    baseLR: parseFloat(config.learningRate) || 2e-4,
    modelName,
    datasetRows,
    batchSize: config.batchSize,
    phase: 'init',
    initStep: 0,
  };
}

/** Generate the next log entry and advance simulation state.
 *  Returns { log, loss, step, epoch, done } */
export function advanceSimulation(state: SimulationState): {
  log: LogEntry;
  loss: number | null;
  step: number;
  epoch: number;
  done: boolean;
  totalSteps: number;
} {
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const makeLog = (type: LogEntry['type'], message: string): LogEntry => ({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: ts,
    type,
    message,
  });

  // ── Initialization phase (first few ticks)
  if (state.phase === 'init') {
    const initMessages: { type: LogEntry['type']; msg: string }[] = [
      { type: 'info', msg: `> Loading model weights: ${state.modelName}` },
      { type: 'info', msg: `> Tokenizer initialized (vocab=${(32000 + Math.floor(Math.random() * 2000)).toLocaleString()})` },
      { type: 'info', msg: `> Dataset validated — ${state.datasetRows.toLocaleString()} rows, ${state.totalBatches} batches/epoch` },
      { type: 'info', msg: `> LoRA config applied: rank=${16}, alpha=${32}, dropout=0.05` },
      { type: 'info', msg: `> TRAINING STARTED — ${state.totalEpochs} epochs, batch_size=${state.batchSize}, total_steps=${state.totalSteps}` },
    ];

    if (state.initStep < initMessages.length) {
      const entry = initMessages[state.initStep];
      state.initStep++;
      return { log: makeLog(entry.type, entry.msg), loss: null, step: 0, epoch: 0, done: false, totalSteps: state.totalSteps };
    }
    state.phase = 'training';
  }

  // ── Checkpoint phase (between epochs)
  if (state.phase === 'checkpoint') {
    state.phase = 'training';
    const epochJustFinished = state.epoch - 1;
    const avgLoss = realisticLoss(state.globalStep, state.totalSteps);
    return {
      log: makeLog('info', `> Checkpoint saved: epoch_${epochJustFinished}.safetensors`),
      loss: null,
      step: state.globalStep,
      epoch: state.epoch,
      done: false,
      totalSteps: state.totalSteps,
    };
  }

  // ── Done phase
  if (state.phase === 'done') {
    const finalLoss = realisticLoss(state.totalSteps, state.totalSteps);
    return {
      log: makeLog('info', `> Training complete. Final loss: ${finalLoss.toFixed(4)}`),
      loss: finalLoss,
      step: state.totalSteps,
      epoch: state.totalEpochs,
      done: true,
      totalSteps: state.totalSteps,
    };
  }

  // ── Training phase — advance by a chunk of batches
  const stepsPerTick = Math.max(1, Math.floor(state.totalBatches / 8)); // ~8 log entries per epoch
  state.batch += stepsPerTick;
  state.globalStep += stepsPerTick;

  // Check epoch boundary
  if (state.batch >= state.totalBatches) {
    const overflow = state.batch - state.totalBatches;
    const epochLoss = realisticLoss(state.globalStep, state.totalSteps);
    const lr = cosineDecayLR(state.baseLR, state.globalStep, state.totalSteps);

    if (state.epoch >= state.totalEpochs) {
      // Final epoch complete
      state.globalStep = state.totalSteps;
      state.phase = 'done';
      return {
        log: makeLog('metrics', `[E${state.epoch}] COMPLETE — avg_loss=${epochLoss.toFixed(4)}`),
        loss: epochLoss,
        step: state.totalSteps,
        epoch: state.totalEpochs,
        done: false, // 'done' log comes on next tick
        totalSteps: state.totalSteps,
      };
    }

    // Epoch boundary — move to next
    const finishedEpoch = state.epoch;
    state.epoch++;
    state.batch = overflow;
    state.phase = 'checkpoint';
    return {
      log: makeLog('metrics', `[E${finishedEpoch}] COMPLETE — avg_loss=${epochLoss.toFixed(4)}`),
      loss: epochLoss,
      step: state.globalStep,
      epoch: finishedEpoch,
      done: false,
      totalSteps: state.totalSteps,
    };
  }

  // Normal training batch
  const loss = realisticLoss(state.globalStep, state.totalSteps);
  const lr = cosineDecayLR(state.baseLR, state.globalStep, state.totalSteps);
  const displayBatch = Math.min(state.batch, state.totalBatches);

  return {
    log: makeLog('metrics', `[E${state.epoch}] batch ${displayBatch}/${state.totalBatches} loss=${loss.toFixed(4)} lr=${lr.toExponential(1)}`),
    loss,
    step: state.globalStep,
    epoch: state.epoch,
    done: false,
    totalSteps: state.totalSteps,
  };
}

// Legacy compatibility — old API still used in some places
export function generateLogEntry(index: number): LogEntry {
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  return {
    id: `log-${Date.now()}-${index}`,
    timestamp: ts,
    type: 'info',
    message: `> Step ${index}`,
  };
}

export const SELECTABLE_MODELS = [
  { id: 'llama3.2:3b', name: 'llama3.2:3b', params: '3B' },
  { id: 'mistral:7b', name: 'mistral:7b', params: '7B' },
  { id: 'phi3:mini', name: 'phi3:mini', params: '3.8B' },
  { id: 'codellama:13b', name: 'codellama:13b', params: '13B' },
  { id: 'gemma2:9b', name: 'gemma2:9b', params: '9B' },
  { id: 'deepseek-r1:7b', name: 'deepseek-r1:7b', params: '7B' },
  { id: 'qwen2.5:7b', name: 'qwen2.5:7b', params: '7B' },
  { id: 'llama3.1:8b', name: 'llama3.1:8b', params: '8B' },
];
