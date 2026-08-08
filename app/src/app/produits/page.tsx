"use client";

import { useEffect, useState } from "react";
import {
  computeProductMargins,
  createProduct,
  fetchClientInvoices,
  fetchProducts,
  recordProductSale,
  type InvoiceOption,
  type Product,
  type ProductMargin,
} from "@/lib/products";

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ProduitsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [margins, setMargins] = useState<ProductMargin[]>([]);

  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [unitCost, setUnitCost] = useState("");

  const [saleInvoiceId, setSaleInvoiceId] = useState("");
  const [saleProductId, setSaleProductId] = useState("");
  const [saleQuantity, setSaleQuantity] = useState("1");
  const [saleUnitPrice, setSaleUnitPrice] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    setProducts(await fetchProducts());
    setInvoices(await fetchClientInvoices());
    setMargins(await computeProductMargins());
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !label) return;
    await createProduct({ code, label, unitCost: parseFloat(unitCost) || 0 });
    setCode("");
    setLabel("");
    setUnitCost("");
    await load();
  };

  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleInvoiceId || !saleProductId || !saleUnitPrice) return;
    setMsg("");
    try {
      await recordProductSale({
        invoiceId: saleInvoiceId,
        productId: saleProductId,
        quantity: parseFloat(saleQuantity) || 1,
        unitPrice: parseFloat(saleUnitPrice),
      });
      setMsg("Ligne de vente enregistrée.");
      setSaleUnitPrice("");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Rentabilité par produit/service</h1>

      <section className="space-y-3">
        <h2 className="font-medium">Nouveau produit/service</h2>
        <form onSubmit={handleCreateProduct} className="flex flex-wrap gap-3 items-end text-sm">
          <label className="flex flex-col gap-1">
            Code
            <input type="text" className="border rounded px-2 py-1" value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Libellé
            <input type="text" className="border rounded px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Café Touba 1kg" required />
          </label>
          <label className="flex flex-col gap-1">
            Coût direct unitaire
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
            Enregistrer
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Rattacher une vente à une facture</h2>
        <p className="text-xs text-zinc-500">
          Les factures créées via <code>/factures</code> ou <code>/contrats</code> n&apos;ont pas de lignes détaillées
          par défaut — ceci ajoute une ligne produit à une facture existante pour le calcul de marge.
        </p>
        <form onSubmit={handleRecordSale} className="flex flex-wrap gap-3 items-end text-sm">
          <label className="flex flex-col gap-1">
            Facture
            <select className="border rounded px-2 py-1" value={saleInvoiceId} onChange={(e) => setSaleInvoiceId(e.target.value)} required>
              <option value="">—</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number ?? inv.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Produit
            <select className="border rounded px-2 py-1" value={saleProductId} onChange={(e) => setSaleProductId(e.target.value)} required>
              <option value="">—</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Quantité
            <input type="number" step="0.01" className="border rounded px-2 py-1 w-20" value={saleQuantity} onChange={(e) => setSaleQuantity(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Prix unitaire de vente
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={saleUnitPrice} onChange={(e) => setSaleUnitPrice(e.target.value)} required />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
            Enregistrer
          </button>
        </form>
        {msg && <p className="text-sm text-green-600">{msg}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Marge par produit</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Produit</th>
              <th className="text-right">CA</th>
              <th className="text-right">Coût direct</th>
              <th className="text-right">Marge</th>
            </tr>
          </thead>
          <tbody>
            {margins.map((m) => (
              <tr key={m.productId} className="border-b">
                <td className="py-1">{m.label}</td>
                <td className="text-right">{fmt(m.revenue)}</td>
                <td className="text-right">{fmt(m.cost)}</td>
                <td className={`text-right font-medium ${m.margin >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(m.margin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </main>
  );
}
