// 文件保存盲点测试（整理测试库时补充）：
// saveFile 对有路径的活动标签应调用 invoke('write_file', {path, content})；
// 对无路径标签应先调用 plugin:dialog|save 取路径再 write_file。
// 副作用方法（refreshFileMeta / updateTabDisplay / updatePreview / saveSession 等）以桩隔离，
// invoke 通过 buildEnv 的 invokeImpl 注入以捕获命令分发（app.js 在 eval 时捕获 invoke 引用，
// 必须在构建阶段注入而非事后覆盖 window.__TAURI__.core.invoke）。不触发真实 Tauri / 磁盘写入。

const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

test('fileops: saveFile 对已有路径的标签调用 write_file', async () => {
  const calls = [];
  const { w } = await buildEnv({
    captureInitErr: true,
    invokeImpl: async (cmd, args) => { calls.push({ cmd, args }); return undefined; },
  });
  await delay(300);
  const ed = w.editor;

  ed.refreshFileMeta = async () => {};
  ed.updateTabDisplay = () => {};
  ed.updatePreview = async () => {};
  ed.setStatus = () => {};
  ed.saveSession = () => {};

  await ed.addTab('note.md', '初始内容', 'C:/tmp/note.md');
  ed.activeTab.content = '# 最终内容';
  ed.activeTab.savedContent = '旧内容';

  await ed.saveFile();

  const write = calls.find(c => c.cmd === 'write_file');
  assert.ok(write, 'saveFile 应调用 write_file 命令');
  assert.strictEqual(write.args.path, 'C:/tmp/note.md', 'write_file 的 path 应为标签 filePath');
  assert.strictEqual(write.args.content, '# 最终内容', 'write_file 的 content 应为标签当前内容');
  assert.strictEqual(ed.activeTab.savedContent, '# 最终内容', '保存后 savedContent 应更新');
  cleanup(w);
});

test('fileops: saveFile 对未保存标签先走 dialogSave 取路径再 write_file', async () => {
  const calls = [];
  const { w } = await buildEnv({
    captureInitErr: true,
    invokeImpl: async (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === 'plugin:dialog|save') return 'C:/tmp/new.md';
      return undefined;
    },
  });
  await delay(300);
  const ed = w.editor;
  ed.refreshFileMeta = async () => {};
  ed.updateTabDisplay = () => {};
  ed.updatePreview = async () => {};
  ed.setStatus = () => {};
  ed.saveSession = () => {};

  const active = ed.activeTab;
  assert.strictEqual(active.filePath, null, '前置：默认标签无 filePath');

  await ed.saveFile();

  const saveCall = calls.find(c => c.cmd === 'plugin:dialog|save');
  assert.ok(saveCall, '无路径时应调用 plugin:dialog|save（保存对话框）');
  const write = calls.find(c => c.cmd === 'write_file');
  assert.ok(write, '取路径后应调用 write_file');
  assert.strictEqual(write.args.path, 'C:/tmp/new.md', '写入路径应为对话框返回的路径');
  assert.strictEqual(ed.activeTab.filePath, 'C:/tmp/new.md', '保存后标签 filePath 应更新');
  cleanup(w);
});
