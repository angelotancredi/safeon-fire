import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mic, AlertCircle, Wifi, Users, Terminal, ChevronDown, ChevronUp,
    Volume2, RadioTower, Plus, X, Hash
} from 'lucide-react';

const RadioButton = ({ rtc }) => {
    const {
        peers, peerStatus, startSystem, setMuted, error, logs,
        isConnected, peerId, isTransmitting,
        activeTalkerId, activeVolume, settings,
        availableRooms, isLoadingRooms, fetchRooms, updateSettings
    } = rtc;

    // Helper functions for display
    // Helper functions for display
    const roomLabel = (settings?.roomId || '').split('@@')[0] || 'radio';
    const shortId = (id) => (id ? String(id).slice(-4) : '----');
    const callsign = (id) => `${roomLabel}-${shortId(id)}`;

    // UI용: "누르고 있는 중" 상태(입력 레이스 방지용)
    const [pttPressed, setPttPressed] = useState(false);

    const [status, setStatus] = useState('OFFLINE');
    const [showDebug, setShowDebug] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [newRoomPin, setNewRoomPin] = useState('');
    const [isKeypadOpen, setIsKeypadOpen] = useState(false);
    const [keypadRoom, setKeypadRoom] = useState(null);
    const [inputPin, setInputPin] = useState('');
    const [pinError, setPinError] = useState(false);
    const [keypadMode, setKeypadMode] = useState('JOIN');
    const [isCreating, setIsCreating] = useState(false);

    const pttBtnRef = useRef(null);
    const pointerIdRef = useRef(null);

    // 입력 레이스 방지: 실제 "PTT 입력 상태"는 ref가 단일 진실원천
    const pressedRef = useRef(false);

    const squelchStartAudioRef = useRef(null);
    const squelchStopAudioRef = useRef(null);

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

    useEffect(() => {
        if (error) setStatus('ERROR');
        else if (isTransmitting) setStatus('TRANSMITTING');
        else if (peers.length > 0) setStatus('ONLINE');
        else if (isConnected) setStatus('STANDBY');
        else if (peerStatus === 'STARTING') setStatus('JOINING...');
        else setStatus('DISCONNECTED');
    }, [error, peers.length, isConnected, peerStatus, isTransmitting]);

    // Back button support for modals
    useEffect(() => {
        const handlePopState = () => {
            if (isModalOpen || isKeypadOpen) {
                setIsModalOpen(false);
                setIsKeypadOpen(false);
            }
        };

        if (isModalOpen || isKeypadOpen) {
            window.history.pushState({ modal: true }, "");
        }

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [isModalOpen, isKeypadOpen]);

    const playSquelch = useCallback((type = 'start') => {
        try {
            const audio = type === 'start'
                ? squelchStartAudioRef.current
                : squelchStopAudioRef.current;

            if (audio) {
                audio.currentTime = 0;
                audio.volume = (settings?.squelchVol || 50) / 100;
                audio.play().catch(() => { });
            }
        } catch (_) { }
    }, [settings?.squelchVol]);

    // ✅ 실제 송신 ON/OFF는 setMuted가 유일한 경로
    const startTx = useCallback(() => {
        if (!isConnected) return;
        // 중복 호출 방지
        if (pressedRef.current) return;

        pressedRef.current = true;
        setPttPressed(true);

        // 송신 시작
        try { setMuted(false); } catch (_) { }

        playSquelch('start');
        if (settings?.useVibration && window.navigator.vibrate) window.navigator.vibrate(60);
    }, [isConnected, setMuted, playSquelch, settings?.useVibration]);

    const stopTx = useCallback(() => {
        if (!pressedRef.current) return;

        pressedRef.current = false;
        setPttPressed(false);

        // 송신 중단
        try { setMuted(true); } catch (_) { }

        playSquelch('stop');
        if (settings?.useVibration && window.navigator.vibrate) window.navigator.vibrate([30, 30, 30]);
    }, [setMuted, playSquelch, settings?.useVibration]);

    // 연결 끊기면 강제 종료(눌린 상태/송신 상태 다 정리)
    useEffect(() => {
        if (!isConnected) stopTx();
    }, [isConnected, stopTx]);

    const handlePointerDown = useCallback((e) => {
        if (!isConnected) return;
        if (peerStatus === 'STARTING') return;
        if (e.button != null && e.button !== 0) return;
        if (e.button != null && e.button !== 0) return;

        // 모바일에서 스크롤/줌 간섭 최소화
        e.preventDefault();

        pointerIdRef.current = e.pointerId;
        const el = pttBtnRef.current;

        if (el?.setPointerCapture) {
            try { el.setPointerCapture(e.pointerId); } catch (_) { }
        }
        startTx();
    }, [isConnected, startTx]);

    const releaseCaptureSafe = useCallback(() => {
        const el = pttBtnRef.current;
        if (el?.releasePointerCapture && pointerIdRef.current != null) {
            try { el.releasePointerCapture(pointerIdRef.current); } catch (_) { }
        }
        pointerIdRef.current = null;
    }, []);

    const handlePointerUp = useCallback((e) => {
        e.preventDefault();
        stopTx();
        releaseCaptureSafe();
    }, [stopTx, releaseCaptureSafe]);

    const handleLostPointerCapture = useCallback(() => {
        // 캡처 잃으면 안전하게 중단
        stopTx();
        releaseCaptureSafe();
    }, [stopTx, releaseCaptureSafe]);

    const statusTone = (() => {
        if (error) return 'danger';
        if (status === 'ONLINE') return 'ok';
        if (status === 'STANDBY') return 'warn';
        if (status === 'JOINING...') return 'warn';
        return 'neutral';
    })();

    // ✅ 버튼 표시 기준은 "실제 송신 상태"인 isTransmitting
    const txOn = !!isTransmitting;

    return (
        <div className="flex-1 flex flex-col w-full h-full min-h-0 overflow-hidden relative">
            <div className="flex-1 min-h-0 overflow-y-auto w-full px-4 pt-4 custom-scrollbar">
                <div className="max-w-md mx-auto w-full space-y-4">
                    {/* TOP SECTION */}
                    <div className="flex flex-col space-y-2 w-full pt-1 shrink-0">
                        <div className="grid grid-cols-2 gap-2 w-full">
                            <StatusCard
                                label="SYSTEM"
                                value={status === 'DISCONNECTED' ? 'JOIN RADIO' : status}
                                tone={statusTone}
                                icon={error ? <AlertCircle className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
                                onClick={() => {
                                    if (isConnected) setShowDebug(!showDebug);
                                    else {
                                        setIsModalOpen(true);
                                        setNewRoomName('');
                                        setNewRoomPin('');
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

            {/* BOTTOM: PTT */}
            <div className="shrink-0 w-full bg-transparent pb-0.5 pt-2 flex flex-col items-center justify-center">
                <div className="max-w-md w-full flex flex-col items-center">
                    <div className="relative w-44 h-44 flex items-center justify-center">
                        <AnimatePresence>
                            {(activeTalkerId || txOn) && <VoiceWave level={activeVolume} />}
                        </AnimatePresence>

                        <motion.button
                            ref={pttBtnRef}
                            onPointerDown={handlePointerDown}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                            onLostPointerCapture={handleLostPointerCapture}
                            onContextMenu={(e) => e.preventDefault()}
                            onClick={() => {
                                if (!isConnected && peerStatus !== 'STARTING') {
                                    setIsModalOpen(true);
                                    fetchRooms();
                                }
                            }}
                            whileTap={{ scale: 0.96 }}
                            style={{ touchAction: 'none' }}
                            className={[
                                "relative z-10 w-44 h-44 rounded-full flex flex-col items-center justify-center",
                                "transition-all duration-200 border-2",
                                "shadow-[0_15px_40px_rgba(0,0,0,0.12)]",
                                "focus:outline-none focus:ring-4 focus:ring-tactical-accent/20",
                                txOn
                                    ? "bg-[#22C55E] border-white/50"
                                    : isConnected
                                        ? "bg-white border-[3px] border-tactical-accent"
                                        : "bg-white border-tactical-border",
                                "overflow-hidden"
                            ].join(" ")}
                            aria-label={isConnected ? "Push to talk" : "Join radio"}
                        >
                            <div className="absolute inset-0 bg-[radial-gradient(150px_150px_at_35%_30%,rgba(255,255,255,0.4),transparent_60%)] pointer-events-none" />
                            <div className="absolute inset-0 bg-[radial-gradient(220px_220px_at_70%_80%,rgba(17,24,39,0.06),transparent_60%)] pointer-events-none" />

                            {!isConnected && peerStatus !== 'STARTING' ? (
                                <RadioTower className="w-12 h-12 text-tactical-muted mb-2" />
                            ) : txOn ? (
                                <Volume2 className="w-12 h-12 text-white animate-pulse" />
                            ) : (
                                <Mic className="w-12 h-12 text-tactical-accent" />
                            )}

                            <span className={[
                                "mt-2 font-black tracking-widest text-[11px] uppercase",
                                (!isConnected && peerStatus !== 'STARTING') ? "text-tactical-fg" : (txOn ? "text-white" : "text-tactical-fg")
                            ].join(" ")}>
                                {!isConnected && peerStatus !== 'STARTING'
                                    ? 'JOIN RADIO'
                                    : txOn
                                        ? 'TRANSMITTING'
                                        : 'PUSH TO TALK'}
                            </span>

                            {peerStatus === 'STARTING' && (
                                <div className="absolute inset-0 bg-white/95 flex items-center justify-center z-10">
                                    <div className="flex flex-col items-center">
                                        <div className="w-8 h-8 border-4 border-tactical-accent border-t-transparent rounded-full animate-spin mb-3" />
                                        <span className="text-[10px] font-bold text-tactical-fg tracking-widest uppercase">
                                            INITIALIZING...
                                        </span>
                                    </div>
                                </div>
                            )}
                        </motion.button>
                    </div>

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
                                        <span className="text-[12px] font-bold text-tactical-ok tracking-wider uppercase">
                                            [{activeTalkerId === 'me' ? callsign(peerId) : callsign(activeTalkerId)}] 송신 중...
                                        </span>
                                    </motion.div>
                                </motion.div>
                            ) : isConnected ? (
                                <motion.span
                                    key="standby"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 0.3 }}
                                    className="text-[11px] font-bold text-tactical-muted tracking-[0.4em] uppercase"
                                >
                                    STANDBY
                                </motion.span>
                            ) : (
                                <motion.div
                                    key="idle"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex flex-col items-center"
                                >
                                    <div className="text-[10px] font-black tracking-[0.3em] text-tactical-muted uppercase">
                                        Ready for transmission
                                    </div>
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
                                                        setKeypadMode('JOIN');
                                                        setKeypadRoom(room);
                                                        setIsKeypadOpen(true);
                                                        setInputPin('');
                                                        setPinError(false);
                                                    } else {
                                                        // ✅ FIX 4 — 조인 시 settings.roomId 덮어쓰기 제거
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
                                {/* Channel Creation Section */}
                                <div className="mt-8 pt-8 border-t border-tactical-border">
                                    <h4 className="text-[11px] font-bold text-tactical-muted uppercase tracking-[0.2em] mb-6 flex items-center">
                                        <Plus className="w-3.5 h-3.5 mr-2" /> 새 채널 만들기
                                    </h4>

                                    <form onSubmit={(e) => {
                                        e.preventDefault();
                                        if (newRoomName.trim() && newRoomPin.length === 4) {
                                            setIsCreating(true);
                                            // Delay modal close slightly to show feedback
                                            setTimeout(() => {
                                                const formattedName = newRoomName.trim().toLowerCase().replace(/\s+/g, '-');
                                                const roomId = `${formattedName}@@${newRoomPin}`;
                                                updateSettings?.({ roomId });
                                                startSystem(roomId);
                                                setIsModalOpen(false);
                                                setIsCreating(false);
                                                setNewRoomName('');
                                                setNewRoomPin('');
                                            }, 400);

                                        }
                                    }} className="space-y-5">
                                        <div className="space-y-4">
                                            <div className="relative group">
                                                <RadioTower className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-tactical-muted group-focus-within:text-tactical-accent transition-colors" />
                                                <input
                                                    type="text"
                                                    placeholder="채널 이름을 입력하세요"
                                                    value={newRoomName}
                                                    onChange={(e) => setNewRoomName(e.target.value)}
                                                    className="w-full h-14 bg-tactical-surface border border-tactical-border rounded-2xl pl-12 pr-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-tactical-accent/10 focus:border-tactical-accent focus:bg-white transition-all"
                                                />
                                            </div>

                                            <div className="flex space-x-2">
                                                <div className="relative flex-1 group">
                                                    <Terminal className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-tactical-muted group-focus-within:text-tactical-accent transition-colors" />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setKeypadMode('CREATE');
                                                            setKeypadRoom({ id: newRoomName || 'NEW CHANNEL' });
                                                            setInputPin('');
                                                            setIsKeypadOpen(true);
                                                        }}
                                                        className="w-full h-14 bg-tactical-surface border border-tactical-border rounded-2xl pl-12 pr-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-tactical-accent/10 focus:border-tactical-accent focus:bg-white transition-all text-center flex items-center justify-center"
                                                    >
                                                        {newRoomPin ? '● ● ● ●' : <span className="text-tactical-muted opacity-60">비밀번호 설정</span>}
                                                    </button>
                                                </div>
                                                <button
                                                    type="submit"
                                                    disabled={!newRoomName.trim() || newRoomPin.length !== 4 || isCreating}
                                                    className="h-14 px-6 bg-tactical-accent text-white rounded-2xl font-black text-xs tracking-widest uppercase shadow-xl shadow-tactical-accent/30 active:scale-95 disabled:opacity-50 disabled:grayscale transition-all whitespace-nowrap flex items-center justify-center min-w-[100px]"
                                                >
                                                    {isCreating ? (
                                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : '만들기'}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between px-1">
                                            <p className="text-[9px] text-tactical-muted font-bold tracking-widest uppercase opacity-60">Security PIN required</p>
                                            <button
                                                type="button"
                                                onClick={() => setIsModalOpen(false)}
                                                className="text-[10px] font-black text-tactical-muted hover:text-tactical-danger transition-colors uppercase tracking-widest"
                                            >
                                                취소
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )
                }
            </AnimatePresence >

            {/* v95: Keypad Pin Modal */}
            < AnimatePresence >
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
                            initial={{ y: "100%", opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: "100%", opacity: 0 }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden relative z-10 p-8"
                        >
                            <div className="flex flex-col items-center space-y-6">
                                <div className="text-center space-y-2">
                                    <h3 className="text-lg font-bold text-tactical-fg uppercase tracking-tight">
                                        {keypadMode === 'JOIN' ? 'SECURE ACCESS' : 'PIN SETUP'}
                                    </h3>
                                    <p className="text-[12px] text-tactical-accent font-bold tracking-tight">
                                        {keypadMode === 'JOIN' ? '보안을 위해 비밀번호 4자리를 입력하세요' : '새 채널의 보안 비밀번호를 설정하세요'}
                                    </p>
                                    <p className="text-[10px] text-tactical-muted font-medium uppercase tracking-widest">
                                        {keypadMode === 'JOIN' ? keypadRoom?.id.split('@@')[0] : (newRoomName || 'NEW CHANNEL')}
                                    </p>
                                </div>

                                {/* PIN Display - Masked with dots */}
                                <div className="flex space-x-4">
                                    {[0, 1, 2, 3].map((i) => (
                                        <div
                                            key={i}
                                            className={`w-14 h-20 rounded-2xl border-2 flex items-center justify-center text-3xl font-bold transition-all ${pinError
                                                ? 'border-tactical-danger bg-tactical-danger/5 text-tactical-danger'
                                                : inputPin.length > i
                                                    ? 'border-tactical-accent bg-tactical-accent/10 text-tactical-accent'
                                                    : 'border-tactical-border bg-tactical-surface text-tactical-muted'
                                                }`}
                                        >
                                            {inputPin.length > i ? '●' : ''}
                                        </div>
                                    ))}
                                </div>

                                {pinError && (
                                    <motion.p
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="text-[11px] text-tactical-danger font-bold uppercase tracking-widest"
                                    >
                                        비밀번호가 일치하지 않습니다
                                    </motion.p>
                                )}

                                {/* Keypad Grid - Large Numeric Buttons */}
                                <div className="grid grid-cols-3 gap-4 w-full">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫'].map((val) => (
                                        <motion.button
                                            key={val}
                                            whileTap={{ scale: 0.92 }}
                                            onClick={() => {
                                                setPinError(false);
                                                if (val === 'C') setInputPin('');
                                                else if (val === '⌫') setInputPin(prev => prev.slice(0, -1));
                                                else if (inputPin.length < 4) {
                                                    const nextPin = inputPin + val;
                                                    setInputPin(nextPin);

                                                    // Auto-verification after 4th digit
                                                    if (nextPin.length === 4) {
                                                        if (keypadMode === 'JOIN') {
                                                            const [_, correctPin] = keypadRoom.id.split('@@');
                                                            if (nextPin === correctPin) {
                                                                // Success logic
                                                                setTimeout(() => {
                                                                    const [rName, rPin] = keypadRoom.id.split('@@');
                                                                    startSystem(rName, rPin);
                                                                    setIsKeypadOpen(false);
                                                                    setIsModalOpen(false);
                                                                }, 150);
                                                            } else {
                                                                // Error logic
                                                                setTimeout(() => {
                                                                    setPinError(true);
                                                                    setInputPin('');
                                                                }, 400);
                                                            }
                                                        } else {
                                                            // CREATE Mode Logic
                                                            setTimeout(() => {
                                                                setNewRoomPin(nextPin);
                                                                setIsKeypadOpen(false);
                                                            }, 150);
                                                        }
                                                    }
                                                }
                                            }}
                                            className={[
                                                "h-20 rounded-3xl flex items-center justify-center text-3xl font-bold transition-all shadow-sm",
                                                (val === 'C' || val === '⌫')
                                                    ? "bg-tactical-surface text-tactical-muted border border-tactical-border active:bg-tactical-danger active:text-white"
                                                    : "bg-tactical-surface text-tactical-fg border border-tactical-border active:bg-tactical-accent active:text-white active:border-tactical-accent"
                                            ].join(" ")}
                                        >
                                            {val}
                                        </motion.button>
                                    ))}
                                </div>

                                <button
                                    onClick={() => setIsKeypadOpen(false)}
                                    className="w-full py-4 text-sm font-bold text-tactical-muted uppercase tracking-widest hover:text-tactical-fg transition-colors mt-2"
                                >
                                    취소
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence >
        </div >
    );
};

/* ===== 아래 컴포넌트들은 네 기존 그대로 ===== */
const toneToStyles = (tone) => {
    switch (tone) {
        case 'danger':
            return { ring: 'ring-tactical-danger/15', badge: 'bg-tactical-danger/10 text-tactical-danger border-red-200', value: 'text-tactical-danger' };
        case 'ok':
            return { ring: 'ring-tactical-ok/15', badge: 'bg-tactical-ok/10 text-tactical-ok border-emerald-200', value: 'text-tactical-fg' };
        case 'warn':
            return { ring: 'ring-tactical-warn/20', badge: 'bg-tactical-warn/10 text-tactical-warn border-amber-200', value: 'text-tactical-fg' };
        default:
            return { ring: 'ring-tactical-accent/10', badge: 'bg-tactical-surface text-tactical-muted border-tactical-border', value: 'text-tactical-fg' };
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
                    <span className="text-[10px] text-tactical-muted font-black tracking-widest uppercase">{label}</span>
                </div>
                {icon && (
                    <span className={["inline-flex items-center justify-center h-7 w-7 rounded-xl border", s.badge].join(" ")}>
                        {icon}
                    </span>
                )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
                <span className={["text-[18px] leading-none font-black tracking-tight uppercase", s.value].join(" ")}>{value}</span>
                <span className={["text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full border", s.badge].join(" ")}>{tone}</span>
            </div>
        </button>
    );
};

const VoiceWave = ({ level }) => {
    const scale = 1.0 + (level / 100) * 0.45;
    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <motion.div animate={{ scale, opacity: [0.35, 0.15, 0.35] }} transition={{ duration: 0.15, ease: "linear" }} className="absolute w-44 h-44 bg-[#22C55E] rounded-full" />
            <motion.div animate={{ scale: scale + 0.15, opacity: [0.15, 0.05, 0.15] }} transition={{ duration: 0.2, ease: "linear" }} className="absolute w-44 h-44 bg-[#22C55E] rounded-full" />
            <motion.div animate={{ scale: scale + 0.35, opacity: [0.08, 0, 0.08] }} transition={{ duration: 0.25, ease: "linear" }} className="absolute w-44 h-44 bg-[#22C55E] rounded-full" />
        </div>
    );
};

export default RadioButton;
