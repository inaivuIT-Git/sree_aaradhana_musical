// Teacher studio: media library, classes, courses, plans, students and trial settings.
import { $, byId, h, initPage, sb, showFailure } from './app.js';
import { check } from './studio/ui.js';
import { classesPanel } from './studio/classes.js';
import { coursesPanel } from './studio/courses.js';
import { mediaPanel } from './studio/media.js';
import { plansPanel } from './studio/plans.js';
import { settingsPanel } from './studio/settings.js';
import { studentsPanel } from './studio/students.js';

const root = $('#studio');
const TABS = [
  ['courses', 'Courses', coursesPanel],
  ['classes', 'Classes', classesPanel],
  ['media', 'Media library', mediaPanel],
  ['plans', 'Plans', plansPanel],
  ['students', 'Students', studentsPanel],
  ['settings', 'Trial settings', settingsPanel],
];

const access = await initPage({ main: root, requireStaff: true });

const ctx = {
  sb,
  access,
  data: null,
  // Reloads everything and redraws the open tab. The studio's data is small.
  async refresh() {
    ctx.data = await loadData();
    draw();
  },
  categoryName: (id) => ctx.data.categories.get(id)?.name ?? '?',
  levelName: (id) => ctx.data.levels.get(id)?.name ?? '?',
  courseLabel(course) {
    const base = `${ctx.categoryName(course.category_id)} · ${ctx.levelName(course.level_id)}`;
    return course.title ? `${course.title} (${base})` : base;
  },
};

async function loadData() {
  const [levels, categories, courses, lessons, media, plans, settings] = await Promise.all([
    sb.from('levels').select('*').order('position'),
    sb.from('categories').select('*').order('position'),
    sb.from('courses').select('*, course_lessons(lesson_id, position)'),
    sb.from('lessons').select('*, lesson_media(media_id, position)').order('created_at', { ascending: false }),
    sb.from('media').select('*').order('created_at', { ascending: false }),
    sb.from('plans').select('*, plan_access(id, category_id, level_id)').order('position').order('created_at'),
    sb.from('app_settings').select('*').single(),
  ].map((query) => query.then(check)));
  for (const course of courses) course.course_lessons.sort((a, b) => a.position - b.position);
  for (const lesson of lessons) lesson.lesson_media.sort((a, b) => a.position - b.position);
  return {
    levelList: levels,
    categoryList: categories,
    levels: byId(levels),
    categories: byId(categories),
    courses,
    lessons,
    lessonsById: byId(lessons),
    media,
    mediaById: byId(media),
    plans,
    settings,
  };
}

function currentTab() {
  const name = location.hash.replace('#', '');
  return TABS.find(([id]) => id === name) ?? TABS[0];
}

let panel;
function draw() {
  const [id] = currentTab();
  root.querySelectorAll('.studio-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  const [, , render] = currentTab();
  const content = h('section', { class: 'studio-panel', id: `panel-${id}`, role: 'tabpanel' });
  panel.replaceWith(content);
  panel = content;
  Promise.resolve(render(content, ctx)).catch((error) => showFailure(content, error));
}

if (access) {
  try {
    ctx.data = await loadData();
    panel = h('section');
    root.replaceChildren(
      h('div', { class: 'studio-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'Teacher studio'),
          h('h1', null, 'Studio'),
          h('p', { class: 'muted small', style: 'margin:8px 0 0' },
            `Signed in as ${access.profile.full_name || access.user.email} (${access.profile.role}).`)),
        h('a', { class: 'button small secondary', href: './' }, 'See it as a student')),
      h('div', { class: 'studio-tabs', role: 'tablist' }, TABS.map(([id, label]) => h('button', {
        type: 'button', role: 'tab', 'data-tab': id,
        onclick: () => { location.hash = id; },
      }, label))),
      panel);
    window.addEventListener('hashchange', draw);
    draw();
  } catch (error) {
    showFailure(root, error);
  }
}
