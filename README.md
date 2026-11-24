# 赫姆霍兹小提琴 · 弓弦摩擦实验室

一个用**弓弦粘-滑摩擦物理**驱动的小提琴学习游戏。和传统节奏音游不同，它考的是小提琴真正的难点——右手对**弓压、弓速、离琴码距离（β）**三者配合的控制：配合得好，弦做单拐角的赫姆霍兹运动，发出干净的音；弓压太小，一个周期内多次打滑，声音发虚；弓压太大，弦被弓毛粘住，发出吱吱噪音。

## 快速开始

```bash
npm install
npm run dev        # 打开 http://127.0.0.1:5173
npm run build      # 类型检查 + 生产构建
npm run test:physics   # Node 下的物理验证（无需浏览器）
```

浏览器冒烟/端到端测试（需先 `npm run dev`，依赖 Playwright）：

```bash
node tests/browser-smoke.mjs   # 四页面 + AudioWorklet 实时物理
node tests/level-e2e.mjs       # 完整通关 + 评分持久化
```

## 操作方式

在「运弓控制板」上：

| 手势 | 控制量 |
| --- | --- |
| 按住左右拖动 | 弓速（带方向，决定下弓/上弓） |
| 按住时的上下位置 | 弓压（上轻下重）；触屏压力作为微调 |
| 滚轮 / β 滑块 | 离琴码距离 β |
| 抬起指针 | 离弦（跳弓的离弦段由关卡弓法自动调制） |

把发音状态保持在**绿色「赫姆霍兹」**即得分。

## 四个页面

1. **运弓练习页**：自由运弓，实时看琴/弓 Canvas、发音状态、弓力、起音延迟；可换 3 把琴、3 把弓、4 根弦。
2. **弓压弓速图页**：Schelleng 窗口图（弓速×弓力平面上的好音区），实时叠加操作点轨迹，直观看到窗口随 β 收窄。
3. **曲目关卡页**：5 首自编练习曲（空弦长弓、三平面长音、跳弓、换弦小曲、强弱变化），按音符序列跟拉，含换弦、换弓、跳弓。
4. **成绩页**：总分、逐音明细（好音占比/弓压命中/弓速稳定/起音）、发音状态占比、历史最佳（localStorage 持久化）。

## 物理与音频架构

```
鼠标/触屏 (BowController)
      │  pressure / bowSpeed / beta / contact
      ▼
主线程 ViolinAudioEngine ──AudioParam──▶ AudioWorklet (bow-worklet.ts)
                                              │
                          每采样点求解 BowStringEngine（string-physics.ts）
                          · 双向数字波导弦（速度波，往返长度=1/f0）
                          · 回滞粘-滑接触 + rosin 双指数摩擦曲线
                          · Schelleng 窗口三分：airy / Helmholtz / raucous
                                              │ 桥端速度波
                                              ▼
                          琴身双二阶共振组 + 主低通 + tanh 软限幅
                                              │
                          每 1024 样本（≈21ms）上报 StringAnalysis
```

- **AudioWorklet 实时计算**：所有摩擦/波导物理在音频线程逐采样求解，主线程零音频负担。TS 源文件经自定义 Vite 插件（`vite-plugins/worklet.ts`，esbuild 打包成自包含 Blob 模块）加载，dev/build 行为一致。
- **赫姆霍兹运动**：Schelleng 窗口内，接触点状态机按基频相位锁相，每周期 `(1−β)` 时间粘住（弦被弓带走）、`β` 时间快速滑回，自然形成单个拐角的两速平台（实测 slip/周期=1.00、间隔变异系数 <0.02）。
- **Schelleng 窗口**（与经典拓扑一致）：
  - 下限 `fMin ∝ Z²·v / (β(1−β))`——弦中部最低，靠琴码/指板都抬升；
  - 上限 `fMax ∝ Z·v·(1−β)/(β·Δμ)`——靠指板发散，靠琴码收窄。
  - 窗口随弓速线性展宽、随 β 增大而收窄（`tests/schelleng.ts` 验证）。
- **三种发音状态**（`tests/regimes.ts` 验证四弦均成立）：
  - 弓压 < fMin：滑动摩擦 + 宽带松香噪声，无规则多滑 → 气声；
  - fMin ≤ 弓压 ≤ fMax：单拐角赫姆霍兹 → 好音；
  - 弓压 > fMax：弦被咬死、偶发微破裂 → 噪音。

## 关键指标（测试实测）

- **运弓→出声延迟**：1.9–3.2 ms（要求 <20ms，见 `tests/onset-timbre.ts`，子帧级时间戳测量）。
- **四弦音色差异**：频谱质心 G3 1288Hz → E5 1987Hz，由各弦独立的反射损耗、桥截止频率与琴身共振共同决定，可听出明暗差别。
- **三态响度**：气声 RMS≈0.03（虚）vs 好音 0.22（饱满），无 NaN、无硬削波（`tests/audio-chain.ts`）。

## 虚构器材与曲目

- 3 把琴：工坊 1742 型（宽容，适合入门）、克雷莫纳之声（平衡）、黑鸟独奏琴（窗口窄、明亮穿透）。
- 3 把弓：练习马尾弓、金松香演奏弓、碳素跳弓（摩擦曲线 μ_s/μ_d/v_c 各异）。
- 5 首练习曲均为教学目的自编，针对空弦、β 平面、跳弓、换弦、强弱变化等右手技术。

## 目录结构

```
src/
  audio/
    string-physics.ts   波导弦 + 粘-滑接触 + Schelleng 窗口（纯物理，可在 Node 测试）
    bow-worklet.ts      AudioWorklet 薄封装（四弦并行、琴身滤波、分析帧上报）
    engine.ts           主线程音频引擎单例
  input/bow-controller.ts   指针 → 弓速/弓压/β/接触
  game/                 评分器与曲目序列器（含跳弓门控）
  render/               Canvas 琴/弓渲染、Schelleng 图
  pages/                四个页面
  instruments.ts pieces.ts types.ts
tests/                  物理验证 + Playwright 浏览器测试
vite-plugins/worklet.ts worklet TS→Blob 模块编译插件
```
