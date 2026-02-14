import React, { useState, useEffect, useMemo } from 'react';
import RadioButton from './components/RadioButton';
import MapView from './components/MapView';
import SettingsView from './components/SettingsView';
import { WebRTCProvider } from './contexts/WebRTCContext';
import { useWebRTC } from './hooks/useWebRTC';
import { Wifi, Battery, MapPin, Menu, User, Users, Bug, AlertCircle, RotateCw, Radio } from 'lucide-react';

// v86: Restored Tactical UI + Global Context
const BUILD_ID = "BUILD-2026-02-11-V86";

function AppContent() {
  const [globalError, setGlobalError] = useState(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [activeTab, setActiveTab] = useState('RADIO'); // 'RADIO', 'SQUAD', 'MAP', 'LOG', 'STG'
  const rtc = useWebRTC();

  // v114: Safety Mute on Tab Switch
  // Prevents PTT from getting stuck if the user switches tabs while holding the button (especially on iOS).
  useEffect(() => {
    if (activeTab !== 'RADIO') {
      rtc.setMuted?.(true);
    }
  }, [activeTab, rtc]);

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
          {/* v114: Persistent Mounting with Hidden Class */}
          {/* This ensures map state, scroll positions, and PTT listeners remain active but hidden */}

          <div className={activeTab === 'RADIO' ? 'block h-full' : 'hidden'}>
            <RadioButton rtc={rtc} />
          </div>

          <div className={activeTab === 'SQUAD' ? 'block h-full' : 'hidden'}>
            <SquadView rtc={rtc} />
          </div>

          <div className={activeTab === 'MAP' ? 'block h-full' : 'hidden'}>
            <MapView rtc={rtc} />
          </div>

          <div className={activeTab === 'LOG' ? 'flex h-full flex-col items-center justify-center' : 'hidden'}>
            <div className="flex flex-col items-center justify-center text-tactical-muted text-[10px] uppercase tracking-[0.4em] opacity-40">
              <Wifi className="w-12 h-12 mb-4" />
              Log Engine Initializing...
            </div>
          </div>

          <div className={activeTab === 'STG' ? 'block h-full' : 'hidden'}>
            <SettingsView rtc={rtc} />
          </div>
        </div>
      </main>

      {/* Bottom Navigation: Restored High-Fidelity Style */}
      <footer className="grid grid-cols-4 gap-1 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] bg-white border-t border-tactical-border shrink-0">
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

const SquadView = ({ rtc }) => {
  const { peers, isConnected, peerId, talkingPeers, availableRooms, settings } = rtc;

  // ✅ FIX 2 — SquadView 채널명 소스 통일 (단일 규칙)
  const getLabel = (id) => String(id || '').split('@@')[0];

  // callsign도 동일 규칙 적용
  const roomLabel = getLabel(settings.roomId);
  const shortId = (id) => (id ? String(id).slice(-4) : "----");
  const callsign = (id) => `${roomLabel}-${shortId(id)}`;

  // ✅ FIX 3 — 기존 잘못 생성된 채널 정리 (0명인 방 숨김)
  const effectiveRooms = availableRooms
    .filter(r => r.userCount > 0)
    .map((r) => {
      // 내가 접속한 방이면 인원수 +1 (내 자신 포함) 보정
      if (r.id === settings?.roomId && isConnected) {
        return { ...r, userCount: Math.max(r.userCount, peers.length + 1) };
      }
      return r;
    });

  if (isConnected && settings?.roomId && !effectiveRooms.find((r) => r.id === settings.roomId)) {
    effectiveRooms.unshift({
      id: settings.roomId,
      userCount: peers.length + 1
    });
  }

  return (
    <div className="flex-1 flex flex-col w-full min-h-0 bg-tactical-bg p-4 overflow-y-auto">
      <div className="max-w-md mx-auto w-full space-y-6">
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-[14px] font-black tracking-[0.2em] text-tactical-muted uppercase flex items-center">
            <Users className="w-4 h-4 mr-2" /> Sector Status
          </h2>
          <span className="text-[10px] font-mono font-bold text-tactical-muted opacity-80">
            {effectiveRooms.length} Active Channels
          </span>
        </div>

        <div className="space-y-4">
          {effectiveRooms.length > 0 ? (
            effectiveRooms.map((room) => {
              const roomName = getLabel(room.id);
              const isActive = room.id === settings?.roomId && isConnected;

              return (
                <div
                  key={room.id}
                  className={`bg-white border rounded-[32px] overflow-hidden transition-all shadow-sm ${isActive
                    ? "border-tactical-accent/40 ring-1 ring-tactical-accent/5"
                    : "border-tactical-border"
                    }`}
                >
                  {/* Channel Header */}
                  <div className={`p-4 flex items-center justify-between ${isActive ? "bg-tactical-accent/5" : ""}`}>
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isActive ? "bg-tactical-accent text-white" : "bg-tactical-surface text-tactical-muted"
                          }`}
                      >
                        <Radio className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-[14px] font-black text-tactical-fg uppercase tracking-tight flex items-center">
                          {roomName}
                          {isActive && (
                            <span className="ml-2 px-1.5 py-0.5 bg-tactical-accent text-white text-[8px] rounded uppercase font-black">
                              Online
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-tactical-muted font-bold uppercase opacity-60">
                          Frequency Shared • {room.userCount} Nodes
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Members List (Only for Active Channel) */}
                  {isActive && (
                    <div className="px-4 pb-4 space-y-2">
                      <div className="pt-2 border-t border-tactical-border/50 space-y-2">
                        {/* Me */}
                        <div className="p-3 bg-tactical-surface rounded-2xl flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-2 h-2 rounded-full bg-tactical-accent animate-pulse" />
                            <span className="text-[12px] font-black text-tactical-fg">
                              {callsign(peerId)} <span className="opacity-40 text-[10px] ml-1">(YOU)</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-tactical-accent uppercase">MASTER</span>
                          </div>
                        </div>

                        {/* Peers */}
                        {peers.map((peer) => (
                          <div
                            key={peer}
                            className="p-3 bg-white border border-tactical-border rounded-2xl flex items-center justify-between"
                          >
                            <div className="flex items-center space-x-3">
                              <div
                                className={`w-2 h-2 rounded-full ${talkingPeers.has(peer) ? "bg-tactical-ok animate-pulse" : "bg-tactical-muted/40"
                                  }`}
                              />
                              <span className="text-[12px] font-bold text-tactical-fg">{callsign(peer)}</span>
                            </div>
                            {talkingPeers.has(peer) && (
                              <span className="text-[8px] font-black text-tactical-ok uppercase">Talking...</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-20 flex flex-col items-center justify-center opacity-40">
              <Wifi className="w-10 h-10 mb-4" />
              <p className="text-[10px] font-black tracking-widest uppercase">No Active Sectors Found</p>
            </div>
          )}
        </div>
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
