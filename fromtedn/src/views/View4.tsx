import { motion } from 'framer-motion';

export default function View4() {
  return (
    <div className="w-full max-w-[1000px] mx-auto" style={{ fontFamily: '"Public Sans", sans-serif' }}>
      <div className="border-l-4 border-[var(--color-forge-orange)] pl-6 mb-12">
        <h1 className="text-5xl font-black tracking-tight mb-2 text-white uppercase" style={{ fontFamily: '"Archivo", sans-serif' }}>
          Model Forge
        </h1>
        <p className="text-[var(--color-forge-orange)] text-sm font-mono tracking-widest uppercase">
          Sys_Init // Training_Module
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-1">
        {/* Model Picker */}
        <div className="lg:col-span-1 bg-[#0a0a0a] p-6 border border-[#222]">
          <h2 className="text-[#fff] text-sm font-bold uppercase mb-6 tracking-widest" style={{ fontFamily: '"Archivo", sans-serif' }}>Select Base</h2>
          
          <div className="flex flex-col gap-1">
            {[
              { id: 'llama3.2:3b', params: '3B', active: true },
              { id: 'mistral:7b', params: '7B', active: false },
              { id: 'phi3:mini', params: '3.8B', active: false },
              { id: 'deepseek-r1', params: '7B', active: false },
            ].map(m => (
              <div key={m.id} className={`flex items-center justify-between p-3 cursor-pointer ${
                m.active ? 'bg-[var(--color-forge-orange)] text-black' : 'bg-[#111] text-[#888] hover:bg-[#1a1a1a]'
              }`}>
                <span className="text-[13px] font-bold" style={{ fontFamily: '"Martian Mono", monospace' }}>{m.id}</span>
                <span className="text-[10px] opacity-70" style={{ fontFamily: '"Martian Mono", monospace' }}>{m.params}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Configuration */}
        <div className="lg:col-span-2 bg-[#0a0a0a] p-6 border border-[#222]">
          <h2 className="text-[#fff] text-sm font-bold uppercase mb-6 tracking-widest flex items-center justify-between" style={{ fontFamily: '"Archivo", sans-serif' }}>
            <span>Parameters</span>
            <span className="text-[var(--color-forge-amber)] text-[10px] font-mono glow-forge">ACTIVE</span>
          </h2>
          
          <div className="grid grid-cols-2 gap-4">
            {[
              { k: 'Method', v: 'QLoRA' },
              { k: 'LoRA Rank', v: '16' },
              { k: 'Alpha', v: '32' },
              { k: 'Epochs', v: '3' },
              { k: 'Learning Rate', v: '2e-4' },
              { k: 'Batch Size', v: '4' },
            ].map((item, i) => (
              <div key={i} className="bg-[#111] p-4 flex flex-col justify-between">
                <span className="text-[#555] text-[10px] uppercase font-bold tracking-widest mb-2">{item.k}</span>
                <span className={`text-[16px] font-medium ${i === 0 ? 'text-[var(--color-forge-orange)] glow-forge' : 'text-[#ddd]'}`} style={{ fontFamily: '"Martian Mono", monospace' }}>{item.v}</span>
              </div>
            ))}
          </div>
          
          <motion.button 
            whileHover={{ backgroundColor: 'var(--color-forge-amber)' }}
            whileTap={{ scale: 0.98 }}
            className="w-full mt-4 h-14 bg-[var(--color-forge-orange)] text-black font-black text-xl uppercase tracking-widest"
            style={{ fontFamily: '"Archivo", sans-serif' }}
          >
            START
          </motion.button>
        </div>
      </div>
    </div>
  );
}
