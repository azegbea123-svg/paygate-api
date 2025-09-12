import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// 🔑 Token PayGate (Render → Environment → AUTH_TOKEN)
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// ✅ Initier un paiement
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

    res.json({
      success: result.status === 0 || result.success === true,
      tx_reference: result.tx_reference, // pour suivi interne
      payment_reference: result.payment_reference || null, // ✅ ton futur code VIP
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
      payment_reference: result.payment_reference || null, // ✅ retourne le code VIP réel
      raw: result,
    });
  } catch (err) {
    console.error("❌ Erreur /check-status:", err);
    res.status(500).json({ error: "Impossible de vérifier le statut" });
  }
});

// ✅ Callback (confirmation PayGate)
app.post("/callback", (req, res) => {
  console.log("📩 Callback reçu:", req.body);

  // Exemple : récupération du vrai code VIP
  const paymentRef = req.body.payment_reference;

  if (paymentRef) {
    console.log("✅ Code VIP confirmé:", paymentRef);
    // 👉 Ici tu peux l’enregistrer dans Firestore avec l’UID utilisateur
  }

  res.json({ message: "Callback bien reçu" });
});

// 🚀 Lancer serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API en ligne sur port ${PORT}`);
});
