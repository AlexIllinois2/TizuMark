// P0-3c（C2/C14/C15）：preview-window.js 纯函数单测，不加载 app.js。
// 覆盖：全量返回 / 块边界 / 围栏奇偶不被切开 / 焦点前置 lead / guard 上限 / end<=start 兜底 /
//        N18 窗口行数真实不变量 2200 / N16 五连锁（NaN/undefined/null/负数/越界）/
//        N17 性能基线（仅记录，不设硬阈值）。

const test = require('node:test');
const assert = require('node:assert/strict');
const { isBlockStart, computePreviewWindow } = require('../src/modules/preview-window.js');

const DEFAULTS = { maxLines: 5000, lead: 200, windowLines: 1200 };

// 生成 n 行内容；每隔 step 行插入一个标题（块起点），便于验证回退到块边界
function makeContent(n, step) {
  const lines = [];
  for (let i = 0; i < n; i++) {
    lines.push(i % step === 0 ? `# 标题 ${i}` : `正文段落内容行 ${i}`);
  }
  return lines.join('\n');
}

// 全为「非块起点」的纯文本行（用于触发 guard 上限与最大窗口宽度）
function plainContent(n) {
  return Array.from({ length: n }, (_, i) => `plain line ${i}`).join('\n');
}

test('isBlockStart 各类块起点识别', () => {
  assert.equal(isBlockStart(''), true);
  assert.equal(isBlockStart('   '), true);
  assert.equal(isBlockStart('# 标题'), true);
  assert.equal(isBlockStart('###### h'), true);
  assert.equal(isBlockStart('```'), true);
  assert.equal(isBlockStart('~~~'), true);
  assert.equal(isBlockStart('---'), true);
  assert.equal(isBlockStart('***'), true);
  assert.equal(isBlockStart('___'), true);
  assert.equal(isBlockStart('| a | b |'), true);
  // 非块起点
  assert.equal(isBlockStart('普通文本'), false);
  assert.equal(isBlockStart('  缩进文本'), false);
  assert.equal(isBlockStart('1. 有序列表'), false);
  assert.equal(isBlockStart('> 引用'), false);
});

test('total <= maxLines 直接全量返回（不进窗口模式）', () => {
  const c = makeContent(100, 10);
  const w = computePreviewWindow(c, 50, DEFAULTS);
  assert.deepEqual(w, { start: 0, end: 100 });
});

test('>5000 行：起点回退到块边界', () => {
  const c = makeContent(6000, 10); // 每 10 行一个标题
  const focus = 3000;
  const w = computePreviewWindow(c, focus, DEFAULTS);
  const lines = c.split('\n');
  // 起点应在 focus-lead 之前，且落在一个标题（块起点）上
  assert.ok(w.start < focus - DEFAULTS.lead + 1, '起点应回退到焦点前的块边界');
  assert.ok(isBlockStart(lines[w.start]), '起点必须是块起点');
  assert.ok(w.start % 10 === 0, '标题行应为 10 的倍数行号');
  // 终点也应在块边界上（或到达文档末尾）
  if (w.end < 6000) assert.ok(isBlockStart(lines[w.end]), '终点必须是块起点');
});

test('焦点在文档开头附近：start 不会越过 0', () => {
  const c = makeContent(6000, 10);
  const w = computePreviewWindow(c, 5, DEFAULTS);
  assert.ok(w.start >= 0);
  assert.ok(isBlockStart(c.split('\n')[w.start]), '起点仍应落在块边界');
});

test('代码围栏奇偶配对不被切开（窗口内 fence 数必为偶数）', () => {
  // 构造：focus 落在一个长围栏内部
  const n = 6000;
  const lines = Array.from({ length: n }, (_, i) => `正文 ${i}`);
  const fenceOpen = 2900, fenceClose = 3200;
  lines[fenceOpen] = '```js';
  for (let i = fenceOpen + 1; i < fenceClose; i++) lines[i] = '  code();';
  lines[fenceClose] = '```';
  const c = lines.join('\n');
  const focus = 3050; // 围栏内部
  const w = computePreviewWindow(c, focus, DEFAULTS);
  const win = c.split('\n').slice(w.start, w.end).join('\n');
  const fences = (win.match(/^`{3,}|^~{3,}/gm) || []).length;
  assert.equal(fences % 2, 0, '窗口内代码围栏必须成对，不得从中间切开');
  // 若窗口包含围栏起点，也必包含终点（反之亦然）：两边都在窗口内或都在外
  const winLines = c.split('\n').slice(w.start, w.end);
  const hasOpen = winLines.includes('```js');
  const hasClose = winLines.includes('```');
  assert.equal(hasOpen, hasClose, '围栏起点与终点必须同时落在窗口内');
});

test('guard 上限 500：无块边界时起点停在 focus-lead-500（不越界到 0）', () => {
  const c = plainContent(6000); // 全非块起点
  const focus = 3000;
  const w = computePreviewWindow(c, focus, DEFAULTS);
  // start 应为 2800 - 500 = 2300（guard 耗尽，而非一路退到 0）
  assert.equal(w.start, 2300, '无块边界时应被 guard 上限卡在 2300');
  assert.equal(w.end, 4500, '终点对称被 guard 上限卡在 4500');
});

test('N18 窗口行数真实不变量：end-start ≤ windowLines + 2*guardMax (=2200)', () => {
  const c = plainContent(6000);
  const w = computePreviewWindow(c, 3000, DEFAULTS);
  const width = w.end - w.start;
  assert.ok(width <= 2200, `窗口宽度 ${width} 不得越过 2200`);
  assert.equal(width, 2200, '纯文本大文档应达到最大窗口宽度 2200（实测基线）');
});

test('N18 零块边界大文档返回 2200 行（锁定实测基线）', () => {
  const c = plainContent(8000);
  const w = computePreviewWindow(c, 4000, DEFAULTS);
  assert.equal(w.end - w.start, 2200);
});

test('end<=start 兜底：任意采样输入均保证 end>start', () => {
  // 模糊覆盖：多种长度 + 多种焦点，验证兜底保证 end>start
  for (let n = 1; n <= 50; n++) {
    const c = plainContent(n * 100 + 1);
    for (const focus of [-50, 0, Math.floor(n * 50), 999999, NaN, undefined, null, -1]) {
      const w = computePreviewWindow(c, focus, DEFAULTS);
      assert.ok(w.end > w.start, `n=${n} focus=${focus} 应保证 end>start，实际 ${JSON.stringify(w)}`);
    }
  }
});

test('N16 五连锁：NaN/undefined/null/负数/越界焦点全部返回有限合法 {start,end}', () => {
  const c = makeContent(6000, 10);
  const bad = [NaN, undefined, null, -100, 999999, 1.5];
  for (const f of bad) {
    const w = computePreviewWindow(c, f, DEFAULTS);
    assert.ok(Number.isFinite(w.start), `focus=${String(f)} start 必须有限`);
    assert.ok(Number.isFinite(w.end), `focus=${String(f)} end 必须有限`);
    assert.ok(w.start >= 0 && w.end >= 0 && w.end > w.start, `focus=${String(f)} 必须合法`);
    assert.ok(w.end <= 6000, `focus=${String(f)} 不得越界文档末尾`);
  }
});

test('opts 默认值兜底：未传 opts 时使用内置 5000/200/1200', () => {
  const c = makeContent(6000, 10);
  const w = computePreviewWindow(c, 3000); // 不传 opts
  assert.ok(w.start >= 0 && w.end > w.start, '默认 opts 应能产生合法窗口');
  assert.ok(w.end - w.start <= 2200, '默认 opts 窗口宽度仍受限');
});

test('N17 性能基线：最坏场景（纯文本 6000 行）连续 50 次调用记录耗时', () => {
  // 仅记录，不设硬阈值（机器差异会导致 flaky）。P1-9 优化后同输入逐条比对。
  const c = plainContent(6000);
  const t0 = Date.now();
  const N = 50;
  let last;
  for (let i = 0; i < N; i++) last = computePreviewWindow(c, 3000, DEFAULTS);
  const dt = Date.now() - t0;
  assert.ok(last.end - last.start === 2200, '兜底确认窗口仍为最大宽度');
  console.log(`[N17 基线] ${N} 次最坏场景 computePreviewWindow 耗时 ${dt}ms（≈${(dt / N).toFixed(2)}ms/次）`);
});
