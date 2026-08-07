// 大纲动态跟随：编辑器滚动/光标移动时，大纲高亮当前（最深）标题，且与面包屑指向同一标题。
// 用 jsdom 挂载真实 app，验证 updateOutlineActive 选取的标题 == 面包屑路径最后一个标题。

const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');
const { Outline } = (() => {
  // outline.js 以纯 CommonMark 导出，便于直接复用纯函数做一致性断言
  const path = require('path');
  return { Outline: require(path.resolve(__dirname, '..', 'src', 'modules', 'outline.js')) };
})();

const DOC = [
  '# A',       // 0
  '## B',      // 1
  '### C',     // 2
  'text after C', // 3
  '## D',      // 4
  'text after D', // 5
].join('\n');

test('outline-follow: 行号落在更深标题区段时高亮该标题，且与面包屑末元素一致', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  const ed = w.editor;
  ed.cm.setValue(DOC);
  ed.updateOutline(); // 渲染大纲树 + 设置 _breadcrumbHeadings

  // 光标在第 3 行（C 区段内）：当前最深标题应为 C(line 2)
  ed.updateOutlineActive(3);
  let active = w.document.querySelector('#outline-content .outline-item.active');
  assert.ok(active, '应有一个 outline-item 处于 active');
  assert.strictEqual(active.getAttribute('data-line'), '2', 'C 标题(line 2)应为 active');
  assert.strictEqual(active.getAttribute('data-id'), ed.headingToId('C'), 'active 的 data-id 应与 headingToId 一致');

  // 一致性：面包屑路径最后一个标题必须等于大纲 active 标题
  const bcLast = Outline.computeBreadcrumbPath(ed._breadcrumbHeadings, 3).pop();
  assert.strictEqual(bcLast.line, 2, '面包屑末元素应为 C(line 2)');

  // 切到 D 区段（第 5 行）：active 应改为 D(line 4)
  ed.updateOutlineActive(5);
  active = w.document.querySelector('#outline-content .outline-item.active');
  assert.strictEqual(active.getAttribute('data-line'), '4', 'D 标题(line 4)应为 active');

  // diff guard：再次同一行号不应改变 active（不会抛错，且仍是 D）
  ed.updateOutlineActive(5);
  active = w.document.querySelector('#outline-content .outline-item.active');
  assert.strictEqual(active.getAttribute('data-line'), '4', '重复同区段调用应保持不变');
  cleanup(w);
});

test('outline-follow: 行号在首个标题之前时清空高亮', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  const ed = w.editor;
  ed.cm.setValue(DOC);
  ed.updateOutline();
  ed.updateOutlineActive(0); // 第 0 行即 A，仍高亮 A
  assert.ok(w.document.querySelector('#outline-content .outline-item.active'), '第 0 行应高亮 A');

  // 文档无标题时清空（构造一个无标题场景）
  ed._breadcrumbHeadings = [];
  ed.updateOutlineActive(2);
  assert.strictEqual(w.document.querySelectorAll('#outline-content .outline-item.active').length, 0,
    '无标题时应无 active 高亮');
  cleanup(w);
});

test('outline-follow(preview): 按预览滚动位置反查当前标题高亮', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  const ed = w.editor;
  const preview = w.document.getElementById('preview');
  ed.cm.setValue(DOC);
  ed.updateOutline();
  const ids = ed._breadcrumbHeadings.map((h) => h.id);

  preview.getBoundingClientRect = () => ({ top: 0, bottom: 500 });
  const setTop = (el, top) => { el.getBoundingClientRect = () => ({ top, bottom: top + 20 }); };

  // 场景1：视口停在 A 处（A 越过上沿、B 未越过）→ 当前标题 A(line 0)
  preview.innerHTML = `<h1 id="${ids[0]}">A</h1><h2 id="${ids[1]}">B</h2><h3 id="${ids[2]}">C</h3><h2 id="${ids[3]}">D</h2>`;
  const els = preview.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]');
  setTop(els[0], 0); setTop(els[1], 50); setTop(els[2], 120); setTop(els[3], 200);
  ed.updateOutlineFromPreview();
  let active = w.document.querySelector('#outline-content .outline-item.active');
  assert.strictEqual(active.getAttribute('data-line'), '0', '场景1：应高亮 A(line 0)');

  // 场景2：继续下滚到 B 顶部（A、B 均越过，C 未越过）→ 当前标题 B(line 1)
  setTop(els[0], -30); setTop(els[1], 0); setTop(els[2], 60); setTop(els[3], 200);
  ed.updateOutlineFromPreview();
  active = w.document.querySelector('#outline-content .outline-item.active');
  assert.strictEqual(active.getAttribute('data-line'), '1', '场景2：应高亮 B(line 1)');

  // 场景3：滚到首个标题之前（所有标题都在下沿之下）→ 清空高亮
  setTop(els[0], 100); setTop(els[1], 150); setTop(els[2], 220); setTop(els[3], 300);
  ed.updateOutlineFromPreview();
  assert.strictEqual(w.document.querySelectorAll('#outline-content .outline-item.active').length, 0,
    '场景3：滚到首个标题之前应清空高亮');

  // 场景4：大文档虚拟预览 → 用窗口焦点行 _previewFocusLine 推导（D 在 line 4）
  ed._previewVirtual = true;
  ed._previewFocusLine = 4;
  ed.updateOutlineFromPreview();
  active = w.document.querySelector('#outline-content .outline-item.active');
  assert.strictEqual(active.getAttribute('data-line'), '4', '场景4：虚拟预览应高亮焦点行所在 D(line 4)');
  ed._previewVirtual = false;
  cleanup(w);
});
