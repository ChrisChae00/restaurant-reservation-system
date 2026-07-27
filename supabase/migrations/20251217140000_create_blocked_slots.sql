create table if not exists public.blocked_slots (
  id uuid not null default gen_random_uuid(),
  date date not null,
  slot_id text not null,
  reason text,
  created_at timestamp with time zone not null default now(),
  constraint blocked_slots_pkey primary key (id),
  constraint blocked_slots_date_slot_id_key unique (date, slot_id)
);

alter table public.blocked_slots enable row level security;

-- Policies
create policy "Admins can manage blocked slots"
on public.blocked_slots
for all
to authenticated
using (true)
with check (true);

create policy "Anyone can see blocked slots"
on public.blocked_slots
for select
to anon
using (true);

create policy "Authenticated can read blocked slots"
on public.blocked_slots
for select
to authenticated
using (true);
