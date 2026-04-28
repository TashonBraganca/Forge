import { useModelStore } from '../store/models';
import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';

function Sparkline({ data, color = 'var(--color-forge-orange)' }: { data: number[]; color?: string }) {
  const W = 120, H = 36;
  const path = useMemo(() => {
    if (data.length < 2) return '';
    const max = Math.max(...data), min = Math.min(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => ({
      x: (i / (data.length - 1)) * W,
      y: 4 + (1 - (v - min) / range) * (H - 8),
    }));
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const cx = (pts[i - 1].x + pts[i].x) / 2;
      d += ` C ${cx},${pts[i - 1].y} ${cx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
    }
    return d;
  }, [data]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-[120px] h-[36px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" /><stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {path && <>
        <path d={`${path} L ${W},${H} L 0,${H} Z`} fill="url(#sg)" />
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" className="glow-forge" />
      </>}
    </svg>
  );
}

const SAMPLE_LOSS_CURVES = [
  [1.5, 1.3, 1.1, 0.95, 0.82, 0.71, 0.63, 0.58, 0.54, 0.51, 0.49, 0.47, 0.45],
  [1.8, 1.6, 1.4, 1.2, 1.0, 0.88, 0.76, 0.68, 0.61, 0.56, 0.52],
  [1.2, 1.1, 0.9, 0.78, 0.65, 0.55, 0.48, 0.43, 0.40, 0.38, 0.36, 0.35, 0.34, 0.33],
];

export default function ModelsView() {
  const fineTunedModels = useModelStore((s) => s.fineTunedModels);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const demoModels = fineTunedModels.length > 0 ? fineTunedModels : [
    { id: 'ft-001', name: 'forge-llama3.2-support', baseModel: 'llama3.2:3b', method: 'qlora', finalLoss: 0.45, date: '2026-04-20', lossData: SAMPLE_LOSS_CURVES[0] },
    { id: 'ft-002', name: 'forge-mistral-code', baseModel: 'mistral:7b', method: 'lora', finalLoss: 0.52, date: '2026-04-18', lossData: SAMPLE_LOSS_CURVES[1] },
    { id: 'ft-003', name: 'forge-phi3-medical', baseModel: 'phi3:mini', method: 'qlora', finalLoss: 0.33, date: '2026-04-15', lossData: SAMPLE_LOSS_CURVES[2] },
  ];

  const selected = demoModels.find((m) => m.id === selectedId);

  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="font-display text-2xl font-bold text-white">Forged Models</h1>
        <span className="font-mono text-[11px] text-[#555]">{demoModels.length} model(s)</span>
      </div>

      <div className={`grid gap-6 ${selected ? 'grid-cols-[1fr_1.2fr]' : 'grid-cols-1'}`}>
        <div className="space-y-4">
          {demoModels.map((model, i) => {
            const isSel = selectedId === model.id;
            const lossCurve = 'lossData' in model ? (model as { lossData: number[] }).lossData : SAMPLE_LOSS_CURVES[i % 3];
            return (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => setSelectedId(isSel ? null : model.id)}
                className={`cursor-pointer transition-all p-5 rounded-xl border ${
                  isSel ? 'bg-[rgba(255,85,0,0.04)] border-[rgba(255,85,0,0.2)] shadow-[0_0_20px_rgba(255,85,0,0.05)]' : 'forge-card hover:border-[rgba(255,85,0,0.15)]'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 pr-4">
                    <h3 className="font-display text-[15px] font-bold text-[#eee] mb-3">{model.name}</h3>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-[10px] text-[#666] bg-[rgba(255,255,255,0.03)] px-2 py-1 rounded">{model.baseModel}</span>
                      <span className="font-display text-[11px] font-bold text-[var(--color-forge-amber)]">{model.method.toUpperCase()}</span>
                      <span className="font-mono text-[10px] text-[#888]">{model.date}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="hidden sm:block"><Sparkline data={lossCurve} /></div>
                    <div className="text-right">
                      <div className="font-display text-[22px] font-bold text-[var(--color-forge-amber)]">{model.finalLoss.toFixed(2)}</div>
                      <div className="font-mono text-[9px] tracking-widest text-[#555]">FINAL LOSS</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {selected && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="forge-card p-6 sticky top-20 self-start"
          >
            <h2 className="font-display text-xl font-bold text-white mb-6">{selected.name}</h2>

            <div className="mb-8">
              <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-[#555] mb-3">Training Curve</p>
              <div className="h-[140px] bg-[rgba(0,0,0,0.3)] rounded-lg py-2 border border-[rgba(255,255,255,0.03)] overflow-hidden">
                <svg viewBox="0 0 300 100" className="w-full h-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="detailFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(255,85,0,0.2)" /><stop offset="100%" stopColor="rgba(0,0,0,0)" />
                    </linearGradient>
                  </defs>
                  {(() => {
                    const d = 'lossData' in selected ? (selected as { lossData: number[] }).lossData : SAMPLE_LOSS_CURVES[0];
                    const max = Math.max(...d), min = Math.min(...d), range = max - min || 1;
                    const pts = d.map((v, i) => ({ x: (i / (d.length - 1)) * 300, y: 8 + (1 - (v - min) / range) * 84 }));
                    let path = `M ${pts[0].x},${pts[0].y}`;
                    for (let i = 1; i < pts.length; i++) { const cx = (pts[i-1].x + pts[i].x) / 2; path += ` C ${cx},${pts[i-1].y} ${cx},${pts[i].y} ${pts[i].x},${pts[i].y}`; }
                    return <>
                      <path d={`${path} L 300,100 L 0,100 Z`} fill="url(#detailFill)" />
                      <path d={path} fill="none" stroke="var(--color-forge-orange)" strokeWidth="2" strokeLinecap="round" className="glow-forge" />
                    </>;
                  })()}
                </svg>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              {[
                ['Base Model', selected.baseModel],
                ['Method', selected.method.toUpperCase()],
                ['Final Loss', selected.finalLoss.toFixed(4)],
                ['Date', selected.date],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-[rgba(255,255,255,0.03)] last:border-0">
                  <span className="font-body text-[13px] text-[#666]">{k}</span>
                  <span className="font-mono text-[13px] text-[#ccc]">{v}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button className="flex-1 h-10 rounded-lg bg-[rgba(255,85,0,0.08)] border border-[rgba(255,85,0,0.15)] text-[var(--color-forge-orange)] font-display text-[11px] font-bold tracking-widest hover:bg-[rgba(255,85,0,0.12)] transition-colors">
                TEST
              </button>
              <button className="flex-1 h-10 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] text-[#aaa] font-display text-[11px] font-bold tracking-widest hover:bg-[rgba(255,255,255,0.05)] transition-colors">
                EXPORT
              </button>
              <button className="flex-1 h-10 rounded-lg bg-transparent border border-[rgba(239,68,68,0.2)] text-red-500 font-display text-[11px] font-bold tracking-widest hover:bg-[rgba(239,68,68,0.05)] transition-colors">
                DELETE
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
