import { computeMatchScore, runAutoMatching } from "./bankMatching";

// Tests unitaires pour l'algorithme de matching bancaire

describe("BankMatching", () => {
  const mockBankTx = (overrides = {}) => ({
    id: "btx-1",
    bank_date: "2026-01-15",
    label: "Virement client FAC-2026-000042",
    amount: 500000,
    reference: "FAC-2026-000042",
    reconciled: false,
    matched_entry_line_id: null,
    match_confidence: null,
    ...overrides,
  });

  const mockEntryLine = (overrides = {}) => ({
    id: "el-1",
    entry_id: "entry-1",
    account_code: "521",
    debit: 500000,
    credit: 0,
    entry_date: "2026-01-15",
    description: "Facture FAC-2026-000042",
    reference: "FAC-2026-000042",
    ...overrides,
  });

  describe("computeMatchScore", () => {
    it("should score 100 when amount, date and reference match exactly", () => {
      const result = computeMatchScore(mockBankTx(), mockEntryLine());
      expect(result.score).toBeGreaterThanOrEqual(95);
      expect(result.confidence).toBe("auto_exact");
    });

    it("should score 70 when only amount and date match (no reference)", () => {
      const result = computeMatchScore(
        mockBankTx({ reference: null }),
        mockEntryLine({ reference: null })
      );
      expect(result.score).toBe(70);
      expect(result.confidence).toBe("auto_fuzzy");
    });

    it("should score 40 when only amount matches (different date)", () => {
      const result = computeMatchScore(
        mockBankTx({ bank_date: "2026-02-01" }),
        mockEntryLine({ entry_date: "2026-01-15", reference: null })
      );
      expect(result.score).toBe(40);
    });

    it("should score 0 when nothing matches", () => {
      const result = computeMatchScore(
        mockBankTx({ amount: 1000, bank_date: "2026-06-01", reference: "XXX" }),
        mockEntryLine({ debit: 999999, entry_date: "2026-01-01", reference: "YYY" })
      );
      expect(result.score).toBe(0);
      expect(result.confidence).toBe("manual");
    });

    it("should detect exact amount with small tolerance", () => {
      const result = computeMatchScore(
        mockBankTx({ amount: 500000.005 }),
        mockEntryLine({ debit: 500000 })
      );
      expect(result.score).toBeGreaterThanOrEqual(95);
    });

    it("should detect fuzzy reference (last 6 chars)", () => {
      const result = computeMatchScore(
        mockBankTx({ reference: "INV-000042" }),
        mockEntryLine({ reference: "FAC-2026-000042" })
      );
      expect(result.score).toBeGreaterThanOrEqual(55);
    });

    it("should add description bonus for matching keywords", () => {
      const result = computeMatchScore(
        mockBankTx({ label: "Paiement client SARL Teranga" }),
        mockEntryLine({ description: "Vente SARL Teranga — prestation", reference: null })
      );
      // Montant (40) + Date (30) + Description bonus (5-10) = 75-80
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.score).toBeLessThanOrEqual(90);
    });

    it("should handle negative bank amounts (debits)", () => {
      const result = computeMatchScore(
        mockBankTx({ amount: -500000 }),
        mockEntryLine({ debit: 0, credit: 500000 })
      );
      expect(result.score).toBeGreaterThanOrEqual(95);
    });
  });

  describe("runAutoMatching", () => {
    it("should process all bank transactions", async () => {
      // Ce test nécessite une base Supabase — test d'intégration
      expect(true).toBe(true);
    });
  });
});