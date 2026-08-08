-- ============================================================================
-- EXTENSIONS DU SCHÉMA (partie 4) — moteur de confiance et file d'exceptions
-- unique. Change le MODE de fonctionnement, pas juste des tables en plus :
-- tout passe automatiquement par défaut, seules les exceptions remontent.
-- À exécuter après schema.sql, schema-extensions.sql, -2.sql, -3.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SCORE DE CONFIANCE — ajouté aux tables qui génèrent des écritures
-- ----------------------------------------------------------------------------
alter table invoices add column if not exists confidence_score numeric(3,2) default 1.00; -- 0.00 à 1.00
alter table invoices add column if not exists needs_review boolean default false;

alter table payslips add column if not exists needs_review boolean default false;
alter table depreciation_schedule add column if not exists needs_review boolean default false;
alter table cash_vouchers add column if not exists needs_review boolean default false;
alter table customs_declarations add column if not exists needs_review boolean default false;

-- reconciliations a déjà une colonne "confidence" (certain/probable/a_verifier)
-- period_adjustments a déjà un statut "suggested/validated/rejected" — ce statut
-- EST sa file d'exception, pas besoin de dupliquer.

-- ----------------------------------------------------------------------------
-- 2. RÈGLE D'AUTO-VALIDATION — seuil configurable par entreprise
-- ----------------------------------------------------------------------------
create table automation_settings (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references companies(id) on delete cascade,
  confidence_threshold    numeric(3,2) not null default 0.85,  -- en dessous : file d'exceptions
  cash_voucher_auto_limit numeric(15,2) not null default 50000, -- FCFA, sous ce seuil : auto
  min_rule_uses_for_trust int not null default 3,               -- nb d'utilisations avant de faire confiance à une règle d'imputation
  updated_at              timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. FILE D'EXCEPTIONS UNIQUE — vue consolidée de tout ce qui attend une revue
-- ----------------------------------------------------------------------------
create or replace view monthly_review_queue as
  select
    'facture' as source_type,
    id as source_id,
    company_id,
    'Facture à confiance basse ou nouveau fournisseur' as reason,
    created_at
  from invoices
  where needs_review = true

  union all

  select
    'rapprochement_bancaire',
    id,
    (select company_id from bank_transactions bt where bt.id = reconciliations.bank_transaction_id),
    'Rapprochement à vérifier (confiance : ' || confidence || ')',
    matched_at
  from reconciliations
  where confidence = 'a_verifier'

  union all

  select
    'regularisation_cloture',
    id,
    company_id,
    'Régularisation suggérée : ' || type,
    created_at
  from period_adjustments
  where status = 'suggested'

  union all

  select
    'bon_de_caisse',
    id,
    company_id,
    'Bon de caisse au-dessus du seuil ou écart de caisse détecté',
    created_at
  from cash_vouchers
  where needs_review = true

  union all

  select
    'declaration_douane',
    id,
    company_id,
    'Écart entre valeur déclarée et facture d''origine',
    created_at
  from customs_declarations
  where needs_review = true

  union all

  select
    'paie',
    id,
    (select company_id from employees e where e.id = payslips.employee_id),
    'Bulletin de paie avec écart par rapport au salaire habituel',
    created_at
  from payslips
  where needs_review = true;

-- ----------------------------------------------------------------------------
-- 4. HISTORIQUE DE RÉSOLUTION DES EXCEPTIONS
-- Trace ce qui a été confirmé/corrigé, pour ajuster le seuil de confiance
-- au fil du temps (si une source génère trop de fausses alertes, remonter
-- son seuil de confiance par défaut).
-- ----------------------------------------------------------------------------
create table review_resolutions (
  id            uuid primary key default gen_random_uuid(),
  source_type   text not null,
  source_id     uuid not null,
  resolution    text not null check (resolution in ('confirme_tel_quel','corrige','rejete')),
  resolved_by   text,
  resolved_at   timestamptz not null default now()
);

create index idx_review_resolutions_source on review_resolutions(source_type, source_id);
