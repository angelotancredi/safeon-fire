import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import Pusher from 'pusher-js';

export const WebRTCContext = createContext();

// --- CONFIGURATION ---
const DEFAULT_SETTINGS = {
    roomId: 'safe-on-fire-v1',
    squelchVol: 50,
    micSens: 50,
    useVibration: true,
};

const PUSHER_CONFIG = {
    key: "0e0d17376ed910964eef",
    cluster: "ap3"
};

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.l.google.com:19305' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.freeswitch.org' },
    {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
    }
];

export const WebRTCProvider = ({ children }) => {
    // v91: Load settings from localStorage or use defaults
    const [settings, setSettings] = useState(() => {
        const saved = localStorage.getItem('safeon-settings');
        let parsed = saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
        // v94: Sanitize roomId on load
        if (!parsed.roomId || typeof parsed.roomId !== 'string' || parsed.roomId.trim().length === 0) {
            parsed.roomId = DEFAULT_SETTINGS.roomId;
        }
        return parsed;
    });

    const [peers, setPeers] = useState([]);
    const [status, setStatus] = useState('OFFLINE');
    const [peerId, setPeerId] = useState(null);
    const [isLeader, setIsLeader] = useState(false); // v97: Leader status
    const [isTransmitting, setIsTransmitting] = useState(false);
    const [audioLevel] = useState(0);
    const [error, setError] = useState(null);
    const [logs, setLogs] = useState([]);
    const [localStream, setLocalStream] = useState(null);
    const [talkingPeers, setTalkingPeers] = useState(new Set());
    const [activeTalkerId, setActiveTalkerId] = useState(null);
    const [activeVolume, setActiveVolume] = useState(0);
    const [myLocation, setMyLocation] = useState(null); // v87: GPS
    const [peerLocations, setPeerLocations] = useState({}); // v87: GPS
    const [availableRooms, setAvailableRooms] = useState([]); // v92: Channel Lobby
    const [isLoadingRooms, setIsLoadingRooms] = useState(false); // v92

    const pusherRef = useRef(null);
    const channelRef = useRef(null);
    const localStreamRef = useRef(null);
    const connectionsRef = useRef({});
    const remoteAudiosRef = useRef({});
    const myIdRef = useRef(`채널-${Math.random().toString(36).substr(2, 4).toUpperCase()}`);
    const lastJoinedRoomRef = useRef(null); // v94: Loop prevention
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const remoteAnalysersRef = useRef({});
    const localGainNodeRef = useRef(null); // v91: Mic Sensitivity Gain Node
    const timeoutRef = useRef(null);
    const retryCountRef = useRef(0); // v93: Reconnection retries
    const retryTimeoutRef = useRef(null);

    const addLog = useCallback((msg) => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
        console.log(`[Radio-v85] ${msg}`);
    }, []);

    // Audio Monitor Loop (Pulse logic)
    useEffect(() => {
        let animationFrame;
        const monitor = () => {
            let currentLevel = 0;
            let currentTalker = null;

            if (isTransmitting && analyserRef.current) {
                const dataArray = new Uint8Array(analyserRef.current.fftSize);
                analyserRef.current.getByteTimeDomainData(dataArray);
                let sumSquares = 0;
                for (let i = 0; i < dataArray.length; sumSquares += Math.pow((dataArray[i++] - 128) / 128, 2));
                const rms = Math.sqrt(sumSquares / dataArray.length);
                currentLevel = Math.min(100, Math.floor(rms * 1000));
                currentTalker = 'me';
            }
            else if (talkingPeers.size > 0) {
                let maxRms = 0;
                talkingPeers.forEach(id => {
                    const analyser = remoteAnalysersRef.current[id];
                    if (analyser) {
                        const dataArray = new Uint8Array(analyser.fftSize);
                        analyser.getByteTimeDomainData(dataArray);
                        let sumSquares = 0;
                        for (let i = 0; i < dataArray.length; sumSquares += Math.pow((dataArray[i++] - 128) / 128, 2));
                        const rms = Math.sqrt(sumSquares / dataArray.length);
                        if (rms > maxRms) {
                            maxRms = rms;
                            currentTalker = id;
                        }
                    }
                });
                currentLevel = Math.min(100, Math.floor(maxRms * 1000));
            }

            setActiveVolume(currentLevel);
            setActiveTalkerId(currentTalker);

            if (isTransmitting || talkingPeers.size > 0) {
                animationFrame = requestAnimationFrame(monitor);
            } else {
                setActiveVolume(0);
                setActiveTalkerId(null);
            }
        };

        if (isTransmitting || talkingPeers.size > 0) {
            monitor();
        } else {
            setActiveVolume(0);
            setActiveTalkerId(null);
        }

        return () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
        };
    }, [isTransmitting, talkingPeers]);

    const cleanup = useCallback(async () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

        // v94: Force close AudioContext to release hardware resources
        if (audioContextRef.current) {
            try {
                if (audioContextRef.current.state !== 'closed') {
                    await audioContextRef.current.close();
                }
            } catch (e) {
                console.warn("[Radio-v94] AudioContext Close Error:", e);
            }
            audioContextRef.current = null;
        }

        if (channelRef.current) {
            channelRef.current.unbind_all();
            channelRef.current.unsubscribe();
        }
        if (pusherRef.current) pusherRef.current.disconnect();

        Object.keys(connectionsRef.current).forEach(id => {
            connectionsRef.current[id].close();
            delete connectionsRef.current[id];
        });

        Object.values(remoteAudiosRef.current).forEach(a => {
            a.pause();
            a.srcObject = null;
        });
        remoteAudiosRef.current = {};

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
            setLocalStream(null);
        }
        analyserRef.current = null;
        localGainNodeRef.current = null;
        setIsTransmitting(false);
        setPeers([]);
        setTalkingPeers(new Set());
        setPeerLocations({});
        remoteAnalysersRef.current = {};
    }, []);

    // v92: Fetch active rooms from backend
    const fetchRooms = useCallback(async () => {
        setIsLoadingRooms(true);
        try {
            const res = await fetch('/api/pusher/rooms');
            if (res.ok) {
                const data = await res.json();
                setAvailableRooms(data.rooms || []);
            }
        } catch (e) {
            console.error("[Radio-v92] Fetch Rooms Fail:", e);
        } finally {
            setIsLoadingRooms(false);
        }
    }, []);

    // v92: Auto-refresh rooms on start
    useEffect(() => {
        fetchRooms();
        // Refresh every 30s as a lobby mechanism
        const interval = setInterval(fetchRooms, 30000);
        return () => clearInterval(interval);
    }, [fetchRooms]);

    const syncPeersWithPusher = useCallback(() => {
        if (!channelRef.current || !channelRef.current.members) return;
        const membersList = [];
        channelRef.current.members.each(member => {
            if (member.id !== myIdRef.current) {
                membersList.push(member.id);
            }
        });
        const uniquePeers = [...new Set(membersList)];
        setPeers(uniquePeers);
        addLog(`[System] Sync: ${uniquePeers.length} active nodes`);
    }, [addLog]);

    const removePeer = useCallback((id) => {
        if (connectionsRef.current[id]) {
            connectionsRef.current[id].close();
            delete connectionsRef.current[id];
        }
        if (remoteAudiosRef.current[id]) {
            remoteAudiosRef.current[id].pause();
            remoteAudiosRef.current[id].srcObject = null;
            delete remoteAudiosRef.current[id];
        }
        if (remoteAnalysersRef.current[id]) {
            delete remoteAnalysersRef.current[id];
        }
        setTalkingPeers(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        setPeerLocations(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, []);

    const resumeAudio = useCallback(() => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume();
            }
            return audioContextRef.current;
        } catch (e) {
            return null;
        }
    }, []);

    const createPC = useCallback((targetId) => {
        if (connectionsRef.current[targetId]) return connectionsRef.current[targetId];

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        connectionsRef.current[targetId] = pc;

        localStreamRef.current?.getTracks().forEach(track => {
            pc.addTrack(track, localStreamRef.current);
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                channelRef.current.trigger('client-signal', {
                    to: targetId,
                    from: myIdRef.current,
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };

        pc.ontrack = async (event) => {
            const track = event.streams[0];
            addLog(`[System] Voice Stream Active (${targetId})`);

            let audio = remoteAudiosRef.current[targetId];
            if (!audio) {
                audio = new Audio();
                audio.playsInline = true;
                audio.autoplay = true;
                remoteAudiosRef.current[targetId] = audio;
            }
            audio.srcObject = track;
            audio.muted = false;

            try {
                const ctx = resumeAudio();
                if (ctx) {
                    const remoteSource = ctx.createMediaStreamSource(track);
                    const remoteAnalyser = ctx.createAnalyser();
                    remoteAnalyser.fftSize = 256;
                    remoteSource.connect(remoteAnalyser);
                    remoteAnalysersRef.current[targetId] = remoteAnalyser;
                }
            } catch (err) {
                console.error("[Radio-v94] Remote Analyser Error:", err);
            }

            for (let i = 0; i < 3; i++) {
                try {
                    await audio.play();
                    break;
                } catch (e) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                removePeer(targetId);
            }
        };

        return pc;
    }, [addLog, removePeer, resumeAudio]);

    const initiateConnection = useCallback(async (targetId, isOfferer) => {
        if (targetId === myIdRef.current || targetId === 'broadcast') return;
        if (!isOfferer) return;

        const pc = createPC(targetId);
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            channelRef.current.trigger('client-signal', {
                to: targetId,
                from: myIdRef.current,
                type: 'offer',
                sdp: offer
            });
        } catch (e) {
            addLog(`Offer Error: ${e.message}`);
        }
    }, [addLog, createPC]);

    const startSystem = useCallback(async (manualRoomId = null, leaderStatus = false) => {
        // v96: Use passed ID or falling back to current settings
        const targetRoomId = manualRoomId || settings.roomId;

        if (status === 'STARTING') return;

        // v94: Don't restart if already connected to THIS room
        if (status === 'CONNECTED' && lastJoinedRoomRef.current === targetRoomId) {
            return;
        }

        // v98: Update ref IMMEDIATELY to prevent recursive calls from re-renders
        lastJoinedRoomRef.current = targetRoomId;

        const displayRoom = targetRoomId.split('@@')[0];
        addLog(`JOIN: ${displayRoom.toUpperCase()} Sequence Started`);
        await cleanup();
        setStatus('STARTING');
        setError(null);
        setIsLeader(leaderStatus); // v97: Set leader status

        // v93: Increased timeout to 16s (2x upgrade)
        timeoutRef.current = setTimeout(() => {
            setStatus(prev => {
                if (prev === 'STARTING') {
                    addLog('TIMEOUT: JOIN FAILED');
                    setError('TIMEOUT: JOIN FAILED');
                    cleanup(); // Note: inside synchronous setTimeout, we can't easily await, but cleanup itself handles internal awaits
                    return 'OFFLINE';
                }
                return prev;
            });
        }, 16000);

        try {
            // v94: Force stop ALL existing tracks in the browser to resolve conflicts
            try {
                addLog('STEP 1: Cleaning existing streams');
                // Instead of just our ref, we stop any tracks we might have access to
                const existingStreams = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
                if (existingStreams) {
                    existingStreams.getTracks().forEach(t => t.stop());
                }
                if (localStreamRef.current) {
                    localStreamRef.current.getTracks().forEach(t => t.stop());
                }
            } catch (err) {
                console.warn("[Radio-v94] Pre-cleanup warning:", err);
            }

            addLog('STEP 2: Requesting Fresh Mic');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true }
            });
            localStreamRef.current = stream;
            setLocalStream(stream);
            addLog('STEP 3: Mic OK');

            // v90: Initialize local audio analyser
            try {
                // v94: Ensure fresh AudioContext creation
                if (audioContextRef.current) {
                    await audioContextRef.current.close().catch(() => { });
                }
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
                const ctx = audioContextRef.current;

                if (ctx) {
                    const source = ctx.createMediaStreamSource(stream);

                    // v91: Mic Sensitivity Gain Node
                    const gainNode = ctx.createGain();
                    gainNode.gain.value = settings.micSens / 50;
                    source.connect(gainNode);
                    localGainNodeRef.current = gainNode;

                    const analyser = ctx.createAnalyser();
                    analyser.fftSize = 256;
                    gainNode.connect(analyser); // Connect from gainNode
                    analyserRef.current = analyser;
                }
            } catch (e) {
                console.warn("[Local-Analyser-Error]", e);
            }

            stream.getAudioTracks().forEach(t => t.enabled = false);

            const pusher = new Pusher(PUSHER_CONFIG.key, {
                cluster: PUSHER_CONFIG.cluster,
                authEndpoint: "/api/pusher-auth",
                enabledTransports: ["ws", "wss"],
                auth: {
                    params: {
                        user_id: myIdRef.current,
                        user_info: { id: myIdRef.current }
                    }
                }
            });
            pusherRef.current = pusher;

            // v93: Enhanced Reconnection Logic
            const handleRetry = () => {
                if (retryCountRef.current < 3) {
                    retryCountRef.current += 1;
                    addLog(`[System] Reconnecting... (Attempt ${retryCountRef.current}/3)`);
                    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
                    retryTimeoutRef.current = setTimeout(() => {
                        startSystem(targetRoomId); // v96: Pass the targetRoomId to retry
                    }, 3000); // 3s interval
                } else {
                    addLog(`[System] CONNECTION FAILED after 3 attempts.`);
                    setError('CONNECTION_FAILED_STABLE');
                    setStatus('OFFLINE');
                    cleanup();
                }
            };

            pusher.connection.bind('state_change', (states) => {
                addLog(`PRO-LOG: Pusher ${states.current}`);
                if (states.current === 'connected') {
                    retryCountRef.current = 0; // Reset on success
                    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
                }
            });

            pusher.connection.bind('unavailable', handleRetry);
            pusher.connection.bind('failed', handleRetry);
            pusher.connection.bind('disconnected', () => {
                // Only retry if it was unexpected (we are in a CONNECTED or STARTING state but Pusher went down)
                if (status === 'CONNECTED') {
                    handleRetry();
                }
            });

            const channel = pusher.subscribe(`presence-${targetRoomId}`);
            channelRef.current = channel;

            channel.bind('pusher:subscription_succeeded', (members) => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                addLog('STEP 5: Presence SUB OK');
                setStatus('CONNECTED');
                setPeerId(myIdRef.current);
                syncPeersWithPusher();

                members.each(member => {
                    if (member.id !== myIdRef.current) {
                        const isOfferer = myIdRef.current < member.id;
                        initiateConnection(member.id, isOfferer);
                    }
                });
            });

            channel.bind('pusher:member_added', (member) => {
                addLog(`[System] Member Joined: ${member.id}`);
                syncPeersWithPusher();
                if (member.id !== myIdRef.current) {
                    const isOfferer = myIdRef.current < member.id;
                    initiateConnection(member.id, isOfferer);
                }
            });

            channel.bind('pusher:member_removed', (member) => {
                addLog(`[System] Member Left: ${member.id}`);
                removePeer(member.id);
                syncPeersWithPusher();
            });

            channel.bind('client-signal', async (data) => {
                if (data.to !== myIdRef.current && data.to !== 'broadcast') return;
                try {
                    if (data.type === 'offer') {
                        const pc = createPC(data.from);
                        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        channelRef.current.trigger('client-signal', {
                            to: data.from,
                            from: myIdRef.current,
                            type: 'answer',
                            sdp: answer
                        });
                    } else if (data.type === 'answer') {
                        const pc = createPC(data.from);
                        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    } else if (data.type === 'candidate') {
                        const pc = createPC(data.from);
                        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                    } else if (data.type === 'talking') {
                        setTalkingPeers(prev => {
                            const next = new Set(prev);
                            if (data.isTalking) next.add(data.from);
                            else next.delete(data.from);
                            return next;
                        });
                    } else if (data.type === 'location-update') {
                        setPeerLocations(prev => ({
                            ...prev,
                            [data.from]: {
                                lat: data.lat,
                                lng: data.lng,
                                timestamp: Date.now()
                            }
                        }));
                    }
                } catch (sigErr) {
                    // console.warn("[Signaling-Conflict]", sigErr);
                }
            });

        } catch (err) {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            // v94: Detailed Error Logging & Graceful Handling
            const errorDetail = `${err.name}: ${err.message}`;
            addLog(`BOOT FAIL: ${errorDetail}`);

            if (err.name === 'NotAllowedError') {
                setError('PERMISSION_DENIED: 마이크 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.');
            } else {
                setError(`BOOT FAIL: ${errorDetail}`);
            }

            setStatus('OFFLINE');
            lastJoinedRoomRef.current = null; // Reset on failure
        }
    }, [cleanup, initiateConnection, createPC, status, addLog, syncPeersWithPusher, removePeer, settings.roomId, settings.micSens]);

    const setMuted = useCallback(async (muted) => {
        resumeAudio();
        const stream = localStreamRef.current;
        if (stream) {
            stream.getAudioTracks().forEach(t => t.enabled = !muted);
            setIsTransmitting(!muted);
            Object.values(remoteAudiosRef.current).forEach(a => {
                a.muted = !muted;
            });
            if (channelRef.current) {
                channelRef.current.trigger('client-signal', {
                    to: 'broadcast',
                    from: myIdRef.current,
                    type: 'talking',
                    isTalking: !muted
                });
            }
        }
    }, [resumeAudio]);

    // v87: GPS Tracking Logic
    useEffect(() => {
        let watchId = null;
        let shareInterval = null;

        if (status === 'CONNECTED') {
            // 1. Start Watching Position
            if ("geolocation" in navigator) {
                watchId = navigator.geolocation.watchPosition(
                    (pos) => {
                        const newLoc = {
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude
                        };
                        setMyLocation(newLoc);
                    },
                    (err) => addLog(`[GPS] Error: ${err.message}`),
                    { enableHighAccuracy: true, maximumAge: 10000 }
                );

                // 2. Share Periodically (3s)
                shareInterval = setInterval(() => {
                    setMyLocation(current => {
                        if (current && channelRef.current) {
                            channelRef.current.trigger('client-location-update', {
                                from: myIdRef.current,
                                type: 'location-update',
                                lat: current.lat,
                                lng: current.lng
                            });
                        }
                        return current;
                    });
                }, 3000);
            } else {
                addLog('[GPS] Not Supported');
            }
        }

        return () => {
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            if (shareInterval) clearInterval(shareInterval);
        };
    }, [status, addLog]);

    // v87: Bind location update to channel (since client-signal is for general signaling)
    // Actually, following the user's request, I will use client-location-update event name
    useEffect(() => {
        if (channelRef.current) {
            channelRef.current.bind('client-location-update', (data) => {
                setPeerLocations(prev => ({
                    ...prev,
                    [data.from]: {
                        lat: data.lat,
                        lng: data.lng,
                        timestamp: Date.now()
                    }
                }));
            });
        }
        return () => {
            if (channelRef.current) channelRef.current.unbind('client-location-update');
        }
    }, [status]); // Status change indicates potential new channel subscription

    // v91: Update local gain when micSens changes
    useEffect(() => {
        if (localGainNodeRef.current) {
            localGainNodeRef.current.gain.setTargetAtTime(settings.micSens / 50, audioContextRef.current.currentTime, 0.1);
        }
    }, [settings.micSens]);



    // Cleanup on App close
    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    const updateSettings = useCallback((newSettings) => {
        setSettings(prev => {
            // v94: Sanitize new roomId if provided
            if (newSettings.roomId !== undefined) {
                if (!newSettings.roomId || typeof newSettings.roomId !== 'string' || newSettings.roomId.trim().length === 0) {
                    newSettings.roomId = DEFAULT_SETTINGS.roomId;
                }
            }
            const updated = { ...prev, ...newSettings };
            localStorage.setItem('safeon-settings', JSON.stringify(updated));
            return updated;
        });
    }, []);

    const value = {
        peers,
        isConnected: status === 'CONNECTED',
        peerStatus: status,
        peerId: myIdRef.current,
        logs,
        startSystem,
        setMuted,
        isTransmitting,
        audioLevel,
        localStream,
        error,
        talkingPeers,
        activeTalkerId,
        activeVolume,
        myLocation,
        peerLocations,
        settings,
        updateSettings,
        availableRooms,
        isLoadingRooms,
        fetchRooms
    };

    return <WebRTCContext.Provider value={value}>{children}</WebRTCContext.Provider>;
};

export const useWebRTC = () => {
    const context = useContext(WebRTCContext);
    if (!context) throw new Error("useWebRTC must be used within WebRTCProvider");
    return context;
};
