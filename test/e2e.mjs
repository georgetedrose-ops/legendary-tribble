// Browser smoke test driven through a cached Chromium. Verifies the full UI
// path: menu -> setup -> game (ticks advance, evolve works) -> game over.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const EXE_CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
];
const executablePath = EXE_CANDIDATES.find((p) => fs.existsSync(p));
const URL = process.env.URL || 'http://localhost:4173/';

const log = (...a) => console.log(...a);
let failed = false;
const assert = (cond, msg) => { if (!cond) { failed = true; log('  ✗ ' + msg); } else log('  ✓ ' + msg); };

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  log('Menu');
  await page.fill('input.field', 'TestPlayer');
  assert(await page.isVisible('text=Play vs AI'), 'menu renders with Play vs AI');
  await page.selectOption('select.field', '1'); // single rival = quicker decisive match
  await page.click('text=Play vs AI');

  log('Setup');
  await page.waitForSelector('text=Release into the wild', { timeout: 5000 });
  assert(await page.isVisible('.types'), 'disease type cards render');
  // pick the bioweapon strain for a fast, decisive match
  await page.click('.type:has-text("Bioweapon")');
  await page.fill('input.field', 'E2E Strain');
  await page.click('text=Release into the wild');

  log('Game');
  await page.waitForSelector('#map', { timeout: 5000 });
  assert(await page.isVisible('.topbar'), 'topbar renders');
  assert(await page.isVisible('.sidebar'), 'sidebar renders');

  // Day counter should advance.
  const dayText = async () => {
    const els = await page.$$('.stat');
    for (const el of els) {
      const k = await el.$eval('.k', (n) => n.textContent).catch(() => '');
      if (k === 'Day') return parseInt(await el.$eval('.v', (n) => n.textContent), 10);
    }
    return NaN;
  };
  const d0 = await dayText();
  // crank speed to 4x (last speed button)
  const speedBtns = await page.$$('.speed .btn');
  await speedBtns[speedBtns.length - 1].click();
  await page.waitForTimeout(2500);
  const d1 = await dayText();
  assert(Number.isFinite(d0) && Number.isFinite(d1) && d1 > d0, `day advances (${d0} -> ${d1})`);

  // Earn DNA at 4x until a cheap tier-1 node is affordable, then buy it to
  // prove the skill tree mutates state through the UI.
  const dnaVal = async () => {
    const els = await page.$$('.stat');
    for (const el of els) {
      const k = await el.$eval('.k', (n) => n.textContent).catch(() => '');
      if (k === 'DNA') return parseInt(await el.$eval('.v', (n) => n.textContent), 10);
    }
    return NaN;
  };
  await speedBtns[speedBtns.length - 1].click(); // 4x
  let dna = 0;
  for (let i = 0; i < 12 && dna < 8; i++) { await page.waitForTimeout(1500); dna = await dnaVal(); }
  await page.click('.speed .btn >> nth=0'); // pause to click safely
  const ownedBefore = (await page.$$('.node.owned')).length;
  const cheap = await page.$('.node:not(.owned):not(.locked)');
  if (cheap) {
    await cheap.click();
    await page.waitForTimeout(200);
    const ownedAfter = (await page.$$('.node.owned')).length;
    assert(ownedAfter > ownedBefore, `evolution applied via UI (dna~${dna}, owned ${ownedBefore} -> ${ownedAfter})`);
  } else {
    log('  (no unlocked node available — skipping)');
  }
  await page.click('.speed .btn >> nth=3'); // resume at 4x

  // Let the match run to completion. Poll so we can detect a stall vs. a long
  // but healthy match.
  log('Waiting for game over…');
  let over = false;
  let lastDay = await dayText();
  for (let i = 0; i < 30 && !over; i++) {
    over = await page.isVisible('text=Game Over').catch(() => false);
    if (over) break;
    await page.waitForTimeout(3000);
    const d = await dayText();
    if (!over) { assert(d > lastDay || Number.isNaN(d), `still advancing at check ${i} (day ${lastDay} -> ${d})`); lastDay = d; }
  }
  assert(over, 'match reaches Game Over screen');
  assert(await page.isVisible('.results'), 'results table renders');
  assert(await page.isVisible('text=Play again'), 'play again offered');

  assert(errors.length === 0, `no console/page errors (${errors.length})`);
  if (errors.length) errors.slice(0, 8).forEach((e) => log('    ! ' + e));
} catch (e) {
  failed = true;
  log('EXCEPTION: ' + e.message);
} finally {
  await browser.close();
}

log(failed ? '\nE2E: FAIL' : '\nE2E: PASS');
process.exit(failed ? 1 : 0);
