-- ============================================================================
-- MODULE FISCALITÉ AVANCÉE — BRS, VRS, CFCE, Précompte TVA
-- Dépend de schema.sql, schema-mvp-pro-senegal.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. BRS — Bénéfice / Retenue à la Source (fournisseurs)
-- ---------------------------------------------------------------------------
create table brs_declarations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  period_month date not null,                     -- mois concerné
  declaration_date date default current_date,
  -- Totaux calculés
  total_prestations_locales numeric(19,4) default 0,
  total_ret_5pct numeric(19,4) default 0,        -- retenue 5%
  total_prestations_non_resident numeric(19,4) default 0,
  total_ret_20pct numeric(19,4) default 0,       -- retenue 20%
  total_regimes_derogatoires numeric(19,4) default 0,
  total_ret_2pct numeric(19,4) default 0,        -- retenue 2%
  status text default 'draft' check (status in ('draft','ready','submitted','acknowledged')),
  xml_content text,
  submitted_at timestamptz,
  created_at timestamptz default now()
);

create table brs_lines (
  id uuid primary key default gen_random_uuid(),
  brs_id uuid not null references brs_declarations(id) on delete cascade,
  supplier_id uuid not null references third_parties(id),
  invoice_id uuid references invoices(id),
  invoice_number text,
  amount_ht numeric(19,4) not null,
  ret_rate numeric(6,4) not null,                -- 0.05, 0.02, 0.20
  ret_amount numeric(19,4) not null,              -- montant retenu
  nature_prestation text,                         -- 'prestation_locale', 'non_resident', 'derogatoire'
  attestation_generated boolean default false,
  attestation_url text                            -- PDF attestation BRS
);

-- ---------------------------------------------------------------------------
-- 2. VRS — Versement Réalisé par l'Employeur (IR, TRFP, CFCE sur salaires)
-- ---------------------------------------------------------------------------
create table vrs_declarations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  period_month date not null,
  declaration_date date default current_date,
  total_ir_retained numeric(19,4) default 0,      -- IR retenu à la source
  total_trfp_retained numeric(19,4) default 0,    -- TRFP retenu
  total_cfce_employee numeric(19,4) default 0,    -- CFCE sur salaires (3% masse salariale)
  status text default 'draft' check (status in ('draft','ready','submitted','acknowledged')),
  xml_content text,
  submitted_at timestamptz,
  created_at timestamptz default now()
);

create table vrs_lines (
  id uuid primary key default gen_random_uuid(),
  vrs_id uuid not null references vrs_declarations(id) on delete cascade,
  employee_id uuid not null references employees(id),
  gross_salary numeric(19,4) not null,
  ir_withheld numeric(19,4) not null,
  trfp_withheld numeric(19,4) not null,
  cfce_employee numeric(19,4) not null
);

-- ---------------------------------------------------------------------------
-- 3. CFCE — Contribution Forfaitaire à la Charge des Employeurs (3% masse salariale)
-- ---------------------------------------------------------------------------
create table cfce_declarations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  period_month date not null,
  declaration_date date default current_date,
  gross_salary_mass numeric(19,4) not null,       -- masse salariale brute
  cfce_rate numeric(6,4) default 0.03,
  cfce_amount numeric(19,4) not null,             -- montant CFCE
  status text default 'draft' check (status in ('draft','ready','submitted','acknowledged')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 4. PRÉCOMPTE TVA — Statut Agent Collecteur/Reteneur DGID
-- ---------------------------------------------------------------------------
create table prepayment_tva (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  is_agent_collector boolean default false,        -- statut agent collecteur de TVA
  collector_attestation text,                       -- numéro d'attestation DGID
  collector_valid_from date,
  collector_valid_to date,
  created_at timestamptz default now()
);

-- TVA précomptée sur les factures
alter table invoices add column if not exists vat_prepayment_rate numeric(6,4);
alter table invoices add column if not exists vat_prepayment_amount numeric(19,4);

-- ---------------------------------------------------------------------------
-- 5. ÉCHÉANCIER FISCAL DYNAMIQUE
-- ---------------------------------------------------------------------------
create table tax_calendar (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tax_type text not null,                          -- 'TVA','BRS','VRS','IS','CFCE','PATENTE'
  tax_label text not null,
  periodicity text not null check (periodicity in ('mensuelle','trimestrielle','annuelle')),
  deadline_day int not null,                       -- jour limite (ex: 15)
  active boolean default true,
  next_due_date date,
  last_completed_at timestamptz,
  created_at timestamptz default now()
);

-- Notifications fiscales
create table tax_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tax_calendar_id uuid references tax_calendar(id),
  due_date date not null,
  notified boolean default false,
  notified_at timestamptz,
  acknowledged boolean default false,
  created_at timestamptz default now()
);

-- Suivi des acomptes IS
create table is_advance_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  fiscal_year int not null,
  period_start date not null,
  period_end date not null,
  estimated_income numeric(19,4),
  advance_rate numeric(6,4) default 0.25,          -- taux IS
  advance_amount numeric(19,4) not null,
  payment_date date,
  status text default 'pending' check (status in ('pending','paid','regularized')),
  entry_id uuid references entries(id),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEX
-- ---------------------------------------------------------------------------
create index idx_brs_period on brs_declarations(company_id, period_month);
create index idx_vrs_period on vrs_declarations(company_id, period_month);
create index idx_cfce_period on cfce_declarations(company_id, period_month);
create index idx_tax_calendar_company on tax_calendar(company_id);
create index idx_tax_notifications_due on tax_notifications(due_date, notified);