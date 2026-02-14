import { getDb } from "../src/lib/firebaseAdmin";

export default async function handler(req, res) {
  try {
    const db = getDb();

    const snap = await db.collection("rooms").limit(5).get();

    const rooms = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    res.status(200).json({
      ok: true,
      count: rooms.length,
      rooms
    });

  } catch (e) {
    console.error("DB TEST ERROR:", e);
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
}
