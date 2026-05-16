import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useModelStore } from '../store/models';
import { api } from '../lib/api';
import { Loader2, CheckCircle2, CircleAlert, Cpu } from 'lucide-react';

export default function ModelsView() {
  const fineTunedModels = useModelStore((s) => s.fineTunedModels);
  const fetchRegistryModels = useModelStore((s) => s.fetchRegistryModels);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetchRegistryModels();
  }, [fetchRegistryModels]);

  const selected = useMemo(
    () => fineTunedModels.find((model) => model.id === selectedId) || null,
    [fineTunedModels, selectedId],
  );

  const handleExport = async (jobId: string, defaultName: string) => {
    const suggestedName = `forge-${defaultName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const ollamaModelName = prompt('Enter a name for the exported Ollama model:', suggestedName);
    if (!ollamaModelName) return; // User cancelled

    setActionBusyId(jobId);
    try {
      await api.exportModel(jobId, ollamaModelName);
      // It takes a while, so we might want to poll or just refetch immediately
      await fetchRegistryModels();
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Forged Models</h1>
          <p className="font-mono text-[11px] text-[#666] mt-1">Persisted registry of trained and exported artifacts</p>
        </div>
        <span className="font-mono text-[11px] text-[#555]">{fineTunedModels.length} record(s)</span>
      </div>

      {fineTunedModels.length === 0 ? (
        <div className="forge-card p-10 text-center">
          <Cpu size={32} className="mx-auto text-[var(--color-forge-orange)] mb-4" />
          <h2 className="font-display text-xl font-semibold text-white mb-2">No forged models yet</h2>
          <p className="font-mono text-[12px] text-[#666]">Train a model, then export it to make it appear here.</p>
        </div>
      ) : (
        <div className={`grid gap-6 ${selected ? 'grid-cols-1 lg:grid-cols-[1fr_1.05fr]' : 'grid-cols-1'}`}>
          <div className="space-y-4">
            {fineTunedModels.map((model, index) => {
              const isSelected = selectedId === model.id;
              const isRunnable = Boolean(model.ollamaModelName);
              return (
                <motion.button
                  key={model.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  onClick={() => setSelectedId(isSelected ? null : model.id)}
                  className={`w-full text-left transition-all p-5 rounded-xl border ${
                    isSelected
                      ? 'bg-[rgba(255,85,0,0.05)] border-[rgba(255,85,0,0.18)] shadow-[0_0_20px_rgba(255,85,0,0.05)]'
                      : 'forge-card hover:border-[rgba(255,85,0,0.12)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-[15px] font-bold text-[#eee] truncate mb-2">{model.name}</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[10px] text-[#666] bg-[rgba(255,255,255,0.03)] px-2 py-1 rounded">{model.baseModel}</span>
                        <span className="font-display text-[11px] font-bold text-[var(--color-forge-amber)]">{model.method.toUpperCase()}</span>
                        <span className="font-mono text-[10px] text-[#888]">{model.date.slice(0, 10)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display text-[18px] font-bold text-[var(--color-forge-amber)]">
                        {model.finalLoss !== null && model.finalLoss !== undefined ? model.finalLoss.toFixed(4) : '—'}
                      </div>
                      <div className="font-mono text-[9px] tracking-widest text-[#555]">FINAL LOSS</div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-mono border ${model.exportStatus === 'completed' ? 'border-green-500/20 text-green-500 bg-green-500/5' : model.exportStatus === 'running' ? 'border-[var(--color-forge-orange)]/20 text-[var(--color-forge-orange)] bg-[rgba(255,85,0,0.06)]' : 'border-[rgba(255,255,255,0.05)] text-[#777] bg-[rgba(255,255,255,0.02)]'}` }>
                      {model.exportStatus === 'completed' ? <CheckCircle2 size={10} /> : model.exportStatus === 'failed' ? <CircleAlert size={10} /> : <Loader2 size={10} className={model.exportStatus === 'running' ? 'animate-spin' : ''} />}
                      {model.exportStatus.toUpperCase()}
                    </span>
                    {isRunnable && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-mono border border-green-500/20 text-green-500 bg-green-500/5">
                        Runnable in Ollama
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-[#666]">artifact: {model.exportFormat}</span>
                  </div>
                </motion.button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {selected && (
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 18 }}
                className="forge-card p-6 self-start sticky top-20"
              >
                <h2 className="font-display text-xl font-bold text-white mb-2">{selected.name}</h2>
                <p className="font-mono text-[11px] text-[#666] mb-6">Base model: {selected.baseModel}</p>

                <div className="space-y-4 mb-8">
                  {[
                    ['Method', selected.method.toUpperCase()],
                    ['Status', selected.status],
                    ['Export Status', selected.exportStatus],
                    ['Export Format', selected.exportFormat],
                    ['Artifact Path', selected.artifactPath || '—'],
                    ['Ollama Model', selected.ollamaModelName || '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 py-2 border-b border-[rgba(255,255,255,0.03)] last:border-0">
                      <span className="font-body text-[13px] text-[#666]">{label}</span>
                      <span className="font-mono text-[13px] text-[#ccc] text-right break-all">{value}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  {selected.exportStatus !== 'completed' && (
                    <button
                      onClick={() => handleExport(selected.jobId, selected.name)}
                      disabled={actionBusyId === selected.jobId}
                      className="flex-1 h-10 rounded-lg bg-gradient-to-br from-[var(--color-forge-ember)] to-[var(--color-forge-orange)] text-black font-display text-[11px] font-bold tracking-widest disabled:opacity-60"
                    >
                      {actionBusyId === selected.jobId ? 'EXPORTING' : 'EXPORT'}
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedId(null)}
                    className="flex-1 h-10 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] text-[#aaa] font-display text-[11px] font-bold tracking-widest hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                  >
                    CLOSE
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
