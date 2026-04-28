import { useEffect, useState } from 'react';
import { Search, Download, Check, Loader, Trash2, X } from 'lucide-react';
import { useModelStore } from '../store/models';
import { motion, AnimatePresence } from 'framer-motion';

export default function HubView() {
  const searchQuery = useModelStore((s) => s.searchQuery);
  const setSearchQuery = useModelStore((s) => s.setSearchQuery);
  const activeFilter = useModelStore((s) => s.activeFilter);
  const setActiveFilter = useModelStore((s) => s.setActiveFilter);
  const expandedModelId = useModelStore((s) => s.expandedModelId);
  const toggleExpanded = useModelStore((s) => s.toggleExpanded);
  const getFilteredModels = useModelStore((s) => s.getFilteredModels);
  const fetchOllamaModels = useModelStore((s) => s.fetchOllamaModels);
  const pullModel = useModelStore((s) => s.pullModel);
  const deleteModel = useModelStore((s) => s.deleteModel);
  const loading = useModelStore((s) => s.loading);

  const [pullInput, setPullInput] = useState('');

  useEffect(() => {
    fetchOllamaModels();
  }, [fetchOllamaModels]);

  const models = getFilteredModels();
  const filters = ['all', 'downloaded', '<3b', '3b-7b', '7b-13b', '13b+', 'gguf', 'safetensors'];

  const statusIcon = (s: string) => {
    if (s === 'downloaded') return <Check size={14} />;
    if (s === 'downloading') return <Loader size={14} className="animate-spin" />;
    return <Download size={14} />;
  };
  const statusColor = (s: string) =>
    s === 'downloaded' ? 'text-green-500' : s === 'downloading' ? 'text-[var(--color-forge-orange)]' : 'text-[#555]';

  const handlePull = () => {
    const name = pullInput.trim();
    if (!name) return;
    pullModel(name);
    setPullInput('');
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-2xl font-bold text-white">Model Hub</h1>
        {loading && (
          <div className="flex items-center gap-2">
            <Loader size={12} className="animate-spin text-[var(--color-forge-orange)]" />
            <span className="font-mono text-[10px] text-[#555]">Syncing with Ollama...</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 px-4 h-11 rounded-xl forge-card mb-4">
        <Search size={14} className="text-[#555] shrink-0" />
        <input
          type="text"
          placeholder="Search models..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 font-mono text-[13px] text-[#ccc] bg-transparent outline-none"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="text-[#555] hover:text-white transition-colors">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 px-4 h-11 rounded-xl bg-[rgba(255,85,0,0.02)] border border-[rgba(255,85,0,0.08)] mb-6">
        <Download size={14} className="text-[var(--color-forge-orange)] shrink-0" />
        <input
          type="text"
          placeholder="Pull a model... (e.g. llama3.2:3b, mistral:7b)"
          value={pullInput}
          onChange={(e) => setPullInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handlePull();
          }}
          className="flex-1 font-mono text-[13px] text-[#ccc] bg-transparent outline-none"
        />
        <button
          onClick={handlePull}
          disabled={!pullInput.trim()}
          className={`px-4 py-1.5 rounded-lg transition-all font-display text-[11px] font-bold tracking-[0.05em] ${
            pullInput.trim() ? 'bg-gradient-to-br from-[var(--color-forge-ember)] to-[var(--color-forge-orange)] text-black cursor-pointer shadow-[0_0_10px_rgba(255,85,0,0.2)]' : 'bg-[rgba(255,255,255,0.03)] text-[#444] cursor-not-allowed'
          }`}
        >
          PULL
        </button>
      </div>

      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`font-display text-[10px] tracking-widest uppercase px-4 py-1.5 rounded-lg shrink-0 transition-all ${
              activeFilter === f ? 'bg-[rgba(255,85,0,0.08)] border border-[rgba(255,85,0,0.2)] text-[var(--color-forge-orange)] font-bold' : 'border border-[rgba(255,255,255,0.04)] text-[#666] hover:text-[#aaa]'
            }`}
          >
            {f === 'all' ? 'ALL' : f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {models.length === 0 && (
          <div className="text-center py-16 font-mono text-[13px] text-[#555]">
            {searchQuery ? `No models matching "${searchQuery}"` : 'No models found. Pull a model above.'}
          </div>
        )}
        {models.map((model, i) => {
          const isExpanded = expandedModelId === model.id;
          return (
            <motion.div
              key={model.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <div
                onClick={() => toggleExpanded(model.id)}
                className={`flex items-center gap-4 px-5 py-4 rounded-xl cursor-pointer transition-all border ${
                  isExpanded ? 'bg-[rgba(255,85,0,0.04)] border-[rgba(255,85,0,0.15)]' : 'forge-card hover:border-[rgba(255,85,0,0.15)]'
                }`}
              >
                <span className="flex-1 font-display text-[14px] font-semibold text-[#eee]">{model.name}</span>
                <span className="font-display text-[13px] font-bold text-[#777] w-16 text-center">{model.params}</span>
                <span className="font-mono text-[11px] text-[#555] w-24 hidden md:block">{model.format}</span>
                <span className="font-mono text-[11px] text-[#666] w-16 text-right hidden sm:block">{model.size}</span>
                <div className="flex items-center gap-2 w-32 justify-end">
                  <div className={statusColor(model.status)}>{statusIcon(model.status)}</div>
                  <span className={`font-mono text-[10px] tracking-wide ${statusColor(model.status)}`}>
                    {model.status === 'downloading' ? `${model.downloadProgress}%` : model.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="p-5 mt-2 rounded-xl bg-[rgba(10,10,8,0.6)] border border-[rgba(255,255,255,0.03)]">
                      <p className="font-body text-[13px] text-[#aaa] leading-relaxed mb-5">{model.description}</p>

                      {model.status === 'downloading' && (
                        <div className="mb-5">
                          <div className="h-1 rounded bg-[rgba(255,255,255,0.04)] overflow-hidden">
                            <motion.div
                              animate={{ width: `${model.downloadProgress || 0}%` }}
                              transition={{ duration: 0.4 }}
                              className="h-full rounded bg-gradient-to-r from-[var(--color-forge-ember)] to-[var(--color-forge-amber)] shadow-[0_0_8px_rgba(255,85,0,0.5)]"
                            />
                          </div>
                          <p className="font-mono text-[10px] text-[var(--color-forge-orange)] mt-2">
                            {model.downloadProgress}% — {model.description}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        {model.status === 'available' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); pullModel(model.name); }}
                            className="h-10 px-5 rounded-lg bg-gradient-to-br from-[var(--color-forge-ember)] to-[var(--color-forge-orange)] text-black font-display text-[12px] font-bold tracking-[0.1em] transition-all active:scale-[0.98] shadow-[0_0_15px_rgba(255,85,0,0.2)]"
                          >
                            DOWNLOAD
                          </button>
                        )}
                        {model.status === 'downloaded' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete ${model.name}? This cannot be undone.`)) {
                                deleteModel(model.name);
                              }
                            }}
                            className="flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.15)] text-red-500 font-display text-[12px] font-bold tracking-[0.05em] transition-all hover:bg-[rgba(239,68,68,0.1)]"
                          >
                            <Trash2 size={14} />
                            DELETE
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
