import crypto from "crypto";
import admin from "firebase-admin";

async function getRawBody(req) {
    if (req.body && typeof req.body === "object" && Object.keys(req.body).length > 0) {
        return req.body;
    }

    let raw = "";
    try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        raw = Buffer.concat(chunks).toString("utf8");
    } catch (err) {
        console.error("[Auth] Raw Body Error:", err);
        return {};
    }
    if (!raw) return {};

    try {
        return JSON.parse(raw);
    } catch {
        try {
            const params = new URLSearchParams(raw);
            const data = {};
            for (const [k, v] of params.entries()) data[k] = v;
            return data;
        } catch {
            return {};
        }
    }
}

function getDb() {
    if (!admin.apps.length) {
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;

        if (!projectId || !clientEmail || !privateKey) throw new Error("Missing Firebase env vars");
        privateKey = privateKey.replace(/\\n/g, "\n");

        admin.initializeApp({
            credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
    }
    return admin.firestore();
}

function extractRoomKey(channel_name) {
    // presence-R_XXXXXXXX
    const name = String(channel_name || "");
    const m = name.match(/^presence-(R_[0-9A-F]{8})$/i);
    return m ? m[1].toUpperCase() : null;
}

/**
 * pinHash 포맷: pbkdf2$<iterations>$<saltHex>$<hashHex>
 */
function pbkdf2Hash(pin, saltHex = null, iterations = 120000) {
    const salt = saltHex ? Buffer.from(saltHex, "hex") : crypto.randomBytes(16);
    const derived = crypto.pbkdf2Sync(String(pin), salt, iterations, 32, "sha256");
    return `pbkdf2$${iterations}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function pbkdf2Verify(pin, stored) {
    const parts = String(stored || "").split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;

    const iterations = Number(parts[1]);
    const saltHex = parts[2];
    const hashHex = parts[3];
    if (!Number.isFinite(iterations) || iterations < 10000) return false;

    const candidate = pbkdf2Hash(pin, saltHex, iterations).split("$")[3];

    const a = Buffer.from(candidate, "hex");
    const b = Buffer.from(hashHex, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method Not Allowed", message: "Use POST for authentication" });
        }

        const config = {
            key: process.env.PUSHER_KEY,
            secret: process.env.PUSHER_SECRET,
        };
        if (!config.key || !config.secret) {
            return res.status(401).json({ error: "Unauthorized", message: "Missing PUSHER_KEY/PUSHER_SECRET" });
        }

        const body = await getRawBody(req);
        const { socket_id, channel_name, user_id, pin } = body;

        if (!socket_id || !channel_name) {
            return res.status(400).json({ error: "Bad Request", message: "socket_id and channel_name are required" });
        }

        // ✅ PIN 검증: presence 채널만 (presence-${roomKey})
        const roomKey = extractRoomKey(channel_name);
        if (roomKey) {
            const db = getDb();
            const snap = await db.collection("rooms").doc(roomKey).get();

            // 정책: 등록된 방만 조인 허용
            if (!snap.exists) {
                return res.status(403).json({ error: "Forbidden", message: "Room not registered" });
            }

            const data = snap.data() || {};
            const stored = data.pinHash; // ✅ 이제 해시 포맷이어야 함

            if (stored) {
                // pinHash가 있으면 pin 필수
                if (!pin) {
                    return res.status(403).json({ error: "Forbidden", message: "PIN required" });
                }

                // (이행기간) 평문이 남아있을 수 있으면 임시로 같이 허용 가능:
                // const ok = stored.startsWith("pbkdf2$") ? pbkdf2Verify(pin, stored) : String(pin) === String(stored);

                const ok = stored.startsWith("pbkdf2$") ? pbkdf2Verify(pin, stored) : false;
                if (!ok) {
                    return res.status(403).json({ error: "Forbidden", message: "Invalid PIN" });
                }
            }
        }

        // Presence payload
        const presenceData = {
            user_id: user_id || socket_id,
            user_info: { id: user_id || socket_id },
        };
        const channel_data = JSON.stringify(presenceData);

        // Pusher signature (presence)
        const stringToSign = `${socket_id}:${channel_name}:${channel_data}`;
        const signature = crypto.createHmac("sha256", config.secret).update(stringToSign).digest("hex");
        const auth = `${config.key}:${signature}`;

        return res.status(200).json({ auth, channel_data });
    } catch (e) {
        console.error("[Auth] Crash:", e);
        return res.status(500).json({ error: "Internal Server Error", message: e.message || "Failed to process authentication" });
    }
}

// ✅ rooms-upsert에서 pin 설정 시 pbkdf2Hash(pin) 결과를 pinHash에 저장해야 함
export { pbkdf2Hash };
