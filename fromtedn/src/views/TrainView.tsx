import { useMemo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTrainingStore } from '../store/training';
import { useModelStore } from '../store/models';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Cpu, HardDrive, Zap, Flame, Download, Loader2, Info } from 'lucide-react';

/* ─── Inline Loss Curve ─────────────────────────────────── */
function LossCurve({ data }: { data: number[] }) {
  const W = 700, H = 180;
  const pathRef = useRef<SVGPathElement>(null);
  const drawn = useRef(false);

  const linePath = useMemo(() => {
    if (data.length < 2) return '';
    const maxV = Math.max(...data, 1.6), minV = Math.min(...data, 0);
    const range = maxV - minV || 1;
    const pts = data.map((v, i) => ({
      x: (i / (data.length - 1)) * W,
      y: 12 + (1 - (v - minV) / range) * (H - 24),
    }));
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const cx = (pts[i - 1].x + pts[i].x) / 2;
      d += ` C ${cx},${pts[i - 1].y} ${cx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
    }
    return d;
  }, [data]);

  const fillPath = linePath ? `${linePath} L ${W},${H} L 0,${H} Z` : '';

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
    Array.from({ length: 8 }, (_, i) => ({
      id: i, cx: 30 + Math.random() * (W - 60), cy: 20 + Math.random() * (H - 40),
      r: 0.6 + Math.random() * 0.8, dur: 2 + Math.random() * 3, del: Math.random() * 4,
    }))
  );

  return (
    <div className="relative overflow-hidden w-full h-[180px] bg-[rgba(10,10,8,0.6)] rounded-xl border border-[rgba(255,85,0,0.08)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="cs" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#CC3300" /><stop offset="50%" stopColor="#FF5500" /><stop offset="100%" stopColor="#FF8C00" />
          </linearGradient>
          <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,85,0,0.2)" /><stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((p) => <line key={p} x1="0" y1={p * H} x2={W} y2={p * H} stroke="rgba(255,85,0,0.04)" strokeWidth="1" />)}
        {fillPath && <path d={fillPath} fill="url(#cf)" opacity={data.length > 2 ? 1 : 0} style={{ transition: 'opacity 1s' }} />}
        {linePath && <path ref={pathRef} d={linePath} fill="none" stroke="url(#cs)" strokeWidth="2" strokeLinecap="round" className="glow-forge" />}
        {embers.map((e) => <circle key={e.id} cx={e.cx} cy={e.cy} r={e.r} fill="#FF5500" style={{ animation: `ember-glow ${e.dur}s ease-in-out infinite`, animationDelay: `${e.del}s` }} />)}
      </svg>
    </div>
  );
}

/* ─── Hardware Meter ───────────────────────────────────── */
function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="mb-4">
      <div className="flex justify-between mb-1.5 font-mono text-[11px] uppercase tracking-widest text-[#888]">
        <span>{label}</span>
        <span className="text-[#ccc]">{value}%</span>
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
  const hubModels = useModelStore((s) => s.hubModels);
  const pullModel = useModelStore((s) => s.pullModel);

  const isIdle = status === 'idle';
  const isActive = status === 'training' || status === 'preparing';
  const isComplete = status === 'completed';
  const logRef = useRef<HTMLDivElement>(null);
  const hwStats = useTrainingStore((s) => s.hwStats);
  const backendConnected = useTrainingStore((s) => s.backendConnected);
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

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
                    <span className="font-mono text-[11px] text-[#888]">{hwStats.cpu_name} · {hwStats.cpu_cores}c</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)]">
                    <HardDrive size={11} className="text-[#888]" />
                    <span className="font-mono text-[11px] text-[#888]">{hwStats.ram_total_gb} GB RAM · {hwStats.disk_free_gb} GB free</span>
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
                
                {/* Search Input */}
                <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  <input
                    type="text"
                    placeholder="Search models..."
                    value={modelSearchQuery}
                    onChange={(e) => setModelSearchQuery(e.target.value)}
                    className="font-mono text-xs text-[#ccc] bg-transparent border-none outline-none w-full"
                  />
                </div>

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
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full transition-all ${sel ? 'bg-[var(--color-forge-orange)] glow-forge' : 'bg-transparent'}`}></div>
                          <div className="flex flex-col">
                            <span className={`font-mono text-[13px] ${sel ? 'text-white' : 'text-[#ddd]'}`}>{m.name}</span>
                            {isDownloading && (
                              <div className="w-32 mt-1.5 h-1.5 bg-[rgba(255,255,255,0.05)] rounded overflow-hidden">
                                <div className="h-full bg-[var(--color-forge-orange)] transition-all" style={{ width: `${m.downloadProgress || 0}%` }}></div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[11px] bg-[rgba(255,255,255,0.03)] px-2 py-1 rounded text-[#888]">{m.params}</span>
                          {!isDownloaded && !isDownloading && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                pullModel(m.id);
                              }}
                              className="p-1.5 rounded bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,85,0,0.1)] hover:text-[var(--color-forge-orange)] text-[#888] transition-colors"
                              title="Download to system"
                            >
                              <Download size={14} />
                            </button>
                          )}
                          {isDownloading && (
                            <Loader2 size={14} className="text-[var(--color-forge-orange)] animate-spin" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {hubModels.filter(m => m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || m.params.toLowerCase().includes(modelSearchQuery.toLowerCase())).length === 0 && (
                    <div className="p-5 text-center font-mono text-xs text-[#666]">
                      No models found matching "{modelSearchQuery}"
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
                        placeholder="HuggingFace / Kaggle URL..."
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
                        accept=".jsonl,.json,.csv,.parquet"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) updateConfig({ dataset: file.name });
                        }}
                        className="w-full font-mono text-[11px] text-[#ccc] cursor-pointer file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-[rgba(255,85,0,0.1)] file:text-[var(--color-forge-amber)] hover:file:bg-[rgba(255,85,0,0.2)] transition-colors"
                      />
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

        {/* ═══════ TRAINING STATE ═══════ */}
        {(isActive || isComplete) && (
          <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
              {/* Left: Big progress */}
              <div className="forge-card flex flex-col items-center justify-center relative overflow-hidden p-8 py-12">
                <div className="absolute w-[260px] h-[260px] bg-[radial-gradient(circle,rgba(255,85,0,0.08),transparent_70%)] rounded-full blur-[40px]" />
                
                <div className="flex items-center gap-2 mb-6 relative z-10">
                  <div className={`w-2 h-2 rounded-full ${isComplete ? 'bg-green-500' : 'bg-[var(--color-forge-orange)] animate-[pulse-dot_2s_ease-in-out_infinite] glow-forge'}`} />
                  <span className={`font-mono text-[11px] tracking-widest ${isComplete ? 'text-green-500' : 'text-[var(--color-forge-orange)]'}`}>
                    {isComplete ? 'COMPLETE' : 'FORGING'} · {selectedModel}
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
                  />
                  <motion.div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-[radial-gradient(circle,rgba(255,228,181,0.8),transparent)] blur-[3px] rounded-full" animate={{ left: `${progress}%` }} transition={{ duration: 0.8 }} />
                </div>
                <p className="mt-4 relative z-10 font-mono text-[10px] tracking-[0.15em] text-[#555]">FORGED</p>
              </div>

              {/* Right: Stats grid */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'LOSS', value: currentLoss > 0 ? currentLoss.toFixed(4) : '—', color: '#fff', size: 'text-3xl' },
                  { label: 'EPOCH', value: `${currentEpoch}/${totalEpochs}`, color: '#fff', size: 'text-3xl' },
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
                <Meter label="GPU CORE" value={gpuUtil} color="var(--color-forge-orange)" />
                <Meter label="VRAM" value={vramUtil} color="var(--color-forge-amber)" />
                <Meter label="CPU" value={cpuUtil} color="#666" />
                <Meter label="RAM" value={ramUtil} color="#666" />
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
              {isComplete && (
                <button
                  onClick={resetTraining}
                  className="w-full h-[52px] rounded-xl bg-gradient-to-br from-[var(--color-forge-ember)] via-[var(--color-forge-orange)] to-[var(--color-forge-amber)] text-black font-display text-[13px] font-bold tracking-[0.12em] shadow-[0_4px_30px_rgba(255,85,0,0.25)] transition-all active:scale-[0.998]"
                >
                  FORGE ANOTHER
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </Tooltip.Provider>
  );
}
