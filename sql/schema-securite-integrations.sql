-- ============================================================================
-- SÉCURITÉ, SESSIONS, API, WEBHOOKS — Tables manquantes
-- Dépend de schema.sql
-- ============================================================================

-- 1. SESSIONS UTILISATEUR
create table user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token text not null unique,
  ip_address text,
  user_agent text,
  device_name text,
  is_active boolean default true,
  last_activity_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
create index idx_sessions_user on user_sessions(user_id);
create index idx_sessions_token on user_sessions(token);

-- 2. AUDIT DE SÉCURITÉ
create table security_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  user_id uuid,
  action text not null,
  ip_address text,
  user_agent text,
  details jsonb,
  severity text check (severity in ('info','warning','critical')),
  created_at timestamptz default now()
);
create index idx_security_audit_action on security_audit(action);
create index idx_security_audit_time on security_audit(created_at desc);

-- 3. SAUVEGARDES
create table backup_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  type text check (type in ('automatic','manual','pre_migration')),
  status text check (status in ('running','completed','failed')),
  file_url text,
  size_bytes bigint,
  checksum text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz default now()
);

-- 4. CLÉS API (pour développeurs tiers)
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  key_prefix text not null,              -- Les 8 premiers caractères (pour identification)
  key_hash text not null,                -- Hash SHA-256 de la clé complète
  name text not null,
  permissions jsonb default '[]',        -- ex: ['read:entries', 'write:invoices']
  allowed_ips text[],                    -- Restrictions IP (optionnel)
  last_used_at timestamptz,
  expires_at timestamptz,
  active boolean default true,
  created_by text,
  created_at timestamptz default now()
);
create index idx_api_keys_company on api_keys(company_id);
create index idx_api_keys_prefix on api_keys(key_prefix);

-- 5. WEBHOOKS
create table webhooks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  url text not null,
  events text[] not null,                -- ['invoice.created', 'payment.received', 'entry.created']
  secret text,                           -- Secret pour signer les payloads
  headers jsonb default '{}',            -- En-têtes personnalisés
  retry_count int default 3,
  timeout_ms int default 5000,
  active boolean default true,
  last_triggered_at timestamptz,
  last_error text,
  created_at timestamptz default now()
);

create table webhook_logs (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references webhooks(id) on delete cascade,
  event text not null,
  payload jsonb,
  response_status int,
  response_body text,
  success boolean not null,
  duration_ms int,
  attempted_at timestamptz default now()
);
create index idx_webhook_logs_webhook on webhook_logs(webhook_id);

-- 6. NOTIFICATIONS
create table notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid,
  type text not null check (type in ('info','warning','success','error','task')),
  title text not null,
  body text,
  link text,                              -- Lien vers la ressource concernée
  is_read boolean default false,
  read_at timestamptz,
  created_at timestamptz default now()
);
create index idx_notifications_user on notifications(user_id, is_read);
create index idx_notifications_time on notifications(created_at desc);

-- 7. PRÉFÉRENCES UTILISATEUR
create table user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  language text default 'fr',
  theme text check (theme in ('light','dark','system')) default 'system',
  timezone text default 'Africa/Dakar',
  date_format text default 'DD/MM/YYYY',
  number_format text default 'fr-FR',
  keyboard_shortcuts jsonb default '{}',
  notification_preferences jsonb default '{"email": true, "in_app": true, "sms": false}',
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 8. PÉRIODES DE TRAVAIL (Calendrier comptable)
create table work_calendar (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  status text check (status in ('open','locked','closed')) default 'open',
  locked_by text,
  locked_at timestamptz,
  unlocked_by text,
  unlocked_at timestamptz,
  notes text,
  unique (company_id, year, month)
);