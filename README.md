# Portfolio QA Robot

A local Playwright automation script that behaves like a real visitor on my visual-Vportfolio: it opens the site, clicks through to Projects, fills in the contact form, measures UI performance, and writes a timestamped journal of everything it does. If any step fails, it saves a screenshot (`error.png`) and logs the exact error.

## What it does

| Phase | What happens |
| :--- | :--- |
| **1. Setup & Navigation** | Launches headless Chromium, opens a Chrome DevTools Protocol (CDP) session, navigates to the portfolio URL |
| **2. User Simulation** | Waits for full page load, clicks the **Projects** link and verifies the section is visible in the viewport, fills the **contact form** (name, email, message), submits, and checks for a success message |
| **3. Performance & Logging** | Captures First Contentful Paint, page load time, and CDP metrics (heap size, DOM nodes, layout count, script time); prints every step with a timestamp |
| **On failure** | Saves `error.png` (full page), logs the exact error message, exits with code `1` |

## Prerequisites

- Node.js 18 or newer
- The portfolio running locally (for example `npm run dev` in the portfolio repo)

## Quick start

```bash
# 1. Create the project and enable ES modules
mkdir portfolio-qa && cd portfolio-qa
npm init -y
npm pkg set type=module

# 2. Install Playwright and download Chromium
npm install playwright
npx playwright install chromium

# 3. Put portfolio-test.mjs in this folder, then start your portfolio
#    in a SEPARATE terminal:  npm run dev

# 4. Run the robot
node portfolio-test.mjs
```

### Pointing at a different URL

The script defaults to `http://localhost:3000`. Vite's default is `5173`, so you will usually override it:

```bash
# macOS / Linux
BASE_URL=http://localhost:5173 node portfolio-test.mjs

# Windows PowerShell
$env:BASE_URL="http://localhost:5173"; node portfolio-test.mjs
```

### Optional: add an npm script

```bash
npm pkg set scripts.test:portfolio="node portfolio-test.mjs"
npm run test:portfolio
```

## Example output

```text
[10:00:01] STEP: Connect to Chrome DevTools Protocol
[10:00:01] SUCCESS: CDP session connected
[10:00:01] STEP: Navigate to http://localhost:5173
[10:00:03] NAVIGATING: Opened homepage
[10:00:03] SUCCESS: Page loaded. Title: "W.G. | Frontend Developer"
[10:00:03] STEP: Click the Projects link and verify projects are visible
[10:00:04] ACTION: Clicked "Projects" navigation link
[10:00:05] INFO: Found 4 project card(s) inside the section
[10:00:05] SUCCESS: Projects section is visible
[10:00:05] STEP: Fill out and submit the contact form
[10:00:06] ACTION: Typed name: QA Robot
[10:00:06] ACTION: Typed email: qa-robot@example.com
[10:00:06] ACTION: Clicked submit
[10:00:07] SUCCESS: Success message appeared: "Thanks! Message sent."
[10:00:07] STEP: Capture performance metrics
[10:00:07] PERF: First Contentful Paint: 412 ms
[10:00:07] PERF: Page Load Time:         688 ms
[10:00:07] RESULT: ALL CHECKS PASSED
```

## Log labels

| Label | Meaning |
| :--- | :--- |
| `STEP` | A new step is starting |
| `NAVIGATING` / `ACTION` | The robot did something (opened a page, clicked, typed) |
| `INFO` | Extra detail found along the way |
| `SUCCESS` | A validation passed |
| `PERF` | A performance measurement |
| `WARN` | Not a failure, but worth a look (for example FCP over 1800 ms) |
| `BROWSER-ERROR` / `BROWSER-CONSOLE` | A real error thrown inside the page |
| `FAILED` / `SCREENSHOT` | A validation failed and a photo was saved |
| `RESULT` | Final verdict |

## Performance metrics

| Metric | Source | Notes |
| :--- | :--- | :--- |
| First Contentful Paint | Browser paint timing | Under 1800 ms is considered good |
| DOM Content Loaded / Page Load Time | Browser navigation timing | What the user actually feels |
| JS Heap Used, DOM Nodes, Layout Count, Script Duration | CDP `Performance.getMetrics` | Low-level browser health numbers |

## Configuration

Edit the `CONFIG` block at the top of `portfolio-test.mjs`:

| Setting | Default | Purpose |
| :--- | :--- | :--- |
| `BASE_URL` | `http://localhost:3000` | Site to test (override with env var) |
| `TIMEOUT` | `10000` | Max milliseconds to wait for any element |
| `ERROR_SCREENSHOT` | `error.png` | Where the failure photo is saved |
| `TEST_USER` | QA Robot / qa-robot@example.com | Data typed into the contact form |

## Important notes

- **The form really submits.** If the contact form posts to a live service (Formspree, EmailJS, your own API), the robot sends a real test message. Use a throwaway email or test against a staging build.
- **Selectors are flexible guesses.** The script finds elements by role, label, and common names. If a step fails, open `error.png`, then tighten the selector. Adding `data-testid` attributes (for example `data-testid="contact-form"`) is the most stable fix.
- **Smooth scrolling is on** in the portfolio CSS, so the script waits briefly after clicking Projects before checking the viewport.

## Troubleshooting

| Problem | Likely cause | Fix |
| :--- | :--- | :--- |
| `net::ERR_CONNECTION_REFUSED` | Portfolio is not running, or wrong port | Start `npm run dev` and set `BASE_URL` |
| `Cannot find package 'playwright'` | Dependencies not installed | `npm install playwright` |
| `Executable doesn't exist` | Chromium not downloaded | `npx playwright install chromium` |
| `Cannot use import statement outside a module` | ES modules not enabled | `npm pkg set type=module` |
| Projects step fails | Link text or section id differs | Check `error.png`, adjust the locator |
| Success message not found | Message wording differs | Update the success regex in the contact step |

## Project structure

```text
portfolio-qa/
├── node_modules/
├── portfolio-test.mjs   # The robot
├── error.png            # Only created when a step fails
├── package.json
└── README.md
```

## Using it in CI

The script exits with `0` on success and `1` on failure, so any CI runner can treat it as a pass/fail check.

## Contributing

This project follows the portfolio repo workflow:

1. Branch from `develop`: `git switch -c feature/qa-automation`
2. Run the linter before pushing: `npx oxlint@latest`
3. Use conventional commits, for example `feat: add playwright smoke test`
4. Open a PR targeting `develop`

## Ideas for next steps

- Add a mobile viewport run (for example 375 x 812)
- Test the light/dark theme toggle and confirm the `.dark` class on `<html>`
- Add a Lighthouse or Web Vitals budget check
- Save the metrics to a JSON file to track performance over time
