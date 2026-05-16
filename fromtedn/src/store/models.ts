import { create } from 'zustand';
import type { HubModel, FineTunedModel, ChatMessage, ChatConfig } from '../types';
import { api } from '../lib/api';
import type { OllamaLibraryModel } from '../lib/api';

const API_BASE = 'http://localhost:8421';

interface ModelStore {
  hubModels: HubModel[];
  fineTunedModels: FineTunedModel[];
  searchQuery: string;
  activeFilter: string;
  expandedModelId: string | null;
  loading: boolean;

  // Ollama library search
  ollamaSearchResults: OllamaLibraryModel[];
  ollamaSearchLoading: boolean;
  ollamaSearchQuery: string;

  setSearchQuery: (q: string) => void;
  setActiveFilter: (f: string) => void;
  toggleExpanded: (id: string) => void;
  getFilteredModels: () => HubModel[];
  fetchOllamaModels: () => Promise<void>;
  fetchRegistryModels: () => Promise<void>;
  pullModel: (modelName: string) => void;
  cancelPull: (modelName: string) => void;
  deleteModel: (modelName: string) => Promise<void>;
  searchOllamaLibrary: (q: string) => void;
  clearOllamaSearch: () => void;
}

let ollamaSearchTimeout: ReturnType<typeof setTimeout>;
const activePullControllers = new Map<string, AbortController>();

export const useModelStore = create<ModelStore>((set, get) => ({
  hubModels: [],
  fineTunedModels: [],
  searchQuery: '',
  activeFilter: 'all',
  expandedModelId: null,
  loading: false,
  ollamaSearchResults: [],
  ollamaSearchLoading: false,
  ollamaSearchQuery: '',

  setSearchQuery: (q) => {
    set({ searchQuery: q });
    // HuggingFace models are NOT added to hubModels — use the Ollama library
    // search dropdown for discovering and pulling remote models instead.
  },
  setActiveFilter: (f) => set({ activeFilter: f }),
  toggleExpanded: (id) =>
    set((s) => ({ expandedModelId: s.expandedModelId === id ? null : id })),

  fetchOllamaModels: async () => {
    set({ loading: true });
    try {
      const models = await api.getOllamaModels();
      console.log(`[MODEL STORE] ✓ Fetched ${models.length} Ollama models`);
      const hubModels: HubModel[] = models.map((m) => ({
        id: m.id,
        name: m.name,
        params: `${m.size_gb < 5 ? '3B' : m.size_gb < 10 ? '7B' : m.size_gb < 20 ? '13B' : '70B'}`,
        format: m.quantization ? `GGUF ${m.quantization}` : 'SafeTensors',
        size: `${m.size_gb} GB`,
        status: 'downloaded' as const,
        downloadProgress: 100,
        description: `${m.family} model — ${m.name}`,
      }));
      const downloading = get().hubModels.filter((m) => m.status === 'downloading');
      const downloadingIds = new Set(downloading.map((m) => m.id));
      const merged = [
        ...downloading,
        ...hubModels.filter((m) => !downloadingIds.has(m.id)),
      ];
      set({ hubModels: merged });
    } catch {
      console.warn('[MODEL STORE] ✗ Failed to fetch Ollama models');
    } finally {
      set({ loading: false });
    }
  },

  fetchRegistryModels: async () => {
    try {
      const models = await api.getRegistryModels();
      set({
        fineTunedModels: models.map((model) => ({
          id: model.id,
          jobId: model.job_id,
          name: model.name,
          baseModel: model.base_model,
          method: model.method,
          status: model.status,
          exportFormat: model.export_format,
          exportStatus: model.export_status,
          artifactPath: model.artifact_path,
          ollamaModelName: model.ollama_model_name,
          finalLoss: model.final_loss,
          date: model.exported_at || model.created_at,
        })),
      });
    } catch {
      // Keep the registry empty rather than inventing models.
      set({ fineTunedModels: [] });
    }
  },

  pullModel: (modelName: string) => {
    console.log(`[MODEL STORE] ⬇ Pulling model: ${modelName}`);

    // Parse model name for better display (e.g. "gemma3:12b" → params="12B", name stays)
    const parts = modelName.split(':');
    const baseName = parts[0];
    const tag = parts[1] || 'latest';
    const guessedParams = tag.match(/(\d+\.?\d*)b/i) ? tag.toUpperCase() : tag === 'latest' ? '' : tag;

    set((s) => {
      const existing = s.hubModels.find((m) => m.name === modelName || m.id === modelName);
      if (existing) {
        return {
          hubModels: s.hubModels.map((m) =>
            m.name === modelName || m.id === modelName
              ? { ...m, status: 'downloading' as const, downloadProgress: 0, description: 'Starting download...' }
              : m,
          ),
        };
      }
      return {
        hubModels: [
          ...s.hubModels,
          {
            id: modelName,
            name: modelName,
            params: guessedParams || baseName,
            format: 'GGUF',
            size: 'downloading...',
            status: 'downloading' as const,
            downloadProgress: 0,
            description: 'Starting download...',
          },
        ],
      };
    });

    const controller = new AbortController();
    // Store the controller so we can cancel
    activePullControllers.set(modelName, controller);

    fetch(`${API_BASE}/api/models/pull/${encodeURIComponent(modelName)}`, {
      method: 'POST',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          console.error(`[MODEL STORE] ✗ Pull failed: ${res.status}`);
          set((s) => ({
            hubModels: s.hubModels.map((m) =>
              m.name === modelName || m.id === modelName
                ? { ...m, status: 'available' as const, description: `Pull failed (${res.status})` }
                : m,
            ),
          }));
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
                const progress = data.progress || 0;
                const status = data.status || '';

                // Build a human-readable size string from total bytes
                const totalBytes = data.total || 0;
                const completedBytes = data.completed || 0;
                const sizeStr = totalBytes > 0
                  ? `${(completedBytes / 1e9).toFixed(1)} / ${(totalBytes / 1e9).toFixed(1)} GB`
                  : '';

                set((s) => ({
                  hubModels: s.hubModels.map((m) =>
                    m.name === modelName || m.id === modelName
                      ? {
                          ...m,
                          downloadProgress: progress,
                          description: status,
                          size: sizeStr || m.size,
                        }
                      : m,
                  ),
                }));

                if (status === 'success') {
                  console.log(`[MODEL STORE] ✓ Pull complete: ${modelName}`);
                  activePullControllers.delete(modelName);
                  setTimeout(() => get().fetchOllamaModels(), 500);
                }
              } catch {
                // skip malformed SSE lines
              }
            }
          }
        }
      })
      .catch((err) => {
        activePullControllers.delete(modelName);
        if (err.name === 'AbortError') {
          console.log(`[MODEL STORE] ⏹ Pull cancelled: ${modelName}`);
          set((s) => ({
            hubModels: s.hubModels.filter((m) => m.name !== modelName && m.id !== modelName),
          }));
          // Refresh the model list
          setTimeout(() => get().fetchOllamaModels(), 300);
        } else {
          console.error('[MODEL STORE] ✗ Pull error:', err);
          set((s) => ({
            hubModels: s.hubModels.map((m) =>
              m.name === modelName || m.id === modelName
                ? { ...m, status: 'available' as const, description: 'Pull failed — backend offline?' }
                : m,
            ),
          }));
        }
      });
  },

  cancelPull: (modelName: string) => {
    const controller = activePullControllers.get(modelName);
    if (controller) {
      console.log(`[MODEL STORE] ⏹ Cancelling pull: ${modelName}`);
      controller.abort();
      activePullControllers.delete(modelName);
    }
    // Also tell the backend to cancel the Ollama pull
    fetch(`${API_BASE}/api/models/pull/cancel/${encodeURIComponent(modelName)}`, {
      method: 'POST',
    }).catch(() => { /* ignore — best effort */ });
  },

  deleteModel: async (modelName: string) => {
    console.log(`[MODEL STORE] Deleting model: ${modelName}`);
    try {
      const res = await fetch(
        `${API_BASE}/api/models/${encodeURIComponent(modelName)}`,
        { method: 'DELETE' },
      );
      if (res.ok) {
        console.log(`[MODEL STORE] ✓ Deleted: ${modelName}`);
        set((s) => ({
          hubModels: s.hubModels.filter(
            (m) => m.name !== modelName && m.id !== modelName,
          ),
        }));
        setTimeout(() => get().fetchOllamaModels(), 300);
      } else {
        console.error(`[MODEL STORE] Delete failed: ${res.status}`);
      }
    } catch (err) {
      console.error('[MODEL STORE] Delete error:', err);
    }
  },

  searchOllamaLibrary: (q: string) => {
    set({ ollamaSearchQuery: q });
    if (q.length < 2) {
      set({ ollamaSearchResults: [], ollamaSearchLoading: false });
      return;
    }
    set({ ollamaSearchLoading: true });
    clearTimeout(ollamaSearchTimeout);
    ollamaSearchTimeout = setTimeout(() => {
      console.log('[MODEL STORE] 🔍 Searching Ollama library for:', q);
      api.searchOllamaLibrary(q, 15)
        .then((results) => {
          // Filter out models already downloaded
          const installed = new Set(get().hubModels.filter(m => m.status === 'downloaded').map(m => m.name.split(':')[0]));
          const enriched = results.map(r => ({
            ...r,
            isInstalled: installed.has(r.name),
          }));
          console.log(`[MODEL STORE] ✓ Ollama library: ${results.length} results, ${enriched.filter(r => r.isInstalled).length} already installed`);
          set({ ollamaSearchResults: results, ollamaSearchLoading: false });
        })
        .catch((err) => {
          console.warn('[MODEL STORE] ✗ Ollama library search failed:', err.message);
          set({ ollamaSearchResults: [], ollamaSearchLoading: false });
        });
    }, 300);
  },

  clearOllamaSearch: () => {
    set({ ollamaSearchResults: [], ollamaSearchQuery: '', ollamaSearchLoading: false });
  },

  getFilteredModels: () => {
    const { hubModels, searchQuery, activeFilter } = get();
    let filtered = hubModels;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) => m.name.toLowerCase().includes(q) || m.params.toLowerCase().includes(q),
      );
    }

    if (activeFilter !== 'all') {
      const sizeNum = (p: string) => parseFloat(p.replace('B', ''));
      switch (activeFilter) {
        case '<3b':
          filtered = filtered.filter((m) => sizeNum(m.params) < 3);
          break;
        case '3b-7b':
          filtered = filtered.filter((m) => sizeNum(m.params) >= 3 && sizeNum(m.params) <= 7);
          break;
        case '7b-13b':
          filtered = filtered.filter((m) => sizeNum(m.params) > 7 && sizeNum(m.params) <= 13);
          break;
        case '13b+':
          filtered = filtered.filter((m) => sizeNum(m.params) > 13);
          break;
        case 'gguf':
          filtered = filtered.filter((m) => m.format.includes('GGUF'));
          break;
        case 'safetensors':
          filtered = filtered.filter((m) => m.format.includes('SafeTensors'));
          break;
        case 'downloaded':
          filtered = filtered.filter((m) => m.status === 'downloaded');
          break;
      }
    }

    return filtered;
  },
}));


interface ChatStore {
  messages: ChatMessage[];
  chatConfig: ChatConfig;
  isGenerating: boolean;
  activeStream: EventSource | null;

  addMessage: (msg: ChatMessage) => void;
  setChatConfig: (patch: Partial<ChatConfig>) => void;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  chatConfig: {
    modelId: 'llama3.2:3b',
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 2048,
    systemPrompt: 'You are a helpful assistant.',
  },
  isGenerating: false,
  activeStream: null,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  setChatConfig: (patch) =>
    set((s) => ({ chatConfig: { ...s.chatConfig, ...patch } })),

  sendMessage: (content) => {
    const state = get();
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
    };
    set((s) => ({
      messages: [...s.messages, userMsg],
      isGenerating: true,
    }));

    console.log('[CHAT] Sending message:', content.slice(0, 50));

    const apiMessages = [...state.messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let responseText = '';
    const assistantMsgId = `msg-${Date.now()}-a`;

    const es = api.streamChat(
      state.chatConfig.modelId,
      apiMessages,
      state.chatConfig.temperature,
      (token, done) => {
        responseText += token;
        set((s) => {
          const msgs = [...s.messages];
          const existing = msgs.findIndex((m) => m.id === assistantMsgId);
          if (existing >= 0) {
            msgs[existing] = { ...msgs[existing], content: responseText };
          } else {
            msgs.push({ id: assistantMsgId, role: 'assistant', content: responseText });
          }
          return { messages: msgs, isGenerating: !done };
        });
        if (done) {
          console.log('[CHAT] ✓ Response complete');
          set({ activeStream: null });
        }
      },
      (err) => {
        console.warn('[CHAT] ✗ Stream failed:', err);
        set((s) => {
          const msgs = [...s.messages];
          const existing = msgs.findIndex((m) => m.id === assistantMsgId);
          if (existing >= 0) {
            msgs[existing] = { ...msgs[existing], content: `*Error:* ${err}` };
          } else {
            msgs.push({ id: assistantMsgId, role: 'assistant', content: `*Error:* ${err}` });
          }
          return { messages: msgs, isGenerating: false, activeStream: null };
        });
      },
    );

    set({ activeStream: es });
  },

  clearMessages: () => {
    const state = get();
    if (state.activeStream) state.activeStream.close();
    set({ messages: [], activeStream: null, isGenerating: false });
  },
}));
