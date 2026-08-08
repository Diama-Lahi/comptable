"use client";

import { useEffect, useState } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import {
  computeInvoiceConfidence,
  createEntryFromInvoice,
  getAutomationSettings,
  getRuleTimesUsed,
  recordImputation,
  suggestAccountCode,
} from "@/lib/imputation";
import { getRateForDate } from "@/lib/currency";
import { cancelByAvoir, nextLegalNumber } from "@/lib/legalInvoicing";

type InvoiceType = "client" | "fournisseur";

type Account = { code: string; label: string };

type InvoiceRow = {
  id: string;
  type: InvoiceType;
  invoice_number: string | null;
  legal_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount_ht: number | null;
  tva_rate: number | null;
  tva_amount: number | null;
  amount_ttc: number | null;
  status: string;
  file_url: string | null;
  third_party_id: string | null;
  is_cancelled: boolean;
  needs_review: boolean | null;
  confidence_score: number | null;
  third_parties: { name: string } | null;
};

// Best-effort extraction from raw OCR text — the user reviews/corrects before saving.
function extractGuesses(text: string) {
  const dateMatch = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  const invoiceDate = dateMatch
    ? `${dateMatch[3].length === 2 ? "20" + dateMatch[3] : dateMatch[3]}-${dateMatch[2].padStart(
        2,
        "0"
      )}-${dateMatch[1].padStart(2, "0")}`
    : "";

  const amounts = [...text.matchAll(/\b(\d{1,3}(?:[ .]\d{3})*(?:,\d{2})?)\s*(?:F ?CFA|FCFA|XOF)?\b/gi)]
    .map((m) => m[1].replace(/[ .]/g, "").replace(",", "."))
    .map((v) => parseFloat(v))
    .filter((n) => !isNaN(n) && n > 0);

  const amountTtc = amounts.length ? Math.max(...amounts) : undefined;

  return { invoiceDate, amountTtc };
}

type FilterPeriod = "jour" | "semaine" | "mois" | "annee" | "tous";

/** Plage [from, to] (inclus) correspondant à la période choisie, ancrée sur refDate. */
function periodRange(period: FilterPeriod, refDate: string): { from: string; to: string } | null {
  if (period === "tous" || !refDate) return null;
  const d = new Date(`${refDate}T00:00:00`);
  const iso = (x: Date) => x.toISOString().slice(0, 10);

  if (period === "jour") return { from: refDate, to: refDate };

  if (period === "semaine") {
    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: iso(monday), to: iso(sunday) };
  }

  if (period === "mois") {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: iso(first), to: iso(last) };
  }

  // annee
  return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
}

type ClientOption = { id: string; name: string };

export default function FacturesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [ocrRunning, setOcrRunning] = useState(false);

  const [type, setType] = useState<InvoiceType>("fournisseur");
  const [thirdPartyName, setThirdPartyName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amountTtc, setAmountTtc] = useState("");
  const [tvaRate, setTvaRate] = useState("18");
  const [currency, setCurrency] = useState("XOF");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [accountCode, setAccountCode] = useState("");
  const [suggested, setSuggested] = useState(false);

  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastImputed, setLastImputed] = useState(false);
  const [lastNeedsReview, setLastNeedsReview] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("tous");
  const [filterRefDate, setFilterRefDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filterClientId, setFilterClientId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAmountMin, setFilterAmountMin] = useState("");
  const [filterAmountMax, setFilterAmountMax] = useState("");

  const hasActiveFilter =
    filterPeriod !== "tous" || !!filterClientId || !!filterStatus || !!filterAmountMin || !!filterAmountMax;

  const loadInvoices = () => {
    let query = supabase
      .from("invoices")
      .select(
        "id, type, invoice_number, legal_number, invoice_date, due_date, amount_ht, tva_rate, tva_amount, amount_ttc, status, file_url, third_party_id, is_cancelled, needs_review, confidence_score, third_parties(name)"
      )
      .eq("company_id", COMPANY_ID);

    const range = periodRange(filterPeriod, filterRefDate);
    if (range) query = query.gte("invoice_date", range.from).lte("invoice_date", range.to);
    if (filterClientId) query = query.eq("third_party_id", filterClientId);
    if (filterStatus) query = query.eq("status", filterStatus);
    if (filterAmountMin) query = query.gte("amount_ttc", parseFloat(filterAmountMin));
    if (filterAmountMax) query = query.lte("amount_ttc", parseFloat(filterAmountMax));

    query
      .order("invoice_date", { ascending: false })
      .limit(hasActiveFilter ? 500 : 20)
      .then(({ data }) => setInvoices((data as unknown as InvoiceRow[]) ?? []));
  };

  useEffect(loadInvoices, [filterPeriod, filterRefDate, filterClientId, filterStatus, filterAmountMin, filterAmountMax]);

  useEffect(() => {
    supabase
      .from("third_parties")
      .select("id, name")
      .eq("company_id", COMPANY_ID)
      .eq("type", "client")
      .order("name")
      .then(({ data }) => setClients(data ?? []));
  }, []);

  useEffect(() => {
    const accountClass = type === "fournisseur" ? 6 : 7;
    supabase
      .from("chart_of_accounts")
      .select("code, label")
      .eq("company_id", COMPANY_ID)
      .eq("class", accountClass)
      .order("code")
      .then(({ data }) => setAccounts(data ?? []));
  }, [type]);

  const handleCurrencyChange = async (value: string) => {
    setCurrency(value);
    if (value === "XOF") {
      setExchangeRate("1");
      return;
    }
    const rate = await getRateForDate(value, invoiceDate || new Date().toISOString().slice(0, 10));
    if (rate) setExchangeRate(String(rate));
  };

  const handleThirdPartyBlur = async () => {
    setSuggested(false);
    const name = thirdPartyName.trim();
    if (!name) return;

    const { data: existing } = await supabase
      .from("third_parties")
      .select("id")
      .eq("company_id", COMPANY_ID)
      .ilike("name", name)
      .maybeSingle();

    if (existing) {
      const suggestion = await suggestAccountCode(existing.id);
      if (suggestion) {
        setAccountCode(suggestion);
        setSuggested(true);
      }
    }
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setOcrText("");
    setOcrRunning(true);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("fra");
      const { data } = await worker.recognize(f);
      await worker.terminate();
      setOcrText(data.text);
      const guesses = extractGuesses(data.text);
      if (guesses.invoiceDate) setInvoiceDate(guesses.invoiceDate);
      if (guesses.amountTtc) setAmountTtc(String(guesses.amountTtc));
    } catch {
      setOcrText("(OCR indisponible, saisie manuelle requise)");
    } finally {
      setOcrRunning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setStatus("saving");
    setErrorMsg("");

    let path: string | null = null;
    if (file) {
      path = `${COMPANY_ID}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("invoices").upload(path, file);
      if (uploadError) {
        setStatus("error");
        setErrorMsg(uploadError.message);
        return;
      }
    }

    let thirdPartyId: string | null = null;
    let isNewThirdParty = true;
    if (thirdPartyName.trim()) {
      const { data: existing } = await supabase
        .from("third_parties")
        .select("id")
        .eq("company_id", COMPANY_ID)
        .ilike("name", thirdPartyName.trim())
        .maybeSingle();

      if (existing) {
        thirdPartyId = existing.id;
        isNewThirdParty = false;
      } else {
        const { data: created, error: tpError } = await supabase
          .from("third_parties")
          .insert({
            company_id: COMPANY_ID,
            type: type === "client" ? "client" : "fournisseur",
            name: thirdPartyName.trim(),
          })
          .select("id")
          .single();
        if (tpError) {
          setStatus("error");
          setErrorMsg(tpError.message);
          return;
        }
        thirdPartyId = created.id;
      }
    }

    const ttcOriginal = parseFloat(amountTtc) || null;
    const fxRate = currency === "XOF" ? 1 : parseFloat(exchangeRate) || 1;
    const ttc = ttcOriginal ? Math.round(ttcOriginal * fxRate * 100) / 100 : null;
    const rate = parseFloat(tvaRate) || 0;
    const ht = ttc ? Math.round((ttc / (1 + rate / 100)) * 100) / 100 : null;
    const tva = ttc && ht ? Math.round((ttc - ht) * 100) / 100 : null;
    const canImpute = !!accountCode && !!ht && !!ttc && !!invoiceDate;

    // Numérotation légale sans trou, obligatoire pour nos propres factures de vente (client).
    let legalNumber: string | null = null;
    if (type === "client" && invoiceDate) {
      try {
        legalNumber = await nextLegalNumber(new Date(invoiceDate).getFullYear());
      } catch (err) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Échec de numérotation légale");
        return;
      }
    }

    // Moteur de confiance (docs/architecture-automatisation-maximale.md) : seules
    // les factures effectivement imputées automatiquement entrent dans le calcul —
    // une facture non imputée est déjà en attente de saisie manuelle, pas d'exception.
    let confidenceScore = 1;
    let needsReview = false;
    if (canImpute) {
      const [ruleTimesUsed, settings] = await Promise.all([
        thirdPartyId ? getRuleTimesUsed(thirdPartyId, accountCode) : Promise.resolve(0),
        getAutomationSettings(),
      ]);
      confidenceScore = computeInvoiceConfidence({
        isNewThirdParty,
        ruleTimesUsed,
        minRuleUsesForTrust: settings.minRuleUsesForTrust,
        ocrText,
      });
      needsReview = confidenceScore < settings.confidenceThreshold;
    }

    const { data: createdInvoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        company_id: COMPANY_ID,
        type,
        third_party_id: thirdPartyId,
        invoice_number: invoiceNumber || null,
        legal_number: legalNumber,
        invoice_date: invoiceDate || null,
        due_date: dueDate || null,
        amount_ht: ht,
        tva_rate: rate,
        tva_amount: tva,
        amount_ttc: ttc,
        currency,
        exchange_rate: fxRate,
        amount_ttc_original: ttcOriginal,
        status: canImpute ? "imputed" : "received",
        file_url: path,
        ocr_raw: { text: ocrText },
        confidence_score: confidenceScore,
        needs_review: needsReview,
      })
      .select("id")
      .single();

    if (invoiceError || !createdInvoice) {
      setStatus("error");
      setErrorMsg(invoiceError?.message ?? "Erreur inconnue");
      return;
    }

    if (canImpute) {
      try {
        const entryId = await createEntryFromInvoice({
          type,
          entryDate: invoiceDate,
          reference: invoiceNumber || null,
          description: thirdPartyName || null,
          accountCode,
          amountHt: ht!,
          tvaAmount: tva ?? 0,
          amountTtc: ttc!,
        });
        await supabase.from("invoices").update({ entry_id: entryId }).eq("id", createdInvoice.id);
        if (thirdPartyId) await recordImputation(thirdPartyId, accountCode);
      } catch (err) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Échec de l'imputation automatique");
        return;
      }
    }

    setStatus("done");
    setLastImputed(canImpute);
    setLastNeedsReview(needsReview);
    setFile(null);
    setOcrText("");
    setThirdPartyName("");
    setInvoiceNumber("");
    setInvoiceDate("");
    setDueDate("");
    setAmountTtc("");
    setCurrency("XOF");
    setExchangeRate("1");
    setAccountCode("");
    setSuggested(false);
    loadInvoices();
  };

  const openFile = async (path: string) => {
    const { data } = await supabase.storage.from("invoices").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const handleCancelByAvoir = async (inv: InvoiceRow) => {
    setCancelling(inv.id);
    try {
      await cancelByAvoir(inv);
      loadInvoices();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Échec de l'annulation par avoir");
    } finally {
      setCancelling(null);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Factures — création &amp; upload/OCR</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Pour une facture reçue (achat) : joins la photo/PDF, l&apos;OCR pré-remplit les champs à vérifier. Pour
        émettre ta propre facture de vente (client), le fichier est facultatif — remplis directement les champs
        ci-dessous.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="flex flex-col gap-1 text-sm">
          Fichier (photo / PDF) — facultatif pour une facture de vente
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>

        {ocrRunning && <p className="text-sm text-zinc-500">Lecture OCR en cours…</p>}
        {ocrText && !ocrRunning && (
          <details className="text-sm">
            <summary className="cursor-pointer text-zinc-600">Texte détecté (vérifier les champs ci-dessous)</summary>
            <pre className="whitespace-pre-wrap border rounded p-2 mt-1 text-xs max-h-40 overflow-auto">{ocrText}</pre>
          </details>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Type
            <select
              className="border rounded px-2 py-1"
              value={type}
              onChange={(e) => setType(e.target.value as InvoiceType)}
            >
              <option value="fournisseur">Fournisseur (achat)</option>
              <option value="client">Client (vente)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {type === "fournisseur" ? "Fournisseur" : "Client"}
            <input
              type="text"
              className="border rounded px-2 py-1"
              value={thirdPartyName}
              onChange={(e) => setThirdPartyName(e.target.value)}
              onBlur={handleThirdPartyBlur}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            N° facture
            <input
              type="text"
              className="border rounded px-2 py-1"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Date facture
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Date d&apos;échéance
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Utilisée par /previsionnel pour projeter la trésorerie
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Montant TTC (devise ci-dessous)
            <input
              type="number"
              step="0.01"
              className="border rounded px-2 py-1"
              value={amountTtc}
              onChange={(e) => setAmountTtc(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Devise
            <input
              type="text"
              className="border rounded px-2 py-1 uppercase"
              value={currency}
              onChange={(e) => handleCurrencyChange(e.target.value.toUpperCase())}
            />
          </label>

          {currency !== "XOF" && (
            <label className="flex flex-col gap-1 text-sm">
              Taux ({currency} → XOF)
              <input
                type="number"
                step="0.000001"
                className="border rounded px-2 py-1"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
              />
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            Taux TVA (%)
            <input
              type="number"
              step="0.01"
              className="border rounded px-2 py-1"
              value={tvaRate}
              onChange={(e) => setTvaRate(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm col-span-2">
            Compte {type === "fournisseur" ? "de charge" : "de produit"}
            <select
              className="border rounded px-2 py-1"
              value={accountCode}
              onChange={(e) => {
                setAccountCode(e.target.value);
                setSuggested(false);
              }}
            >
              <option value="">— (facture non imputée pour l&apos;instant)</option>
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.label}
                </option>
              ))}
            </select>
            {suggested && (
              <span className="text-xs text-zinc-500">
                Suggestion basée sur l&apos;historique de ce tiers
              </span>
            )}
          </label>
        </div>

        <button
          type="submit"
          disabled={status === "saving"}
          className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
        >
          {status === "saving" ? "Enregistrement..." : "Enregistrer la facture"}
        </button>

        {status === "done" && (
          <p className="text-green-600 text-sm">
            Facture enregistrée{lastImputed ? " et imputée automatiquement (écriture générée)." : "."}
            {lastImputed && lastNeedsReview && " Confiance basse : envoyée dans la file d'exceptions."}
          </p>
        )}
        {status === "error" && <p className="text-red-600 text-sm">Erreur : {errorMsg}</p>}
      </form>

      <section className="space-y-3">
        <h2 className="font-medium">Factures</h2>
        <div className="flex flex-wrap gap-3 items-end text-sm app-panel px-4 py-3">
          <label className="flex flex-col gap-1">
            Période
            <select
              className="border rounded px-2 py-1"
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value as FilterPeriod)}
            >
              <option value="tous">Toutes</option>
              <option value="jour">Jour</option>
              <option value="semaine">Semaine</option>
              <option value="mois">Mois</option>
              <option value="annee">Année</option>
            </select>
          </label>
          {filterPeriod !== "tous" && (
            <label className="flex flex-col gap-1">
              Date de référence
              <input
                type="date"
                className="border rounded px-2 py-1"
                value={filterRefDate}
                onChange={(e) => setFilterRefDate(e.target.value)}
              />
            </label>
          )}
          <label className="flex flex-col gap-1">
            Client
            <select
              className="border rounded px-2 py-1"
              value={filterClientId}
              onChange={(e) => setFilterClientId(e.target.value)}
            >
              <option value="">Tous les clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Statut
            <select
              className="border rounded px-2 py-1"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">Tous</option>
              <option value="received">Reçue</option>
              <option value="verified">Vérifiée</option>
              <option value="imputed">Imputée</option>
              <option value="approved">Approuvée</option>
              <option value="paid">Payée</option>
              <option value="archived">Archivée</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Montant min
            <input
              type="number"
              step="0.01"
              className="border rounded px-2 py-1 w-24"
              value={filterAmountMin}
              onChange={(e) => setFilterAmountMin(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            Montant max
            <input
              type="number"
              step="0.01"
              className="border rounded px-2 py-1 w-24"
              value={filterAmountMax}
              onChange={(e) => setFilterAmountMax(e.target.value)}
            />
          </label>
          {hasActiveFilter && (
            <button
              type="button"
              className="text-xs underline"
              style={{ color: "var(--muted)" }}
              onClick={() => {
                setFilterPeriod("tous");
                setFilterClientId("");
                setFilterStatus("");
                setFilterAmountMin("");
                setFilterAmountMax("");
              }}
            >
              Réinitialiser
            </button>
          )}
          <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>
            {invoices.length} facture(s)
          </span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Type</th>
              <th>Tiers</th>
              <th>N° légal</th>
              <th>Date</th>
              <th>Échéance</th>
              <th>TTC</th>
              <th>Statut</th>
              <th>Confiance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className={`border-b ${inv.is_cancelled ? "opacity-50 line-through" : ""}`}>
                <td className="py-1">{inv.type}</td>
                <td>{inv.third_parties?.name ?? "—"}</td>
                <td>{inv.legal_number ?? inv.invoice_number ?? "—"}</td>
                <td>{inv.invoice_date ?? "—"}</td>
                <td>{inv.due_date ?? "—"}</td>
                <td>{inv.amount_ttc ?? "—"}</td>
                <td>{inv.status}</td>
                <td>
                  {inv.confidence_score != null ? (
                    <span
                      className="app-badge"
                      style={
                        inv.needs_review
                          ? { color: "var(--accent-red)", borderColor: "var(--accent-red)" }
                          : { color: "var(--accent-emerald)" }
                      }
                    >
                      {inv.needs_review ? "À revoir" : "OK"} · {Math.round(inv.confidence_score * 100)}%
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="flex gap-2">
                  {inv.file_url && (
                    <button className="text-blue-600 underline" onClick={() => openFile(inv.file_url!)}>
                      Voir
                    </button>
                  )}
                  {inv.type === "client" && !inv.is_cancelled && !inv.invoice_number?.startsWith("AVOIR-") && (
                    <button
                      disabled={cancelling === inv.id}
                      className="text-red-600 underline"
                      onClick={() => handleCancelByAvoir(inv)}
                    >
                      Annuler par avoir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </main>
  );
}
