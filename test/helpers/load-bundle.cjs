// 构建产物统一加载入口（P0-0e / N14）
//
// 背景：src/lib/unified-bundle.js 是 esbuild 产物，已从版本库移除（.gitignore），
// 由 npm run build:renderer 生成。日常工作流是【单文件直跑】（node --test test/render.test.cjs），
// 既不经过 run-tests.cjs 也不触发 pretest —— 产物缺失时 5 个测试都在【模块顶层】裸
// fs.readFileSync，直接甩一屏 ENOENT 堆栈，没有任何修复指引。
//
// 本模块把这条路径收成一个入口：existsSync 失败 → 抛出带修复命令的错误；
// 顺带校验产物形态（必须含 `var UnifiedRenderer =`），避免产物结构变更后
// w.eval 静默不挂全局、测试却报出「渲染失败」这种误导性症状。
//
// 用法：
//   const { loadUnifiedRenderer } = require('./helpers/load-bundle.cjs');
//   loadUnifiedRenderer(w);            // 挂 window.UnifiedRenderer，返回该对象

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..'); // test/helpers -> repo root
const BUNDLE_PATH = path.join(ROOT, 'src', 'lib', 'unified-bundle.js');
const BUILD_HINT = '请运行：npm run build:renderer';

// jsdom 的 window.eval 不会把顶层 var 挂到 window 上，需显式改写成 window 赋值
const VAR_DECL = 'var UnifiedRenderer =';
const WIN_DECL = 'window.UnifiedRenderer =';

let cached = null;

function assertBundleExists() {
  if (!fs.existsSync(BUNDLE_PATH)) {
    throw new Error(
      `构建产物缺失：${BUNDLE_PATH}\n` +
      `该文件由 esbuild 生成、不在版本库中。${BUILD_HINT}`,
    );
  }
}

// 返回已改写为 window 赋值的产物源码（浏览器/jsdom 可直接 eval）
function readBundleSource() {
  if (cached != null) return cached;
  assertBundleExists();
  const raw = fs.readFileSync(BUNDLE_PATH, 'utf8');
  if (!raw.includes(VAR_DECL)) {
    throw new Error(
      `构建产物形态异常：${BUNDLE_PATH} 未找到 "${VAR_DECL}"。\n` +
      `可能是 esbuild 配置（globalName / format）变更。${BUILD_HINT}`,
    );
  }
  cached = raw.replace(VAR_DECL, WIN_DECL);
  return cached;
}

// 把渲染器挂到给定 jsdom window 上并返回它
function loadUnifiedRenderer(w) {
  w.eval(readBundleSource());
  if (!w.UnifiedRenderer || typeof w.UnifiedRenderer.renderMarkdown !== 'function') {
    throw new Error(`产物已 eval 但未导出 renderMarkdown，产物可能已损坏。${BUILD_HINT}`);
  }
  return w.UnifiedRenderer;
}

module.exports = { BUNDLE_PATH, BUILD_HINT, assertBundleExists, readBundleSource, loadUnifiedRenderer };
