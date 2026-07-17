import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Server, Copy, Info } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { apiGet } from '@/lib/api';

export default function BiometricSettings() {
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['biometric-config'],
    queryFn:  () => apiGet('/settings/biometric-config'),
  });

  const serverUrl = data?.adms_url || data?.server_url || '—';

  function copyUrl() {
    if (serverUrl === '—') return;
    navigator.clipboard.writeText(serverUrl).then(() => toast('URL copied!', 'success'));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">Biometric Settings</h1>
        <p className="page-subtitle">ZKTeco ADMS server configuration for biometric device push</p>
      </div>

      {isLoading ? (
        <div className="loading"><div className="spinner" />Loading config…</div>
      ) : (
        <div className="space-y-5 max-w-2xl">
          {/* ADMS URL card */}
          <div className="bg-white rounded-2xl border border-[#c7c4d8] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#e7eefe] bg-[#f8f9fe]">
              <div className="flex items-center gap-2">
                <Server size={16} className="text-[#3525cd]" />
                <h2 className="font-black text-[#151c27] text-sm">ADMS Server Configuration</h2>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="text-[0.68rem] font-black text-[#777587] uppercase tracking-wider mb-2 block">
                  ADMS Server URL
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 font-mono text-sm bg-[#f0f3ff] border border-[#c7c4d8] rounded-xl px-4 py-3 text-[#151c27] select-all break-all">
                    {serverUrl}
                  </div>
                  <button onClick={copyUrl}
                    className="flex items-center gap-1.5 border border-[#c7c4d8] bg-white hover:bg-[#f0f3ff] text-[#464555] text-xs font-bold px-3 py-3 rounded-xl transition-colors flex-shrink-0">
                    <Copy size={13} />
                    Copy
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#f0f3ff] border border-[#c7c4d8]">
                <div className="flex items-start gap-2">
                  <Info size={14} className="text-[#3525cd] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-[#3525cd] mb-1">How to configure your ZKTeco device</p>
                    <ol className="text-xs text-[#464555] space-y-1 list-decimal list-inside">
                      <li>Open the device's web interface or use the ZKTeco configuration tool</li>
                      <li>Navigate to <strong>ADMS</strong> or <strong>Cloud Server Settings</strong></li>
                      <li>Set the <strong>Server Address</strong> to the URL shown above</li>
                      <li>Set <strong>HTTPS</strong> based on whether the URL uses <code className="bg-white px-1 rounded">https://</code></li>
                      <li>Save settings — the device will begin pushing punch data automatically</li>
                    </ol>
                  </div>
                </div>
              </div>

              {data?.port && (
                <div>
                  <label className="text-[0.68rem] font-black text-[#777587] uppercase tracking-wider mb-2 block">Port</label>
                  <span className="font-mono text-sm font-bold bg-[#f0f3ff] border border-[#c7c4d8] px-3 py-1.5 rounded-lg text-[#3525cd]">
                    {data.port}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Read-only notice */}
          <div className="flex items-start gap-2 text-xs text-[#777587] px-1">
            <Info size={12} className="mt-0.5 flex-shrink-0" />
            <span>
              This configuration is managed via environment variables on the server (<code className="bg-[#f0f3ff] px-1 rounded">ADMS_URL</code>).
              Contact your system administrator to update it.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
