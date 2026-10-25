import {
  $, byId, config, contactActions, describeRule, formatDate, formatPeriod, friendlyError, h, initPage,
  linkButton, loadAccess, must, notice, plural, rupees, ruleCovers, sb, showFailure, trialAvailable,
} from './app.js';

const main = $('#plans');
let access = await initPage({ main });
let catalogue;
if (access) load().catch((error) => showFailure(main, error));

async function load(message) {
  if (!catalogue) {
    const [plans, levels, categories, courses] = await Promise.all([
      sb.from('plans')
        .select('id, name, description, price_paise, duration_days, position, plan_access(category_id, level_id)')
        .eq('is_active', true)
        .order('position')
        .order('price_paise')
        .then(must),
      sb.from('levels').select('id, name').then(must),
      sb.from('categories').select('id, name').then(must),
      sb.from('courses').select('id, category_id, level_id, course_lessons(count)').eq('is_published', true).then(must),
    ]);
    catalogue = { plans, levels: byId(levels), categories: byId(categories), courses };
  }
  render(message);
}

function render(message) {
  const { plans } = catalogue;
  const intro = [];
  if (message) intro.push(message);
  if (!config.onlinePayments) {
    intro.push(notice({
      title: 'Join through the school.',
      text: 'Online payment is not open yet. Message or call the school to choose a plan, and a teacher will open it for you.',
      actions: contactActions(),
    }));
  } else if (!access.user || (trialAvailable(access) && !access.subscriptions.length && !access.isStaff)) {
    intro.push(notice({
      title: 'Not sure yet?',
      text: `Try ${plural(access.trial.lessons, 'class', 'classes')} free first. No payment needed.`,
      actions: [linkButton(access.user ? 'Browse courses' : 'Start your free trial', access.user ? './#paths' : 'account.html?mode=signup')],
    }));
  }

  main.replaceChildren(
    ...intro.flatMap((el) => [el, h('div', { class: 'spacer' })]),
    plans.length
      ? h('div', { class: 'plan-grid' }, plans.map(planCard))
      : notice({ title: 'Plans will be announced soon.', text: 'Contact the school to join.', actions: contactActions() }),
    h('p', { class: 'muted small', style: 'margin-top:28px' },
      'Payments are handled securely by Razorpay: UPI, cards and net banking.'),
  );
}

function planCard(plan) {
  const { levels, categories, courses } = catalogue;
  const covered = courses.filter((course) => plan.plan_access.some((rule) => ruleCovers(rule, course)));
  const classCount = covered.reduce((sum, c) => sum + (c.course_lessons?.[0]?.count ?? 0), 0);
  const current = access.subscriptions.filter((s) => s.plan_id === plan.id);
  const until = current.length ? current[current.length - 1].ends_at : null;

  let action;
  if (!config.onlinePayments) {
    action = h('a', {
      class: 'button small',
      href: `https://wa.me/${config.schoolWhatsApp}?text=${encodeURIComponent(`Hello Sree Aaradhana, I would like to join the online plan "${plan.name}".`)}`,
      target: '_blank', rel: 'noopener noreferrer',
    }, 'Ask the school to join ↗');
  } else if (!access.user) {
    action = linkButton('Sign up to choose this plan', 'account.html?mode=signup&next=plans.html');
  } else {
    action = h('button', { class: 'button small', type: 'button' },
      until ? `Renew: add ${formatPeriod(plan.duration_days)}` : 'Choose this plan');
    action.addEventListener('click', () => buy(plan, action));
  }

  return h('article', { class: `plan-card${until ? ' current' : ''}` },
    until && h('span', { class: 'pill open' }, `Yours until ${formatDate(until)}`),
    h('h3', null, plan.name),
    h('div', { class: 'price' }, rupees(plan.price_paise), h('small', null, ` for ${formatPeriod(plan.duration_days)}`)),
    plan.description && h('p', { class: 'muted small', style: 'margin:0' }, plan.description),
    h('ul', null, plan.plan_access.map((rule) => h('li', null, describeRule(rule, categories, levels)))),
    h('p', { class: 'small', style: 'margin:0' },
      covered.length ? `${plural(covered.length, 'course')} · ${plural(classCount, 'class', 'classes')} today` : 'Courses coming soon'),
    action);
}

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = h('script', { src: 'https://checkout.razorpay.com/v1/checkout.js' });
    script.onload = resolve;
    script.onerror = () => reject(new Error('Razorpay Checkout could not load. Check your connection and try again.'));
    document.head.append(script);
  });
}

async function functionError(error) {
  try {
    const body = await error.context.json();
    if (body?.error) return body.error;
  } catch {
    // Not a JSON reply; fall through.
  }
  return friendlyError(error);
}

async function buy(plan, button) {
  button.disabled = true;
  try {
    const { data: order, error } = await sb.functions.invoke('create-order', { body: { plan_id: plan.id } });
    if (error) throw new Error(await functionError(error));
    await loadCheckout();
    const checkout = new window.Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: 'Sree Aaradhana School of Music',
      description: order.plan_name,
      image: new URL('../assets/images/academy-logo.jpeg', location.href).href,
      prefill: { name: order.name || access.profile?.full_name || '', email: order.email, contact: access.profile?.phone || '' },
      theme: { color: '#027206' },
      handler: (response) => confirm(plan, response),
      modal: { ondismiss: () => { button.disabled = false; } },
    });
    checkout.on('payment.failed', (response) => {
      button.disabled = false;
      render(notice({
        kind: 'warn',
        title: 'The payment did not go through.',
        text: `${response.error?.description ?? 'Please try again.'} No money has been taken for a failed payment.`,
      }));
    });
    checkout.open();
  } catch (error) {
    button.disabled = false;
    render(notice({ kind: 'warn', title: 'The payment could not start.', text: error.message }));
  }
}

async function confirm(plan, response) {
  render(notice({ title: 'Confirming your payment…', text: 'Please keep this page open.' }));
  const { data, error } = await sb.functions.invoke('verify-payment', { body: response });
  if (error) {
    render(notice({
      kind: 'warn',
      title: 'We are still confirming your payment.',
      text: `${await functionError(error)} If money was taken, your plan opens automatically within a few minutes: refresh this page to check. Still not open? Contact the school with payment ID ${response.razorpay_payment_id}.`,
      actions: contactActions(`Hello Sree Aaradhana, I paid for "${plan.name}" (payment ID ${response.razorpay_payment_id}) but it has not opened yet.`),
    }));
    return;
  }
  access = await loadAccess();
  const sub = must(await sb.from('subscriptions').select('starts_at, ends_at').eq('id', data.subscription_id).single());
  window.scrollTo({ top: 0, behavior: 'smooth' });
  render(notice({
    kind: 'success',
    title: 'Payment received. Thank you!',
    text: new Date(sub.starts_at) > new Date()
      ? `${plan.name} is extended until ${formatDate(sub.ends_at)}.`
      : `${plan.name} is open until ${formatDate(sub.ends_at)}.`,
    actions: [linkButton('Start learning', './#paths')],
  }));
}
