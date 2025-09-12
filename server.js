import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import admin from "firebase-admin";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const app = express();

// ✅ Middleware
app.use(express.json());
app.use(cors({ origin: "*" })); // autorise toutes les origines (à restreindre plus tard)

// 🔑 Le token PayGate est défini dans Render (Settings → Environment → AUTH_TOKEN)
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// ✅ Init Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}
const db = admin.firestore();

// ✅ Route pour initier un paiement
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

    if (result.tx_reference) {
      // 🔹 Création du code VIP provisoire (pending)
      await db.collection("vip_codes").doc(result.tx_reference.toString()).set({
        code: result.tx_reference.toString(),
        status: "pending",
        utilise: false,
        utilisePar: uid || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    res.json({
      success: result.status === 0 || result.success === true,
      payment_reference: result.tx_reference, // provisoire
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

    if (result.status === 0 && result.payment_reference) {
      // ✅ Activer le VIP dans Firestore (migrer vers payment_reference)
      const vipDoc = db.collection("vip_codes").doc(tx_reference.toString());
      const snap = await vipDoc.get();

      if (snap.exists) {
        const data = snap.data();

        await db.collection("vip_codes").doc(result.payment_reference.toString()).set({
          code: result.payment_reference.toString(),
          status: "active",
          utilise: true,
          utilisePar: data.utilisePar || null,
          tx_reference,
          payment_reference: result.payment_reference,
          activatedAt: admin.firestore.FieldValue.serverTimestamp(),
          vipExpiresAt: admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) // +10 jours
          ),
        });

        await vipDoc.update({
          migratedTo: result.payment_reference,
          status: "migrated",
        });
      }
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

// ✅ Vérifier ton solde
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

// ✅ Callback (PayGate envoie ici la confirmation finale)
app.post("/callback", async (req, res) => {
  console.log("📩 Callback reçu:", req.body);

  const { tx_reference, payment_reference, amount, phone_number } = req.body;

  if (tx_reference && payment_reference) {
    // 🔹 Récupérer le doc provisoire
    const vipDoc = db.collection("vip_codes").doc(tx_reference.toString());
    const snap = await vipDoc.get();

    if (snap.exists) {
      const data = snap.data();

      // 🔹 Créer le vrai VIP code basé sur payment_reference
      await db.collection("vip_codes").doc(payment_reference.toString()).set({
        code: payment_reference.toString(),
        status: "active",
        utilise: true,
        utilisePar: data.utilisePar || null, // uid de l’initiateur
        tx_reference,
        amount,
        phone_number,
        activatedAt: admin.firestore.FieldValue.serverTimestamp(),
        vipExpiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) // +10 jours
        ),
      });

      // 🔹 Marquer l’ancien doc
      await vipDoc.update({
        migratedTo: payment_reference,
        status: "migrated",
      });

      console.log(`✅ VIP activé: ${payment_reference} lié à UID ${data.utilisePar}`);
    } else {
      console.warn("⚠️ Aucun doc provisoire trouvé pour", tx_reference);
    }
  }

  res.json({ message: "Callback bien reçu" });
});

// 🚀 Lancer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API en ligne sur port ${PORT}`);
});
