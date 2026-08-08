-- ============================================================================
-- SCHÉMA SUPABASE — Application de comptabilité (Sénégal / SYSCOHADA)
-- Phase 1 : fondations (plan comptable, écritures, factures, tiers)
-- Les autres tables (banque, paiements, bon de caisse, règles d'imputation,
-- multi-entreprise) sont créées dès maintenant en structure simple, mono-
-- entreprise, pour éviter une migration lourde plus tard.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ENTREPRISE (préparation Phase 5 - multi-tenant)
-- Une seule ligne pour l'instant (ton usage personnel), mais toutes les
-- tables métier référencent déjà company_id pour ne pas tout refaire plus tard.
-- ----------------------------------------------------------------------------
create table companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  country       text not null default 'SN',
  currency      text not null default 'XOF',
  tax_id        text,               -- NINEA / numéro contribuable
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. PLAN COMPTABLE (SYSCOHADA révisé)
-- ----------------------------------------------------------------------------
create table chart_of_accounts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  code          text not null,               -- ex: '601', '411', '521'
  label         text not null,                -- ex: 'Achats de marchandises'
  class         smallint not null,            -- 1 à 8 (classes SYSCOHADA)
  account_type  text not null check (account_type in
                  ('actif','passif','charge','produit')),
  parent_code   text,                         -- pour hiérarchie (ex: 601 sous 60)
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (company_id, code)
);

-- ----------------------------------------------------------------------------
-- 3. TIERS (clients et fournisseurs)
-- ----------------------------------------------------------------------------
create table third_parties (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  type          text not null check (type in ('client','fournisseur','les_deux')),
  name          text not null,
  tax_id        text,                          -- NINEA du tiers
  phone         text,
  email         text,
  address       text,
  account_code  text,                          -- compte collectif (411xxx / 401xxx)
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. EXERCICES ET PÉRIODES FISCALES
-- ----------------------------------------------------------------------------
create table fiscal_periods (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  label         text not null,                 -- ex: 'Janvier 2026'
  start_date    date not null,
  end_date      date not null,
  status        text not null default 'open' check (status in ('open','closed')),
  closed_at     timestamptz,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. JOURNAUX
-- ----------------------------------------------------------------------------
create table journals (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  code          text not null,                 -- ex: 'AC' (achats), 'VE' (ventes), 'BQ' (banque), 'OD' (opérations diverses), 'CA' (caisse)
  label         text not null,
  created_at    timestamptz not null default now(),
  unique (company_id, code)
);

-- ----------------------------------------------------------------------------
-- 6. ÉCRITURES COMPTABLES
-- ----------------------------------------------------------------------------
create table entries (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  journal_id        uuid not null references journals(id),
  fiscal_period_id  uuid references fiscal_periods(id),
  entry_date        date not null,
  reference         text,                      -- numéro de pièce
  description       text,
  source            text not null default 'manual'
                      check (source in ('manual','bank_import','invoice_ocr','cash_voucher')),
  status            text not null default 'draft'
                      check (status in ('draft','validated','reversed')),
  created_by        text,                       -- utilisateur (référence auth.users plus tard)
  created_at        timestamptz not null default now()
);

create table entry_lines (
  id              uuid primary key default gen_random_uuid(),
  entry_id        uuid not null references entries(id) on delete cascade,
  account_code    text not null,
  third_party_id  uuid references third_parties(id),
  label           text,
  debit           numeric(15,2) not null default 0,
  credit          numeric(15,2) not null default 0,
  created_at      timestamptz not null default now(),
  check (debit >= 0 and credit >= 0),
  check (not (debit > 0 and credit > 0))        -- une ligne est soit débit, soit crédit
);

-- ----------------------------------------------------------------------------
-- 7. FACTURES (clients et fournisseurs)
-- ----------------------------------------------------------------------------
create table invoices (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  type            text not null check (type in ('client','fournisseur')),
  third_party_id  uuid references third_parties(id),
  invoice_number  text,
  invoice_date    date,
  due_date        date,
  amount_ht       numeric(15,2),
  tva_rate        numeric(5,2) default 18.00,
  tva_amount      numeric(15,2),
  amount_ttc      numeric(15,2),
  status          text not null default 'received'
                    check (status in ('received','verified','imputed','approved','paid','archived')),
  file_url        text,                         -- lien vers le PDF/photo dans Supabase Storage
  ocr_raw         jsonb,                         -- réponse brute de l'OCR, pour audit/debug
  entry_id        uuid references entries(id),  -- écriture générée une fois imputée
  created_at      timestamptz not null default now()
);

create table invoice_lines (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id) on delete cascade,
  description   text,
  quantity      numeric(10,2) default 1,
  unit_price    numeric(15,2),
  tva_rate      numeric(5,2) default 18.00,
  amount_ht     numeric(15,2)
);

-- ----------------------------------------------------------------------------
-- 8. BANQUE (préparé pour Phase 2)
-- ----------------------------------------------------------------------------
create table bank_transactions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  bank_date     date not null,
  label         text,
  amount        numeric(15,2) not null,        -- positif = entrée, négatif = sortie
  imported_at   timestamptz not null default now(),
  reconciled    boolean not null default false
);

create table reconciliations (
  id                    uuid primary key default gen_random_uuid(),
  bank_transaction_id   uuid not null references bank_transactions(id) on delete cascade,
  entry_line_id         uuid references entry_lines(id),
  confidence            text check (confidence in ('certain','probable','a_verifier')),
  matched_at            timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 9. BON DE CAISSE (préparé pour Phase 1bis / usage immédiat)
-- ----------------------------------------------------------------------------
create table cash_vouchers (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  voucher_number  serial,                        -- numérotation séquentielle automatique
  voucher_date    date not null default current_date,
  type            text not null check (type in ('entree','sortie')),
  amount          numeric(15,2) not null,
  motif           text,
  beneficiary     text,
  account_code    text,
  signature_url   text,
  entry_id        uuid references entries(id),
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 10. PAIEMENTS (préparé pour Phase 4)
-- ----------------------------------------------------------------------------
create table payments (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  invoice_id      uuid references invoices(id),
  method          text check (method in ('virement','wave','orange_money','especes','cheque')),
  amount          numeric(15,2) not null,
  status          text not null default 'draft'
                    check (status in ('draft','approved','executed','cancelled')),
  scheduled_date  date,
  executed_date   date,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 11. RÈGLES D'IMPUTATION AUTOMATIQUE (préparé pour Phase 1bis)
-- ----------------------------------------------------------------------------
create table imputation_rules (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  third_party_id  uuid references third_parties(id),
  keyword         text,                          -- si pas de tiers connu, mot-clé du libellé
  account_code    text not null,
  times_used      int not null default 0,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 12. PISTE D'AUDIT
-- ----------------------------------------------------------------------------
create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id),
  table_name    text not null,
  record_id     uuid not null,
  action        text not null check (action in ('insert','update','delete')),
  performed_by  text,
  details       jsonb,
  performed_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- INDEX UTILES
-- ----------------------------------------------------------------------------
create index idx_entry_lines_entry on entry_lines(entry_id);
create index idx_entry_lines_account on entry_lines(account_code);
create index idx_invoices_third_party on invoices(third_party_id);
create index idx_invoices_status on invoices(status);
create index idx_bank_tx_reconciled on bank_transactions(reconciled);
create index idx_coa_company_code on chart_of_accounts(company_id, code);

-- ----------------------------------------------------------------------------
-- FONCTION : seed_default_chart_of_accounts(company_id)
-- Charge un plan comptable SYSCOHADA de base pour une entreprise donnée.
-- Réutilisable pour chaque nouvelle entreprise (usage perso ou futurs clients SaaS).
-- Liste non exhaustive (comptes les plus courants pour PME/commerce) — à
-- compléter selon l'activité (immobilisations spécifiques, comptes analytiques...).
-- ----------------------------------------------------------------------------
create or replace function seed_default_chart_of_accounts(p_company_id uuid)
returns void as $$
begin
  insert into chart_of_accounts (company_id, code, label, class, account_type) values
  -- Classe 1 : Comptes de ressources durables
  (p_company_id, '101', 'Capital social',                          1, 'passif'),
  (p_company_id, '106', 'Réserves',                                 1, 'passif'),
  (p_company_id, '110', 'Report à nouveau',                         1, 'passif'),
  (p_company_id, '120', 'Résultat net de l''exercice',               1, 'passif'),
  (p_company_id, '161', 'Emprunts',                                 1, 'passif'),

  -- Classe 2 : Comptes d'actif immobilisé
  (p_company_id, '211', 'Frais de développement',                  2, 'actif'),
  (p_company_id, '218', 'Autres immobilisations incorporelles',     2, 'actif'),
  (p_company_id, '231', 'Bâtiments',                                2, 'actif'),
  (p_company_id, '244', 'Matériel et mobilier de bureau',           2, 'actif'),
  (p_company_id, '245', 'Matériel informatique',                   2, 'actif'),
  (p_company_id, '281', 'Amortissements des immobilisations',      2, 'actif'),

  -- Classe 3 : Comptes de stocks
  (p_company_id, '311', 'Marchandises',                            3, 'actif'),
  (p_company_id, '355', 'Produits finis',                          3, 'actif'),

  -- Classe 4 : Comptes de tiers
  (p_company_id, '401', 'Fournisseurs',                             4, 'passif'),
  (p_company_id, '408', 'Fournisseurs — factures non parvenues',    4, 'passif'),
  (p_company_id, '411', 'Clients',                                  4, 'actif'),
  (p_company_id, '418', 'Clients — factures à établir',             4, 'actif'),
  (p_company_id, '421', 'Personnel — rémunérations dues',           4, 'passif'),
  (p_company_id, '431', 'Sécurité sociale (IPRES/CSS)',              4, 'passif'),
  (p_company_id, '441', 'État — impôts sur les bénéfices',          4, 'passif'),
  (p_company_id, '4431', 'État — TVA facturée (collectée)',         4, 'passif'),
  (p_company_id, '4452', 'État — TVA déductible',                   4, 'actif'),
  (p_company_id, '4441', 'État — TVA due',                          4, 'passif'),
  (p_company_id, '447', 'État — retenues à la source',              4, 'passif'),
  (p_company_id, '462', 'Créances sur cessions d''immobilisations', 4, 'actif'),

  -- Classe 5 : Comptes de trésorerie
  (p_company_id, '521', 'Banques',                                  5, 'actif'),
  (p_company_id, '531', 'Chèques postaux',                          5, 'actif'),
  (p_company_id, '571', 'Caisse',                                   5, 'actif'),
  (p_company_id, '585', 'Virements de fonds internes',              5, 'actif'),

  -- Classe 6 : Comptes de charges
  (p_company_id, '601', 'Achats de marchandises',                  6, 'charge'),
  (p_company_id, '603', 'Variations des stocks de biens achetés',   6, 'charge'),
  (p_company_id, '604', 'Achats stockés de matières et fournitures',6, 'charge'),
  (p_company_id, '605', 'Autres achats',                            6, 'charge'),
  (p_company_id, '611', 'Transports sur achats/ventes',             6, 'charge'),
  (p_company_id, '622', 'Locations',                                6, 'charge'),
  (p_company_id, '624', 'Entretien, réparations',                   6, 'charge'),
  (p_company_id, '625', 'Primes d''assurance',                      6, 'charge'),
  (p_company_id, '627', 'Publicité, communication',                 6, 'charge'),
  (p_company_id, '628', 'Frais de télécommunication',               6, 'charge'),
  (p_company_id, '631', 'Frais bancaires',                          6, 'charge'),
  (p_company_id, '641', 'Impôts et taxes',                          6, 'charge'),
  (p_company_id, '661', 'Rémunérations directes versées au personnel', 6, 'charge'),
  (p_company_id, '664', 'Charges sociales',                         6, 'charge'),
  (p_company_id, '676', 'Pertes de change',                         6, 'charge'),
  (p_company_id, '681', 'Dotations aux amortissements',             6, 'charge'),

  -- Classe 7 : Comptes de produits
  (p_company_id, '701', 'Ventes de marchandises',                   7, 'produit'),
  (p_company_id, '706', 'Services vendus',                          7, 'produit'),
  (p_company_id, '707', 'Produits accessoires',                     7, 'produit'),
  (p_company_id, '758', 'Produits divers',                          7, 'produit'),
  (p_company_id, '771', 'Intérêts et produits financiers',          7, 'produit'),
  (p_company_id, '776', 'Gains de change',                          7, 'produit');
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- FONCTION : seed_default_journals(company_id)
-- Crée les journaux comptables standards pour une entreprise.
-- ----------------------------------------------------------------------------
create or replace function seed_default_journals(p_company_id uuid)
returns void as $$
begin
  insert into journals (company_id, code, label) values
  (p_company_id, 'AC', 'Journal des achats'),
  (p_company_id, 'VE', 'Journal des ventes'),
  (p_company_id, 'BQ', 'Journal de banque'),
  (p_company_id, 'CA', 'Journal de caisse'),
  (p_company_id, 'OD', 'Opérations diverses');
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- UTILISATION (une fois le projet Supabase créé) :
--
-- insert into companies (name, tax_id) values ('Mon entreprise', 'NINEA000000')
--   returning id;   -- récupère l'id retourné, ex: '11111111-...'
--
-- select seed_default_chart_of_accounts('11111111-...');
-- select seed_default_journals('11111111-...');
-- ----------------------------------------------------------------------------
