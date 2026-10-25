import { h, toast } from '../app.js';
import { check, field, saving } from './ui.js';

export function settingsPanel(panel, ctx) {
  const { settings } = ctx.data;
  const lessons = h('input', { type: 'number', min: '1', max: '50', required: true, value: String(settings.trial_lessons) });
  const days = h('input', { type: 'number', min: '1', max: '60', required: true, value: String(settings.trial_days) });
  const form = h('form', { class: 'form-card', style: 'max-width:560px' },
    h('div', { class: 'form-row' },
      field('Free classes', lessons),
      field('Days', days, 'Counted from the first class.')),
    h('p', { class: 'small muted' }, 'The trial ends when either runs out. Changes apply to everyone, including students already on a trial. Only courses marked “Part of the free trial” can be opened on the trial.'),
    h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'button small' }, 'Save')));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const ok = await saving(form, async () => {
      check(await ctx.sb.from('app_settings')
        .update({ trial_lessons: Number(lessons.value), trial_days: Number(days.value), updated_at: new Date().toISOString() })
        .eq('id', true));
    });
    if (ok) {
      toast('Trial settings saved.');
      await ctx.refresh();
    }
  });
  panel.replaceChildren(
    h('div', { class: 'panel-head' }, h('div', null,
      h('h2', null, 'Free trial'),
      h('p', null, 'Every new student can open a few classes free before choosing a plan.'))),
    form);
}
