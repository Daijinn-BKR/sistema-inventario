-- Sistema de inventario · Omega Eléctrica
-- Pegar completo en Supabase → SQL Editor → Run

-- ============ TABLAS ============
create table if not exists productos (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,          -- el texto del QR / código de barras
  nombre        text not null,
  categoria     text,
  ubicacion     text,                          -- estante, bodega, etc.
  unidad        text not null default 'un',
  stock         numeric not null default 0 constraint productos_stock_check check (stock >= 0),
  stock_minimo  numeric not null default 0,
  activo        boolean not null default true, -- en vez de borrar, se desactiva
  creado_en     timestamptz not null default now()
);

create table if not exists movimientos (
  id           bigint generated always as identity primary key,
  producto_id  uuid not null references productos(id) on delete cascade,
  tipo         text not null check (tipo in ('entrada', 'salida')),
  cantidad     numeric not null check (cantidad > 0),
  motivo       text,
  usuario      text default (auth.jwt() ->> 'email'),
  creado_en    timestamptz not null default now()
);

create index if not exists movimientos_producto_idx on movimientos (producto_id, creado_en desc);
create index if not exists movimientos_fecha_idx on movimientos (creado_en desc);

-- ============ STOCK AUTOMÁTICO ============
-- Cada movimiento actualiza el stock en la misma operación (sin errores
-- aunque dos personas registren al mismo tiempo). Si una salida deja el
-- stock bajo cero, la operación completa se rechaza.
create or replace function aplicar_movimiento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'entrada' then
    update productos set stock = stock + new.cantidad where id = new.producto_id;
  else
    update productos set stock = stock - new.cantidad where id = new.producto_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_aplicar_movimiento on movimientos;
create trigger trg_aplicar_movimiento
  after insert on movimientos
  for each row execute function aplicar_movimiento();

-- ============ SEGURIDAD ============
-- Solo usuarios con sesión iniciada pueden leer y escribir.
alter table productos   enable row level security;
alter table movimientos enable row level security;

drop policy if exists "productos_leer"      on productos;
drop policy if exists "productos_crear"     on productos;
drop policy if exists "productos_editar"    on productos;
drop policy if exists "movimientos_leer"    on movimientos;
drop policy if exists "movimientos_crear"   on movimientos;

create policy "productos_leer"    on productos   for select to authenticated using (true);
create policy "productos_crear"   on productos   for insert to authenticated with check (true);
create policy "productos_editar"  on productos   for update to authenticated using (true) with check (true);
create policy "movimientos_leer"  on movimientos for select to authenticated using (true);
create policy "movimientos_crear" on movimientos for insert to authenticated with check (true);
-- (no hay política de borrado: nadie puede borrar historial desde la app)

-- ============ TIEMPO REAL ============
-- Para que los cambios aparezcan al instante en todos los dispositivos.
do $$ begin
  alter publication supabase_realtime add table productos;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table movimientos;
exception when duplicate_object then null; end $$;
