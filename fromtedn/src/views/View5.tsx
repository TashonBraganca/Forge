import { motion } from 'framer-motion';

export default function View5() {
  return (
    <div className="w-full max-w-4xl mx-auto" style={{ fontFamily: '"Jost", sans-serif' }}>
      <div className="text-center mb-16 relative">
        <h1 className="text-6xl font-bold mb-4 text-[#FFE4B5]" style={{ fontFamily: '"Eczar", serif' }}>
          The Great Forge
        </h1>
        <p className="text-[#a09a90] text-lg italic max-w-lg mx-auto">
          "Where raw parameters are tempered into focused intelligence."
        </p>
        <div className="w-32 h-[1px] bg-gradient-to-r from-transparent via-[var(--color-forge-orange)] to-transparent mx-auto mt-8 opacity-50"></div>
      </div>

      <div className="bg-[#0c0b0a] border border-[#2a2520] rounded-sm p-8 md:p-12 shadow-2xl relative">
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
          {/* Model Picker */}
          <div>
            <h2 className="text-[#d0c5b4] text-2xl mb-6 border-b border-[#2a2520] pb-2" style={{ fontFamily: '"Eczar", serif' }}>I. Select Base</h2>
            
            <div className="space-y-4">
              {[
                { id: 'llama3.2:3b', params: '3B', active: true },
                { id: 'mistral:7b', params: '7B', active: false },
                { id: 'phi3:mini', params: '3.8B', active: false },
              ].map(m => (
                <div key={m.id} className="flex items-center gap-4 cursor-pointer group">
                  <div className={`w-3 h-3 rotate-45 border transition-colors ${m.active ? 'border-[var(--color-forge-orange)] bg-[var(--color-forge-orange)] glow-forge' : 'border-[#444] group-hover:border-[#888]'}`}></div>
                  <span className={`text-[15px] ${m.active ? 'text-[#fff]' : 'text-[#888]'}`} style={{ fontFamily: '"Share Tech Mono", monospace' }}>{m.id}</span>
                  <span className="text-[12px] text-[#666] ml-auto">{m.params}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Configuration */}
          <div>
            <h2 className="text-[#d0c5b4] text-2xl mb-6 border-b border-[#2a2520] pb-2" style={{ fontFamily: '"Eczar", serif' }}>II. Parameters</h2>
            
            <div className="space-y-3">
              {[
                { k: 'Method', v: 'QLoRA' },
                { k: 'LoRA Rank', v: '16' },
                { k: 'Alpha', v: '32' },
                { k: 'Epochs', v: '3' },
              ].map((item, i) => (
                <div key={i} className="flex items-baseline justify-between">
                  <span className="text-[#888] text-[15px]">{item.k}</span>
                  <div className="flex-1 border-b border-dotted border-[#333] mx-4 opacity-50 relative top-[-4px]"></div>
                  <span className="text-[var(--color-forge-amber)] text-[16px]" style={{ fontFamily: '"Share Tech Mono", monospace' }}>{item.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 text-center relative z-10">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-12 py-3 border border-[var(--color-forge-orange)] text-[var(--color-forge-orange)] hover:bg-[rgba(255,85,0,0.1)] transition-colors text-lg tracking-[0.2em] uppercase glow-forge"
            style={{ fontFamily: '"Eczar", serif' }}
          >
            Commence
          </motion.button>
        </div>
      </div>
    </div>
  );
}
