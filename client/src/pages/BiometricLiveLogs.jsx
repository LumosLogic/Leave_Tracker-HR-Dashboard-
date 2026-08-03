import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Terminal as TerminalIcon, ShieldCheck, HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function BiometricLiveLogs() {
  const { token, user, org } = useAuth();
  const [logs, setLogs] = useState([
    { text: `Lumos Logic ADMS v4.2.0 - Core Engine initialized.`, type: 'info' },
    { text: `Authenticating stream as ${user?.name}... [OK]`, type: 'info' },
    { text: `Establishing encrypted socket to device queue for Org ID ${user?.organization_id}...`, type: 'info' }
  ]);
  
  const endRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    // Auto-scroll logic if user hasn't scrolled up manually
    if (containerRef.current) {
        const { scrollHeight, clientHeight, scrollTop } = containerRef.current;
        const isNearBottom = scrollHeight - clientHeight - scrollTop < 150;
        if (isNearBottom) {
            endRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }
  }, [logs]);

  useEffect(() => {
    if (!token) return;

    const url = `${import.meta.env.VITE_API_URL}/biometric/live-logs?token=${token}`;
    const source = new EventSource(url);

    source.onopen = () => {
        setLogs(prev => [...prev.slice(-200), { text: `[SYSTEM] SSE Tunnel connected. Listening for real-time packets...`, type: 'success' }]);
    };

    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false });
        
        let type = 'info';
        if (data.message.includes('REJECTED/EMPTY PAYLOAD')) type = 'warning';
        if (data.message.includes('Force-sync scheduled')) type = 'accent';
        if (data.message.includes('Sending GET ATTLOG')) type = 'accent';
        
        setLogs(prev => {
          const newLogs = [...prev, { text: `[${time}] ${data.message}`, type }];
          return newLogs.slice(-200); // keep max 200 logs to prevent memory leak
        });
      } catch (err) {}
    };

    source.onerror = (e) => {
      setLogs(prev => [...prev.slice(-200), { text: `[ERROR] Connection to remote server interrupted. Attempting reconnect...`, type: 'error' }]);
      // EventSource auto-reconnects, no explicit logic needed unless it hangs
    };

    return () => source.close();
  }, [token]);

  return (
    <div className="flex flex-col h-full bg-[#111] rounded-xl overflow-hidden shadow-2xl border border-[#333]">
      {/* Shell Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#1a1a1a] border-b border-[#222]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
        </div>
        <div className="text-xs text-[#a0a0a0] flex items-center justify-center gap-2 flex-col md:flex-row md:mx-auto font-mono opacity-80 select-none">
          <span className="flex items-center gap-1.5"><TerminalIcon size={13} />  /var/log/adms-stream</span>
          <span className="hidden md:inline px-2">|</span>
          <span className="flex items-center gap-1.5"><ShieldCheck size={13} /> TLS Verified</span>
          <span className="hidden md:inline px-2">|</span>
          <span className="flex items-center gap-1.5"><HardDrive size={13} /> Socket Mode</span>
        </div>
      </div>

      {/* Terminal View area */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#090909] font-mono text-[13px] leading-relaxed selection:bg-[#3525cd] selection:text-white pb-10"
      >
        <div className="space-y-1">
            {logs.map((L, i) => (
            <div key={i} className={cn(
                "break-all whitespace-pre-wrap tracking-wide transition-opacity duration-200",
                L.type === 'error' ? "text-red-400" :
                L.type === 'warning' ? "text-[#fcd34d]" :
                L.type === 'success' ? "text-green-400 font-bold" :
                L.type === 'accent' ? "text-[#3be8b0] font-bold" :
                "text-[#a5b4fc]"
            )}>
                {L.text}
            </div>
            ))}
            {/* Blinking cursor */}
            <div className="inline-block w-2 h-4 bg-white/60 animate-pulse mt-2 ml-1" />
        </div>
        <div ref={endRef} />
      </div>
    </div>
  );
}
