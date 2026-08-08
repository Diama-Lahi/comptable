-- ============================================================================
-- EXTENSIONS DU SCHÉMA (partie 5) — écarts de change et variation de stock
-- automatiques. À exécuter après schema-extensions-4.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ÉCARTS DE CHANGE — comptes manquants pour le gain/perte de change
-- généré automatiquement au règlement d'une facture en devise étrangère
-- (voir app/src/lib/lettering.ts, recordPayment).
-- ----------------------------------------------------------------------------
-- Comptes ajoutés au plan comptable de l'entreprise existante et à
-- seed_default_chart_of_accounts() pour les futures entreprises :
--   676  Pertes de change   (classe 6, charge)
--   776  Gains de change    (classe 7, produit)

-- ----------------------------------------------------------------------------
-- 2. VARIATION DE STOCK AUTOMATIQUE — clôture périodique (méthode de
-- l'inventaire intermittent, cohérente avec le reste de l'application :
-- achats en charge à l'achat, coût des marchandises vendues dérivé en fin
-- de période plutôt qu'un ledger perpétuel par mouvement).
-- ----------------------------------------------------------------------------
-- Compte ajouté : 603 Variations des stocks de biens achetés (classe 6, charge)

create table if not exists stock_variation_closures (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  period_date    date not null,
  opening_value  numeric(15,2) not null,
  closing_value  numeric(15,2) not null,
  variation      numeric(15,2) not null,       -- closing_value - opening_value
  entry_id       uuid references entries(id),
  created_at     timestamptz not null default now(),
  unique (company_id, period_date)
);

alter table stock_variation_closures disable row level security;

-- ----------------------------------------------------------------------------
-- 3. IMPORT DU JOURNAL DEPUIS EXCEL — nouvelle source d'écriture
-- (voir app/src/lib/journalImport.ts)
-- ----------------------------------------------------------------------------
alter table entries drop constraint if exists entries_source_check;
alter table entries add constraint entries_source_check
  check (source = ANY (ARRAY['manual'::text, 'bank_import'::text, 'invoice_ocr'::text, 'cash_voucher'::text, 'excel_import'::text]));
