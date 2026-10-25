import {
  $, config, fill, formatDate, friendlyError, h, initialHash, initPage, linkButton, must, notice, pageUrl, param,
  plural, rupees, safeNext, sb, showFailure, toast,
} from './app.js';

const main = $('#account');
const next = safeNext(param('next'));
// Supabase puts errors from expired email links in the address fragment.
const linkError = new URLSearchParams(initialHash.replace(/^#/, '')).get('error_description');

const access = await initPage({ main });
if (access) {
  try {
    if (access.user && param('mode') === 'reset') showReset();
    else if (access.user) await showAccount();
    else showSignedOut(param('mode') === 'signup' ? 'signup' : 'signin');
  } catch (error) {
    showFailure(main, error);
  }
}

function field(label, input, hint) {
  const id = `f-${input.name}`;
  input.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint && h('small', null, hint));
}

function errorLine() {
  return h('p', { class: 'form-error', role: 'alert' });
}

function busy(form, on) {
  form.querySelectorAll('button, input').forEach((el) => { el.disabled = on; });
}

function goNext() {
  location.assign(next ?? './');
}

function authMessage(error) {
  const text = error?.message ?? '';
  if (/invalid login credentials/i.test(text)) return 'That email and password do not match. Try again or reset your password.';
  if (/email not confirmed/i.test(text)) return 'Please confirm your email first. Check your inbox for the link we sent.';
  if (/already registered/i.test(text)) return 'An account with this email already exists. Sign in instead.';
  if (/rate limit|too many/i.test(text)) return 'Too many attempts. Please wait a minute and try again.';
  return friendlyError(error);
}

function showSignedOut(mode) {
  const tabs = h('div', { class: 'switch-tabs', role: 'tablist' },
    ['signin', 'signup'].map((m) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(m === mode),
      onclick: () => showSignedOut(m),
    }, m === 'signin' ? 'Sign in' : 'Create account')));

  const form = mode === 'signup' ? signUpForm() : signInForm();
  const google = config.googleSignIn && [
    h('div', { class: 'divider' }, 'or'),
    h('button', {
      type: 'button', class: 'button small secondary', style: 'width:100%',
      onclick: () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: pageUrl(next ?? 'account.html') } }),
    }, 'Continue with Google'),
  ];

  main.replaceChildren(h('div', { class: 'auth-wrap' },
    h('div', null,
      h('p', { class: 'eyebrow' }, 'Online vocal classes'),
      h('h1', null, mode === 'signup' ? 'Create your' : 'Welcome', h('br'), h('em', null, mode === 'signup' ? 'free account.' : 'back.')),
      h('p', { class: 'muted' }, mode === 'signup'
        ? 'Your account starts with free trial classes. No payment needed.'
        : 'Sign in to continue your classes.'),
      linkError && notice({ kind: 'warn', title: 'That email link did not work.', text: `${linkError}. Please ask for a new one.` })),
    h('div', { class: 'form-card' }, tabs, form, google)));
}

function signInForm() {
  const email = h('input', { name: 'email', type: 'email', autocomplete: 'email', required: true, maxlength: 254 });
  const password = h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const error = errorLine();
  const form = h('form', null,
    field('Email', email),
    field('Password', password),
    h('div', { class: 'form-actions' },
      h('button', { class: 'button small', type: 'submit' }, 'Sign in'),
      h('button', { class: 'link-button', type: 'button', onclick: () => showEmailLink(email.value, 'forgot') }, 'Forgot password?')),
    h('p', { class: 'small', style: 'margin:16px 0 0' },
      h('button', { class: 'link-button', type: 'button', onclick: () => showEmailLink(email.value, 'link') }, 'Email me a sign-in link instead')),
    error);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    busy(form, true);
    error.textContent = '';
    const { error: failure } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
    if (failure) {
      busy(form, false);
      error.textContent = authMessage(failure);
      return;
    }
    goNext();
  });
  return form;
}

function signUpForm() {
  const name = h('input', { name: 'name', autocomplete: 'name', required: true, maxlength: 120 });
  const email = h('input', { name: 'email', type: 'email', autocomplete: 'email', required: true, maxlength: 254 });
  const phone = h('input', { name: 'phone', type: 'tel', autocomplete: 'tel', maxlength: 20, inputmode: 'tel' });
  const password = h('input', { name: 'password', type: 'password', autocomplete: 'new-password', required: true, minlength: 8 });
  const error = errorLine();
  const form = h('form', null,
    field('Your name', name, 'For a child, use the student’s name.'),
    field('Email', email),
    field('Phone (optional)', phone, 'So the school can reach you about classes.'),
    field('Password', password, 'At least 8 characters.'),
    h('div', { class: 'form-actions' }, h('button', { class: 'button small', type: 'submit' }, 'Create account')),
    error);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    busy(form, true);
    error.textContent = '';
    const { data, error: failure } = await sb.auth.signUp({
      email: email.value.trim(),
      password: password.value,
      options: {
        data: { full_name: name.value.trim(), phone: phone.value.trim() },
        emailRedirectTo: pageUrl(next ? `account.html?next=${encodeURIComponent(next)}` : 'account.html'),
      },
    });
    if (failure) {
      busy(form, false);
      error.textContent = authMessage(failure);
      return;
    }
    if (data.session) {
      goNext();
      return;
    }
    // Email confirmation is on: the account opens from the link in the email.
    form.replaceWith(notice({
      kind: 'success',
      title: 'Check your email.',
      text: `We sent a link to ${email.value.trim()}. Open it on this device to finish creating your account.`,
    }));
  });
  return form;
}

function showEmailLink(prefill, kind) {
  const email = h('input', { name: 'email', type: 'email', autocomplete: 'email', required: true, value: prefill ?? '' });
  const error = errorLine();
  const form = h('form', null,
    h('h2', null, kind === 'forgot' ? 'Reset your password' : 'Sign in with an email link'),
    h('p', { class: 'muted small' }, kind === 'forgot'
      ? 'We will email you a link to choose a new password.'
      : 'We will email you a link that signs you in. No password needed.'),
    field('Email', email),
    h('div', { class: 'form-actions' },
      h('button', { class: 'button small', type: 'submit' }, 'Send the link'),
      h('button', { class: 'link-button', type: 'button', onclick: () => showSignedOut('signin') }, 'Back to sign in')),
    error);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    busy(form, true);
    const address = email.value.trim();
    const { error: failure } = kind === 'forgot'
      ? await sb.auth.resetPasswordForEmail(address, { redirectTo: pageUrl('account.html?mode=reset') })
      : await sb.auth.signInWithOtp({ email: address, options: { emailRedirectTo: pageUrl(next ?? 'account.html') } });
    if (failure) {
      busy(form, false);
      error.textContent = authMessage(failure);
      return;
    }
    form.replaceWith(notice({
      kind: 'success',
      title: 'Check your email.',
      text: `If ${address} has an account, a link is on its way. It works once and expires after an hour.`,
    }));
  });
  $('.form-card', main).replaceChildren(form);
}

function showReset() {
  const password = h('input', { name: 'password', type: 'password', autocomplete: 'new-password', required: true, minlength: 8 });
  const error = errorLine();
  const form = h('form', { class: 'form-card' },
    h('h2', null, 'Choose a new password'),
    field('New password', password, 'At least 8 characters.'),
    h('div', { class: 'form-actions' }, h('button', { class: 'button small', type: 'submit' }, 'Save password')),
    error);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    busy(form, true);
    const { error: failure } = await sb.auth.updateUser({ password: password.value });
    if (failure) {
      busy(form, false);
      error.textContent = authMessage(failure);
      return;
    }
    toast('Your new password is saved.');
    history.replaceState(null, '', 'account.html');
    await showAccount();
  });
  main.replaceChildren(h('div', { class: 'auth-wrap' }, h('div', null, h('h1', null, 'New password')), form));
}

async function showAccount() {
  const [subscriptions, payments] = await Promise.all([
    sb.from('subscriptions').select('id, starts_at, ends_at, source, plans(name)')
      .eq('user_id', access.user.id).order('ends_at', { ascending: false }).then(must),
    sb.from('payments').select('id, created_at, amount_paise, status, razorpay_payment_id, plans(name)')
      .eq('user_id', access.user.id).order('created_at', { ascending: false }).then(must),
  ]);
  const { profile, trial, isStaff } = access;
  const now = new Date();

  const name = h('input', { name: 'name', autocomplete: 'name', maxlength: 120, value: profile.full_name });
  const phone = h('input', { name: 'phone', type: 'tel', autocomplete: 'tel', maxlength: 20, value: profile.phone });
  const details = h('form', { class: 'form-card' },
    h('h2', null, 'Your details'),
    field('Name', name),
    field('Phone', phone),
    h('p', { class: 'small muted' }, `Email: ${access.user.email}`),
    h('div', { class: 'form-actions' },
      h('button', { class: 'button small', type: 'submit' }, 'Save'),
      h('button', { class: 'link-button', type: 'button', onclick: showReset }, 'Change password')));
  details.addEventListener('submit', async (event) => {
    event.preventDefault();
    const { error } = await sb.from('profiles')
      .update({ full_name: name.value.trim(), phone: phone.value.trim() })
      .eq('id', access.user.id);
    toast(error ? friendlyError(error) : 'Saved.', error ? 'error' : 'info');
  });

  const trialText = {
    not_started: `${plural(trial.lessons, 'free class', 'free classes')} waiting. The trial starts with your first class.`,
    active: `${plural(trial.lessons - trial.used, 'free class', 'free classes')} left, until ${formatDate(trial.ends_at ?? now)}.`,
    used_up: `All free classes used. They stay open until ${formatDate(trial.ends_at ?? now)}.`,
    ended: 'Your free trial has ended.',
  }[trial.state];

  const plans = h('div', { class: 'form-card' },
    h('h2', null, 'Your plans'),
    subscriptions.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'simple-table' },
      h('thead', null, h('tr', null, h('th', null, 'Plan'), h('th', null, 'From'), h('th', null, 'Until'), h('th', null, 'Status'))),
      h('tbody', null, subscriptions.map((s) => h('tr', null,
        h('td', null, s.plans?.name ?? 'Plan', s.source === 'manual' ? h('div', { class: 'muted small' }, 'Given by the school') : null),
        h('td', null, formatDate(s.starts_at)),
        h('td', null, formatDate(s.ends_at)),
        h('td', null, new Date(s.ends_at) <= now ? 'Ended' : new Date(s.starts_at) > now ? 'Starts later' : 'Active')))))) : h('p', { class: 'muted' }, 'No plans yet.'),
    h('p', { class: 'small', style: 'margin-top:14px' }, h('strong', null, 'Free trial: '), trialText),
    h('div', { class: 'form-actions' }, linkButton('See plans', 'plans.html', true)));

  const paymentsCard = payments.length && h('div', { class: 'form-card' },
    h('h2', null, 'Payments'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'simple-table' },
      h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Plan'), h('th', null, 'Amount'), h('th', null, 'Status'))),
      h('tbody', null, payments.map((p) => h('tr', null,
        h('td', null, formatDate(p.created_at)),
        h('td', null, p.plans?.name ?? ''),
        h('td', null, rupees(p.amount_paise)),
        h('td', null, p.status === 'paid' ? 'Paid' : 'Not completed', p.razorpay_payment_id && h('div', { class: 'muted small' }, p.razorpay_payment_id))))))));

  const signOut = h('button', { class: 'button small secondary', type: 'button' }, 'Sign out');
  signOut.addEventListener('click', async () => {
    await sb.auth.signOut();
    location.assign('./');
  });

  fill(main,
    h('div', { class: 'course-head' },
      h('div', null,
        h('p', { class: 'eyebrow' }, 'My account'),
        h('h1', null, profile.full_name ? `Hello, ${profile.full_name}.` : 'Hello.')),
      h('div', { class: 'notice-actions' },
        isStaff && linkButton('Open the studio', 'studio.html'),
        linkButton('My classes', './#paths', true),
        signOut)),
    next && notice({ title: 'You are signed in.', text: 'Continue where you were.', actions: [linkButton('Continue', next)] }),
    next && h('div', { class: 'spacer' }),
    h('div', { class: 'account-grid' }, plans, details, paymentsCard));
}
