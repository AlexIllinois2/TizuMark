// 搜索功能 bug 修复回归测试：
// 1. 正则模式下 find-next 不再抛 ReferenceError（app.js 原 `new RegExpCtor` 未定义符号）
// 2. Ctrl+F 在 CM 有焦点时按一次即打开面板，不被全局 keydown 双触发关闭
//
// 复用 init-smoke 的 jsdom 加载方式（index.html + app.js + 模块脚本 + Tauri/浏览器 API stub），
// 额外加载 codemirror searchcursor addon（find-next 依赖 getSearchCursor）。

const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup } = require('./helpers/app-env.cjs');

test('find: 正则模式下 find-next 不抛 ReferenceError（RegExpCtor bug 修复）', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  return new Promise((resolve) => {
    setTimeout(() => {
      const cm = w.editor.cm;
      cm.setValue('hello world\nfoo bar');
      const findInput = w.document.getElementById('find-input');
      const regexBox = w.document.getElementById('find-regex');
      const nextBtn = w.document.getElementById('find-next');
      // 用 hel+o 匹配 'hello'（l+ 匹配 ll），避免贪婪歧义
      findInput.value = 'hel+o';
      regexBox.checked = true;
      regexBox.dispatchEvent(new w.Event('change'));
      findInput.dispatchEvent(new w.Event('input'));
      let threw = null;
      try { nextBtn.click(); } catch (e) { threw = e; }
      assert.strictEqual(threw, null, '正则 find-next 不应抛错（RegExpCtor 已改为 new RegExp）');
      // 修复前：app.js:3583 `new RegExpCtor(...)` 抛 ReferenceError；修复后应选中匹配 'hello'
      assert.strictEqual(cm.getSelection(), 'hello', '应选中匹配 "hello"');
      cleanup(w);
      resolve();
    }, 300);
  });
});

// 注：Ctrl+F 双击 bug（CM extraKeys 与全局 keydown 双触发 toggleFindPanel）无法在 jsdom 复现——
// jsdom 下 dispatch KeyboardEvent 不会触发 CM extraKeys 的 toggleFindPanel 转焦，故 hasFocus()
// 不会在事件冒泡前变 false，修复前后行为相同。该 bug 的修复（app.js:3489 改用 e.target 判断
// 来源）依赖真机验证：CM 有焦点时按一次 Ctrl+F 面板即打开，不被立即关闭。

test('find: 全部高亮 — 输入 query 后标记所有匹配', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  return new Promise((resolve) => {
    setTimeout(() => {
      const cm = w.editor.cm;
      cm.setValue('hello world\nhello again');
      const findInput = w.document.getElementById('find-input');
      findInput.value = 'hello';
      findInput.dispatchEvent(new w.Event('input')); // 触发 updateCount（防抖后执行 highlightAllMatches）
      setTimeout(() => {
        assert.strictEqual(w.editor.findMarks.length, 2, '应高亮 2 处 hello');
        cleanup(w);
        resolve();
      }, 220); // 等待输入防抖窗口（160ms）执行
    }, 300);
  });
});

test('find: 全部高亮 — 超 2000 上限仅标记前 2000 个', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  return new Promise((resolve) => {
    setTimeout(() => {
      const cm = w.editor.cm;
      cm.setValue('x\n'.repeat(2500)); // 2500 个匹配，超上限
      const findInput = w.document.getElementById('find-input');
      findInput.value = 'x';
      findInput.dispatchEvent(new w.Event('input'));
      setTimeout(() => {
        assert.strictEqual(w.editor.findMarks.length, 2000, '超上限应仅标记前 2000 个');
        cleanup(w);
        resolve();
      }, 260); // 等待防抖 + 上限截断遍历
    }, 500);
  });
});

test('find: clearFindHighlights 清除所有高亮 mark', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  return new Promise((resolve) => {
    setTimeout(() => {
      const cm = w.editor.cm;
      cm.setValue('hello world hello');
      const findInput = w.document.getElementById('find-input');
      findInput.value = 'hello';
      findInput.dispatchEvent(new w.Event('input'));
      setTimeout(() => {
        assert.ok(w.editor.findMarks.length > 0, '应已有高亮 mark');
        w.editor.clearFindHighlights();
        assert.strictEqual(w.editor.findMarks.length, 0, '清除后应无 mark');
        cleanup(w);
        resolve();
      }, 220);
    }, 300);
  });
});

test('crossSearch: searchOpenFiles 遍历 tabs 收集匹配', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  await new Promise(r => setTimeout(r, 300));
  const ed = w.editor;
  ed.tabs = [
    { name: 'a.md', filePath: '/a.md', content: 'hello world\nhello js', _loaded: true },
    { name: 'b.md', filePath: '/b.md', content: 'no match here', _loaded: true },
  ];
  ed.activeTabIndex = 0;
  const results = await ed.searchOpenFiles('hello', false, false);
  assert.strictEqual(results.length, 1, '只有 a.md 有匹配');
  assert.strictEqual(results[0].matches.length, 2, 'a.md 有 2 处 hello');
  assert.strictEqual(results[0].matches[0].line, 1, '第一处行号为 1');
  cleanup(w);
});

test('crossSearch: Ctrl+Shift+F 注册为跨文件搜索', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.strictEqual(typeof w.editor.globalShortcutLookup['Ctrl+Shift+F'], 'function', 'Ctrl+Shift+F 应注册为跨文件搜索');
      cleanup(w);
      resolve();
    }, 300);
  });
});

test('crossSearch: scope radio 切换显示/隐藏目录行', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  return new Promise((resolve) => {
    setTimeout(() => {
      const ed = w.editor;
      ed.openCrossSearchDialog();
      const dirRow = w.document.getElementById('cs-dir-row');
      const openRadio = w.document.querySelector('input[name="cs-scope"][value="open"]');
      const dirRadio = w.document.querySelector('input[name="cs-scope"][value="dir"]');
      assert.ok(dirRow.classList.contains('hidden'), '默认“已打开文件”时目录行隐藏');
      dirRadio.checked = true;
      dirRadio.dispatchEvent(new w.Event('change'));
      assert.ok(!dirRow.classList.contains('hidden'), '选择“目录”时目录行显示');
      openRadio.checked = true;
      openRadio.dispatchEvent(new w.Event('change'));
      assert.ok(dirRow.classList.contains('hidden'), '切回“已打开文件”时目录行再次隐藏');
      cleanup(w);
      resolve();
    }, 300);
  });
});

test('crossSearch: 非模态 — overlay 透明且外部点击不关闭', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  return new Promise((resolve) => {
    setTimeout(() => {
      const ed = w.editor;
      ed.openCrossSearchDialog();
      const overlay = w.document.getElementById('cross-search-dialog');
      assert.ok(overlay.classList.contains('cross-search-overlay'), '应带 cross-search-overlay 类（非模态浮动）');
      assert.ok(!overlay.classList.contains('hidden'), '打开后不应隐藏');
      // 模拟点击 overlay 空白处：本就无外部点击关闭逻辑，应保持打开
      overlay.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      assert.ok(!overlay.classList.contains('hidden'), '外部点击后仍保持打开（可继续操作软件）');
      cleanup(w);
      resolve();
    }, 300);
  });
});

test('crossSearch: 标题栏拖动改变面板位置', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  return new Promise((resolve) => {
    setTimeout(() => {
      const ed = w.editor;
      ed.openCrossSearchDialog();
      const panel = w.document.getElementById('cs-panel');
      const handle = w.document.getElementById('cs-drag-handle');
      const beforeLeft = parseInt(panel.style.left, 10) || 0;
      handle.dispatchEvent(new w.MouseEvent('mousedown', { clientX: 200, clientY: 100, bubbles: true }));
      w.document.dispatchEvent(new w.MouseEvent('mousemove', { clientX: 260, clientY: 140, bubbles: true }));
      w.document.dispatchEvent(new w.MouseEvent('mouseup', { clientX: 260, clientY: 140, bubbles: true }));
      const afterLeft = parseInt(panel.style.left, 10) || 0;
      assert.ok(afterLeft !== beforeLeft, '拖动后面板 left 应改变');
      cleanup(w);
      resolve();
    }, 300);
  });
});

// 废弃：跨文件搜索不再包含「循环查找」勾选框（需求1），循环查找逻辑已迁移到
// 「文件中查找」，由 test/search-enhance.test.cjs 覆盖。
