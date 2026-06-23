import { chromium } from 'playwright-core';
import fs from 'node:fs';
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const out = process.env.OUT || '/tmp/claude-0/-home-user-legendary-tribble/22f7d01f-c0b5-5055-8610-9c7af58b3d78/scratchpad';
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await p.fill('input.field', 'Patient Zero');
await p.screenshot({ path: `${out}/01-menu.png` });
await p.selectOption('select.field', '3');
await p.click('text=Play vs AI');
await p.waitForSelector('text=Release into the wild');
await p.click('.type:has-text("Virus")');
await p.screenshot({ path: `${out}/02-setup.png` });
await p.click('text=Release into the wild');
await p.waitForSelector('#map');
const speed = await p.$$('.speed .btn');
await speed[speed.length - 1].click();
await p.waitForTimeout(14000); // let the world light up and travel sprites fly
await p.screenshot({ path: `${out}/03-game.png` });
// Capture the evolution tree (Mutation branch to show variety).
await p.click('.speed .btn >> nth=0'); // pause
const mut = await p.$('.branch-tab:has-text("Mutation")');
if (mut) await mut.click();
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/04-tree.png` });
await b.close();
console.log('shots written to', out);
