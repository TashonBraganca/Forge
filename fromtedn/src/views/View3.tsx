import { motion } from 'framer-motion';

export default function View3() {
  return (
    <div className="w-full max-w-3xl mx-auto" style={{ fontFamily: '"Albert Sans", sans-serif' }}>
      <div className="text-center mb-12">
        <h1 className="text-4xl font-semibold tracking-wide mb-3 text-white" style={{ fontFamily: '"Darker Grotesque", sans-serif' }}>
          Initialize Training
        </h1>
        <p className="text-[#777] text-[15px] font-light max-w-md mx-auto">
          Configure hardware-accelerated fine-tuning.
        </p>
      </div>

      <div className="bg-[var(--color-forge-surface)] rounded-2xl border border-[rgba(255,255,255,0.04)] shadow-2xl overflow-hidden backdrop-blur-md">
        <div className="p-8 border-b border-[rgba(255,255,255,0.04)]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1.5 h-6 bg-[var(--color-forge-orange)] rounded-full glow-forge"></div>
            <h2 className="text-[#ccc] text-lg font-medium" style={{ fontFamily: '"Darker Grotesque", sans-serif' }}>Base Architecture</h2>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { id: 'llama3.2', p: '3B', active: true },
              { id: 'mistral', p: '7B', active: false },
              { id: 'phi3', p: '3.8B', active: false },
              { id: 'qwen2', p: '7B', active: false },
            ].map(m => (
              <div key={m.id} className={`p-4 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                m.active ? 'bg-[rgba(255,85,0,0.1)] ring-1 ring-[var(--color-forge-orange)]' : 'bg-[rgba(0,0,0,0.4)] hover:bg-[rgba(255,255,255,0.02)]'
              }`}>
                <span className="text-[14px] text-white" style={{ fontFamily: '"Sometype Mono", monospace' }}>{m.id}</span>
                <span className="text-[11px] text-[#888]">{m.p} Params</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1.5 h-6 bg-[var(--color-forge-amber)] rounded-full"></div>
            <h2 className="text-[#ccc] text-lg font-medium" style={{ fontFamily: '"Darker Grotesque", sans-serif' }}>Hyperparameters</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-x-12 gap-y-6">
            {[
              { k: 'Method', v: 'QLoRA' },
              { k: 'LoRA Rank', v: '16' },
              { k: 'Alpha', v: '32' },
              { k: 'Epochs', v: '3' },
              { k: 'Learning Rate', v: '2e-4' },
              { k: 'Batch Size', v: '4' },
            ].map((item, i) => (
              <div key={i} className="flex justify-between items-center group">
                <span className="text-[#666] text-sm">{item.k}</span>
                <span className="text-[var(--color-forge-moccasin)] text-[14px] bg-[rgba(0,0,0,0.5)] px-3 py-1 rounded-md border border-[rgba(255,255,255,0.05)]" style={{ fontFamily: '"Sometype Mono", monospace' }}>{item.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="px-8 py-4 rounded-xl bg-gradient-to-r from-[var(--color-forge-orange)] to-[var(--color-forge-amber)] text-black font-semibold text-sm tracking-wide glow-forge"
          style={{ fontFamily: '"Darker Grotesque", sans-serif' }}
        >
          Execute Training Job
        </motion.button>
      </div>
    </div>
  );
}
