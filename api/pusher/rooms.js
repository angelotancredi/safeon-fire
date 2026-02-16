import Pusher from "pusher";
import admin from "firebase-admin";

function getDb() {
    if (!admin.apps.length) {
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;

        privateKey = privateKey.replace(/\\n/g, "\n");

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey,
            }),
        });
    }
    return admin.firestore();
}

export default async function handler(req, res) {
    try {
        const pusher = new Pusher({
            appId: process.env.PUSHER_APP_ID,
            key: process.env.PUSHER_KEY,
            secret: process.env.PUSHER_SECRET,
            cluster: process.env.PUSHER_CLUSTER,
            useTLS: true,
        });

        // 1️⃣ Pusher 활성 채널 조회
        const result = await pusher.get({
            path: "/channels",
            params: { filter_by_prefix: "presence-", info: "user_count" },
        });

        const body = await result.json();
        const channels = body.channels || {};

        const roomKeys = Object.keys(channels)
            .map(n => n.replace("presence-", "").toUpperCase());

        // 2️⃣ Firestore 조회
        const db = getDb();
        const refs = roomKeys.map(k => db.collection("rooms").doc(k));
        const snaps = refs.length ? await db.getAll(...refs) : [];

        const meta = new Map();
        snaps.forEach(s => {
            if (s.exists) meta.set(s.id, s.data());
        });

        // 3️⃣ 결합
        const rooms = roomKeys.map(k => {
            const m = meta.get(k);
            return {
                id: k,
                label: m?.label || k,
                hasPin: !!m?.pinHash,
                creatorId: m?.creatorId || null, // v136: Room creator for leader sync
                userCount: channels[`presence-${k.toLowerCase()}`]?.user_count
                    ?? channels[`presence-${k}`]?.user_count
                    ?? 0
            };
        });

        return res.status(200).json({ rooms });

    } catch (e) {
        console.error("[rooms-final] error", e);
        return res.status(500).json({
            ok: false,
            message: e.message
        });
    }
}
