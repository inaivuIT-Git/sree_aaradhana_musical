// Building blocks for the studio panels.
import { friendlyError, h, toast } from '../app.js';

let fieldCount = 0;

export function field(label, input, hint) {
  input.id ||= `s-${++fieldCount}`;
  return h('div', { class: 'field' }, h('label', { for: input.id }, label), input, hint && h('small', null, hint));
}

export function checkField(label, input) {
  input.id ||= `s-${++fieldCount}`;
  return h('label', { class: 'check-field', for: input.id }, input, label);
}

export function select(options, value) {
  return h('select', null, options.map(([v, text]) => h('option', { value: v, selected: v === value }, text)));
}

export function toolButton(text, onclick, { danger = false, label, disabled = false } = {}) {
  return h('button', {
    type: 'button', class: danger ? 'tool-button danger' : 'tool-button', onclick, disabled,
    'aria-label': label,
  }, text);
}

// A dialog with a title bar. The dialog removes itself when closed.
export function openDialog(title, body) {
  const dialog = h('dialog', { class: 'panel', 'aria-labelledby': `d-${++fieldCount}` });
  dialog.append(
    h('div', { class: 'panel-title' },
      h('h2', { id: `d-${fieldCount}` }, title),
      h('button', { type: 'button', 'aria-label': 'Close', onclick: () => dialog.close() }, '×')),
    body);
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

// Runs a save, keeping the buttons disabled meanwhile, and reports failures.
export async function saving(form, work) {
  const buttons = form.querySelectorAll('button');
  buttons.forEach((b) => { b.disabled = true; });
  try {
    await work();
    return true;
  } catch (error) {
    console.error(error);
    toast(friendlyError(error), 'error');
    return false;
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
}

export function check({ error, data }) {
  if (error) throw error;
  return data;
}

// An ordered list the teacher can rearrange, with an optional remove button.
export function orderedList(items, describe, emptyText) {
  const state = [...items];
  const list = h('ol', { class: 'item-list' });
  const draw = () => {
    list.replaceChildren(...(state.length ? state.map((item, i) => h('li', null,
      h('span', { class: 'muted small', style: 'width:22px' }, String(i + 1)),
      h('div', { class: 'item-main' }, describe(item)),
      h('span', { class: 'icon-buttons' },
        toolButton('↑', () => move(i, -1), { label: 'Move up', disabled: i === 0 }),
        toolButton('↓', () => move(i, 1), { label: 'Move down', disabled: i === state.length - 1 }),
        toolButton('Remove', () => { state.splice(i, 1); draw(); }, { danger: true })))) : [h('li', { class: 'empty' }, emptyText)]));
  };
  const move = (i, delta) => {
    [state[i], state[i + delta]] = [state[i + delta], state[i]];
    draw();
  };
  draw();
  return {
    element: list,
    items: state,
    add(item) {
      state.push(item);
      draw();
    },
  };
}

// Writes the order of a link table (course → classes, class → media) as positions,
// removing rows that are no longer listed.
export async function saveOrder(sb, table, ownerColumn, ownerId, itemColumn, before, after) {
  const removed = before.filter((id) => !after.includes(id));
  if (removed.length) check(await sb.from(table).delete().eq(ownerColumn, ownerId).in(itemColumn, removed));
  if (after.length) {
    check(await sb.from(table).upsert(after.map((id, position) => ({
      [ownerColumn]: ownerId, [itemColumn]: id, position,
    }))));
  }
}
