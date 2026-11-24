/**
 * 浏览器端冒烟测试：四个页面切换、Canvas 渲染、AudioWorklet 实时物理出声。
 * 运行：node tests/browser-smoke.mjs（需先 npm run dev）
 */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:5173';
const errors = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('Autoplay')) errors.push(`console.error: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('#view canvas');
console.log('✓ 练习页加载，Canvas 存在');

// 开启声音（用户手势）
await page.click('#audio-unlock');
await page.waitForTimeout(600);

// 模拟运弓：控制板按下并拖动（中压区，期望进入 good）
const pad = await page.$('#bow-pad');
const box = await pad.boundingBox();
await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.45);
await page.mouse.down();
for (let i = 0; i < 12; i++) {
  await page.mouse.move(box.x + box.width * (0.3 + i * 0.035), box.y + box.height * (0.42 + (i % 2) * 0.08));
  await page.waitForTimeout(50);
}
await page.waitForTimeout(500);

const physics = await page.evaluate(() => {
  const eng = window.__audioEngine;
  const latest = eng?.getLatest() ?? [];
  return {
    frameCount: latest.length,
    active: latest[2] ? { regime: latest[2].regime, force: latest[2].bowForce, speed: latest[2].bowSpeed } : null,
    uiRegime: document.querySelector('#m-regime')?.textContent,
    uiForce: document.querySelector('#m-force')?.textContent,
  };
});
console.log('✓ 运弓物理状态:', JSON.stringify(physics));
if (physics.frameCount !== 4) throw new Error('分析帧数量异常，期望 4 弦');
if (!physics.active || physics.active.force <= 0) throw new Error('弓力未驱动');
if (physics.uiRegime === '—') throw new Error('UI 未显示发音状态');

// 测三态切换：极低压（鼠标移到最上）应出现 airy/非 good
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.97);
await page.waitForTimeout(400);
const lowPress = await page.$eval('#m-regime', (el) => el.textContent);
console.log('✓ 低压状态:', lowPress);
await page.mouse.up();

// 弓压弓速图页
await page.click('nav.tabs button[data-tab="chart"]');
await page.waitForSelector('#schell-canvas');
const chartOk = await page.$eval('#schell-canvas', (c) => c.width > 0 && c.height > 0);
console.log('✓ Schelleng 图页 Canvas 正常:', chartOk);

// 曲目关卡页
await page.click('nav.tabs button[data-tab="level"]');
await page.waitForSelector('.piece-card');
const pieceCount = await page.$$eval('.piece-card', (els) => els.length);
if (pieceCount !== 5) throw new Error('应有 5 首曲目');
console.log('✓ 关卡页列出 5 首曲目');

// 进入关卡并模拟演奏
await page.click('.piece-card');
await page.waitForSelector('#lv-canvas');
const lpad = await page.$('#lv-pad');
const lbox = await lpad.boundingBox();
await page.mouse.move(lbox.x + lbox.width * 0.4, lbox.y + lbox.height * 0.45);
await page.mouse.down();
for (let i = 0; i < 10; i++) {
  await page.mouse.move(lbox.x + lbox.width * (0.4 + (i % 6) * 0.04), lbox.y + lbox.height * 0.45);
  await page.waitForTimeout(60);
}
await page.mouse.up();
await page.waitForTimeout(600);
const levelRegime = await page.$eval('#lv-regime', (el) => el.textContent);
console.log('✓ 关卡内发音状态:', levelRegime);
await page.click('#lv-quit');
await page.waitForSelector('.piece-card');

// 成绩页
await page.click('nav.tabs button[data-tab="result"]');
await page.waitForSelector('.panel h2');
console.log('✓ 成绩页渲染:', await page.$eval('.panel h2', (el) => el.textContent));

await browser.close();

if (errors.length) {
  console.error('\n运行时错误:');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\n浏览器冒烟测试全部通过 ✓');
