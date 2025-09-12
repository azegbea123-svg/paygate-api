import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import admin from "firebase-admin";

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// 🔑 PayGate token
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// 🔑 Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}
const db = admin.firestore();

// ✅ Initier un paiement
app.post("/pay", async (req, res) => {
  const { phone_number, amount, network, uid } = req.body;
  const identifier = "TX-" + Date.now();

  try {
    const response = await fetch("https://paygateglobal.com/api/v1/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: AUTH_TOKEN,
        phone_number,
        amount,
        description: "Achat VIP",
        identifier,
        network,
      }),
    });

    const result = await response.json();
    console.log("💸 Paiement initié:", result);

    res.json({
      success: result.status === 0 || result.success === true,
      tx_reference: result.tx_reference,
      payment_reference: result.payment_reference || null,
      raw: result,
    });
  } catch (err) {
    console.error("❌ Erreur /pay:", err);
    res.status(500).json({ error: "Impossible d’initier le paiement" });
  }
});

// ✅ Vérifier le statut d'une transaction
app.post("/check-status", async (req, res) => {
  const { tx_reference, uid } = req.body;

  try {
    const response = await fetch("https://paygateglobal.com/api/v1/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: AUTH_TOKEN,
        tx_reference,
      }),
    });

    const result = await response.json();
    console.log("🔍 Statut transaction:", result);

    if (result.status === 0 && result.payment_reference) {
      const vipCode = result.payment_reference;

      // 📌 Sauvegarde dans vip_codes
      await db.collection("vip_codes").doc(vipCode).set({
        code: vipCode,
        uid: uid || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "active",
      });

      // 📌 Attribution au user (si UID fourni)
      if (uid) {
        await db.collection("users").doc(uid).update({
          vip_code: vipCode,
          vip_active: true,
          vip_since: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      console.log(`🎉 VIP ${vipCode} attribué à UID: ${uid || "anonyme"}`);
    }

    res.json({
      success: result.status === 0,
      payment_reference: result.payment_reference || null,
      raw: result,
    });
  } catch (err) {
    console.error("❌ Erreur /check-status:", err);
    res.status(500).json({ error: "Impossible de vérifier le statut" });
  }
});

// ✅ Callback PayGate
app.post("/callback", async (req, res) => {
  console.log("📩 Callback reçu:", req.body);

  const { payment_reference, amount, phone_number, identifier, status, uid } = req.body;

  if (payment_reference && status === "0") {
    const vipCode = payment_reference;

    // 📌 Sauvegarde dans vip_codes
    await db.collection("vip_codes").doc(vipCode).set({
      code: vipCode,
      uid: uid || null,
      amount,
      phone_number,
      identifier,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "active",
    });

    // 📌 Attribution directe à l’utilisateur
    if (uid) {
      await db.collection("users").doc(uid).update({
        vip_code: vipCode,
        vip_active: true,
        vip_since: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    console.log(`✅ Code VIP ${vipCode} attribué à UID: ${uid || "anonyme"}`);
  }

  res.json({ message: "Callback bien reçu" });
});

// 🚀 Lancer serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API en ligne sur port ${PORT}`);
});
