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

// v127: Epoch Guard & Cleanup Refs
const EPOCH_START = 0;

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

    // v122: Stable Room Key & Channel Deletion
    const roomKeyRef = useRef(null);
    const channelIdRef = useRef(null);    // v126: Strict Room Key Format (R_XXXXXXXX)
    const pinRef = useRef(""); // v128: Immediate PIN access for auth

    // v127: Epoch Guard & Cleanup Refs
    const channelNameRef = useRef(null);
    const leaderIdRef = useRef(null);
    const epochRef = useRef(0);

    const makeRoomKey = (roomId) => {
        const s = String(roomId || '').trim().toLowerCase();
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return `R_${(h >>> 0).toString(16).padStart(8, '0').toUpperCase()}`;
    };

    const pusherRef = useRef(null);
    const channelRef = useRef(null);
    const localStreamRef = useRef(null);
    const connectionsRef = useRef({});
    const remoteAudiosRef = useRef({});
    const myIdRef = useRef(`채널-${Math.floor(1000 + Math.random() * 9000)}`);
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

        // ✅ 리더/세션 상태 즉시 리셋 (가장 중요)
        // ✅ 리더/세션 상태 즉시 리셋 (가장 중요)
        setIsLeader(false);
        if (leaderIdRef.current) leaderIdRef.current = null;

        // ✅ epoch 증가: 이후 늦게 오는 이벤트 무시
        if (epochRef.current !== undefined) epochRef.current += 1;

        // v94: Force close AudioContext to release hardware resources
        if (audioContextRef.current) {
            try {
                if (audioContextRef.current.state !== "closed") {
                    await audioContextRef.current.close();
                }
            } catch (e) {
                console.warn("[Radio-v94] AudioContext Close Error:", e);
            }
            audioContextRef.current = null;
        }

        // ✅ Pusher cleanup (채널명 기반으로 unsubscribe)
        try {
            if (channelRef.current) {
                channelRef.current.unbind_all();
            }
            if (pusherRef.current && channelNameRef.current) {
                pusherRef.current.unsubscribe(channelNameRef.current);
            }
        } catch (e) {
            console.warn("[Pusher] Unsubscribe warning:", e);
        } finally {
            channelRef.current = null;
            if (channelNameRef) channelNameRef.current = null;
        }

        if (pusherRef.current) {
            try { pusherRef.current.disconnect(); } catch { }
            pusherRef.current = null;
        }

        Object.keys(connectionsRef.current).forEach((id) => {
            if (connectionsRef.current[id]) {
                connectionsRef.current[id].close();
                delete connectionsRef.current[id];
            }
        });

        Object.values(remoteAudiosRef.current).forEach((a) => {
            a.pause();
            a.srcObject = null;
        });
        remoteAudiosRef.current = {};

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((t) => t.stop());
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
    // v92: Fetch active rooms from backend
    const fetchRooms = useCallback(async () => {
        setIsLoadingRooms(true);
        try {
            const res = await fetch('/api/pusher/rooms');
            if (res.ok) {
                const data = await res.json();

                // v122: Merge server data with local temporary rooms
                setAvailableRooms(prev => {
                    const incoming = data.rooms || [];
                    const map = new Map();

                    // Server first
                    for (const r of incoming) map.set(r.id, r);

                    // Keep local instant updates if not yet on server
                    for (const r of prev) {
                        if (!map.has(r.id)) map.set(r.id, r);
                    }

                    // Sort by user count descending
                    return Array.from(map.values()).sort((a, b) => (b.userCount || 0) - (a.userCount || 0));
                });
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

    const syncPeersWithPusher = useCallback((passedMembers = null) => {
        const membersSource = passedMembers || (channelRef.current && channelRef.current.members);
        if (!membersSource) return;

        const membersList = [];
        membersSource.each(member => {
            // v111: Ensure we only track peers that follow the "채널-XXXX" format
            if (member.id !== myIdRef.current && member.id.startsWith('채널-')) {
                membersList.push(member.id);
            }
        });
        const uniquePeers = [...new Set(membersList)];
        setPeers(uniquePeers);
        addLog(`[System] Squad Sync: ${uniquePeers.length} 대원 탐지됨`);
    }, [addLog]);

    // v111: Force sync squad list every 5 seconds when connected
    useEffect(() => {
        if (status !== 'CONNECTED') return;
        const interval = setInterval(() => {
            syncPeersWithPusher();
        }, 5000);
        return () => clearInterval(interval);
    }, [status, syncPeersWithPusher]);

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

    // v132: Refactored startSystem - Field Recovery Guide
    // Strict Label-to-Key conversion to match Backend Logic
    const startSystem = useCallback(async (manualRoomId = null, inputPin = null) => {
        if (!manualRoomId) return;

        // 1. Label/RoomKey Generation (Moved to top to fix 'label is not defined' error)
        // v133: Split logic added as per user request
        const label = String(manualRoomId || '').split('@@')[0] || '무전';
        const pin = (inputPin || pinRef.current || '').trim();

        // 2. Room Key Generation (FNV-1a 32bit Hash - BACKEND MATCHING)
        let roomKey = label;
        const isHashKey = /^R_[0-9A-F]{8}$/i.test(label);

        if (!isHashKey) {
            let h = 2166136261;
            const s = label.toLowerCase();
            for (let i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
            roomKey = `R_${(h >>> 0).toString(16).toUpperCase()}`;
        }

        addLog(`JOIN: ${label} (${roomKey}) Sequence Started`);

        // 3. Race Condition Fix: Update Refs IMMEDIATELY logic
        // v134: Fix 'isConnected' reference to 'status === "CONNECTED"'
        if (roomKey === roomKeyRef.current && status === 'CONNECTED') {
            console.log("[WebRTC] Already in room:", label);
            return;
        }

        roomKeyRef.current = roomKey;
        pinRef.current = pin;

        // 4. Update Settings UI Optimistically
        updateSettings({
            roomKey,
            roomId: roomKey,
            roomLabel: isHashKey ? roomKey : label,
            pin
        });

        // v134: State Clean - Clear old label immediately to prevent ghosting
        // updateSettings({ roomLabel: null }); // Moved or handled above

        // 5) loop prevention 기준도 "roomKey" 기준으로
        if (
            status === 'STARTING' &&
            lastJoinedRoomRef.current === roomKey &&
            (retryCountRef.current === 0)
        ) return;

        lastJoinedRoomRef.current = roomKey;

        await cleanup();
        setPeers([]);

        await new Promise(resolve => setTimeout(resolve, 500));

        setStatus('STARTING');
        setError(null);
        setStatus('STARTING');
        setError(null);
        addLog(`STEP 0: AUTH_TIMEOUT SET (60s)`);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setStatus(prev => {
                if (prev === 'STARTING') {
                    addLog(`[경고] 접속 시간 초과: ${label}`);
                    setError('접속 시간이 초과되었습니다. 네트워크를 확인하세요.');
                    cleanup();
                    lastJoinedRoomRef.current = null;
                    return 'OFFLINE';
                }
                return prev;
            });
        }, 60000);

        // v111: Immediate Lobby Update - ensure this room is visible right away
        setAvailableRooms(prev => {
            const exists = prev.find(r => r.id === roomKey);
            if (!exists) {
                return [{ id: roomKey, label, userCount: 1 }, ...prev];
            }
            return prev;
        });

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

            addLog('STEP 2: Requesting MIC...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true }
            });
            localStreamRef.current = stream;
            setLocalStream(stream);
            addLog('STEP 3: MIC OK');

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

            addLog('STEP 4: HANDSHAKE...'); // v108: Changed from INITIALIZING

            // ✅ 방 문서 보장 (DB에 없으면 생성 / 있으면 갱신) -> v128: pinRef 사용
            try {
                await fetch("/api/rooms-upsert", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        label: settings.roomLabel || label,
                        pin: (pinRef.current || "").trim(), // 핀 입력이 있으면 같이
                    }),
                });
            } catch (e) {
                console.warn("[Room-Upsert] Skipped or Failed:", e);
            }

            // ✅ v135: PIN 사전검증 — hasPin인 방에 pin 없이 접속 시도 차단
            try {
                const checkRes = await fetch('/api/pusher/rooms');
                if (checkRes.ok) {
                    const { rooms: roomList } = await checkRes.json();
                    const targetRoom = roomList.find(r => r.id === roomKey);
                    if (targetRoom?.hasPin && !pin) {
                        addLog(`[보안] PIN이 필요한 채널입니다: ${displayRoom}`);
                        setError('PIN_REQUIRED: 이 채널은 비밀번호가 필요합니다.');
                        setStatus('OFFLINE');
                        lastJoinedRoomRef.current = null;
                        if (timeoutRef.current) clearTimeout(timeoutRef.current);
                        return;
                    }
                }
            } catch (e) {
                console.warn("[PIN-Check] Skipped:", e);
            }

            const pusher = new Pusher(PUSHER_CONFIG.key, {
                cluster: PUSHER_CONFIG.cluster,
                enabledTransports: ["ws", "wss"],
                // ✅ subscribe마다 최신 roomKey/pin을 실어보내기 위해 custom authorizer 사용
                authorizer: (channel) => ({
                    authorize: async (socketId, callback) => {
                        try {
                            const payload = {
                                socket_id: socketId,
                                channel_name: channel.name,
                                user_id: myIdRef.current,
                                pin: (pinRef.current || "").trim(),
                                // roomKey/roomLabel은 보내도 되고 안 보내도 됨 (서버 검증은 channel_name 기준)
                                roomKey: roomKeyRef.current,
                                roomLabel: settings.roomLabel || "",
                            };

                            const res = await fetch("/api/pusher-auth", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(payload),
                            });

                            const contentType = res.headers.get("content-type") || "";
                            const bodyText = await res.text().catch(() => "");

                            if (!res.ok) {
                                const errMsg = `[AUTH_FAIL] ${res.status} ${res.statusText} :: ${bodyText.slice(0, 200)}`;
                                console.error(errMsg, { payload, channel: channel.name });
                                addLog(errMsg);                    // ✅ 화면 로그에 찍기
                                callback(new Error(errMsg), null); // ✅ 반드시 문자열 메시지
                                return;
                            }

                            // 성공 응답은 JSON이어야 함
                            let data;
                            try {
                                data = contentType.includes("application/json") ? JSON.parse(bodyText) : JSON.parse(bodyText);
                            } catch {
                                const errMsg = `[AUTH_BAD_JSON] ${bodyText.slice(0, 200)}`;
                                addLog(errMsg);
                                callback(new Error(errMsg), null);
                                return;
                            }

                            callback(null, data);
                        } catch (e) {
                            const errMsg = `[AUTH_CRASH] ${e?.message || String(e)}`;
                            console.error(errMsg, e);
                            addLog(errMsg);
                            callback(new Error(errMsg), null);
                        }
                    },
                }),
            });
            pusherRef.current = pusher;

            // v93: Enhanced Reconnection Logic
            const handleRetry = () => {
                if (retryCountRef.current < 3) {
                    retryCountRef.current += 1;
                    addLog(`[System] Reconnecting... (Attempt ${retryCountRef.current}/3)`);
                    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
                    retryTimeoutRef.current = setTimeout(() => {
                        // Re-use precise label and pin from closure
                        startSystem(label, pin || null);
                    }, 3000); // 3s interval
                } else {
                    addLog(`[System] CONNECTION FAILED after 3 attempts.`);
                    setError('CONNECTION_FAILED_STABLE');
                    setStatus('OFFLINE');
                    cleanup();
                }
            };

            pusher.connection.bind('state_change', (states) => {
                addLog(`[Pusher] State: ${states.current.toUpperCase()}`);
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

            addLog('STEP 5: SYNCING...'); // v108: Corrected numbering
            // v122: Use stable room key for subscription
            // v122: Use stable room key for subscription
            const channelName = `presence-${roomKeyRef.current}`;
            const channel = pusher.subscribe(channelName);
            channelRef.current = channel;
            channelNameRef.current = channelName; // ✅ Set for cleanup

            // ✅ Epoch Guard: Capture current epoch
            const epoch = ++epochRef.current;

            // ✅ 리더 재계산 (members snapshot 기반)
            const recalcLeader = (membersSnapshot = null) => {
                try {
                    const ids = [];

                    // 1) subscription_succeeded에서 받은 membersSnapshot이 있으면 그걸 최우선 사용
                    if (membersSnapshot && typeof membersSnapshot.each === "function") {
                        membersSnapshot.each((m) => ids.push(String(m.id)));
                    } else if (channel.members && typeof channel.members.each === "function") {
                        // 2) 그 외에는 channel.members 사용
                        channel.members.each((m) => ids.push(String(m.id)));
                    }

                    // members가 아직 비어있으면 "리더 결정을 보류"하는게 핵심 포인트
                    if (ids.length === 0) {
                        return;
                    }

                    ids.sort(); // 모든 기기에서 동일 결과 (user_id가 동일 규칙이면)
                    const newLeaderId = ids[0];
                    const me = String(myIdRef.current);

                    // leaderId 변화가 있을 때만 상태 갱신 (불필요한 토글 방지)
                    if (leaderIdRef.current !== newLeaderId) {
                        leaderIdRef.current = newLeaderId;
                        console.log("[LEADER] Leader changed ->", newLeaderId, "All IDs:", ids);
                    }

                    const isNowLeader = me === String(leaderIdRef.current);
                    setIsLeader(isNowLeader);
                } catch (e) {
                    console.error("[LEADER] recalc error", e);
                    // 에러 시에도 리더를 false로 확정하기보다 보수적으로 유지/해제 중 택1
                    setIsLeader(false);
                }
            };

            // ✅ (A) subscription_succeeded: 여기가 “초기 멤버 스냅샷”의 가장 신뢰 구간
            channel.bind("pusher:subscription_succeeded", (members) => {
                if (epoch !== epochRef.current) return; // ✅ Epoch Guard
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                retryCountRef.current = 0;
                addLog('STEP 5: SUB OK');
                setStatus('CONNECTED');
                setPeerId(myIdRef.current);
                syncPeersWithPusher(members);

                addLog("PRESENCE: subscription_succeeded");
                recalcLeader(members);

                // ✅ 아주 중요: 200ms 후 한 번 더 (멤버 리스트 완성 지연 대응)
                setTimeout(() => {
                    if (epoch === epochRef.current) recalcLeader();
                }, 200);

                members.each(member => {
                    if (member.id !== myIdRef.current) {
                        const isOfferer = myIdRef.current < member.id;
                        initiateConnection(member.id, isOfferer);
                    }
                });
            });

            // ✅ (B) 멤버 변동 이벤트마다 재계산
            channel.bind("pusher:member_added", (member) => {
                if (epoch !== epochRef.current) return; // ✅ Epoch Guard
                addLog(`[Member Joined] ${member.id}`);
                recalcLeader();

                // 기존 로직 유지 (연결 수립)
                syncPeersWithPusher();
                if (member.id !== myIdRef.current) {
                    const isOfferer = myIdRef.current < member.id;
                    initiateConnection(member.id, isOfferer);
                }
            });

            channel.bind("pusher:member_removed", (member) => {
                if (epoch !== epochRef.current) return; // ✅ Epoch Guard
                addLog(`[Member Left] ${member.id}`);
                recalcLeader();

                // 기존 로직 유지 (연결 해제)
                removePeer(member.id);
                syncPeersWithPusher();
            });

            // v99: Catch subscription errors (e.g., auth failure or rate limit)
            channel.bind('pusher:subscription_error', (status) => {
                if (epoch !== epochRef.current) return; // ✅ Epoch Guard
                addLog(`[System] ERR: SUB_FAILED (${status})`);
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                setStatus('OFFLINE');
                setError(`SUB_FAILED: ${status}`);
                lastJoinedRoomRef.current = null; // ✅ Reset to allow retry
            });

            // Remove redundant redundant bindings
            /* 
            channel.bind('pusher:member_added', ...) was Merged above
            channel.bind('pusher:member_removed', ...) was Merged above
            */

            channel.bind('client-signal', async (data) => {
                if (epoch !== epochRef.current) return; // ✅ Epoch Guard
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

            // v122: Handle Room Deletion
            channel.bind('client-room-deleted', (data) => {
                if (epoch !== epochRef.current) return; // ✅ Epoch Guard
                addLog(`[System] ROOM DELETED by ${data?.by || 'master'}`);
                cleanup();
                setStatus('OFFLINE');
                setError('채널이 삭제되어 연결이 종료되었습니다.');
                lastJoinedRoomRef.current = null;
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
    // v112: Cleanup disabled on unmount to prevent connection drop during HMR/Navigation
    useEffect(() => {
        return () => {
            // cleanup(); // Temporarily disabled for stability
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

    // v122: Master Delete Room Function
    const deleteCurrentRoom = useCallback(() => {
        if (!channelRef.current) return;

        // Notify all peers
        channelRef.current.trigger('client-room-deleted', {
            by: myIdRef.current,
            at: Date.now(),
        });

        // Self cleanup
        cleanup();
        setStatus('OFFLINE');
        setError(null);
        lastJoinedRoomRef.current = null;

        // Optional: Remove from local lobby immediately
        setAvailableRooms(prev => prev.filter(r => r.id !== settings?.roomId));
    }, [cleanup, settings?.roomId]);

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
        fetchRooms,
        isLeader, // v97: Exposed for UI
        deleteCurrentRoom // v122: Exposed for Master UI
    };

    return <WebRTCContext.Provider value={value}>{children}</WebRTCContext.Provider>;
};

export const useWebRTC = () => {
    const context = useContext(WebRTCContext);
    if (!context) throw new Error("useWebRTC must be used within WebRTCProvider");
    return context;
};
