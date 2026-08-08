"use client";

import { useState, useEffect, useRef } from "react";
import { fetchDocuments, fetchDocumentTypes, uploadDocument, validateDocument, type Document } from "@/lib/documents";

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [types, setTypes] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [d, t] = await Promise.all([fetchDocuments(search || undefined), fetchDocumentTypes()]);
      setDocs(d);
      setTypes(t);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  useEffect(() => {
    const timer = setTimeout(() => loadData(), 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadDocument({ file, document_type_id: selectedType || undefined });
      if (fileRef.current) fileRef.current.value = "";
      setSelectedType("");
      await loadData();
    } catch (e) {
      alert("Erreur upload: " + (e as Error).message);
    }
    setUploading(false);
  }

  async function handleValidate(id: string, status: "validated" | "rejected") {
    await validateDocument(id, status);
    await loadData();
  }

  const typeColors: Record<string, string> = {
    pending: "#f59e0b", validated: "#10b981", rejected: "#ef4444",
  };

  const getFileIcon = (mime: string) => {
    if (mime.includes("pdf")) return "📄";
    if (mime.includes("image")) return "🖼️";
    if (mime.includes("sheet") || mime.includes("excel")) return "📊";
    if (mime.includes("word") || mime.includes("document")) return "📝";
    return "📎";
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">GED — Documents</h1>
          <p className="app-page-desc">Gestion Électronique de Documents — Upload, OCR, archivage</p>
        </div>
      </div>

      {/* Upload */}
      <div className="app-card mb-6">
        <h3 className="font-semibold mb-3">Uploader un document</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <input ref={fileRef} type="file" className="app-input w-full" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.docx" />
          </div>
          <div>
            <select className="app-input" value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
              <option value="">Sans classification</option>
              {types.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
            </select>
          </div>
          <button className="app-btn-primary" onClick={handleUpload} disabled={uploading}>
            {uploading ? "Upload..." : "Uploader"}
          </button>
        </div>
      </div>

      {/* Recherche */}
      <div className="mb-4">
        <input
          className="app-input w-full"
          placeholder="🔍 Rechercher dans les documents (nom, contenu OCR, tags)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Liste */}
      {loading ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>Chargement...</p>
      ) : docs.length === 0 ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>
          {search ? "Aucun document trouvé" : "Aucun document. Commencez par uploader un fichier."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map((doc) => (
            <div key={doc.id} className="app-card">
              <div className="flex items-start justify-between mb-2">
                <span className="text-2xl">{getFileIcon(doc.mime_type)}</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: typeColors[doc.validation_status] + "20", color: typeColors[doc.validation_status] }}
                >
                  {doc.validation_status === "validated" ? "Validé" : doc.validation_status === "rejected" ? "Rejeté" : "En attente"}
                </span>
              </div>
              <p className="font-medium text-sm truncate" title={doc.filename}>{doc.filename}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {doc.document_type_label ?? "Non classé"} — {doc.file_size ? (doc.file_size / 1024).toFixed(0) + " Ko" : "?"}
              </p>
              {doc.ocr_done && <p className="text-xs mt-1" style={{ color: "#10b981" }}>✅ OCR effectué</p>}
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                {new Date(doc.created_at).toLocaleDateString("fr-FR")}
              </p>
              {doc.tags && doc.tags.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {doc.tags.map((tag, i) => (
                    <span key={i} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-elevated)" }}>{tag}</span>
                  ))}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                {doc.validation_status === "pending" && (
                  <>
                    <button className="app-btn-primary text-xs" onClick={() => handleValidate(doc.id, "validated")}>✓ Valider</button>
                    <button className="app-btn-danger text-xs" onClick={() => handleValidate(doc.id, "rejected")}>✗ Rejeter</button>
                  </>
                )}
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="app-btn-secondary text-xs">👁️ Voir</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}