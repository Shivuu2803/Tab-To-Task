/**
 * Generates Chrome Web Store listing assets from the REAL extension.
 *
 * Every screenshot is a capture of the built extension running in Chrome, then
 * composited onto a 1280x800 canvas with a caption. Nothing here is a mockup —
 * store reviewers reject listings whose screenshots do not match the product,
 * and users notice too.
 *
 * Outputs to store-assets/:
 *   screenshot-1..5.png   1280x800, the store's preferred size
 *   promo-small.png       440x280, the small promo tile
 *
 * Run with: npm run build && npm run store-assets
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = resolve(ROOT, 'dist');
const OUT = resolve(ROOT, 'store-assets');
const PROFILE = resolve(ROOT, '.chrome-assets-profile');
const PORT = 8911;

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];
const CHROME = process.env.CHROME_PATH ?? CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  console.error('Chrome not found. Set CHROME_PATH.');
  process.exit(1);
}
if (!existsSync(resolve(EXT, 'manifest.json'))) {
  console.error('dist/manifest.json missing. Run `npm run build` first.');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
rmSync(PROFILE, { recursive: true, force: true });

// --- CDP plumbing ----------------------------------------------------------

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'] },
);

const [, , , wfd, rfd] = chrome.stdio;
let nextId = 0;
const pending = new Map();
let buf = Buffer.alloc(0);

rfd.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  let i;
  while ((i = buf.indexOf(0)) !== -1) {
    const raw = buf.subarray(0, i).toString('utf8');
    buf = buf.subarray(i + 1);
    if (!raw) continue;
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    }
  }
});

const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = ++nextId;
    pending.set(id, { res, rej });
    wfd.write(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }) + '\0');
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        rej(new Error(`timeout: ${method}`));
      }
    }, 25000);
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Opens a page, runs setup, screenshots it, closes it. */
async function capture({ url, width, height, scale = 2, dark = false, beforeLoad, setup }) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: scale, mobile: false },
    sessionId,
  );
  await send(
    'Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] },
    sessionId,
  );

  if (beforeLoad) {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: beforeLoad }, sessionId);
  }

  await send('Page.navigate', { url }, sessionId);
  await sleep(1600);

  const evaluate = (expression) =>
    send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
      .then((r) => r.result.value);

  if (dark) await evaluate(`document.documentElement.classList.add('dark'); true`);
  if (setup) {
    await evaluate(setup);
    await sleep(1200);
  }

  const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await send('Target.closeTarget', { targetId });
  return data; // base64
}

// --- demo content ----------------------------------------------------------

const DEMO_TASKS = `(async () => {
  const t = (host, title, action, ago, done) => ({
    id: host, title, url: 'https://' + host, pageTitle: title,
    faviconUrl: null, nextAction: action, notes: '',
    createdAt: Date.now() - ago, updatedAt: Date.now(),
    completedAt: done ? Date.now() - ago : null, deletedAt: null,
  });
  await chrome.storage.local.set({
    'task:a': t('jobs.lever.co/northwind/senior-engineer', 'Senior Engineer at Northwind', 'Apply before Friday — tailor the resume', 4000),
    'task:b': t('github.com/acme/uploader/issues/214', 'Retry backoff drops the last chunk', 'Reproduce with a 500 from S3, then patch', 90000),
    'task:c': t('docs.stripe.com/webhooks/signatures', 'Stripe webhook signatures', 'Check our handler against the v2 scheme', 160000),
    'task:d': t('developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API', 'View Transitions API', 'Finish the demo, try it on the dashboard', 240000),
    'task:e': t('postgresql.org/docs/release/18.0', 'Postgres 18 release notes', 'Skim for anything affecting our migrations', 320000),
    'task:f': t('news.ycombinator.com/item?id=41', 'Thread on local-first software', 'Read properly, take notes', 400000, true),
  });
  return true;
})()`;

/**
 * The popup reads the active tab through chrome.tabs.query. Headless cannot
 * grant activeTab (that needs a real click), so the capture stubs the one call
 * with the page a user would realistically be on. The UI below it is untouched.
 */
const POPUP_TAB_STUB = `
  (() => {
    // Deliberately a page NOT in the demo list, or the popup would show its
    // duplicate warning and the first screenshot would read as an error state.
    const fake = [{
      id: 1, windowId: 1,
      url: 'https://react.dev/learn/you-might-not-need-an-effect',
      title: 'You Might Not Need an Effect – React',
      active: true,
    }];
    const install = () => {
      if (!globalThis.chrome?.tabs) return false;
      chrome.tabs.query = async () => fake;
      return true;
    };
    if (!install()) {
      Object.defineProperty(globalThis, 'chrome', {
        configurable: true,
        set(v) { delete globalThis.chrome; globalThis.chrome = v; install(); },
        get() { return undefined; },
      });
    }
  })();
`;

// --- slide composition -----------------------------------------------------

const SLIDES = [
  {
    eyebrow: 'The problem with bookmarks',
    headline: 'Your browser remembers the page.\nIt forgets why you opened it.',
    body: 'Tab-to-Task saves a page together with the one thing a bookmark never keeps — what you were going to do about it.',
    shot: 'popup',
  },
  {
    eyebrow: 'Save in two seconds',
    headline: 'Press Ctrl+Shift+S.\nThen close the tab.',
    body: 'Capture the page, write the next action, and let the tab go. The reminder lives here now, not in your tab bar.',
    shot: 'popup-filled',
  },
  {
    eyebrow: 'Work from the side panel',
    headline: 'Your task list, beside\nwhatever you are doing.',
    body: 'Ctrl+Shift+E opens it next to the page you are working on. Click any task to reopen its page, tick it off when it is done.',
    shot: 'sidepanel',
  },
  {
    eyebrow: 'Find anything instantly',
    headline: 'Search what you meant,\nnot just what it was called.',
    body: 'One box searches titles, next actions, notes and URLs at once. Done and deleted tasks stay reachable — trash keeps items for 30 days.',
    shot: 'sidepanel-search',
  },
  {
    eyebrow: 'Private by design',
    headline: 'Everything stays\non your device.',
    body: 'No account, no server, no analytics, no network requests at all. Export or delete your data whenever you like.',
    shot: 'options',
    dark: true,
  },
];

function slideHtml({ eyebrow, headline, body, image, dark, width = 1280, height = 800 }) {
  const bg = dark ? '#0b1020' : '#f5f6fb';
  const fg = dark ? '#f1f5f9' : '#0f172a';
  const muted = dark ? '#94a3b8' : '#51607a';
  const glow = dark ? 'rgba(99,102,241,0.30)' : 'rgba(79,70,229,0.18)';

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${width}px; height:${height}px; overflow:hidden; }
  body {
    background:
      radial-gradient(1100px 620px at 86% 14%, ${glow}, transparent 62%),
      ${bg};
    color: ${fg};
    font-family: "Segoe UI Variable Display","Segoe UI",system-ui,-apple-system,sans-serif;
    display:flex; align-items:center; gap:64px; padding:0 84px;
    -webkit-font-smoothing:antialiased;
  }
  .copy { flex:1 1 0; max-width:560px; }
  .eyebrow {
    font-size:17px; font-weight:650; letter-spacing:.09em; text-transform:uppercase;
    color:#6366f1; margin-bottom:22px;
  }
  h1 {
    font-size:52px; line-height:1.1; font-weight:700; letter-spacing:-0.025em;
    white-space:pre-line; margin-bottom:26px;
  }
  p { font-size:21px; line-height:1.55; color:${muted}; font-weight:400; }
  .shot {
    flex:0 0 auto; border-radius:18px; overflow:hidden;
    box-shadow: 0 40px 80px -24px rgba(8,12,30,.45), 0 0 0 1px ${dark ? 'rgba(255,255,255,.09)' : 'rgba(15,23,42,.10)'};
    background:${dark ? '#020617' : '#fff'};
    max-height:${height - 110}px;
  }
  .shot img { display:block; height:auto; max-height:${height - 110}px; width:auto; }
  </style></head><body>
    <div class="copy">
      <div class="eyebrow">${eyebrow}</div>
      <h1>${headline}</h1>
      <p>${body}</p>
    </div>
    <div class="shot"><img src="${image}"></div>
  </body></html>`;
}

function promoHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:440px; height:280px; overflow:hidden; }
  body {
    background: radial-gradient(420px 300px at 76% 8%, rgba(99,102,241,.42), transparent 64%), #0b1020;
    color:#f8fafc; font-family:"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;
    display:flex; flex-direction:column; justify-content:center; padding:0 38px;
    -webkit-font-smoothing:antialiased;
  }
  .mark { width:54px; height:54px; margin-bottom:20px; }
  h1 { font-size:33px; font-weight:700; letter-spacing:-0.025em; margin-bottom:11px; }
  p { font-size:15.5px; line-height:1.45; color:#a5b0c8; max-width:330px; }
  </style></head><body>
    <svg class="mark" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="13" fill="#4f46e5"/>
      <path d="M13 24.5 L20.5 32 L35 16.5" stroke="#fff" stroke-width="5.2"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <h1>Tab-to-Task</h1>
    <p>Save a webpage, remember why it matters, and return to it when you're ready to act.</p>
  </body></html>`;
}

// --- run -------------------------------------------------------------------

let pages = new Map();
const server = createServer((req, res) => {
  const body = pages.get(req.url.split('?')[0]);
  if (!body) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
});

try {
  await new Promise((r) => server.listen(PORT, r));
  await sleep(2500);

  const { id: extId } = await send('Extensions.loadUnpacked', { path: EXT });
  console.log(`extension loaded as ${extId}`);
  await sleep(1500);

  const url = (page) => `chrome-extension://${extId}/${page}`;

  // 1. Raw UI captures, straight from the running extension.
  console.log('capturing extension UI…');
  const shots = {
    popup: await capture({
      url: url('popup.html'),
      width: 352,
      height: 500,
      beforeLoad: POPUP_TAB_STUB,
      setup: DEMO_TASKS,
    }),
    // Same popup, but with the next action actually written — that field is the
    // entire product, so one screenshot has to show it filled in.
    'popup-filled': await capture({
      url: url('popup.html'),
      width: 352,
      height: 500,
      beforeLoad: POPUP_TAB_STUB,
      setup: `${DEMO_TASKS}.then(async () => {
        await new Promise(r => setTimeout(r, 700));
        const inputs = [...document.querySelectorAll('input[type=text], input:not([type])')];
        const field = inputs[inputs.length - 1];
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(field, 'Rewrite the dashboard effects this week');
        field.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })`,
    }),
    sidepanel: await capture({
      url: url('sidepanel.html'),
      width: 392,
      height: 620,
      setup: DEMO_TASKS,
    }),
    'sidepanel-search': await capture({
      url: url('sidepanel.html'),
      width: 392,
      height: 620,
      setup: `${DEMO_TASKS}.then(async () => {
        await new Promise(r => setTimeout(r, 700));
        const box = document.querySelector('input[type=search]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        // 'docs' matches three saved pages by URL, which both fills the panel and
        // demonstrates that search covers URLs, not just titles.
        setter.call(box, 'docs');
        box.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })`,
    }),
    options: await capture({
      url: url('options.html'),
      width: 620,
      height: 620,
      dark: true,
      setup: DEMO_TASKS,
    }),
  };

  // 2. Composite each slide at the store's preferred 1280x800.
  console.log('compositing slides…');
  for (const [index, slide] of SLIDES.entries()) {
    const image = `data:image/png;base64,${shots[slide.shot]}`;
    pages = new Map([['/slide', slideHtml({ ...slide, image })]]);

    // scale 1: the store requires exactly 1280x800 and rejects 2x output.
    // The embedded UI grabs are still 2x, so they downscale crisply.
    const png = await capture({
      url: `http://localhost:${PORT}/slide?i=${index}`,
      width: 1280,
      height: 800,
      scale: 1,
      dark: Boolean(slide.dark),
    });
    const file = resolve(OUT, `screenshot-${index + 1}.png`);
    writeFileSync(file, Buffer.from(png, 'base64'));
    console.log(`  screenshot-${index + 1}.png  ${slide.eyebrow}`);
  }

  // 3. Small promo tile.
  pages = new Map([['/promo', promoHtml()]]);
  const promo = await capture({
    url: `http://localhost:${PORT}/promo`,
    width: 440,
    height: 280,
    scale: 1,
  });
  writeFileSync(resolve(OUT, 'promo-small.png'), Buffer.from(promo, 'base64'));
  console.log('  promo-small.png');

  console.log(`\nDone — ${OUT}`);
} catch (error) {
  console.error('FAILED:', error.message);
  process.exitCode = 1;
} finally {
  server.close();
  chrome.kill();
  try {
    rmSync(PROFILE, { recursive: true, force: true });
  } catch {
    /* Chrome may still hold the profile; the next run wipes it */
  }
}
