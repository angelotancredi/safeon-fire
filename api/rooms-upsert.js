import crypto from "crypto";
import admin from "firebase-admin";

function getDb() {
  if (!admin.apps.length) {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (!privateKey) throw new Error("Missing FIREBASE_PRIVATE_KEY");
    privateKey = privateKey.replace(/\\n/g, "\n");

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    if (!projectId || !clientEmail) throw new Error("Missing Firebase env vars");

    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
  return admin.firestore();
}

/**
 * 라벨 정규화: "동상  " / " 동상" / "동  상" → "동상"
 * - 방 갈라짐 방지 목적(최소 수준)
 * - 필요하면 규칙을 더 세게(특수문자 제거 등) 할 수 있는데, 일단은 안전한 범위로만.
 */
function normalizeLabel(label) {
  return String(label || "")
    .trim()
    .replace(/\s+/g, " "); // 연속 공백 정리
}

/**
 * roomKey: label(정규화)만으로 생성 (PIN 절대 섞지 않기)
 * - 기존 makeRoomKey 유지 (FNV-1a 32bit)
 */
function makeRoomKeyFromLabel(label) {
  const s = normalizeLabel(label).toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `R_${(h >>> 0).toString(16).toUpperCase()}`;
}

/**
 * pinHash 포맷: pbkdf2$<iterations>$<saltHex>$<hashHex>
 */
function pbkdf2Hash(pin, iterations = 120000) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.pbkdf2Sync(String(pin), salt, iterations, 32, "sha256");
  return `pbkdf2$${iterations}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const body = req.body || {};
    const labelIn = body.label;
    const pinIn = body.pin; // string | null | undefined

    if (!labelIn) return res.status(400).json({ error: "label required" });

    const label = normalizeLabel(labelIn) || "무전";
    const roomKey = makeRoomKeyFromLabel(label);

    const db = getDb();
    const ref = db.collection("rooms").doc(roomKey);

    const snap = await ref.get();

    // 기본 업데이트 필드
    const data = {
      label, // UI 표시용 (한글)
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // pin 처리 규칙:
    // - pin이 "비어있지 않은 문자열"이면: pinHash 세팅(해시)
    // - pin이 ""(빈문자) 또는 null 이면: pinHash 제거(잠금 해제)
    // - pin이 undefined 이면: pin 관련 변경 없음
    if (pinIn !== undefined) {
      const pin = pinIn === null ? "" : String(pinIn).trim();

      if (pin) {
        data.pinHash = pbkdf2Hash(pin);
      } else {
        data.pinHash = admin.firestore.FieldValue.delete();
      }
    }

    if (!snap.exists) {
      data.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }

    await ref.set(data, { merge: true });

    return res.status(200).json({ ok: true, roomKey, label });
  } catch (e) {
    console.error("[rooms-upsert] error", e);
    return res.status(500).json({ error: e.message || "server error" });
  }
}
