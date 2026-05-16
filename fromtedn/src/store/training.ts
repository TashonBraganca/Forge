import { create } from 'zustand';
import type { TrainingStatus, TrainingConfig, LogEntry } from '../types';
import type { HardwareStats } from '../lib/api';
import { createSimState, advanceSimulation } from '../lib/mock-data';
import type { SimulationState } from '../lib/mock-data';
import { api, checkBackendConnection } from '../lib/api';
import type { TrainingEvent, TrainingJob as ApiTrainingJob } from '../lib/api';

interface TrainingStore {
  status: TrainingStatus;
  selectedModel: string | null;
  config: TrainingConfig;
  progress: number;
  currentLoss: number;
  lossHistory: number[];
  currentEpoch: number;
  totalEpochs: number;
  currentStep: number;
  totalSteps: number;
  gpuTemp: number;
  gpuUtil: number;
  vramUtil: number;
  cpuUtil: number;
  ramUtil: number;
  logs: LogEntry[];
  simulationInterval: ReturnType<typeof setInterval> | null;
  logIndex: number;
  backendConnected: boolean;
  activeJobId: string | null;
  eventSource: EventSource | null;
  hwStats: HardwareStats | null;
  hwPollInterval: ReturnType<typeof setInterval> | null;
  exportStatus: 'not_started' | 'pending' | 'running' | 'completed' | 'failed';
  exportProgress: number;
  exportModelName: string | null;
  simState: SimulationState | null;

  setSelectedModel: (id: string) => void;
  updateConfig: (patch: Partial<TrainingConfig>) => void;
  startTraining: () => void;
  stopTraining: () => void;
  resetTraining: () => void;
  checkBackend: () => Promise<void>;
  startSimulation: () => void;
  pollHardware: () => Promise<void>;
  startHwPoll: () => void;
  stopHwPoll: () => void;
  exportModel: (ollamaModelName: string) => Promise<void>;
}

const DEFAULT_CONFIG: TrainingConfig = {
  method: 'qlora',
  loraRank: 16,
  loraAlpha: 32,
  epochs: 3,
  learningRate: '2e-4',
  batchSize: 4,
  seqLength: 2048,
  dataset: 'alpaca_52k.jsonl',
};

const INITIAL_STATE = {
  selectedModel: '',
  config: DEFAULT_CONFIG,
  status: 'idle' as const,
  currentStep: 0,
  totalSteps: 0,
  progress: 0,
  currentEpoch: 0,
  totalEpochs: 0,
  currentLoss: 0,
  lossHistory: [],
  gpuTemp: 0,
  gpuUtil: 0,
  vramUtil: 0,
  cpuUtil: 0,
  ramUtil: 0,
  logs: [],
  simulationInterval: null,
  logIndex: 0,
  activeJobId: null,
  eventSource: null,
  hwStats: null,
  hwPollInterval: null,
  exportStatus: 'not_started' as const,
  exportProgress: 0,
  exportModelName: null,
  simState: null,
};

function mapEventType(message: string): LogEntry['type'] {
  const msg = message.toLowerCase();
  if (msg.includes('error:') || msg.includes('exception:') || msg.includes('traceback')) return 'error';
  if (msg.includes('warn') || msg.includes('warning:')) return 'warn';
  if (msg.includes('loss=') || msg.includes('train_loss')) return 'metrics';
  return 'info';
}

function hydrateJobIntoStore(set: (partial: Partial<TrainingStore> | ((state: TrainingStore) => Partial<TrainingStore>)) => void, job: ApiTrainingJob) {
  const status: TrainingStatus =
    job.status === 'complete' ? 'completed' :
    job.status === 'failed' ? 'failed' :
    job.status === 'cancelled' ? 'idle' :
    job.status === 'queued' ? 'preparing' :
    job.status === 'preparing' ? 'preparing' : 'training';

  set({
    status,
    selectedModel: job.config.model_name,
    config: {
      method: job.config.method,
      loraRank: job.config.lora_rank ?? 16,
      loraAlpha: job.config.lora_alpha ?? 32,
      epochs: job.config.epochs ?? 3,
      learningRate: String(job.config.learning_rate ?? 2e-4),
      batchSize: job.config.batch_size ?? 4,
      seqLength: job.config.max_length ?? 2048,
      dataset: job.config.dataset_id,
    },
    progress: job.progress ?? 0,
    currentLoss: job.final_loss ?? 0,
    lossHistory: job.loss_history ?? [],
    currentEpoch: job.current_epoch ?? 0,
    totalEpochs: job.config.epochs ?? 3,
    currentStep: job.current_step ?? 0,
    totalSteps: job.total_steps ?? 0,
    logs: (job.latest_logs ?? []).map((message, index) => ({
      id: `restored-${job.job_id}-${index}`,
      timestamp: new Date(job.created_at).toLocaleTimeString('en-GB'),
      type: mapEventType(message),
      message,
    })),
    backendConnected: true,
    activeJobId: job.status === 'training' || job.status === 'preparing' || job.status === 'queued' ? job.job_id : null,
    exportStatus: job.export_status as any,
    exportModelName: job.export_model_name,
  });
}

function subscribeToTrainingStream(
  set: (partial: Partial<TrainingStore> | ((state: TrainingStore) => Partial<TrainingStore>)) => void,
  get: () => TrainingStore,
  jobId: string,
  onComplete?: () => void,
) {
  return api.streamTraining(
    jobId,
    (event: TrainingEvent) => {
      const s = get();

      // Determine if this is really a fatal error or just a warning coming through as 'error' type
      const isTrulyFatal = event.type === 'error' && event.level === 'ERROR' &&
        !(event.message || '').includes('FutureWarning') &&
        !(event.message || '').includes('UserWarning') &&
        !(event.message || '').includes('DeprecationWarning') &&
        !(event.message || '').includes('NOTE:');

      const logType: LogEntry['type'] = isTrulyFatal ? 'error' :
        event.type === 'error' ? 'warn' :
        event.type === 'metrics' ? 'metrics' : 'info';

      const newLog: LogEntry = {
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString('en-GB'),
        type: logType,
        message: event.message || '',
      };

      if (event.type === 'metrics' && event.loss !== null) {
        set({
          currentLoss: event.loss,
          lossHistory: [...s.lossHistory, event.loss],
          currentEpoch: typeof event.epoch === 'number' ? Math.floor(event.epoch) : s.currentEpoch,
          logs: [...s.logs, newLog],
        });
      } else if (event.type === 'progress' && event.step !== null) {
        const isExport = s.exportStatus !== 'not_started';
        if (isExport) {
          // This is an export progress event
          const progress = event.total_steps ? (event.step / event.total_steps) * 100 : 0;
          set({ exportProgress: progress, logs: [...s.logs, newLog] });
        } else {
          // This is a training progress event
          const totalSteps = event.total_steps || s.totalSteps;
          const progress = totalSteps > 0 ? (event.step / totalSteps) * 100 : 0;
          set({
            status: 'training',
            currentStep: event.step,
            totalSteps,
            progress,
            logs: [...s.logs, newLog],
          });
        }
      } else if (event.type === 'complete') {
        const isExport = event.message?.includes('Export');
        if (isExport) {
          set({ exportStatus: 'completed', logs: [...s.logs, newLog] });
        } else {
          set({ status: 'completed', progress: 100, currentEpoch: s.totalEpochs, logs: [...s.logs, newLog] });
        }
        onComplete?.();
      } else if (isTrulyFatal) {
        console.error(`[STORE] ❌ Training error: ${event.message}`);
        const isExport = event.message?.includes('Export');
        if (isExport) {
          set({ exportStatus: 'failed', logs: [...s.logs, newLog] });
        } else {
          set({ status: 'failed', logs: [...s.logs, newLog] });
        }
      } else {
        // Non-fatal log line (warnings, info, etc.) — just append to logs
        const updates: Partial<TrainingStore> = { logs: [...s.logs, newLog] };
        if (event.message?.includes('Starting export pipeline')) {
            updates.exportStatus = 'running';
        }
        if (event.message?.includes('Phase 4/4')) {
            // Ollama import phase
            updates.exportProgress = 90;
        }
        if (event.message?.includes('✅ Export pipeline completed successfully!')) {
            updates.exportStatus = 'completed';
            updates.exportProgress = 100;
        }
        if (event.message?.includes('❌ Export failed:')) {
            updates.exportStatus = 'failed';
        }
        set(updates);
      }
    },
    () => {
      const s = get();
      if (s.status !== 'completed' && s.status !== 'failed' && s.exportStatus !== 'completed' && s.exportStatus !== 'failed') {
        console.error('[STORE] ❌ SSE connection error — falling back to simulation');
      }
    },
  );
}

export const useTrainingStore = create<TrainingStore>((set, get) => ({
  status: 'idle',
  selectedModel: 'llama3.2:3b',
  config: { ...DEFAULT_CONFIG },
  progress: 0,
  currentLoss: 0,
  lossHistory: [],
  currentEpoch: 0,
  totalEpochs: 3,
  currentStep: 0,
  totalSteps: 0,
  gpuTemp: 45,
  gpuUtil: 0,
  vramUtil: 0,
  cpuUtil: 0,
  ramUtil: 0,
  logs: [],
  simulationInterval: null,
  logIndex: 0,
  backendConnected: false,
  activeJobId: null,
  eventSource: null,
  hwStats: null,
  hwPollInterval: null,
  exportStatus: 'not_started',
  exportProgress: 0,
  exportModelName: null,
  simState: null,

  setSelectedModel: (id) => {
    console.log('[STORE] Model selected:', id);
    set({ selectedModel: id });
  },

  updateConfig: (patch) =>
    set((s) => ({ config: { ...s.config, ...patch } })),

  checkBackend: async () => {
    const connected = await checkBackendConnection();
    console.log(`[STORE] Backend ${connected ? '✓ connected' : '✗ offline — using simulation'}`);
    set({ backendConnected: connected });
    if (connected) {
      get().startHwPoll();
      api.getJobs()
        .then((jobs) => {
          const active = jobs.find((job) => job.status === 'training' || job.status === 'preparing' || job.status === 'queued');
          if (active) {
            hydrateJobIntoStore(set, active);
            const es = subscribeToTrainingStream(set, get, active.job_id);
            set({ eventSource: es, activeJobId: active.job_id });
          }
        })
        .catch(() => {
          // Keep the UI usable even if the job list is temporarily unavailable.
        });
    }
  },

  pollHardware: async () => {
    try {
      const hw = await api.health();
      const vramPct = hw.vram_total_gb > 0
        ? Math.round(((hw.vram_total_gb - hw.vram_free_gb) / hw.vram_total_gb) * 100)
        : 0;
      set({
        hwStats: hw,
        gpuUtil: Math.round(hw.gpu_util_percent),
        gpuTemp: Math.round(hw.gpu_temp_c) || 45,
        vramUtil: vramPct,
        cpuUtil: Math.round(hw.cpu_percent),
        ramUtil: Math.round(hw.ram_percent),
      });
    } catch {
      // silently ignore poll failures
    }
  },

  startHwPoll: () => {
    const { hwPollInterval, pollHardware } = get();
    if (hwPollInterval) return;
    pollHardware();
    console.log('[STORE] Hardware status fetched once (polling disabled)');
  },

  stopHwPoll: () => {
    const { hwPollInterval } = get();
    if (hwPollInterval) clearInterval(hwPollInterval);
    set({ hwPollInterval: null });
  },

  startTraining: () => {
    const state = get();
    if (!state.selectedModel) {
      console.warn('[STORE] ⚠️ Cannot start training — no model selected');
      return;
    }

    console.log(
      `[STORE] 🔥 Starting training\n` +
      `  Model:         ${state.selectedModel}\n` +
      `  Method:        ${state.config.method}\n` +
      `  Dataset:       ${state.config.dataset}\n` +
      `  Epochs:        ${state.config.epochs}\n` +
      `  Batch Size:    ${state.config.batchSize}\n` +
      `  Learning Rate: ${state.config.learningRate}\n` +
      `  LoRA Rank:     ${state.config.loraRank}\n` +
      `  LoRA Alpha:    ${state.config.loraAlpha}\n` +
      `  Seq Length:    ${state.config.seqLength}\n` +
      `  Backend:       ${state.backendConnected ? '✓ connected' : '✗ offline'}`
    );

    set({
      status: 'preparing',
      progress: 0,
      currentLoss: 0,
      lossHistory: [],
      currentEpoch: 0,
      totalEpochs: state.config.epochs,
      currentStep: 0,
      totalSteps: 0,
      exportStatus: 'not_started',
      exportModelName: null,
      logs: [{
        id: `log-start-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-GB'),
        type: 'info' as const,
        message: `Starting training: ${state.selectedModel} | ${state.config.method.toUpperCase()} | ${state.config.epochs} epochs | batch=${state.config.batchSize} | lr=${state.config.learningRate}`,
      }],
      logIndex: 0,
    });

    if (state.backendConnected) {
      console.log('[STORE] 📡 Sending training request to backend...');
      const trainingConfig = {
        model_name: state.selectedModel,
        dataset_id: state.config.dataset,
        method: state.config.method,
        lora_rank: state.config.loraRank,
        lora_alpha: state.config.loraAlpha,
        epochs: state.config.epochs,
        learning_rate: parseFloat(state.config.learningRate),
        batch_size: state.config.batchSize,
        max_length: state.config.seqLength,
      };
      console.log('[STORE] Training config payload:', trainingConfig);

      api.startTraining(trainingConfig)
        .then((response) => {
          if (!response.job_id) {
            console.error('[STORE] ❌ Backend did not return a job id — response:', response);
            return;
          }

          console.log(
            `[STORE] ✓ Training job created:\n` +
            `  Job ID: ${response.job_id}\n` +
            `  Mode:   ${response.mode}\n` +
            `  Msg:    ${response.message || 'none'}`
          );
          set({ activeJobId: response.job_id, status: 'training' });
          console.log(`[STORE] 📡 Subscribing to SSE stream for job ${response.job_id}...`);
          const es = subscribeToTrainingStream(set, get, response.job_id);
          set({ eventSource: es });
        })
        .catch((err) => {
          console.warn(`[STORE] ⚠️ Backend training failed: ${err.message}`);
          console.warn('[STORE] Falling back to simulation mode');
          get().startSimulation();
        });
    } else {
      console.log('[STORE] 🔄 Backend offline — running simulation');
      get().startSimulation();
    }
  },

  exportModel: async (ollamaModelName: string) => {
    const { activeJobId, backendConnected } = get();

    // ── Simulation export (backend offline or simulation job)
    if (!backendConnected || (activeJobId && activeJobId.startsWith('sim-'))) {
      console.log('[STORE] 🔄 Simulating export pipeline...');
      set({ exportStatus: 'pending', exportModelName: ollamaModelName });

      const simExportLogs = [
        'Starting export pipeline...',
        'Phase 1/4: Merging LoRA adapters with base model...',
        'Phase 2/4: Converting to GGUF using llama.cpp...',
        'Phase 3/4: Quantizing to Q4_K_M...',
        `Phase 4/4: Importing to Ollama as '${ollamaModelName}'...`,
        '✅ Export pipeline completed successfully!',
      ];

      set({ exportStatus: 'running' });
      let i = 0;
      const exportInterval = setInterval(() => {
        const s = get();
        if (i >= simExportLogs.length) {
          clearInterval(exportInterval);
          set({ exportStatus: 'completed' });
          return;
        }
        const msg = simExportLogs[i];
        const newLog: LogEntry = {
          id: `log-export-${Date.now()}-${i}`,
          timestamp: new Date().toLocaleTimeString('en-GB'),
          type: 'info',
          message: msg,
        };
        set({ logs: [...s.logs, newLog] });
        i++;
      }, 1200);
      return;
    }

    // ── Real backend export
    if (!activeJobId) return;

    try {
      set({ exportStatus: 'pending', exportModelName: ollamaModelName });
      await api.exportModel(activeJobId, ollamaModelName);
      
      // Re-subscribe to the stream to see the export logs
      const es = subscribeToTrainingStream(set, get, activeJobId);
      set({ eventSource: es });
    } catch (err) {
      console.error('[STORE] Export error:', err);
      set({ exportStatus: 'failed' });
    }
  },

  startSimulation: () => {
    const state = get();
    const simId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const simState = createSimState(state.config, state.selectedModel || 'llama3.2:3b');

    set({
      activeJobId: simId,
      totalSteps: simState.totalSteps,
      simState,
    });

    setTimeout(() => {
      set({ status: 'training' });
      console.log('[STORE] Simulation started — total steps:', simState.totalSteps);

      const interval = setInterval(() => {
        const s = get();
        if (s.status !== 'training' || !s.simState) return;

        const result = advanceSimulation(s.simState);

        if (result.done) {
          clearInterval(interval);
          console.log('[STORE] ✓ Simulation complete');
          set({
            status: 'completed',
            progress: 100,
            currentLoss: result.loss ?? s.currentLoss,
            lossHistory: result.loss != null ? [...s.lossHistory, result.loss] : s.lossHistory,
            currentEpoch: result.epoch,
            currentStep: result.totalSteps,
            totalSteps: result.totalSteps,
            logs: [...s.logs, result.log],
            simulationInterval: null,
          });
          return;
        }

        const progress = result.totalSteps > 0 ? (result.step / result.totalSteps) * 100 : 0;

        set({
          progress,
          currentLoss: result.loss ?? s.currentLoss,
          lossHistory: result.loss != null ? [...s.lossHistory, result.loss] : s.lossHistory,
          currentEpoch: result.epoch,
          currentStep: result.step,
          totalSteps: result.totalSteps,
          logs: [...s.logs, result.log],
          logIndex: s.logIndex + 1,
          simState: s.simState,
        });
      }, 800);

      set({ simulationInterval: interval });
    }, 600);
  },

  stopTraining: () => {
    const state = get();
    console.log('[STORE] Training halted');

    if (state.eventSource) {
      state.eventSource.close();
    }

    if (state.activeJobId && state.backendConnected && !state.activeJobId.startsWith('sim-')) {
      api.cancelTraining(state.activeJobId).catch((err) =>
        console.warn('[STORE] Backend cancel failed:', err.message)
      );
    }

    if (state.simulationInterval) {
      clearInterval(state.simulationInterval);
    }

    set({
      status: 'idle',
      simulationInterval: null,
      eventSource: null,
      activeJobId: null,
      simState: null,
      logs: [...state.logs, {
        id: `log-halt-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-GB'),
        type: 'warn' as const,
        message: '> Training halted by user.',
      }],
    });
  },

  resetTraining: () => {
    const state = get();
    console.log('[STORE] Training reset');

    if (state.simulationInterval) clearInterval(state.simulationInterval);
    if (state.eventSource) state.eventSource.close();

    set({
      status: 'idle',
      progress: 0,
      currentLoss: 0,
      lossHistory: [],
      currentEpoch: 0,
      currentStep: 0,
      logs: [],
      logIndex: 0,
      gpuUtil: 0,
      vramUtil: 0,
      cpuUtil: 0,
      ramUtil: 0,
      gpuTemp: 45,
      simulationInterval: null,
      eventSource: null,
      activeJobId: null,
      simState: null,
      exportStatus: 'not_started',
      exportProgress: 0,
      exportModelName: null,
    });
  },
}));
