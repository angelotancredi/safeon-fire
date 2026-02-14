import Pusher from "pusher";

export default async function handler(req, res) {
    return res.status(200).json({
        ok: true,
        step: "pusher import ok",
        hasKey: !!process.env.PUSHER_KEY
    });
}
