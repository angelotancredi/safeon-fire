import admin from "firebase-admin";

function getDb() {
  // 이미 초기화되어 있으면 재사용
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        `Missing env: ${[
          !projectId ? "FIREBASE_PROJECT_ID" : null,
          !clientEmail ? "FIREBASE_CLIENT_EMAIL" : null,
          !privateKey ? "FIREBASE_PRIVATE_KEY" : null,
        ]
          .filter(Boolean)
          .join(", ")}`
      );
    }

    // 줄바꿈 복구
    if (privateKey) {
      privateKey = privateKey.replace(/\\n/g, "\n");
    }

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
    const db = getDb(); // admin.firestore() 반환
    const snap = await db.collection("rooms").limit(5).get();

    const rooms = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return res.status(200).json({ ok: true, count: rooms.length, rooms });
  } catch (e) {
    console.error("DB TEST ERROR:", e);
    // ✅ 에러를 화면에 그대로 보여줌 (원인 파악용)
    return res.status(500).json({
      ok: false,
      name: e?.name,
      message: e?.message,
      stack: e?.stack ? e.stack.split("\n").slice(0, 10).join("\n") : "",
    });
  }
}
