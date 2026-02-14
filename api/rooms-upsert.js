import admin from "firebase-admin";

function getDb() {
  if (!admin.apps.length) {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey
      }),
    });
  }
  return admin.firestore();
}

function makeRoomKey(roomId) {
  const s = String(roomId || '').trim().toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `R_${(h >>> 0).toString(16).toUpperCase()}`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }

    const { label, pin } = req.body || {};
    if (!label) {
      return res.status(400).json({ error: "label required" });
    }

    const roomKey = makeRoomKey(label);
    const db = getDb();
    const ref = db.collection("rooms").doc(roomKey);

    const snap = await ref.get();

    const data = {
      label,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // pin 있으면 저장 (나중에 auth에서 검증)
    if (pin) data.pinHash = pin; // ← 지금은 평문, 다음 단계에서 hash로 바꿈

    if (!snap.exists) {
      data.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }

    await ref.set(data, { merge: true });

    return res.status(200).json({
      ok: true,
      roomKey
    });

  } catch (e) {
    console.error("[rooms-upsert] error", e);
    return res.status(500).json({ error: e.message });
  }
}
