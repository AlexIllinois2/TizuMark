// 搜索功能增强回归测试（覆盖 4 项需求）：
//   需求1：文件中查找增加「循环查找」勾选框；跨文件搜索不再有该勾选框
//   需求2：高亮改为醒目黄色，编辑与预览中的文字都高亮（编辑器 CM markText + 预览 DOM <mark>）
//   需求3：页面查找与跨文件搜索互斥（同时只能开一个）
//   需求4：跨文件搜索 — 目录行/进度条显隐（修复 .hidden 无规则导致一直显示的 bug）、浏览按钮主题色
//
// 复用 jsdom + 真实 CodeMirror 实例的 harness；invoke 可注入以便测试 search_in_files 路径。

const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');

// ---------- 需求2：醒目黄色高亮（编辑 + 预览共用 .search-match）----------
test('css: .search-match 为醒目黄色（编辑与预览共用）', async () => {
  assert.ok(/\.search-match\s*\{[^}]*background-color:\s*#ffe24d/s.test(css),
    '.search-match 应使用醒目黄色 background-color: #ffe24d（而非半透明浅黄）');
});

// ---------- 需求1：文件中查找出现循环查找勾选框；跨文件搜索不再有 ----------
test('html: 文件中查找（编辑/预览）含「循环查找」勾选框，跨文件搜索不含', async () => {
  const { w } = await buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.ok(w.document.getElementById('find-loop'), '编辑内查找应有 find-loop 勾选框');
      assert.ok(w.document.getElementById('preview-find-loop'), '预览内查找应有 preview-find-loop 勾选框');
      assert.strictEqual(w.document.getElementById('cs-loop'), null, '跨文件搜索不应再有 cs-loop 勾选框');
      cleanup(w);
      resolve();
    }, 300);
  });
});

test('i18n: loop 键在中文与英文词典均存在', async () => {
  const { w } = await buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      const ed = w.editor;
      assert.strictEqual(ed.t('loop', null, 'zh'), '循环查找', '中文应有 loop 键');
      assert.strictEqual(typeof ed.t('loop', null, 'en'), 'string', '英文应有 loop 键');
      cleanup(w);
      resolve();
    }, 300);
  });
});

// ---------- 需求1：编辑器 find-next 尊重循环勾选框 ----------
test('find: 循环查找未勾选时停在最后一条，不回绕', async () => {
  const { w } = await buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      const ed = w.editor;
      const cm = ed.cm;
      cm.setValue('foo bar foo');
      const fi = w.document.getElementById('find-input');
      const loop = w.document.getElementById('find-loop');
      const next = w.document.getElementById('find-next');
      fi.value = 'foo';
      loop.checked = false;
      next.click(); // 第1个 foo
      next.click(); // 第2个 foo
      next.click(); // 无更多，loop 关闭 -> 应停在最后
      const cur = cm.getCursor();
      assert.strictEqual(cur.ch, 11, '循环关闭时多次 next 应停在最后一个匹配（不回绕），实际 ch=' + cur.ch);
      cleanup(w);
      resolve();
    }, 300);
  });
});

test('find: 循环查找勾选时回绕到第一条', async () => {
  const { w } = await buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      const ed = w.editor;
      const cm = ed.cm;
      cm.setValue('foo bar foo');
      const fi = w.document.getElementById('find-input');
      const loop = w.document.getElementById('find-loop');
      const next = w.document.getElementById('find-next');
      fi.value = 'foo';
      loop.checked = true;
      next.click();
      next.click();
      next.click(); // 无更多，loop 开启 -> 回绕到第1个 foo
      const cur = cm.getCursor();
      assert.strictEqual(cur.ch, 3, '循环开启时 next 应回绕到第1个匹配末尾，实际 ch=' + cur.ch);
      cleanup(w);
      resolve();
    }, 300);
  });
});

test('find: 循环查找未勾选时 find-prev 停在第一个匹配，不回绕', async () => {
  const { w } = await buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      const ed = w.editor;
      const cm = ed.cm;
      cm.setValue('foo bar foo');
      const fi = w.document.getElementById('find-input');
      const loop = w.document.getElementById('find-loop');
      const prev = w.document.getElementById('find-prev');
      fi.value = 'foo';
      loop.checked = false;
      // 光标置于中间（bar 内），find-prev 退到第一个 foo
      cm.setCursor({ line: 0, ch: 5 });
      prev.click(); // 第一个 foo (ch 0..3)
      let cur = cm.getCursor();
      assert.strictEqual(cur.ch, 3, 'prev 应到第一个 foo 末尾');
      prev.click(); // 无更前的匹配，loop 关闭 -> 停在第一个
      cur = cm.getCursor();
      assert.strictEqual(cur.ch, 3, '循环关闭时 prev 停在第一个匹配，不回绕，实际 ch=' + cur.ch);
      // 开启循环后应回绕到最后一个 foo
      loop.checked = true;
      prev.click();
      cur = cm.getCursor();
      assert.strictEqual(cur.ch, 11, '循环开启时 prev 应回绕到最后一个 foo 末尾，实际 ch=' + cur.ch);
      cleanup(w);
      resolve();
    }, 300);
  });
});

// ---------- 需求2：预览文字高亮（DOM <mark class="search-match">）----------
test('preview: highlightPreviewMatches 包裹 <mark> 且 clearPreviewHighlights 还原文本', async () => {
  const { w } = await buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      const ed = w.editor;
      const pv = w.document.createElement('div');
      pv.innerHTML = '<p>foo bar foo</p>';
      ed.preview = pv;
      ed.highlightPreviewMatches('foo', false, false);
      const marks = pv.querySelectorAll('mark.search-match.preview-search-hl');
      assert.strictEqual(marks.length, 2, '应包裹 2 处 foo 为高亮 <mark>');
      assert.strictEqual(marks[0].textContent, 'foo', 'mark 内容应为匹配文本');
      // 清除后还原且文本完整
      ed.clearPreviewHighlights();
      assert.strictEqual(pv.querySelectorAll('mark.preview-search-hl').length, 0, '清除后不应残留 mark');
      assert.strictEqual(pv.textContent, 'foo bar foo', '清除后预览文本应完整保留');
      cleanup(w);
      resolve();
    }, 300);
  });
});

test('preview: 高亮上限 2000，超出不再包裹（防止超大文档卡顿）', async () => {
  const { w } = await buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      const ed = w.editor;
      const pv = w.document.createElement('div');
      // 2500 个 "x" 连成一段，含 2499 个相邻 "xx" 匹配
      pv.textContent = 'x'.repeat(2500);
      ed.preview = pv;
      ed.highlightPreviewMatches('xx', false, false);
      const marks = pv.querySelectorAll('mark.preview-search-hl');
      assert.ok(marks.length <= 2000, '预览高亮应受 2000 上限约束，实际 ' + marks.length);
      ed.clearPreviewHighlights();
      cleanup(w);
      resolve();
    }, 300);
  });
});

// ---------- 需求4：跨文件搜索显隐修复（目录行 / 进度条 .hidden 规则）----------
test('css: .cs-dir-row.hidden 与 .cs-progress.hidden 必须存在 display:none 规则', async () => {
  assert.ok(/\.cs-dir-row\.hidden\s*\{\s*display:\s*none/s.test(css), '应存在 .cs-dir-row.hidden { display:none }');
  assert.ok(/\.cs-progress\.hidden\s*\{\s*display:\s*none/s.test(css), '应存在 .cs-progress.hidden { display:none }（修复「搜索中」一直显示）');
});

test('crossSearch: 选「已打开文件」隐藏目录行，选「目录」显示目录行', async () => {
  const { w } = await buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      const ed = w.editor;
      ed.openCrossSearchDialog();
      const openRadio = w.document.querySelector('input[name="cs-scope"][value="open"]');
      const dirRadio = w.document.querySelector('input[name="cs-scope"][value="dir"]');
      const dirRow = w.document.getElementById('cs-dir-row');
      // 默认 open
      assert.ok(dirRow.classList.contains('hidden'), '默认（已打开文件）目录行应隐藏');
      dirRadio.checked = true;
      dirRadio.dispatchEvent(new w.Event('change'));
      assert.ok(!dirRow.classList.contains('hidden'), '选「目录」后目录行应显示');
      openRadio.checked = true;
      openRadio.dispatchEvent(new w.Event('change'));
      assert.ok(dirRow.classList.contains('hidden'), '重新选「已打开文件」后目录行应再次隐藏');
      cleanup(w);
      resolve();
    }, 300);
  });
});

test('crossSearch: 搜索完成后进度条重新隐藏（修复「搜索中」一直显示）', async () => {
  const { w } = await buildEnv(async (cmd, args) => {
    if (cmd === 'search_in_files') return [{ path: '/p/a.md', matches: [{ line: 1, col: 1, line_text: 'hello' }] }];
    return undefined;
  });
  await delay(300);
  const ed = w.editor;
  ed.tabs = [{ name: 'a.md', filePath: '/a.md', content: 'hello world', _loaded: true }];
  ed.activeTabIndex = 0;
  ed.openCrossSearchDialog();
  const dirRadio = w.document.querySelector('input[name="cs-scope"][value="dir"]');
  dirRadio.checked = true;
  dirRadio.dispatchEvent(new w.Event('change'));
  w.document.getElementById('cs-dir').value = '/p';
  w.document.getElementById('cs-query').value = 'hello';
  await ed.runCrossSearch();
  const progress = w.document.getElementById('cs-progress');
  assert.ok(progress.classList.contains('hidden'), '搜索完成后 cs-progress 应重新带 hidden（不再一直显示「搜索中」）');
  assert.ok(w.document.querySelector('#cs-results .cs-match'), '应渲染结果项');
  cleanup(w);
});

// ---------- 需求3：页面查找与跨文件搜索互斥 ----------
test('mutual: 打开跨文件搜索时关闭页面内查找面板并清高亮', async () => {
  const { w } = await buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      const ed = w.editor;
      // 先打开编辑内查找
      ed.viewMode = 'edit';
      ed.toggleFindPanel();
      assert.ok(!w.document.getElementById('find-panel').classList.contains('hidden'), '前置：find-panel 应已打开');
      // 再打开跨文件搜索
      ed.openCrossSearchDialog();
      assert.ok(w.document.getElementById('find-panel').classList.contains('hidden'), '打开跨文件搜索后 find-panel 应被隐藏');
      assert.ok(w.document.getElementById('preview-find-panel').classList.contains('hidden'), '打开跨文件搜索后 preview-find-panel 应被隐藏');
      cleanup(w);
      resolve();
    }, 300);
  });
});

test('mutual: 打开页面内查找时关闭跨文件搜索弹框', async () => {
  const { w } = await buildEnv();
  return new Promise((resolve) => {
    setTimeout(() => {
      const ed = w.editor;
      // 先打开跨文件搜索
      ed.openCrossSearchDialog();
      assert.ok(!w.document.getElementById('cross-search-dialog').classList.contains('hidden'), '前置：跨文件搜索应已打开');
      // 再打开页面内查找
      ed.viewMode = 'edit';
      ed.toggleFindPanel();
      assert.ok(w.document.getElementById('cross-search-dialog').classList.contains('hidden'), '打开页面查找后跨文件搜索弹框应被隐藏');
      cleanup(w);
      resolve();
    }, 300);
  });
});
