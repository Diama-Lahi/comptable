import { supabase, COMPANY_ID } from "@/lib/supabase";

// ============================================================================
// SERVICE DE NOTIFICATIONS — In-app, email, webhooks
// ============================================================================

export type Notification = {
  id: string;
  type: "info" | "warning" | "success" | "error" | "task";
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

// ---------------------------------------------------------------------------
// NOTIFICATIONS IN-APP
// ---------------------------------------------------------------------------

/** Récupère les notifications de l'utilisateur connecté */
export async function fetchNotifications(unreadOnly = false): Promise<Notification[]> {
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .order("created_at", { ascending: false })
    .limit(50);

  if (unreadOnly) query = query.eq("is_read", false);

  const { data } = await query;
  return (data ?? []).map((r) => ({
    id: r.id,
    type: r.type as Notification["type"],
    title: r.title,
    body: r.body,
    link: r.link,
    is_read: r.is_read,
    created_at: r.created_at,
  }));
}

/** Envoie une notification in-app */
export async function sendNotification(input: {
  userId?: string;
  type: Notification["type"];
  title: string;
  body?: string;
  link?: string;
}) {
  const { error } = await supabase.from("notifications").insert({
    company_id: COMPANY_ID,
    user_id: input.userId ?? null,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    is_read: false,
  });
  if (error) throw new Error(error.message);
}

/** Marque une notification comme lue */
export async function markNotificationRead(id: string) {
  await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
}

/** Marque toutes les notifications comme lues */
export async function markAllRead() {
  await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("company_id", COMPANY_ID).eq("is_read", false);
}

/** Nombre de notifications non lues */
export async function unreadCount(): Promise<number> {
  const { count } = await supabase.from("notifications").select("id", { count: "exact" }).eq("company_id", COMPANY_ID).eq("is_read", false);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// NOTIFICATIONS SYSTÈME (Alertes automatiques)
// ---------------------------------------------------------------------------

/** Vérifie et crée des alertes automatiques */
export async function checkAndNotify() {
  const alerts: { type: Notification["type"]; title: string; body: string }[] = [];

  // 1. Échéances fiscales proches
  const today = new Date();
  const in15Days = new Date(today.getTime() + 15 * 86400000).toISOString().slice(0, 10);

  const { data: dsfDue } = await supabase
    .from("dsf_declarations")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("status", "draft")
    .limit(1);

  if (dsfDue && dsfDue.length > 0) {
    alerts.push({ type: "warning", title: "Déclaration fiscale en attente", body: "Une DSF est en mode brouillon et doit être finalisée." });
  }

  // 2. Factures fournisseurs en retard de paiement
  const { data: overdueInvoices } = await supabase
    .from("invoices")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("type", "fournisseur")
    .eq("status", "approved")
    .lt("due_date", today.toISOString().slice(0, 10))
    .limit(1);

  if (overdueInvoices && overdueInvoices.length > 0) {
    alerts.push({ type: "error", title: "Factures fournisseurs en retard", body: "Des factures fournisseurs sont en retard de paiement." });
  }

  // 3. Écritures non équilibrées
  const { data: unbalanced } = await supabase
    .from("entries")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("status", "draft")
    .limit(1);

  if (unbalanced && unbalanced.length > 0) {
    alerts.push({ type: "warning", title: "Écritures en brouillon", body: "Des écritures sont encore en mode brouillon." });
  }

  // Envoie les alertes
  for (const alert of alerts) {
    await sendNotification({ type: alert.type, title: alert.title, body: alert.body });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// WEBHOOKS — Envoi d'événements à des URL externes
// ---------------------------------------------------------------------------

/** Déclenche les webhooks pour un événement donné */
export async function triggerWebhooks(event: string, payload: Record<string, unknown>) {
  const { data: hooks } = await supabase
    .from("webhooks")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("active", true)
    .contains("events", [event]);

  for (const hook of hooks ?? []) {
    try {
      const response = await fetch(hook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": hook.secret ?? "",
          "X-Event": event,
        },
        body: JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
      });

      // Log
      await supabase.from("webhook_logs").insert({
        webhook_id: hook.id,
        event,
        payload,
        response_status: response.status,
        response_body: await response.text(),
        success: response.ok,
        duration_ms: 0,
      });

      // Mise à jour last_triggered
      await supabase.from("webhooks").update({ last_triggered_at: new Date().toISOString() }).eq("id", hook.id);
    } catch (e) {
      await supabase.from("webhooks").update({ last_error: (e as Error).message }).eq("id", hook.id);
    }
  }
}