// 错误提示体系 + 编码检测 回归测试
// 前端：jsdom 真实加载 src/app.js（不触发耗时构造函数），调用真实 reportError/showToast/_mapReadFileError
// 编码：Node TextDecoder(GB18030/UTF-8) 等价复现 Rust read_file 分支（encoding_rs 与 ICU 均实现 WHATWG 标准）
// 约定：test/*.test.cjs 由 `npm test`（`node --test test/*.test.cjs`）自动纳入。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const appjs = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

// 在 jsdom 同一脚本作用域内运行，以便访问 app.js 顶层的 MarkdownEditor / ERROR_MESSAGES（class/const 不跨脚本共享）
function harnessFn() {
  if (typeof MarkdownEditor !== 'function') { window.__results = [['MarkdownEditor 类加载', false]]; return; }
  const results = [];
  const container = document.getElementById('toast-container');
  const ed = Object.create(MarkdownEditor.prototype);
  ed.settings = { language: 'zh' };
  ed.setStatus = function () {};
  const clearToast = () => { container.innerHTML = ''; };
  const lastToast = () => { const t = container.querySelectorAll('.toast'); return t[t.length - 1]; };
  const lines = (el) => ({
    title: el.querySelector('.toast-title') && el.querySelector('.toast-title').textContent,
    detail: el.querySelector('.toast-detail') && el.querySelector('.toast-detail').textContent,
    code: el.querySelector('.toast-code') && el.querySelector('.toast-code').textContent,
    type: el.className.replace('toast', '').trim()
  });
  const mapErr = (raw, p) => MarkdownEditor.prototype._mapReadFileError.call(null, raw, p);

  // 1. E_ENCODING 文案 + 参数插值 + 错误码 + 类型
  clearToast(); ed.reportError('E_ENCODING', { params: { encoding: 'GBK' } });
  let t = lines(lastToast());
  results.push(['E_ENCODING 文案+参数+code', t.title === '文件编码不被支持' && t.detail === '该文件使用了 GBK 编码，当前仅支持 UTF-8' && t.code === '错误码 E_ENCODING' && t.type === 'danger']);

  // 2. 文件不存在：Rust {kind:NotFound} -> E_NOT_FOUND，文件名回显
  const e1 = mapErr('{"kind":"NotFound","path":"C:/a/测试.md","message":"no such"}', 'C:/a/测试.md');
  results.push(['_map NotFound->E_NOT_FOUND', e1.code === 'E_NOT_FOUND']);
  clearToast(); ed.reportError(e1.code, { context: { path: e1.path }, error: e1, params: e1.params });
  t = lines(lastToast());
  results.push(['E_NOT_FOUND toast 含文件名', t.title === '文件不存在' && /测试\.md/.test(t.detail) && t.code === '错误码 E_NOT_FOUND']);

  // 3. 锁定 -> E_LOCKED
  const e2 = mapErr('{"kind":"Locked","path":"x.md"}', 'x.md');
  results.push(['_map Locked->E_LOCKED', e2.code === 'E_LOCKED']);
  clearToast(); ed.reportError(e2.code, { context: { path: e2.path }, error: e2, params: e2.params });
  results.push(['E_LOCKED toast', lines(lastToast()).title === '文件正被其他程序占用']);

  // 4-6. 其余 kind 映射 + 普通串回退
  results.push(['_map Permission->E_PERMISSION', mapErr('{"kind":"PermissionDenied","path":"x"}', 'x').code === 'E_PERMISSION']);
  results.push(['_map PathTooLong->E_PATH_TOO_LONG', mapErr('{"kind":"PathTooLong","path":"x"}', 'x').code === 'E_PATH_TOO_LONG']);
  results.push(['_map 普通串回退 E_IO', mapErr('plain io error string', 'x.md').code === 'E_IO']);

  // 7-8. 迁移的硬编码中文
  clearToast(); ed.reportError('devtools');
  t = lines(lastToast());
  results.push(['devtools 迁移', t.title === '无法打开开发者工具' && t.code === '错误码 devtools']);
  clearToast(); ed.reportError('openLink', { params: { href: 'C:/temp/笔记.md' }, error: new Error('x') });
  t = lines(lastToast());
  results.push(['openLink 迁移+参数', t.title === '无法打开文件' && t.detail === 'C:/temp/笔记.md']);

  // 9. 英文文案切换
  ed.settings.language = 'en';
  clearToast(); ed.reportError('E_ENCODING', { params: { encoding: 'GBK' } });
  t = lines(lastToast());
  results.push(['EN 文案', t.title === 'Unsupported file encoding' && t.detail === 'This file uses GBK encoding, only UTF-8 is supported']);
  ed.settings.language = 'zh';

  // 10-11. warning/info 类型 + 无 code 不渲染
  clearToast(); ed.showToast({ title: 'T', detail: 'D', code: 'E_X' }, 'warning');
  results.push(['warning 类型渲染', lines(lastToast()).type === 'warning' && lines(lastToast()).code === '错误码 E_X']);
  clearToast(); ed.showToast({ title: 'T2', detail: 'D2' }, 'info');
  results.push(['info 类型无 code', lines(lastToast()).type === 'info' && !lines(lastToast()).code]);

  // 12. 旧式字符串 toast 向后兼容
  clearToast(); ed.showToast('纯文本成功提示', 'success');
  results.push(['旧式字符串 toast 兼容', lastToast().textContent === '纯文本成功提示']);

  // 13. toast:false 走 setStatus
  let statusText = null; ed.setStatus = (s) => { statusText = s; };
  clearToast(); ed.reportError('E_INIT', { toast: false });
  results.push(['toast:false 走 setStatus', statusText && statusText.includes('编辑器初始化失败') && container.querySelectorAll('.toast').length === 0]);

  window.__results = results;
}
const harness = '(' + harnessFn.toString() + ')();';

// ====== 编码检测等价验证（复现 Rust read_file 分支顺序）======
function decodeFile(bytes) {
  let stripped = bytes;
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) stripped = bytes.slice(3);
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(stripped), via: 'utf8' };
  } catch (_) {
    return { text: new TextDecoder('gb18030').decode(stripped), via: 'gb18030' };
  }
}
function encodingCases() {
  const out = [];
  const gbk = Buffer.from([0xD6, 0xD0, 0xCE, 0xC4, 0xB2, 0xE2, 0xCA, 0xD4]);
  const r1 = decodeFile(gbk);
  out.push(['GBK 文件可解码(不再空白)', r1.via === 'gb18030' && r1.text === '中文测试']);
  const utf8bom = Buffer.from([0xEF, 0xBB, 0xBF, 0xE4, 0xB8, 0xAD, 0xE6, 0x96, 0x87]);
  const r2 = decodeFile(utf8bom);
  out.push(['UTF-8 BOM 被剥离', r2.via === 'utf8' && r2.text === '中文']);
  const r3 = decodeFile(Buffer.from('hello', 'utf8'));
  out.push(['UTF-8 无 BOM', r3.via === 'utf8' && r3.text === 'hello']);
  let threw = false;
  try { decodeFile(Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xAB])); } catch (e) { threw = true; }
  out.push(['二进制兜底不崩溃', !threw]);
  return out;
}

// 模块顶层同步加载 app.js（jsdom 注入脚本会同步执行），随后为每个用例注册同级 test
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="toast-container"></div></body></html>',
  { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
window.console.error = () => {}; // 屏蔽 reportError 的诊断输出，保持测试静默（真实运行时仍输出到 console）
window.__TAURI__ = { core: { invoke: () => Promise.resolve('') }, path: {}, app: {}, event: {}, shell: {} };

const combined = appjs + '\n;\n' + harness;
const s = window.document.createElement('script');
s.textContent = combined;
window.document.body.appendChild(s);

const results = (window.__results || []).concat(encodingCases());
for (const [label, ok] of results) {
  test(label, () => { assert.ok(ok, label); });
}
