export type TrainingStatus = 'idle' | 'preparing' | 'training' | 'completed' | 'failed';

export type TrainingMethod = 'qlora' | 'lora' | 'full';

export interface TrainingConfig {
  method: TrainingMethod;
  loraRank: number;
  loraAlpha: number;
  epochs: number;
  learningRate: string;
  batchSize: number;
  seqLength: number;
  dataset: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'metrics' | 'warn' | 'error';
  message: string;
}

export interface HubModel {
  id: string;
  name: string;
  params: string;
  format: string;
  size: string;
  status: 'downloaded' | 'downloading' | 'available';
  downloadProgress?: number;
  description?: string;
}

export interface FineTunedModel {
  id: string;
  jobId: string;
  name: string;
  baseModel: string;
  method: TrainingMethod;
  status: string;
  exportFormat: string;
  exportStatus: string;
  artifactPath: string;
  ollamaModelName?: string | null;
  finalLoss?: number | null;
  date: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatConfig {
  modelId: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  systemPrompt: string;
}

export interface TrainingStartResponse {
  job_id: string | null;
  mode: 'live' | 'simulation' | 'disabled';
  message: string | null;
}
