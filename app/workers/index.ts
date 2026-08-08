// ============================================================================
// BullMQ Workers — Tâches asynchrones (OCR, PDF, Email, XML)
// À exécuter avec : npx tsx workers/index.ts
// Dépend de Redis (npm install bullmq ioredis)
// ============================================================================

import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";

// Connexion Redis (à configurer via variables d'environnement)
const connection = new IORedis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
});

// ============================================================================
// QUEUES
// ============================================================================

export const queues = {
  ocr: new Queue("ocr", { connection }),
  pdf: new Queue("pdf", { connection }),
  email: new Queue("email", { connection }),
  xml: new Queue("xml", { connection }),
};

// ============================================================================
// WORKER OCR — Traitement d'image/facture avec Tesseract.js
// ============================================================================

const ocrWorker = new Worker(
  "ocr",
  async (job) => {
    const { documentId, fileUrl } = job.data;
    console.log(`[OCR] Traitement du document ${documentId}...`);

    try {
      // Tesseract.js sera chargé dynamiquement (évite de le charger si non utilisé)
      const Tesseract = await import("tesseract.js");
      
      // Téléchargement et reconnaissance
      const { data } = await Tesseract.recognize(fileUrl, "fra+eng");
      
      // Mise à jour du document avec le texte OCR
      const { updateOCRTexte } = await import("@/lib/documents");
      await updateOCRTexte(documentId, data.text);

      console.log(`[OCR] Terminé pour ${documentId} — ${data.text.length} caractères`);
      return { text: data.text, confidence: data.confidence };
    } catch (error) {
      console.error(`[OCR] Erreur pour ${documentId}:`, error);
      throw error;
    }
  },
  { connection, concurrency: 2 }
);

// ============================================================================
// WORKER PDF — Génération de PDF (factures, états financiers)
// ============================================================================

const pdfWorker = new Worker(
  "pdf",
  async (job) => {
    const { type, data, outputPath } = job.data;
    console.log(`[PDF] Génération ${type}...`);

    try {
      // Puppeteer pour la génération PDF
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
      const page = await browser.newPage();

      // Génération du HTML à partir des données
      const html = generateHTML(type, data);
      await page.setContent(html, { waitUntil: "networkidle0" });

      // Export PDF
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
      });

      await browser.close();

      console.log(`[PDF] Terminé — ${pdf.length} bytes`);
      return { pdf };
    } catch (error) {
      console.error(`[PDF] Erreur:`, error);
      throw error;
    }
  },
  { connection, concurrency: 1 }
);

// ============================================================================
// WORKER EMAIL — Envoi d'emails (factures, relances, notifications)
// ============================================================================

const emailWorker = new Worker(
  "email",
  async (job) => {
    const { to, subject, body, attachments } = job.data;
    console.log(`[EMAIL] Envoi à ${to} — ${subject}`);

    try {
      const nodemailer = await import("nodemailer");

      const transporter = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST ?? "smtp.sendgrid.net",
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `"Compta Sénégal" <${process.env.SMTP_FROM ?? "noreply@compta-senegal.com"}>`,
        to,
        subject,
        html: body,
        attachments: attachments?.map((a: { filename: string; content: Buffer }) => ({
          filename: a.filename,
          content: a.content,
        })),
      });

      console.log(`[EMAIL] Envoyé à ${to}`);
      return { success: true };
    } catch (error) {
      console.error(`[EMAIL] Erreur:`, error);
      throw error;
    }
  },
  { connection, concurrency: 5 }
);

// ============================================================================
// WORKER XML — Génération XML (DSF, UEMOA, factures électroniques)
// ============================================================================

const xmlWorker = new Worker(
  "xml",
  async (job) => {
    const { type, data } = job.data;
    console.log(`[XML] Génération ${type}...`);

    try {
      const { generateDSF_XML } = await import("@/lib/dsfGenerator");
      
      let xml = "";
      switch (type) {
        case "dsf":
          xml = generateDSF_XML(data);
          break;
        default:
          throw new Error(`Type XML inconnu: ${type}`);
      }

      console.log(`[XML] Terminé — ${xml.length} caractères`);
      return { xml };
    } catch (error) {
      console.error(`[XML] Erreur:`, error);
      throw error;
    }
  },
  { connection, concurrency: 2 }
);

// ============================================================================
// DÉMARRAGE
// ============================================================================

console.log("🚀 Workers BullMQ démarrés");
console.log("  📄 OCR Worker actif");
console.log("  📄 PDF Worker actif");
console.log("  📧 Email Worker actif");
console.log("  📄 XML Worker actif");

// Gestion de l'arrêt
process.on("SIGTERM", async () => {
  await Promise.all([
    ocrWorker.close(),
    pdfWorker.close(),
    emailWorker.close(),
    xmlWorker.close(),
    connection.quit(),
  ]);
  process.exit(0);
});