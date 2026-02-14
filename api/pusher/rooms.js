import Pusher from "pusher";

// v1.0.0: API to list active presence channels
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
        // Fetch channels with presence- prefix
        const result = await pusher.get({
            path: "/channels",
            params: { filter_by_prefix: "presence-" },
        });

        if (result.status === 200) {
            const body = await result.json();
            const channels = body.channels || {};

            // ✅ FIX 2 — 기존 채널 리스트 한글 안됨 (서버 매핑 추가)
            const ROOM_LABEL_MAP = {
                "R_69630F74": "동상",
                "R_182C1BFB": "지휘",
            };

            // Format for frontend: strip "presence-" and only return names
            const rooms = Object.keys(channels).map(name => {
                const key = name.replace("presence-", "");
                return {
                    id: key,
                    label: ROOM_LABEL_MAP[key] || key,
                    userCount: channels[name].user_count || 0
                };
            });

            return res.status(200).json({ rooms });
        } else {
            console.error("[Rooms-API] Pusher Error:", result.status);
            return res.status(result.status).json({ error: "Failed to fetch channels" });
        }
    } catch (error) {
        console.error("[Rooms-API] Crash:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
