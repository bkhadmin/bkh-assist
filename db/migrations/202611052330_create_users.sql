-- Users who sign in with PLK Health ID (SSO). Same shape as bkh-insight's users table
-- (its 4 migrations folded into one). The super user from .env has no row here.
create table users (
  id bigint generated always as identity primary key,
  provider_id text not null unique,                 -- OIDC sub
  pname text,
  fname text not null,
  lname text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  permission jsonb not null default '{}'::jsonb,
  is_approve boolean not null default false,        -- new SSO users wait for an admin
  log jsonb not null default '[]'::jsonb,
  profile jsonb not null default '{}'::jsonb,       -- all userinfo claims, replaced on every sign-in; DB only
  job_position text,
  organizations jsonb not null default '[]'::jsonb  -- [{org_code, org_name, job_position}]
);
