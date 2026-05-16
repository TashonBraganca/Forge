import { useMemo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTrainingStore } from '../store/training';
import { useModelStore } from '../store/models';
import { api } from '../lib/api';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Cpu, HardDrive, Zap, Flame, Download, Loader2, Info, Square } from 'lucide-react';

/* ─── Inline Loss Curve with Axes ────────────────────────── */
function LossCurve({ data }: { data: number[] }) {
  const PADDING_LEFT = 52, PADDING_BOTTOM = 22, PADDING_TOP = 12, PADDING_RIGHT = 8;
  const TOTAL_W = 740, TOTAL_H = 210;
  const W = TOTAL_W - PADDING_LEFT - PADDING_RIGHT;
  const H = TOTAL_H - PADDING_TOP - PADDING_BOTTOM;
  const pathRef = useRef<SVGPathElement>(null);
  const drawn = useRef(false);

  const { maxV, minV } = useMemo(() => {
    if (data.length < 1) return { maxV: 3.0, minV: 0 };
    return { maxV: Math.max(...data) * 1.05, minV: Math.max(0, Math.min(...data) * 0.9) };
  }, [data]);

  const linePath = useMemo(() => {
    if (data.length < 2) return '';
    const range = maxV - minV || 1;
    const pts = data.map((v, i) => ({
      x: PADDING_LEFT + (i / (data.length - 1)) * W,
      y: PADDING_TOP + (1 - (v - minV) / range) * H,
    }));
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const cx = (pts[i - 1].x + pts[i].x) / 2;
      d += ` C ${cx},${pts[i - 1].y} ${cx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
    }
    return d;
  }, [data, maxV, minV]);

  const fillPath = linePath ? `${linePath} L ${PADDING_LEFT + W},${PADDING_TOP + H} L ${PADDING_LEFT},${PADDING_TOP + H} Z` : '';

  useEffect(() => {
    if (pathRef.current && !drawn.current && data.length > 1) {
      drawn.current = true;
      const el = pathRef.current;
      const len = el.getTotalLength();
      el.style.strokeDasharray = `${len}`;
      el.style.strokeDashoffset = `${len}`;
      el.style.animation = 'draw-path 2s cubic-bezier(0.16,1,0.3,1) forwards';
    }
  }, [data]);

  const [embers] = useState(() =>
    Array.from({ length: 6 }, (_, i) => ({
      id: i, cx: PADDING_LEFT + 20 + Math.random() * (W - 40), cy: PADDING_TOP + 10 + Math.random() * (H - 20),
      r: 0.5 + Math.random() * 0.6, dur: 2.5 + Math.random() * 3, del: Math.random() * 4,
    }))
  );

  // Y-axis ticks (loss values)
  const yTicks = useMemo(() => {
    const range = maxV - minV || 1;
    return [0, 0.25, 0.5, 0.75, 1.0].map((p) => ({
      value: maxV - p * range,
      y: PADDING_TOP + p * H,
    }));
  }, [maxV, minV]);

  // X-axis ticks (step indices)
  const xTicks = useMemo(() => {
    if (data.length < 2) return [];
    const count = Math.min(6, data.length);
    return Array.from({ length: count }, (_, i) => {
      const idx = Math.round((i / (count - 1)) * (data.length - 1));
      return {
        label: String(idx),
        x: PADDING_LEFT + (idx / (data.length - 1)) * W,
      };
    });
  }, [data]);

  return (
    <div className="relative overflow-hidden w-full h-[210px] bg-[rgba(10,10,8,0.6)] rounded-xl border border-[rgba(255,85,0,0.08)]">
      <svg viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`} className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="cs" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#CC3300" /><stop offset="50%" stopColor="#FF5500" /><stop offset="100%" stopColor="#FF8C00" />
          </linearGradient>
          <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,85,0,0.2)" /><stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {yTicks.map((t, i) => <line key={`grid-${i}`} x1={PADDING_LEFT} y1={t.y} x2={PADDING_LEFT + W} y2={t.y} stroke="rgba(255,85,0,0.06)" strokeWidth="0.5" />)}
        {/* Y-axis labels */}
        {yTicks.map((t, i) => (
          <text key={`y-${i}`} x={PADDING_LEFT - 6} y={t.y + 1} textAnchor="end" fill="#555" fontSize="8" fontFamily="monospace" dominantBaseline="middle">
            {t.value.toFixed(2)}
          </text>
        ))}
        {/* Y-axis label */}
        <text x="8" y={PADDING_TOP + H / 2} fill="#444" fontSize="7" fontFamily="monospace" textAnchor="middle" dominantBaseline="middle" transform={`rotate(-90, 8, ${PADDING_TOP + H / 2})`}>
          LOSS
        </text>
        {/* X-axis labels */}
        {xTicks.map((t, i) => (
          <text key={`x-${i}`} x={t.x} y={PADDING_TOP + H + 14} textAnchor="middle" fill="#555" fontSize="7" fontFamily="monospace">
            {t.label}
          </text>
        ))}
        {/* X-axis label */}
        <text x={PADDING_LEFT + W / 2} y={TOTAL_H - 2} fill="#444" fontSize="7" fontFamily="monospace" textAnchor="middle">
          STEP
        </text>
        {/* Axis lines */}
        <line x1={PADDING_LEFT} y1={PADDING_TOP} x2={PADDING_LEFT} y2={PADDING_TOP + H} stroke="rgba(255,85,0,0.1)" strokeWidth="0.5" />
        <line x1={PADDING_LEFT} y1={PADDING_TOP + H} x2={PADDING_LEFT + W} y2={PADDING_TOP + H} stroke="rgba(255,85,0,0.1)" strokeWidth="0.5" />
        {/* Chart content */}
        {fillPath && <path d={fillPath} fill="url(#cf)" opacity={data.length > 2 ? 1 : 0} style={{ transition: 'opacity 1s' }} />}
        {linePath && <path ref={pathRef} d={linePath} fill="none" stroke="url(#cs)" strokeWidth="2" strokeLinecap="round" className="glow-forge" />}
        {embers.map((e) => <circle key={e.id} cx={e.cx} cy={e.cy} r={e.r} fill="#FF5500" style={{ animation: `ember-glow ${e.dur}s ease-in-out infinite`, animationDelay: `${e.del}s` }} />)}
      </svg>
    </div>
  );
}

/* ─── Hardware Meter ───────────────────────────────────── */
function Meter({ label, value, color, detail }: { label: string; value: number; color: string; detail?: string }) {
  return (
    <div className="mb-4">
      <div className="flex justify-between mb-1.5 font-mono text-[11px] uppercase tracking-widest text-[#888]">
        <span>{label}</span>
        <div className="flex items-center gap-2">
          {detail && <span className="text-[#666] normal-case tracking-normal text-[10px]">{detail}</span>}
          <span className="text-[#ccc]">{value}%</span>
        </div>
      </div>
      <div className="h-1 bg-[rgba(255,255,255,0.04)] rounded overflow-hidden">
        <motion.div
          className="h-full rounded"
          style={{ background: color, boxShadow: `0 0 8px ${color}40` }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
    </div>
  );
}

/* ═══ MAIN VIEW ═══════════════════════════════════════════ */
export default function TrainView() {
  const status = useTrainingStore((s) => s.status);
  const selectedModel = useTrainingStore((s) => s.selectedModel);
  const config = useTrainingStore((s) => s.config);
  const progress = useTrainingStore((s) => s.progress);
  const currentLoss = useTrainingStore((s) => s.currentLoss);
  const lossHistory = useTrainingStore((s) => s.lossHistory);
  const currentEpoch = useTrainingStore((s) => s.currentEpoch);
  const totalEpochs = useTrainingStore((s) => s.totalEpochs);
  const gpuTemp = useTrainingStore((s) => s.gpuTemp);
  const gpuUtil = useTrainingStore((s) => s.gpuUtil);
  const vramUtil = useTrainingStore((s) => s.vramUtil);
  const cpuUtil = useTrainingStore((s) => s.cpuUtil);
  const ramUtil = useTrainingStore((s) => s.ramUtil);
  const logs = useTrainingStore((s) => s.logs);
  const startTraining = useTrainingStore((s) => s.startTraining);
  const stopTraining = useTrainingStore((s) => s.stopTraining);
  const resetTraining = useTrainingStore((s) => s.resetTraining);
  const setSelectedModel = useTrainingStore((s) => s.setSelectedModel);
  const updateConfig = useTrainingStore((s) => s.updateConfig);
  const exportModel = useTrainingStore((s) => s.exportModel);
  const exportStatus = useTrainingStore((s) => s.exportStatus);
  const exportProgress = useTrainingStore((s) => s.exportProgress);
  const exportModelName = useTrainingStore((s) => s.exportModelName);
  const hubModels = useModelStore((s) => s.hubModels);
  const fetchOllamaModels = useModelStore((s) => s.fetchOllamaModels);
  const pullModel = useModelStore((s) => s.pullModel);
  const ollamaSearchResults = useModelStore((s) => s.ollamaSearchResults);
  const ollamaSearchLoading = useModelStore((s) => s.ollamaSearchLoading);
  const searchOllamaLibrary = useModelStore((s) => s.searchOllamaLibrary);
  const clearOllamaSearch = useModelStore((s) => s.clearOllamaSearch);
  const cancelPull = useModelStore((s) => s.cancelPull);

  const isIdle = status === 'idle';
  const isActive = status === 'training' || status === 'preparing';
  const isComplete = status === 'completed';
  const isFailed = status === 'failed';
  const logRef = useRef<HTMLDivElement>(null);
  const hwStats = useTrainingStore((s) => s.hwStats);
  const backendConnected = useTrainingStore((s) => s.backendConnected);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const [datasetStatus, setDatasetStatus] = useState('');
  const [customExportName, setCustomExportName] = useState('');

  // Update export name when model changes
  useEffect(() => {
    if (selectedModel) {
      setCustomExportName(`forge-${selectedModel.split(':')[0]}`);
    }
  }, [selectedModel]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Trigger Ollama library search when typing
  const handleModelSearch = (query: string) => {
    setModelSearchQuery(query);
    if (query.trim().length >= 2) {
      searchOllamaLibrary(query.trim());
      setShowModelDropdown(true);
    } else {
      clearOllamaSearch();
      setShowModelDropdown(false);
    }
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    fetchOllamaModels();
  }, [fetchOllamaModels]);

  return (
    <Tooltip.Provider delayDuration={200}>
      <div className="w-full max-w-5xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
        {/* ═══════ IDLE STATE ═══════ */}
        {isIdle && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="flex flex-col items-center text-center mb-12 relative">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10">
                <div className="w-64 h-64 bg-[var(--color-forge-orange)] rounded-full blur-[100px] opacity-10"></div>
              </div>
              
              <div className="mb-6 p-4 rounded-2xl bg-[rgba(255,85,0,0.05)] border border-[rgba(255,85,0,0.1)] inline-flex items-center justify-center glow-forge">
                <Flame size={32} className="text-[var(--color-forge-orange)]" />
              </div>
              
              <motion.h1
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="font-display text-5xl md:text-6xl font-extrabold tracking-tight mb-4 text-gradient-molten"
              >
                FORGE YOUR MODEL
              </motion.h1>
              <p className="font-body text-[#888] text-lg max-w-lg mx-auto mb-6">
                Fine-tune any open-source LLM locally on your hardware.
              </p>
              
              {/* System info chips */}
              {backendConnected && hwStats && (
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  {hwStats.gpu_name && (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[rgba(255,85,0,0.06)] border border-[rgba(255,85,0,0.1)]">
                      <Zap size={11} className="text-[var(--color-forge-amber)]" />
                      <span className="font-mono text-[11px] text-[var(--color-forge-amber)]">{hwStats.gpu_name}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)]">
                    <Cpu size={11} className="text-[#888]" />
                    <span className="font-mono text-[11px] text-[#888]">{hwStats.cpu_name} | {hwStats.cpu_cores} CORES</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)]">
                    <Cpu size={11} className="text-[#888]" />
                    <span className="font-mono text-[11px] text-[#888]">{Math.round(hwStats.ram_total_gb)}GB RAM ({hwStats.ram_free_gb}GB AVAILABLE)</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)]">
                    <HardDrive size={11} className="text-[#888]" />
                    <span className="font-mono text-[11px] text-[#888]">{hwStats.disk_free_gb}GB DISK FREE</span>
                  </div>
                  <div className={`px-3 py-1 rounded-md ${hwStats.llamafactory_available ? 'bg-[rgba(34,197,94,0.06)] border-[rgba(34,197,94,0.15)]' : 'bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.04)]'} border`}>
                    <span className={`font-mono text-[10px] ${hwStats.llamafactory_available ? 'text-green-500' : 'text-[#555]'}`}>
                      {hwStats.llamafactory_available ? '✓ LLaMA-Factory' : '◌ simulation mode'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Left — Model Picker */}
              <div className="forge-card p-6 overflow-hidden relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-[rgba(255,85,0,0.03)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                <h2 className="font-display text-[#888] text-sm uppercase tracking-widest mb-6 font-semibold">Select Model</h2>
                
                {/* Search Input with Dropdown */}
                <div className="relative mb-4" ref={modelDropdownRef}>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input
                      type="text"
                      placeholder="Search installed or discover new models..."
                      value={modelSearchQuery}
                      onChange={(e) => handleModelSearch(e.target.value)}
                      onFocus={() => { if (modelSearchQuery.trim().length >= 2) setShowModelDropdown(true); }}
                      onKeyDown={(e) => { if (e.key === 'Escape') setShowModelDropdown(false); }}
                      className="font-mono text-xs text-[#ccc] bg-transparent border-none outline-none w-full"
                    />
                    {ollamaSearchLoading && (
                      <Loader2 size={12} className="animate-spin text-[var(--color-forge-orange)] shrink-0" />
                    )}
                    {modelSearchQuery && (
                      <button onClick={() => { handleModelSearch(''); }} className="text-[#555] hover:text-white transition-colors shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    )}
                  </div>

                  {/* Ollama Library Search Dropdown */}
                  <AnimatePresence>
                    {showModelDropdown && ollamaSearchResults.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute z-50 left-0 right-0 mt-1 rounded-lg bg-[#0e0e0c] border border-[rgba(255,85,0,0.12)] shadow-[0_8px_40px_rgba(0,0,0,0.6)] overflow-hidden max-h-[260px] overflow-y-auto custom-scrollbar"
                      >
                        <div className="px-3 py-1.5 border-b border-[rgba(255,255,255,0.03)]">
                          <span className="font-mono text-[9px] uppercase tracking-widest text-[#555]">
                            Ollama Library — {ollamaSearchResults.length} result{ollamaSearchResults.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {ollamaSearchResults.map((result, i) => {
                          const alreadyLocal = hubModels.some(m => m.status === 'downloaded' && m.name.split(':')[0] === result.name);
                          return (
                            <div key={`${result.name}-${i}`} className="border-b border-[rgba(255,255,255,0.02)] last:border-b-0">
                              <div className="flex items-center justify-between px-3 py-2.5 hover:bg-[rgba(255,85,0,0.04)] transition-colors">
                                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-display text-[12px] font-semibold text-[#eee]">{result.name}</span>
                                    {alreadyLocal && (
                                      <span className="px-1.5 py-0.5 rounded bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.15)] font-mono text-[7px] text-green-500 uppercase tracking-wider">installed</span>
                                    )}
                                  </div>
                                  <span className="font-body text-[10px] text-[#666] leading-snug truncate">{result.description}</span>
                                  {result.tags && result.tags.length > 0 && (
                                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                                      {result.tags.slice(0, 6).map((tag) => (
                                        <button
                                          key={tag}
                                          onClick={() => {
                                            const fullName = `${result.name}:${tag}`;
                                            if (!confirm(`Download ${fullName} (≈${result.size})?`)) return;
                                            console.log('[TRAIN] Pulling from search dropdown:', fullName);
                                            pullModel(fullName);
                                            setShowModelDropdown(false);
                                            handleModelSearch('');
                                          }}
                                          className="px-1.5 py-0.5 rounded font-mono text-[9px] text-[#888] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.04)] hover:border-[rgba(255,85,0,0.2)] hover:text-[var(--color-forge-amber)] hover:bg-[rgba(255,85,0,0.04)] transition-all cursor-pointer"
                                        >
                                          {tag}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 ml-2 shrink-0">
                                  <span className="font-mono text-[9px] text-[#555]">{result.size}</span>
                                  {!alreadyLocal && (
                                    <button
                                      onClick={() => {
                                        if (!confirm(`Download ${result.name} (≈${result.size})?`)) return;
                                        console.log('[TRAIN] Pulling from search dropdown:', result.name);
                                        pullModel(result.name);
                                        setShowModelDropdown(false);
                                        handleModelSearch('');
                                      }}
                                      className="p-1 rounded bg-[rgba(255,85,0,0.08)] hover:bg-[rgba(255,85,0,0.15)] text-[var(--color-forge-orange)] transition-colors"
                                      title={`Pull ${result.name}`}
                                    >
                                      <Download size={11} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Local models list */}
                <div className="max-h-[310px] overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                  {hubModels.filter(m => m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || m.params.toLowerCase().includes(modelSearchQuery.toLowerCase())).map((m) => {
                    const sel = selectedModel === m.id;
                    const isDownloaded = m.status === 'downloaded';
                    const isDownloading = m.status === 'downloading';
                    
                    return (
                      <div
                        key={m.id}
                        role="option"
                        aria-selected={sel}
                        tabIndex={0}
                        onClick={() => {
                          if (isDownloaded) setSelectedModel(m.id);
                        }}
                        onKeyDown={(e) => { 
                          if ((e.key === 'Enter' || e.key === ' ') && isDownloaded) { 
                            e.preventDefault(); setSelectedModel(m.id); 
                          } 
                        }}
                        className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                          isDownloaded ? 'cursor-pointer' : 'cursor-default opacity-80'
                        } ${
                          sel ? 'bg-[rgba(255,85,0,0.08)] border border-[rgba(255,85,0,0.2)]' : 'hover:bg-[rgba(255,255,255,0.02)] border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-2 h-2 rounded-full transition-all shrink-0 ${sel ? 'bg-[var(--color-forge-orange)] glow-forge' : isDownloading ? 'bg-[var(--color-forge-orange)] animate-pulse' : 'bg-transparent'}`}></div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className={`font-mono text-[13px] ${sel ? 'text-white' : 'text-[#ddd]'}`}>{m.name}</span>
                            {isDownloading && (
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-[var(--color-forge-ember)] to-[var(--color-forge-amber)] rounded-full transition-all shadow-[0_0_4px_rgba(255,85,0,0.4)]" style={{ width: `${m.downloadProgress || 0}%` }}></div>
                                </div>
                                <span className="font-mono text-[10px] text-[var(--color-forge-orange)] font-bold shrink-0">{m.downloadProgress}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[11px] bg-[rgba(255,255,255,0.03)] px-2 py-1 rounded text-[#888]">{m.params}</span>
                          {!isDownloaded && !isDownloading && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log('[TRAIN] Pulling model from list:', m.id);
                                pullModel(m.id);
                              }}
                              className="p-1.5 rounded bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,85,0,0.1)] hover:text-[var(--color-forge-orange)] text-[#888] transition-colors"
                              title="Download to system"
                            >
                              <Download size={14} />
                            </button>
                          )}
                          {isDownloading && (
                            <>
                              <Loader2 size={14} className="text-[var(--color-forge-orange)] animate-spin" />
                              <button
                                onClick={(e) => { e.stopPropagation(); cancelPull(m.name); }}
                                className="p-1 rounded hover:bg-[rgba(239,68,68,0.1)] text-[#666] hover:text-red-500 transition-colors"
                                title="Cancel download"
                              >
                                <Square size={11} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {hubModels.filter(m => m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || m.params.toLowerCase().includes(modelSearchQuery.toLowerCase())).length === 0 && (
                    <div className="p-5 text-center font-mono text-xs text-[#666]">
                      {modelSearchQuery
                        ? `No local models matching "${modelSearchQuery}" — check the dropdown above for remote models`
                        : backendConnected
                          ? 'No Ollama models available yet. Search above to discover and pull models.'
                          : 'Backend offline. Start Forge to load available models.'}
                    </div>
                  )}
                </div>
              </div>

              {/* Right — Config */}
              <div className="forge-card p-6 relative group">
                <h2 className="font-display text-[#888] text-sm uppercase tracking-widest mb-6 font-semibold">Configuration</h2>
                <div className="space-y-4">
                  {/* Method selector */}
                  <div className="flex items-center justify-between py-2 border-b border-[rgba(255,255,255,0.02)]">
                    <span className="font-body text-[#888] text-[13px]">Method</span>
                    <div className="flex items-center gap-1">
                      {(['qlora', 'lora', 'full'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => updateConfig({ method: m })}
                          className={`font-mono text-[11px] font-bold px-3 py-1 rounded transition-all ${
                            config.method === m ? 'bg-[rgba(255,85,0,0.12)] border border-[rgba(255,85,0,0.25)] text-[var(--color-forge-amber)]' : 'border border-transparent text-[#555]'
                          }`}
                        >
                          {m.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Number fields */}
                  {([
                    { 
                      label: 'LoRA Rank', key: 'loraRank', value: config.loraRank, min: 4, max: 128, step: 4,
                      desc: "Size of the update. Higher = smarter but slower. 16 or 32 is best."
                    },
                    { 
                      label: 'Alpha', key: 'loraAlpha', value: config.loraAlpha, min: 8, max: 256, step: 8,
                      desc: "Multiplier for the update. Keep it at 2x the Rank."
                    },
                    { 
                      label: 'Epochs', key: 'epochs', value: config.epochs, min: 1, max: 20, step: 1,
                      desc: "How many times it reads the data. More = smarter but risks overfitting."
                    },
                    { 
                      label: 'Batch Size', key: 'batchSize', value: config.batchSize, min: 1, max: 32, step: 1,
                      desc: "How many examples processed at once. Higher = stable but needs more VRAM."
                    },
                    { 
                      label: 'Seq Length', key: 'seqLength', value: config.seqLength, min: 256, max: 8192, step: 256,
                      desc: "Max words the model sees at once. Higher = more context but needs more VRAM."
                    },
                  ] as const).map((field) => (
                    <div key={field.key} className="flex flex-col gap-2 py-2 border-b border-[rgba(255,255,255,0.02)]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-body text-[#888] text-[13px]">{field.label}</span>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button className="p-0 border-none bg-transparent hover:outline-none focus:outline-none"><Info size={12} className="text-[#555] hover:text-[var(--color-forge-amber)] cursor-help transition-colors" /></button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content side="top" sideOffset={5} className="z-[100] max-w-[220px] bg-[#111] border border-[rgba(255,255,255,0.1)] p-3 rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200">
                                <p className="font-body text-[11px] leading-relaxed text-[#bbb]">{field.desc}</p>
                                <Tooltip.Arrow className="fill-[#111]" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </div>
                        <span className="font-mono text-[13px] text-[var(--color-forge-amber)]">{field.value}</span>
                      </div>
                      <input
                        type="range"
                        value={field.value}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        onChange={(e) => updateConfig({ [field.key]: Number(e.target.value) })}
                        className="w-full cursor-pointer accent-[var(--color-forge-orange)]"
                      />
                    </div>
                  ))}
                  {/* Learning Rate */}
                  <div className="flex flex-col gap-2 py-2 border-b border-[rgba(255,255,255,0.02)]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-body text-[#888] text-[13px]">Learning Rate</span>
                        <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <button className="p-0 border-none bg-transparent hover:outline-none focus:outline-none"><Info size={12} className="text-[#555] hover:text-[var(--color-forge-amber)] cursor-help transition-colors" /></button>
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content side="top" sideOffset={5} className="z-[100] max-w-[220px] bg-[#111] border border-[rgba(255,255,255,0.1)] p-3 rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200">
                              <p className="font-body text-[11px] leading-relaxed text-[#bbb]">How fast the model learns. 2e-4 is standard. Lower it if training is unstable or overfitting.</p>
                              <Tooltip.Arrow className="fill-[#111]" />
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>
                      </div>
                      <input
                        type="text"
                        value={config.learningRate}
                        onChange={(e) => updateConfig({ learningRate: e.target.value })}
                        className="w-20 text-right font-mono text-[13px] text-[var(--color-forge-amber)] bg-[rgba(255,85,0,0.04)] border border-[rgba(255,85,0,0.08)] rounded px-2 py-1"
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={6}
                      step={1}
                      value={['1e-5', '5e-5', '1e-4', '2e-4', '5e-4', '1e-3', '2e-3'].indexOf(config.learningRate) !== -1 ? ['1e-5', '5e-5', '1e-4', '2e-4', '5e-4', '1e-3', '2e-3'].indexOf(config.learningRate) : 3}
                      onChange={(e) => updateConfig({ learningRate: ['1e-5', '5e-5', '1e-4', '2e-4', '5e-4', '1e-3', '2e-3'][Number(e.target.value)] })}
                      className="w-full cursor-pointer accent-[var(--color-forge-orange)]"
                    />
                  </div>
                  {/* Dataset */}
                  <div className="flex flex-col gap-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-body text-[#888] text-[13px]">Dataset Source</span>
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <button className="p-0 border-none bg-transparent hover:outline-none focus:outline-none"><Info size={12} className="text-[#555] hover:text-[var(--color-forge-amber)] cursor-help transition-colors" /></button>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content side="top" sideOffset={5} className="z-[100] max-w-[220px] bg-[#111] border border-[rgba(255,255,255,0.1)] p-3 rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200">
                            <p className="font-body text-[11px] leading-relaxed text-[#bbb]">Provide a HuggingFace URL (e.g. repo/name) or upload a local dataset (.parquet, .csv, .jsonl). The backend will automatically structure and format it for training.</p>
                            <Tooltip.Arrow className="fill-[#111]" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    </div>
                    
                    <div className="flex flex-col gap-3 p-3 bg-[rgba(0,0,0,0.2)] rounded-lg border border-[rgba(255,255,255,0.03)]">
                      <input
                        type="text"
                        placeholder="Uploaded dataset ID or custom path..."
                        onChange={(e) => updateConfig({ dataset: e.target.value })}
                        className="w-full font-mono text-[11px] text-[#ccc] bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded px-3 py-2 outline-none focus:border-[rgba(255,85,0,0.3)] transition-colors placeholder:text-[#555]"
                      />
                      
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-[rgba(255,255,255,0.05)]"></div>
                        <span className="font-mono text-[9px] text-[#555] uppercase tracking-widest">or upload</span>
                        <div className="flex-1 h-px bg-[rgba(255,255,255,0.05)]"></div>
                      </div>

                      <input
                        type="file"
                        accept=".jsonl,.json,.csv"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;

                          setDatasetStatus(`Uploading ${file.name}...`);
                          try {
                            const meta = await api.uploadDataset(file);
                            updateConfig({ dataset: meta.id });
                            setDatasetStatus(`Uploaded as ${meta.id}`);
                          } catch {
                            setDatasetStatus('Upload failed');
                          }
                        }}
                        className="w-full font-mono text-[11px] text-[#ccc] cursor-pointer file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-[rgba(255,85,0,0.1)] file:text-[var(--color-forge-amber)] hover:file:bg-[rgba(255,85,0,0.2)] transition-colors"
                      />
                      {datasetStatus && (
                        <p className="font-mono text-[10px] text-[#666]">{datasetStatus}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <motion.button
              onClick={startTraining}
              disabled={!selectedModel}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={`w-full h-14 rounded-xl font-display font-bold text-sm tracking-[0.15em] relative overflow-hidden group transition-all ${
                selectedModel ? 'bg-gradient-to-br from-[var(--color-forge-ember)] via-[var(--color-forge-orange)] to-[var(--color-forge-amber)] text-black glow-forge-intense shadow-[0_4px_30px_rgba(255,85,0,0.25)]' : 'bg-[rgba(30,30,28,0.8)] text-[#444] border border-[rgba(255,255,255,0.04)] cursor-not-allowed'
              }`}
            >
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
              STRIKE — BEGIN FORGING
            </motion.button>
          </motion.div>
        )}

        {/* ═══════ TRAINING / FAILED STATE ═══════ */}
        {(isActive || isComplete || isFailed) && (
          <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
              {/* Left: Big progress */}
              <div className="forge-card flex flex-col items-center justify-center relative overflow-hidden p-8 py-12">
                <div className="absolute w-[260px] h-[260px] bg-[radial-gradient(circle,rgba(255,85,0,0.08),transparent_70%)] rounded-full blur-[40px]" />
                
                <div className="flex items-center gap-2 mb-6 relative z-10">
                  <div className={`w-2 h-2 rounded-full ${isComplete ? 'bg-green-500' : isFailed ? 'bg-red-500' : 'bg-[var(--color-forge-orange)] animate-[pulse-dot_2s_ease-in-out_infinite] glow-forge'}`} />
                  <span className={`font-mono text-[11px] tracking-widest ${isComplete ? 'text-green-500' : isFailed ? 'text-red-500' : 'text-[var(--color-forge-orange)]'}`}>
                    {isComplete ? 'COMPLETE' : isFailed ? 'FAILED' : 'FORGING'} · {selectedModel}
                  </span>
                </div>
                
                <div className="relative z-10 flex items-baseline gap-1">
                  <span className="font-display text-[88px] font-extrabold leading-none text-gradient-molten-vertical drop-shadow-[0_0_25px_rgba(255,85,0,0.35)]">
                    {Math.floor(progress)}
                  </span>
                  <span className="font-display text-2xl font-bold text-[#555]">%</span>
                </div>
                
                <div className="w-full max-w-xs mt-8 relative z-10 h-1 bg-[rgba(255,255,255,0.04)] rounded">
                  <motion.div
                    className="h-full rounded bg-gradient-to-r from-[var(--color-forge-ember)] via-[var(--color-forge-orange)] to-[var(--color-forge-moccasin)] shadow-[0_0_14px_rgba(255,85,0,0.5)]"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.8 }}
                    style={{ backgroundColor: isFailed ? '#ef4444' : undefined, backgroundImage: isFailed ? 'none' : undefined }}
                  />
                  <motion.div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-[radial-gradient(circle,rgba(255,228,181,0.8),transparent)] blur-[3px] rounded-full" animate={{ left: `${progress}%` }} transition={{ duration: 0.8 }} />
                </div>
                <p className="mt-4 relative z-10 font-mono text-[10px] tracking-[0.15em] text-[#555]">FORGED</p>
              </div>

              {/* Right: Stats grid */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'LOSS', value: currentLoss > 0 ? currentLoss.toFixed(4) : '—', color: '#fff', size: 'text-3xl' },
                  { label: 'EPOCH', value: `${currentEpoch || 0}/${totalEpochs || config.epochs}`, color: '#fff', size: 'text-3xl' },
                  {
                    label: 'GPU TEMP',
                    value: hwStats?.gpu_temp_c ? `${Math.round(hwStats.gpu_temp_c)}°C` : gpuTemp > 0 ? `${gpuTemp}°C` : '—',
                    color: (hwStats?.gpu_temp_c ?? gpuTemp) > 80 ? 'text-red-500' : 'text-[var(--color-forge-amber)]',
                    size: 'text-3xl',
                  },
                  {
                    label: 'VRAM',
                    value: hwStats?.vram_total_gb
                      ? `${(hwStats.vram_total_gb - hwStats.vram_free_gb).toFixed(1)}/${hwStats.vram_total_gb} GB`
                      : `${vramUtil}%`,
                    color: 'text-[var(--color-forge-amber)]',
                    size: vramUtil > 0 || hwStats ? 'text-xl' : 'text-3xl',
                  },
                ].map((s) => (
                  <div key={s.label} className="forge-card flex flex-col items-center justify-center text-center p-5">
                    <span className={`font-display font-bold leading-none ${s.color} ${s.size}`}>{s.value}</span>
                    <span className="font-mono text-[9px] tracking-[0.15em] text-[#555] mt-3">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Row 2: Loss Curve */}
            <div className="mt-6">
              <div className="forge-card p-6">
                <h2 className="font-display text-[#888] text-sm uppercase tracking-widest mb-4 font-semibold">Tempering Curve — Loss Over Time</h2>
                <LossCurve data={lossHistory} />
              </div>
            </div>

            {/* Row 3: Log + Hardware */}
            <div className="grid gap-6 mt-6 md:grid-cols-[1.6fr_1fr]">
              <div className="forge-card p-6">
                <h2 className="font-display text-[#888] text-sm uppercase tracking-widest mb-4 font-semibold">Output Log</h2>
                <div
                  ref={logRef}
                  className="overflow-y-auto h-40 bg-[rgba(0,0,0,0.3)] rounded-lg p-3 border border-[rgba(255,255,255,0.03)]"
                >
                  {logs.length === 0 && <p className="font-mono text-[11px] text-[#333]">Waiting for output...</p>}
                  {logs.map((l) => (
                    <div key={l.id} className="font-mono text-[11px] leading-[18px] text-[#bbb]">
                      <span className="text-[#444]">{l.timestamp} </span>
                      <span className={l.type === 'metrics' ? 'text-[var(--color-forge-amber)]' : l.type === 'error' ? 'text-red-500' : l.type === 'warn' ? 'text-amber-500' : 'text-[#666]'}>
                        [{l.type.toUpperCase()}]
                      </span>{' '}
                      {l.message}
                    </div>
                  ))}
                  {logs.length > 0 && <span className="inline-block mt-1 w-[5px] h-3 bg-[var(--color-forge-orange)] animate-[cursor-blink_1s_step-end_infinite]" />}
                </div>
              </div>

              <div className="forge-card p-6">
                <h2 className="font-display text-[#888] text-sm uppercase tracking-widest mb-4 font-semibold">Furnace Status</h2>
                <Meter
                  label={hwStats?.gpu_name ? `GPU · ${hwStats.gpu_name}` : 'GPU CORE'}
                  value={gpuUtil}
                  color="var(--color-forge-orange)"
                  detail={hwStats?.gpu_temp_c ? `${Math.round(hwStats.gpu_temp_c)}°C` : undefined}
                />
                <Meter
                  label="VRAM"
                  value={vramUtil}
                  color="var(--color-forge-amber)"
                  detail={hwStats?.vram_total_gb ? `${(hwStats.vram_total_gb - hwStats.vram_free_gb).toFixed(1)} / ${hwStats.vram_total_gb.toFixed(1)} GB` : undefined}
                />
                <Meter
                  label="CPU"
                  value={cpuUtil}
                  color="#888"
                  detail={hwStats?.cpu_cores ? `${hwStats.cpu_cores}C / ${hwStats.cpu_threads}T` : undefined}
                />
                <Meter
                  label="RAM"
                  value={ramUtil}
                  color="#888"
                  detail={hwStats?.ram_total_gb ? `${(hwStats.ram_total_gb - hwStats.ram_free_gb).toFixed(1)} / ${hwStats.ram_total_gb.toFixed(1)} GB` : undefined}
                />
              </div>
            </div>

            <div className="mt-6">
              {isActive && (
                <button
                  onClick={stopTraining}
                  className="w-full h-[52px] rounded-xl bg-transparent border border-[rgba(239,68,68,0.4)] text-red-500 font-display text-[13px] font-bold tracking-[0.12em] transition-all hover:bg-[rgba(239,68,68,0.05)]"
                >
                  HALT TRAINING
                </button>
              )}
              {(isComplete || isFailed) && (
                <div className="flex flex-col gap-4">
                  {isComplete && exportStatus === 'not_started' && (
                    <div className="forge-card p-6 flex flex-col gap-4">
                      <h3 className="font-display text-[#888] text-sm uppercase tracking-widest font-semibold">Export to Ollama</h3>
                      <div className="flex items-center gap-4">
                        <input
                          type="text"
                          value={customExportName}
                          onChange={(e) => setCustomExportName(e.target.value)}
                          placeholder="Name your forged model..."
                          className="flex-1 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg px-4 py-3 font-mono text-[13px] text-[#ccc] focus:outline-none focus:border-[rgba(255,85,0,0.3)] transition-colors"
                        />
                        <button
                          onClick={() => exportModel(customExportName)}
                          disabled={!customExportName.trim()}
                          className="px-6 py-3 rounded-lg bg-[rgba(255,85,0,0.1)] border border-[rgba(255,85,0,0.2)] text-[var(--color-forge-orange)] font-display text-[13px] font-bold tracking-[0.1em] transition-all hover:bg-[rgba(255,85,0,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          EXPORT GGUF
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {isComplete && (exportStatus === 'pending' || exportStatus === 'running') && (
                    <div className="forge-card flex flex-col justify-center relative overflow-hidden p-6 border-[rgba(255,85,0,0.2)]">
                      <div className="absolute w-[200px] h-[200px] left-0 top-1/2 -translate-y-1/2 bg-[radial-gradient(circle,rgba(255,85,0,0.05),transparent_70%)] blur-[30px]" />
                      <div className="flex items-center gap-3 relative z-10 mb-4">
                        <div className="w-2 h-2 rounded-full bg-[var(--color-forge-orange)] animate-[pulse-dot_2s_ease-in-out_infinite]" />
                        <span className="font-mono text-[13px] text-[var(--color-forge-amber)] flex-1">
                          Exporting {exportModelName} to Ollama... (This may take a while)
                        </span>
                        <span className="font-mono text-[13px] text-white">
                          {Math.floor(exportProgress)}%
                        </span>
                      </div>
                      <div className="w-full h-1 bg-[rgba(255,255,255,0.04)] rounded relative z-10">
                        <motion.div
                          className="h-full rounded bg-gradient-to-r from-[var(--color-forge-ember)] via-[var(--color-forge-orange)] to-[var(--color-forge-amber)] shadow-[0_0_10px_rgba(255,85,0,0.3)]"
                          animate={{ width: `${exportProgress}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  )}

                  {isComplete && exportStatus === 'completed' && (
                    <div className="forge-card p-6 flex flex-col gap-4 border-[rgba(34,197,94,0.2)] bg-[rgba(34,197,94,0.02)]">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="font-mono text-[13px] text-green-500">
                          Successfully exported {exportModelName} to Ollama! You can now chat with it.
                        </span>
                      </div>
                      <button
                        onClick={() => window.location.href = '/'}
                        className="w-full py-3 rounded-lg bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.2)] text-green-500 font-display text-[13px] font-bold tracking-[0.1em] transition-all hover:bg-[rgba(34,197,94,0.15)]"
                      >
                        CHAT WITH MODEL
                      </button>
                    </div>
                  )}

                  {isComplete && exportStatus === 'failed' && (
                    <div className="forge-card p-6 flex flex-col gap-4 border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.02)]">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="font-mono text-[13px] text-red-400">
                          Export failed. Check the output log for details.
                        </span>
                      </div>
                      <button
                        onClick={() => exportModel(customExportName)}
                        disabled={!customExportName.trim()}
                        className="w-full py-3 rounded-lg bg-[rgba(255,85,0,0.1)] border border-[rgba(255,85,0,0.2)] text-[var(--color-forge-orange)] font-display text-[13px] font-bold tracking-[0.1em] transition-all hover:bg-[rgba(255,85,0,0.15)] disabled:opacity-50"
                      >
                        RETRY EXPORT
                      </button>
                    </div>
                  )}

                  <button
                    onClick={resetTraining}
                    className={`w-full h-[52px] rounded-xl font-display text-[13px] font-bold tracking-[0.12em] transition-all active:scale-[0.998] ${
                      isFailed 
                        ? 'bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-red-500 hover:bg-[rgba(239,68,68,0.15)]' 
                        : 'bg-transparent border border-[rgba(255,255,255,0.05)] text-[#666] hover:bg-[rgba(255,255,255,0.02)] hover:text-[#bbb]'
                    }`}
                  >
                    {isFailed ? 'DISCARD & RETRY' : 'START NEW TRAINING JOB'}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </Tooltip.Provider>
  );
}
