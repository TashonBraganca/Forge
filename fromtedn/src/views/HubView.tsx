import { useEffect, useState, useRef } from 'react';
import { Search, Download, Check, Loader, Trash2, X, ChevronDown, Square } from 'lucide-react';
import { useModelStore } from '../store/models';
import { useTrainingStore } from '../store/training';
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
  const cancelPull = useModelStore((s) => s.cancelPull);
  const deleteModel = useModelStore((s) => s.deleteModel);
  const loading = useModelStore((s) => s.loading);
  const backendConnected = useTrainingStore((s) => s.backendConnected);

  // Ollama library search
  const ollamaSearchResults = useModelStore((s) => s.ollamaSearchResults);
  const ollamaSearchLoading = useModelStore((s) => s.ollamaSearchLoading);
  const searchOllamaLibrary = useModelStore((s) => s.searchOllamaLibrary);
  const clearOllamaSearch = useModelStore((s) => s.clearOllamaSearch);
  const hubModels = useModelStore((s) => s.hubModels);

  const [pullInput, setPullInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchOllamaModels();
  }, [fetchOllamaModels]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const models = getFilteredModels();
  const filters = ['all', 'downloaded', '<3b', '3b-7b', '7b-13b', '13b+', 'gguf', 'safetensors'];

  const statusIcon = (s: string) => {
    if (s === 'downloaded') return <Check size={14} />;
    if (s === 'downloading') return <Loader size={14} className="animate-spin" />;
    return <Download size={14} />;
  };
  const statusColor = (s: string) =>
    s === 'downloaded' ? 'text-green-500' : s === 'downloading' ? 'text-[var(--color-forge-orange)]' : 'text-[#555]';

  // Handle top search bar — filters local AND searches Ollama library
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim().length >= 2) {
      searchOllamaLibrary(value.trim());
      setShowSearchDropdown(true);
    } else {
      clearOllamaSearch();
      setShowSearchDropdown(false);
    }
  };

  const handlePullInputChange = (value: string) => {
    setPullInput(value);
    if (value.trim().length >= 2) {
      searchOllamaLibrary(value.trim());
      setShowDropdown(true);
    } else {
      clearOllamaSearch();
      setShowDropdown(false);
    }
  };

  const handleSelectModel = (modelName: string, tag?: string) => {
    const fullName = tag ? `${modelName}:${tag}` : modelName;
    console.log('[HUB] Selected model from dropdown:', fullName);
    setPullInput(fullName);
    setShowDropdown(false);
    setShowSearchDropdown(false);
    clearOllamaSearch();
  };

  const handlePull = () => {
    const name = pullInput.trim();
    if (!name) return;
    const size = ollamaSearchResults.find(r => r.name === name.split(':')[0])?.size || '';
    const sizeInfo = size ? ` (≈${size})` : '';
    if (!confirm(`Download ${name}${sizeInfo}?\n\nThis will pull the model from Ollama's registry.`)) return;
    console.log('[HUB] Pulling model:', name);
    pullModel(name);
    setPullInput('');
    setShowDropdown(false);
    clearOllamaSearch();
  };

  // Check if a model is already installed
  const isModelInstalled = (name: string) => {
    return hubModels.some(m => m.status === 'downloaded' && (m.name.split(':')[0] === name || m.name === name));
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

      {/* ── Search Bar with Live Ollama Library Dropdown ── */}
      <div className="relative mb-4" ref={searchDropdownRef}>
        <div className="flex items-center gap-3 px-4 h-11 rounded-xl forge-card">
          <Search size={14} className="text-[#555] shrink-0" />
          <input
            type="text"
            placeholder="Search installed models or discover new ones..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => { if (searchQuery.trim().length >= 2 && ollamaSearchResults.length > 0) setShowSearchDropdown(true); }}
            onKeyDown={(e) => { if (e.key === 'Escape') setShowSearchDropdown(false); }}
            className="flex-1 font-mono text-[13px] text-[#ccc] bg-transparent outline-none"
          />
          {ollamaSearchLoading && (
            <Loader size={12} className="animate-spin text-[var(--color-forge-orange)] shrink-0" />
          )}
          {searchQuery && (
            <button onClick={() => { handleSearchChange(''); }} className="text-[#555] hover:text-white transition-colors">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Search dropdown results from Ollama library */}
        <AnimatePresence>
          {showSearchDropdown && ollamaSearchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute z-50 left-0 right-0 mt-2 rounded-xl bg-[#0e0e0c] border border-[rgba(255,85,0,0.12)] shadow-[0_8px_40px_rgba(0,0,0,0.6)] overflow-hidden max-h-[360px] overflow-y-auto custom-scrollbar"
            >
              <div className="px-4 py-2 border-b border-[rgba(255,255,255,0.03)]">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#555]">
                  Ollama Library — {ollamaSearchResults.length} available
                </span>
              </div>
              {ollamaSearchResults.map((result, i) => {
                const installed = isModelInstalled(result.name);
                return (
                  <div key={`search-${result.name}-${i}`} className="border-b border-[rgba(255,255,255,0.02)] last:border-b-0">
                    <div className="flex items-center justify-between px-4 py-3 hover:bg-[rgba(255,85,0,0.04)] transition-colors group">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-[13px] font-semibold text-[#eee] group-hover:text-white transition-colors">{result.name}</span>
                          {installed && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.15)]">
                              <Check size={9} className="text-green-500" />
                              <span className="font-mono text-[8px] text-green-500 uppercase tracking-wider">installed</span>
                            </span>
                          )}
                        </div>
                        <span className="font-body text-[11px] text-[#666] leading-snug">{result.description}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-[#555]">{result.size}</span>
                        {!installed && (
                          <button
                            onClick={() => {
                              if (!confirm(`Download ${result.name} (≈${result.size})?`)) return;
                              console.log('[HUB] Quick-pull from search:', result.name);
                              pullModel(result.name);
                              setShowSearchDropdown(false);
                            }}
                            className="p-1.5 rounded bg-[rgba(255,85,0,0.08)] hover:bg-[rgba(255,85,0,0.15)] text-[var(--color-forge-orange)] transition-colors"
                            title={`Pull ${result.name}`}
                          >
                            <Download size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    {result.tags && result.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 px-4 pb-2.5 flex-wrap">
                        {result.tags.slice(0, 8).map((tag) => (
                          <button
                            key={tag}
                            onClick={() => {
                              const fullName = `${result.name}:${tag}`;
                              if (!confirm(`Download ${fullName} (≈${result.size})?`)) return;
                              console.log('[HUB] Pulling variant from search:', fullName);
                              pullModel(fullName);
                              setShowSearchDropdown(false);
                            }}
                            className="px-2 py-0.5 rounded font-mono text-[10px] text-[#888] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.04)] hover:border-[rgba(255,85,0,0.2)] hover:text-[var(--color-forge-amber)] hover:bg-[rgba(255,85,0,0.04)] transition-all cursor-pointer"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Pull Model with Live Search Dropdown ── */}
      <div className="relative mb-6" ref={dropdownRef}>
        <div className="flex items-center gap-3 px-4 h-11 rounded-xl bg-[rgba(255,85,0,0.02)] border border-[rgba(255,85,0,0.08)]">
          <Download size={14} className="text-[var(--color-forge-orange)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search & pull a model... (e.g. llama3.2, mistral, gemma)"
            value={pullInput}
            onChange={(e) => handlePullInputChange(e.target.value)}
            onFocus={() => {
              if (pullInput.trim().length >= 2) setShowDropdown(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handlePull();
              if (e.key === 'Escape') setShowDropdown(false);
            }}
            className="flex-1 font-mono text-[13px] text-[#ccc] bg-transparent outline-none"
          />
          {ollamaSearchLoading && (
            <Loader size={14} className="animate-spin text-[var(--color-forge-orange)] shrink-0" />
          )}
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

        {/* ── Search Results Dropdown ── */}
        <AnimatePresence>
          {showDropdown && ollamaSearchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute z-50 left-0 right-0 mt-2 rounded-xl bg-[#0e0e0c] border border-[rgba(255,85,0,0.12)] shadow-[0_8px_40px_rgba(0,0,0,0.6)] overflow-hidden max-h-[360px] overflow-y-auto custom-scrollbar"
            >
              <div className="px-4 py-2 border-b border-[rgba(255,255,255,0.03)]">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#555]">
                  {ollamaSearchResults.length} model{ollamaSearchResults.length !== 1 ? 's' : ''} found
                </span>
              </div>
              {ollamaSearchResults.map((result, i) => {
                const installed = isModelInstalled(result.name);
                return (
                  <div
                    key={`${result.name}-${i}`}
                    className="border-b border-[rgba(255,255,255,0.02)] last:border-b-0"
                  >
                    {/* Model header */}
                    <div
                      onClick={() => handleSelectModel(result.name)}
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[rgba(255,85,0,0.04)] transition-colors group"
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-[13px] font-semibold text-[#eee] group-hover:text-white transition-colors">
                            {result.name}
                          </span>
                          {installed && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.15)]">
                              <Check size={9} className="text-green-500" />
                              <span className="font-mono text-[8px] text-green-500 uppercase tracking-wider">installed</span>
                            </span>
                          )}
                        </div>
                        <span className="font-body text-[11px] text-[#666] leading-snug">
                          {result.description}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-[#555]">{result.size}</span>
                        <ChevronDown size={12} className="text-[#444]" />
                      </div>
                    </div>

                    {/* Tags (size variants) */}
                    {result.tags && result.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 px-4 pb-2.5 flex-wrap">
                        {result.tags.slice(0, 8).map((tag) => (
                          <button
                            key={tag}
                            onClick={() => handleSelectModel(result.name, tag)}
                            className="px-2 py-0.5 rounded font-mono text-[10px] text-[#888] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.04)] hover:border-[rgba(255,85,0,0.2)] hover:text-[var(--color-forge-amber)] hover:bg-[rgba(255,85,0,0.04)] transition-all cursor-pointer"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
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
            {searchQuery
              ? `No models matching "${searchQuery}"`
              : backendConnected
                ? 'No Ollama models found yet. Pull one above or wait for the list to refresh.'
                : 'Backend offline. Start Forge to load Ollama models.'}
          </div>
        )}
        {models.map((model, i) => {
          const isExpanded = expandedModelId === model.id;
          const isDownloading = model.status === 'downloading';
          return (
            <motion.div
              key={model.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <div
                onClick={() => toggleExpanded(model.id)}
                className={`relative px-5 py-4 rounded-xl cursor-pointer transition-all border ${
                  isExpanded ? 'bg-[rgba(255,85,0,0.04)] border-[rgba(255,85,0,0.15)]' : 'forge-card hover:border-[rgba(255,85,0,0.15)]'
                }`}
              >
                {/* Download progress bar overlay */}
                {isDownloading && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-[rgba(255,255,255,0.04)] rounded-b-xl overflow-hidden">
                    <motion.div
                      animate={{ width: `${model.downloadProgress || 0}%` }}
                      transition={{ duration: 0.3 }}
                      className="h-full bg-gradient-to-r from-[var(--color-forge-ember)] to-[var(--color-forge-amber)] shadow-[0_0_6px_rgba(255,85,0,0.4)]"
                    />
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <span className="flex-1 font-display text-[14px] font-semibold text-[#eee]">{model.name}</span>
                  <span className="font-display text-[13px] font-bold text-[#777] w-16 text-center">{model.params}</span>
                  <span className="font-mono text-[11px] text-[#555] w-24 hidden md:block">{model.format}</span>
                  <span className="font-mono text-[11px] text-[#666] w-20 text-right hidden sm:block">{model.size}</span>
                  <div className="flex items-center gap-2 w-36 justify-end">
                    {isDownloading ? (
                      <>
                        <span className="font-mono text-[11px] font-bold text-[var(--color-forge-orange)]">
                          {model.downloadProgress}%
                        </span>
                        <Loader size={14} className="animate-spin text-[var(--color-forge-orange)]" />
                        <button
                          onClick={(e) => { e.stopPropagation(); cancelPull(model.name); }}
                          className="p-1 rounded hover:bg-[rgba(239,68,68,0.1)] text-[#666] hover:text-red-500 transition-colors"
                          title="Cancel download"
                        >
                          <Square size={12} />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className={statusColor(model.status)}>{statusIcon(model.status)}</div>
                        <span className={`font-mono text-[10px] tracking-wide ${statusColor(model.status)}`}>
                          {model.status.toUpperCase()}
                        </span>
                      </>
                    )}
                  </div>
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

                      {isDownloading && (
                        <div className="mb-5">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-[11px] text-[var(--color-forge-orange)] font-bold">{model.downloadProgress}%</span>
                            <span className="font-mono text-[10px] text-[#666]">{model.size}</span>
                          </div>
                          <div className="h-2 rounded-full bg-[rgba(255,255,255,0.04)] overflow-hidden">
                            <motion.div
                              animate={{ width: `${model.downloadProgress || 0}%` }}
                              transition={{ duration: 0.4 }}
                              className="h-full rounded-full bg-gradient-to-r from-[var(--color-forge-ember)] to-[var(--color-forge-amber)] shadow-[0_0_8px_rgba(255,85,0,0.5)]"
                            />
                          </div>
                          <p className="font-mono text-[10px] text-[#666] mt-2">{model.description}</p>
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
                        {isDownloading && (
                          <button
                            onClick={(e) => { e.stopPropagation(); cancelPull(model.name); }}
                            className="flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.15)] text-red-500 font-display text-[12px] font-bold tracking-[0.05em] transition-all hover:bg-[rgba(239,68,68,0.1)]"
                          >
                            <Square size={14} />
                            CANCEL
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
