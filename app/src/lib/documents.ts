import { supabase, COMPANY_ID } from "@/lib/supabase";

// ============================================================================
// GED — Gestion Électronique de Documents
// Upload, OCR, recherche full-text, archivage PDF/A
// ============================================================================

export type Document = {
  id: string;
  document_type_id: string | null;
  document_type_label?: string;
  invoice_id: string | null;
  entry_id: string | null;
  filename: string;
  mime_type: string;
  file_size: number | null;
  file_url: string;
  ocr_text: string | null;
  ocr_done: boolean;
  validation_status: "pending" | "validated" | "rejected";
  tags: string[];
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type DocumentType = {
  id: string;
  code: string;
  label: string;
  retention_months: number;
  requires_validation: boolean;
};

/** Récupère les types de documents disponibles */
export async function fetchDocumentTypes(): Promise<DocumentType[]> {
  const { data } = await supabase
    .from("document_types")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .order("label");
  return (data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label,
    retention_months: r.retention_months,
    requires_validation: r.requires_validation,
  }));
}

/** Récupère la liste des documents */
export async function fetchDocuments(search?: string): Promise<Document[]> {
  let query = supabase
    .from("documents")
    .select("*, document_types!left(label)")
    .eq("company_id", COMPANY_ID)
    .order("created_at", { ascending: false })
    .limit(100);

  if (search) {
    query = query.or(`filename.ilike.%${search}%,ocr_text.ilike.%${search}%,tags.cs.{${search}}`);
  }

  const { data } = await query;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    document_type_id: r.document_type_id as string | null,
    document_type_label: (r.document_types as Record<string, string> | null)?.label ?? "Non classé",
    invoice_id: r.invoice_id as string | null,
    entry_id: r.entry_id as string | null,
    filename: r.filename as string,
    mime_type: r.mime_type as string,
    file_size: r.file_size ? Number(r.file_size) : null,
    file_url: r.file_url as string,
    ocr_text: r.ocr_text as string | null,
    ocr_done: r.ocr_done as boolean ?? false,
    validation_status: r.validation_status as Document["validation_status"],
    tags: (r.tags as string[]) ?? [],
    notes: r.notes as string | null,
    uploaded_by: r.uploaded_by as string | null,
    created_at: r.created_at as string,
  }));
}

/** Upload d'un document */
export async function uploadDocument(input: {
  file: File;
  document_type_id?: string;
  invoice_id?: string;
  entry_id?: string;
  tags?: string[];
  notes?: string;
}): Promise<string> {
  // 1. Upload du fichier vers Supabase Storage
  const fileName = `${Date.now()}-${input.file.name}`;
  const { data: storageData, error: storageError } = await supabase.storage
    .from("documents")
    .upload(`${COMPANY_ID}/${fileName}`, input.file);

  if (storageError) throw new Error(storageError.message);

  const fileUrl = supabase.storage.from("documents").getPublicUrl(`${COMPANY_ID}/${fileName}`).data.publicUrl;

  // 2. Enregistrement en base
  const { data, error } = await supabase
    .from("documents")
    .insert({
      company_id: COMPANY_ID,
      document_type_id: input.document_type_id ?? null,
      invoice_id: input.invoice_id ?? null,
      entry_id: input.entry_id ?? null,
      filename: input.file.name,
      mime_type: input.file.type,
      file_size: input.file.size,
      file_url: fileUrl,
      validation_status: "pending",
      tags: input.tags ?? [],
      notes: input.notes ?? null,
      uploaded_by: "current_user",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Échec enregistrement document");
  return data.id;
}

/** Valide ou rejette un document */
export async function validateDocument(id: string, status: "validated" | "rejected", notes?: string) {
  const { error } = await supabase
    .from("documents")
    .update({ validation_status: status, validated_by: "current_user", validated_at: new Date().toISOString(), notes: notes ?? null })
    .eq("id", id)
    .eq("company_id", COMPANY_ID);
  if (error) throw new Error(error.message);
}

/** Archive un document (PDF/A) */
export async function archiveDocument(id: string) {
  const retentionEnd = new Date();
  retentionEnd.setFullYear(retentionEnd.getFullYear() + 10);

  const { error } = await supabase
    .from("documents")
    .update({ archive_date: new Date().toISOString().slice(0, 10), retention_end: retentionEnd.toISOString().slice(0, 10) })
    .eq("id", id)
    .eq("company_id", COMPANY_ID);
  if (error) throw new Error(error.message);
}

/** Met à jour l'OCR d'un document */
export async function updateOCRTexte(docId: string, ocrText: string) {
  const { error } = await supabase
    .from("documents")
    .update({ ocr_text: ocrText, ocr_done: true })
    .eq("id", docId);
  if (error) throw new Error(error.message);
}