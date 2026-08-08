"use client";

import { useEffect, useState } from "react";
import {
  addMember,
  createGroup,
  fetchAllCompanies,
  fetchGroups,
  removeMember,
  type CompanyOption,
  type ConsolidationGroup,
} from "@/lib/consolidation";

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function ConsolidationPage() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [groups, setGroups] = useState<ConsolidationGroup[]>([]);
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [addChoice, setAddChoice] = useState<Record<string, string>>({});

  const load = async () => {
    setCompanies(await fetchAllCompanies());
    setGroups(await fetchGroups());
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupLabel) return;
    await createGroup(newGroupLabel);
    setNewGroupLabel("");
    await load();
  };

  const handleAddMember = async (groupId: string) => {
    const companyId = addChoice[groupId];
    if (!companyId) return;
    await addMember(groupId, companyId);
    await load();
  };

  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? id;
  const groupTotal = (group: ConsolidationGroup) =>
    group.memberIds.reduce((s, id) => s + (companies.find((c) => c.id === id)?.annual_revenue_estimate ?? 0), 0);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Consolidation multi-entités</h1>
      <p className="text-sm text-zinc-500">
        Vue simple (addition des chiffres d&apos;affaires estimés des entreprises membres, saisis dans{" "}
        <code>/parametres</code>) — pas de consolidation comptable légale (élimination des opérations intra-groupe,
        etc.), à envisager séparément si les seuils de groupe sont dépassés. Actuellement une seule entreprise
        (Xarala tech) existe dans ce projet.
      </p>

      <section className="space-y-3">
        <h2 className="font-medium">Nouveau groupe</h2>
        <form onSubmit={handleCreateGroup} className="flex gap-3 items-end text-sm">
          <label className="flex flex-col gap-1">
            Libellé
            <input type="text" className="border rounded px-2 py-1" value={newGroupLabel} onChange={(e) => setNewGroupLabel(e.target.value)} placeholder="Mes activités - vue globale" required />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
            Créer
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="font-medium">Groupes</h2>
        {groups.map((g) => (
          <div key={g.id} className="border rounded p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{g.label}</span>
              <span className="text-zinc-500">CA cumulé estimé : {fmt(groupTotal(g))}</span>
            </div>
            <ul className="list-disc pl-5">
              {g.memberIds.map((id) => (
                <li key={id} className="flex items-center gap-2">
                  {companyName(id)}
                  <button className="text-red-600 underline text-xs" onClick={() => removeMember(g.id, id).then(load)}>
                    retirer
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <select
                className="border rounded px-1 py-0.5 text-xs"
                value={addChoice[g.id] ?? ""}
                onChange={(e) => setAddChoice((p) => ({ ...p, [g.id]: e.target.value }))}
              >
                <option value="">— ajouter une entreprise —</option>
                {companies.filter((c) => !g.memberIds.includes(c.id)).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button className="text-blue-600 underline text-xs" onClick={() => handleAddMember(g.id)}>
                Ajouter
              </button>
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="text-sm text-zinc-500">Aucun groupe créé.</p>}
      </section>
    </main>
  );
}
