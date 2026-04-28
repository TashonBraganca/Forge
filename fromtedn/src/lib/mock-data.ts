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

export const MOCK_TRAINING_LOGS: string[] = [
  '> Loading model weights: llama3.2:3b-q4_k_m.gguf',
  '> Tokenizer initialized (vocab=32000)',
  '> Dataset: alpaca_52k.jsonl — 52,002 rows validated',
  '> QLoRA config: rank=16, alpha=32, dropout=0.05',
  '> Allocating VRAM: 18.4 GB / 24.0 GB reserved',
  '> TRAINING STARTED — 3 epochs, batch_size=4, seq_len=2048',
  '[E1] batch 50/812 loss=1.5102 lr=2.0e-4',
  '[E1] batch 100/812 loss=1.4231 lr=2.0e-4',
  '[E1] batch 200/812 loss=1.2104 lr=2.0e-4',
  '[E1] batch 300/812 loss=1.0321 lr=1.95e-4',
  '[E1] batch 400/812 loss=0.8934 lr=1.9e-4',
  '[E1] batch 500/812 loss=0.8102 lr=1.85e-4',
  '[E1] batch 600/812 loss=0.7543 lr=1.8e-4',
  '[E1] batch 700/812 loss=0.7211 lr=1.75e-4',
  '[E1] batch 812/812 loss=0.6891 lr=1.7e-4',
  '[E1] COMPLETE — avg_loss=0.7811 — 4m 12s',
  '> Checkpoint saved: epoch_1.safetensors (2.1 GB)',
  '[E2] batch 50/812 loss=0.6512 lr=1.5e-4',
  '[E2] batch 100/812 loss=0.6234 lr=1.5e-4',
  '[E2] batch 200/812 loss=0.5891 lr=1.45e-4',
  '[E2] batch 400/812 loss=0.5102 lr=1.35e-4',
  '[E2] batch 600/812 loss=0.4534 lr=1.25e-4',
  '[E2] batch 812/812 loss=0.4102 lr=1.15e-4',
  '[E2] COMPLETE — avg_loss=0.4891 — 4m 08s',
  '> Checkpoint saved: epoch_2.safetensors (2.1 GB)',
  '[E3] batch 100/812 loss=0.3812 lr=1.0e-4',
  '[E3] batch 200/812 loss=0.3521 lr=9.5e-5',
  '[E3] batch 400/812 loss=0.3102 lr=8.5e-5',
  '[E3] batch 600/812 loss=0.2891 lr=7.5e-5',
  '[E3] batch 812/812 loss=0.2712 lr=6.5e-5',
  '[E3] COMPLETE — avg_loss=0.3012 — 4m 05s',
  '> Training complete. Final loss: 0.2712',
  '> Model saved: llama3.2-3b-alpaca-qlora.safetensors',
];

export function generateLogEntry(index: number): LogEntry {
  const raw = MOCK_TRAINING_LOGS[index % MOCK_TRAINING_LOGS.length];
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  let type: LogEntry['type'] = 'info';
  if (raw.startsWith('[E')) type = 'metrics';
  if (raw.includes('WARN')) type = 'warn';
  if (raw.includes('ERROR')) type = 'error';

  return {
    id: `log-${Date.now()}-${index}`,
    timestamp: ts,
    type,
    message: raw,
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
