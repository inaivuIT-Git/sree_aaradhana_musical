import { config, formatDuration, formatSize, friendlyError, h, plural, toast } from '../app.js';
import { check, field, openDialog, saving, toolButton } from './ui.js';

const BUCKET = 'lesson-media';
// Supabase's resumable uploads need exactly 6 MB chunks.
const CHUNK = 6 * 1024 * 1024;

export function mediaPanel(panel, ctx) {
  const files = h('input', { type: 'file', multiple: true, accept: 'video/*,audio/*' });
  const queue = h('ul', { class: 'item-list' });
  const start = h('button', { type: 'button', class: 'button small' }, 'Upload');
  start.addEventListener('click', async () => {
    const chosen = [...files.files];
    if (!chosen.length) {
      toast('Choose one or more video or audio files first.', 'error');
      return;
    }
    start.disabled = true;
    files.disabled = true;
    let uploaded = 0;
    for (const file of chosen) {
      if (await uploadOne(ctx, file, queue)) uploaded += 1;
    }
    start.disabled = false;
    files.disabled = false;
    files.value = '';
    if (uploaded) {
      toast(`${plural(uploaded, 'file')} uploaded.`);
      await ctx.refresh();
    }
  });

  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search recordings', 'aria-label': 'Search recordings' });
  const list = h('ul', { class: 'item-list' });
  const draw = () => {
    const term = search.value.trim().toLowerCase();
    const rows = ctx.data.media.filter((m) => !term || m.title.toLowerCase().includes(term));
    list.replaceChildren(...(rows.length ? rows.map((m) => mediaRow(ctx, m)) : [h('li', { class: 'empty' },
      ctx.data.media.length ? 'No recordings match.' : 'No recordings yet. Upload your first video or audio above.')]));
  };
  search.addEventListener('input', draw);
  draw();

  panel.replaceChildren(
    h('div', { class: 'panel-head' }, h('div', null,
      h('h2', null, 'Media library'),
      h('p', null, 'Upload each video or audio once, then use it in any class. Students can only play a recording when they can open a class that contains it.'))),
    h('div', { class: 'upload-box' },
      field('Video or audio files', files, 'MP4 video and MP3 or M4A audio play on every phone. Large files keep uploading if the connection drops briefly.'),
      h('div', { class: 'form-actions' }, start),
      queue),
    search,
    h('div', { class: 'spacer' }),
    list);
}

function usedIn(ctx, media) {
  return ctx.data.lessons.filter((l) => l.lesson_media.some((r) => r.media_id === media.id));
}

function mediaRow(ctx, m) {
  const classes = usedIn(ctx, m);
  return h('li', null,
    h('div', { class: 'item-main' },
      h('strong', null, `${m.kind === 'video' ? '🎬' : '🎧'} ${m.title}`),
      h('span', null, [
        m.kind === 'video' ? 'Video' : 'Audio',
        formatDuration(m.duration_seconds),
        formatSize(m.size_bytes),
        classes.length ? `In ${plural(classes.length, 'class', 'classes')}` : 'Not in a class yet',
      ].filter(Boolean).join(' · '))),
    h('span', { class: 'icon-buttons' },
      toolButton('Play', () => preview(ctx, m)),
      toolButton('Rename', () => rename(ctx, m)),
      toolButton('Delete', () => remove(ctx, m, classes), { danger: true })));
}

async function preview(ctx, m) {
  const { data, error } = await ctx.sb.storage.from(BUCKET).createSignedUrl(m.storage_path, 60 * 60);
  if (error) {
    toast(friendlyError(error), 'error');
    return;
  }
  const player = h(m.kind, { src: data.signedUrl, controls: true, autoplay: true, style: 'width:100%' });
  const dialog = openDialog(m.title, h('div', { class: 'panel-body' }, player));
  dialog.addEventListener('close', () => player.pause());
}

function rename(ctx, m) {
  const title = h('input', { value: m.title, required: true, maxlength: 160 });
  const form = h('form', null, field('Name', title, 'Students see this name in the class.'),
    h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'button small' }, 'Save')));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const ok = await saving(form, async () => {
      check(await ctx.sb.from('media').update({ title: title.value.trim() }).eq('id', m.id));
    });
    if (ok) {
      dialog.close();
      await ctx.refresh();
    }
  });
  const dialog = openDialog('Rename recording', form);
}

async function remove(ctx, m, classes) {
  const where = classes.length
    ? ` It is used in ${plural(classes.length, 'class', 'classes')} (${classes.map((c) => c.title).join(', ')}) and will be removed from them.`
    : '';
  if (!confirm(`Delete “${m.title}” permanently?${where}`)) return;
  const { error: storageError } = await ctx.sb.storage.from(BUCKET).remove([m.storage_path]);
  if (storageError) {
    toast(friendlyError(storageError), 'error');
    return;
  }
  const { error } = await ctx.sb.from('media').delete().eq('id', m.id);
  if (error) toast(friendlyError(error), 'error');
  else toast('Recording deleted.');
  await ctx.refresh();
}

// Some computers do not report a file's type, so fall back to its extension.
const BY_EXTENSION = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg',
};

function typeOf(file) {
  return file.type || BY_EXTENSION[file.name.split('.').pop().toLowerCase()] || '';
}

function kindOf(type) {
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return null;
}

function titleFrom(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 160) || 'Recording';
}

function storageName(name) {
  const clean = name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-80);
  return clean.replace(/^[-.]+/, '') || 'file';
}

function readDuration(file, kind) {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(value) ? Math.round(value) : null);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(null);
    setTimeout(() => done(null), 15000);
    el.src = url;
  });
}

function sendFile(ctx, file, type, path, onProgress) {
  if (file.size <= CHUNK || !window.tus) {
    return ctx.sb.storage.from(BUCKET).upload(path, file, { contentType: type, upsert: false })
      .then(({ error }) => {
        if (error) throw error;
        onProgress(1);
      });
  }
  return new Promise((resolve, reject) => {
    const upload = new window.tus.Upload(file, {
      endpoint: `${config.supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { apikey: config.supabaseKey, 'x-upsert': 'false' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: BUCKET, objectName: path, contentType: type, cacheControl: '3600' },
      chunkSize: CHUNK,
      // Long uploads can outlast a sign-in token, so each request asks for a fresh one.
      onBeforeRequest: async (req) => {
        const { data } = await ctx.sb.auth.getSession();
        req.setHeader('Authorization', `Bearer ${data.session?.access_token ?? ''}`);
      },
      onProgress: (sent, total) => onProgress(sent / total),
      onError: reject,
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

async function uploadOne(ctx, file, queue) {
  const bar = h('span');
  const status = h('span', null, 'Waiting…');
  queue.append(h('li', null,
    h('div', { class: 'item-main' }, h('strong', null, file.name), status, h('div', { class: 'progress' }, bar))));
  const type = typeOf(file);
  const kind = kindOf(type);
  if (!kind) {
    status.textContent = 'Skipped: only video and audio files can be uploaded.';
    return false;
  }
  const path = `${crypto.randomUUID()}/${storageName(file.name)}`;
  try {
    status.textContent = 'Reading…';
    const duration = await readDuration(file, kind);
    status.textContent = `Uploading ${formatSize(file.size)}…`;
    await sendFile(ctx, file, type, path, (fraction) => {
      bar.style.width = `${Math.round(fraction * 100)}%`;
      status.textContent = `Uploading ${formatSize(file.size)}… ${Math.round(fraction * 100)}%`;
    });
    const { error } = await ctx.sb.from('media').insert({
      kind,
      title: titleFrom(file.name),
      storage_path: path,
      mime_type: type.slice(0, 100),
      size_bytes: file.size,
      duration_seconds: duration,
    });
    if (error) {
      await ctx.sb.storage.from(BUCKET).remove([path]);
      throw error;
    }
    status.textContent = 'Uploaded.';
    return true;
  } catch (error) {
    console.error(error);
    bar.style.width = '0';
    const tooBig = /maximum allowed size|too large|413/i.test(error?.message ?? '');
    status.textContent = tooBig
      ? 'Failed: the file is larger than the storage upload limit. See ONLINE-LEARNING.md to raise it.'
      : `Failed: ${friendlyError(error)}`;
    return false;
  }
}
