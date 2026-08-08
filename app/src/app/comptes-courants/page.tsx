"use client";

import { useEffect, useState } from "react";
import {
  createMovement,
  createPartner,
  fetchMovements,
  fetchPartnerBalance,
  fetchPartners,
  type Partner,
  type PartnerMovement,
} from "@/lib/partners";

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ComptesCourantsPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [movements, setMovements] = useState<PartnerMovement[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [newPartnerName, setNewPartnerName] = useState("");

  const [partnerId, setPartnerId] = useState("");
  const [movementDate, setMovementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<"apport" | "retrait" | "interet">("apport");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const p = await fetchPartners();
    setPartners(p);
    setMovements(await fetchMovements());
    const entries = await Promise.all(p.map(async (x) => [x.id, await fetchPartnerBalance(x.id)] as const));
    setBalances(Object.fromEntries(entries));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartnerName) return;
    await createPartner(newPartnerName);
    setNewPartnerName("");
    await load();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerId || !amount) return;
    const partner = partners.find((p) => p.id === partnerId);
    if (!partner) return;
    setMsg("");
    try {
      await createMovement({ partnerId, partnerName: partner.name, movementDate, type, amount: parseFloat(amount) });
      setMsg("Mouvement enregistré, écriture générée.");
      setAmount("");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Comptes courants associés</h1>

      <section className="space-y-3">
        <h2 className="font-medium">Nouvel associé</h2>
        <form onSubmit={handleCreatePartner} className="flex gap-3 items-end text-sm">
          <label className="flex flex-col gap-1">
            Nom
            <input type="text" className="border rounded px-2 py-1" value={newPartnerName} onChange={(e) => setNewPartnerName(e.target.value)} required />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
            Ajouter
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Soldes</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Associé</th>
              <th className="text-right">Solde (la société lui doit si positif)</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="py-1">{p.name}</td>
                <td className="text-right">{fmt(balances[p.id] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Nouveau mouvement</h2>
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end text-sm">
          <label className="flex flex-col gap-1">
            Associé
            <select className="border rounded px-2 py-1" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} required>
              <option value="">—</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Type
            <select className="border rounded px-2 py-1" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="apport">Apport</option>
              <option value="retrait">Retrait</option>
              <option value="interet">Intérêt</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Date
            <input type="date" className="border rounded px-2 py-1" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Montant
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
            Enregistrer
          </button>
        </form>
        {msg && <p className="text-sm text-green-600">{msg}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Historique</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Associé</th>
              <th>Date</th>
              <th>Type</th>
              <th className="text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id} className="border-b">
                <td className="py-1">{m.partners?.name ?? "—"}</td>
                <td>{m.movement_date}</td>
                <td>{m.type}</td>
                <td className="text-right">{fmt(m.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </main>
  );
}
