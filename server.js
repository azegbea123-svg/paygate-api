import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

// ✅ Middleware
app.use(express.json());
app.use(cors({ origin: "*" })); // autorise toutes les origines (à restreindre plus tard)

// 🔑 Le token PayGate est défini dans Render (Settings → Environment → AUTH_TOKEN)
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// ✅ Route pour initier un paiement
app.post("/pay", async (req, res) => {
  const { phone_number, amount, network } = req.body;
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

    // 🔹 On simplifie la réponse au frontend
    res.json({
      success: result.status === 0 || result.success === true,
      payment_reference: result.tx_reference || result.payment_reference,
      raw: result, // tu gardes la réponse brute si besoin
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

// ✅ Vérifier ton solde
app.post("/check-balance", async (req, res) => {
  try {
    const response = await fetch("https://paygateglobal.com/api/v1/check-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: AUTH_TOKEN,
      }),
    });

    const result = await response.json();
    console.log("💰 Solde:", result);
    res.json(result);
  } catch (err) {
    console.error("❌ Erreur /check-balance:", err);
    res.status(500).json({ error: "Impossible de consulter le solde" });
  }
});

// ✅ Callback (PayGate envoie ici la confirmation finale)
app.post("/callback", (req, res) => {
  console.log("📩 Callback reçu:", req.body);

  // Ici tu peux : 
  // - marquer le code comme actif dans Firestore automatiquement
  // - ou simplement logger pour vérifier
  // NB : callback => confirmation de PayGate que le paiement est bien passé

  res.json({ message: "Callback bien reçu" });
});

// 🚀 Lancer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API en ligne sur port ${PORT}`);
});
