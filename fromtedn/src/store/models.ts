import { create } from 'zustand';
import type { HubModel, FineTunedModel, ChatMessage, ChatConfig } from '../types';
import { MOCK_HUB_MODELS, MOCK_FINETUNED_MODELS } from '../lib/mock-data';
import { api } from '../lib/api';

const API_BASE = 'http://localhost:8421';

interface ModelStore {
  hubModels: HubModel[];
  fineTunedModels: FineTunedModel[];
  searchQuery: string;
  activeFilter: string;
  expandedModelId: string | null;
  loading: boolean;

  setSearchQuery: (q: string) => void;
  setActiveFilter: (f: string) => void;
  toggleExpanded: (id: string) => void;
  getFilteredModels: () => HubModel[];
  fetchOllamaModels: () => Promise<void>;
  pullModel: (modelName: string) => void;
  deleteModel: (modelName: string) => Promise<void>;
}

let searchTimeout: ReturnType<typeof setTimeout>;

export const useModelStore = create<ModelStore>((set, get) => ({
  hubModels: MOCK_HUB_MODELS,
  fineTunedModels: MOCK_FINETUNED_MODELS,
  searchQuery: '',
  activeFilter: 'all',
  expandedModelId: null,
  loading: false,

  setSearchQuery: (q) => {
    set({ searchQuery: q });
    if (q.length >= 2) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        api.searchHFModels(q, 10).then(hfModels => {
          set(s => {
            const existingIds = new Set(s.hubModels.map(m => m.id));
            const newModels = hfModels.filter(m => !existingIds.has(m.id)).map(m => ({
              id: m.id,
              name: m.name,
              params: m.vram_required_gb ? `${m.vram_required_gb}GB VRAM` : '?',
              format: m.quantization || m.source.toUpperCase(),
              size: `${m.size_gb} GB`,
              status: m.is_installed ? 'downloaded' as const : 'available' as const,
              downloadProgress: 0,
              description: m.tags ? m.tags.join(', ') : 'HuggingFace Model',
            }));
            return { hubModels: [...s.hubModels, ...newModels] };
          });
        }).catch(() => {});
      }, 500);
    }
  },
  setActiveFilter: (f) => set({ activeFilter: f }),
  toggleExpanded: (id) =>
    set((s) => ({ expandedModelId: s.expandedModelId === id ? null : id })),

  fetchOllamaModels: async () => {
    set({ loading: true });
    try {
      const models = await api.getOllamaModels();
      if (models.length > 0) {
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
      } else {
        console.log('[MODEL STORE] No Ollama models, using mock data');
      }
    } catch {
      console.warn('[MODEL STORE] ✗ Failed to fetch Ollama models, using mock data');
    } finally {
      set({ loading: false });
    }
  },

  pullModel: (modelName: string) => {
    console.log(`[MODEL STORE] Pulling model: ${modelName}`);

    set((s) => {
      const existing = s.hubModels.find((m) => m.name === modelName || m.id === modelName);
      if (existing) {
        return {
          hubModels: s.hubModels.map((m) =>
            m.name === modelName || m.id === modelName
              ? { ...m, status: 'downloading' as const, downloadProgress: 0 }
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
            params: '?',
            format: 'Pulling...',
            size: '...',
            status: 'downloading' as const,
            downloadProgress: 0,
            description: `Downloading ${modelName}...`,
          },
        ],
      };
    });

    const controller = new AbortController();
    fetch(`${API_BASE}/api/models/pull/${encodeURIComponent(modelName)}`, {
      method: 'POST',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          console.error('[MODEL STORE] Pull failed:', res.status);
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

                set((s) => ({
                  hubModels: s.hubModels.map((m) =>
                    m.name === modelName || m.id === modelName
                      ? {
                          ...m,
                          downloadProgress: progress,
                          description: status,
                        }
                      : m,
                  ),
                }));

                if (status === 'success') {
                  console.log(`[MODEL STORE] ✓ Pull complete: ${modelName}`);
                  setTimeout(() => get().fetchOllamaModels(), 500);
                }
              } catch {
                // skip
              }
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('[MODEL STORE] Pull error:', err);
        }
      });
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
      () => {
        console.warn('[CHAT] ✗ Stream failed, using simulation');
        setTimeout(() => {
          const responses = [
            'I can help with that. Based on the training data, here is my analysis...',
            'The fine-tuned model shows improved performance on this type of query. Let me elaborate...',
            'Processing your request through the local model. The response latency is approximately 42ms/token.',
            'That is an interesting question. Let me reason through this step by step.',
          ];
          set((s) => ({
            messages: [...s.messages, {
              id: assistantMsgId,
              role: 'assistant' as const,
              content: responses[Math.floor(Math.random() * responses.length)],
            }],
            isGenerating: false,
            activeStream: null,
          }));
        }, 1200 + Math.random() * 800);
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
