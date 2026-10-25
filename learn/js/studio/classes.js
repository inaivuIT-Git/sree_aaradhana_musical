import { formatDuration, h, plural, toast } from '../app.js';
import { check, checkField, field, openDialog, orderedList, saveOrder, saving, toolButton } from './ui.js';

export function classesPanel(panel, ctx) {
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search classes', 'aria-label': 'Search classes' });
  const list = h('ul', { class: 'item-list' });
  const draw = () => {
    const term = search.value.trim().toLowerCase();
    const rows = ctx.data.lessons.filter((l) => !term || l.title.toLowerCase().includes(term));
    list.replaceChildren(...(rows.length ? rows.map((lesson) => classRow(ctx, lesson)) : [h('li', { class: 'empty' },
      ctx.data.lessons.length ? 'No classes match.' : 'No classes yet. Upload recordings in the Media library, then create a class.')]));
  };
  search.addEventListener('input', draw);
  draw();

  panel.replaceChildren(
    h('div', { class: 'panel-head' },
      h('div', null,
        h('h2', null, 'Classes'),
        h('p', null, 'A class is a lesson: a title, a description and its recordings (videos and practice audio). Put one class into as many courses as you like.')),
      h('button', { type: 'button', class: 'button small', onclick: () => editClass(ctx, null) }, '+ New class')),
    search,
    h('div', { class: 'spacer' }),
    list);
}

function coursesWith(ctx, lessonId) {
  return ctx.data.courses.filter((c) => c.course_lessons.some((r) => r.lesson_id === lessonId));
}

function classRow(ctx, lesson) {
  const media = lesson.lesson_media.map((r) => ctx.data.mediaById.get(r.media_id)).filter(Boolean);
  const videos = media.filter((m) => m.kind === 'video').length;
  const audios = media.length - videos;
  const courses = coursesWith(ctx, lesson.id);
  return h('li', null,
    h('div', { class: 'item-main' },
      h('strong', null, lesson.title),
      h('span', null, [
        media.length ? [videos && plural(videos, 'video'), audios && plural(audios, 'audio', 'audios')].filter(Boolean).join(', ') : 'No recordings yet',
        courses.length ? `In ${courses.map((c) => ctx.courseLabel(c)).join('; ')}` : 'Not in any course yet',
      ].join(' · '))),
    h('span', { class: 'icon-buttons' },
      toolButton('Edit', () => editClass(ctx, lesson)),
      toolButton('Delete', () => deleteClass(ctx, lesson), { danger: true })));
}

async function deleteClass(ctx, lesson) {
  const courses = coursesWith(ctx, lesson.id).length;
  const where = courses ? ` It will be removed from ${plural(courses, 'course')}.` : '';
  if (!confirm(`Delete the class “${lesson.title}”?${where} The recordings stay in the Media library.`)) return;
  const { error } = await ctx.sb.from('lessons').delete().eq('id', lesson.id);
  if (error) toast(error.message, 'error');
  else toast('Class deleted.');
  await ctx.refresh();
}

export function editClass(ctx, lesson) {
  const { media: library, mediaById, courses } = ctx.data;
  const title = h('input', { value: lesson?.title ?? '', required: true, maxlength: 120 });
  const description = h('textarea', { rows: 5, maxlength: 4000, placeholder: 'What to practise, the song’s raga and tala, lyrics…' }, lesson?.description ?? '');

  const describe = (m) => [h('strong', null, `${m.kind === 'video' ? '🎬' : '🎧'} ${m.title}`),
    h('span', null, [m.kind === 'video' ? 'Video' : 'Audio', formatDuration(m.duration_seconds)].filter(Boolean).join(' · '))];
  const list = orderedList(
    (lesson?.lesson_media ?? []).map((r) => mediaById.get(r.media_id)).filter(Boolean),
    describe,
    'No recordings yet. Add them from the library below.');

  const picker = h('select', { style: 'max-width:420px' });
  const fillPicker = () => {
    const inList = new Set(list.items.map((m) => m.id));
    const options = library.filter((m) => !inList.has(m.id));
    picker.replaceChildren(h('option', { value: '' }, library.length
      ? (options.length ? 'Choose a recording to add…' : 'Every recording is already in this class')
      : 'Upload recordings in the Media library first'),
    ...options.map((m) => h('option', { value: m.id }, `${m.kind === 'video' ? 'Video' : 'Audio'}: ${m.title}`)));
  };
  fillPicker();
  list.element.addEventListener('click', () => setTimeout(fillPicker));

  const before = new Set(lesson ? coursesWith(ctx, lesson.id).map((c) => c.id) : []);
  const courseBoxes = courses
    .slice()
    .sort((a, b) => ctx.courseLabel(a).localeCompare(ctx.courseLabel(b)))
    .map((course) => ({ course, input: h('input', { type: 'checkbox', checked: before.has(course.id) }) }));

  const form = h('form', null,
    field('Title', title),
    field('Description', description, 'Shown with the class. Line breaks are kept.'),
    h('h3', null, 'Recordings, in the order students see them'),
    list.element,
    h('div', { class: 'form-actions' }, picker, toolButton('Add recording', () => {
      const item = mediaById.get(picker.value);
      if (!item) return;
      list.add(item);
      fillPicker();
    })),
    h('h3', null, 'Courses this class is in'),
    courseBoxes.length
      ? courseBoxes.map(({ course, input }) => checkField(`${ctx.courseLabel(course)}${course.is_published ? '' : ' (draft)'}`, input))
      : h('p', { class: 'empty' }, 'No courses yet. Add one in the Courses tab.'),
    h('div', { class: 'form-actions' },
      h('button', { type: 'submit', class: 'button small' }, lesson ? 'Save class' : 'Create class')));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const ok = await saving(form, async () => {
      const values = { title: title.value.trim(), description: description.value.trim() };
      let id = lesson?.id;
      if (id) check(await ctx.sb.from('lessons').update(values).eq('id', id));
      else id = check(await ctx.sb.from('lessons').insert(values).select('id').single()).id;

      await saveOrder(ctx.sb, 'lesson_media', 'lesson_id', id, 'media_id',
        (lesson?.lesson_media ?? []).map((r) => r.media_id), list.items.map((m) => m.id));

      for (const { course, input } of courseBoxes) {
        if (input.checked && !before.has(course.id)) {
          // New classes go to the end of the course.
          const position = Math.max(-1, ...course.course_lessons.map((r) => r.position)) + 1;
          check(await ctx.sb.from('course_lessons').insert({ course_id: course.id, lesson_id: id, position }));
        } else if (!input.checked && before.has(course.id)) {
          check(await ctx.sb.from('course_lessons').delete().eq('course_id', course.id).eq('lesson_id', id));
        }
      }
    });
    if (ok) {
      dialog.close();
      toast(lesson ? 'Class saved.' : 'Class created.');
      await ctx.refresh();
    }
  });

  const dialog = openDialog(lesson ? 'Edit class' : 'New class', form);
}
