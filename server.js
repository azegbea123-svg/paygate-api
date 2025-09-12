import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import admin from "firebase-admin";

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// 🔑 Token PayGate
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// ✅ Initialisation Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}
const db = admin.firestore();

// ✅ Initier un paiement
app.post("/pay", async (req, res) => {
  const { phone_number, amount, network, uid } = req.body; // 🔹 uid ajouté
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

    // 🔹 Sauvegarde provisoire de la transaction avec l’uid
    if (uid && result.tx_reference) {
      await db.collection("transactions").doc(result.tx_reference.toString()).set({
        uid,
        phone_number,
        amount,
        network,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
      });
    }

    res.json({
      success: result.status === 0 || result.success === true,
      tx_reference: result.tx_reference,
      payment_reference: result.payment_reference || null, // ⚡ futur code VIP
      raw: result,
    });
  } catch (err) {
    console.error("❌ Erreur /pay:", err);
    res.status(500).json({ error: "Impossible d’initier le paiement" });
  }
});

// ✅ Vérifier le statut
app.post("/check-status", async (req, res) => {
  const { tx_reference } = req.body;

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

// ✅ Callback (confirmation PayGate → crée le code VIP)
app.post("/callback", async (req, res) => {
  console.log("📩 Callback reçu:", req.body);

  try {
    const { payment_reference, tx_reference, phone_number, amount } = req.body;
    if (!payment_reference) {
      return res.status(400).json({ error: "payment_reference manquant" });
    }

    // Récupérer l’UID associé à la transaction (s’il existe)
    let uid = null;
    if (tx_reference) {
      const transSnap = await db.collection("transactions").doc(tx_reference.toString()).get();
      if (transSnap.exists) {
        uid = transSnap.data().uid || null;
      }
    }

    // Calcul expiration (10 jours)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 10);

    // Enregistrement du code VIP
    await db.collection("vip_codes").add({
      code: payment_reference, // ✅ code VIP
      utilise: true,
      utilisePar: uid || null,
      vipExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      dateUtilisation: admin.firestore.FieldValue.serverTimestamp(),
      active: true,
      via: "paygate",
      tx_reference,
      phone_number,
      amount,
    });

    console.log(`✅ Code VIP confirmé et enregistré: ${payment_reference} (uid: ${uid || "aucun"})`);

    res.json({ success: true, code: payment_reference });
  } catch (error) {
    console.error("❌ Erreur enregistrement VIP:", error);
    res.status(500).json({ error: "Impossible d’enregistrer le code VIP" });
  }
});

// 🚀 Lancer serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API en ligne sur port ${PORT}`);
});
