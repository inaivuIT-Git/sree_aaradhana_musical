import {
  $, contactActions, formatDate, formatDuration, friendlyError, h, initPage, linkButton, must, notice, param,
  plural, sb, showFailure, toast,
} from './app.js';

const main = $('#class');
const UUID = /^[0-9a-f-]{36}$/i;
// Long enough for a class; the page asks for new links when it is reopened.
const LINK_SECONDS = 4 * 60 * 60;

const access = await initPage({ main });
if (access) load().catch((error) => showFailure(main, error));

async function load() {
  const id = param('id') ?? '';
  const lesson = UUID.test(id) ? await sb.from('lessons')
    .select('id, title, description, lesson_media(position, media(id, kind, title, storage_path, duration_seconds))')
    .eq('id', id)
    .maybeSingle()
    .then(must) : null;
  if (!lesson) {
    main.replaceChildren(notice({
      title: 'This class is not available.',
      text: 'It may have been moved or is not open yet.',
      actions: [linkButton('See all courses', './#paths')],
    }));
    return;
  }
  const [info, course] = await Promise.all([
    sb.rpc('lesson_access', { p_lesson: lesson.id }).then(must),
    loadCourse(param('course'), lesson.id),
  ]);
  document.title = `${lesson.title} | Sree Aaradhana online classes`;
  render(lesson, info, course);
}

// The course the student came from (for the breadcrumb and next/previous), or any course with this class.
async function loadCourse(courseId, lessonId) {
  const columns = 'id, title, categories(name), levels(name), course_lessons(position, lesson_id, lessons(title))';
  let course = UUID.test(courseId ?? '')
    ? await sb.from('courses').select(columns).eq('id', courseId).maybeSingle().then(must)
    : null;
  if (!course?.course_lessons.some((row) => row.lesson_id === lessonId)) {
    const rows = must(await sb.from('course_lessons').select(`courses(${columns})`).eq('lesson_id', lessonId).limit(1));
    course = rows[0]?.courses ?? null;
  }
  if (course) course.course_lessons.sort((a, b) => a.position - b.position);
  return course;
}

function courseLabel(course) {
  return course.title || `${course.categories?.name} · ${course.levels?.name}`;
}

function render(lesson, info, course) {
  const media = (lesson.lesson_media ?? [])
    .sort((a, b) => a.position - b.position)
    .map((row) => row.media)
    .filter(Boolean);
  const index = course ? course.course_lessons.findIndex((row) => row.lesson_id === lesson.id) : -1;

  const crumbs = h('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' },
    h('a', { href: './' }, 'Learn online'),
    course && [h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: `course.html?id=${course.id}` }, courseLabel(course))],
    index >= 0 && [h('span', { 'aria-hidden': 'true' }, '/'), h('span', null, `Class ${index + 1}`)]);

  if (!info.access) {
    main.replaceChildren(crumbs, lockedPanel(lesson, info, media, course));
    return;
  }
  main.replaceChildren(crumbs, h('div', { class: 'class-layout' },
    h('div', null,
      h('p', { class: 'eyebrow' }, index >= 0 ? `Class ${index + 1} of ${course.course_lessons.length}` : 'Class'),
      h('h1', null, lesson.title),
      h('div', { class: 'player', id: 'player' }, h('p', { class: 'loading' }, 'Loading the recordings…'))),
    h('aside', { class: 'class-side' },
      viaCard(info),
      lesson.description && h('div', { class: 'side-card' },
        h('h2', null, 'About this class'), h('p', { class: 'class-description' }, lesson.description)),
      h('div', { class: 'side-card', id: 'progress-card' }),
      course && classNav(course, index))));
  showProgress(lesson);
  showMedia(media, lesson);
}

function viaCard(info) {
  if (info.via !== 'trial') return null;
  const t = info.trial;
  return notice({
    title: 'Free trial class',
    text: `${plural(Math.max(0, t.lessons - t.used), 'free class', 'free classes')} left. Your trial ends on ${formatDate(t.ends_at)}.`,
    actions: [linkButton('See plans', 'plans.html', true)],
  });
}

function classNav(course, index) {
  const rows = course.course_lessons;
  const prev = rows[index - 1];
  const next = rows[index + 1];
  const link = (row, text) => h('a', { class: 'button small secondary', href: `class.html?id=${row.lesson_id}&course=${course.id}` }, text);
  return h('div', { class: 'side-card' },
    h('h2', null, courseLabel(course)),
    h('div', { class: 'class-nav' },
      prev ? link(prev, '← Previous class') : h('span'),
      next ? link(next, 'Next class →') : linkButton('Back to the course', `course.html?id=${course.id}`, true)));
}

async function showMedia(media, lesson) {
  const player = $('#player');
  if (!media.length) {
    player.replaceChildren(h('p', { class: 'empty' }, 'The recordings for this class will be added soon.'));
    return;
  }
  const { data, error } = await sb.storage.from('lesson-media')
    .createSignedUrls(media.map((m) => m.storage_path), LINK_SECONDS);
  if (error) {
    player.replaceChildren(notice({ kind: 'warn', title: 'The recordings could not load.', text: friendlyError(error) }));
    return;
  }
  const urls = new Map(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  const items = media.map((m) => mediaItem(m, urls.get(m.storage_path), lesson));
  player.replaceChildren(...items, practiceTools());
}

function mediaItem(m, url, lesson) {
  const label = h('figcaption', { class: 'media-label' },
    h('span', null, m.title), h('span', { class: 'muted' }, formatDuration(m.duration_seconds)));
  if (!url) {
    return h('figure', { class: 'media-item audio-item' }, label, h('p', { class: 'muted small' }, 'This recording could not be loaded.'));
  }
  const common = {
    src: url, controls: true, preload: 'metadata', controlslist: 'nodownload',
    oncontextmenu: (event) => event.preventDefault(),
  };
  if (m.kind === 'video') {
    return h('figure', { class: 'media-item' },
      h('video', { ...common, playsinline: true, onended: () => markDone(lesson, true, false) }),
      label);
  }
  return h('figure', { class: 'media-item audio-item' }, label, h('audio', common));
}

function practiceTools() {
  const mediaEls = () => document.querySelectorAll('#player video, #player audio');
  const speeds = [0.75, 1, 1.25];
  const buttons = speeds.map((speed) => h('button', {
    type: 'button',
    'aria-pressed': String(speed === 1),
    onclick: (event) => {
      mediaEls().forEach((el) => { el.playbackRate = speed; });
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === event.currentTarget)));
    },
  }, `${speed}×`));
  return h('div', { class: 'practice-tools' },
    h('span', null, 'Practice speed'),
    h('span', { class: 'speed-buttons', role: 'group', 'aria-label': 'Practice speed' }, buttons),
    h('label', null, h('input', {
      type: 'checkbox',
      onchange: (event) => mediaEls().forEach((el) => { el.loop = event.currentTarget.checked; }),
    }), 'Repeat'));
}

let completed = false;

async function showProgress(lesson) {
  const row = must(await sb.from('lesson_progress').select('completed_at').eq('lesson_id', lesson.id).maybeSingle());
  completed = Boolean(row?.completed_at);
  drawProgress(lesson);
}

function drawProgress(lesson) {
  $('#progress-card')?.replaceChildren(
    h('h2', null, completed ? '✓ Class done' : 'Finished this class?'),
    h('p', { class: 'muted small' }, completed
      ? 'It shows as done in the course list. Come back any time to practise again.'
      : 'Mark it done to keep track of your progress.'),
    h('button', {
      type: 'button',
      class: completed ? 'button small secondary' : 'button small',
      onclick: () => markDone(lesson, !completed, true),
    }, completed ? 'Mark as not done' : 'Mark as done'));
}

async function markDone(lesson, done, announce) {
  if (done === completed) return;
  const now = new Date().toISOString();
  const { error } = await sb.from('lesson_progress').upsert({
    user_id: access.user.id, lesson_id: lesson.id, completed_at: done ? now : null, updated_at: now,
  });
  if (error) {
    if (announce) toast(friendlyError(error), 'error');
    return;
  }
  completed = done;
  drawProgress(lesson);
  if (announce) toast(done ? 'Marked as done.' : 'Marked as not done.');
}

function mediaSummary(media) {
  const videos = media.filter((m) => m.kind === 'video');
  const audios = media.filter((m) => m.kind === 'audio');
  const length = videos.reduce((sum, m) => sum + (m.duration_seconds ?? 0), 0);
  return [
    videos.length && `${plural(videos.length, 'video')}${length ? ` (${formatDuration(length)})` : ''}`,
    audios.length && plural(audios.length, 'practice audio', 'practice audios'),
  ].filter(Boolean).join(' · ');
}

function lockedPanel(lesson, info, media, course) {
  const here = `class.html?id=${lesson.id}${course ? `&course=${course.id}` : ''}`;
  const trial = info.trial;
  const summary = mediaSummary(media);
  let title;
  let text;
  let actions;

  if (!info.signed_in) {
    title = 'Sign in to open this class.';
    text = `New students get ${plural(trial.lessons, 'class', 'classes')} free. The trial runs for ${plural(trial.days, 'day')} from the first class.`;
    actions = [
      linkButton('Create a free account', `account.html?mode=signup&next=${encodeURIComponent(here)}`),
      linkButton('Sign in', `account.html?next=${encodeURIComponent(here)}`, true),
    ];
  } else if (info.can_use_trial) {
    title = 'Open this class with your free trial?';
    text = trial.state === 'not_started'
      ? `This starts your free trial: ${plural(trial.lessons, 'class', 'classes')} within ${plural(trial.days, 'day')} from now.`
      : `This uses 1 of your ${plural(trial.lessons - trial.used, 'remaining free class', 'remaining free classes')}. Your trial ends on ${formatDate(trial.ends_at)}.`;
    const button = h('button', { class: 'button small', type: 'button' }, 'Use a free class');
    button.addEventListener('click', async () => {
      button.disabled = true;
      const { data, error } = await sb.rpc('start_trial_lesson', { p_lesson: lesson.id });
      if (error || !data?.access) {
        button.disabled = false;
        toast(error ? friendlyError(error) : 'This class could not be opened on the trial.', 'error');
        if (!error) load().catch((e) => showFailure(main, e));
        return;
      }
      load().catch((e) => showFailure(main, e));
    });
    actions = [button, linkButton('See plans', 'plans.html', true)];
  } else {
    title = 'This class is part of our plans.';
    text = trial.state === 'used_up'
      ? `You have used all ${plural(trial.lessons, 'free class', 'free classes')}. Choose a plan to keep learning.`
      : trial.state === 'ended'
        ? 'Your free trial has ended. Choose a plan to keep learning.'
        : 'This course is not part of the free trial. Choose a plan that includes it.';
    actions = [linkButton('See plans', 'plans.html'), ...contactActions(`Hello Sree Aaradhana, I would like to join the online class "${lesson.title}".`).slice(0, 1)];
  }

  return h('div', { class: 'locked-panel' },
    h('p', { class: 'eyebrow' }, '🔒 ' + lesson.title),
    h('h2', null, title),
    h('p', null, text),
    summary && h('p', { class: 'small' }, `In this class: ${summary}`),
    h('div', { class: 'notice-actions' }, actions));
}
