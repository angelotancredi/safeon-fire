import Pusher from "pusher";
import { getDb } from "../../src/lib/firebaseAdmin";

export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const pusher = new Pusher({
        appId: process.env.PUSHER_APP_ID,
        key: process.env.PUSHER_KEY,
        secret: process.env.PUSHER_SECRET,
        cluster: process.env.PUSHER_CLUSTER,
        useTLS: true,
    });

    try {
        // 🔹 1. 활성 presence 채널 조회
        const result = await pusher.get({
            path: "/channels",
            params: { filter_by_prefix: "presence-", info: "user_count" },
        });

        if (result.status !== 200) {
            return res.status(result.status).json({ error: "Failed to fetch channels" });
        }

        const body = await result.json();
        const channels = body.channels || {};

        const roomKeys = Object.keys(channels).map(n =>
            n.replace("presence-", "").toUpperCase()
        );

        // 🔹 2. Firestore에서 메타데이터 조회
        const db = getDb();

        // Check if there are any room keys causing extra reads or empty query
        const refs = roomKeys.map(k => db.collection("rooms").doc(k));
        const snaps = refs.length ? await db.getAll(...refs) : [];

        const metaMap = new Map();
        snaps.forEach(s => {
            if (s.exists) metaMap.set(s.id, s.data());
        });

        // 🔹 3. 결합 응답 생성
        const rooms = roomKeys.map(k => {
            const m = metaMap.get(k);
            return {
                id: k,
                label: m?.label || k,       // ✅ 한글명
                hasPin: !!m?.pinHash,       // ✅ 비번 여부
                userCount: channels[`presence-${k.toLowerCase()}`]?.user_count
                    ?? channels[`presence-${k}`]?.user_count
                    ?? 0
            };
        });

        return res.status(200).json({ rooms });

    } catch (e) {
        console.error("[Rooms-API] Crash:", e);
        return res.status(500).json({ error: e.message });
    }
}
