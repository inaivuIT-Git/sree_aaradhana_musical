// Shared by the online learning pages.
import { config } from './config.js';

export { config };

// Read before Supabase handles (and clears) the tokens or errors in an email link.
export const initialHash = location.hash;

export const isConfigured = Boolean(config.supabaseUrl && config.supabaseKey && window.supabase);
export const sb = isConfigured ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;

export const $ = (selector, root = document) => root.querySelector(selector);

const PROPERTIES = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'open', 'controls']);

// Builds an element. Text is always added as text, never parsed as HTML.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (PROPERTIES.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

// Like replaceChildren, but skips empty (null or false) children.
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((child) => child != null && child !== false));
}

export function param(name) {
  return new URLSearchParams(location.search).get(name);
}

// Only pages in this folder, so a link cannot send people to another site after signing in.
export function safeNext(value) {
  return /^[a-z-]+\.html(\?[\w=&%.-]*)?$/.test(value ?? '') ? value : null;
}

export function pageUrl(page) {
  return new URL(page, location.href).href;
}

export function rupees(paise) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export function formatDate(iso) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

export function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '';
  const s = Math.round(seconds);
  const parts = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const [hrs, mins, secs] = parts.map((n) => String(n).padStart(2, '0'));
  return parts[0] ? `${parts[0]}:${mins}:${secs}` : `${Number(mins)}:${secs}`;
}

export function formatPeriod(days) {
  if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`;
  if (days % 30 === 0) return days === 30 ? '1 month' : `${days / 30} months`;
  if (days % 7 === 0) return days === 7 ? '1 week' : `${days / 7} weeks`;
  return days === 1 ? '1 day' : `${days} days`;
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

export function friendlyError(error) {
  if (!error) return '';
  if (error.code === '42501') return 'You do not have permission to do that. Try signing in again.';
  if (error.code === '23503') return 'This is still in use. Remove it from where it is used first.';
  if (error.code === '23505') return 'That already exists.';
  if (error.code === '23514') return 'Please check the values: one of them is too long or out of range.';
  if (/fetch|network/i.test(error.message ?? '')) return 'We could not reach the server. Check your connection and try again.';
  return error.message || 'Something went wrong. Please try again.';
}

// Fails loudly so a broken query shows a message instead of an empty page.
export function must({ data, error }) {
  if (error) throw error;
  return data;
}

let toastTimer;
export function toast(text, kind = 'info') {
  let el = $('#toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = text;
  el.dataset.kind = kind;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 4500);
}

export function notice({ title, text, actions = [], kind = '' }) {
  return h('div', { class: `notice ${kind}`.trim() },
    h('div', null, title && h('strong', null, title), text && h('p', null, text)),
    actions.length ? h('div', { class: 'notice-actions' }, actions) : null);
}

export function linkButton(text, href, secondary = false) {
  return h('a', { class: secondary ? 'button small secondary' : 'button small', href }, text);
}

function whatsappLink(text) {
  return `https://wa.me/${config.schoolWhatsApp}?text=${encodeURIComponent(text)}`;
}

export function contactActions(text = 'Hello Sree Aaradhana, I would like to join the online vocal classes.') {
  return [
    h('a', { class: 'button small', href: whatsappLink(text), target: '_blank', rel: 'noopener noreferrer' }, 'WhatsApp the school ↗'),
    h('a', { class: 'button small secondary', href: `tel:${config.schoolPhone}` }, 'Call the school'),
  ];
}

export function showComingSoon(main) {
  main.replaceChildren(h('section', { class: 'shell learn-section' }, notice({
    title: 'Online classes are coming soon.',
    text: 'Our online vocal classes are being prepared. Contact the school to hear when they open.',
    actions: contactActions(),
  })));
}

export function showFailure(main, error) {
  console.error(error);
  main.replaceChildren(h('section', { class: 'shell learn-section' }, notice({
    kind: 'warn',
    title: 'This page could not load.',
    text: friendlyError(error),
    actions: [h('button', { class: 'button small', type: 'button', onclick: () => location.reload() }, 'Try again')],
  })));
}

// Who is signed in, and what they can open.
export async function loadAccess() {
  const { data: { session } } = await sb.auth.getSession();
  const user = session?.user ?? null;
  const trial = must(await sb.rpc('my_trial'));
  const access = {
    user, profile: null, isStaff: false, isAdmin: false, trial,
    planCourseIds: new Set(), planLessonIds: new Set(), subscriptions: [],
  };
  if (!user) return access;

  const [profile, courseIds, subscriptions] = await Promise.all([
    sb.from('profiles').select('full_name, phone, role, trial_started_at').eq('id', user.id).single().then(must),
    sb.rpc('my_plan_courses').then(must),
    sb.from('subscriptions')
      .select('id, plan_id, starts_at, ends_at, source, plans(name)')
      .eq('user_id', user.id)
      .gt('ends_at', new Date().toISOString())
      .order('ends_at')
      .then(must),
  ]);
  access.profile = profile;
  access.isStaff = profile.role === 'teacher' || profile.role === 'admin';
  access.isAdmin = profile.role === 'admin';
  access.subscriptions = subscriptions;
  access.planCourseIds = new Set(courseIds);
  if (courseIds.length) {
    const rows = must(await sb.from('course_lessons').select('lesson_id').in('course_id', courseIds));
    access.planLessonIds = new Set(rows.map((r) => r.lesson_id));
  }
  return access;
}

export function trialAvailable(access) {
  return ['not_started', 'active'].includes(access.trial.state);
}

export function courseBadge(course, access) {
  if (access.isStaff || access.planCourseIds.has(course.id)) return h('span', { class: 'pill open' }, 'Open');
  if (course.in_trial && (!access.user || trialAvailable(access))) return h('span', { class: 'pill trial' }, 'Free trial');
  return h('span', { class: 'pill' }, 'With a plan');
}

function updateHeader(access) {
  const account = $('[data-account]');
  if (account && access?.user) account.textContent = 'My account';
  const studio = $('[data-staff]');
  if (studio) studio.hidden = !access?.isStaff;
}

// Every page starts here. Returns null when the page should not continue.
export async function initPage({ main = $('#main'), requireSignIn = false, requireStaff = false } = {}) {
  if (!isConfigured) {
    showComingSoon(main);
    return null;
  }
  try {
    const access = await loadAccess();
    updateHeader(access);
    if ((requireSignIn || requireStaff) && !access.user) {
      const here = location.pathname.split('/').pop() + location.search;
      location.replace(`account.html?next=${encodeURIComponent(here)}`);
      return null;
    }
    if (requireStaff && !access.isStaff) {
      main.replaceChildren(h('section', { class: 'shell learn-section' }, notice({
        title: 'The studio is for teachers.',
        text: 'Ask the school admin to give your account teacher access.',
        actions: [linkButton('Back to classes', './')],
      })));
      return null;
    }
    return access;
  } catch (error) {
    showFailure(main, error);
    return null;
  }
}

// "Movie songs · Beginner", or the course's own title if it has one.
export function courseName(course, categories, levels) {
  if (course.title) return course.title;
  const category = categories.get(course.category_id)?.name ?? '';
  const level = levels.get(course.level_id)?.name ?? '';
  return [category, level].filter(Boolean).join(' · ');
}

export function describeRule(rule, categories, levels) {
  const category = rule.category_id ? categories.get(rule.category_id)?.name : null;
  const level = rule.level_id ? levels.get(rule.level_id)?.name : null;
  if (category && level) return `${category} · ${level}`;
  if (category) return `${category}: every level`;
  if (level) return `${level} level in every category`;
  return 'Every course, every level';
}

export function ruleCovers(rule, course) {
  return (!rule.category_id || rule.category_id === course.category_id)
    && (!rule.level_id || rule.level_id === course.level_id);
}

export const byId = (rows) => new Map(rows.map((row) => [row.id, row]));
