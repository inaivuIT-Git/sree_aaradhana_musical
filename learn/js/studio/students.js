import { formatDate, h, toast } from '../app.js';
import { check, field, openDialog, saving, select, toolButton } from './ui.js';

export async function studentsPanel(panel, ctx) {
  panel.replaceChildren(h('p', { class: 'loading' }, 'Loading students…'));
  const [students, subscriptions] = await Promise.all([
    ctx.sb.rpc('staff_students').then(check),
    ctx.sb.from('subscriptions')
      .select('id, user_id, plan_id, starts_at, ends_at, source, note, plans(name)')
      .gt('ends_at', new Date().toISOString())
      .order('ends_at')
      .then(check),
  ]);
  const { trial_days: trialDays, trial_lessons: trialLessons } = ctx.data.settings;

  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search by name, email or phone', 'aria-label': 'Search students' });
  const list = h('ul', { class: 'item-list' });
  const draw = () => {
    const term = search.value.trim().toLowerCase();
    const rows = students.filter((s) => !term || [s.full_name, s.email, s.phone].some((v) => v?.toLowerCase().includes(term)));
    list.replaceChildren(...(rows.length ? rows.slice(0, 200).map((s) => studentRow(s)) : [h('li', { class: 'empty' }, 'No students found.')]));
  };

  const trialText = (s) => {
    if (!s.trial_started_at) return 'Trial not started';
    const ends = new Date(new Date(s.trial_started_at).getTime() + trialDays * 864e5);
    if (ends <= new Date()) return `Trial ended ${formatDate(ends)}`;
    return `Trial: ${s.trial_used} of ${trialLessons} classes, until ${formatDate(ends)}`;
  };

  const studentRow = (s) => {
    const current = subscriptions.filter((sub) => sub.user_id === s.id);
    return h('li', null,
      h('div', { class: 'item-main' },
        h('strong', null, s.full_name || '(no name)', s.role !== 'student' ? ` · ${s.role}` : ''),
        h('span', null, [s.email, s.phone, `joined ${formatDate(s.created_at)}`].filter(Boolean).join(' · ')),
        h('div', { class: 'small' }, trialText(s)),
        current.map((sub) => h('div', { class: 'small' },
          h('span', { class: 'pill open' }, sub.plans?.name ?? 'Plan'),
          ` ${new Date(sub.starts_at) > new Date() ? `from ${formatDate(sub.starts_at)} ` : ''}until ${formatDate(sub.ends_at)}`,
          sub.source === 'manual' ? ` (given${sub.note ? `: ${sub.note}` : ''})` : ' (paid online)',
          ' ',
          h('button', { type: 'button', class: 'link-button small', onclick: () => endPlan(ctx, sub) }, 'End now')))),
      h('span', { class: 'icon-buttons' },
        toolButton('Give a plan', () => givePlan(ctx, s)),
        ctx.access.isAdmin && s.id !== ctx.access.user.id && roleSelect(ctx, s)));
  };

  search.addEventListener('input', draw);
  draw();
  panel.replaceChildren(
    h('div', { class: 'panel-head' }, h('div', null,
      h('h2', null, 'Students'),
      h('p', null, `${students.length} accounts. For students who pay at the school, use “Give a plan”. Showing up to 200; search to find others.`))),
    search,
    h('div', { class: 'spacer' }),
    list);
}

function roleSelect(ctx, student) {
  const control = select([['student', 'Student'], ['teacher', 'Teacher'], ['admin', 'Admin']], student.role);
  control.setAttribute('aria-label', `Role for ${student.full_name || student.email}`);
  control.style.width = 'auto';
  control.addEventListener('change', async () => {
    const role = control.value;
    if (!confirm(`Make ${student.full_name || student.email} a ${role}?${role !== 'student' ? ' Teachers and admins can change every class, plan and student.' : ''}`)) {
      control.value = student.role;
      return;
    }
    const { error } = await ctx.sb.rpc('set_user_role', { p_user: student.id, p_role: role });
    if (error) {
      toast(error.message, 'error');
      control.value = student.role;
      return;
    }
    toast('Role changed.');
    ctx.refresh();
  });
  return control;
}

async function endPlan(ctx, sub) {
  if (!confirm(`End ${sub.plans?.name ?? 'this plan'} now? The student loses access straight away.`)) return;
  const { error } = await ctx.sb.rpc('end_subscription', { p_subscription: sub.id });
  if (error) toast(error.message, 'error');
  else toast('Plan ended.');
  await ctx.refresh();
}

function givePlan(ctx, student) {
  const { plans } = ctx.data;
  if (!plans.length) {
    toast('Create a plan in the Plans tab first.', 'error');
    return;
  }
  const plan = select(plans.map((p) => [p.id, `${p.name}${p.is_active ? '' : ' (hidden)'}`]), plans.find((p) => p.is_active)?.id ?? plans[0].id);
  const days = h('input', { type: 'number', min: '1', max: '730', required: true });
  const note = h('input', { maxlength: 300, placeholder: 'Paid ₹500 cash at Attur, 25 Oct' });
  const setDays = () => { days.value = String(plans.find((p) => p.id === plan.value)?.duration_days ?? 30); };
  plan.addEventListener('change', setDays);
  setDays();

  const form = h('form', null,
    h('p', { class: 'muted small' }, `For ${student.full_name || student.email}. If they already have this plan, the new days start when the current period ends.`),
    field('Plan', plan),
    field('Days', days, 'Filled in with the plan’s own period. Change it for a shorter or longer stay.'),
    field('Note (only teachers see this)', note),
    h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'button small' }, 'Give access')));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const ok = await saving(form, async () => {
      check(await ctx.sb.rpc('grant_plan', {
        p_user: student.id, p_plan: plan.value, p_days: Number(days.value), p_note: note.value.trim(),
      }));
    });
    if (ok) {
      dialog.close();
      toast('Access given.');
      await ctx.refresh();
    }
  });
  const dialog = openDialog('Give a plan', form);
}
