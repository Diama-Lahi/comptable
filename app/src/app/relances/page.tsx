"use client";

import { useEffect, useState } from "react";
import {
  buildReminderMessage,
  computeDueReminders,
  createReminderRule,
  fetchReminderRules,
  markReminderSent,
  type DueReminder,
  type ReminderRule,
} from "@/lib/reminders";

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const toneLabels: Record<ReminderRule["tone"], string> = {
  courtois: "courtois",
  ferme: "ferme",
  mise_en_demeure: "mise en demeure",
};

export default function RelancesPage() {
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [due, setDue] = useState<DueReminder[]>([]);
  const [daysOverdue, setDaysOverdue] = useState("7");
  const [tone, setTone] = useState<ReminderRule["tone"]>("courtois");
  const [template, setTemplate] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    setRules(await fetchReminderRules());
    setDue(await computeDueReminders());
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!daysOverdue) return;
    await createReminderRule({ daysOverdue: parseInt(daysOverdue, 10), tone, template });
    setTemplate("");
    await load();
  };

  const handleMarkSent = async (r: DueReminder, channel: "email" | "sms" | "whatsapp") => {
    setMsg("");
    try {
      await markReminderSent(r.invoiceId, r.rule.id, channel);
      setMsg("Relance marquée envoyée.");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleCopyMessage = async (r: DueReminder) => {
    setMsg("");
    try {
      await navigator.clipboard.writeText(buildReminderMessage(r));
      setMsg("Message copié — colle-le dans ton email, SMS ou WhatsApp.");
    } catch {
      setMsg("Impossible de copier automatiquement — copie le texte manuellement : " + buildReminderMessage(r));
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Relances clients</h1>
      <p className="text-sm text-zinc-500">
        Aucun envoi automatique d&apos;email/SMS/WhatsApp — mais le message est généré et prêt à copier/coller
        (bouton &quot;Copier le message&quot;). Cet écran indique quelles factures nécessitent une relance selon tes
        règles, et garde l&apos;historique de ce qui a été envoyé.
      </p>

      <section className="space-y-3">
        <h2 className="font-medium">Règles de relance</h2>
        <form onSubmit={handleCreateRule} className="flex flex-wrap gap-3 items-end text-sm">
          <label className="flex flex-col gap-1">
            Jours de retard
            <input type="number" className="border rounded px-2 py-1" value={daysOverdue} onChange={(e) => setDaysOverdue(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Ton
            <select className="border rounded px-2 py-1" value={tone} onChange={(e) => setTone(e.target.value as ReminderRule["tone"])}>
              <option value="courtois">Courtois</option>
              <option value="ferme">Ferme</option>
              <option value="mise_en_demeure">Mise en demeure</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1">
            Modèle de message
            <input type="text" className="border rounded px-2 py-1" value={template} onChange={(e) => setTemplate(e.target.value)} />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
            Ajouter
          </button>
        </form>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-1">J+{r.days_overdue}</td>
                <td>{toneLabels[r.tone]}</td>
                <td>{r.template ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Relances à envoyer ({due.length})</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Client</th>
              <th>Facture</th>
              <th>Retard</th>
              <th className="text-right">Montant</th>
              <th>Ton</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {due.map((r) => (
              <tr key={`${r.invoiceId}-${r.rule.id}`} className="border-b">
                <td className="py-1">{r.clientName ?? "—"}</td>
                <td>{r.invoiceNumber ?? "—"}</td>
                <td>{r.daysOverdue} j</td>
                <td className="text-right">{fmt(r.amountRemaining)}</td>
                <td>{toneLabels[r.rule.tone]}</td>
                <td className="flex gap-2 flex-wrap">
                  <button
                    className="text-xs font-medium rounded px-2 py-1"
                    style={{ background: "var(--accent-gold-soft)", color: "var(--accent-gold)" }}
                    onClick={() => handleCopyMessage(r)}
                  >
                    Copier le message
                  </button>
                  <button className="text-blue-600 underline text-xs" onClick={() => handleMarkSent(r, "email")}>
                    Envoyée (email)
                  </button>
                  <button className="text-blue-600 underline text-xs" onClick={() => handleMarkSent(r, "whatsapp")}>
                    Envoyée (WhatsApp)
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {due.length === 0 && <p className="text-sm text-zinc-500">Rien à relancer.</p>}
        {msg && <p className="text-sm text-green-600">{msg}</p>}
      </section>
    </main>
  );
}
