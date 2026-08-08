-- ============================================================================
-- EXTENSIONS DU SCHÉMA – éléments manquants du plan comptable
-- À exécuter après schema.sql (dépend des tables companies, entries,
-- entry_lines, third_parties, chart_of_accounts).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. IMMOBILISATIONS ET AMORTISSEMENTS
-- ----------------------------------------------------------------------------
create table fixed_assets (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  label               text not null,
  category            text,                          -- ex: 'matériel informatique', 'véhicule'
  acquisition_date    date not null,
  original_value      numeric(15,2) not null,
  useful_life_months  int not null,                   -- ex: 36 pour 3 ans
  method              text not null default 'lineaire' check (method in ('lineaire')),
  asset_account_code       text not null,             -- ex: '245'
  depreciation_account_code text not null,            -- ex: '281'
  disposal_date       date,
  disposal_value      numeric(15,2),
  created_at          timestamptz not null default now()
);

create table depreciation_schedule (
  id              uuid primary key default gen_random_uuid(),
  fixed_asset_id  uuid not null references fixed_assets(id) on delete cascade,
  period_date     date not null,                      -- mois concerné
  amount          numeric(15,2) not null,
  entry_id        uuid references entries(id),        -- écriture générée
  created_at      timestamptz not null default now(),
  unique (fixed_asset_id, period_date)
);

-- ----------------------------------------------------------------------------
-- 2. PAIE ET PERSONNEL
-- ----------------------------------------------------------------------------
create table employees (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  full_name     text not null,
  position      text,
  hire_date     date,
  base_salary   numeric(15,2) not null,
  social_regime text default 'IPRES/CSS',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table payslips (
  id                    uuid primary key default gen_random_uuid(),
  employee_id           uuid not null references employees(id) on delete cascade,
  period_month          date not null,                -- premier jour du mois concerné
  gross_salary          numeric(15,2) not null,
  employee_contributions numeric(15,2) not null default 0,  -- IPRES/IPM part salariale
  employer_contributions numeric(15,2) not null default 0,  -- CSS/IPRES part patronale
  income_tax_withheld   numeric(15,2) not null default 0,
  net_salary            numeric(15,2) not null,
  entry_id              uuid references entries(id),
  status                text not null default 'draft' check (status in ('draft','validated','paid')),
  created_at            timestamptz not null default now(),
  unique (employee_id, period_month)
);

-- ----------------------------------------------------------------------------
-- 3. STOCKS – valorisation (version simplifiée, en attendant décision
--    d'intégration avec le système de gestion de stock existant)
-- ----------------------------------------------------------------------------
create table stock_valuations (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  period_date     date not null,                       -- fin de période
  product_ref     text not null,
  quantity        numeric(15,3) not null,
  unit_cost       numeric(15,4) not null,               -- coût moyen pondéré
  total_value     numeric(15,2) generated always as (quantity * unit_cost) stored,
  source          text default 'manual' check (source in ('manual','external_system')),
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. DEVISES ET TAUX DE CHANGE
-- ----------------------------------------------------------------------------
create table exchange_rates (
  id            uuid primary key default gen_random_uuid(),
  from_currency text not null,                         -- ex: 'CAD'
  to_currency   text not null default 'XOF',
  rate_date     date not null,
  rate          numeric(15,6) not null,                 -- 1 from_currency = rate * to_currency
  created_at    timestamptz not null default now(),
  unique (from_currency, to_currency, rate_date)
);

-- Colonnes multi-devises ajoutées aux factures existantes
alter table invoices add column if not exists currency text default 'XOF';
alter table invoices add column if not exists exchange_rate numeric(15,6) default 1;
alter table invoices add column if not exists amount_ttc_original numeric(15,2); -- montant dans la devise d'origine

-- ----------------------------------------------------------------------------
-- 5. RÉGULARISATIONS DE FIN D'EXERCICE
-- ----------------------------------------------------------------------------
create table period_adjustments (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  fiscal_period_id uuid references fiscal_periods(id),
  type            text not null check (type in
                    ('charge_a_payer','produit_constate_avance','provision_creance_douteuse')),
  description     text,
  amount          numeric(15,2) not null,
  related_invoice_id uuid references invoices(id),
  entry_id        uuid references entries(id),
  status          text not null default 'suggested' check (status in ('suggested','validated','rejected')),
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. RÉGIME FISCAL PAR ENTITÉ
-- ----------------------------------------------------------------------------
alter table companies add column if not exists tax_regime text
  default 'reel_normal' check (tax_regime in ('reel_normal','reel_simplifie','cgu'));

-- ----------------------------------------------------------------------------
-- 7. COMPTABILITÉ ANALYTIQUE PAR PROJET
-- ----------------------------------------------------------------------------
create table cost_centers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  code          text not null,
  label         text not null,                          -- ex: 'École Sénégal', 'Teranga Direct'
  active        boolean not null default true,
  unique (company_id, code)
);

alter table entry_lines add column if not exists cost_center_id uuid references cost_centers(id);

-- ----------------------------------------------------------------------------
-- 8. NOTES DE FRAIS ET AVANCES
-- ----------------------------------------------------------------------------
create table expense_reports (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  submitted_by    text not null,
  expense_date    date not null,
  motif           text,
  amount          numeric(15,2) not null,
  receipt_url     text,
  status          text not null default 'submitted'
                    check (status in ('submitted','approved','reimbursed','rejected')),
  entry_id        uuid references entries(id),
  created_at      timestamptz not null default now()
);

create table advances (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  third_party_id  uuid references third_parties(id),
  employee_id     uuid references employees(id),
  amount_given    numeric(15,2) not null,
  amount_settled  numeric(15,2) not null default 0,
  balance         numeric(15,2) generated always as (amount_given - amount_settled) stored,
  given_date      date not null,
  status          text not null default 'open' check (status in ('open','settled')),
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 9. CONSERVATION LÉGALE DES PIÈCES (politique d'archivage à 10 ans OHADA)
-- ----------------------------------------------------------------------------
create table document_archive_policy (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  retention_years      int not null default 10,
  last_export_date     date,
  last_export_location text,                            -- ex: lien Google Drive
  created_at          timestamptz not null default now()
);

-- Index utiles
create index idx_depreciation_asset on depreciation_schedule(fixed_asset_id);
create index idx_payslips_employee on payslips(employee_id);
create index idx_adjustments_period on period_adjustments(fiscal_period_id);
create index idx_entry_lines_cost_center on entry_lines(cost_center_id);
