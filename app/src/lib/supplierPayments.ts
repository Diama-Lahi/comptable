import { supabase, COMPANY_ID } from "@/lib/supabase";

// ============================================================================
// Module 1.8 — Paiements fournisseurs & génération fichier virement XML UEMOA
// ============================================================================

export type SupplierPaymentBatch = {
  id: string;
  batch_number: string;
  batch_date: string;
  total_amount: number;
  payment_count: number;
  format: "xml_uemoa" | "sepa" | "csv";
  file_generated: boolean;
  file_url: string | null;
  status: "pending" | "generated" | "executed" | "cancelled";
  executed_date: string | null;
  created_at: string;
};

export type SupplierPaymentItem = {
  id: string;
  batch_id: string;
  payment_id: string | null;
  supplier_id: string;
  supplier_name?: string;
  amount: number;
  bank_account_iban: string | null;
  bank_account_bic: string | null;
  communication: string | null;
  status: "pending" | "included" | "error";
};

/** Récupère les factures fournisseurs impayées */
export async function fetchUnpaidSupplierInvoices() {
  const { data } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, invoice_date, due_date, amount_ttc,
      third_party_id, third_parties!inner(name, phone, email)
    `)
    .eq("company_id", COMPANY_ID)
    .eq("type", "fournisseur")
    .eq("status", "approved")
    .is("cancelled_by_invoice_id", null)
    .order("due_date");

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    invoice_number: row.invoice_number as string | null,
    invoice_date: row.invoice_date as string | null,
    due_date: row.due_date as string | null,
    amount_ttc: Number(row.amount_ttc),
    third_party_id: row.third_party_id as string,
    third_party_name: (row.third_parties as Record<string, unknown>)?.name as string ?? "",
  }));
}

/** Crée un lot de paiement fournisseurs */
export async function createPaymentBatch(
  items: { payment_id: string | null; supplier_id: string; amount: number; iban: string; bic: string; communication: string }[]
): Promise<string> {
  const { data: nextNum } = await supabase.rpc("next_legal_number", {
    p_company_id: COMPANY_ID,
    p_fiscal_year: new Date().getFullYear(),
    p_prefix: "VIR",
  });

  const batchNumber = `VIR-${new Date().getFullYear()}-${String(nextNum ?? 1).padStart(6, "0")}`;
  const totalAmount = items.reduce((s, i) => s + i.amount, 0);

  // Récupère les noms des fournisseurs
  const supplierIds = [...new Set(items.map((i) => i.supplier_id))];
  const { data: suppliers } = await supabase
    .from("third_parties")
    .select("id, name")
    .in("id", supplierIds);

  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

  const { data: batch, error: batchError } = await supabase
    .from("supplier_payment_batches")
    .insert({
      company_id: COMPANY_ID,
      batch_number: batchNumber,
      batch_date: new Date().toISOString().slice(0, 10),
      total_amount: totalAmount,
      payment_count: items.length,
      format: "xml_uemoa",
      status: "pending",
    })
    .select("id")
    .single();

  if (batchError || !batch) throw new Error(batchError?.message ?? "Échec création lot");

  const { error: itemsError } = await supabase.from("supplier_payment_items").insert(
    items.map((item) => ({
      batch_id: batch.id,
      payment_id: item.payment_id,
      supplier_id: item.supplier_id,
      amount: item.amount,
      bank_account_iban: item.iban,
      bank_account_bic: item.bic,
      communication: item.communication,
      status: "pending",
    }))
  );

  if (itemsError) throw new Error(itemsError.message);

  // Génère le fichier XML UEMOA
  const xml = generateXMLUEMOA(batchNumber, items, supplierMap);

  // Sauvegarde le XML (dans une vraie app, on uploaderait dans Supabase Storage)
  const { error: updateError } = await supabase
    .from("supplier_payment_batches")
    .update({
      file_generated: true,
      file_url: `generated/${batchNumber}.xml`,
      status: "generated",
    })
    .eq("id", batch.id);

  if (updateError) throw new Error(updateError.message);

  // Met à jour le statut des paiements
  const paymentIds = items.filter((i) => i.payment_id).map((i) => i.payment_id);
  if (paymentIds.length > 0) {
    await supabase
      .from("payments")
      .update({ status: "executed", executed_date: new Date().toISOString().slice(0, 10) })
      .in("id", paymentIds);
  }

  return batch.id;
}

/** Génère le XML UEMOA pour virement bancaire */
function generateXMLUEMOA(
  batchNumber: string,
  items: { supplier_id: string; amount: number; iban: string; bic: string; communication: string }[],
  supplierNames: Map<string, string>
): string {
  const now = new Date().toISOString().slice(0, 10);

  const credits = items
    .map(
      (item, i) => `
    <CdtTrfTx>
      <PmtId>
        <EndToEndId>${batchNumber}-${i + 1}</EndToEndId>
      </PmtId>
      <Amt>
        <InstdAmt Ccy="XOF">${item.amount.toFixed(2)}</InstdAmt>
      </Amt>
      <Cdtr>
        <Nm>${escapeXml(supplierNames.get(item.supplier_id) ?? "Fournisseur")}</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <IBAN>${item.iban}</IBAN>
        </Id>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>${item.bic}</BICFI>
        </FinInstnId>
      </CdtrAgt>
      <RmtInf>
        <Ustrd>${escapeXml(item.communication)}</Ustrd>
      </RmtInf>
    </CdtTrfTx>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${batchNumber}</MsgId>
      <CreDtTm>${now}T00:00:00</CreDtTm>
      <NbOfTxs>${items.length}</NbOfTxs>
      <CtrlSum>${items.reduce((s, i) => s + i.amount, 0).toFixed(2)}</CtrlSum>
      <InitgPty>
        <Nm>Compta Sénégal</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${batchNumber}-001</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${items.length}</NbOfTxs>
      <CtrlSum>${items.reduce((s, i) => s + i.amount, 0).toFixed(2)}</CtrlSum>
      <ReqdExctnDt>${now}</ReqdExctnDt>
      <Dbtr>
        <Nm>Compta Sénégal - Client</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>XXXX</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>XXXX</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <ChrgBr>CRED</ChrgBr>
      <CdtTrfTxInf>${credits}
      </PmtInf>
    </CstmrCdtTrfInitn>
  </CstmrCdtTrfInitn>
</Document>`;
}

function escapeXml(unsafe: string): string {
  if (!unsafe) return "";
  const a = "amp";
  const l = "lt";
  const g = "gt";
  const q = "quot";
  const ap = "apos";
  return unsafe
    .replace(/&/g, "&" + a + ";")
    .replace(/</g, "&" + l + ";")
    .replace(/>/g, "&" + g + ";")
    .replace(/"/g, "&" + q + ";")
    .replace(/'/g, "&" + ap + ";");
}

/** Récupère les lots de paiement */
export async function fetchPaymentBatches(): Promise<SupplierPaymentBatch[]> {
  const { data } = await supabase
    .from("supplier_payment_batches")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .order("batch_date", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    batch_number: r.batch_number,
    batch_date: r.batch_date,
    total_amount: Number(r.total_amount),
    payment_count: r.payment_count,
    format: r.format as SupplierPaymentBatch["format"],
    file_generated: r.file_generated,
    file_url: r.file_url,
    status: r.status as SupplierPaymentBatch["status"],
    executed_date: r.executed_date,
    created_at: r.created_at,
  }));
}

/** Marque un lot comme exécuté */
export async function executePaymentBatch(batchId: string) {
  const { error } = await supabase
    .from("supplier_payment_batches")
    .update({
      status: "executed",
      executed_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", batchId)
    .eq("company_id", COMPANY_ID);

  if (error) throw new Error(error.message);
}