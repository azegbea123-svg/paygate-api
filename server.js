import express from "express";
import fetch from "node-fetch";
import admin from "firebase-admin";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 Ton token PayGate est dans les variables Render
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// Initialisation Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}
const db = admin.firestore();

// ✅ Paiement
app.post("/pay", async (req, res) => {
  const { phone_number, amount, network, uid } = req.body;

  try {
    // Debug : voir ce qui part
    console.log("➡️ Envoi à PayGate:", {
      auth_token: AUTH_TOKEN ? "OK" : "NON DEFINI",
      phone_number,
      amount,
      network,
    });

    // Appel PayGate
    const response = await fetch("https://paygateglobal.com/api/v1/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: AUTH_TOKEN, // ✅ obligatoire
        phone_number,
        amount,
        network,
        description: "Activation VIP",
      }),
    });

    const result = await response.json();
    console.log("PayGate response:", result);

    // Vérification succès
    if ((result.status === 0 || result.success === true) && result.payment_reference) {
      const paymentRef = result.payment_reference;

      // Calcul expiration (10 jours)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 10);

      // Enregistrer en Firestore
      await db.collection("vip_codes").add({
        code: paymentRef,
        utilise: true,
        utilisePar: uid || null,
        vipExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        dateUtilisation: admin.firestore.FieldValue.serverTimestamp(),
        active: true,
        via: "paygate",
      });

      return res.json({
        success: true,
        payment_reference: paymentRef,
        expiresAt,
      });
    } else {
      return res.json({
        success: false,
        raw: result,
      });
    }
  } catch (error) {
    console.error("❌ Erreur Paygate:", error);
    res.status(500).json({
      success: false,
      error: "Erreur serveur paiement",
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Serveur Paygate API en ligne sur port ${PORT}`));
