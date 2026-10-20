import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const TIMEOUT = 10_000; // max ms to wait for anything
const ERROR_SCREENSHOT = 'error.png';
const TEST_USER = {
  name: 'Crimson Mist QA Robot',
  email: 'qa-robot@example.com',
  message: 'Hello! This is an automated test message. Do not reply',
};

// ---------- LOGGER: timestamped diary ----------
function timestamp() {
  return new Date().toTimeString().slice(0, 8); // "HH:MM:SS"
}

function log(label, message) {
  console.log(`[${timestamp()}] ${label}: ${message}`);
}

// ---------- STEP RUNNER ----------
async function step(page, name, fn) {
  log('STEP', name);
  try {
    return await fn();
  } catch (error) {
    log('FAILED', `${name} -> ${error.message}`);
    try {
      await page.screenshot({ path: ERROR_SCREENSHOT, fullPage: true });
      log('SCREENSHOT', `Saved failure photo to ${ERROR_SCREENSHOT}`);
    } catch (shotError) {
      log('WARN', `Could not take screenshot: ${shotError.message}`);
    }
    throw error; // bubble up so main() can exit with code 1
  }
}

// ---------- HELPERS ----------
// Is the element actually inside the visible window (not just "in the DOM")?
async function isInViewport(locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0;
  });
}

// ---------- PERFORMANCE (CDP + browser timing) ----------
async function capturePerformance(page, cdp) {
  // 1) CDP: low-level browser numbers
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map(({ name, value }) => [name, value]));

  // 2) Browser timing API: FCP + load time (what users actually feel)
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      fcp: fcp ? fcp.startTime : null,
      domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
      loadTime: nav ? nav.loadEventEnd : null,
    };
  });

  const ms = (v) => (v == null ? 'n/a' : `${Math.round(v)} ms`);
  log('PERF', `First Contentful Paint: ${ms(timing.fcp)}`);
  log('PERF', `DOM Content Loaded:     ${ms(timing.domContentLoaded)}`);
  log('PERF', `Page Load Time:         ${ms(timing.loadTime)}`);
  log('PERF', `JS Heap Used:           ${(m.JSHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);
  log('PERF', `DOM Nodes:              ${m.Nodes}`);
  log('PERF', `Layout Count:           ${m.LayoutCount}`);
  log('PERF', `Script Duration:        ${(m.ScriptDuration * 1000).toFixed(0)} ms`);

  // Gentle budget warning (not a failure): Google calls FCP < 1800ms "good"
  if (timing.fcp != null && timing.fcp > 1800) {
    log('WARN', 'FCP is slower than 1800 ms. Consider optimizing images/fonts.');
  }
}

// ---------- MAIN ----------
async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);

  // Log real browser errors too: great for catching hidden bugs
  page.on('pageerror', (err) => log('BROWSER-ERROR', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') log('BROWSER-CONSOLE', msg.text());
  });

  let failed = false;

  try {
    // ===== PHASE 1: SETUP & NAVIGATION =====
    const cdp = await step(page, 'Connect to Chrome DevTools Protocol', async () => {
      const session = await context.newCDPSession(page);
      await session.send('Performance.enable');
      log('SUCCESS', 'CDP session connected');
      return session;
    });

    await step(page, `Navigate to ${BASE_URL}`, async () => {
      await page.goto(BASE_URL, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle');
      log('NAVIGATING', 'Opened homepage');
    });

    await step(page, 'Verify the page rendered', async () => {
      await page.locator('body *').first().waitFor({ state: 'visible' });
      const title = await page.title();
      log('SUCCESS', `Page loaded. Title: "${title}"`);
    });

    // ===== PHASE 2a: PROJECTS =====
    await step(page, 'Click the Projects link and verify projects are visible', async () => {
      const navLink = page.getByRole('link', { name: /projects/i }).first();
      await navLink.waitFor({ state: 'visible' });
      await navLink.click();
      log('ACTION', 'Clicked "Projects" navigation link');

      // Try an id/class-based section first, then fall back to the heading
      let projects = page.locator('#projects, section[id*="project" i]').first();
      if ((await projects.count()) === 0) {
        projects = page.getByRole('heading', { name: /projects/i }).first();
      }
      await projects.waitFor({ state: 'visible' });

      // Smooth scrolling is on in index.css, so wait for it to settle
      await page.waitForFunction(() => true);
      await page.waitForTimeout(800);

      if (!(await isInViewport(projects))) {
        throw new Error('Projects section exists but is not in the viewport after clicking');
      }

      const cards = await projects.locator('article, [class*="card" i]').count();
      log('INFO', `Found ${cards} project card(s) inside the section`);
      log('SUCCESS', 'Projects section is visible');
    });

    // ===== PHASE 2b: CONTACT FORM =====
    await step(page, 'Fill out and submit the contact form', async () => {
      let form = page.locator('form').first();

      // No form on screen yet? Try a Contact link/button first.
      if (!(await form.isVisible().catch(() => false))) {
        const contactTrigger = page
          .getByRole('link', { name: /contact|hire|get in touch|let.?s talk/i })
          .or(page.getByRole('button', { name: /contact|hire|get in touch|let.?s talk/i }))
          .first();
        await contactTrigger.click();
        log('ACTION', 'Clicked a Contact link/button to reveal the form');
        form = page.locator('form').first();
      }
      await form.waitFor({ state: 'visible' });
      log('INFO', 'Contact form found');

      const nameInput = form
        .getByLabel(/name/i)
        .or(form.locator('input[name*="name" i], input[placeholder*="name" i]'))
        .first();
      const emailInput = form
        .getByLabel(/email/i)
        .or(form.locator('input[type="email"], input[name*="email" i]'))
        .first();

      await nameInput.fill(TEST_USER.name);
      log('ACTION', `Typed name: ${TEST_USER.name}`);
      await emailInput.fill(TEST_USER.email);
      log('ACTION', `Typed email: ${TEST_USER.email}`);

      // Message box is optional: only fill it if it exists
      const messageInput = form.locator('textarea').first();
      if ((await messageInput.count()) > 0) {
        await messageInput.fill(TEST_USER.message);
        log('ACTION', 'Typed message');
      }

      const submit = form
        .locator('button[type="submit"]')
        .or(form.getByRole('button', { name: /send|submit|contact|hire/i }))
        .first();
      await submit.click();
      log('ACTION', 'Clicked submit');

      // Success state: look for a friendly message anywhere on the page
      const success = page
        .getByText(/thank|success|sent|received|we.?ll be in touch|message delivered/i)
        .first();
      await success.waitFor({ state: 'visible' });
      log('SUCCESS', `Success message appeared: "${(await success.innerText()).trim()}"`);
    });

    // ===== PHASE 3: PERFORMANCE =====
    await step(page, 'Capture performance metrics', async () => {
      await capturePerformance(page, cdp);
    });
  } catch {
    failed = true; // details were already logged by step()
  } finally {
    await browser.close();
    log(failed ? 'RESULT' : 'RESULT', failed ? 'FAILED. See log above and error.png' : 'ALL CHECKS PASSED');
    process.exit(failed ? 1 : 0);
  }
}

main();
