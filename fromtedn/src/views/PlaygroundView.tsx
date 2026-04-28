import { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore, useModelStore } from '../store/models';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, ChevronDown, RotateCcw, Square, Sparkles, User, Copy, Check } from 'lucide-react';

function ModelSelector() {
  const [open, setOpen] = useState(false);
  const chatConfig = useChatStore((s) => s.chatConfig);
  const setChatConfig = useChatStore((s) => s.setChatConfig);
  const hubModels = useModelStore((s) => s.hubModels);
  const fetchOllamaModels = useModelStore((s) => s.fetchOllamaModels);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchOllamaModels();
  }, [fetchOllamaModels]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const models = hubModels.filter((m) => m.status === 'downloaded');
  const currentName = chatConfig.modelId;

  return (
    <div ref={ref} className="relative z-50">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border ${
          open ? 'bg-[rgba(255,85,0,0.08)] border-[rgba(255,85,0,0.2)]' : 'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.06)]'
        }`}
      >
        <Sparkles size={14} className="text-[var(--color-forge-orange)]" />
        <span className="font-mono text-[13px] font-semibold text-[#ddd]">{currentName}</span>
        <ChevronDown size={12} className={`text-[#666] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 min-w-[280px] rounded-xl p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl bg-[rgba(12,12,10,0.98)] border border-[rgba(255,85,0,0.1)]"
          >
            <div className="px-3 pt-2 pb-1 mb-1">
              <span className="font-display text-[10px] tracking-widest text-[#555] uppercase font-bold">Available Models</span>
            </div>
            {models.length === 0 && (
              <div className="px-3 py-3 font-mono text-[12px] text-[#555]">
                No models downloaded. Pull models from the Hub.
              </div>
            )}
            {models.map((m) => {
              const selected = chatConfig.modelId === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setChatConfig({ modelId: m.id });
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                    selected ? 'bg-[rgba(255,85,0,0.08)]' : 'hover:bg-[rgba(255,255,255,0.03)]'
                  }`}
                >
                  <div className={`shrink-0 w-1.5 h-1.5 rounded-full transition-all ${selected ? 'bg-[var(--color-forge-orange)] glow-forge' : 'bg-[#2A2A28]'}`} />
                  <div className="flex-1 min-w-0">
                    <span className={`block font-mono text-[13px] truncate ${selected ? 'text-white' : 'text-[#bbb]'}`}>{m.name}</span>
                    <span className="block font-mono text-[10px] text-[#555] mt-0.5">{m.params} · {m.size}</span>
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className={`p-1 rounded transition-all opacity-0 group-hover:opacity-100 ${copied ? 'text-green-500' : 'text-[#444] hover:text-[#888]'}`} aria-label="Copy message">
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function MessageBubble({ role, content, isStreaming = false }: { role: 'user' | 'assistant'; content: string; isStreaming?: boolean; }) {
  const isUser = role === 'user';
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="group max-w-3xl mx-auto py-6">
      <div className="flex gap-4">
        <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-1 border ${isUser ? 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.08)]' : 'bg-gradient-to-br from-[rgba(255,85,0,0.15)] to-[rgba(255,140,0,0.1)] border-[rgba(255,85,0,0.15)]'}`}>
          {isUser ? <User size={14} className="text-[#888]" /> : <Sparkles size={14} className="text-[var(--color-forge-amber)]" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 mt-1">
            <span className={`font-display text-[13px] font-bold ${isUser ? 'text-[#ccc]' : 'text-[var(--color-forge-amber)]'}`}>
              {isUser ? 'You' : 'Forge'}
            </span>
            {!isUser && <CopyButton text={content} />}
          </div>
          <div className={`font-body text-[15px] leading-[1.75] whitespace-pre-wrap break-words ${isUser ? 'text-[#ddd]' : 'text-[#c8c8c4]'}`}>
            {content}
            {isStreaming && <span className="inline-block ml-1 w-2 h-4 bg-[var(--color-forge-orange)] align-text-bottom animate-[cursor-blink_1s_step-end_infinite]" />}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function PlaygroundView() {
  const messages = useChatStore((s) => s.messages);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const activeStream = useChatStore((s) => s.activeStream);
  const chatConfig = useChatStore((s) => s.chatConfig);

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || isGenerating) return;
    sendMessage(input.trim());
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, [input, isGenerating, sendMessage]);

  const handleStop = useCallback(() => {
    if (activeStream) activeStream.close();
  }, [activeStream]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      <div className="flex items-center justify-between px-6 h-16 border-b border-[rgba(255,255,255,0.04)] shrink-0">
        <ModelSelector />
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] text-[#666] font-display font-bold text-[11px] tracking-widest hover:text-[#ccc] transition-colors"
            >
              <RotateCcw size={12} /> NEW CHAT
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full p-10 text-center">
            <div className="w-24 h-24 rounded-full bg-[radial-gradient(circle,rgba(255,85,0,0.12),rgba(255,140,0,0.04)_60%,transparent)] mb-8 animate-[halo-pulse_4s_ease-in-out_infinite]" />
            <h1 className="font-display text-4xl font-extrabold text-white mb-4">What can I help with?</h1>
            <p className="font-body text-[#666]">
              Chat with <span className="text-[var(--color-forge-amber)] font-semibold">{chatConfig.modelId}</span> running locally via Ollama
            </p>
          </div>
        ) : (
          <div className="pb-8 px-6">
            {messages.map((msg, i) => (
              <MessageBubble key={msg.id} role={msg.role} content={msg.content} isStreaming={isGenerating && msg.role === 'assistant' && i === messages.length - 1} />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 px-6 pt-4 pb-8">
        <div className="max-w-3xl mx-auto relative">
          <div className="bg-[rgba(20,20,18,0.9)] border border-[rgba(255,255,255,0.06)] rounded-2xl p-4 pr-16 backdrop-blur-md focus-within:border-[rgba(255,85,0,0.2)] transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message Forge..."
              rows={1}
              className="w-full resize-none font-body text-[15px] leading-relaxed text-[#ddd] bg-transparent outline-none max-h-[200px]"
            />
          </div>
          <div className="absolute right-3 bottom-3">
            {isGenerating ? (
              <button onClick={handleStop} className="flex items-center justify-center w-10 h-10 rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-red-500 hover:bg-[rgba(239,68,68,0.15)] transition-colors">
                <Square size={16} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={`flex items-center justify-center w-10 h-10 rounded-xl border-none transition-all ${
                  input.trim() ? 'bg-gradient-to-br from-[var(--color-forge-ember)] to-[var(--color-forge-orange)] text-black shadow-[0_0_15px_rgba(255,85,0,0.2)]' : 'bg-[rgba(255,255,255,0.03)] text-[#444] cursor-not-allowed'
                }`}
              >
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </div>
        <p className="text-center font-mono text-[10px] text-[#444] mt-3">
          Forge runs models locally via Ollama · Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
