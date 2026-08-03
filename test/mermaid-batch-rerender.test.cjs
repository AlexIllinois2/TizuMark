// 主题切换 mermaid 分批重渲染 + loading 提示测试。
// 根因：rerenderMermaid 一次性 mermaid.run(全部节点) 是同步 CPU 密集任务（layout 计算），
// 图表多时阻塞主线程造成明显卡顿。修复：每帧一批（BATCH=3）+ rAF 让步，图表 >6 显示 pane-loading。
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, waitForEditor } = require('./helpers/app-env.cjs');

function fakeMermaid() {
  return {
    runs: [],
    initialize() {},
    async run({ nodes }) {
      this.runs.push(nodes.map((n) => n.textContent));
    },
  };
}

async function makeEditorWithMermaid(nodeCount) {
  const { w } = await buildEnv();
  const ed = await waitForEditor(w);
  w.mermaid = fakeMermaid(); // 注入 fake mermaid（构造期 rerenderMermaid 因 mermaid 未定义已跳过）
  const frag = w.document.createDocumentFragment();
  for (let i = 0; i < nodeCount; i++) {
    const c = w.document.createElement('div');
    c.className = 'mermaid-container';
    c.textContent = 'graph LR; A-->B' + i;
    frag.appendChild(c);
  }
  ed.preview.appendChild(frag);
  return { w, ed, mermaid: w.mermaid };
}

test('图表少（3）：按 BATCH=2 分 2 批完成，不显示 loading', async () => {
  const { w, ed, mermaid } = await makeEditorWithMermaid(3);
  try {
    let begins = 0;
    const ob = ed._beginPaneLoad.bind(ed);
    ed._beginPaneLoad = () => { begins++; ob(); };
    await ed.rerenderMermaid();
    assert.strictEqual(mermaid.runs.length, 2, '3 个图表按 BATCH=2 分 2 批');
    assert.strictEqual(begins, 0, '图表少（≤6）不应显示 loading');
    let total = 0;
    for (const batch of mermaid.runs) {
      assert.ok(batch.length <= 2, '每批不得超过 2 个节点');
      total += batch.length;
    }
    assert.strictEqual(total, 3, '分批不得丢节点');
  } finally { cleanup(w); }
});

test('图表多（8）：分批渲染，每批 ≤2，总节点不丢', async () => {
  const { w, ed, mermaid } = await makeEditorWithMermaid(8);
  try {
    await ed.rerenderMermaid();
    assert.ok(mermaid.runs.length >= 4, '8 个图表应至少分 4 批（BATCH=2）');
    let total = 0;
    for (const batch of mermaid.runs) {
      assert.ok(batch.length <= 2, '每批不得超过 2 个节点');
      total += batch.length;
    }
    assert.strictEqual(total, 8, '分批不得丢节点');
  } finally { cleanup(w); }
});

test('图表多（8）：显示 loading 并在完成后隐藏（_beginPaneLoad/_endPaneLoad 对称）', async () => {
  const { w, ed } = await makeEditorWithMermaid(8);
  try {
    let begins = 0;
    let ends = 0;
    const ob = ed._beginPaneLoad.bind(ed);
    const oe = ed._endPaneLoad.bind(ed);
    ed._beginPaneLoad = () => { begins++; ob(); };
    ed._endPaneLoad = () => { ends++; oe(); };
    await ed.rerenderMermaid();
    assert.ok(begins >= 1, '图表多时应显示 loading');
    assert.strictEqual(begins, ends, 'loading 开始/结束必须对称');
    // hidePaneLoading 有 180ms 最小显示时长，需等它完成再断言隐藏
    await new Promise((r) => setTimeout(r, 220));
    assert.ok(w.document.getElementById('pane-loading').classList.contains('hidden'), '完成后应隐藏 loading');
  } finally { cleanup(w); }
});

test('toggleTheme 切换太快时遮罩有最小显示时长（不一闪而过）', async () => {
  const { w, ed } = await makeEditorWithMermaid(2); // 图表少，渲染快
  try {
    const start = Date.now();
    await ed.toggleTheme();
    const duration = Date.now() - start;
    // 最小显示 300ms + 淡出 320ms ≈ 620ms；留 50ms 余量
    assert.ok(duration >= 570, '总时长应 ≥ 最小显示(300ms)+淡出(320ms)，实际 ' + duration + 'ms');
  } finally { cleanup(w); }
});

test('toggleTheme 点击即全局 loading：遮罩固定切换前主题色，完成后淡出隐藏', async () => {
  const { w, ed } = await makeEditorWithMermaid(2);
  try {
    const overlay = w.document.getElementById('loading-overlay');
    // toggleTheme 是 async：调用后同步段立即固定旧主题色并显示遮罩，之后双 rAF 再改主题
    const p = ed.toggleTheme();
    assert.ok(!overlay.classList.contains('hidden'), '点击应立即显示全局 loading');
    assert.notStrictEqual(overlay.style.backgroundColor, '', '遮罩应固定切换前主题色（避免瞬间跳变）');
    await p;
    assert.strictEqual(overlay.style.backgroundColor, '', '完成后应清除固定色');
    assert.ok(overlay.classList.contains('hidden'), '淡出后应隐藏遮罩');
    assert.ok(ed.isDark, '主题应已切换');
  } finally { cleanup(w); }
});
