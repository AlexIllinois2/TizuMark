// 正则模式搜索回归测试：
//   覆盖正则勾选后的关键行为——编辑器/预览高亮、区分大小写、多选分组、
//   非法正则守卫（isSafeRegex 不崩）、find-next 导航、跨文件 searchOpenFiles 正则收集。
//
// 复用 jsdom + 真实 CodeMirror 实例的 harness；highlightAllMatches / highlightPreviewMatches
// 为实例方法，直接调用可绕过 input 防抖，便于稳定断言高亮结果。

const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

// 勾选正则并设置查询（绕过防抖，直接调高亮方法）
function setupRegexFind(w, query, caseSensitive) {
  const ed = w.editor;
  w.document.getElementById('find-regex').checked = true;
  w.document.getElementById('find-case').checked = !!caseSensitive;
  w.document.getElementById('find-input').value = query;
  ed.highlightAllMatches();
  return ed;
}

// ---------- 1. 正则 \d+ 编辑器高亮所有数字 ----------
test('regex: \\d+ 匹配并高亮编辑器内所有数字', async () => {
  const { w } = buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.cm.setValue('abc 123 def 45\nno digits\n7 end');
  setupRegexFind(w, '\\d+');
  assert.strictEqual(ed.findMarks.length, 3, '应高亮 3 处数字串（123/45/7）');
  cleanup(w);
});

// ---------- 2. 正则多选 (foo|bar) 高亮 ----------
test('regex: (foo|bar) 多选匹配高亮 foo 与 bar', async () => {
  const { w } = buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.cm.setValue('foo bar baz foo');
  setupRegexFind(w, '(foo|bar)');
  assert.strictEqual(ed.findMarks.length, 3, '应高亮 2 个 foo + 1 个 bar = 3 处');
  cleanup(w);
});

// ---------- 3. 正则 + 区分大小写 ----------
test('regex: 区分大小写时 Hello 只匹配大写 H', async () => {
  const { w } = buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.cm.setValue('Hello hello HELLO hello');
  // 区分大小写：只匹配 Hello（1 处）
  setupRegexFind(w, 'Hello', true);
  assert.strictEqual(ed.findMarks.length, 1, '区分大小写应仅匹配 1 处 Hello');
  // 不区分大小写：匹配全部 4 处
  setupRegexFind(w, 'Hello', false);
  assert.strictEqual(ed.findMarks.length, 4, '不区分大小写应匹配 4 处');
  cleanup(w);
});

// ---------- 4. 正则模式预览高亮 ----------
test('regex: \\d+ 在预览面板也高亮', async () => {
  const { w } = buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.preview.innerHTML = '<p>abc 123 def</p><p>45 end</p>';
  ed.highlightPreviewMatches('\\d+', false, true);
  const marks = ed.preview.querySelectorAll('mark.search-match');
  assert.strictEqual(marks.length, 2, '预览应高亮 2 处数字（123/45）');
  cleanup(w);
});

// ---------- 5. 非法正则守卫：[ 不崩、不高亮 ----------
test('regex: 非法正则 "[" 不抛错且无高亮（try/catch 兜底）', async () => {
  const { w } = buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.cm.setValue('hello [ world');
  // isSafeRegex 只防 ReDoS，不防语法错误（语法错误由 new RegExp 的 try/catch 兜底）
  assert.strictEqual(w.FindReplace.isSafeRegex('['), true, 'isSafeRegex 只防 ReDoS，"[" 通过安全检查');
  // 勾选正则输入非法模式：highlightAllMatches 内 try/catch 捕获，不抛异常、不产生高亮
  assert.doesNotThrow(() => setupRegexFind(w, '['), '非法正则不应抛错');
  assert.strictEqual(ed.findMarks.length, 0, '非法正则不应产生任何高亮');
  cleanup(w);
});

// ---------- 6. 正则模式 find-next 导航 ----------
test('regex: find-next 在正则模式下正确定位匹配', async () => {
  const { w } = buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.cm.setValue('a1 b2 c3');
  w.document.getElementById('find-regex').checked = true;
  w.document.getElementById('find-case').checked = false;
  w.document.getElementById('find-input').value = '[a-z]\\d';
  // 第一次 find-next：定位到 a1
  w.document.getElementById('find-next').click();
  let cur = ed.cm.getCursor();
  assert.strictEqual(ed.cm.getRange({ line: 0, ch: 0 }, cur), 'a1', '首次 next 应定位 a1');
  // 第二次：b2
  w.document.getElementById('find-next').click();
  cur = ed.cm.getCursor();
  assert.strictEqual(ed.cm.getRange({ line: 0, ch: 3 }, cur), 'b2', '第二次 next 应定位 b2');
  cleanup(w);
});

// ---------- 7. 跨文件 searchOpenFiles 正则收集 ----------
test('crossSearch: searchOpenFiles 用正则 \\d+ 收集匹配', async () => {
  const { w } = buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.tabs = [
    { name: 'a.md', filePath: '/a.md', content: 'num 11 here\nno digits', _loaded: true },
    { name: 'b.md', filePath: '/b.md', content: 'x\ny 22 z', _loaded: true },
  ];
  ed.activeTabIndex = 0;
  const results = await ed.searchOpenFiles('\\d+', false, true);
  assert.strictEqual(results.length, 2, '两个文件都应命中');
  assert.strictEqual(results[0].matches.length, 1, 'a.md 应 1 处匹配');
  assert.strictEqual(results[0].matches[0].len, 2, 'a.md 匹配长度应为 2（"11"）');
  assert.strictEqual(results[1].matches[0].len, 2, 'b.md 匹配长度应为 2（"22"）');
  cleanup(w);
});
