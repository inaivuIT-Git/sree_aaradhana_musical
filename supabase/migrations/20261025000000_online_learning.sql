-- Sree Aaradhana online learning.
--
-- Classes (lessons) are built from a shared library of uploaded videos and
-- audio. Each course is one category at one level (for example "Movie songs ·
-- Beginner"), and the same class can sit in any number of courses, so the
-- teacher can rearrange the material without uploading it again.
--
-- Price plans cover categories and/or levels. Every new student gets a free
-- trial: a number of classes within a number of days, whichever runs out first.
--
-- Access is enforced here, not in the browser:
--   * teachers and admins ("staff") manage everything;
--   * anyone can browse published courses and active plans;
--   * class videos and audio can only be read by staff, by students whose plan
--     covers a published course containing the class, or by students who
--     opened the class during their free trial.

-- People ---------------------------------------------------------------------

create type public.app_role as enum ('student', 'teacher', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text not null default '' check (char_length(phone) <= 20),
  role public.app_role not null default 'student',
  trial_started_at timestamptz,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120),
    left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 20)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts that existed before this migration.
insert into public.profiles (id, full_name)
select id, left(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', ''), 120)
from auth.users
on conflict (id) do nothing;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'admin')
  );
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Trial settings (a single row) ----------------------------------------------

create table public.app_settings (
  id boolean primary key default true check (id),
  trial_days int not null default 7 check (trial_days between 1 and 60),
  trial_lessons int not null default 5 check (trial_lessons between 1 and 50),
  updated_at timestamptz not null default now()
);

insert into public.app_settings default values;

-- Catalogue ------------------------------------------------------------------

create table public.levels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 500),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  level_id uuid not null references public.levels (id) on delete restrict,
  title text not null default '' check (char_length(title) <= 120),
  description text not null default '' check (char_length(description) <= 2000),
  is_published boolean not null default false,
  in_trial boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category_id, level_id)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  created_at timestamptz not null default now()
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('video', 'audio')),
  title text not null check (char_length(title) between 1 and 160),
  storage_path text not null unique check (char_length(storage_path) <= 400),
  mime_type text not null default '' check (char_length(mime_type) <= 100),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  duration_seconds int check (duration_seconds >= 0),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.lesson_media (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  media_id uuid not null references public.media (id) on delete cascade,
  position int not null default 0,
  primary key (lesson_id, media_id)
);

create index lesson_media_media_idx on public.lesson_media (media_id);

create table public.course_lessons (
  course_id uuid not null references public.courses (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  position int not null default 0,
  primary key (course_id, lesson_id)
);

create index course_lessons_lesson_idx on public.course_lessons (lesson_id);

-- Plans and payments ---------------------------------------------------------

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  -- Razorpay works in paise: ₹499 is 49900.
  price_paise int not null check (price_paise between 100 and 10000000),
  duration_days int not null check (duration_days between 1 and 730),
  is_active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- What a plan opens. An empty category means every category and an empty level
-- means every level, so (Movie songs, empty) is all movie songs and
-- (empty, empty) is everything.
create table public.plan_access (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  category_id uuid references public.categories (id) on delete cascade,
  level_id uuid references public.levels (id) on delete cascade,
  unique nulls not distinct (plan_id, category_id, level_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete restrict,
  amount_paise int not null check (amount_paise > 0),
  currency text not null default 'INR',
  -- Copied from the plan when the order is created, so a later price or
  -- duration change does not alter what the student paid for.
  duration_days int not null check (duration_days > 0),
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  status text not null default 'created' check (status in ('created', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index payments_user_idx on public.payments (user_id);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null check (source in ('razorpay', 'manual')),
  payment_id uuid unique references public.payments (id) on delete set null,
  note text not null default '' check (char_length(note) <= 300),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create index subscriptions_user_idx on public.subscriptions (user_id, ends_at);

-- Trial and progress ---------------------------------------------------------

create table public.trial_unlocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table public.lesson_progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- Access rules ---------------------------------------------------------------

create function public.lesson_is_published(p_lesson uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.course_lessons cl
    join public.courses c on c.id = cl.course_id
    where cl.lesson_id = p_lesson and c.is_published
  );
$$;

-- Published courses the signed-in student's current plans cover.
create function public.my_plan_courses() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct c.id
  from public.courses c
  join public.plan_access pa
    on (pa.category_id is null or pa.category_id = c.category_id)
   and (pa.level_id is null or pa.level_id = c.level_id)
  join public.subscriptions s
    on s.plan_id = pa.plan_id
   and s.user_id = auth.uid()
   and s.starts_at <= now() and now() < s.ends_at
  where c.is_published;
$$;

create function public.trial_ends_at(p_started timestamptz) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select p_started + make_interval(days => s.trial_days) from public.app_settings s;
$$;

-- How the signed-in person may open a class: 'staff', 'plan', 'trial' or null.
create function public.lesson_access_via(p_lesson uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then null
    when public.is_staff() then 'staff'
    when exists (
      select 1 from public.course_lessons cl
      where cl.lesson_id = p_lesson
        and cl.course_id in (select public.my_plan_courses())
    ) then 'plan'
    when public.lesson_is_published(p_lesson) and exists (
      select 1
      from public.trial_unlocks t
      join public.profiles p on p.id = t.user_id
      where t.user_id = auth.uid() and t.lesson_id = p_lesson
        and now() < public.trial_ends_at(p.trial_started_at)
    ) then 'trial'
  end;
$$;

-- Whether the signed-in student has ever had this plan (so they still see its name once it is hidden).
create function public.holds_plan(p_plan uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.subscriptions where plan_id = p_plan and user_id = auth.uid());
$$;

create function public.can_read_media_object(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff() or exists (
    select 1
    from public.media m
    join public.lesson_media lm on lm.media_id = m.id
    where m.storage_path = p_path
      and public.lesson_access_via(lm.lesson_id) is not null
  );
$$;

-- The signed-in student's trial: state is not_started, active, used_up or ended.
create function public.my_trial() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  settings public.app_settings;
  started timestamptz;
  ends timestamptz;
  used int := 0;
  unlocked jsonb := '[]'::jsonb;
  state text := 'not_started';
begin
  select * into settings from public.app_settings;
  if auth.uid() is not null then
    select trial_started_at into started from public.profiles where id = auth.uid();
    select count(*), coalesce(jsonb_agg(lesson_id), '[]'::jsonb)
      into used, unlocked
      from public.trial_unlocks where user_id = auth.uid();
  end if;
  if started is not null then
    ends := started + make_interval(days => settings.trial_days);
    state := case
      when now() >= ends then 'ended'
      when used >= settings.trial_lessons then 'used_up'
      else 'active'
    end;
  end if;
  return jsonb_build_object(
    'state', state,
    'days', settings.trial_days,
    'lessons', settings.trial_lessons,
    'used', used,
    'started_at', started,
    'ends_at', ends,
    'unlocked', case when state in ('ended') then '[]'::jsonb else unlocked end
  );
end;
$$;

-- What the class page needs to know before it shows anything.
create function public.lesson_access(p_lesson uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  via text := public.lesson_access_via(p_lesson);
  trial jsonb := public.my_trial();
  trial_course boolean;
begin
  select exists (
    select 1 from public.course_lessons cl
    join public.courses c on c.id = cl.course_id
    where cl.lesson_id = p_lesson and c.is_published and c.in_trial
  ) into trial_course;
  return jsonb_build_object(
    'access', via is not null,
    'via', via,
    'signed_in', auth.uid() is not null,
    'can_use_trial', via is null and auth.uid() is not null and trial_course
      and trial ->> 'state' in ('not_started', 'active'),
    'trial', trial
  );
end;
$$;

-- Spend one free-trial class on this lesson. The first one starts the trial clock.
create function public.start_trial_lesson(p_lesson uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  settings public.app_settings;
  started timestamptz;
  used int;
begin
  if uid is null then
    return jsonb_build_object('access', false, 'reason', 'sign_in');
  end if;
  if public.lesson_access_via(p_lesson) is not null then
    return public.lesson_access(p_lesson);
  end if;
  if not exists (
    select 1 from public.course_lessons cl
    join public.courses c on c.id = cl.course_id
    where cl.lesson_id = p_lesson and c.is_published and c.in_trial
  ) then
    return jsonb_build_object('access', false, 'reason', 'not_in_trial');
  end if;

  select * into settings from public.app_settings;
  -- Lock the profile so two tabs cannot both take the last trial class.
  select trial_started_at into started from public.profiles where id = uid for update;
  if started is null then
    started := now();
    update public.profiles set trial_started_at = started where id = uid;
  end if;
  if now() >= started + make_interval(days => settings.trial_days) then
    return jsonb_build_object('access', false, 'reason', 'trial_ended');
  end if;
  select count(*) into used from public.trial_unlocks where user_id = uid;
  if used >= settings.trial_lessons then
    return jsonb_build_object('access', false, 'reason', 'trial_used_up');
  end if;

  insert into public.trial_unlocks (user_id, lesson_id) values (uid, p_lesson);
  return public.lesson_access(p_lesson);
end;
$$;

-- Subscriptions ---------------------------------------------------------------

-- Adds a period of a plan. A renewal before the current period ends starts
-- when that period ends, so nobody loses days by renewing early.
create function public.add_subscription(
  p_user uuid, p_plan uuid, p_days int, p_source text,
  p_payment uuid, p_note text, p_granted_by uuid
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  start_at timestamptz;
  new_id uuid;
begin
  select greatest(now(), coalesce(max(ends_at), now())) into start_at
    from public.subscriptions
    where user_id = p_user and plan_id = p_plan and ends_at > now();
  insert into public.subscriptions
    (user_id, plan_id, starts_at, ends_at, source, payment_id, note, granted_by)
  values
    (p_user, p_plan, start_at, start_at + make_interval(days => p_days),
     p_source, p_payment, coalesce(p_note, ''), p_granted_by)
  returning id into new_id;
  return new_id;
end;
$$;

-- Called by the payment functions (service role only) once Razorpay confirms
-- a payment. Safe to call twice for the same order.
create function public.record_payment(p_order_id text, p_payment_id text, p_amount_paise int)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  pay public.payments;
  sub_id uuid;
begin
  select * into pay from public.payments where razorpay_order_id = p_order_id for update;
  if not found then
    raise exception 'Unknown Razorpay order %', p_order_id using errcode = 'P0002';
  end if;
  if pay.status = 'paid' then
    select id into sub_id from public.subscriptions where payment_id = pay.id;
    return sub_id;
  end if;
  if p_amount_paise is distinct from pay.amount_paise then
    raise exception 'Payment amount % does not match order amount %', p_amount_paise, pay.amount_paise
      using errcode = '22023';
  end if;
  update public.payments
    set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now()
    where id = pay.id;
  return public.add_subscription(
    pay.user_id, pay.plan_id, pay.duration_days, 'razorpay', pay.id, '', null
  );
end;
$$;

-- Staff tools -----------------------------------------------------------------

-- For students who pay at the school, or for complimentary access.
create function public.grant_plan(p_user uuid, p_plan uuid, p_days int, p_note text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Only teachers can give access' using errcode = '42501';
  end if;
  if p_days is null or p_days not between 1 and 730 then
    raise exception 'Days must be between 1 and 730' using errcode = '22023';
  end if;
  if not exists (select 1 from public.plans where id = p_plan) then
    raise exception 'Unknown plan' using errcode = 'P0002';
  end if;
  return public.add_subscription(p_user, p_plan, p_days, 'manual', null, p_note, auth.uid());
end;
$$;

create function public.end_subscription(p_subscription uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Only teachers can end access' using errcode = '42501';
  end if;
  update public.subscriptions
    set ends_at = greatest(starts_at, now())
    where id = p_subscription and ends_at > now();
end;
$$;

create function public.set_user_role(p_user uuid, p_role public.app_role) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change roles' using errcode = '42501';
  end if;
  if p_user = auth.uid() and p_role <> 'admin' then
    raise exception 'You cannot remove your own admin role' using errcode = '42501';
  end if;
  update public.profiles set role = p_role where id = p_user;
end;
$$;

create function public.staff_students() returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  role public.app_role,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  trial_started_at timestamptz,
  trial_used bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Only teachers can list students' using errcode = '42501';
  end if;
  return query
    select p.id, u.email::text, p.full_name, p.phone, p.role, p.created_at,
           u.last_sign_in_at, p.trial_started_at,
           (select count(*) from public.trial_unlocks t where t.user_id = p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;

-- Privileges ----------------------------------------------------------------------
-- Granted explicitly so the site works whether or not the project exposes new
-- tables to the API automatically. Row level security (below) then decides
-- which rows each person can read or change.

grant select on public.app_settings, public.levels, public.categories, public.courses, public.lessons,
  public.media, public.lesson_media, public.course_lessons, public.plans, public.plan_access
  to anon, authenticated;
grant insert, update, delete on public.levels, public.categories, public.courses, public.lessons,
  public.media, public.lesson_media, public.course_lessons, public.plans, public.plan_access
  to authenticated;
grant update on public.app_settings to authenticated;
grant select on public.profiles, public.payments, public.subscriptions, public.trial_unlocks
  to authenticated;
grant select, insert, update, delete on public.lesson_progress to authenticated;
grant all on all tables in schema public to service_role;
-- Visitors who are not signed in get nothing from the private tables.
revoke all on public.profiles, public.payments, public.subscriptions, public.trial_unlocks,
  public.lesson_progress from anon;

-- Used by the access rules and the pages.
grant execute on function public.is_staff(), public.is_admin(), public.lesson_is_published(uuid),
  public.my_plan_courses(), public.trial_ends_at(timestamptz), public.lesson_access_via(uuid),
  public.can_read_media_object(text), public.my_trial(), public.lesson_access(uuid), public.holds_plan(uuid)
  to anon, authenticated;
-- Each checks inside who may use it.
grant execute on function public.start_trial_lesson(uuid), public.grant_plan(uuid, uuid, int, text),
  public.end_subscription(uuid), public.set_user_role(uuid, public.app_role), public.staff_students()
  to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.add_subscription(uuid, uuid, int, text, uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.record_payment(text, text, int) from public, anon, authenticated;
grant execute on function public.record_payment(text, text, int) to service_role;

-- Row level security -------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.levels enable row level security;
alter table public.categories enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.media enable row level security;
alter table public.lesson_media enable row level security;
alter table public.course_lessons enable row level security;
alter table public.plans enable row level security;
alter table public.plan_access enable row level security;
alter table public.payments enable row level security;
alter table public.subscriptions enable row level security;
alter table public.trial_unlocks enable row level security;
alter table public.lesson_progress enable row level security;

-- Profiles: people read and edit their own name and phone; staff read everyone.
-- Role and trial dates only change through the functions above.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
create policy "Read own profile, staff read all" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "Edit own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "Anyone reads trial settings" on public.app_settings
  for select using (true);
create policy "Staff edit trial settings" on public.app_settings
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Anyone reads levels" on public.levels for select using (true);
create policy "Staff manage levels" on public.levels
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Anyone reads categories" on public.categories for select using (true);
create policy "Staff manage categories" on public.categories
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Anyone reads published courses" on public.courses
  for select using (is_published or public.is_staff());
create policy "Staff manage courses" on public.courses
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Anyone reads published classes" on public.lessons
  for select using (public.lesson_is_published(id) or public.is_staff());
create policy "Staff manage classes" on public.lessons
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Anyone reads course contents" on public.course_lessons
  for select using (
    public.is_staff()
    or exists (select 1 from public.courses c where c.id = course_lessons.course_id and c.is_published)
  );
create policy "Staff arrange courses" on public.course_lessons
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Titles and lengths of the media in published classes are visible so a locked
-- class can say what it contains. The files themselves are protected below.
create policy "Anyone reads media details of published classes" on public.media
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.lesson_media lm
      where lm.media_id = media.id and public.lesson_is_published(lm.lesson_id)
    )
  );
create policy "Staff manage media" on public.media
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Anyone reads class contents" on public.lesson_media
  for select using (public.is_staff() or public.lesson_is_published(lesson_id));
create policy "Staff arrange class contents" on public.lesson_media
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Anyone reads active plans" on public.plans
  for select using (
    is_active
    or public.is_staff()
    or public.holds_plan(id)
  );
create policy "Staff manage plans" on public.plans
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Anyone reads what plans include" on public.plan_access for select using (true);
create policy "Staff manage what plans include" on public.plan_access
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Payments, subscriptions and trial classes are written only by the functions above.
revoke insert, update, delete on public.payments, public.subscriptions, public.trial_unlocks
  from anon, authenticated;
create policy "Read own payments, staff read all" on public.payments
  for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy "Read own subscriptions, staff read all" on public.subscriptions
  for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy "Read own trial classes, staff read all" on public.trial_unlocks
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

create policy "Read own progress" on public.lesson_progress
  for select to authenticated using (user_id = auth.uid());
create policy "Record progress on open classes" on public.lesson_progress
  for insert to authenticated
  with check (user_id = auth.uid() and public.lesson_access_via(lesson_id) is not null);
create policy "Update own progress" on public.lesson_progress
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.lesson_access_via(lesson_id) is not null);
create policy "Clear own progress" on public.lesson_progress
  for delete to authenticated using (user_id = auth.uid());

-- Media files ------------------------------------------------------------------

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('lesson-media', 'lesson-media', false, array['video/*', 'audio/*'])
on conflict (id) do nothing;

create policy "lesson-media: open classes can be played" on storage.objects
  for select to authenticated
  using (bucket_id = 'lesson-media' and public.can_read_media_object(name));
create policy "lesson-media: staff upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'lesson-media' and public.is_staff());
create policy "lesson-media: staff replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'lesson-media' and public.is_staff())
  with check (bucket_id = 'lesson-media' and public.is_staff());
create policy "lesson-media: staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'lesson-media' and public.is_staff());

-- Starting structure (the teacher can rename, reorder or remove these) ----------

insert into public.levels (name, description, position) values
  ('Novice', 'First steps: finding your shruti, breathing and holding a note.', 1),
  ('Beginner', 'Basic swaras and simple songs sung in tune and in rhythm.', 2),
  ('Intermediate', 'Longer songs, gamakas and faster speeds.', 3),
  ('Advanced', 'Full compositions, expression and performance.', 4);

insert into public.categories (name, description, position) values
  ('Movie songs', 'Start with film songs you already love.', 1),
  ('Carnatic basics (Sarali varisai)', 'The traditional path: sarali, janta and alankaram exercises.', 2),
  ('Devotional songs', 'Bhajans and devotional songs.', 3),
  ('Classic Carnatic songs', 'Traditional Carnatic compositions.', 4);
