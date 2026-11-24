import type { Plugin } from 'vite';
import { build } from 'esbuild';

/**
 * AudioWorklet 的 TS 文件不能走 Vite 常规管线（worklet 内无 Vite 运行时），
 * 用 esbuild 把它连同纯物理依赖打成单文件 ES 模块，以 Blob URL 导出，
 * dev / build 两种模式行为一致。
 */
export function audioWorkletPlugin(): Plugin {
  const VIRTUAL = '?worklet-url';
  return {
    name: 'audio-worklet-url',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (source.endsWith(VIRTUAL)) {
        const real = source.slice(0, -VIRTUAL.length);
        const resolved = await this.resolve(real, importer, { skipSelf: true });
        return resolved ? `${resolved.id}${VIRTUAL}` : null;
      }
      return null;
    },
    async load(id) {
      if (!id.endsWith(VIRTUAL)) return null;
      const entry = id.slice(0, -VIRTUAL.length);
      const result = await build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
        target: ['chrome94', 'firefox93', 'safari14.1'],
        sourcemap: false,
        logLevel: 'silent',
      });
      const code = JSON.stringify(result.outputFiles[0].text);
      return `
const src = ${code};
const blob = new Blob([src], { type: 'text/javascript' });
export default URL.createObjectURL(blob);
`;
    },
  };
}
