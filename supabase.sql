-- Ejecuta este archivo en Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.canciones (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  titulo text not null,
  letra text not null,
  youtube text not null default '',
  inicio integer not null default 0 check (inicio >= 0),
  categoria text not null default '',
  orden integer not null default 0,
  destacada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.canciones enable row level security;

-- Todos pueden leer el cancionero.
create policy "Lectura pública de canciones"
on public.canciones for select
to anon, authenticated
using (true);

-- Solamente usuarios autenticados pueden administrar.
create policy "Usuarios autenticados insertan canciones"
on public.canciones for insert
to authenticated
with check (true);

create policy "Usuarios autenticados actualizan canciones"
on public.canciones for update
to authenticated
using (true)
with check (true);

create policy "Usuarios autenticados eliminan canciones"
on public.canciones for delete
to authenticated
using (true);

-- IMPORTANTE: crea únicamente tu usuario en Authentication > Users.
-- Si luego agregas más usuarios, también podrán editar. Para limitarlo a un solo
-- correo, reemplaza (true) en las políticas de escritura por:
-- (auth.jwt() ->> 'email' = 'TU_CORREO@EJEMPLO.COM')
