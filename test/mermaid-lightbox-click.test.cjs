// 图表（mermaid）查看器点击回归测试。
// 背景 bug：preview 点击委托用 closest('.mermaid-container svg') 只匹配「自身是 svg 且祖先有
// container」的节点——点击 svg 内部能命中，但点击容器内边距（两侧灰色区，target 是 div 本身）
// 匹配不到，lightbox 打不开。修复：锚点改为容器 + 内部 querySelector('svg')。
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, waitForEditor, delay } = require('./helpers/app-env.cjs');

const SVG_NS = 'http://www.w3.org/2000/svg';

async function makeEditor() {
  const { w } = await buildEnv();
  const ed = await waitForEditor(w);
  // spy showLightbox：只记录调用，不触达真实 lightbox DOM
  const calls = [];
  ed.showLightbox = (node, type) => { calls.push({ node, type }); };
  return { w, ed, calls };
}

function makeMermaidDom(w) {
  const container = w.document.createElement('div');
  container.className = 'mermaid-container';
  const svg = w.document.createElementNS(SVG_NS, 'svg');
  const rect = w.document.createElementNS(SVG_NS, 'rect'); // 模拟图表内部节点
  svg.appendChild(rect);
  container.appendChild(svg);
  return { container, svg, rect };
}

function clickNode(w, el) {
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
}

test('点击 svg 内部（中央图表）：打开图表查看器', async () => {
  const { w, ed, calls } = await makeEditor();
  try {
    const { container, rect } = makeMermaidDom(w);
    ed.preview.appendChild(container);
    clickNode(w, rect);
    await delay(10);
    assert.strictEqual(calls.length, 1, '应触发一次 showLightbox');
    assert.strictEqual(calls[0].type, 'svg');
    assert.ok(calls[0].node && calls[0].node.tagName === 'svg', '应传入 svg 节点');
  } finally { cleanup(w); }
});

test('点击容器内边距（两侧灰色区，target 是 div）：也应打开', async () => {
  const { w, ed, calls } = await makeEditor();
  try {
    const { container } = makeMermaidDom(w);
    ed.preview.appendChild(container);
    clickNode(w, container); // e.target 是 div.mermaid-container 本身
    await delay(10);
    assert.strictEqual(calls.length, 1, '点击容器空白区应触发 showLightbox');
    assert.strictEqual(calls[0].type, 'svg');
  } finally { cleanup(w); }
});

test('点击容器外区域：不触发图表查看器', async () => {
  const { w, ed, calls } = await makeEditor();
  try {
    const { container } = makeMermaidDom(w);
    ed.preview.appendChild(container);
    // preview 空白处（不是 mermaid container 内）
    clickNode(w, ed.preview);
    await delay(10);
    assert.strictEqual(calls.length, 0, '容器外点击不应触发 lightbox');
  } finally { cleanup(w); }
});
