import crypto from "crypto";

/**
 * Robust Body Parsing for Vercel Serverless (v45)
 */
async function getRawBody(req) {
    if (req.body && typeof req.body === "object" && Object.keys(req.body).length > 0) {
        return req.body;
    }

    let raw = "";
    try {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(chunk);
        }
        raw = Buffer.concat(chunks).toString("utf8");
    } catch (err) {
        console.error("[Auth-v45] Raw Body Error:", err);
        return {};
    }

    if (!raw) return {};

    try {
        return JSON.parse(raw);
    } catch (e) {
        try {
            const params = new URLSearchParams(raw);
            const data = {};
            for (const [k, v] of params.entries()) data[k] = v;
            return data;
        } catch (e2) {
            console.error("[Auth-v45] Parsing Fail:", raw.substring(0, 100));
            return {};
        }
    }
}

export default async function handler(req, res) {
    console.log("[Auth-v45] Incoming Request:", req.method);

    try {
        // 1. Method guard
        if (req.method !== "POST") {
            return res.status(405).json({
                error: "Method Not Allowed",
                message: "Use POST for authentication"
            });
        }

        // 2. Strict Environment Variable Validation
        const config = {
            appId: process.env.PUSHER_APP_ID,
            key: process.env.PUSHER_KEY,
            secret: process.env.PUSHER_SECRET,
            cluster: process.env.PUSHER_CLUSTER
        };

        const missing = Object.entries(config)
            .filter(([_, value]) => !value)
            .map(([name]) => `PUSHER_${name.toUpperCase()}`);

        if (missing.length > 0) {
            const errorMsg = `Missing configuration: ${missing.join(", ")}`;
            console.error("[Auth-v45] Config Missing:", errorMsg);
            return res.status(401).json({
                error: "Unauthorized",
                message: "Server environment variables not fully configured",
                missing: missing
            });
        }

        // 3. Body Validation
        const body = await getRawBody(req);
        const { socket_id, channel_name, user_id } = body;

        if (!socket_id || !channel_name) {
            console.error("[Auth-v45] Missing Parameters:", { socket_id: !!socket_id, channel_name: !!channel_name });
            return res.status(400).json({
                error: "Bad Request",
                message: "socket_id and channel_name are required",
                received: Object.keys(body)
            });
        }

        // 4. Presence Data Construction
        const presenceData = {
            user_id: user_id || socket_id,
            user_info: { id: user_id || socket_id }
        };
        const channel_data = JSON.stringify(presenceData);

        // 5. Signature Calculation (HMAC-SHA256)
        const stringToSign = `${socket_id}:${channel_name}:${channel_data}`;
        const signature = crypto
            .createHmac("sha256", config.secret)
            .update(stringToSign)
            .digest("hex");

        const auth = `${config.key}:${signature}`;

        // 6. Final Response
        console.log("[Auth-v45] Success:", channel_name);
        return res.status(200).json({ auth, channel_data });

    } catch (e) {
        console.error("[Auth-v45] Crash:", e.message, e.stack);
        return res.status(500).json({
            error: "Internal Server Error",
            message: e.message || "Failed to process authentication"
        });
    }
}
