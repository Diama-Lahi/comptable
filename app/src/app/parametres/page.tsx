"use client";

import { useEffect, useState } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import { getAutomationSettings, saveAutomationSettings, type AutomationSettings } from "@/lib/imputation";

type TaxRegime = "reel_normal" | "reel_simplifie" | "cgu";

const regimeLabels: Record<TaxRegime, string> = {
  reel_normal: "Réel normal (TVA classique 18 %)",
  reel_simplifie: "Réel simplifié",
  cgu: "Contribution Globale Unique (CGU) — pas de TVA à déclarer",
};

export default function ParametresPage() {
  const [name, setName] = useState("");
  const [taxRegime, setTaxRegime] = useState<TaxRegime>("reel_normal");
  const [annualRevenueEstimate, setAnnualRevenueEstimate] = useState("");
  const [employeeCountEstimate, setEmployeeCountEstimate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [confidenceThreshold, setConfidenceThreshold] = useState("0.85");
  const [minRuleUsesForTrust, setMinRuleUsesForTrust] = useState("3");
  const [cashVoucherAutoLimit, setCashVoucherAutoLimit] = useState("50000");
  const [automationSaving, setAutomationSaving] = useState(false);
  const [automationSaved, setAutomationSaved] = useState(false);

  const [employeeContribRate, setEmployeeContribRate] = useState("");
  const [employerContribRate, setEmployerContribRate] = useState("");
  const [incomeTaxRate, setIncomeTaxRate] = useState("");
  const [payrollSaving, setPayrollSaving] = useState(false);
  const [payrollSaved, setPayrollSaved] = useState(false);

  useEffect(() => {
    supabase
      .from("companies")
      .select(
        "name, tax_regime, annual_revenue_estimate, employee_count_estimate, employee_contribution_rate, employer_contribution_rate, income_tax_rate"
      )
      .eq("id", COMPANY_ID)
      .single()
      .then(({ data }) => {
        if (data) {
          setName(data.name);
          setTaxRegime(data.tax_regime as TaxRegime);
          setAnnualRevenueEstimate(data.annual_revenue_estimate ? String(data.annual_revenue_estimate) : "");
          setEmployeeCountEstimate(data.employee_count_estimate ? String(data.employee_count_estimate) : "");
          setEmployeeContribRate(data.employee_contribution_rate ? String(data.employee_contribution_rate) : "");
          setEmployerContribRate(data.employer_contribution_rate ? String(data.employer_contribution_rate) : "");
          setIncomeTaxRate(data.income_tax_rate ? String(data.income_tax_rate) : "");
        }
        setLoading(false);
      });

    getAutomationSettings().then((s) => {
      setConfidenceThreshold(String(s.confidenceThreshold));
      setMinRuleUsesForTrust(String(s.minRuleUsesForTrust));
      setCashVoucherAutoLimit(String(s.cashVoucherAutoLimit));
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await supabase
      .from("companies")
      .update({
        tax_regime: taxRegime,
        annual_revenue_estimate: annualRevenueEstimate ? parseFloat(annualRevenueEstimate) : null,
        employee_count_estimate: employeeCountEstimate ? parseInt(employeeCountEstimate, 10) : null,
      })
      .eq("id", COMPANY_ID);
    setSaving(false);
    setSaved(true);
  };

  const handleSaveAutomation = async () => {
    setAutomationSaving(true);
    setAutomationSaved(false);
    const settings: AutomationSettings = {
      confidenceThreshold: Math.min(1, Math.max(0, parseFloat(confidenceThreshold) || 0.85)),
      minRuleUsesForTrust: Math.max(1, parseInt(minRuleUsesForTrust, 10) || 3),
      cashVoucherAutoLimit: Math.max(0, parseFloat(cashVoucherAutoLimit) || 0),
    };
    await saveAutomationSettings(settings);
    setConfidenceThreshold(String(settings.confidenceThreshold));
    setMinRuleUsesForTrust(String(settings.minRuleUsesForTrust));
    setCashVoucherAutoLimit(String(settings.cashVoucherAutoLimit));
    setAutomationSaving(false);
    setAutomationSaved(true);
  };

  const handleSavePayrollRates = async () => {
    setPayrollSaving(true);
    setPayrollSaved(false);
    await supabase
      .from("companies")
      .update({
        employee_contribution_rate: employeeContribRate ? parseFloat(employeeContribRate) : null,
        employer_contribution_rate: employerContribRate ? parseFloat(employerContribRate) : null,
        income_tax_rate: incomeTaxRate ? parseFloat(incomeTaxRate) : null,
      })
      .eq("id", COMPANY_ID);
    setPayrollSaving(false);
    setPayrollSaved(true);
  };

  if (loading) return <main className="mx-auto max-w-2xl p-6 text-sm text-zinc-500">Chargement…</main>;

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <h1 className="text-xl font-semibold">Paramètres de l&apos;entreprise</h1>

      <div className="space-y-4 text-sm">
        <div>
          <span className="text-zinc-500">Entreprise</span>
          <p className="font-medium">{name}</p>
        </div>

        <label className="flex flex-col gap-1">
          Régime fiscal
          <select
            className="border rounded px-2 py-1"
            value={taxRegime}
            onChange={(e) => setTaxRegime(e.target.value as TaxRegime)}
          >
            {(Object.keys(regimeLabels) as TaxRegime[]).map((r) => (
              <option key={r} value={r}>
                {regimeLabels[r]}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-zinc-500">
          En régime CGU, la page Clôture &amp; TVA n&apos;affichera pas de déclaration de TVA (impôt forfaitaire à la
          place).
        </p>

        <label className="flex flex-col gap-1">
          Chiffre d&apos;affaires annuel estimé (indicatif)
          <input
            type="number"
            step="0.01"
            className="border rounded px-2 py-1"
            value={annualRevenueEstimate}
            onChange={(e) => setAnnualRevenueEstimate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          Effectif estimé (indicatif)
          <input
            type="number"
            className="border rounded px-2 py-1"
            value={employeeCountEstimate}
            onChange={(e) => setEmployeeCountEstimate(e.target.value)}
          />
        </label>
        <p className="text-xs text-zinc-500">
          Utilisés uniquement pour l&apos;indicateur de seuil d&apos;audit légal sur le tableau de bord — à vérifier
          auprès d&apos;un professionnel, les seuils OHADA évoluent.
        </p>

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
        {saved && <p className="text-green-600 text-sm">Enregistré.</p>}
      </div>

      <div className="app-card px-6 py-6 space-y-4">
        <div className="space-y-1">
          <span className="app-badge">Moteur de confiance</span>
          <h2 className="font-medium">Automatisation &amp; file d&apos;exceptions</h2>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Règle ce qui passe automatiquement en comptabilité vs ce qui remonte dans{" "}
            <code>/exceptions</code>. Voir <code>docs/architecture-automatisation-maximale.md</code>.
          </p>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Seuil de confiance des factures (0 à 1)
          <input
            type="number"
            step="0.01"
            min={0}
            max={1}
            className="border rounded px-2 py-1"
            value={confidenceThreshold}
            onChange={(e) => setConfidenceThreshold(e.target.value)}
          />
        </label>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          En dessous de ce score, une facture imputée automatiquement part quand même dans la file d&apos;exceptions.
          0,85 par défaut.
        </p>

        <label className="flex flex-col gap-1 text-sm">
          Utilisations avant de faire confiance à une règle d&apos;imputation
          <input
            type="number"
            step="1"
            min={1}
            className="border rounded px-2 py-1"
            value={minRuleUsesForTrust}
            onChange={(e) => setMinRuleUsesForTrust(e.target.value)}
          />
        </label>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Nombre de fois qu&apos;un tiers doit avoir été imputé sur le même compte pour que la règle soit considérée
          stable. 3 par défaut.
        </p>

        <label className="flex flex-col gap-1 text-sm">
          Plafond d&apos;auto-validation des bons de caisse (F CFA)
          <input
            type="number"
            step="1"
            min={0}
            className="border rounded px-2 py-1"
            value={cashVoucherAutoLimit}
            onChange={(e) => setCashVoucherAutoLimit(e.target.value)}
          />
        </label>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Au-dessus de ce montant, un bon de caisse reste enregistré mais remonte dans la file d&apos;exceptions.
          50 000 F par défaut.
        </p>

        <button
          onClick={handleSaveAutomation}
          disabled={automationSaving}
          className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
        >
          {automationSaving ? "Enregistrement..." : "Enregistrer"}
        </button>
        {automationSaved && <p className="text-green-600 text-sm">Enregistré.</p>}
      </div>

      <div className="app-card px-6 py-6 space-y-4">
        <div className="space-y-1">
          <h2 className="font-medium">Taux de paie (calcul automatique)</h2>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Taux forfaitaires appliqués au salaire brut pour pré-remplir les cotisations sur <code>/paie</code> —
            approximation simple, pas un calcul des barèmes progressifs réels IPRES/IPM/CSS.{" "}
            <strong>À vérifier auprès d&apos;un professionnel</strong> avant tout usage en paie réelle. Laissez vide
            pour continuer à saisir les montants à la main.
          </p>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Cotisations salariales (% du brut)
          <input
            type="number"
            step="0.01"
            className="border rounded px-2 py-1"
            value={employeeContribRate}
            onChange={(e) => setEmployeeContribRate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Cotisations patronales (% du brut)
          <input
            type="number"
            step="0.01"
            className="border rounded px-2 py-1"
            value={employerContribRate}
            onChange={(e) => setEmployerContribRate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Retenue à la source (% du brut)
          <input
            type="number"
            step="0.01"
            className="border rounded px-2 py-1"
            value={incomeTaxRate}
            onChange={(e) => setIncomeTaxRate(e.target.value)}
          />
        </label>

        <button
          onClick={handleSavePayrollRates}
          disabled={payrollSaving}
          className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
        >
          {payrollSaving ? "Enregistrement..." : "Enregistrer"}
        </button>
        {payrollSaved && <p className="text-green-600 text-sm">Enregistré.</p>}
      </div>
    </main>
  );
}
