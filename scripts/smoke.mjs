/**
 * Loads the built extension into a real Chrome and exercises the core flow.
 *
 * Why this exists: unit tests run against a fake chrome.storage, so they cannot
 * catch a broken manifest, a service worker that fails to register, or a view
 * that does not react to storage.onChanged. This does.
 *
 * Chrome 137+ ignores the --load-extension switch, so the extension is
 * installed through the CDP Extensions domain. That domain requires the pipe
 * transport (fds 3 and 4) plus --enable-unsafe-extension-debugging; it is not
 * reachable over --remote-debugging-port.
 *
 * Run with: npm run build && npm run smoke
 */
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = resolve(ROOT, 'dist');
const PROFILE = resolve(ROOT, '.chrome-test-profile');

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const CHROME = process.env.CHROME_PATH ?? CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  console.error('Chrome not found. Set CHROME_PATH to the executable.');
  process.exit(1);
}
if (!existsSync(resolve(EXT, 'manifest.json'))) {
  console.error('dist/manifest.json missing. Run `npm run build` first.');
  process.exit(1);
}

rmSync(PROFILE, { recursive: true, force: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'] },
);

const [, , , writeFd, readFd] = chrome.stdio;

let nextId = 0;
const pending = new Map();
const events = [];
let buffer = Buffer.alloc(0);

readFd.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  let idx;
  // CDP pipe framing: NUL-delimited JSON.
  while ((idx = buffer.indexOf(0)) !== -1) {
    const raw = buffer.subarray(0, idx).toString('utf8');
    buffer = buffer.subarray(idx + 1);
    if (!raw) continue;
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      const { resolve: res, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : res(msg.result);
    } else {
      events.push(msg);
    }
  }
});

function send(method, params = {}, sessionId) {
  const id = ++nextId;
  return new Promise((res, reject) => {
    pending.set(id, { resolve: res, reject });
    writeFd.write(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }) + '\0');
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout: ${method}`));
      }
    }, 20000);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
}

try {
  await sleep(2500);

  const { id: extensionId } = await send('Extensions.loadUnpacked', { path: EXT });
  check('extension installs without manifest errors', Boolean(extensionId), extensionId);
  await sleep(2000);

  const { targetInfos } = await send('Target.getTargets');
  const worker = targetInfos.find((t) => t.type === 'service_worker' && t.url.includes(extensionId));
  check('MV3 service worker registers', Boolean(worker));

  // Attach to the worker so the toolbar badge can be read from the one context
  // that owns it.
  const { sessionId: swSession } = await send('Target.attachToTarget', {
    targetId: worker.targetId,
    flatten: true,
  });
  await send('Runtime.enable', {}, swSession);
  const badgeText = async () => {
    const { result } = await send(
      'Runtime.evaluate',
      {
        expression: '(async () => await chrome.action.getBadgeText({}))()',
        awaitPromise: true,
        returnByValue: true,
      },
      swSession,
    );
    return result.value;
  };

  const { targetId } = await send('Target.createTarget', {
    url: `chrome-extension://${extensionId}/sidepanel.html`,
  });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Log.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await sleep(1500);

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };

  const heading = await evaluate(`document.querySelector('h1')?.textContent ?? ''`);
  check('side panel renders', heading.includes('Tab-to-Task'));

  check(
    'empty state shows before any task exists',
    (await evaluate(`document.body.innerText.includes('No tasks yet')`)) === true,
  );

  // Write straight to storage, then confirm the open view reacts. This is the
  // cross-context behaviour that per-key storage + onChanged exists to provide.
  await evaluate(`
    (async () => {
      const now = Date.now();
      await chrome.storage.local.set({
        'task:smoke1': {
          id: 'smoke1', title: 'Apply to Acme',
          url: 'https://example.com/jobs/42', pageTitle: 'Senior Engineer',
          faviconUrl: null, nextAction: 'Submit before Friday', notes: '',
          createdAt: now, updatedAt: now, completedAt: null, deletedAt: null,
        },
      });
      return true;
    })()
  `);
  await sleep(800);

  const live = await evaluate(`document.body.innerText`);
  check(
    'storage.onChanged updates an open view without a reload',
    live.includes('Apply to Acme') && live.includes('Submit before Friday'),
  );

  // The badge is the only thing that makes the extension visible once the popup
  // is closed, so it is checked while a task is genuinely open...
  const openBadge = await badgeText();
  check('badge shows the pending count', openBadge === '1', `badge = "${openBadge}"`);

  await evaluate(`document.querySelector('input[type=checkbox]').click(); true`);
  await sleep(1200);

  // ...and again after the last task closes, since a stale count is worse than
  // no count at all.
  const clearedBadge = await badgeText();
  check('badge clears when nothing is pending', clearedBadge === '', `badge = "${clearedBadge}"`);

  check(
    'completing a task persists to storage',
    (await evaluate(
      `(async () => (await chrome.storage.local.get('task:smoke1'))['task:smoke1'].completedAt !== null)()`,
    )) === true,
  );
  check(
    'completed task leaves the To do tab',
    (await evaluate(`!document.body.innerText.includes('Apply to Acme')`)) === true,
  );

  await evaluate(
    `[...document.querySelectorAll('[role=tab]')].find(t => t.textContent === 'Done').click(); true`,
  );
  await sleep(500);
  check(
    'completed task appears under Done',
    (await evaluate(`document.body.innerText.includes('Apply to Acme')`)) === true,
  );

  await send('Runtime.evaluate', { expression: 'location.reload()' }, sessionId);
  await sleep(2000);
  const count = await evaluate(
    `(async () => Object.keys(await chrome.storage.local.get(null)).filter(k => k.startsWith('task:')).length)()`,
  );
  check('tasks survive a reload', count === 1, `${count} task(s) in storage`);

  const errors = events.filter(
    (e) => e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error',
  );
  check('no console errors', errors.length === 0, errors.map((e) => e.params.entry.text).join(' | '));
} catch (error) {
  check('smoke test ran to completion', false, error.message);
} finally {
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  chrome.kill();
  // Best-effort: Chrome may still hold a lock on the profile for a moment.
  // The next run wipes it at startup regardless, so a failure here is noise.
  try {
    rmSync(PROFILE, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.exit(failed === 0 ? 0 : 1);
}
