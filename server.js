import express from "express";
import fetch from "node-fetch";
import admin from "firebase-admin";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Initialisation Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}
const db = admin.firestore();

app.post("/pay", async (req, res) => {
  const { phone_number, amount, network, uid } = req.body;

  try {
    // Appel à Paygate
    const response = await fetch("https://paygateglobal.com/api/v1/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone_number,
        amount,
        network,
        description: "Activation VIP"
      })
    });

    const result = await response.json();
    console.log("Paygate response:", result);

    if (result.status === "success" && result.payment_reference) {
      const paymentRef = result.payment_reference;

      // Calcul expiration (10 jours)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 10);

      // Enregistrement du code VIP
      await db.collection("vip_codes").add({
        code: paymentRef, // ✅ toujours basé sur payment_reference
        utilise: true,
        utilisePar: uid || null,
        vipExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        dateUtilisation: admin.firestore.FieldValue.serverTimestamp(),
        active: true,
        via: "paygate"
      });

      return res.json({
        success: true,
        payment_reference: paymentRef,
        expiresAt
      });
    } else {
      return res.json({
        success: false,
        raw: result
      });
    }
  } catch (error) {
    console.error("Erreur Paygate:", error);
    res.status(500).json({
      success: false,
      error: "Erreur serveur paiement"
    });
  }
});

app.listen(3000, () => console.log("✅ Serveur Paygate API en ligne sur port 3000"));
