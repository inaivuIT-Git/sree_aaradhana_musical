import { h, plural, toast } from '../app.js';
import { check, checkField, field, openDialog, orderedList, saveOrder, saving, select, toolButton } from './ui.js';

export function coursesPanel(panel, ctx) {
  const { levelList, categoryList, courses } = ctx.data;
  const cell = (category, level) => courses.find((c) => c.category_id === category.id && c.level_id === level.id);

  const matrix = levelList.length && categoryList.length
    ? h('div', { class: 'matrix-wrap' }, h('table', { class: 'matrix' },
      h('thead', null, h('tr', null, h('th', null, 'Category \\ Level'), levelList.map((l) => h('th', { scope: 'col' }, l.name)))),
      h('tbody', null, categoryList.map((category) => h('tr', null,
        h('th', { scope: 'row' }, category.name),
        levelList.map((level) => {
          const course = cell(category, level);
          return h('td', null, course ? courseCell(course, ctx) : h('button', {
            type: 'button', class: 'cell-empty',
            onclick: () => addCourse(ctx, category, level),
          }, '+ Add course'));
        }))))))
    : h('p', { class: 'empty' }, 'Add at least one level and one category below to start building courses.');

  panel.replaceChildren(
    h('div', { class: 'panel-head' }, h('div', null,
      h('h2', null, 'Courses'),
      h('p', null, 'Each course is one category at one level. Put classes into courses here or from the Classes tab. The same class can be in several courses, so you can rearrange without uploading again.'))),
    matrix,
    h('div', { class: 'spacer' }),
    h('div', { class: 'two-col' },
      structureList(ctx, 'levels', 'Levels', levelList),
      structureList(ctx, 'categories', 'Categories', categoryList)));
}

function courseCell(course, ctx) {
  const classes = course.course_lessons.length;
  return h('button', { type: 'button', class: 'cell-course', onclick: () => editCourse(ctx, course) },
    h('strong', null, course.title || 'Untitled course'),
    h('span', { class: 'muted' }, plural(classes, 'class', 'classes')),
    h('span', null,
      h('span', { class: course.is_published ? 'pill open' : 'pill' }, course.is_published ? 'Published' : 'Draft'),
      ' ',
      course.in_trial && h('span', { class: 'pill trial' }, 'Trial')));
}

async function addCourse(ctx, category, level) {
  const { data, error } = await ctx.sb.from('courses')
    .insert({ category_id: category.id, level_id: level.id })
    .select('*, course_lessons(lesson_id, position)')
    .single();
  if (error) {
    toast(error.message, 'error');
    return;
  }
  await ctx.refresh();
  editCourse(ctx, data);
}

export function editCourse(ctx, course) {
  const { lessons, lessonsById, levelList, categoryList, courses } = ctx.data;
  const title = h('input', { value: course.title, maxlength: 120, placeholder: `${ctx.categoryName(course.category_id)} · ${ctx.levelName(course.level_id)}` });
  const description = h('textarea', { rows: 3, maxlength: 2000 }, course.description);
  const published = h('input', { type: 'checkbox', checked: course.is_published });
  const inTrial = h('input', { type: 'checkbox', checked: course.in_trial });
  const category = select(categoryList.map((c) => [c.id, c.name]), course.category_id);
  const level = select(levelList.map((l) => [l.id, l.name]), course.level_id);

  const lessonText = (lesson) => [h('strong', null, lesson.title),
    h('span', null, plural(lesson.lesson_media.length, 'recording'))];
  const list = orderedList(
    course.course_lessons.map((row) => lessonsById.get(row.lesson_id)).filter(Boolean),
    lessonText,
    'No classes yet. Add some below.');

  const picker = h('select');
  const fillPicker = () => {
    const inList = new Set(list.items.map((l) => l.id));
    const options = lessons.filter((l) => !inList.has(l.id));
    picker.replaceChildren(h('option', { value: '' }, options.length ? 'Choose a class to add…' : 'Every class is already in this course'),
      ...options.map((l) => h('option', { value: l.id }, l.title)));
  };
  fillPicker();
  const addButton = toolButton('Add class', () => {
    const lesson = lessonsById.get(picker.value);
    if (!lesson) return;
    list.add(lesson);
    fillPicker();
  });
  list.element.addEventListener('click', () => setTimeout(fillPicker));

  const form = h('form', null,
    field('Title (optional)', title, 'Leave empty to show the category and level.'),
    field('Description', description),
    h('div', { class: 'form-row' }, field('Category', category), field('Level', level)),
    checkField('Published: students can see this course', published),
    checkField('Part of the free trial', inTrial),
    h('h3', null, 'Classes in this course'),
    list.element,
    h('div', { class: 'form-actions' }, picker, addButton),
    h('div', { class: 'form-actions' },
      h('button', { type: 'submit', class: 'button small' }, 'Save course'),
      toolButton('Delete course', () => deleteCourse(ctx, course, dialog), { danger: true })));
  picker.style.maxWidth = '420px';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const clash = courses.find((c) => c.id !== course.id && c.category_id === category.value && c.level_id === level.value);
    if (clash) {
      toast('There is already a course for that category and level.', 'error');
      return;
    }
    const ok = await saving(form, async () => {
      check(await ctx.sb.from('courses').update({
        title: title.value.trim(),
        description: description.value.trim(),
        is_published: published.checked,
        in_trial: inTrial.checked,
        category_id: category.value,
        level_id: level.value,
      }).eq('id', course.id));
      await saveOrder(ctx.sb, 'course_lessons', 'course_id', course.id, 'lesson_id',
        course.course_lessons.map((r) => r.lesson_id), list.items.map((l) => l.id));
    });
    if (ok) {
      dialog.close();
      toast('Course saved.');
      await ctx.refresh();
    }
  });

  const dialog = openDialog(ctx.courseLabel(course), form);
}

async function deleteCourse(ctx, course, dialog) {
  if (!confirm('Delete this course? Its classes stay in the Classes tab and in any other course.')) return;
  const { error } = await ctx.sb.from('courses').delete().eq('id', course.id);
  if (error) {
    toast(error.message, 'error');
    return;
  }
  dialog.close();
  toast('Course deleted.');
  await ctx.refresh();
}

// Levels or categories: rename, describe, reorder, add and remove.
function structureList(ctx, table, heading, rows) {
  const singular = table === 'levels' ? 'level' : 'category';
  const used = (row) => ctx.data.courses.filter((c) => (table === 'levels' ? c.level_id : c.category_id) === row.id).length;

  // Renumbers the whole list, so rows that shared a position end up in a clear order.
  const swap = async (i, j) => {
    const order = [...rows];
    [order[i], order[j]] = [order[j], order[i]];
    const results = await Promise.all(order
      .map((row, k) => (row.position === k + 1 ? null : ctx.sb.from(table).update({ position: k + 1 }).eq('id', row.id)))
      .filter(Boolean));
    const failed = results.find((r) => r.error);
    if (failed) toast(failed.error.message, 'error');
    await ctx.refresh();
  };

  const remove = async (row) => {
    if (used(row)) {
      toast(`Move or delete the ${plural(used(row), 'course')} in this ${singular} first.`, 'error');
      return;
    }
    if (!confirm(`Delete the ${singular} “${row.name}”? Plans that mention it will no longer include it.`)) return;
    const { error } = await ctx.sb.from(table).delete().eq('id', row.id);
    if (error) toast(error.message, 'error');
    await ctx.refresh();
  };

  return h('div', null,
    h('div', { class: 'panel-head' },
      h('h2', { style: 'font-size:1.5rem' }, heading),
      toolButton(`+ Add ${singular}`, () => editStructure(ctx, table, singular, null, rows))),
    h('ol', { class: 'item-list' }, rows.map((row, i) => h('li', null,
      h('div', { class: 'item-main' },
        h('strong', null, row.name),
        h('span', null, [row.description, plural(used(row), 'course')].filter(Boolean).join(' · '))),
      h('span', { class: 'icon-buttons' },
        toolButton('↑', () => swap(i, i - 1), { label: 'Move up', disabled: i === 0 }),
        toolButton('↓', () => swap(i, i + 1), { label: 'Move down', disabled: i === rows.length - 1 }),
        toolButton('Edit', () => editStructure(ctx, table, singular, row, rows)),
        toolButton('Delete', () => remove(row), { danger: true }))))));
}

function editStructure(ctx, table, singular, row, rows) {
  const name = h('input', { value: row?.name ?? '', required: true, maxlength: table === 'levels' ? 60 : 80 });
  const description = h('textarea', { rows: 2, maxlength: 500 }, row?.description ?? '');
  const form = h('form', null,
    field('Name', name),
    field('Description', description, 'Shown to students.'),
    h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'button small' }, 'Save')));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = { name: name.value.trim(), description: description.value.trim() };
    const ok = await saving(form, async () => {
      if (row) check(await ctx.sb.from(table).update(values).eq('id', row.id));
      else {
        const position = Math.max(0, ...rows.map((r) => r.position)) + 1;
        check(await ctx.sb.from(table).insert({ ...values, position }));
      }
    });
    if (ok) {
      dialog.close();
      await ctx.refresh();
    }
  });
  const dialog = openDialog(row ? `Edit ${singular}` : `Add a ${singular}`, form);
}
