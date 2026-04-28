import { useState } from 'react';

/**
 * Renders floating ember particles client-side to avoid SSR mismatch.
 * Full screen molten base glow.
 */
export default function EmberBackground() {
  const [particles] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: 10 + Math.random() * 80,
      y: Math.random() * 100, // starting height
      size: 1 + Math.random() * 3,
      driftX: -20 + Math.random() * 40,
      driftY: 30 + Math.random() * 60,
      duration: 15 + Math.random() * 20,
      delay: Math.random() * -20, // negative delay so they're visible immediately
      opacity: 0.1 + Math.random() * 0.4,
    }))
  );

  return (
    <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden bg-black">
      {/* Base ambient gradient at bottom */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-[60vh] opacity-30"
        style={{
          background: 'radial-gradient(ellipse at bottom center, var(--color-forge-ember) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      
      {/* Intense center furnace spot */}
      <div 
        className="absolute bottom-[-10vh] left-1/2 -translate-x-1/2 w-[60vw] h-[40vh] opacity-20"
        style={{
          background: 'radial-gradient(ellipse at center, var(--color-forge-orange) 0%, transparent 60%)',
          filter: 'blur(80px)',
        }}
      />

      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            bottom: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: 'var(--color-forge-moccasin)',
            boxShadow: '0 0 10px 2px var(--color-forge-orange)',
            '--drift-x': `${p.driftX}vw`,
            '--drift-y': `${p.driftY}vh`,
            animation: `ember-drift ${p.duration}s ease-out infinite`,
            animationDelay: `${p.delay}s`,
            opacity: 0, // handles by keyframes
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
