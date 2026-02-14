import Pusher from "pusher";

export default async function handler(req, res) {
    try {
        const pusher = new Pusher({
            appId: process.env.PUSHER_APP_ID,
            key: process.env.PUSHER_KEY,
            secret: process.env.PUSHER_SECRET,
            cluster: process.env.PUSHER_CLUSTER,
            useTLS: true,
        });

        const result = await pusher.get({
            path: "/channels",
            params: { filter_by_prefix: "presence-", info: "user_count" },
        });

        const body = await result.json();

        return res.status(200).json({
            ok: true,
            step: "pusher get ok",
            status: result.status,
            channelCount: Object.keys(body.channels || {}).length,
            sample: Object.keys(body.channels || {}).slice(0, 3),
        });
    } catch (e) {
        console.error("[pusher-get-test] error", e);
        return res.status(500).json({
            ok: false,
            step: "pusher get failed",
            message: e?.message,
            stack: e?.stack?.split("\n").slice(0, 8).join("\n"),
        });
    }
}
