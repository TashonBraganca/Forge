/**
 * Forge API Client
 * Connects the Vite frontend to the FastAPI backend at localhost:8421.
 * All calls include console logging for debugging.
 */

const API_BASE = 'http://localhost:8421';

// ── Helpers ────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const isHealthCheck = path === '/api/health';
  if (!isHealthCheck) console.log(`[FORGE API] ${options?.method || 'GET'} ${url}`);

  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      console.error(`[FORGE API] ✗ ${res.status} ${res.statusText} — ${url}`, errorText);
      throw new Error(`API ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    if (!isHealthCheck) console.log(`[FORGE API] ✓ ${url}`, data);
    return data as T;
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      console.warn(`[FORGE API] ✗ Backend unreachable at ${API_BASE}. Is it running?`);
    } else {
      console.error(`[FORGE API] ✗ Request failed:`, err);
    }
    throw err;
  }
}

// ── Types ──────────────────────────────────────────────────

export interface HardwareStats {
  // Connectivity
  ollama_running: boolean;
  llamafactory_available: boolean;

  // GPU
  cuda_available: boolean;
  metal_available: boolean;
  gpu_name: string | null;
  vram_total_gb: number;
  vram_free_gb: number;
  gpu_util_percent: number;
  gpu_temp_c: number;

  // CPU
  cpu_name: string;
  cpu_cores: number;
  cpu_threads: number;
  cpu_percent: number;

  // RAM
  ram_total_gb: number;
  ram_free_gb: number;
  ram_percent: number;

  // Disk
  disk_total_gb: number;
  disk_free_gb: number;

  // System
  platform: string;
  forge_version: string;
  db_ready: boolean;
  database_path: string;
  datasets_dir_ready: boolean;
  models_dir_ready: boolean;
  jobs_dir_ready: boolean;
  training_backend_available: boolean;
  simulation_fallback_available: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  family: string;
  size_gb: number;
  vram_required_gb: number;
  quantization: string;
  context_length: number;
  is_installed: boolean;
  source: 'ollama' | 'huggingface';
  tags: string[];
}

export interface DatasetMeta {
  id: string;
  filename: string;
  format: 'alpaca' | 'sharegpt' | 'unknown';
  rows: number;
  valid_rows: number;
  file_path: string;
  size_bytes: number;
  columns: string[];
  validation_status: 'pending' | 'valid' | 'invalid' | 'unknown';
  preview_rows: Record<string, unknown>[];
  source: string;
  validation_message: string | null;
  issues: { row_index: number; field: string; message: string }[];
  created_at: string;
}

export interface TrainingConfig {
  model_name: string;
  dataset_id: string;
  method: 'lora' | 'qlora' | 'full';
  lora_rank?: number;
  lora_alpha?: number;
  lora_dropout?: number;
  target_modules?: string[];
  epochs?: number;
  learning_rate?: number;
  batch_size?: number;
  max_length?: number;
  output_dir?: string;
}

export interface TrainingJob {
  job_id: string;
  status: 'queued' | 'preparing' | 'training' | 'complete' | 'failed' | 'cancelled';
  config: TrainingConfig;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  current_step: number;
  total_steps: number;
  progress: number;
  current_epoch: number;
  current_loss: number | null;
  final_loss: number | null;
  output_model_path: string | null;
  simulation_mode: boolean;
  error_message: string | null;
  loss_history: number[];
  latest_logs: string[];
  export_status: 'not_started' | 'pending' | 'running' | 'completed' | 'failed';
  export_model_name: string | null;
}

export interface TrainingStartResponse {
  job_id: string | null;
  mode: 'live' | 'simulation' | 'disabled';
  message: string | null;
}

export interface TrainingEvent {
  type: 'log' | 'metrics' | 'progress' | 'complete' | 'error';
  step: number | null;
  total_steps: number | null;
  loss: number | null;
  lr: number | null;
  grad_norm: number | null;
  epoch: number | null;
  eta_seconds: number | null;
  message: string | null;
  level: 'INFO' | 'WARNING' | 'ERROR' | null;
  timestamp: string;
}

export interface FineTunedModelInfo {
  id: string;
  job_id: string;
  name: string;
  base_model: string;
  method: 'lora' | 'qlora' | 'full';
  status: string;
  export_format: string;
  export_status: string;
  artifact_path: string;
  ollama_model_name: string | null;
  final_loss: number | null;
  created_at: string;
  exported_at: string | null;
}

export interface ExportArtifactInfo {
  id: string;
  job_id: string;
  model_id: string | null;
  export_format: string;
  export_status: string;
  source_path: string;
  target_path: string | null;
  ollama_model_name: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface OllamaLibraryModel {
  name: string;
  description: string;
  tags: string[];
  pulls: number;
  size: string;
}

// ── API Methods ────────────────────────────────────────────

export const api = {
  // Health
  health: () => request<HardwareStats>('/api/health'),

  // Models
  getOllamaModels: () => request<ModelInfo[]>('/api/models/ollama'),
  searchHFModels: (q: string, limit = 20) =>
    request<ModelInfo[]>(`/api/models/huggingface?q=${encodeURIComponent(q)}&limit=${limit}`),

  // Datasets
  getDatasets: () => request<DatasetMeta[]>('/api/datasets'),
  getDataset: (id: string) => request<DatasetMeta>(`/api/datasets/${id}`),
  getDatasetPreview: (id: string) => request<DatasetMeta>(`/api/datasets/${id}/preview`),
  uploadDataset: async (file: File): Promise<DatasetMeta> => {
    const url = `${API_BASE}/api/datasets/upload`;
    console.log(`[FORGE API] POST ${url} (file: ${file.name}, ${file.size} bytes)`);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(url, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    const data = await res.json();
    console.log(`[FORGE API] ✓ Dataset uploaded:`, data);
    return data;
  },

  // Training
  startTraining: (config: TrainingConfig) =>
    request<TrainingStartResponse>('/api/training/start', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  cancelTraining: (jobId: string) =>
    request<{ status: string }>(`/api/training/cancel/${jobId}`, { method: 'POST' }),

  exportModel: (jobId: string, ollamaModelName: string) =>
    request<{ status: string; job_id: string; export_model_name: string }>(`/api/training/export/${jobId}`, {
      method: 'POST',
      body: JSON.stringify({ ollama_model_name: ollamaModelName }),
    }),

  getJobs: () => request<TrainingJob[]>('/api/training/jobs'),

  getJob: (jobId: string) => request<TrainingJob>(`/api/training/jobs/${jobId}`),

  /**
   * Subscribe to real-time training events via SSE.
   * Returns an EventSource — caller is responsible for closing it.
   */
  streamTraining: (jobId: string, onEvent: (event: TrainingEvent) => void, onError?: (err: Event) => void): EventSource => {
    const url = `${API_BASE}/api/training/stream/${jobId}`;
    console.log(`[FORGE API] SSE connecting: ${url}`);

    const es = new EventSource(url);

    let isClosed = false;

    es.onmessage = (msg) => {
      if (isClosed) return;
      try {
        const event: TrainingEvent = JSON.parse(msg.data);
        console.log(`[FORGE SSE] ${event.type}`, event.loss !== null ? `loss=${event.loss}` : '', event.message || '');
        onEvent(event);
        if (event.type === 'complete' || event.type === 'error') {
          isClosed = true;
          es.close();
        }
      } catch (err) {
        console.error('[FORGE SSE] Failed to parse event:', msg.data, err);
      }
    };

    es.onerror = (err) => {
      if (isClosed) return;
      console.error('[FORGE SSE] Connection error:', err);
      isClosed = true;
      es.close(); // Prevent browser from infinitely reconnecting
      onError?.(err);
    };

    es.onopen = () => {
      console.log(`[FORGE SSE] ✓ Connected to ${url}`);
    };

    return es;
  },

  // Chat — SSE streaming
  streamChat: (
    model: string,
    messages: { role: string; content: string }[],
    temperature = 0.7,
    onToken: (token: string, done: boolean) => void,
    onError?: (err: string) => void,
  ): EventSource => {
    const url = `${API_BASE}/api/chat/stream`;
    console.log(`[FORGE API] Chat stream: ${model}, ${messages.length} messages`);

    const controller = new AbortController();

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.text();
          console.error('[FORGE CHAT] Error:', err);
          onError?.(err);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.error) {
                  onError?.(data.error);
                } else {
                  onToken(data.token || '', data.done || false);
                }
              } catch {
                // Skip malformed lines
              }
            }
          }
        }

        onToken('', true);
        console.log('[FORGE CHAT] ✓ Stream complete');
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('[FORGE CHAT] ✗ Stream failed:', err);
          onError?.(err.message);
        }
      });

    // Return a fake EventSource that supports close()
    return { close: () => controller.abort() } as unknown as EventSource;
  },

  // Registry / export
  getRegistryModels: () => request<FineTunedModelInfo[]>('/api/models/registry'),
  getExportArtifacts: () => request<ExportArtifactInfo[]>('/api/models/artifacts'),
  getExportArtifact: (artifactId: string) => request<ExportArtifactInfo>(`/api/models/artifacts/${artifactId}`),

  // Datasets (optional source)
  searchKaggleDatasets: (q: string, limit = 20) =>
    request<{ items: unknown[]; enabled: boolean }>(`/api/datasets/kaggle/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  // Ollama library search — discover models available for pulling
  searchOllamaLibrary: (q: string, limit = 20) =>
    request<OllamaLibraryModel[]>(`/api/models/ollama/search?q=${encodeURIComponent(q)}&limit=${limit}`),
};

// ── Connection Check ───────────────────────────────────────

export async function checkBackendConnection(): Promise<boolean> {
  try {
    const stats = await api.health();
    console.log('[FORGE] ✓ Backend connected', {
      platform: stats.platform,
      gpu: stats.gpu_name || 'none',
      gpuType: stats.cuda_available ? 'CUDA' : stats.metal_available ? 'Metal' : 'CPU',
      vram: `${stats.vram_free_gb}/${stats.vram_total_gb} GB`,
      cpu: stats.cpu_name,
      cores: `${stats.cpu_cores}c/${stats.cpu_threads}t`,
      ram: `${stats.ram_free_gb}/${stats.ram_total_gb} GB`,
      ollama: stats.ollama_running ? '✓' : '✗',
      llamafactory: stats.llamafactory_available ? '✓' : '✗ (simulation mode)',
      db: stats.db_ready ? '✓' : '✗',
    });
    return true;
  } catch {
    console.warn('[FORGE] ✗ Backend not reachable at', API_BASE);
    return false;
  }
}
