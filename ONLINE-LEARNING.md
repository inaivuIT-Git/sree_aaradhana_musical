# Online vocal classes (`/learn`)

Online learning for Sree Aaradhana: students sign up, try a few classes free, then
buy a plan. Teachers upload videos and audio once and arrange them into courses by
category (movie songs, sarali varisai, devotional, classic Carnatic…) and level
(novice, beginner, intermediate, advanced…).

The pages are plain HTML and JavaScript in `learn/`, served by Hostinger like the
rest of the site, with no build step. Sign-in, the database, the media files and
the payment checks run on [Supabase](https://supabase.com). Payments go through
[Razorpay](https://razorpay.com).

Until `learn/js/config.js` has the Supabase settings, every `/learn` page says
“Online classes are coming soon” and offers WhatsApp and phone, so merging this
before setup is safe.

## How it works

| Idea | What it means |
| --- | --- |
| Media library | Every video and audio is uploaded once. |
| Class | A lesson: title, description and its recordings in order. A recording can be in many classes. |
| Course | One category at one level, such as *Movie songs · Beginner*. It lists classes in order. A class can be in many courses, so the material can be rearranged without uploading again. |
| Plan | A price for a number of days that opens courses by category and/or level: *all movie songs*, *the beginner level of every category*, *Carnatic basics · Novice*, or *everything*. |
| Free trial | Every account can open **5 classes within 7 days** of its first class, whichever runs out first. Teachers can change both numbers and choose which courses are in the trial. |

The trial starts only when a student opens their first class, and the page asks
before it uses one (“Use a free class”). Renewing a plan early adds the new days
after the current period, so nothing is lost. Students who pay at the school
get access from the studio’s **Students → Give a plan**.

### Who can see what

The database enforces access, not the browser. The rules are in
`supabase/migrations/` and tested in `supabase/tests/`.

- Anyone can browse published courses, class titles and plans.
- A recording plays only for a signed-in student who can open a class that
  contains it (through a plan or a trial class), and for teachers. The page gets a
  private link that works for 4 hours.
- Students can change only their name and phone. Roles, trial dates, payments
  and plans change only through the database functions.
- A plan opens only after Razorpay confirms the payment. The amount always comes
  from the plan in the database, never from the browser.

Known limits:

- During those 4 hours a determined student could save the video file. If that
  becomes a problem, move the videos to a streaming service with DRM, such as
  Bunny Stream, Mux or Cloudflare Stream. The classes and plans stay as they are.
- One person can make a second account with another email for a second trial.

## One-time setup

### 1. Supabase project

1. Create a project at supabase.com. Choose the **Mumbai** region for students in
   India.
2. Videos need room. The free plan has small storage and a small upload limit per
   file, so use a paid plan for real classes. Check supabase.com/pricing for
   current storage and bandwidth allowances. Then raise the upload limit in
   **Storage → Settings** (2 GB per file is plenty).
3. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and run, from
   this repository:

   ```sh
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   This creates the tables, the access rules, the private `lesson-media` bucket
   and the starting levels and categories.

### 2. Sign-in emails

In **Authentication → URL Configuration**:

- Site URL: `https://www.sreeaaradhana.in/learn/`
- Redirect URLs: `https://www.sreeaaradhana.in/learn/**` and
  `https://sreeaaradhana.in/learn/**`

In **Authentication → Emails → SMTP Settings**, connect a real mailbox, for
example a Hostinger email account (`smtp.hostinger.com`, port 465). Supabase’s
built-in sender is for testing only: it sends very few emails, and only to the
project’s team. Without your own SMTP, students will not get their confirmation
and password-reset emails. You can also reword the email templates there.

Optional: to offer “Continue with Google”, set up the Google provider in
**Authentication → Sign In / Providers**, then set `googleSignIn: true` in
`learn/js/config.js`.

### 3. Connect the pages

In **Project Settings → API**, copy the project URL and the publishable (anon)
key into `learn/js/config.js`:

```js
supabaseUrl: 'https://<your-project-ref>.supabase.co',
supabaseKey: '<publishable or anon key>',
```

These two values are meant to be public. Never put the secret or service-role key
in the website.

### 4. The first admin

Deploy the site (step 6), create an account at
`https://www.sreeaaradhana.in/learn/account.html`, then run this in Supabase’s
**SQL Editor**:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'owner@example.com');
```

After that, use **Studio → Students** to make teachers. Teachers manage classes,
courses, plans and students. Admins can also change roles.

### 5. Razorpay (when ready to take payments)

Until this is done, the plans page asks students to WhatsApp or call the school,
and teachers open plans with **Give a plan**.

1. Create a Razorpay account and complete KYC. Start with **Test mode** keys.
2. Add the keys to Supabase and deploy the payment functions:

   ```sh
   supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=xxx RAZORPAY_WEBHOOK_SECRET=choose-a-long-random-string
   supabase functions deploy create-order
   supabase functions deploy verify-payment
   supabase functions deploy razorpay-webhook
   ```

3. In the Razorpay Dashboard, go to **Webhooks → Add**:
   - URL: `https://<your-project-ref>.supabase.co/functions/v1/razorpay-webhook`
   - Secret: the same `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured` and `order.paid`

   The webhook opens the plan even if the student closes the page during
   payment.
4. Set `onlinePayments: true` in `learn/js/config.js`, deploy, and buy a plan
   with a Razorpay test card or UPI.
5. Switch to the live keys with `supabase secrets set …`, and add a live-mode
   webhook.

Razorpay charges a fee on each payment. Check their current pricing.

### 6. Deploy the pages

Same as the rest of the site: merge into `main`, then
**hPanel → Websites → sreeaaradhana.in → Advanced → Git → Deploy**, or let
automatic deployment do it. `.htaccess` keeps `supabase/`, `tests/` and the
Markdown notes from being served.

## Teacher workflow (Studio)

Open **Learn online → Studio** while signed in as a teacher.

1. **Media library**: upload videos and audio. MP4 video (H.264/AAC, 720p) and
   MP3 or M4A audio play on every phone. At 720p and about 1.5 Mbps, a 10-minute
   video is about 110 MB. Large files continue if the connection drops briefly.
2. **Classes**: create a class, add its recordings in order (for example the
   demonstration video, then a practice track with the shruti), and tick the
   courses it belongs to.
3. **Courses**: in the category × level grid, add a course, arrange its classes,
   choose whether it is part of the free trial, and publish it when ready. Rename,
   reorder, add or remove levels and categories under the grid.
4. **Plans**: set the price, the number of days and what the plan opens. Untick
   “On sale” to stop selling a plan without affecting students who have it.
5. **Students**: see trials and plans, give a plan to someone who paid at the
   school, end a plan, and (admins) make teachers.
6. **Trial settings**: number of free classes and days.

## Files

| Path | What it is |
| --- | --- |
| `learn/*.html` | Pages: home, course, class, plans, account, studio |
| `learn/js/config.js` | Supabase and payment settings |
| `learn/js/app.js` | Shared helpers: sign-in state, formatting, messages |
| `learn/js/studio/` | Studio tabs |
| `learn/css/learn.css` | Styles, on top of `assets/css/modern.css` |
| `supabase/migrations/` | Tables, access rules, trial and payment functions |
| `supabase/functions/` | Razorpay order, verification and webhook |
| `supabase/tests/database/` | Access-rule tests (pgTAP) |
| `tests/` | Unit tests for the Razorpay signature checks |

## Local development and tests

Needs Docker, the Supabase CLI and Node 22.

```sh
supabase start                                   # local database, sign-in, storage and functions
supabase test db                                 # access rules
node --test tests/*.test.mjs                     # Razorpay signature checks
python3 -m http.server 8080                      # then open http://127.0.0.1:8080/learn/
```

For local pages, temporarily put the local API URL and anon key from
`supabase status` in `learn/js/config.js`, and do not commit them. To try
payments locally, put Razorpay test keys in a file and run
`supabase functions serve --env-file <that file>`.
