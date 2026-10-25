import {
  $, byId, contactActions, courseBadge, courseName, formatDate, h, initPage, linkButton, must, notice, plural,
  sb, showFailure,
} from './app.js';

const access = await initPage({ main: $('#paths') });
if (access) {
  try {
    showTrialNumbers(access.trial);
    showStatus(access);
    await showPaths(access);
  } catch (error) {
    showFailure($('#paths'), error);
  }
} else {
  $('#my-status')?.remove();
}

function showTrialNumbers(trial) {
  document.querySelectorAll('[data-trial-lessons]').forEach((el) => { el.textContent = trial.lessons; });
  document.querySelectorAll('[data-trial-days]').forEach((el) => { el.textContent = trial.days; });
}

function showStatus({ user, profile, isStaff, trial, subscriptions }) {
  const box = $('#my-status');
  const start = $('[data-start]');
  if (user && start) {
    start.href = '#paths';
    start.firstChild.textContent = 'Continue learning ';
  }

  let content;
  if (!user) {
    content = notice({
      title: `Start with ${plural(trial.lessons, 'free class', 'free classes')}.`,
      text: `Create an account in a minute. Your trial runs for ${plural(trial.days, 'day')} from the first class you open, and no payment is needed.`,
      actions: [linkButton('Create a free account', 'account.html?mode=signup'), linkButton('Sign in', 'account.html', true)],
    });
  } else if (isStaff) {
    content = notice({
      title: `Signed in as a teacher${profile.full_name ? `: ${profile.full_name}` : ''}.`,
      text: 'You can open every class. Add media, classes and courses in the studio.',
      actions: [linkButton('Open the studio', 'studio.html')],
    });
  } else if (subscriptions.length) {
    const current = subscriptions.filter((s) => new Date(s.starts_at) <= new Date());
    content = notice({
      kind: 'success',
      title: 'Your plans',
      text: current.map((s) => `${s.plans?.name ?? 'Plan'} until ${formatDate(s.ends_at)}`).join(' · ')
        || 'Your plan starts soon.',
      actions: [linkButton('Renew or add a plan', 'plans.html', true)],
    });
  } else if (trial.state === 'not_started') {
    content = notice({
      title: 'Your free trial is ready.',
      text: `Open any course marked “Free trial” and start a class. You get ${plural(trial.lessons, 'class', 'classes')} within ${plural(trial.days, 'day')} of the first one.`,
    });
  } else if (trial.state === 'active') {
    content = notice({
      title: `Free trial: ${plural(trial.lessons - trial.used, 'class', 'classes')} left.`,
      text: `Your trial ends on ${formatDate(trial.ends_at)}. Classes you have opened stay open until then.`,
      actions: [linkButton('See plans', 'plans.html', true)],
    });
  } else {
    const usedUp = trial.state === 'used_up';
    content = notice({
      kind: 'warn',
      title: usedUp ? 'You have used all your free classes.' : 'Your free trial has ended.',
      text: usedUp
        ? `Your trial classes stay open until ${formatDate(trial.ends_at)}. Choose a plan to keep learning.`
        : 'We hope you enjoyed it. Choose a plan to keep learning.',
      actions: [linkButton('Choose a plan', 'plans.html')],
    });
  }
  box.replaceChildren(content);
}

async function showPaths(access) {
  const [levels, categories, courses] = await Promise.all([
    sb.from('levels').select('id, name, description, position').order('position').then(must),
    sb.from('categories').select('id, name, description, position').order('position').then(must),
    sb.from('courses')
      .select('id, title, category_id, level_id, in_trial, course_lessons(count)')
      .eq('is_published', true)
      .then(must),
  ]);
  const levelsById = byId(levels);
  const categoriesById = byId(categories);
  const blocks = categories.map((category) => {
    const inCategory = courses
      .filter((c) => c.category_id === category.id)
      .sort((a, b) => (levelsById.get(a.level_id)?.position ?? 0) - (levelsById.get(b.level_id)?.position ?? 0));
    if (!inCategory.length) return null;
    return h('div', { class: 'category-block' },
      h('h3', null, category.name),
      category.description && h('p', null, category.description),
      h('div', { class: 'level-grid' }, inCategory.map((course) => courseCard(course, access, levelsById, categoriesById))));
  }).filter(Boolean);

  $('#paths').replaceChildren(...(blocks.length ? blocks : [notice({
    title: 'The first courses are on their way.',
    text: 'Our teachers are recording the classes. Contact the school to hear when they open.',
    actions: contactActions(),
  })]));
}

function courseCard(course, access, levels, categories) {
  const count = course.course_lessons?.[0]?.count ?? 0;
  const level = levels.get(course.level_id);
  return h('a', { class: 'level-card', href: `course.html?id=${course.id}` },
    h('span', { class: 'level-name' }, level?.name ?? ''),
    course.title && h('span', null, courseName(course, categories, levels)),
    h('span', { class: 'count' }, plural(count, 'class', 'classes')),
    courseBadge(course, access));
}
