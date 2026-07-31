// 单文件搜索性能回归测试：
//   - 输入法（IME）合成守卫：中文拼音合成期间(input 事件频繁)不触发实时搜索/高亮，
//     避免主线程被反复全量高亮占满导致“拼音输入不进去 / 边输边搜卡死”。合成结束立即搜一次。
//   - 输入防抖：连续 input 合并为一次搜索（160ms 内仅执行一次），减少无谓的全量高亮。
//
// 复用 jsdom + 真实 CodeMirror 实例的 harness。

const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

// 安装对“实时搜索重活”的计数器 spy：编辑器全量高亮 + 预览 DOM 高亮
function spySearch(ed) {
  const counts = { editor: 0, preview: 0 };
  ed.highlightAllMatches = () => { counts.editor++; };
  ed.highlightPreviewMatches = () => { counts.preview++; };
  return counts;
}

// ---------- 1. 编辑内查找的 IME 合成守卫 ----------
test('find: 拼音合成期间不触发搜索，合成结束立即搜一次', async () => {
  const { w } = await buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.cm.setValue('hello hello hello');
  ed.preview.innerHTML = '<p>hello hello hello</p>';
  const counts = spySearch(ed);
  const fi = w.document.getElementById('find-input');
  fi.value = 'he';
  // 合成开始 + 连续拼音字母（每次 input 都应被守卫跳过）
  fi.dispatchEvent(new w.Event('compositionstart'));
  for (const v of ['h', 'he', 'hel', 'hell']) {
    fi.value = v;
    fi.dispatchEvent(new w.Event('input'));
  }
  assert.strictEqual(counts.editor, 0, '合成期间编辑器高亮不应被调用');
  assert.strictEqual(counts.preview, 0, '合成期间预览高亮不应被调用');
  // 合成结束：应立即搜索一次（即时反馈，无需等待防抖）
  fi.dispatchEvent(new w.Event('compositionend'));
  assert.strictEqual(counts.editor, 1, '合成结束应立刻搜索一次（编辑器）');
  assert.strictEqual(counts.preview, 1, '合成结束应立刻搜索一次（预览）');
  cleanup(w);
});

// ---------- 2. 预览内查找的 IME 合成守卫 ----------
test('previewFind: 拼音合成期间不触发搜索，合成结束立即搜一次', async () => {
  const { w } = await buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.viewMode = 'preview';
  ed.preview.innerHTML = '<p>hello hello hello</p>';
  const counts = spySearch(ed);
  const pfi = w.document.getElementById('preview-find-input');
  pfi.value = 'he';
  pfi.dispatchEvent(new w.Event('compositionstart'));
  for (const v of ['h', 'he', 'hel']) {
    pfi.value = v;
    pfi.dispatchEvent(new w.Event('input'));
  }
  assert.strictEqual(counts.preview, 0, '预览合成期间预览高亮不应被调用');
  pfi.dispatchEvent(new w.Event('compositionend'));
  assert.strictEqual(counts.preview, 1, '预览合成结束应立刻搜索一次');
  cleanup(w);
});

// ---------- 3. 编辑内查找输入防抖：连续 input 合并为一次 ----------
test('find: 连续 input 在防抖窗口内只搜索一次', async () => {
  const { w } = await buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.cm.setValue('hello hello hello');
  ed.preview.innerHTML = '<p>hello hello hello</p>';
  const counts = spySearch(ed);
  const fi = w.document.getElementById('find-input');
  fi.value = 'h';
  fi.dispatchEvent(new w.Event('input'));
  fi.value = 'he';
  fi.dispatchEvent(new w.Event('input'));
  // 防抖未到期，不应执行
  assert.strictEqual(counts.editor, 0, '防抖窗口内不应立即搜索');
  await delay(220); // 超过 160ms 防抖
  assert.strictEqual(counts.editor, 1, '防抖后只应搜索一次（合并连续输入）');
  cleanup(w);
});

// ---------- 4. 预览内查找输入防抖：连续 input 合并为一次 ----------
test('previewFind: 连续 input 在防抖窗口内只搜索一次', async () => {
  const { w } = await buildEnv();
  await delay(300);
  const ed = w.editor;
  ed.viewMode = 'preview';
  ed.preview.innerHTML = '<p>hello hello hello</p>';
  const counts = spySearch(ed);
  const pfi = w.document.getElementById('preview-find-input');
  pfi.value = 'h';
  pfi.dispatchEvent(new w.Event('input'));
  pfi.value = 'he';
  pfi.dispatchEvent(new w.Event('input'));
  assert.strictEqual(counts.preview, 0, '防抖窗口内不应立即搜索');
  await delay(220);
  assert.strictEqual(counts.preview, 1, '防抖后只应搜索一次');
  cleanup(w);
});
