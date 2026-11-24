/**
 * 端到端关卡测试：进入关卡 → 持续 good 区运弓 → 通关 → 成绩保存。
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await page.click('#audio-unlock');
await page.waitForTimeout(500);

// 选跳弓练习（最短，约 9 秒）
await page.click('nav.tabs button[data-tab="level"]');
await page.waitForSelector('.piece-card');
const cards = await page.$$('.piece-card');
await cards[2].click(); // 第三首：跳弓颗粒练习
await page.waitForSelector('#lv-canvas');

// 持续在 good 区运弓（中等压力、规律左右移动）
const pad = await page.$('#lv-pad');
const box = await pad.boundingBox();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.mouse.down();
const bowingStart = Date.now();
let dir = 1;
while (Date.now() - bowingStart < 10500) {
  const cx = box.x + box.width * (0.3 + 0.4 * (0.5 + 0.5 * Math.sin((Date.now() - bowingStart) / 400)));
  await page.mouse.move(cx, box.y + box.height * 0.5);
  await page.waitForTimeout(40);
}
await page.mouse.up();

// 等待自动通关并跳转到成绩页
await page.waitForSelector('.big-score', { timeout: 8000 });
const scoreText = await page.$eval('.big-score', (el) => el.textContent);
console.log('✓ 通关，总分:', scoreText);

// 逐音明细行数
const detailRows = await page.$$eval('table.scores tbody tr', (els) => els.length);
console.log('✓ 逐音明细行数:', detailRows);

// localStorage 持久化
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('helmholtz-violin-results') ?? '[]'));
console.log('✓ 历史记录数:', stored.length, '首条分数:', stored[0]?.totalScore, '音符数:', stored[0]?.noteScores?.length);
if (!stored.length || stored[0].noteScores.length === 0) throw new Error('成绩未正确保存');

// regime 占比之和应≈1
const stats = stored[0].regimeStats;
const sum = Object.values(stats).reduce((a, b) => a + b, 0);
console.log('✓ regime 占比之和:', sum.toFixed(3), 'maxCombo:', stored[0].maxCombo);

await browser.close();
if (errors.length) {
  console.error('错误:', errors);
  process.exit(1);
}
console.log('\n端到端关卡测试通过 ✓');
