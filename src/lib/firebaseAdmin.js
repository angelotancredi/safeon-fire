import admin from "firebase-admin";

let app;

export function getAdminApp() {
  if (app) return app;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase env variables");
  }

  // Vercel private key 줄바꿈 복구
  privateKey = privateKey.replace(/\\n/g, "\n");

  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return app;
}

export function getDb() {
  const a = getAdminApp();
  return a.firestore();
}
