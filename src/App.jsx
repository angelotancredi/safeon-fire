import React, { useState, useEffect } from 'react';
import RadioButton from './components/RadioButton';
import MapView from './components/MapView';
import SettingsView from './components/SettingsView';
import { WebRTCProvider, useWebRTC } from './contexts/WebRTCContext';
import { Wifi, Battery, MapPin, Menu, User, Bug, AlertCircle, RotateCw, Radio } from 'lucide-react';

// v86: Restored Tactical UI + Global Context
const BUILD_ID = "BUILD-2026-02-11-V86";

function AppContent() {
  const [globalError, setGlobalError] = useState(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [activeTab, setActiveTab] = useState('RADIO'); // 'RADIO', 'SQUAD', 'MAP', 'LOG', 'STG'
  // useWebRTC() hook call removed here as it was unused in AppContent. Sub-components manage their own context.

  useEffect(() => {
    const handleError = (msg, url, line, col, error) => {
      const details = `${msg}\nStack: ${error?.stack || 'N/A'}\nAt: ${url}:${line}:${col}`;
      setGlobalError(details);
      console.error("[GlobalError]", details);
      return false;
    };

    const handleRejection = (event) => {
      const details = `Unhandled Rejection: ${event.reason?.message || event.reason}\nStack: ${event.reason?.stack || 'N/A'}`;
      setGlobalError(details);
      console.error("[UnhandledRejection]", details);
    };

    window.onerror = handleError;
    window.onunhandledrejection = handleRejection;

    return () => {
      window.onerror = null;
      window.onunhandledrejection = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col bg-tactical-bg text-tactical-fg font-sans overflow-hidden select-none safe-bottom">
      {/* Global Error Box */}
      {globalError && (
        <div
          style={{
            background: '#FFF5F5',
            color: '#111827',
            padding: 16,
            fontSize: 11,
            whiteSpace: 'pre-wrap',
            zIndex: 9999,
            borderBottom: '4px solid #EF4444',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            maxHeight: '40vh',
            overflowY: 'auto',
            boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <AlertCircle className="w-4 h-4 mr-2 text-tactical-danger" />
              <b className="text-sm">RUNTIME CRASH</b>
            </div>
            <button
              onClick={() => setGlobalError(null)}
              className="bg-tactical-danger text-white px-3 py-1 rounded-lg text-[11px] font-black tracking-wide active:scale-[0.98]"
            >
              DISMISS
            </button>
          </div>
          <div className="bg-white p-2 rounded-lg border border-red-200">
            {globalError}
          </div>
        </div>
      )}

      {/* Top Header: Restored Tactical Center-Branding */}
      <header className="relative h-20 flex items-center justify-center px-4 border-b border-tactical-border bg-white shrink-0">
        <div className="flex flex-col items-center">
          <h1 className="text-[32px] font-cursive leading-none tracking-tight text-tactical-accent mt-1">SafeOn</h1>
          <span className="text-[10px] text-tactical-muted font-black uppercase tracking-[0.3em] mt-3">tactical voip</span>
        </div>

        <div className="absolute right-4 flex items-center space-x-2">
          <button
            onClick={() => window.location.reload()}
            className="h-10 w-10 rounded-xl grid place-items-center border border-tactical-border bg-white text-tactical-muted transition active:scale-[0.96] hover:bg-tactical-surface focus:outline-none"
          >
            <RotateCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            className={`h-10 w-10 rounded-xl grid place-items-center border transition active:scale-[0.96] focus:outline-none ${showDebugPanel
              ? 'bg-tactical-accent text-white border-tactical-accent'
              : 'bg-white text-tactical-muted border-tactical-border hover:bg-tactical-surface'
              }`}
          >
            <Bug className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Area: Restored Radial Gradient Effect */}
      <main className="flex-1 min-h-0 flex flex-col items-stretch justify-start relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(900px_400px_at_50%_0%,rgba(255,87,34,0.08),transparent_60%)]" />
        <div className="relative flex-1 min-h-0 flex flex-col">
          {activeTab === 'RADIO' && <RadioButton />}
          {activeTab === 'SQUAD' && (
            <div className="flex-1 overflow-y-auto px-4 pt-5 pb-20 custom-scrollbar">
              <SquadView />
            </div>
          )}
          {activeTab === 'MAP' && <MapView />}
          {activeTab === 'LOG' && (
            <div className="flex-1 flex flex-col items-center justify-center text-tactical-muted text-[10px] uppercase tracking-[0.4em] opacity-40">
              <Wifi className="w-12 h-12 mb-4" />
              Log Engine Initializing...
            </div>
          )}
          {activeTab === 'STG' && <SettingsView />}
        </div>
      </main>

      {/* Bottom Navigation: Restored High-Fidelity Style */}
      <footer className="grid grid-cols-5 gap-1 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] bg-white border-t border-tactical-border shrink-0">
        <NavButton
          icon={<Radio className="w-5 h-5" />}
          label="RADIO"
          active={activeTab === 'RADIO'}
          onClick={() => setActiveTab('RADIO')}
        />
        <NavButton
          icon={<User className="w-5 h-5" />}
          label="SQUAD"
          active={activeTab === 'SQUAD'}
          onClick={() => setActiveTab('SQUAD')}
        />
        <NavButton
          icon={<MapPin className="w-5 h-5" />}
          label="MAP"
          active={activeTab === 'MAP'}
          onClick={() => setActiveTab('MAP')}
        />
        <NavButton
          icon={<Wifi className="w-5 h-5" />}
          label="LOG"
          active={activeTab === 'LOG'}
          onClick={() => setActiveTab('LOG')}
        />
        <NavButton
          icon={<Menu className="w-5 h-5" />}
          label="STG"
          active={activeTab === 'STG'}
          onClick={() => setActiveTab('STG')}
        />
      </footer>

      {/* Connection Diagnostics: Restored Tactical Overlay */}
      {showDebugPanel && <DebugPanel setShowDebugPanel={setShowDebugPanel} />}
    </div>
  );
}

// Wrapper to provide context
function App() {
  return (
    <WebRTCProvider>
      <AppContent />
    </WebRTCProvider>
  );
}

// Sub-components: Restored Design Logic
const NavButton = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center py-2 rounded-2xl transition-all active:scale-[0.985] focus:outline-none ${active
      ? "bg-tactical-accent/10 border-tactical-accent/30 shadow-inner"
      : "bg-tactical-surface border-tactical-border"
      }`}
  >
    <div className={active ? "text-tactical-accent" : "text-tactical-muted"}>{icon}</div>
    <span className={`text-[10px] mt-1 font-black tracking-widest uppercase ${active ? "text-tactical-accent" : "text-tactical-muted"
      }`}>{label}</span>
  </button>
);

const SquadView = () => {
  const { peers, isConnected, peerId, talkingPeers } = useWebRTC();

  const formatId = (id) => {
    if (!id) return "...";
    const cleanId = id.split('-').pop();
    return `삼정-${cleanId.slice(0, 4).toUpperCase()}`;
  };

  return (
    <div className="flex-1 flex flex-col w-full min-h-0">
      <div className="flex items-center justify-between mb-3 px-2">
        <h2 className="text-[13px] font-black tracking-[0.2em] text-tactical-muted uppercase flex items-center">
          <User className="w-3.5 h-3.5 mr-2" /> Active Squad
        </h2>
        <span className="text-[10px] font-mono font-bold text-tactical-muted opacity-80">{peers.length + (isConnected ? 1 : 0)} Online</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {/* Local User First */}
        {isConnected && (
          <div className="p-4 bg-white border border-tactical-accent/30 rounded-2xl shadow-sm flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 rounded-full animate-pulse bg-tactical-accent" />
              <div>
                <div className="text-[14px] font-black text-tactical-fg tracking-tight">
                  {formatId(peerId)} (YOU)
                </div>
                <div className="text-[9px] text-tactical-muted font-mono uppercase">
                  Connected • Signal Optimal
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Remote Peers */}
        {peers.map(id => (
          <div key={id} className={`p-4 bg-white border rounded-2xl shadow-sm flex items-center justify-between transition-all ${talkingPeers.has(id) ? 'border-tactical-ok ring-1 ring-tactical-ok/20' : 'border-tactical-border'
            }`}>
            <div className="flex items-center space-x-3">
              <div className={`w-2 h-2 rounded-full ${talkingPeers.has(id) ? 'bg-tactical-ok animate-pulse' : 'bg-tactical-muted/40'}`} />
              <div>
                <div className="text-[14px] font-black text-tactical-fg tracking-tight">
                  {formatId(id)}
                </div>
                <div className="text-[9px] text-tactical-muted font-mono uppercase">
                  Node Link • Signal Stable
                </div>
              </div>
            </div>
            {talkingPeers.has(id) && (
              <span className="bg-tactical-ok/10 text-tactical-ok text-[9px] font-black px-2 py-1 rounded-lg border border-emerald-200 animate-pulse">
                TALKING...
              </span>
            )}
          </div>
        ))}

        {peers.length === 0 && !isConnected && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-40">
            <Wifi className="w-8 h-8 mb-4 " />
            <p className="text-[10px] font-black tracking-widest uppercase">No Active Squad Members</p>
          </div>
        )}
      </div>
    </div>
  );
};

const DebugPanel = ({ setShowDebugPanel }) => {
  const { logs, startSystem, peerId, isConnected, peerStatus } = useWebRTC();

  return (
    <div className="fixed top-[88px] left-4 right-4 bg-white border border-tactical-border p-4 rounded-3xl z-[9999] font-mono text-[10px] text-tactical-muted space-y-3 shadow-[0_18px_45px_rgba(0,0,0,0.18)] flex flex-col max-h-[70vh]">
      <div className="text-tactical-fg font-black mb-1 flex justify-between items-center px-1">
        <span className="tracking-widest flex items-center">
          <Bug className="w-3.5 h-3.5 mr-2 text-tactical-accent" /> SYSTEM DIAGNOSTICS
        </span>
        <button
          onClick={() => setShowDebugPanel(false)}
          className="bg-tactical-surface text-tactical-fg px-3 py-1.5 rounded-xl border border-tactical-border font-black active:scale-[0.96] focus:outline-none"
        >
          CLOSE
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3 bg-tactical-surface rounded-2xl border border-tactical-border">
        <div>PEER ID: <span className="text-tactical-fg font-black">{peerId?.slice(-6) || '---'}</span></div>
        <div>LINK: <span className={`font-black ${isConnected ? 'text-tactical-ok' : 'text-tactical-danger'}`}>{peerStatus}</span></div>
        <div className="col-span-2 text-[9px] opacity-60">BUILD: {BUILD_ID}</div>
      </div>

      <button
        onClick={startSystem}
        className="w-full py-3 bg-tactical-fg text-white rounded-2xl font-black text-[11px] tracking-widest flex items-center justify-center space-x-2 active:scale-[0.97] transition-all"
      >
        <RotateCw className="w-3.5 h-3.5" />
        <span>FORCE RE-SYNC ENGINE</span>
      </button>

      <div className="bg-black rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0 border border-gray-800">
        <div className="p-2.5 bg-gray-900 border-b border-gray-800 text-[8px] font-black tracking-widest text-tactical-muted uppercase">Realtime Engine Logs</div>
        <div className="p-3 font-mono text-[9px] space-y-1.5 overflow-y-auto text-green-400 flex-1 custom-scrollbar">
          {logs.length === 0 ? '> Initializing diagnostics...' : logs.map((log, i) => (
            <div key={i} className="leading-tight border-l border-green-900/40 pl-2 py-0.5 break-all">
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;
