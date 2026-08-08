import { supabase, COMPANY_ID } from "@/lib/supabase";

// ============================================================================
// Module 1.7 & 2.4 — Échéancier & Relances automatiques
// Gère les relances fournisseurs (échéances de paiement) et clients (impayés)
// ============================================================================

export type ReminderTemplate = {
  id: string;
  entity_type: "supplier" | "client";
  trigger_day: number;     // J-5, J+10, J+30, etc.
  subject_template: string;
  body_template: string;
  method: "email" | "letter" | "both";
  active: boolean;
};

export type DueItem = {
  id: string;
  type: "invoice_supplier" | "invoice_client";
  invoice_id: string;
  invoice_number: string | null;
  third_party_id: string;
  third_party_name: string;
  third_party_email: string | null;
  amount: number;
  due_date: string;
  days_until_due: number;  // négatif = déjà dépassé
  status: string;
};

// ---------------------------------------------------------------------------
// GESTION DES TEMPLATES DE RELANCE
// ---------------------------------------------------------------------------

export async function fetchReminderTemplates(entityType?: "supplier" | "client"): Promise<ReminderTemplate[]> {
  let query = supabase
    .from("reminder_templates")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("active", true)
    .order("trigger_day");

  if (entityType) query = query.eq("entity_type", entityType);

  const { data } = await query;
  return (data ?? []).map((r) => ({
    id: r.id,
    entity_type: r.entity_type as ReminderTemplate["entity_type"],
    trigger_day: r.trigger_day,
    subject_template: r.subject_template,
    body_template: r.body_template,
    method: r.method as ReminderTemplate["method"],
    active: r.active,
  }));
}

export type SaveTemplateInput = {
  id?: string;
  entity_type: "supplier" | "client";
  trigger_day: number;
  subject_template: string;
  body_template: string;
  method?: "email" | "letter" | "both";
};

export async function saveReminderTemplate(input: SaveTemplateInput): Promise<string> {
  const payload = {
    company_id: COMPANY_ID,
    entity_type: input.entity_type,
    trigger_day: input.trigger_day,
    subject_template: input.subject_template,
    body_template: input.body_template,
    method: input.method ?? "email",
    active: true,
  };

  if (input.id) {
    const { error } = await supabase.from("reminder_templates").update(payload).eq("id", input.id);
    if (error) throw new Error(error.message);
    return input.id;
  }

  const { data, error } = await supabase
    .from("reminder_templates")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Échec création template");
  return data.id;
}

export async function deleteReminderTemplate(id: string) {
  const { error } = await supabase
    .from("reminder_templates")
    .delete()
    .eq("id", id)
    .eq("company_id", COMPANY_ID);

  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// ÉCHÉANCIER
// ---------------------------------------------------------------------------

/** Récupère les factures fournisseurs arrivant à échéance (impayées) */
export async function fetchSupplierDueInvoices(): Promise<DueItem[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, due_date, amount_ttc, status,
      third_party_id, third_parties!inner(name, email)
    `)
    .eq("company_id", COMPANY_ID)
    .eq("type", "fournisseur")
    .eq("status", "approved")
    .is("cancelled_by_invoice_id", null)
    .order("due_date");

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
    const due = (row.due_date as string) ?? today;
    const dueMs = new Date(due).getTime();
    const todayMs = new Date(today).getTime();
    return {
      id: row.id as string,
      type: "invoice_supplier" as const,
      invoice_id: row.id as string,
      invoice_number: row.invoice_number as string | null,
      third_party_id: row.third_party_id as string,
      third_party_name: (row.third_parties as Record<string, unknown>)?.name as string ?? "",
      third_party_email: (row.third_parties as Record<string, unknown>)?.email as string | null,
      amount: Number(row.amount_ttc),
      due_date: due,
      days_until_due: Math.round((dueMs - todayMs) / 86400000),
      status: row.status as string,
    };
  });
}

/** Récupère les factures clients impayées (en retard) */
export async function fetchClientOverdueInvoices(): Promise<DueItem[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, due_date, amount_ttc, status,
      third_party_id, third_parties!inner(name, email)
    `)
    .eq("company_id", COMPANY_ID)
    .eq("type", "client")
    .eq("status", "approved")
    .is("cancelled_by_invoice_id", null)
    .lt("due_date", today)
    .order("due_date");

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
    const due = (row.due_date as string) ?? today;
    const dueMs = new Date(due).getTime();
    const todayMs = new Date(today).getTime();
    return {
      id: row.id as string,
      type: "invoice_client" as const,
      invoice_id: row.id as string,
      invoice_number: row.invoice_number as string | null,
      third_party_id: row.third_party_id as string,
      third_party_name: (row.third_parties as Record<string, unknown>)?.name as string ?? "",
      third_party_email: (row.third_parties as Record<string, unknown>)?.email as string | null,
      amount: Number(row.amount_ttc),
      due_date: due,
      days_until_due: Math.round((dueMs - todayMs) / 86400000),
      status: row.status as string,
    };
  });
}

// ---------------------------------------------------------------------------
// GÉNÉRATION DE RELANCE
// ---------------------------------------------------------------------------

export type ReminderToSend = {
  invoiceId: string;
  thirdPartyName: string;
  thirdPartyEmail: string | null;
  invoiceNumber: string | null;
  amount: number;
  dueDate: string;
  daysOverdue: number;
  template: ReminderTemplate;
  subject: string;
  body: string;
};

/**
 * Génère les relances à envoyer aujourd'hui en fonction des templates actifs
 * et des échéances.
 */
export async function generateReminders(): Promise<{
  supplierReminders: ReminderToSend[];
  clientReminders: ReminderToSend[];
}> {
  const templates = await fetchReminderTemplates();
  const supplierTemplates = templates.filter((t) => t.entity_type === "supplier");
  const clientTemplates = templates.filter((t) => t.entity_type === "client");

  const supplierDue = await fetchSupplierDueInvoices();
  const clientOverdue = await fetchClientOverdueInvoices();

  const supplierReminders: ReminderToSend[] = [];
  const clientReminders: ReminderToSend[] = [];

  for (const tpl of supplierTemplates) {
    for (const inv of supplierDue) {
      if (inv.days_until_due === tpl.trigger_day) {
        supplierReminders.push(buildReminder(inv, tpl));
      }
    }
  }

  for (const tpl of clientTemplates) {
    for (const inv of clientOverdue) {
      if (inv.days_until_due === tpl.trigger_day) {
        clientReminders.push(buildReminder(inv, tpl));
      }
    }
  }

  return { supplierReminders, clientReminders };
}

function buildReminder(item: DueItem, template: ReminderTemplate): ReminderToSend {
  const subject = template.subject_template
    .replace("{{invoice_number}}", item.invoice_number ?? "N/A")
    .replace("{{amount}}", item.amount.toFixed(2))
    .replace("{{due_date}}", item.due_date)
    .replace("{{third_party}}", item.third_party_name);

  const body = template.body_template
    .replace("{{invoice_number}}", item.invoice_number ?? "N/A")
    .replace("{{amount}}", item.amount.toFixed(2))
    .replace("{{due_date}}", item.due_date)
    .replace("{{third_party}}", item.third_party_name)
    .replace("{{days_overdue}}", String(Math.abs(item.days_until_due)));

  return {
    invoiceId: item.invoice_id,
    thirdPartyName: item.third_party_name,
    thirdPartyEmail: item.third_party_email,
    invoiceNumber: item.invoice_number,
    amount: item.amount,
    dueDate: item.due_date,
    daysOverdue: Math.abs(item.days_until_due),
    template,
    subject,
    body,
  };
}

// ---------------------------------------------------------------------------
// TABLEAU DE BORD ÉCHÉANCIER
// ---------------------------------------------------------------------------

export type EcheancierSummary = {
  totalFournisseurs: number;
  montantTotalFournisseurs: number;
  totalClientsImpayes: number;
  montantTotalClients: number;
  joursMoyenRetard: number;
  alerteSeuil: boolean;
};

export async function fetchEcheancierSummary(): Promise<EcheancierSummary> {
  const supplierDue = await fetchSupplierDueInvoices();
  const clientOverdue = await fetchClientOverdueInvoices();

  const totalFournisseurs = supplierDue.length;
  const montantFournisseurs = supplierDue.reduce((s, i) => s + i.amount, 0);
  const totalClients = clientOverdue.length;
  const montantClients = clientOverdue.reduce((s, i) => s + i.amount, 0);

  const retards = clientOverdue.map((i) => Math.abs(i.days_until_due));
  const joursRetard = retards.length > 0 ? Math.round(retards.reduce((a, b) => a + b, 0) / retards.length) : 0;

  return {
    totalFournisseurs: totalFournisseurs,
    montantTotalFournisseurs: montantFournisseurs,
    totalClientsImpayes: totalClients,
    montantTotalClients: montantClients,
    joursMoyenRetard: joursRetard,
    alerteSeuil: totalClients > 0 && joursRetard > 30,
  };
}