"use client";

import { useEffect, useState } from "react";
import {
  createEmployee,
  createPayslip,
  fetchEmployees,
  fetchPayrollRates,
  fetchPayslips,
  markPayslipPaid,
  validatePayslip,
  type Employee,
  type Payslip,
  type PayrollRates,
} from "@/lib/payroll";

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const statusLabels: Record<Payslip["status"], string> = {
  draft: "brouillon",
  validated: "validé",
  paid: "payé",
};

export default function PaiePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [socialRegime, setSocialRegime] = useState("IPRES/CSS");

  const [employeeId, setEmployeeId] = useState("");
  const [periodMonth, setPeriodMonth] = useState("");
  const [grossSalary, setGrossSalary] = useState("");
  const [employeeContrib, setEmployeeContrib] = useState("");
  const [employerContrib, setEmployerContrib] = useState("");
  const [taxWithheld, setTaxWithheld] = useState("");
  const [rates, setRates] = useState<PayrollRates | null>(null);

  const load = async () => {
    setEmployees(await fetchEmployees());
    setPayslips(await fetchPayslips());
  };

  useEffect(() => {
    load();
    fetchPayrollRates().then(setRates);
  }, []);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !baseSalary) return;
    await createEmployee({ fullName, position, hireDate, baseSalary: parseFloat(baseSalary), socialRegime });
    setFullName("");
    setPosition("");
    setHireDate("");
    setBaseSalary("");
    await load();
  };

  const selectEmployee = (id: string) => {
    setEmployeeId(id);
    const emp = employees.find((e) => e.id === id);
    if (emp) setGrossSalary(String(emp.base_salary));
  };

  const applyAutoRates = () => {
    const gross = parseFloat(grossSalary) || 0;
    if (!rates || gross <= 0) return;
    if (rates.employeeContributionRate != null) {
      setEmployeeContrib(((gross * rates.employeeContributionRate) / 100).toFixed(2));
    }
    if (rates.employerContributionRate != null) {
      setEmployerContrib(((gross * rates.employerContributionRate) / 100).toFixed(2));
    }
    if (rates.incomeTaxRate != null) {
      setTaxWithheld(((gross * rates.incomeTaxRate) / 100).toFixed(2));
    }
  };

  const hasAnyRate =
    rates && (rates.employeeContributionRate != null || rates.employerContributionRate != null || rates.incomeTaxRate != null);

  const handleCreatePayslip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !periodMonth || !grossSalary) return;
    setMsg("");
    try {
      const { autoValidated } = await createPayslip({
        employeeId,
        periodMonth,
        grossSalary: parseFloat(grossSalary),
        employeeContributions: parseFloat(employeeContrib) || 0,
        employerContributions: parseFloat(employerContrib) || 0,
        incomeTaxWithheld: parseFloat(taxWithheld) || 0,
      });
      setMsg(
        autoValidated
          ? "Bulletin conforme au salaire habituel : validé et écriture générée automatiquement."
          : "Salaire brut différent du salaire de base : bulletin en attente de revue (voir /exceptions)."
      );
      setPeriodMonth("");
      setGrossSalary("");
      setEmployeeContrib("");
      setEmployerContrib("");
      setTaxWithheld("");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleValidate = async (p: Payslip) => {
    setBusy(p.id);
    setMsg("");
    try {
      await validatePayslip(p);
      setMsg("Bulletin validé, écriture générée.");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  const handleMarkPaid = async (p: Payslip) => {
    setBusy(p.id);
    setMsg("");
    try {
      await markPayslipPaid(p);
      setMsg("Salaire marqué payé, écriture générée.");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Paie &amp; personnel</h1>

      <section className="space-y-3">
        <h2 className="font-medium">Nouvel employé</h2>
        <form onSubmit={handleCreateEmployee} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Nom complet
            <input type="text" className="border rounded px-2 py-1" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Poste
            <input type="text" className="border rounded px-2 py-1" value={position} onChange={(e) => setPosition(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Date d&apos;embauche
            <input type="date" className="border rounded px-2 py-1" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Salaire de base
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Régime social
            <input type="text" className="border rounded px-2 py-1" value={socialRegime} onChange={(e) => setSocialRegime(e.target.value)} />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm w-fit self-end">
            Enregistrer
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Nouveau bulletin de paie</h2>
        <p className="text-xs text-zinc-500">
          {hasAnyRate
            ? "Taux forfaitaires configurés dans /parametres — cliquez sur \"Auto-calculer\" puis vérifiez avant d'enregistrer."
            : "Cotisations et retenue à saisir manuellement (aucun taux configuré dans /parametres — montants selon barèmes IPRES/IPM/CSS en vigueur)."}
        </p>
        <form onSubmit={handleCreatePayslip} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Employé
            <select className="border rounded px-2 py-1" value={employeeId} onChange={(e) => selectEmployee(e.target.value)} required>
              <option value="">—</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Mois (période)
            <input type="date" className="border rounded px-2 py-1" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Salaire brut
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={grossSalary} onChange={(e) => setGrossSalary(e.target.value)} required />
          </label>
          {hasAnyRate && (
            <button type="button" onClick={applyAutoRates} className="text-xs text-blue-600 underline w-fit self-end">
              Auto-calculer les cotisations
            </button>
          )}
          <label className="flex flex-col gap-1">
            Cotisations salariales
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={employeeContrib} onChange={(e) => setEmployeeContrib(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Cotisations patronales
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={employerContrib} onChange={(e) => setEmployerContrib(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Retenue à la source
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={taxWithheld} onChange={(e) => setTaxWithheld(e.target.value)} />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm w-fit self-end">
            Créer (brouillon)
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Bulletins</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Employé</th>
              <th>Période</th>
              <th className="text-right">Brut</th>
              <th className="text-right">Net</th>
              <th>Statut</th>
              <th>Confiance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payslips.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="py-1">{p.employees?.full_name ?? "—"}</td>
                <td>{p.period_month}</td>
                <td className="text-right">{fmt(p.gross_salary)}</td>
                <td className="text-right">{fmt(p.net_salary)}</td>
                <td>{statusLabels[p.status]}</td>
                <td>
                  <span
                    className="app-badge"
                    style={
                      p.needs_review
                        ? { color: "var(--accent-red)", borderColor: "var(--accent-red)" }
                        : { color: "var(--accent-emerald)" }
                    }
                  >
                    {p.needs_review ? "À revoir" : "Auto"}
                  </span>
                </td>
                <td>
                  {p.status === "draft" && (
                    <button disabled={busy === p.id} className="text-green-600 underline text-xs" onClick={() => handleValidate(p)}>
                      Valider
                    </button>
                  )}
                  {p.status === "validated" && (
                    <button disabled={busy === p.id} className="text-blue-600 underline text-xs" onClick={() => handleMarkPaid(p)}>
                      Marquer payé
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {msg && <p className="text-sm text-green-600">{msg}</p>}
      </section>
    </main>
  );
}
