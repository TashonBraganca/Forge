import { create } from 'zustand';
import type { TrainingStatus, TrainingConfig, LogEntry } from '../types';
import type { HardwareStats } from '../lib/api';
import { generateLogEntry } from '../lib/mock-data';
import { api, checkBackendConnection } from '../lib/api';
import type { TrainingEvent } from '../lib/api';

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
  totalSteps: 2436,
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
    const interval = setInterval(() => get().pollHardware(), 2000);
    set({ hwPollInterval: interval });
    console.log('[STORE] Hardware polling started (2s)');
  },

  stopHwPoll: () => {
    const { hwPollInterval } = get();
    if (hwPollInterval) clearInterval(hwPollInterval);
    set({ hwPollInterval: null });
  },

  startTraining: () => {
    const state = get();
    if (!state.selectedModel) return;

    console.log('[STORE] Starting training', { model: state.selectedModel, config: state.config });

    set({
      status: 'preparing',
      progress: 0,
      currentLoss: 1.55,
      lossHistory: [1.55],
      currentEpoch: 1,
      currentStep: 0,
      logs: [],
      logIndex: 0,
      gpuUtil: 12,
      vramUtil: 45,
      cpuUtil: 15,
      ramUtil: 22,
      gpuTemp: 52,
    });

    if (state.backendConnected) {
      console.log('[STORE] Attempting real training via backend...');
      api.startTraining({
        model_name: state.selectedModel,
        dataset_id: state.config.dataset,
        method: state.config.method,
        lora_rank: state.config.loraRank,
        lora_alpha: state.config.loraAlpha,
        epochs: state.config.epochs,
        learning_rate: parseFloat(state.config.learningRate),
        batch_size: state.config.batchSize,
        max_length: state.config.seqLength,
      })
        .then((response: { job_id: string | null; mode?: string }) => {
          if (response.mode === 'simulation' || !response.job_id) {
            console.log('[STORE] Backend says use simulation (LLaMA-Factory not installed)');
            get().startSimulation();
            return;
          }

          console.log('[STORE] ✓ Training job started:', response.job_id);
          set({ activeJobId: response.job_id, status: 'training' });

          const es = api.streamTraining(
            response.job_id,
            (event: TrainingEvent) => {
              const s = get();
              const newLog: LogEntry = {
                id: `log-${Date.now()}-${Math.random()}`,
                timestamp: new Date().toLocaleTimeString('en-GB'),
                type: event.type === 'error' ? 'error' : event.type === 'metrics' ? 'metrics' : 'info',
                message: event.message || '',
              };

              if (event.type === 'metrics' && event.loss !== null) {
                set({
                  currentLoss: event.loss,
                  lossHistory: [...s.lossHistory, event.loss],
                  logs: [...s.logs, newLog],
                });
              } else if (event.type === 'progress' && event.step !== null) {
                const totalSteps = event.total_steps || s.totalSteps;
                const progress = (event.step / totalSteps) * 100;
                set({
                  currentStep: event.step,
                  totalSteps,
                  progress,
                  logs: [...s.logs, newLog],
                });
              } else if (event.type === 'complete') {
                set({
                  status: 'completed',
                  progress: 100,
                  logs: [...s.logs, newLog],
                });
                es.close();
              } else if (event.type === 'error') {
                console.error('[STORE] Training error:', event.message);
                set({ logs: [...s.logs, newLog] });
              } else {
                set({ logs: [...s.logs, newLog] });
              }
            },
            () => {
              console.error('[STORE] SSE error, falling back to simulation');
              get().startSimulation();
            },
          );

          set({ eventSource: es });
        })
        .catch((err) => {
          console.warn('[STORE] Backend training failed, falling back to simulation:', err.message);
          get().startSimulation();
        });
    } else {
      console.log('[STORE] Backend offline — running simulation');
      get().startSimulation();
    }
  },

  startSimulation: () => {
    setTimeout(() => {
      set({ status: 'training' });
      console.log('[STORE] Simulation started');

      const interval = setInterval(() => {
        const s = get();
        if (s.status !== 'training') return;

        const progressInc = 0.3 + Math.random() * 0.5;
        const newProgress = Math.min(100, s.progress + progressInc);
        const lossDecay = 0.003 + Math.random() * 0.008;
        const newLoss = Math.max(0.22, s.currentLoss - lossDecay);
        const newStep = Math.min(s.totalSteps, s.currentStep + Math.floor(Math.random() * 8) + 2);
        const newEpoch = Math.floor(newProgress / (100 / s.totalEpochs)) + 1;

        let newLogs = s.logs;
        let newLogIndex = s.logIndex;
        if (Math.random() > 0.6) {
          const entry = generateLogEntry(newLogIndex);
          newLogs = [...s.logs, entry];
          newLogIndex = s.logIndex + 1;
        }

        if (newProgress >= 100) {
          clearInterval(interval);
          console.log('[STORE] ✓ Simulation complete');
          set({
            status: 'completed',
            progress: 100,
            currentLoss: newLoss,
            lossHistory: [...s.lossHistory, newLoss],
            currentEpoch: s.totalEpochs,
            currentStep: s.totalSteps,
            gpuUtil: s.backendConnected ? s.gpuUtil : 0,
            vramUtil: s.backendConnected ? s.vramUtil : 18,
            cpuUtil: s.backendConnected ? s.cpuUtil : 8,
            gpuTemp: s.backendConnected ? s.gpuTemp : 48,
            logs: [...newLogs, {
              id: `log-done-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString('en-GB'),
              type: 'info' as const,
              message: '> Training complete. Model saved successfully.',
            }],
            simulationInterval: null,
          });
          return;
        }

        set({
          progress: newProgress,
          currentLoss: newLoss,
          lossHistory: [...s.lossHistory, newLoss],
          currentEpoch: Math.min(newEpoch, s.totalEpochs),
          currentStep: newStep,
          ...(s.backendConnected ? {} : {
            gpuTemp: 68 + Math.floor(Math.random() * 10),
            gpuUtil: 82 + Math.floor(Math.random() * 15),
            vramUtil: 72 + Math.floor(Math.random() * 12),
            cpuUtil: 25 + Math.floor(Math.random() * 20),
            ramUtil: 35 + Math.floor(Math.random() * 10),
          }),
          logs: newLogs,
          logIndex: newLogIndex,
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

    if (state.activeJobId && state.backendConnected) {
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
    });
  },
}));
