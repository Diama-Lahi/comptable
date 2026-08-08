import { supabase, COMPANY_ID } from "@/lib/supabase";

// ============================================================================
// Module 1.2 — Import automatique des factures depuis les emails
// Supporte IMAP, Gmail, Outlook. L'extraction OCR est déléguée à Tesseract.js
// via le composant OCR existant dans /factures.
// ============================================================================

export type EmailImportConfig = {
  id: string;
  provider: "imap" | "gmail" | "outlook";
  email_address: string;
  folder: string;
  last_checked_at: string | null;
  active: boolean;
};

export type ImportedEmail = {
  id: string;
  config_id: string | null;
  message_id: string;
  from_address: string;
  subject: string;
  received_at: string;
  attachment_count: number;
  processed: boolean;
};

// ---------------------------------------------------------------------------
// GESTION DES CONFIGURATIONS EMAIL
// ---------------------------------------------------------------------------

/** Récupère les configurations d'import email actives */
export async function fetchEmailConfigs(): Promise<EmailImportConfig[]> {
  const { data } = await supabase
    .from("email_import_config")
    .select("id, provider, email_address, folder, last_checked_at, active")
    .eq("company_id", COMPANY_ID)
    .order("email_address");

  return (data ?? []).map((r) => ({
    id: r.id,
    provider: r.provider as EmailImportConfig["provider"],
    email_address: r.email_address,
    folder: r.folder,
    last_checked_at: r.last_checked_at,
    active: r.active,
  }));
}

export type CreateEmailConfigInput = {
  provider: "imap" | "gmail" | "outlook";
  email_address: string;
  password?: string;  // utilisé pour IMAP (chiffré côté serveur)
  folder?: string;
};

/** Crée une configuration d'import email */
export async function createEmailConfig(input: CreateEmailConfigInput): Promise<string> {
  const { data, error } = await supabase
    .from("email_import_config")
    .insert({
      company_id: COMPANY_ID,
      provider: input.provider,
      email_address: input.email_address,
      credentials_ref: input.password ? `pending_${input.email_address}` : null,
      folder: input.folder ?? "INBOX",
      active: true,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Échec création config email");
  return data.id;
}

/** Active ou désactive une configuration */
export async function toggleEmailConfig(id: string, active: boolean) {
  const { error } = await supabase
    .from("email_import_config")
    .update({ active })
    .eq("id", id)
    .eq("company_id", COMPANY_ID);

  if (error) throw new Error(error.message);
}

/** Supprime une configuration */
export async function deleteEmailConfig(id: string) {
  const { error } = await supabase
    .from("email_import_config")
    .delete()
    .eq("id", id)
    .eq("company_id", COMPANY_ID);

  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// GESTION DES EMAILS IMPORTÉS
// ---------------------------------------------------------------------------

/** Récupère l'historique des emails importés */
export async function fetchImportedEmails(limit = 50): Promise<ImportedEmail[]> {
  const { data } = await supabase
    .from("imported_emails")
    .select("id, config_id, message_id, from_address, subject, received_at, attachment_count, processed")
    .eq("company_id", COMPANY_ID)
    .order("received_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id,
    config_id: r.config_id,
    message_id: r.message_id,
    from_address: r.from_address,
    subject: r.subject,
    received_at: r.received_at,
    attachment_count: r.attachment_count,
    processed: r.processed,
  }));
}

/** Récupère les emails non encore traités */
export async function fetchUnprocessedEmails(): Promise<ImportedEmail[]> {
  const { data } = await supabase
    .from("imported_emails")
    .select("id, config_id, message_id, from_address, subject, received_at, attachment_count, processed")
    .eq("company_id", COMPANY_ID)
    .eq("processed", false)
    .order("received_at", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    config_id: r.config_id,
    message_id: r.message_id,
    from_address: r.from_address,
    subject: r.subject,
    received_at: r.received_at,
    attachment_count: r.attachment_count,
    processed: r.processed,
  }));
}

// ---------------------------------------------------------------------------
// CORE : TRAITEMENT D'UN EMAIL POUR CRÉER UNE FACTURE FOURNISSEUR
// ---------------------------------------------------------------------------

export type EmailInvoiceCandidate = {
  emailId: string;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  attachmentCount: number;
  /** Score de confiance pour l'identification du fournisseur (0-1) */
  supplierConfidence: number;
  /** Fournisseur identifié, ou null si inconnu */
  supplierId: string | null;
  supplierName: string | null;
};

/**
 * Identifie le fournisseur à partir de l'adresse email expéditrice.
 * Cherche une correspondance dans la table third_parties.
 */
export async function identifySupplier(fromAddress: string): Promise<{
  supplierId: string | null;
  supplierName: string | null;
  confidence: number;
}> {
  // Cherche par email exact
  const { data: exactMatch } = await supabase
    .from("third_parties")
    .select("id, name")
    .eq("company_id", COMPANY_ID)
    .eq("email", fromAddress)
    .maybeSingle();

  if (exactMatch) {
    return { supplierId: exactMatch.id, supplierName: exactMatch.name, confidence: 1 };
  }

  // Cherche par domaine email (ex: factures@fournisseur.com → "fournisseur")
  const domain = fromAddress.split("@")[1]?.split(".")[0] ?? "";
  if (domain.length > 2) {
    const { data: domainMatch } = await supabase
      .from("third_parties")
      .select("id, name")
      .eq("company_id", COMPANY_ID)
      .ilike("name", `%${domain}%`)
      .maybeSingle();

    if (domainMatch) {
      return { supplierId: domainMatch.id, supplierName: domainMatch.name, confidence: 0.7 };
    }
  }

  return { supplierId: null, supplierName: null, confidence: 0 };
}

/**
 * Simule l'import depuis une boîte email (vraie implémentation côté serveur).
 * Enregistre l'email comme importé pour traitement ultérieur.
 */
export async function recordImportedEmail(
  configId: string,
  messageId: string,
  fromAddress: string,
  subject: string,
  receivedAt: string,
  attachmentCount: number
): Promise<string> {
  const { data, error } = await supabase
    .from("imported_emails")
    .insert({
      company_id: COMPANY_ID,
      config_id: configId,
      message_id: messageId,
      from_address: fromAddress,
      subject,
      received_at: receivedAt,
      attachment_count: attachmentCount,
      processed: false,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

/** Marque un email comme traité */
export async function markEmailProcessed(emailId: string) {
  const { error } = await supabase
    .from("imported_emails")
    .update({ processed: true })
    .eq("id", emailId)
    .eq("company_id", COMPANY_ID);

  if (error) throw new Error(error.message);
}

/**
 * Crée une facture fournisseur "received" à partir d'un email importé
 * et du résultat OCR. Les lignes sont à compléter après OCR.
 */
export async function createInvoiceFromEmail(params: {
  emailId: string;
  supplierId: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string | null;
  amountHt: number | null;
  tvaRate: number;
  tvaAmount: number | null;
  amountTtc: number | null;
  fileUrl: string | null;
  ocrRaw: Record<string, unknown> | null;
}): Promise<string> {
  const { data: invoice, error: invError } = await supabase
    .from("invoices")
    .insert({
      company_id: COMPANY_ID,
      type: "fournisseur",
      third_party_id: params.supplierId,
      invoice_number: params.invoiceNumber,
      invoice_date: params.invoiceDate,
      due_date: params.dueDate,
      amount_ht: params.amountHt,
      tva_rate: params.tvaRate,
      tva_amount: params.tvaAmount,
      amount_ttc: params.amountTtc,
      status: "received",
      file_url: params.fileUrl,
      ocr_raw: params.ocrRaw,
    })
    .select("id")
    .single();

  if (invError || !invoice) throw new Error(invError?.message ?? "Échec création facture");

  // Marque l'email comme traité
  await markEmailProcessed(params.emailId);

  return invoice.id;
}

// ---------------------------------------------------------------------------
// SERVICE D'ANALYSE DE SUJET POUR EXTRAIRE DES INFORMATIONS
// ---------------------------------------------------------------------------

/** Extrait un numéro de facture depuis le sujet d'un email (patterns courants) */
export function extractInvoiceNumberFromSubject(subject: string): string | null {
  const patterns = [
    /facture\s*(n[°o]?[:.]?\s*)?([A-Z0-9][-A-Z0-9/]{3,20})/i,
    /invoice\s*(n[°o]?[:.]?\s*)?([A-Z0-9][-A-Z0-9/]{3,20})/i,
    /(?:n°|nro|#)\s*([A-Z0-9][-A-Z0-9/]{3,20})/i,
    /([A-Z]{2,4}\d{4,})/,
  ];

  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match) {
      return match[2] ?? match[1] ?? null;
    }
  }
  return null;
}

/** Extrait le montant TTC depuis le sujet si présent */
export function extractAmountFromSubject(subject: string): number | null {
  const patterns = [
    /(\d[\d\s]*)\s*(?:fcfa|xof|f\s*cfa)\b/i,
    /(\d[\d\s]*)\s*(?:euro|eur)\b/i,
  ];

  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match) {
      const cleaned = match[1].replace(/\s/g, "");
      const amount = parseFloat(cleaned);
      if (!isNaN(amount)) return amount;
    }
  }
  return null;
}