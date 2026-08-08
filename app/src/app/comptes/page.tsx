"use client";

import { useEffect, useState } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import { createCashAccount, fetchCashAccounts, type CashBankAccount } from "@/lib/cashAccounts";
import { fetchFees, recordFee, type MobileMoneyFee } from "@/lib/mobileMoneyFees";
import { createCashVoucher, fetchCashVouchers, type CashVoucher } from "@/lib/cashVouchers";

type Account = { code: string; label: string };

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ComptesPage() {
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [type, setType] = useState<"banque" | "caisse">("banque");
  const [label, setLabel] = useState("");
  const [currency, setCurrency] = useState("XOF");
  const [accountCode, setAccountCode] = useState("521");
  const [accountNumber, setAccountNumber] = useState("");
  const [provider, setProvider] = useState("banque_classique");
  const [settlementDelay, setSettlementDelay] = useState("0");

  const [feeAccountId, setFeeAccountId] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [feeDate, setFeeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fees, setFees] = useState<MobileMoneyFee[]>([]);
  const [msg, setMsg] = useState("");

  const [vouchers, setVouchers] = useState<CashVoucher[]>([]);
  const [voucherAccountId, setVoucherAccountId] = useState("");
  const [voucherType, setVoucherType] = useState<"entree" | "sortie">("sortie");
  const [voucherDate, setVoucherDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [voucherAmount, setVoucherAmount] = useState("");
  const [voucherMotif, setVoucherMotif] = useState("");
  const [voucherBeneficiary, setVoucherBeneficiary] = useState("");
  const [voucherCounterpartCode, setVoucherCounterpartCode] = useState("");
  const [voucherMsg, setVoucherMsg] = useState("");
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [chartAccounts, setChartAccounts] = useState<Account[]>([]);

  const load = async () => {
    setAccounts(await fetchCashAccounts());
    setVouchers(await fetchCashVouchers());
  };

  useEffect(() => {
    load();
    supabase
      .from("chart_of_accounts")
      .select("code, label")
      .eq("company_id", COMPANY_ID)
      .order("code")
      .then(({ data }) => setChartAccounts(data ?? []));
  }, []);

  const mobileMoneyAccounts = accounts.filter((a) => a.provider === "wave" || a.provider === "orange_money");

  const loadFees = async (cashBankAccountId: string) => {
    setFeeAccountId(cashBankAccountId);
    setFees(await fetchFees(cashBankAccountId));
  };

  const handleRecordFee = async (e: React.FormEvent) => {
    e.preventDefault();
    const account = accounts.find((a) => a.id === feeAccountId);
    if (!account || !feeAmount) return;
    setMsg("");
    try {
      await recordFee({
        cashBankAccountId: account.id,
        accountCode: account.account_code,
        label: account.label,
        feeAmount: parseFloat(feeAmount),
        feeDate,
      });
      setMsg("Frais enregistré, écriture générée.");
      setFeeAmount("");
      setFees(await fetchFees(account.id));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    const account = accounts.find((a) => a.id === voucherAccountId);
    if (!account || !voucherAmount || !voucherCounterpartCode) return;
    setVoucherBusy(true);
    setVoucherMsg("");
    try {
      const { needsReview } = await createCashVoucher({
        cashAccountCode: account.account_code,
        cashBankAccountId: account.id,
        type: voucherType,
        amount: parseFloat(voucherAmount),
        motif: voucherMotif,
        beneficiary: voucherBeneficiary,
        accountCode: voucherCounterpartCode,
        voucherDate,
      });
      setVoucherMsg(
        needsReview
          ? "Bon de caisse enregistré : montant au-dessus du plafond, envoyé dans la file d'exceptions."
          : "Bon de caisse enregistré, écriture générée automatiquement."
      );
      setVoucherAmount("");
      setVoucherMotif("");
      setVoucherBeneficiary("");
      setVoucherCounterpartCode("");
      await load();
    } catch (err) {
      setVoucherMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setVoucherBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label || !accountCode) return;
    await createCashAccount({
      type,
      label,
      currency,
      accountCode,
      accountNumber,
      provider,
      settlementDelayDays: parseInt(settlementDelay, 10) || 0,
    });
    setLabel("");
    setAccountNumber("");
    await load();
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Comptes bancaires &amp; caisses</h1>

      <section className="space-y-3">
        <h2 className="font-medium">Nouveau compte</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Type
            <select className="border rounded px-2 py-1" value={type} onChange={(e) => setType(e.target.value as "banque" | "caisse")}>
              <option value="banque">Banque</option>
              <option value="caisse">Caisse</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Libellé
            <input type="text" className="border rounded px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Banque FCFA principale" required />
          </label>
          <label className="flex flex-col gap-1">
            Devise
            <input type="text" className="border rounded px-2 py-1 uppercase" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </label>
          <label className="flex flex-col gap-1">
            Compte SYSCOHADA lié
            <select className="border rounded px-2 py-1" value={accountCode} onChange={(e) => setAccountCode(e.target.value)} required>
              <option value="521">521 — Banques</option>
              <option value="571">571 — Caisse</option>
            </select>
            <span className="text-xs" style={{ color: "var(--muted)" }}>521 pour un compte bancaire, 571 pour une caisse physique</span>
          </label>
          <label className="flex flex-col gap-1">
            N° de compte
            <input type="text" className="border rounded px-2 py-1" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Fournisseur
            <select className="border rounded px-2 py-1" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="banque_classique">Banque classique</option>
              <option value="wave">Wave</option>
              <option value="orange_money">Orange Money</option>
              <option value="autre">Autre</option>
            </select>
          </label>
          {provider !== "banque_classique" && (
            <label className="flex flex-col gap-1">
              Délai de règlement (jours)
              <input type="number" className="border rounded px-2 py-1" value={settlementDelay} onChange={(e) => setSettlementDelay(e.target.value)} />
            </label>
          )}
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm w-fit self-end">
            Enregistrer
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Comptes existants</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Libellé</th>
              <th>Type</th>
              <th>Devise</th>
              <th>Compte</th>
              <th>Fournisseur</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b">
                <td className="py-1">{a.label}</td>
                <td>{a.type}</td>
                <td>{a.currency}</td>
                <td>{a.account_code}</td>
                <td>{a.provider ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      {accounts.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">Bon de caisse</h2>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Sous le plafond configuré (par défaut 50 000 F), l&apos;écriture est générée automatiquement.
            Au-dessus, le bon reste enregistré mais remonte dans <code>/exceptions</code> pour vérification.
          </p>
          <form onSubmit={handleCreateVoucher} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              Compte caisse/banque
              <select
                className="border rounded px-2 py-1"
                value={voucherAccountId}
                onChange={(e) => setVoucherAccountId(e.target.value)}
                required
              >
                <option value="">—</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} ({a.account_code})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Type
              <select
                className="border rounded px-2 py-1"
                value={voucherType}
                onChange={(e) => setVoucherType(e.target.value as "entree" | "sortie")}
              >
                <option value="sortie">Sortie (dépense)</option>
                <option value="entree">Entrée (recette)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Date
              <input type="date" className="border rounded px-2 py-1" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1">
              Montant
              <input type="number" step="0.01" className="border rounded px-2 py-1" value={voucherAmount} onChange={(e) => setVoucherAmount(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1">
              Motif de la dépense/recette
              <select
                className="border rounded px-2 py-1"
                value={voucherCounterpartCode}
                onChange={(e) => setVoucherCounterpartCode(e.target.value)}
                required
              >
                <option value="">— choisir un compte —</option>
                {chartAccounts
                  .filter((a) => (voucherType === "sortie" ? a.code.startsWith("6") : a.code.startsWith("7")))
                  .map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Bénéficiaire
              <input type="text" className="border rounded px-2 py-1" value={voucherBeneficiary} onChange={(e) => setVoucherBeneficiary(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 col-span-2">
              Motif
              <input type="text" className="border rounded px-2 py-1" value={voucherMotif} onChange={(e) => setVoucherMotif(e.target.value)} />
            </label>
            <button type="submit" disabled={voucherBusy} className="bg-black text-white rounded px-4 py-2 text-sm w-fit self-end disabled:opacity-40">
              {voucherBusy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>
          {voucherMsg && <p className="text-sm text-green-600">{voucherMsg}</p>}

          {vouchers.length > 0 && (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-1">N°</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th className="text-right">Montant</th>
                  <th>Motif</th>
                  <th>Confiance</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.id} className="border-b">
                    <td className="py-1">{v.voucher_number}</td>
                    <td>{v.voucher_date}</td>
                    <td>{v.type}</td>
                    <td className="text-right">{fmt(v.amount)}</td>
                    <td>{v.motif ?? "—"}</td>
                    <td>
                      <span
                        className="app-badge"
                        style={
                          v.needs_review
                            ? { color: "var(--accent-red)", borderColor: "var(--accent-red)" }
                            : { color: "var(--accent-emerald)" }
                        }
                      >
                        {v.needs_review ? "À revoir" : "OK"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </section>
      )}

      {mobileMoneyAccounts.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">Frais Wave / Orange Money</h2>
          <form onSubmit={handleRecordFee} className="flex flex-wrap gap-3 items-end text-sm">
            <label className="flex flex-col gap-1">
              Compte
              <select className="border rounded px-2 py-1" value={feeAccountId} onChange={(e) => loadFees(e.target.value)} required>
                <option value="">—</option>
                {mobileMoneyAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Date
              <input type="date" className="border rounded px-2 py-1" value={feeDate} onChange={(e) => setFeeDate(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1">
              Montant du frais
              <input type="number" step="0.01" className="border rounded px-2 py-1" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} required />
            </label>
            <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
              Enregistrer
            </button>
          </form>
          {msg && <p className="text-sm text-green-600">{msg}</p>}
          {fees.length > 0 && (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id} className="border-b">
                    <td className="py-1">{new Date(f.created_at).toLocaleDateString("fr-FR")}</td>
                    <td className="text-right">{fmt(f.fee_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
