"use client";

import { useState, useRef } from "react";
import { importBalanceFromExcel, importSageCSV, checkBalanceEquilibrium } from "@/lib/migration";

export default function MigrationPage() {
  const [file, setFile] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    entriesImported: number;
    accountsCreated: number;
    thirdPartiesCreated: number;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExcelImport() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await importBalanceFromExcel(file);
      setResult(r);
    } catch (e) {
      setResult({ success: false, entriesImported: 0, accountsCreated: 0, thirdPartiesCreated: 0, errors: [(e as Error).message], warnings: [] });
    }
    setLoading(false);
  }

  async function handleCSVImport() {
    if (!csvContent.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await importSageCSV(csvContent);
      setResult(r);
    } catch (e) {
      setResult({ success: false, entriesImported: 0, accountsCreated: 0, thirdPartiesCreated: 0, errors: [(e as Error).message], warnings: [] });
    }
    setLoading(false);
  }

  function downloadTemplate() {
    const headers = "compte;libelle;debit;credit;tiers\n";
    const sample = "101;Capital;0;10000000;\n411;Clients;5000000;0;\n401;Fournisseurs;0;3000000;\n601;Achats de marchandises;2000000;0;\n701;Ventes de marchandises;0;8000000;\n";
    const blob = new Blob([headers + sample], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template_import_comptable.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">Migration — Import Sage/EBP</h1>
          <p className="app-page-desc">Importez vos données depuis Sage, EBP, Ciel ou tout autre logiciel</p>
        </div>
      </div>

      {/* Processus en 5 étapes */}
      <div className="app-card mb-6">
        <h3 className="font-semibold mb-3">Processus de migration en 5 étapes</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
          {[
            { step: "1", label: "Audit", desc: "Analyse de votre balance" },
            { step: "2", label: "Mapping", desc: "Conversion du plan comptable" },
            { step: "3", label: "Import", desc: "Chargement des données" },
            { step: "4", label: "Contrôle", desc: "Vérification d'équilibre" },
            { step: "5", label: "Basculement", desc: "Mise en production" },
          ].map((s) => (
            <div key={s.step} className="text-center p-3 rounded" style={{ background: "var(--bg-elevated)" }}>
              <div className="text-lg font-bold" style={{ color: "var(--accent-gold)" }}>{s.step}</div>
              <p className="font-medium">{s.label}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Import Excel */}
        <div className="app-card">
          <h3 className="font-semibold mb-3">📊 Import depuis Excel</h3>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Formats supportés : Sage, EBP, Ciel. Colonnes attendues : compte, libelle, debit, credit, (tiers optionnel)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="app-input w-full mb-3"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button className="app-btn-primary w-full" onClick={handleExcelImport} disabled={!file || loading}>
            {loading ? "Import en cours..." : "Importer le fichier Excel"}
          </button>
        </div>

        {/* Import CSV */}
        <div className="app-card">
          <h3 className="font-semibold mb-3">📄 Import depuis CSV</h3>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Format : compte;libellé;débit;crédit (point-virgule, valeurs décimales avec point)
          </p>
          <div className="flex gap-2 mb-3">
            <button className="app-btn-secondary text-xs" onClick={downloadTemplate}>Télécharger le template</button>
          </div>
          <textarea
            className="app-input w-full mb-3 font-mono"
            rows={6}
            placeholder="101;Capital;0;10000000;&#10;411;Clients;5000000;0;&#10;401;Fournisseurs;0;3000000;"
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
          />
          <button className="app-btn-primary w-full" onClick={handleCSVImport} disabled={!csvContent.trim() || loading}>
            {loading ? "Import en cours..." : "Importer le CSV"}
          </button>
        </div>
      </div>

      {/* Résultat */}
      {result && (
        <div className={`app-card ${result.success ? "" : "border-red-400"}`}>
          <h3 className="font-semibold mb-3">Résultat de l'import</h3>

          {result.success ? (
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 rounded" style={{ background: "#10b98120" }}>
                <p className="text-2xl font-bold" style={{ color: "#10b981" }}>{result.entriesImported}</p>
                <p className="text-xs">Écritures importées</p>
              </div>
              <div className="text-center p-3 rounded" style={{ background: "#3b82f620" }}>
                <p className="text-2xl font-bold" style={{ color: "#3b82f6" }}>{result.accountsCreated}</p>
                <p className="text-xs">Comptes créés</p>
              </div>
              <div className="text-center p-3 rounded" style={{ background: "#8b5cf620" }}>
                <p className="text-2xl font-bold" style={{ color: "#8b5cf6" }}>{result.thirdPartiesCreated}</p>
                <p className="text-xs">Tiers créés</p>
              </div>
            </div>
          ) : null}

          {/* Erreurs */}
          {result.errors.length > 0 && (
            <div className="mb-3">
              <h4 className="font-medium text-red-500 mb-2">❌ Erreurs</h4>
              <ul className="space-y-1">
                {result.errors.map((err, i) => (
                  <li key={i} className="text-sm p-2 rounded" style={{ background: "#ef444420" }}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Avertissements */}
          {result.warnings.length > 0 && (
            <div>
              <h4 className="font-medium text-amber-500 mb-2">⚠️ Avertissements</h4>
              <ul className="space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i} className="text-sm p-2 rounded" style={{ background: "#f59e0b20" }}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {result.success && result.errors.length === 0 && (
            <div className="p-3 rounded text-sm font-medium" style={{ background: "#10b98120", color: "#10b981" }}>
              ✅ Import réussi ! Les données ont été chargées dans votre plan comptable.
              Vous pouvez maintenant vérifier les écritures dans le journal OD.
            </div>
          )}
        </div>
      )}
    </div>
  );
}