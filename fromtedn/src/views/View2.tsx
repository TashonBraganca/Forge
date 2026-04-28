import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';

export default function View2() {
  return (
    <div className="w-full max-w-5xl mx-auto" style={{ fontFamily: '"Epilogue", sans-serif' }}>
      <div className="flex justify-between items-end mb-16 relative border-b-2 border-[var(--color-forge-orange)] pb-6">
        <div className="relative z-10">
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter mb-2 uppercase text-[#fff] flex items-center gap-4" style={{ fontFamily: '"Unbounded", sans-serif' }}>
            <span className="text-[var(--color-forge-orange)] glow-forge">Forge</span>
            <span>Your Model</span>
          </h1>
          <p className="text-[#aaa] text-sm uppercase tracking-widest max-w-lg">
            High-performance local fine-tuning.
          </p>
        </div>
        
        <div className="hidden md:flex items-center gap-2">
          <div className="w-16 h-1 bg-gradient-to-r from-transparent to-[var(--color-forge-orange)]"></div>
          <Flame size={24} className="text-[var(--color-forge-orange)] glow-forge" />
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8 mb-10">
        {/* Model Picker */}
        <div className="flex-1 bg-[var(--color-forge-surface)] p-8 relative rounded-tr-3xl">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-[rgba(255,85,0,0.1)] to-transparent rounded-tr-3xl"></div>
          <h2 className="text-[#fff] text-xl font-bold uppercase mb-8" style={{ fontFamily: '"Unbounded", sans-serif' }}>01. Target Model</h2>
          
          <div className="grid grid-cols-1 gap-2">
            {[
              { id: 'llama3.2:3b', params: '3B', active: true },
              { id: 'mistral:7b', params: '7B', active: false },
              { id: 'phi3:mini', params: '3.8B', active: false },
            ].map(m => (
              <div key={m.id} className={`flex items-center justify-between p-4 cursor-pointer transition-all border-l-2 ${
                m.active ? 'bg-[rgba(255,85,0,0.05)] border-[var(--color-forge-orange)]' : 'bg-[#050505] border-[#222] hover:border-[#555]'
              }`}>
                <span className="text-[14px] text-white" style={{ fontFamily: '"Victor Mono", monospace' }}>{m.id}</span>
                <span className="text-[12px] text-[var(--color-forge-orange)]" style={{ fontFamily: '"Victor Mono", monospace' }}>[{m.params}]</span>
              </div>
            ))}
          </div>
        </div>

        {/* Configuration */}
        <div className="flex-1 bg-[var(--color-forge-surface)] p-8 relative rounded-tl-3xl">
          <h2 className="text-[#fff] text-xl font-bold uppercase mb-8 text-right" style={{ fontFamily: '"Unbounded", sans-serif' }}>02. Parameters</h2>
          
          <div className="space-y-4">
            {[
              { k: 'Method', v: 'QLoRA' },
              { k: 'LoRA Rank', v: '16' },
              { k: 'Alpha', v: '32' },
              { k: 'Epochs', v: '3' },
            ].map((item, i) => (
              <div key={i} className="flex flex-col border-b border-[rgba(255,255,255,0.05)] pb-2">
                <span className="text-[#666] text-[11px] uppercase tracking-widest mb-1">{item.k}</span>
                <span className="text-[var(--color-forge-amber)] text-[15px]" style={{ fontFamily: '"Victor Mono", monospace' }}>{item.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <motion.button 
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="w-full h-16 bg-[#000] border-2 border-[var(--color-forge-orange)] text-[var(--color-forge-orange)] font-black text-lg uppercase tracking-widest glow-forge hover:bg-[var(--color-forge-orange)] hover:text-black transition-colors"
        style={{ fontFamily: '"Unbounded", sans-serif' }}
      >
        Ignite Sequence
      </motion.button>
    </div>
  );
}
