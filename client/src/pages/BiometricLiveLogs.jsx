import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function BiometricLiveLogs() {
  const { token, user } = useAuth();
  const [logs, setLogs] = useState([
    { text: `Lumos Logic ADMS - Engine Initialized`, type: 'info', time: new Date().toLocaleTimeString('en-US', {hour12:false}) },
    { text: `Socket channel secured for ${user?.name}`, type: 'success', time: new Date().toLocaleTimeString('en-US', {hour12:false}) }
  ]);
  const [isConnected, setIsConnected] = useState(false);
  
  const endRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
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

    // Use the absolute path directly so Vite proxy reliably catches it as /api rules
    const url = `/api/biometric/live-logs?token=${token}`;
    const source = new EventSource(url);

    source.onopen = () => {
        setIsConnected(true);
        setLogs(prev => [...prev.slice(-200), { 
            text: `Connected to live device queue. Waiting for packets...`, 
            type: 'info', 
            time: new Date().toLocaleTimeString('en-US', {hour12:false}) 
        }]);
    };

    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false });
        
        let type = 'info';
        if (data.message.includes('REJECTED/EMPTY PAYLOAD')) type = 'warning';
        if (data.message.includes('Force-sync scheduled')) type = 'accent';
        if (data.message.includes('Sending GET ATTLOG')) type = 'accent';
        if (data.message.includes('received 0 ATTLOG lines')) type = 'warning';
        
        setLogs(prev => {
          const newLogs = [...prev, { text: data.message, type, time }];
          return newLogs.slice(-200);
        });
      } catch (err) {}
    };

    source.onerror = (e) => {
      setIsConnected(false);
      setLogs(prev => [...prev.slice(-200), { 
          text: `Connection lost. Automatically reconnecting...`, 
          type: 'error',
          time: new Date().toLocaleTimeString('en-US', {hour12:false}) 
      }]);
    };

    return () => source.close();
  }, [token]);

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-[#e7eefe] overflow-hidden">
      <div className="px-6 py-5 border-b border-[#e7eefe] flex items-center justify-between bg-white z-10 flex-shrink-0">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-[#151c27] tracking-tight flex items-center gap-2">
            <Activity className="text-[#3525cd]" size={22} />
            Device Live Stream
          </h1>
          <p className="text-sm text-[#777587]">Monitor physical device communication packets in real-time.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f9f9ff] text-xs font-semibold border border-[#e7eefe]">
          <div className={cn("w-2 h-2 rounded-full animate-pulse", isConnected ? "bg-emerald-500" : "bg-rose-500")} />
          <span className="text-[#464555]">{isConnected ? 'Socket Active' : 'Connecting...'}</span>
        </div>
      </div>

      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#f9f9ff]"
      >
        <div className="max-w-5xl mx-auto space-y-3 pb-10">
            {logs.map((L, i) => (
            <div key={i} className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 p-4 rounded-xl bg-white border border-[#e7eefe] shadow-sm transition-all hover:border-[#c7c4d8]">
                <div className="flex items-center gap-2 w-auto md:w-28 flex-shrink-0 text-[#777587]">
                    <span className="text-[0.7rem] font-mono bg-[#f0f3ff] px-2 py-1 rounded font-black tracking-wide text-[#3525cd]">
                        {L.time}
                    </span>
                </div>
                <div className={cn(
                    "flex-1 text-[0.85rem] font-semibold tracking-wide",
                    L.type === 'error' ? "text-rose-600 font-bold" :
                    L.type === 'warning' ? "text-amber-600" :
                    L.type === 'success' ? "text-emerald-600" :
                    L.type === 'accent' ? "text-[#3525cd] font-bold" :
                    "text-[#464555]"
                )}>
                    {L.text}
                </div>
            </div>
            ))}
        </div>
        <div ref={endRef} />
      </div>
    </div>
  );
}
