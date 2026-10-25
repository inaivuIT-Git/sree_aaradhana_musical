-- Access rules for online learning. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

-- Act as a signed-in person (or as a visitor with null) for the rest of the transaction.
create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_user is null then '{"role":"anon"}'
         else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true);
$$;

-- People: a teacher, a trial student, a paying student and a student who pays at the school.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'teacher@example.com', '{"full_name":"Teacher"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'trial@example.com', '{"full_name":"Trial Student"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'paid@example.com', '{"full_name":"Paid Student"}'),
  ('00000000-0000-0000-0000-0000000000a4', 'school@example.com', '{}');
update public.profiles set role = 'teacher' where id = '00000000-0000-0000-0000-0000000000a1';

select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'),
  'Trial Student', 'a profile is created from the sign-up name'
);

-- Structure: Movie songs and Carnatic basics, Novice and Beginner.
insert into public.categories (id, name) values
  ('00000000-0000-0000-0000-0000000000c1', 'Test movie songs'),
  ('00000000-0000-0000-0000-0000000000c2', 'Test carnatic basics');
insert into public.levels (id, name) values
  ('00000000-0000-0000-0000-0000000000e1', 'Test novice'),
  ('00000000-0000-0000-0000-0000000000e2', 'Test beginner');
insert into public.courses (id, category_id, level_id, is_published, in_trial) values
  -- Movie songs · Novice: published, in the trial
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', true, true),
  -- Carnatic basics · Novice: published, not in the trial
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1', true, false),
  -- Movie songs · Beginner: not published yet
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e2', false, true);

insert into public.lessons (id, title)
select ('00000000-0000-0000-0000-0000000000b' || n)::uuid, 'Class ' || n from generate_series(1, 9) n;
insert into public.course_lessons (course_id, lesson_id, position)
select '00000000-0000-0000-0000-0000000000d1', ('00000000-0000-0000-0000-0000000000b' || n)::uuid, n
from generate_series(1, 7) n;
insert into public.course_lessons (course_id, lesson_id, position) values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b8', 1),
  -- Class 1 is shared by two courses.
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', 2),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000b9', 1);

insert into public.media (id, kind, title, storage_path) values
  ('00000000-0000-0000-0000-0000000000f1', 'video', 'Class 1 video', 'test/class1.mp4'),
  ('00000000-0000-0000-0000-0000000000f8', 'audio', 'Class 8 audio', 'test/class8.mp3'),
  ('00000000-0000-0000-0000-0000000000f9', 'video', 'Class 9 video', 'test/class9.mp4');
insert into public.lesson_media (lesson_id, media_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000f8'),
  ('00000000-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000f9');
insert into storage.objects (bucket_id, name) values
  ('lesson-media', 'test/class1.mp4'),
  ('lesson-media', 'test/class8.mp3'),
  ('lesson-media', 'test/class9.mp4');

insert into public.plans (id, name, price_paise, duration_days, is_active) values
  ('00000000-0000-0000-0000-000000000011', 'All movie songs', 49900, 30, true),
  ('00000000-0000-0000-0000-000000000012', 'Everything', 99900, 30, true),
  ('00000000-0000-0000-0000-000000000013', 'Old plan', 19900, 30, false);
insert into public.plan_access (plan_id, category_id, level_id) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000c1', null),
  ('00000000-0000-0000-0000-000000000012', null, null),
  ('00000000-0000-0000-0000-000000000013', null, null);

-- Visitors who are not signed in ----------------------------------------------
set local role anon;
select pg_temp.act_as(null);

select is((select count(*)::int from public.courses where id::text like '00000000-0000-0000-0000-0000000000d%'), 2,
  'visitors see published courses only');
select is((select count(*)::int from public.lessons where title like 'Class %'), 8,
  'visitors see classes in published courses only');
select is((select count(*)::int from public.plans where id::text like '00000000-0000-0000-0000-00000000001%'), 2,
  'visitors see active plans only');
select throws_ok($$select * from public.profiles$$, '42501', null, 'visitors cannot read profiles');
select is((public.lesson_access('00000000-0000-0000-0000-0000000000b1') ->> 'access')::boolean, false,
  'visitors cannot open a class');
select is((select count(*)::int from storage.objects where bucket_id = 'lesson-media'), 0,
  'visitors cannot read media files');

-- A new student on the free trial -----------------------------------------------
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');

select is(public.lesson_access('00000000-0000-0000-0000-0000000000b1') ->> 'can_use_trial', 'true',
  'a new student can use the trial on a trial course');
select is(public.my_trial() ->> 'state', 'not_started', 'the trial has not started before the first class');
select is((select count(*)::int from storage.objects where name = 'test/class1.mp4'), 0,
  'media stays locked before the trial class is opened');
select is(public.start_trial_lesson('00000000-0000-0000-0000-0000000000b1') ->> 'via', 'trial',
  'opening a trial class gives access through the trial');
select is((select count(*)::int from storage.objects where name = 'test/class1.mp4'), 1,
  'the opened trial class media can be played');
select is((select count(*)::int from storage.objects where name = 'test/class8.mp3'), 0,
  'other media stays locked');
select is(public.my_trial() ->> 'state', 'active', 'the trial is active after the first class');
select is(public.start_trial_lesson('00000000-0000-0000-0000-0000000000b1') ->> 'via', 'trial',
  'reopening a trial class does not fail');
select is((public.my_trial() ->> 'used')::int, 1, 'reopening a trial class does not use another one');
select is(public.start_trial_lesson('00000000-0000-0000-0000-0000000000b8') ->> 'reason', 'not_in_trial',
  'classes only in non-trial courses cannot be opened on the trial');
select is(public.start_trial_lesson('00000000-0000-0000-0000-0000000000b9') ->> 'reason', 'not_in_trial',
  'classes in unpublished courses cannot be opened on the trial');
select is(public.start_trial_lesson(('00000000-0000-0000-0000-0000000000b' || n)::uuid) ->> 'via', 'trial',
  'trial class ' || n || ' opens')
from generate_series(2, 5) n;
select is(public.my_trial() ->> 'state', 'used_up', 'the trial is used up after five classes');
select is(public.start_trial_lesson('00000000-0000-0000-0000-0000000000b6') ->> 'reason', 'trial_used_up',
  'a sixth trial class does not open');
select is(public.lesson_access_via('00000000-0000-0000-0000-0000000000b3'), 'trial',
  'opened trial classes stay open until the trial days run out');

select throws_ok(
  $$insert into public.trial_unlocks (user_id, lesson_id) values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b7')$$,
  '42501', null, 'students cannot add trial classes themselves');
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a2'$$,
  '42501', null, 'students cannot make themselves teachers or admins');
select throws_ok(
  $$update public.profiles set trial_started_at = now() where id = '00000000-0000-0000-0000-0000000000a2'$$,
  '42501', null, 'students cannot restart their trial');
select lives_ok(
  $$update public.profiles set full_name = 'Renamed' where id = '00000000-0000-0000-0000-0000000000a2'$$,
  'students can change their name');
select is((select count(*)::int from public.profiles), 1, 'students see only their own profile');
select throws_ok($$select public.record_payment('x', 'y', 1)$$, '42501', null,
  'students cannot record payments');
select throws_ok(
  $$select public.grant_plan('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000012', 30, '')$$,
  '42501', null, 'students cannot give themselves a plan');
select throws_ok(
  $$insert into public.lessons (title) values ('Mine')$$, '42501', null, 'students cannot add classes');
select throws_ok($$select * from public.staff_students()$$, '42501', null, 'students cannot list students');
select throws_ok(
  $$insert into public.lesson_progress (lesson_id, completed_at) values ('00000000-0000-0000-0000-0000000000b8', now())$$,
  '42501', null, 'students cannot record progress on locked classes');
select lives_ok(
  $$insert into public.lesson_progress (lesson_id, completed_at) values ('00000000-0000-0000-0000-0000000000b1', now())$$,
  'students can record progress on open classes');

-- The trial ends after its days even with classes left.
reset role;
update public.profiles set trial_started_at = now() - interval '8 days'
  where id = '00000000-0000-0000-0000-0000000000a2';
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select is(public.my_trial() ->> 'state', 'ended', 'the trial ends after seven days');
select is(public.lesson_access_via('00000000-0000-0000-0000-0000000000b1'), null,
  'trial classes close when the trial ends');
select is((select count(*)::int from storage.objects where name = 'test/class1.mp4'), 0,
  'trial media closes when the trial ends');
select is(public.start_trial_lesson('00000000-0000-0000-0000-0000000000b7') ->> 'reason', 'trial_ended',
  'no new trial classes after the trial ends');

-- A student who pays online -------------------------------------------------------
reset role;
insert into public.payments (user_id, plan_id, amount_paise, duration_days, razorpay_order_id) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000011', 49900, 30, 'order_test_1'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000011', 49900, 30, 'order_test_2'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000012', 99900, 30, 'order_test_3');
set local role service_role;
select isnt(public.record_payment('order_test_1', 'pay_test_1', 49900), null, 'a confirmed payment opens the plan');
select is(public.record_payment('order_test_1', 'pay_test_1', 49900),
  (select id from public.subscriptions where payment_id = (select id from public.payments where razorpay_order_id = 'order_test_1')),
  'recording the same payment twice is harmless');
select is((select count(*)::int from public.subscriptions where user_id = '00000000-0000-0000-0000-0000000000a3'), 1,
  'a payment recorded twice gives one period');
select throws_ok($$select public.record_payment('order_test_3', 'pay_test_3', 100)$$, '22023', null,
  'a payment for the wrong amount is refused');
select throws_ok($$select public.record_payment('order_unknown', 'pay_x', 100)$$, 'P0002', null,
  'a payment for an unknown order is refused');
select lives_ok($$select public.record_payment('order_test_2', 'pay_test_2', 49900)$$, 'renewing early is accepted');
select is(
  (select starts_at from public.subscriptions s join public.payments p on p.id = s.payment_id where p.razorpay_order_id = 'order_test_2'),
  (select ends_at from public.subscriptions s join public.payments p on p.id = s.payment_id where p.razorpay_order_id = 'order_test_1'),
  'an early renewal starts when the current period ends');

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is(public.lesson_access_via('00000000-0000-0000-0000-0000000000b7'), 'plan',
  'the movie songs plan opens movie songs classes');
select is(public.lesson_access_via('00000000-0000-0000-0000-0000000000b1'), 'plan',
  'a shared class opens through any covered course');
select is(public.lesson_access_via('00000000-0000-0000-0000-0000000000b8'), null,
  'the movie songs plan does not open Carnatic basics');
select is(public.lesson_access_via('00000000-0000-0000-0000-0000000000b9'), null,
  'plans do not open unpublished courses');
select is((select count(*)::int from storage.objects where bucket_id = 'lesson-media' and name like 'test/%'), 1,
  'the paying student reads only the media of covered classes');
select is((select count(*)::int from public.payments), 3, 'students see their own payments');
select is((select count(*)::int from public.trial_unlocks), 0, 'students do not see other students'' trial classes');
select is((select count(*)::int from public.plans where id = '00000000-0000-0000-0000-000000000013'), 0,
  'students do not see hidden plans they never had');
reset role;
insert into public.subscriptions (user_id, plan_id, starts_at, ends_at, source) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000013',
   now() - interval '60 days', now() - interval '30 days', 'manual');
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.plans where id = '00000000-0000-0000-0000-000000000013'), 1,
  'students still see the name of a hidden plan they had');

-- A student who pays at the school, and the teacher's tools -------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.courses where id::text like '00000000-0000-0000-0000-0000000000d%'), 3,
  'teachers see unpublished courses');
select is((select count(*)::int from storage.objects where bucket_id = 'lesson-media' and name like 'test/%'), 3,
  'teachers read all media');
select ok((select count(*) from public.staff_students()) >= 4, 'teachers can list students');
select lives_ok($$insert into public.lessons (title) values ('New class')$$, 'teachers can add classes');
select lives_ok(
  $$select public.grant_plan('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000012', 30, 'Paid in cash')$$,
  'teachers can give a plan to a student who paid at the school');
select throws_ok(
  $$select public.set_user_role('00000000-0000-0000-0000-0000000000a4', 'teacher')$$,
  '42501', null, 'teachers cannot change roles');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select is(public.lesson_access_via('00000000-0000-0000-0000-0000000000b8'), 'plan',
  'a plan given by the teacher opens its classes');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$select public.end_subscription(id) from public.subscriptions where user_id = '00000000-0000-0000-0000-0000000000a4'$$,
  'teachers can end a plan');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select is(public.lesson_access_via('00000000-0000-0000-0000-0000000000b8'), null, 'an ended plan closes its classes');

-- Admins ----------------------------------------------------------------------------
reset role;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.set_user_role('00000000-0000-0000-0000-0000000000a4', 'teacher')$$,
  'admins can make someone a teacher');
select throws_ok($$select public.set_user_role('00000000-0000-0000-0000-0000000000a1', 'student')$$,
  '42501', null, 'admins cannot remove their own admin role');

reset role;
select * from finish();
rollback;
