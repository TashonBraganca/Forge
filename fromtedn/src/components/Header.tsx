import { Link, useLocation } from 'react-router-dom';
import { useTrainingStore } from '../store/training';
import { Sparkles, Database, LayoutDashboard, MessageSquare } from 'lucide-react';

export default function Header() {
  const location = useLocation();
  const path = location.pathname;
  const backendConnected = useTrainingStore((s) => s.backendConnected);

  const navItems = [
    { label: 'TRAIN', path: '/train', icon: <Sparkles size={14} /> },
    { label: 'HUB', path: '/hub', icon: <Database size={14} /> },
    { label: 'MODELS', path: '/models', icon: <LayoutDashboard size={14} /> },
    { label: 'PLAYGROUND', path: '/playground', icon: <MessageSquare size={14} /> },
  ];

  return (
    <header className="fixed top-0 w-full h-14 border-b border-[rgba(255,85,0,0.1)] bg-[rgba(0,0,0,0.4)] backdrop-blur-md z-50 px-6 flex items-center justify-between">
      {/* Brand */}
      <Link to="/train" className="flex items-center gap-2">
        <span className="font-display text-[15px] font-extrabold tracking-widest text-gradient-molten">
          FORGE
        </span>
      </Link>

      {/* Nav */}
      <nav className="flex items-center gap-1 bg-[rgba(255,255,255,0.02)] p-1 rounded-xl border border-[rgba(255,255,255,0.04)]">
        {navItems.map((item) => {
          const isActive = path === item.path || (path === '/' && item.path === '/train');
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all ${
                isActive
                  ? 'bg-[rgba(255,85,0,0.1)] text-[var(--color-forge-orange)]'
                  : 'text-[#666] hover:text-[#aaa] hover:bg-[rgba(255,255,255,0.03)]'
              }`}
            >
              <span className={isActive ? 'opacity-100' : 'opacity-60'}>{item.icon}</span>
              <span className="font-display text-[11px] font-bold tracking-[0.1em]">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Connection Status */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)]">
          <div className={`w-2 h-2 rounded-full ${backendConnected ? 'bg-green-500 glow-forge' : 'bg-red-500'}`} />
          <span className="font-mono text-[10px] tracking-widest uppercase text-[#888]">
            {backendConnected ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
    </header>
  );
}
