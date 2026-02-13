import Pusher from "pusher";

export default async function handler(req, res) {
    const pusher = new Pusher({
        appId: process.env.PUSHER_APP_ID,
        key: process.env.NEXT_PUBLIC_PUSHER_KEY,
        secret: process.env.PUSHER_SECRET,
        cluster: process.env.PUSHER_CLUSTER,
        useTLS: true,
    });

    // Handle both JSON and Form Data
    let socket_id, channel_name;
    if (req.body && typeof req.body === 'object') {
        socket_id = req.body.socket_id;
        channel_name = req.body.channel_name;
    } else {
        // Basic fallback for some environments
        socket_id = req.query.socket_id;
        channel_name = req.query.channel_name;
    }

    if (!socket_id || !channel_name) {
        return res.status(400).send("Missing socket_id or channel_name");
    }

    const presenceData = {
        user_id: "dev-" + Math.random().toString(36).slice(2, 8),
        user_info: {},
    };

    try {
        const auth = channel_name.startsWith("presence-")
            ? pusher.authorizeChannel(socket_id, channel_name, presenceData)
            : pusher.authorizeChannel(socket_id, channel_name);

        res.send(auth);
    } catch (error) {
        console.error("Pusher Auth Error:", error);
        res.status(500).send("Authentication failed");
    }
}
