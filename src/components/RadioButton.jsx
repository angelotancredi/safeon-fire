import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, AlertCircle, Wifi, Users, Terminal, ChevronDown, ChevronUp, Volume2, RadioTower, Plus, X, Hash } from 'lucide-react';
import { useWebRTC } from '../hooks/useWebRTC';

// Tactical Radio UI — Light Theme Rebuild
const RadioButton = () => {
    const {
        peers, peerStatus, startSystem, setMuted, error, logs,
        isConnected, peerId, localStream, isTransmitting,
        activeTalkerId, activeVolume, settings,
        availableRooms, isLoadingRooms, fetchRooms, updateSettings
    } = useWebRTC();

    const [isRecording, setIsRecording] = useState(false);
    const [status, setStatus] = useState('OFFLINE');
    const [showDebug, setShowDebug] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [newRoomPin, setNewRoomPin] = useState('');
    const [isKeypadOpen, setIsKeypadOpen] = useState(false);
    const [keypadRoom, setKeypadRoom] = useState(null);
    const [inputPin, setInputPin] = useState('');
    const [pinError, setPinError] = useState(false);
    const animationFrameRef = useRef(null);
    const squelchStartAudioRef = useRef(null);
    const squelchStopAudioRef = useRef(null);

    // v79: Preload custom squelch sounds (Start and Stop)
    useEffect(() => {
        const startAudio = new Audio('/assets/sound/squelch.mp3');
        startAudio.preload = 'auto';
        startAudio.volume = 0.5;
        squelchStartAudioRef.current = startAudio;

        const stopAudio = new Audio('/assets/sound/squelch_stop.MP3');
        stopAudio.preload = 'auto';
        stopAudio.volume = 0.5;
        squelchStopAudioRef.current = stopAudio;
    }, []);

    // v81: Audio monitoring is now handled globally in useWebRTC.js
    // localLevel and its monitor loop have been removed to reduce redundant CPU usage.

    useEffect(() => {
        if (error) setStatus('ERROR');
        else if (isRecording) setStatus('TRANSMITTING');
        else if (peers.length > 0) setStatus('ONLINE');
        else if (isConnected) setStatus('STANDBY');
        else if (peerStatus === 'STARTING') setStatus('JOINING...');
        else setStatus('DISCONNECTED');
    }, [error, peers, isConnected, peerStatus, isRecording]);

    // v79: Differentiated squelch sounds based on action type
    const playSquelch = (type = 'start') => {
        try {
            const audio = type === 'start'
                ? squelchStartAudioRef.current
                : squelchStopAudioRef.current;

            if (audio) {
                audio.currentTime = 0; // Restart if still playing
                audio.volume = (settings?.squelchVol || 50) / 100;
                audio.play().catch(e => console.warn(`Squelch ${type} Play Fail:`, e));
            }
        } catch (e) {
            console.warn("Audio Squelch Error:", e);
        }
    };

    const handlePointerDown = (e) => {
        if (!isConnected) return;
        // v64: Pointer Capture (Lock events to this button even when moving outside)
        e.target.setPointerCapture(e.pointerId);
        startRecording();
    };

    const handlePointerUp = (e) => {
        if (!isConnected || !isRecording) return;
        stopRecording();
    };

    const startRecording = () => {
        setMuted(false);
        setIsRecording(true);
        playSquelch('start');
        if (settings?.useVibration && window.navigator.vibrate) window.navigator.vibrate(60);
    };

    const stopRecording = () => {
        setMuted(true);
        setIsRecording(false);
        playSquelch('stop');
        if (settings?.useVibration && window.navigator.vibrate) window.navigator.vibrate([30, 30, 30]);
    };

    const statusTone = (() => {
        if (error) return 'danger';
        if (status === 'SENDING') return 'danger';
        if (status === 'ONLINE') return 'ok';
        if (status === 'STANDBY') return 'warn';
        if (status === 'JOINING...') return 'warn';
        return 'neutral';
    })();

    return (
        <div className="flex-1 flex flex-col w-full h-full min-h-0 overflow-hidden relative">
            <div className="flex-1 min-h-0 overflow-y-auto w-full px-4 pt-4 custom-scrollbar">
                <div className="max-w-md mx-auto w-full space-y-4">
                    {/* TOP SECTION: Status Cards & Logs */}
                    <div className="flex flex-col space-y-2 w-full pt-1 shrink-0">
                        <div className="grid grid-cols-2 gap-2 w-full">
                            <StatusCard
                                label="SYSTEM"
                                value={status === 'DISCONNECTED' ? 'JOIN RADIO' : status}
                                tone={statusTone}
                                icon={error ? <AlertCircle className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
                                onClick={() => {
                                    if (isConnected) {
                                        setShowDebug(!showDebug);
                                    } else {
                                        setIsModalOpen(true);
                                        fetchRooms();
                                    }
                                }}
                            />
                            <StatusCard
                                label="PEERS"
                                value={`${peers.length} NODES`}
                                tone={peers.length > 0 ? 'ok' : 'neutral'}
                                icon={<Users className="w-4 h-4" />}
                            />
                        </div>

                        {/* Error Box */}
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-tactical-danger/10 border border-red-200 p-2 rounded-xl flex flex-col items-center w-full shadow-sm"
                            >
                                <div className="flex items-start space-x-2 w-full">
                                    <AlertCircle className="w-3.5 h-3.5 text-tactical-danger shrink-0 mt-0.5" />
                                    <span className="text-[10px] text-tactical-danger font-black leading-tight break-all">
                                        {error === 'CONNECTION_FAILED_STABLE'
                                            ? '연결 시도 3회 실패: 네트워크 상태를 확인하고 다시 시도하세요.'
                                            : error === 'TIMEOUT: JOIN FAILED'
                                                ? '접속 시간 초과: 응답이 늦어지고 있습니다. 다시 시도해 주세요.'
                                                : error}
                                    </span>
                                </div>
                            </motion.div>
                        )}

                        {/* Diagnostic Panel */}
                        <div className="w-full bg-white border border-tactical-border rounded-xl overflow-hidden shadow-sm">
                            <button
                                onClick={() => setShowDebug(!showDebug)}
                                className="w-full flex justify-between items-center px-3 py-2 bg-tactical-surface border-b border-tactical-border"
                            >
                                <span className="text-tactical-fg font-black text-[10px] uppercase flex items-center tracking-widest">
                                    <Terminal className="w-3.5 h-3.5 mr-2 text-tactical-muted" /> Diagnostic
                                </span>
                                {showDebug ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-tactical-muted" />
                                ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-tactical-muted" />
                                )}
                            </button>

                            {showDebug && (
                                <div className="px-3 py-2.5 font-mono text-[9px] text-tactical-muted space-y-1.5 max-h-40 overflow-y-auto bg-white">
                                    <div className="flex justify-between border-b border-tactical-border pb-1.5 mb-2 opacity-70 uppercase tracking-tight">
                                        <span>ID: {peerId?.slice(0, 8) || '...'}</span>
                                        <span>V.59</span>
                                    </div>
                                    <div className="space-y-1">
                                        {logs.map((log, i) => (
                                            <div key={i} className="leading-tight border-l-2 border-tactical-accent/30 pl-2.5 py-0.5">
                                                {log}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* BOTTOM SECTION: PTT Trigger - Fixed at bottom */}
            <div className="shrink-0 w-full bg-transparent pb-0.5 pt-2 flex flex-col items-center justify-center">
                <div className="max-w-md w-full flex flex-col items-center">
                    <div className="relative w-44 h-44 flex items-center justify-center">
                        <AnimatePresence>
                            {/* v90: VoiceWave now triggers during BOTH reception (activeTalkerId) and transmission (isRecording) */}
                            {(activeTalkerId || isRecording) && (
                                <VoiceWave level={activeVolume} />
                            )}
                        </AnimatePresence>

                        <motion.button
                            onPointerDown={handlePointerDown}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                            onContextMenu={(e) => e.preventDefault()}
                            onClick={() => {
                                if (!isConnected && peerStatus !== 'STARTING') {
                                    setIsModalOpen(true);
                                    fetchRooms();
                                }
                            }}
                            whileTap={{ scale: 0.96 }}
                            style={{ touchAction: 'none' }} // v64: Prevent scroll/zoom interference
                            className={[
                                "relative z-10 w-44 h-44 rounded-full flex flex-col items-center justify-center", // v66: Added z-10
                                "transition-all duration-200 border-2",
                                "shadow-[0_15px_40px_rgba(0,0,0,0.12)]",
                                "focus:outline-none focus:ring-4 focus:ring-tactical-accent/20",
                                isRecording
                                    ? "bg-[#22C55E] border-white/50" // v65: Signal Green
                                    : isConnected
                                        ? "bg-white border-[3px] border-tactical-accent" // v67: Flat tactical border
                                        : "bg-white border-tactical-border",
                                "overflow-hidden"
                            ].join(" ")}
                            aria-label={isConnected ? "Push to talk" : "Join radio"}
                        >
                            <div className="absolute inset-0 bg-[radial-gradient(150px_150px_at_35%_30%,rgba(255,255,255,0.4),transparent_60%)] pointer-events-none" />
                            <div className="absolute inset-0 bg-[radial-gradient(220px_220px_at_70%_80%,rgba(17,24,39,0.06),transparent_60%)] pointer-events-none" />

                            {!isConnected && peerStatus !== 'STARTING' ? (
                                <RadioTower className="w-12 h-12 text-tactical-muted mb-2" />
                            ) : isRecording ? (
                                <Volume2 className="w-12 h-12 text-white animate-pulse" />
                            ) : (
                                <Mic className="w-12 h-12 text-tactical-accent" />
                            )}

                            <span className={[
                                "mt-2 font-black tracking-widest text-[11px] uppercase",
                                (!isConnected && peerStatus !== 'STARTING') ? "text-tactical-fg" : (isRecording ? "text-white" : "text-tactical-fg")
                            ].join(" ")}>
                                {!isConnected && peerStatus !== 'STARTING'
                                    ? 'JOIN RADIO'
                                    : isRecording
                                        ? 'TRANSMITTING'
                                        : 'PUSH TO TALK'}
                            </span>

                            {/* Initializing Overlay */}
                            {peerStatus === 'STARTING' && (
                                <div className="absolute inset-0 bg-white/95 flex items-center justify-center z-10">
                                    <div className="flex flex-col items-center">
                                        <div className="w-8 h-8 border-4 border-tactical-accent border-t-transparent rounded-full animate-spin mb-3" />
                                        <span className="text-[10px] font-black text-tactical-fg tracking-widest uppercase">
                                            초기화 중...
                                        </span>
                                    </div>
                                </div>
                            )}
                        </motion.button>
                    </div>

                    {/* v82: Active Talker Indicator moved below the button */}
                    <div className="h-14 flex flex-col items-center justify-center mt-4">
                        <AnimatePresence mode="wait">
                            {activeTalkerId ? (
                                <motion.div
                                    key="talking"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="flex flex-col items-center space-y-1"
                                >
                                    <motion.div
                                        animate={{ opacity: [1, 0, 1] }}
                                        transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
                                        className="flex items-center space-x-2 bg-tactical-ok/10 px-4 py-2 rounded-full border border-emerald-200"
                                    >
                                        <span className="text-[12px] font-black text-tactical-ok tracking-wider uppercase">
                                            [{activeTalkerId === 'me' ? peerId : activeTalkerId}] 송신 중...
                                        </span>
                                    </motion.div>
                                </motion.div>
                            ) : isConnected ? (
                                <motion.span
                                    key="standby"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 0.3 }}
                                    className="text-[11px] font-black text-tactical-muted tracking-[0.4em] uppercase"
                                >
                                    대기 중
                                </motion.span>
                            ) : (
                                <motion.div
                                    key="idle"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex flex-col items-center"
                                >
                                    <div className="text-[10px] font-black tracking-[0.3em] text-tactical-muted uppercase">Ready for transmission</div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* CHANNEL SELECTOR MODAL */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-4">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsModalOpen(false)}
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        />

                        {/* Modal Content */}
                        <motion.div
                            initial={{ y: "100%", opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: "100%", opacity: 0 }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="relative w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] sm:max-h-none"
                        >
                            {/* Header */}
                            <div className="px-6 py-5 border-b border-tactical-border flex justify-between items-center bg-white sticky top-0 z-10">
                                <div>
                                    <h3 className="text-xl font-black text-tactical-fg tracking-tight">RADIO CHANNELS</h3>
                                    <p className="text-[10px] text-tactical-muted font-bold tracking-widest uppercase mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">현재 활성화된 채널 리스트</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <motion.button
                                        whileTap={{ rotate: 180 }}
                                        onClick={() => fetchRooms()}
                                        className="p-2 hover:bg-tactical-surface rounded-full transition-colors"
                                        title="Refresh List"
                                    >
                                        <Wifi className="w-5 h-5 text-tactical-accent" />
                                    </motion.button>
                                    <button
                                        onClick={() => setIsModalOpen(false)}
                                        className="p-2 hover:bg-tactical-surface rounded-full transition-colors"
                                    >
                                        <X className="w-6 h-6 text-tactical-muted" />
                                    </button>
                                </div>
                            </div>

                            {/* List Content */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-[200px]">
                                {isLoadingRooms ? (
                                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                        <div className="w-8 h-8 border-4 border-tactical-accent border-t-transparent rounded-full animate-spin" />
                                        <span className="text-[10px] font-black text-tactical-muted tracking-widest uppercase">Scanning frequencies...</span>
                                    </div>
                                ) : availableRooms.length > 0 ? (
                                    availableRooms.map((room) => {
                                        const [displayName, password] = room.id.split('@@');
                                        return (
                                            <motion.button
                                                key={room.id}
                                                whileHover={{ x: 4 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => {
                                                    if (password) {
                                                        setKeypadRoom(room);
                                                        setIsKeypadOpen(true);
                                                        setInputPin('');
                                                        setPinError(false);
                                                    } else {
                                                        updateSettings({ roomId: room.id });
                                                        startSystem(room.id);
                                                        setIsModalOpen(false);
                                                    }
                                                }}
                                                className="w-full p-4 rounded-2xl border border-tactical-border hover:border-tactical-accent hover:bg-tactical-accent/5 transition-all text-left flex items-center justify-between group"
                                            >
                                                <div className="flex items-center space-x-4">
                                                    <div className="w-12 h-12 bg-tactical-surface group-hover:bg-white rounded-xl flex items-center justify-center transition-colors">
                                                        <Hash className="w-6 h-6 text-tactical-accent" />
                                                    </div>
                                                    <div>
                                                        <div className="text-base font-black text-tactical-fg group-hover:text-tactical-accent transition-colors uppercase tracking-tight flex items-center">
                                                            {displayName}
                                                            {password && <span className="text-[8px] bg-tactical-accent/10 text-tactical-accent px-1.5 py-0.5 rounded-sm ml-2 font-black uppercase tracking-wider border border-tactical-accent/20">Secure</span>}
                                                        </div>
                                                        <div className="text-[10px] font-bold text-tactical-muted uppercase tracking-widest">
                                                            Frequency: {displayName.length * 4}.{displayName.length} MHz
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end space-y-2">
                                                    <div className="flex items-center space-x-1 bg-tactical-surface px-2.5 py-1 rounded-full border border-tactical-border transition-colors group-hover:bg-white group-hover:border-tactical-accent/20">
                                                        <Users className="w-3 h-3 text-tactical-muted" />
                                                        <span className="text-[10px] font-black text-tactical-fg">{room.userCount}</span>
                                                    </div>
                                                    <span className="text-[9px] font-black text-tactical-accent opacity-0 group-hover:opacity-100 transition-opacity uppercase">선택한 채널로 접속</span>
                                                </div>
                                            </motion.button>
                                        );
                                    })
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <div className="w-16 h-16 bg-tactical-surface rounded-full flex items-center justify-center mb-4">
                                            <RadioTower className="w-8 h-8 text-tactical-muted opacity-30" />
                                        </div>
                                        <h4 className="text-sm font-bold text-tactical-fg mb-1 uppercase">현재 개설된 채널이 없습니다.</h4>
                                        <p className="text-[10px] text-tactical-muted font-bold tracking-widest uppercase px-6">새로운 채널을 개설하여 대화를 시작해 보세요.</p>
                                    </div>
                                )}
                            </div>

                            {/* Create Room Section - Always Visible and Prominent */}
                            <div className="p-6 bg-white border-t-2 border-tactical-accent/10 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] sticky bottom-0 z-20">
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        if (newRoomName.trim() && newRoomPin.length === 4) {
                                            const formattedName = newRoomName.trim().toLowerCase().replace(/\s+/g, '-');
                                            const fullRoomId = `${formattedName}@@${newRoomPin}`;
                                            updateSettings({ roomId: fullRoomId });
                                            startSystem(fullRoomId, true); // v97: Setting as leader
                                            setIsModalOpen(false);
                                            setNewRoomName('');
                                            setNewRoomPin('');
                                        }
                                    }}
                                    className="flex flex-col space-y-4"
                                >
                                    <div className="flex items-center justify-between px-1">
                                        <span className="text-[10px] font-black text-tactical-accent tracking-[0.2em] uppercase">Create New Channel</span>
                                        <Plus className="w-3 h-3 text-tactical-accent" />
                                    </div>
                                    <div className="flex flex-col space-y-2">
                                        <div className="relative group">
                                            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-tactical-muted group-focus-within:text-tactical-accent transition-colors" />
                                            <input
                                                type="text"
                                                value={newRoomName}
                                                onChange={(e) => setNewRoomName(e.target.value)}
                                                placeholder="채널 이름을 입력하세요"
                                                className="w-full h-14 bg-tactical-surface border border-tactical-border rounded-2xl pl-12 pr-4 text-sm font-bold tracking-tight focus:outline-none focus:ring-4 focus:ring-tactical-accent/10 focus:border-tactical-accent focus:bg-white transition-all uppercase"
                                            />
                                        </div>
                                        <div className="flex space-x-2">
                                            <div className="relative flex-1 group">
                                                <Terminal className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-tactical-muted group-focus-within:text-tactical-accent transition-colors" />
                                                <input
                                                    type="password"
                                                    pattern="\d*"
                                                    maxLength={4}
                                                    value={newRoomPin}
                                                    onChange={(e) => setNewRoomPin(e.target.value.replace(/\D/g, ''))}
                                                    placeholder="비밀번호 4자리 숫자"
                                                    className="w-full h-14 bg-tactical-surface border border-tactical-border rounded-2xl pl-12 pr-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-tactical-accent/10 focus:border-tactical-accent focus:bg-white transition-all text-center"
                                                />
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={!newRoomName.trim() || newRoomPin.length !== 4}
                                                className="h-14 px-6 bg-tactical-accent text-white rounded-2xl font-black text-xs tracking-widest uppercase shadow-xl shadow-tactical-accent/30 active:scale-95 disabled:opacity-50 disabled:grayscale transition-all whitespace-nowrap"
                                            >
                                                채널 만들기
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between px-1">
                                            <p className="text-[9px] text-tactical-muted font-bold tracking-widest uppercase opacity-60">Channels must have a 4-digit security PIN</p>
                                            <button
                                                type="button"
                                                onClick={() => setIsModalOpen(false)}
                                                className="text-[10px] font-black text-tactical-muted hover:text-tactical-danger transition-colors uppercase tracking-widest"
                                            >
                                                취소
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* v95: Keypad Pin Modal */}
            <AnimatePresence>
                {isKeypadOpen && (
                    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsKeypadOpen(false)}
                            className="absolute inset-0 bg-tactical-fg/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden relative z-10 p-8"
                        >
                            <div className="flex flex-col items-center space-y-6">
                                <div className="text-center space-y-1">
                                    <h3 className="text-lg font-bold text-tactical-fg uppercase tracking-tight">SECURE ACCESS</h3>
                                    <p className="text-[10px] text-tactical-muted font-bold tracking-widest uppercase">{keypadRoom?.id.split('@@')[0]} 채널 비밀번호 4자리 입력</p>
                                </div>

                                {/* PIN Display */}
                                <div className="flex space-x-3">
                                    {[0, 1, 2, 3].map((i) => (
                                        <div
                                            key={i}
                                            className={`w-12 h-16 rounded-2xl border-2 flex items-center justify-center text-2xl font-black transition-all ${pinError
                                                ? 'border-tactical-danger bg-tactical-danger/5 text-tactical-danger'
                                                : inputPin.length > i
                                                    ? 'border-tactical-accent bg-tactical-accent/5 text-tactical-accent'
                                                    : 'border-tactical-border bg-tactical-surface text-tactical-muted'
                                                }`}
                                        >
                                            {inputPin.length > i ? '•' : ''}
                                        </div>
                                    ))}
                                </div>

                                {pinError && (
                                    <motion.p
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="text-[10px] text-tactical-danger font-black uppercase tracking-widest"
                                    >
                                        비밀번호가 일치하지 않습니다
                                    </motion.p>
                                )}

                                {/* Keypad Grid */}
                                <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'CLR', 0, 'DEL'].map((val) => (
                                        <motion.button
                                            key={val}
                                            whileTap={{ scale: 0.92 }}
                                            onClick={() => {
                                                setPinError(false);
                                                if (val === 'CLR') setInputPin('');
                                                else if (val === 'DEL') setInputPin(prev => prev.slice(0, -1));
                                                else if (inputPin.length < 4) {
                                                    const nextPin = inputPin + val;
                                                    setInputPin(nextPin);
                                                    if (nextPin.length === 4) {
                                                        const [_, correctPin] = keypadRoom.id.split('@@');
                                                        if (nextPin === correctPin) {
                                                            updateSettings({ roomId: keypadRoom.id });
                                                            startSystem(keypadRoom.id);
                                                            setIsKeypadOpen(false);
                                                            setIsModalOpen(false);
                                                        } else {
                                                            setTimeout(() => {
                                                                setPinError(true);
                                                                setInputPin('');
                                                            }, 200);
                                                        }
                                                    }
                                                }
                                            }}
                                            className="h-16 rounded-2xl bg-tactical-surface border border-tactical-border flex items-center justify-center text-xl font-black text-tactical-fg active:bg-tactical-accent active:text-white active:border-tactical-accent transition-colors"
                                        >
                                            {val}
                                        </motion.button>
                                    ))}
                                </div>

                                <button
                                    onClick={() => setIsKeypadOpen(false)}
                                    className="text-[10px] font-black text-tactical-muted uppercase tracking-[0.3em] hover:text-tactical-fg transition-colors"
                                >
                                    취소
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

const toneToStyles = (tone) => {
    switch (tone) {
        case 'danger':
            return {
                ring: 'ring-tactical-danger/15',
                badge: 'bg-tactical-danger/10 text-tactical-danger border-red-200',
                value: 'text-tactical-danger',
            };
        case 'ok':
            return {
                ring: 'ring-tactical-ok/15',
                badge: 'bg-tactical-ok/10 text-tactical-ok border-emerald-200',
                value: 'text-tactical-fg',
            };
        case 'warn':
            return {
                ring: 'ring-tactical-warn/20',
                badge: 'bg-tactical-warn/10 text-tactical-warn border-amber-200',
                value: 'text-tactical-fg',
            };
        default:
            return {
                ring: 'ring-tactical-accent/10',
                badge: 'bg-tactical-surface text-tactical-muted border-tactical-border',
                value: 'text-tactical-fg',
            };
    }
};

const StatusCard = ({ label, value, tone = 'neutral', icon, onClick }) => {
    const s = toneToStyles(tone);
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "text-left w-full p-3 rounded-2xl border bg-white shadow-sm",
                "transition active:scale-[0.99]",
                "focus:outline-none focus:ring-4",
                s.ring,
                "border-tactical-border"
            ].join(" ")}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-tactical-muted font-black tracking-widest uppercase">
                        {label}
                    </span>
                </div>

                {icon && (
                    <span className={[
                        "inline-flex items-center justify-center h-7 w-7 rounded-xl border",
                        s.badge
                    ].join(" ")}>
                        {icon}
                    </span>
                )}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
                <span className={[
                    "text-[18px] leading-none font-black tracking-tight uppercase",
                    s.value
                ].join(" ")}>
                    {value}
                </span>

                <span className={[
                    "text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full border",
                    s.badge
                ].join(" ")}>
                    {tone}
                </span>
            </div>
        </button>
    );
};

const VoiceWave = ({ level }) => {
    // level: 0 - 100
    // v77: Refined for subtle/reactive movement (Smaller base, balanced multiplier)
    const scale = 1.0 + (level / 100) * 0.45;
    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <motion.div
                animate={{ scale, opacity: [0.35, 0.15, 0.35] }}
                transition={{ duration: 0.15, ease: "linear" }}
                className="absolute w-44 h-44 bg-[#22C55E] rounded-full"
            />
            <motion.div
                animate={{ scale: scale + 0.15, opacity: [0.15, 0.05, 0.15] }}
                transition={{ duration: 0.2, ease: "linear" }}
                className="absolute w-44 h-44 bg-[#22C55E] rounded-full"
            />
            <motion.div
                animate={{ scale: scale + 0.35, opacity: [0.08, 0, 0.08] }}
                transition={{ duration: 0.25, ease: "linear" }}
                className="absolute w-44 h-44 bg-[#22C55E] rounded-full"
            />
        </div>
    );
};

export default RadioButton;
