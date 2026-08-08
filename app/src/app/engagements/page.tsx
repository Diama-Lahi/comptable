"use client";

import { useEffect, useState } from "react";
import { closeCommitment, createCommitment, fetchCommitments, type Commitment, type CommitmentType } from "@/lib/commitments";

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const typeLabels: Record<CommitmentType, string> = {
  caution_donnee: "Caution donnée",
  caution_recue: "Caution reçue",
  garantie_bancaire: "Garantie bancaire",
  credit_bail: "Crédit-bail",
  litige: "Litige",
  autre: "Autre",
};

export default function EngagementsPage() {
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [type, setType] = useState<CommitmentType>("caution_donnee");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const load = async () => setCommitments(await fetchCommitments());

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description) return;
    await createCommitment({
      type,
      description,
      amount: amount ? parseFloat(amount) : null,
      startDate,
      endDate,
    });
    setDescription("");
    setAmount("");
    setStartDate("");
    setEndDate("");
    await load();
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Engagements hors bilan</h1>
      <p className="text-sm text-zinc-500">
        Registre manuel (cautions, garanties, crédit-bail, litiges) — impossible à déduire automatiquement des
        écritures. À passer en revue systématiquement lors de la préparation des annexes de clôture.
      </p>

      <section className="space-y-3">
        <h2 className="font-medium">Nouvel engagement</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Type
            <select className="border rounded px-2 py-1" value={type} onChange={(e) => setType(e.target.value as CommitmentType)}>
              {(Object.keys(typeLabels) as CommitmentType[]).map((t) => (
                <option key={t} value={t}>
                  {typeLabels[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 col-span-2">
            Description
            <input type="text" className="border rounded px-2 py-1" value={description} onChange={(e) => setDescription(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Montant
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Début
            <input type="date" className="border rounded px-2 py-1" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Fin
            <input type="date" className="border rounded px-2 py-1" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm w-fit self-end">
            Enregistrer
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Engagements</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Type</th>
              <th>Description</th>
              <th className="text-right">Montant</th>
              <th>Période</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {commitments.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="py-1">{typeLabels[c.type]}</td>
                <td>{c.description}</td>
                <td className="text-right">{c.amount ? fmt(c.amount) : "—"}</td>
                <td>
                  {c.start_date ?? "—"} → {c.end_date ?? "—"}
                </td>
                <td>{c.status === "active" ? "actif" : "clos"}</td>
                <td>
                  {c.status === "active" && (
                    <button className="text-red-600 underline text-xs" onClick={() => closeCommitment(c.id).then(load)}>
                      Clôturer
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
