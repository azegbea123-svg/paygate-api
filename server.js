import express from "express";
import fetch from "node-fetch";
import cors from "cors";

// 🔥 Firebase
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// ✅ Initialiser Firebase Admin (Render doit avoir GOOGLE_APPLICATION_CREDENTIALS)
initializeApp({
  credential: applicationDefault(),
});
const db = getFirestore();

const app = express();

// ✅ Middleware
app.use(express.json());
app.use(cors({ origin: "*" }));

// 🔑 Ton token PayGate (dans Render → Environment → AUTH_TOKEN)
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// ✅ Route pour initier un paiement
app.post("/pay", async (req, res) => {
  const { phone_number, amount, network, userId } = req.body;
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
      tx_reference: result.tx_reference,                 // identifiant transaction
      payment_reference: result.payment_reference || "", // dispo si payé
      raw: result,
    });
  } catch (err) {
    console.error("❌ Erreur /pay:", err);
    res.status(500).json({ error: "Impossible d’initier le paiement" });
  }
});

// ✅ Vérifier le statut d'une transaction
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
      raw: result,
    });
  } catch (err) {
    console.error("❌ Erreur /check-status:", err);
    res.status(500).json({ error: "Impossible de vérifier le statut" });
  }
});

// ✅ Vérifier ton solde PayGate
app.post("/check-balance", async (req, res) => {
  try {
    const response = await fetch("https://paygateglobal.com/api/v1/check-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth_token: AUTH_TOKEN }),
    });

    const result = await response.json();
    console.log("💰 Solde:", result);
    res.json(result);
  } catch (err) {
    console.error("❌ Erreur /check-balance:", err);
    res.status(500).json({ error: "Impossible de consulter le solde" });
  }
});

// ✅ Callback (confirmation finale de PayGate)
app.post("/callback", async (req, res) => {
  console.log("📩 Callback reçu:", req.body);

  try {
    const { status, payment_reference, userId } = req.body;

    if (status === "SUCCESS" && payment_reference) {
      // 🔹 Calcul de l’expiration (10 jours)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 10);

      // 🔹 Enregistrer dans Firestore
      await db.collection("vip_codes").add({
        code: payment_reference,
        utilise: true,
        utilisePar: userId || null,
        vipExpiresAt: Timestamp.fromDate(expiresAt),
        dateUtilisation: Timestamp.now(),
        active: true,
        via: "paygate",
      });

      console.log(`✅ Paiement confirmé, VIP activé jusqu’au ${expiresAt}`);
    } else {
      console.log("❌ Paiement non confirmé par PayGate.");
    }
  } catch (err) {
    console.error("⚠️ Erreur callback Firestore:", err);
  }

  res.json({ message: "Callback bien reçu" });
});

// 🚀 Lancer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API en ligne sur port ${PORT}`);
});
