// 字数 / 字符 / 行数统计：从 app.js 的 updateWordCount 抽取纯计算部分。
// 设计：纯函数不依赖 DOM 或 this，便于单独测试、降低改动爆炸半径。
//   - countStats(content): 返回 { words, chars, lines }
//       * words: 去除 markdown 标记符号并按空白分词后的词数
//       * chars: 原始字符数（含换行）
//       * lines: 按 \n 切分的行数（空内容记为 0）

function countStats(content) {
  const text = (content || '')
    .replace(/[#*`~\[\]()>_|\\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = text ? text.split(/\s+/).length : 0;
  const chars = (content || '').length;
  const lines = content ? content.split('\n').length : 0;
  return { words, chars, lines };
}

// 浏览器：作为独立 <script> 加载，挂到全局 WordCount
if (typeof window !== 'undefined' && typeof module === 'undefined') {
  window.WordCount = { countStats };
}
// Node（测试 / 构建）：CommonJS 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { countStats };
}
