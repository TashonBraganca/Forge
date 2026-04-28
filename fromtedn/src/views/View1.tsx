import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';

export default function View1() {
  return (
    <div className="w-full max-w-4xl mx-auto" style={{ fontFamily: '"Manrope", sans-serif' }}>
      <div className="flex flex-col items-center text-center mb-16 relative">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10">
          <div className="w-64 h-64 bg-[var(--color-forge-orange)] rounded-full blur-[100px] opacity-10"></div>
        </div>
        
        <div className="mb-6 p-4 rounded-2xl bg-[rgba(255,85,0,0.05)] border border-[rgba(255,85,0,0.1)] inline-flex items-center justify-center glow-forge">
          <Flame size={32} className="text-[var(--color-forge-orange)]" />
        </div>
        
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4 text-gradient-molten" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>
          FORGE YOUR MODEL
        </h1>
        <p className="text-[#888] text-lg max-w-lg mx-auto">
          Fine-tune any LLM on your own hardware. <br/>
          Select a base model, configure, and strike.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Model Picker */}
        <div className="bg-[var(--color-forge-surface)] rounded-xl border border-[rgba(255,85,0,0.06)] p-6 overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-[rgba(255,85,0,0.03)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <h2 className="text-[#888] text-sm uppercase tracking-widest mb-6 font-semibold" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>Select Model</h2>
          
          <div className="space-y-1">
            {[
              { id: 'llama3.2:3b', params: '3B', active: true },
              { id: 'mistral:7b', params: '7B', active: false },
              { id: 'phi3:mini', params: '3.8B', active: false },
              { id: 'deepseek-r1:7b', params: '7B', active: false },
            ].map(m => (
              <div key={m.id} className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                m.active ? 'bg-[rgba(255,85,0,0.08)] border border-[rgba(255,85,0,0.2)]' : 'hover:bg-[rgba(255,255,255,0.02)] border border-transparent'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${m.active ? 'bg-[var(--color-forge-orange)] glow-forge' : 'bg-transparent'}`}></div>
                  <span className="text-[13px] text-[#ddd]" style={{ fontFamily: '"Chivo Mono", monospace' }}>{m.id}</span>
                </div>
                <span className="text-[11px] bg-[rgba(255,255,255,0.03)] px-2 py-1 rounded text-[#888]" style={{ fontFamily: '"Chivo Mono", monospace' }}>{m.params}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Configuration */}
        <div className="bg-[var(--color-forge-surface)] rounded-xl border border-[rgba(255,85,0,0.06)] p-6 relative group">
          <h2 className="text-[#888] text-sm uppercase tracking-widest mb-6 font-semibold" style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}>Configuration</h2>
          
          <div className="space-y-3">
            {[
              { k: 'Method', v: 'QLoRA' },
              { k: 'LoRA Rank', v: '16' },
              { k: 'Alpha', v: '32' },
              { k: 'Epochs', v: '3' },
              { k: 'Learning Rate', v: '2e-4' },
              { k: 'Batch Size', v: '4' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-[rgba(255,255,255,0.02)] last:border-0">
                <span className="text-[#888] text-[13px]">{item.k}</span>
                <span className="text-[var(--color-forge-amber)] text-[13px]" style={{ fontFamily: '"Chivo Mono", monospace' }}>{item.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <motion.button 
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className="w-full h-14 rounded-xl bg-gradient-to-br from-[var(--color-forge-ember)] via-[var(--color-forge-orange)] to-[var(--color-forge-amber)] text-black font-bold text-sm tracking-[0.15em] glow-forge-intense shadow-[0_4px_30px_rgba(255,85,0,0.25)] relative overflow-hidden group"
        style={{ fontFamily: '"Bricolage Grotesque", sans-serif' }}
      >
        <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
        STRIKE — BEGIN FORGING
      </motion.button>
    </div>
  );
}
