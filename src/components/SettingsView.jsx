import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Volume2, Mic, Smartphone, MapPin, Save, Info, ChevronRight, LogOut } from 'lucide-react';

const SettingsView = ({ rtc }) => {
    try {
        const context = rtc;
        // Emergency Fallback as requested by user
        const settings = context?.settings || {
            roomId: 'safe-on-alpha',
            squelchVol: 50,
            micSens: 50,
            useVibration: true
        };
        const updateSettings = context?.updateSettings || (() => { });
        const peerId = context?.peerId || 'OFFLINE';

        const [tempRoomId, setTempRoomId] = useState(settings?.roomId?.split('@@')[0] || '');

        const handleSaveRoom = () => {
            if (tempRoomId.trim()) {
                const activePin = settings?.roomId?.split('@@')[1] || '';
                const fullId = activePin ? `${tempRoomId.trim()}@@${activePin}` : tempRoomId.trim();
                updateSettings({ roomId: fullId });
            }
        };

        // v105: Keep tempRoomId in sync with settings when external changes occur (like joining from list)
        useEffect(() => {
            setTempRoomId(settings?.roomId?.split('@@')[0] || '');
        }, [settings?.roomId]);

        if (!settings) {
            return (
                <div className="p-8 text-center bg-tactical-surface m-4 rounded-3xl border border-tactical-border">
                    <span className="text-[11px] font-black text-tactical-danger uppercase tracking-widest">Context Load Fail</span>
                </div>
            );
        }

        return (
            <div className="flex-1 overflow-y-auto px-4 pt-5 pb-20 custom-scrollbar">
                <div className="max-w-md mx-auto space-y-6">

                    {/* Section: Radio Connectivity */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between mb-3 px-2">
                            <h3 className="text-[13px] font-black text-tactical-muted uppercase tracking-[0.2em] flex items-center">
                                <MapPin className="w-3.5 h-3.5 mr-2" /> Sector Assignment
                            </h3>
                        </div>

                        <div className="bg-white border border-tactical-border rounded-3xl p-5 shadow-sm space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black text-tactical-fg ml-1 uppercase">Tactical Room ID</label>
                                <div className="flex space-x-2">
                                    <input
                                        type="text"
                                        value={tempRoomId}
                                        onChange={(e) => setTempRoomId(e.target.value)}
                                        className="flex-1 bg-tactical-surface border border-tactical-border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-tactical-accent/20 transition-all font-mono uppercase"
                                        placeholder="ENTER ROOM ID..."
                                    />
                                    <button
                                        onClick={handleSaveRoom}
                                        disabled={tempRoomId === settings.roomId}
                                        className={`px-6 rounded-xl font-black text-[11px] tracking-widest transition-all active:scale-[0.95] ${tempRoomId === settings.roomId
                                            ? "bg-tactical-surface text-tactical-muted border border-tactical-border"
                                            : "bg-tactical-accent text-white shadow-lg shadow-tactical-accent/20"
                                            }`}
                                    >
                                        APPLY
                                    </button>
                                </div>
                                <p className="text-[9px] text-tactical-muted ml-1 opacity-70">모든 대원이 동일한 ID를 입력해야 교신이 가능합니다.</p>
                            </div>

                            <div className="pt-2 border-t border-tactical-border/50 flex items-center justify-between">
                                <span className="text-[10px] font-black text-tactical-muted uppercase tracking-tight">Node Identity</span>
                                <span className="text-[11px] font-mono font-bold text-tactical-fg bg-tactical-surface px-3 py-1 rounded-lg border border-tactical-border">
                                    {peerId?.toUpperCase() || '---'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Section: Audio Profile */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between mb-3 px-2">
                            <h3 className="text-[13px] font-black text-tactical-muted uppercase tracking-[0.2em] flex items-center">
                                <Volume2 className="w-3.5 h-3.5 mr-2" /> Audio Profile
                            </h3>
                        </div>

                        <div className="bg-white border border-tactical-border rounded-3xl p-5 shadow-sm space-y-6">
                            {/* Squelch Volume */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                    <div className="space-y-1">
                                        <span className="text-[11px] font-black text-tactical-fg uppercase block">Squelch Volume</span>
                                        <span className="text-[11px] text-tactical-muted uppercase font-bold tracking-tight">수신 시작/종료 효과음 크기</span>
                                    </div>
                                    <span className="text-[13px] font-black text-tactical-accent font-mono">{settings?.squelchVol || 0}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={settings?.squelchVol || 50}
                                    onChange={(e) => updateSettings({ squelchVol: parseInt(e.target.value) })}
                                    className="w-full h-1.5 bg-tactical-surface rounded-lg appearance-none cursor-pointer accent-tactical-accent"
                                />
                            </div>

                            {/* Mic Sensitivity */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                    <div className="space-y-1">
                                        <span className="text-[11px] font-black text-tactical-fg uppercase block">Mic Sensitivity</span>
                                        <span className="text-[11px] text-tactical-muted uppercase font-bold tracking-tight">마이크 입력 감도 조절</span>
                                    </div>
                                    <span className="text-[13px] font-black text-tactical-accent font-mono">{settings?.micSens || 0}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={settings?.micSens || 50}
                                    onChange={(e) => updateSettings({ micSens: parseInt(e.target.value) })}
                                    className="w-full h-1.5 bg-tactical-surface rounded-lg appearance-none cursor-pointer accent-tactical-accent"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section: Haptic & Feedback */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between mb-3 px-2">
                            <h3 className="text-[13px] font-black text-tactical-muted uppercase tracking-[0.2em] flex items-center">
                                <Smartphone className="w-3.5 h-3.5 mr-2" /> Haptic Feedback
                            </h3>
                        </div>

                        <div className="bg-white border border-tactical-border rounded-3xl p-5 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <span className="text-[11px] font-black text-tactical-fg uppercase block">Haptic Vibration</span>
                                    <span className="text-[11px] text-tactical-muted uppercase font-bold tracking-tight">발신/수신 시 진동 피드백</span>
                                </div>
                                <button
                                    onClick={() => updateSettings({ useVibration: !settings?.useVibration })}
                                    className={`w-12 h-6 rounded-full relative transition-colors duration-200 focus:outline-none ${settings?.useVibration ? 'bg-tactical-accent' : 'bg-tactical-border'
                                        }`}
                                >
                                    <motion.div
                                        animate={{ x: settings?.useVibration ? 24 : 4 }}
                                        className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-sm"
                                    />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Section: System Info */}
                    <div className="space-y-3">
                        <div className="bg-tactical-surface border border-tactical-border rounded-3xl p-6 shadow-sm border-dashed">
                            <div className="flex items-center space-x-4">
                                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-tactical-border">
                                    <Info className="w-6 h-6 text-tactical-muted" />
                                </div>
                                <div>
                                    <h4 className="text-[12px] font-black text-tactical-fg uppercase">SafeOn Tactical v1.0</h4>
                                    <p className="text-[10px] text-tactical-muted font-bold tracking-tight">BUILD 2026.02.13-STG-FIX</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pb-10 flex justify-center opacity-30 select-none">
                        <span className="text-[12px] font-cursive text-tactical-muted italic">Stay Safe, Be Ready.</span>
                    </div>

                </div>
            </div>
        );
    } catch (err) {
        return (
            <div className="p-8 m-4 bg-red-50 border-2 border-red-200 rounded-3xl text-red-900">
                <h2 className="text-sm font-black uppercase tracking-widest mb-2">STG Load Error</h2>
                <div className="bg-white p-4 rounded-xl font-mono text-[10px] whitespace-pre-wrap break-all border border-red-100 italic">
                    {err.name}: {err.message}
                </div>
                <p className="mt-4 text-[10px] uppercase font-bold tracking-tighter opacity-70">
                    브라우저 캐시를 삭제하거나 페이지를 새로고침 해보세요.
                </p>
            </div>
        );
    }
};

export default SettingsView;
