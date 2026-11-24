/**
 * AudioWorklet 全局环境与 Vite 虚拟模块的类型声明。
 * 这些标识符在 worklet 全局作用域中直接可用（运行时由浏览器注入）。
 */

declare class AudioWorkletProcessor {
  constructor();
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
  static parameterDescriptors?: { name: string; defaultValue: number; automationRate: AutomationRate }[];
}

declare const sampleRate: number;
declare const currentTime: number;
declare const currentFrame: number;
declare function registerProcessor(
  name: string,
  ctor: new () => AudioWorkletProcessor,
): void;

type AutomationRate = 'a-rate' | 'k-rate';

/** Vite 插件把 ?worklet-url 编译成 Blob URL 字符串 */
declare module '*?worklet-url' {
  const url: string;
  export default url;
}
