-- ============================================================================
-- Controle de Documentação – esquema para Supabase (Postgres + Auth)
-- Rode este arquivo inteiro uma vez em: Supabase > SQL Editor > New query > Run.
-- É seguro rodar de novo (usa "if not exists" e "create or replace").
--
-- Modelo: cada EQUIPE (workspace) guarda os dados do sistema em um documento
-- JSON versionado. Pessoas entram na equipe e têm um perfil:
--   admin    – tudo, inclusive gerenciar a equipe
--   editor   – altera os dados
--   consulta – só visualiza e exporta
-- Toda gravação passa por funções (RPC) que checam o perfil e a versão, então
-- o navegador nunca escreve direto nas tabelas.
-- ============================================================================

create table if not exists public.workspaces (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 80),
  invite_code  text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  data         jsonb not null default '{}'::jsonb,
  version      integer not null default 1,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  created_at   timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  email        text not null,
  role         text not null check (role in ('admin', 'editor', 'consulta')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;

-- ---------------------------------------------------------------- helpers
create or replace function public.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = ws and user_id = auth.uid());
$$;

create or replace function public.my_role(ws uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.workspace_members where workspace_id = ws and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------- leitura (RLS)
drop policy if exists "membros leem a equipe" on public.workspace_members;
create policy "membros leem a equipe" on public.workspace_members
  for select to authenticated using (public.is_member(workspace_id));

drop policy if exists "membros leem o workspace" on public.workspaces;
create policy "membros leem o workspace" on public.workspaces
  for select to authenticated using (public.is_member(id));

-- Ninguém escreve direto; o código de convite não é legível pelo navegador.
revoke all on public.workspaces, public.workspace_members from anon, authenticated;
grant select (id, name, data, version, updated_at, updated_by, created_at) on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;

-- ---------------------------------------------------------------- funções (RPC)
create or replace function public.create_workspace(p_name text, p_data jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'nao_autenticado' using errcode = '42501'; end if;
  if p_name is null or char_length(trim(p_name)) = 0 then raise exception 'nome_obrigatorio'; end if;
  if (select count(*) from workspace_members where user_id = auth.uid() and role = 'admin') >= 5 then
    raise exception 'limite_de_equipes';
  end if;
  if octet_length(p_data::text) > 8000000 then raise exception 'dados_grandes'; end if;
  insert into workspaces (name, data, updated_by) values (trim(p_name), coalesce(p_data, '{}'::jsonb), auth.uid())
    returning id into v_id;
  insert into workspace_members (workspace_id, user_id, email, role)
    values (v_id, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), 'admin');
  return v_id;
end $$;

create or replace function public.join_workspace(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'nao_autenticado' using errcode = '42501'; end if;
  select id into v_id from workspaces where invite_code = lower(regexp_replace(coalesce(p_code, ''), '[^0-9a-zA-Z]', '', 'g'));
  if v_id is null then raise exception 'codigo_invalido'; end if;
  insert into workspace_members (workspace_id, user_id, email, role)
    values (v_id, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), 'editor')
    on conflict (workspace_id, user_id) do nothing;
  return v_id;
end $$;

create or replace function public.save_workspace(p_id uuid, p_expected integer, p_data jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_role text; v_new integer;
begin
  select role into v_role from workspace_members where workspace_id = p_id and user_id = auth.uid();
  if v_role is null then raise exception 'sem_acesso' using errcode = '42501'; end if;
  if v_role = 'consulta' then raise exception 'somente_consulta' using errcode = '42501'; end if;
  if octet_length(p_data::text) > 8000000 then raise exception 'dados_grandes'; end if;
  update workspaces
     set data = p_data, version = version + 1, updated_at = now(), updated_by = auth.uid()
   where id = p_id and version = p_expected
  returning version into v_new;
  if v_new is null then raise exception 'conflito_de_versao'; end if;
  return v_new;
end $$;

create or replace function public.get_invite_code(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if public.my_role(p_id) is distinct from 'admin' then raise exception 'somente_admin' using errcode = '42501'; end if;
  select invite_code into v_code from workspaces where id = p_id;
  return v_code;
end $$;

create or replace function public.regenerate_invite_code(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if public.my_role(p_id) is distinct from 'admin' then raise exception 'somente_admin' using errcode = '42501'; end if;
  update workspaces set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
   where id = p_id returning invite_code into v_code;
  return v_code;
end $$;

create or replace function public.set_member_role(p_id uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role(p_id) is distinct from 'admin' then raise exception 'somente_admin' using errcode = '42501'; end if;
  if p_role not in ('admin', 'editor', 'consulta') then raise exception 'perfil_invalido'; end if;
  if p_role <> 'admin'
     and (select role from workspace_members where workspace_id = p_id and user_id = p_user) = 'admin'
     and (select count(*) from workspace_members where workspace_id = p_id and role = 'admin') <= 1 then
    raise exception 'ultimo_admin';
  end if;
  update workspace_members set role = p_role where workspace_id = p_id and user_id = p_user;
end $$;

create or replace function public.remove_member(p_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is distinct from auth.uid() and public.my_role(p_id) is distinct from 'admin' then
    raise exception 'somente_admin' using errcode = '42501';
  end if;
  if (select role from workspace_members where workspace_id = p_id and user_id = p_user) = 'admin'
     and (select count(*) from workspace_members where workspace_id = p_id and role = 'admin') <= 1 then
    raise exception 'ultimo_admin';
  end if;
  delete from workspace_members where workspace_id = p_id and user_id = p_user;
end $$;

create or replace function public.delete_workspace(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role(p_id) is distinct from 'admin' then raise exception 'somente_admin' using errcode = '42501'; end if;
  delete from workspaces where id = p_id;
end $$;

-- Só usuários logados podem chamar as funções (nunca o público anônimo).
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_member(uuid), public.my_role(uuid),
  public.create_workspace(text, jsonb), public.join_workspace(text),
  public.save_workspace(uuid, integer, jsonb), public.get_invite_code(uuid),
  public.regenerate_invite_code(uuid), public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid), public.delete_workspace(uuid)
to authenticated;
