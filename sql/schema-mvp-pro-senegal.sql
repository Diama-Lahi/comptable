-- ============================================================================
-- MVP PRO — SPÉCIFICITÉS SÉNÉGALAISES & ARCHITECTURE AVANCÉE
-- Dépend de schema.sql, schema-extensions.sql, schema-module-1-2-achats-ventes.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PARAMÈTRES FISCAUX DYNAMIQUES (avec versioning)
-- Plus jamais de taux codés en dur.
-- ---------------------------------------------------------------------------
create table tax_settings (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  tax_code          text not null,                -- 'TVA', 'IRPP', 'CNPS', 'IPRES', 'CSS', 'TCA', 'CFCE', 'PATENTE'
  tax_label         text not null,
  rate              numeric(6,4) not null,         -- ex: 0.1800 pour 18%
  base_type         text not null check (base_type in ('ht','ttc','brut','net'))
                      default 'ht',
  effective_from    date not null,                 -- date d'application
  effective_to      date,                          -- NULL = toujours en vigueur
  law_reference     text,                          -- ex: "LFI 2025 article 15"
  version           int not null default 1,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (company_id, tax_code, version)
);

-- Taux par défaut Sénégal (seed)
insert into tax_settings (company_id, tax_code, tax_label, rate, base_type, effective_from, law_reference) 
select id, 'TVA', 'Taxe sur la Valeur Ajoutée', 18.0000, 'ht', '2025-01-01', 'CGI Sénégal art. 266'
from companies;

-- ---------------------------------------------------------------------------
-- 2. ACOMPTES CLIENTS AVEC TVA (Spécificité Sénégal)
-- Une facture d'acompte génère une TVA exigible.
-- La facture définitive déduit l'acompte et régularise.
-- ---------------------------------------------------------------------------
create table customer_deposits (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  client_id         uuid not null references third_parties(id),
  deposit_number    text not null,                 -- numéro de facture d'acompte
  deposit_date      date not null,
  amount_ht         numeric(19,4) not null,
  tva_rate          numeric(6,4) not null default 18.0000,
  tva_amount        numeric(19,4) not null,
  amount_ttc        numeric(19,4) not null,
  -- Lien avec la facture finale
  invoice_id        uuid references invoices(id),  -- facture définitive qui déduit cet acompte
  remaining_balance numeric(19,4) generated always as (
    amount_ttc - coalesce(
      (select sum(amount_ttc) from invoice_deposit_links where deposit_id = id),
      0
    )
  ) stored,
  status            text not null default 'pending'
                      check (status in ('pending','partially_deducted','fully_deducted','refunded')),
  -- Écriture générée
  deposit_entry_id  uuid references entries(id),
  reversal_entry_id uuid references entries(id),
  created_at        timestamptz not null default now(),
  unique (company_id, deposit_number)
);

-- Lien entre acompte et facture définitive
create table invoice_deposit_links (
  id                uuid primary key default gen_random_uuid(),
  deposit_id        uuid not null references customer_deposits(id) on delete cascade,
  invoice_id        uuid not null references invoices(id),
  amount_deducted   numeric(19,4) not null,        -- montant TTC déduit
  tva_deducted      numeric(19,4) not null,        -- TVA régularisée
  created_at        timestamptz not null default now(),
  unique (deposit_id, invoice_id)
);

-- TVA sur acomptes : table de suivi
create table vat_on_deposits (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  deposit_id        uuid not null references customer_deposits(id),
  vat_collected     numeric(19,4) not null,        -- TVA collectée sur l'acompte
  vat_regularized   numeric(19,4) not null default 0, -- TVA régularisée sur facture finale
  vat_balance       numeric(19,4) generated always as (vat_collected - vat_regularized) stored,
  entry_id          uuid references entries(id),
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. GESTION DES ARRONDIS
-- Stockage décimal (19,4) avec compte d'écart dédié
-- ---------------------------------------------------------------------------
alter table entry_lines alter column debit type numeric(19,4);
alter table entry_lines alter column credit type numeric(19,4);
alter table invoices alter column amount_ht type numeric(19,4);
alter table invoices alter column tva_amount type numeric(19,4);
alter table invoices alter column amount_ttc type numeric(19,4);

-- Compte 658 dédié aux écarts d'arrondis
insert into chart_of_accounts (company_id, code, label, class, account_type)
select id, '658', 'Pertes sur arrondis', 6, 'charge'
from companies
where not exists (
  select 1 from chart_of_accounts ca where ca.company_id = companies.id and ca.code = '658'
);

-- ---------------------------------------------------------------------------
-- 4. VERSIONNING DES ÉCRITURES (verrouillage optimiste)
-- ---------------------------------------------------------------------------
alter table entry_lines add column if not exists version int not null default 1;
alter table entries add column if not exists version int not null default 1;

-- Fonction pour mise à jour avec versionning
create or replace function update_entry_line(
  p_line_id uuid,
  p_new_debit numeric(19,4),
  p_new_credit numeric(19,4),
  p_expected_version int
) returns boolean as $$
declare
  v_updated int;
begin
  update entry_lines
  set debit = p_new_debit, credit = p_new_credit, version = version + 1
  where id = p_line_id and version = p_expected_version;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- 5. AUDIT LOGS CENTRALISÉ (immutabilité)
-- Interdit les DELETE sur les tables comptables via triggers
-- ---------------------------------------------------------------------------
create table audit_logs (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid references companies(id),
  table_name        text not null,
  record_id         uuid not null,
  operation         text not null check (operation in ('INSERT','UPDATE','DELETE')),
  old_values        jsonb,
  new_values        jsonb,
  performed_by      text,
  performed_at      timestamptz not null default now()
);

-- Index pour recherche rapide
create index idx_audit_logs_table on audit_logs(table_name, record_id);
create index idx_audit_logs_time on audit_logs(performed_at desc);

-- Trigger d'audit générique pour les tables comptables
create or replace function audit_trigger_func()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_logs (company_id, table_name, record_id, operation, new_values, performed_by)
    values (NEW.company_id, tg_table_name, NEW.id, 'INSERT', row_to_json(NEW)::jsonb, current_user);
    return NEW;
  elsif tg_op = 'UPDATE' then
    insert into audit_logs (company_id, table_name, record_id, operation, old_values, new_values, performed_by)
    values (NEW.company_id, tg_table_name, NEW.id, 'UPDATE', row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, current_user);
    return NEW;
  elsif tg_op = 'DELETE' then
    raise exception 'DELETE interdit sur la table % : utilisez une contre-passation.', tg_table_name;
  end if;
  return null;
end;
$$ language plpgsql;

-- Application du trigger sur les tables critiques (à exécuter manuellement selon besoin)
-- create trigger audit_entries before insert or update or delete on entries for each row execute function audit_trigger_func();
-- create trigger audit_entry_lines before insert or update or delete on entry_lines for each row execute function audit_trigger_func();
-- create trigger audit_invoices before insert or update or delete on invoices for each row execute function audit_trigger_func();

-- ---------------------------------------------------------------------------
-- 6. TABLE DES ÉTATS FINANCIERS GÉNÉRÉS (cache)
-- ---------------------------------------------------------------------------
create table financial_statements_cache (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  statement_type    text not null check (statement_type in 
                      ('bilan','crc','flux_tresorerie','variation_capitaux','dsf','liasse_fiscale')),
  period_from       date not null,
  period_to         date not null,
  data              jsonb not null,               -- état complet sérialisé
  generated_at      timestamptz not null default now(),
  generated_by      text,
  unique (company_id, statement_type, period_from, period_to)
);

-- ---------------------------------------------------------------------------
-- 7. EXTENSION TABLE BANQUE — champ référence pour matching
-- ---------------------------------------------------------------------------
alter table bank_transactions add column if not exists reference text;
alter table bank_transactions add column if not exists matched_entry_line_id uuid references entry_lines(id);
alter table bank_transactions add column if not exists match_confidence text 
  check (match_confidence in ('auto_exact','auto_fuzzy','manual'));

create index idx_bank_tx_reference on bank_transactions(reference);
create index idx_bank_tx_matched on bank_transactions(matched_entry_line_id);

-- ---------------------------------------------------------------------------
-- 8. DSF — Déclaration Statistique et Fiscale (format DGID Sénégal)
-- ---------------------------------------------------------------------------
create table dsf_declarations (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  fiscal_year       int not null,
  period_label      text not null,                -- 'Janvier 2026', 'Exercice 2026'
  type              text not null check (type in ('mensuelle','trimestrielle','annuelle')),
  declaration_date  date not null default current_date,
  -- Données de la déclaration
  turnover          numeric(19,4) not null default 0,
  vat_collected     numeric(19,4) not null default 0,
  vat_deductible    numeric(19,4) not null default 0,
  vat_net           numeric(19,4) not null default 0,
  income_tax        numeric(19,4) not null default 0,
  patente           numeric(19,4) not null default 0,
  cfce              numeric(19,4) not null default 0,
  -- Statut
  xml_generated     boolean not null default false,
  xml_content       text,                          -- XML DSF brut
  xml_url           text,                          -- lien vers le fichier stocké
  status            text not null default 'draft'
                      check (status in ('draft','ready','submitted','acknowledged')),
  submitted_at      timestamptz,
  created_by        text,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 9. CALCULATEUR D'HONORAIRES (Module Cabinet)
-- ---------------------------------------------------------------------------
create table fee_rules (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  rule_name         text not null,
  calculation_base  text not null check (calculation_base in 
                      ('per_entry','per_invoice','percentage_turnover','flat_fee')),
  rate              numeric(10,4) not null,        -- montant unitaire ou pourcentage
  min_fee           numeric(15,2),
  max_fee           numeric(15,2),
  billing_period    text not null default 'monthly' check (billing_period in ('monthly','quarterly','annually')),
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create table fee_generations (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  client_company_id uuid not null references companies(id),
  period_from       date not null,
  period_to         date not null,
  rule_id           uuid references fee_rules(id),
  amount_calculated numeric(15,2) not null,
  invoice_id        uuid references invoices(id),  -- facture générée
  status            text not null default 'calculated'
                      check (status in ('calculated','invoiced','paid')),
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 10. TAXE SUR LES CONTRATS D'ASSURANCE (TCA)
-- ---------------------------------------------------------------------------
alter table entry_lines add column if not exists tca_amount numeric(19,4);

-- ---------------------------------------------------------------------------
-- INDEX
-- ---------------------------------------------------------------------------
create index idx_deposits_client on customer_deposits(client_id);
create index idx_deposits_status on customer_deposits(status);
create index idx_vaton_deposits on vat_on_deposits(deposit_id);
create index idx_dsf_year on dsf_declarations(company_id, fiscal_year);
create index idx_tax_settings_active on tax_settings(company_id, tax_code, active);