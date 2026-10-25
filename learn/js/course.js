import {
  $, fill, formatDate, formatDuration, h, initPage, linkButton, must, notice, param, plural, sb, showFailure,
  trialAvailable,
} from './app.js';

const main = $('#course');
const access = await initPage({ main });
if (access) load().catch((error) => showFailure(main, error));

async function load() {
  const id = param('id') ?? '';
  const course = /^[0-9a-f-]{36}$/i.test(id) ? await sb.from('courses')
    .select(`id, title, description, in_trial, is_published, categories(name), levels(name),
      course_lessons(position, lessons(id, title, lesson_media(media(kind, duration_seconds))))`)
    .eq('id', id)
    .maybeSingle()
    .then(must) : null;
  if (!course) {
    main.replaceChildren(notice({
      title: 'This course is not available.',
      text: 'It may have been moved or is not open yet.',
      actions: [linkButton('See all courses', './#paths')],
    }));
    return;
  }

  const lessons = course.course_lessons
    .sort((a, b) => a.position - b.position)
    .map((row) => row.lessons)
    .filter(Boolean);
  const done = new Set();
  if (access.user && lessons.length) {
    const rows = must(await sb.from('lesson_progress')
      .select('lesson_id, completed_at')
      .in('lesson_id', lessons.map((l) => l.id)));
    rows.filter((r) => r.completed_at).forEach((r) => done.add(r.lesson_id));
  }

  const name = course.title || `${course.categories?.name} · ${course.levels?.name}`;
  document.title = `${name} | Sree Aaradhana online classes`;

  fill(main,
    h('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' },
      h('a', { href: './' }, 'Learn online'), h('span', { 'aria-hidden': 'true' }, '/'),
      h('span', null, course.categories?.name ?? ''), h('span', { 'aria-hidden': 'true' }, '/'),
      h('span', null, course.levels?.name ?? '')),
    h('div', { class: 'course-head' },
      h('div', null,
        h('p', { class: 'eyebrow' }, course.title ? `${course.categories?.name} · ${course.levels?.name}` : 'Online course'),
        h('h1', null, name),
        course.description && h('p', null, course.description)),
      h('span', { class: 'muted small' }, `${plural(lessons.length, 'class', 'classes')}${done.size ? ` · ${done.size} done` : ''}`)),
    courseNotice(course),
    h('div', { class: 'spacer' }),
    lessons.length
      ? h('ol', { class: 'class-list' }, lessons.map((lesson, i) => classRow(course, lesson, i, done)))
      : h('p', { class: 'empty' }, 'Classes will appear here soon.'),
  );
}

function covers(course, lesson) {
  return access.isStaff || access.planCourseIds.has(course.id) || access.planLessonIds.has(lesson.id);
}

function courseNotice(course) {
  const { user, trial, isStaff } = access;
  if (isStaff) {
    return course.is_published ? null : notice({
      kind: 'warn',
      title: 'Not published yet.',
      text: 'Only teachers can see this course. Publish it in the studio when it is ready.',
      actions: [linkButton('Open the studio', 'studio.html#courses')],
    });
  }
  if (access.planCourseIds.has(course.id)) {
    return notice({ kind: 'success', title: 'Included in your plan.', text: 'Every class in this course is open to you.' });
  }
  if (course.in_trial && !user) {
    return notice({
      title: `Try ${plural(trial.lessons, 'class', 'classes')} free.`,
      text: `Create a free account to start. Your trial runs for ${plural(trial.days, 'day')} from the first class.`,
      actions: [linkButton('Create a free account', `account.html?mode=signup&next=${encodeURIComponent(`course.html?id=${course.id}`)}`),
        linkButton('Sign in', `account.html?next=${encodeURIComponent(`course.html?id=${course.id}`)}`, true)],
    });
  }
  if (course.in_trial && trialAvailable(access)) {
    return notice({
      title: trial.state === 'active'
        ? `Free trial: ${plural(trial.lessons - trial.used, 'class', 'classes')} left`
        : `Your free trial: ${plural(trial.lessons, 'class', 'classes')}`,
      text: trial.state === 'active'
        ? `Your trial ends on ${formatDate(trial.ends_at)}.`
        : `The trial starts with the first class you open and lasts ${plural(trial.days, 'day')}.`,
    });
  }
  return notice({
    title: 'This course is part of our plans.',
    text: trial.state === 'ended' || trial.state === 'used_up'
      ? 'Your free trial is over. Choose a plan to open these classes.'
      : 'Choose a plan that includes this course to open its classes.',
    actions: [linkButton('See plans', 'plans.html')],
  });
}

function classRow(course, lesson, index, done) {
  const media = (lesson.lesson_media ?? []).map((lm) => lm.media).filter(Boolean);
  const videos = media.filter((m) => m.kind === 'video');
  const audios = media.filter((m) => m.kind === 'audio');
  const length = videos.reduce((sum, m) => sum + (m.duration_seconds ?? 0), 0);
  const meta = [
    videos.length && `${plural(videos.length, 'video')}${length ? ` · ${formatDuration(length)}` : ''}`,
    audios.length && plural(audios.length, 'practice audio', 'practice audios'),
  ].filter(Boolean).join(' · ');

  let badge;
  if (done.has(lesson.id)) badge = h('span', { class: 'pill done' }, '✓ Done');
  else if (covers(course, lesson)) badge = h('span', { class: 'pill open' }, 'Open');
  else if (access.trial.unlocked.includes(lesson.id)) badge = h('span', { class: 'pill open' }, 'Trial · open');
  else if (course.in_trial && (!access.user || trialAvailable(access))) badge = h('span', { class: 'pill trial' }, 'Free trial');
  else badge = h('span', { class: 'pill' }, '🔒 With a plan');

  return h('li', null, h('a', { class: 'class-row', href: `class.html?id=${lesson.id}&course=${course.id}` },
    h('span', { class: 'num' }, String(index + 1)),
    h('span', null, h('strong', null, lesson.title), meta && h('span', { class: 'meta' }, meta)),
    badge));
}
