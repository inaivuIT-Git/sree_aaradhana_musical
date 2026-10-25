import { describeRule, formatPeriod, h, plural, rupees, ruleCovers, toast } from '../app.js';
import { check, checkField, field, openDialog, saving, select, toolButton } from './ui.js';

export async function plansPanel(panel, ctx) {
  const active = check(await ctx.sb.from('subscriptions')
    .select('plan_id')
    .gt('ends_at', new Date().toISOString()));
  const holders = (plan) => active.filter((s) => s.plan_id === plan.id).length;
  const { plans } = ctx.data;

  panel.replaceChildren(
    h('div', { class: 'panel-head' },
      h('div', null,
        h('h2', null, 'Plans and prices'),
        h('p', null, 'A plan opens a set of courses for a number of days. Choose what it includes by category and level: for example all movie songs, or the beginner level of every category.')),
      h('button', { type: 'button', class: 'button small', onclick: () => editPlan(ctx, null) }, '+ New plan')),
    h('ul', { class: 'item-list' }, plans.length ? plans.map((plan) => h('li', null,
      h('div', { class: 'item-main' },
        h('strong', null, plan.name, ' ', h('span', { class: plan.is_active ? 'pill open' : 'pill' }, plan.is_active ? 'On sale' : 'Hidden')),
        h('span', null, [
          `${rupees(plan.price_paise)} for ${formatPeriod(plan.duration_days)}`,
          plan.plan_access.map((r) => describeRule(r, ctx.data.categories, ctx.data.levels)).join('; ') || 'Includes nothing yet',
          plural(holders(plan), 'student', 'students') + ' now',
        ].join(' · '))),
      h('span', { class: 'icon-buttons' },
        toolButton('Edit', () => editPlan(ctx, plan)),
        toolButton('Delete', () => deletePlan(ctx, plan), { danger: true })))) : [h('li', { class: 'empty' }, 'No plans yet. Students can still use the free trial.')]));
}

async function deletePlan(ctx, plan) {
  if (!confirm(`Delete the plan “${plan.name}”?`)) return;
  const { error } = await ctx.sb.from('plans').delete().eq('id', plan.id);
  if (error?.code === '23503') {
    toast('Students have bought this plan, so it cannot be deleted. Edit it and untick “On sale” to hide it instead.', 'error');
    return;
  }
  if (error) toast(error.message, 'error');
  await ctx.refresh();
}

function editPlan(ctx, plan) {
  const { categoryList, levelList, courses } = ctx.data;
  const name = h('input', { value: plan?.name ?? '', required: true, maxlength: 80, placeholder: 'Movie songs, monthly' });
  const description = h('textarea', { rows: 2, maxlength: 1000 }, plan?.description ?? '');
  const price = h('input', {
    type: 'number', min: '1', max: '100000', step: '0.01', required: true, inputmode: 'decimal',
    value: plan ? String(plan.price_paise / 100) : '',
  });
  const days = h('input', { type: 'number', min: '1', max: '730', step: '1', required: true, value: String(plan?.duration_days ?? 30) });
  const position = h('input', { type: 'number', step: '1', value: String(plan?.position ?? 0) });
  const onSale = h('input', { type: 'checkbox', checked: plan?.is_active ?? true });

  const rules = (plan?.plan_access ?? []).map((r) => ({ category_id: r.category_id, level_id: r.level_id }));
  if (!rules.length) rules.push({ category_id: null, level_id: null });
  const ruleList = h('ul', { class: 'item-list' });
  const coverage = h('p', { class: 'small muted' });
  const categoryOptions = [['', 'Every category'], ...categoryList.map((c) => [c.id, c.name])];
  const levelOptions = [['', 'Every level'], ...levelList.map((l) => [l.id, l.name])];
  const drawRules = () => {
    ruleList.replaceChildren(...rules.map((rule, i) => {
      const category = select(categoryOptions, rule.category_id ?? '');
      const level = select(levelOptions, rule.level_id ?? '');
      category.setAttribute('aria-label', 'Category');
      level.setAttribute('aria-label', 'Level');
      category.addEventListener('change', () => { rule.category_id = category.value || null; drawCoverage(); });
      level.addEventListener('change', () => { rule.level_id = level.value || null; drawCoverage(); });
      return h('li', null,
        h('div', { class: 'item-main form-row' }, category, level),
        toolButton('Remove', () => { rules.splice(i, 1); drawRules(); }, { danger: true, disabled: rules.length === 1 }));
    }));
    drawCoverage();
  };
  const drawCoverage = () => {
    const covered = courses.filter((c) => c.is_published && rules.some((r) => ruleCovers(r, c)));
    const classes = new Set(covered.flatMap((c) => c.course_lessons.map((r) => r.lesson_id)));
    coverage.textContent = `Today this opens ${plural(covered.length, 'published course')} with ${plural(classes.size, 'class', 'classes')}. Courses you publish later that match are included automatically.`;
  };
  drawRules();

  const form = h('form', null,
    field('Plan name', name),
    field('Description (optional)', description, 'Shown on the plans page.'),
    h('div', { class: 'form-row' },
      field('Price in rupees', price),
      field('Days of access', days, '30 = 1 month, 90 = 3 months, 365 = 1 year.')),
    h('h3', null, 'What this plan opens'),
    ruleList,
    h('div', { class: 'form-actions' }, toolButton('+ Add another category or level', () => {
      rules.push({ category_id: null, level_id: null });
      drawRules();
    })),
    coverage,
    h('div', { class: 'form-row' }, field('Order on the plans page', position, 'Lower numbers show first.'), h('div')),
    checkField('On sale: students can buy this plan', onSale),
    plan && h('p', { class: 'small muted' }, 'Changes to what a plan opens also apply to students who already have it. A new price applies to new payments only.'),
    h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'button small' }, plan ? 'Save plan' : 'Create plan')));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const pricePaise = Math.round(Number(price.value) * 100);
    if (!(pricePaise >= 100)) {
      toast('The price must be at least ₹1.', 'error');
      return;
    }
    const unique = [...new Map(rules.map((r) => [`${r.category_id}|${r.level_id}`, r])).values()];
    const values = {
      name: name.value.trim(),
      description: description.value.trim(),
      price_paise: pricePaise,
      duration_days: Number(days.value),
      position: Number(position.value) || 0,
      is_active: onSale.checked,
    };
    const ok = await saving(form, async () => {
      let id = plan?.id;
      if (id) check(await ctx.sb.from('plans').update(values).eq('id', id));
      else id = check(await ctx.sb.from('plans').insert(values).select('id').single()).id;
      check(await ctx.sb.from('plan_access').delete().eq('plan_id', id));
      check(await ctx.sb.from('plan_access').insert(unique.map((r) => ({ plan_id: id, ...r }))));
    });
    if (ok) {
      dialog.close();
      toast(plan ? 'Plan saved.' : 'Plan created.');
      await ctx.refresh();
    }
  });

  const dialog = openDialog(plan ? 'Edit plan' : 'New plan', form);
}
