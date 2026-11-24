/**
 * 物理测试运行器：用 esbuild 把每个 TS 测试打成临时 ESM 再用 Node 执行。
 * 不依赖浏览器，验证摩擦物理、Schelleng 窗口、起音/音色与离线音频链。
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, '.tmp-test');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const tests = ['regimes', 'schelleng', 'onset-timbre', 'audio-chain'];
let failed = 0;

for (const name of tests) {
  const entry = join(root, 'tests', `${name}.ts`);
  const out = join(outDir, `${name}.mjs`);
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  process.stdout.write(`\n===== ${name} =====\n`);
  try {
    execFileSync(process.execPath, [out], { stdio: 'inherit' });
  } catch {
    failed++;
  }
}
rmSync(outDir, { recursive: true, force: true });
if (failed) {
  console.error(`\n${failed} 个测试失败`);
  process.exit(1);
}
console.log('\n全部物理测试通过 ✓');
