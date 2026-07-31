// 查找/替换的正则安全检查：从 app.js 的 initFindReplace 抽出 isSafeRegex（纯函数）。
// 设计：防止用户输入恶意正则触发灾难性回溯（ReDoS）卡死主线程；不依赖 DOM/this，
// 可单独单测。其余查找/替换逻辑（CodeMirror searchCursor、DOM 事件绑定）仍留在 app.js，
// 因其深度耦合编辑器实例与 UI 控制器，抽离收益低且回归风险高。
//   - isSafeRegex(query): boolean

function isSafeRegex(q) {
  if (typeof q !== 'string' || q.length > 500) return false;
  // 拦截常见灾难性回溯（ReDoS）模式：嵌套量词、相邻量词、重复组等
  if (/[+*?}]\)[\s]*[+*{]|[+*}]\s*[+*{]/.test(q)) return false;
  if (/(\([^()]*[+*?][^()]*\))\1/.test(q)) return false; // 重复捕获组 (a)(a)
  if (/[+*?]\s*\((?!\?)/.test(q)) return false;           // 量词后紧跟捕获组 a*(...)
  if (/\(\?[=!:].*\)\s*[+*?]/.test(q)) return false;       // 先行/后行断言后接量词
  if (/(.\s*.\s*.\s*.\s*.\s*.\s*.\s*.\s*.\s*.\s*)\*/.test(q)) return false; // 超长字符序列后量词
  return true;
}

const FindReplace = { isSafeRegex };

// 浏览器：作为独立 <script> 加载，挂到全局 FindReplace
if (typeof window !== 'undefined' && typeof module === 'undefined') {
  window.FindReplace = FindReplace;
}
// Node（测试 / 构建）：CommonJS 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FindReplace;
}
