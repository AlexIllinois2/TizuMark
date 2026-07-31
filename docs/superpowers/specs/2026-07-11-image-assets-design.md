# 图片资源管理改进设计

## 目标
1. 插入图片时自动获取原始宽高，用户可在编辑区修改
2. 同一内容图片去重（MD5 哈希）
3. 支持自定义 assets 路径（相对/绝对）

## 插入流程

粘贴或对话框插入图片：

1. 获取图片字节数据
2. Rust 命令 `save_image_to_assets(bytes, ext, assets_dir)`：
   - 计算 MD5 → 文件名 `{md5hash}.{ext}`
   - 若目标文件已存在则跳过写入（去重）
   - 读取图片头部获取原始宽高
   - 返回 `{ filename, width, height }`
3. 插入到编辑器：`<img src="assets/a1b2c3.png" width="1920" height="1080" alt="...">`
4. 预览区已有 `max-width: 100%` CSS 防止溢出
5. 用户可在编辑区直接修改 `width`/`height`（数字或百分比）

## 去重策略

MD5 哈希值作为文件名 → 相同内容的图片始终映射到同一文件 → 同一文件内引用多次、跨文件引用、跨目录均只存一份。

## Assets 路径设置

设置对话框新增：

- 模式选择：相对路径 / 绝对路径（radio）
- 路径输入框，默认 `assets`
- 提示文字随模式切换

路径解析：

| 模式 | 存储路径 | Markdown 引用 |
|------|---------|---------------|
| 相对 | `{fileDir}/{assetPath}/` | `{assetPath}/hash.png` |
| 绝对 | `{assetPath}/` | `{assetPath}/hash.png` |

## 改动范围

| 文件 | 改动 |
|------|------|
| `src-tauri/Cargo.toml` | 新增 `md-5` + `imagesize` 依赖 |
| `src-tauri/src/lib.rs` | 新增 `save_image_to_assets` 命令 |
| `src/app.js` | 粘贴/对话框统一调用新命令；设置新增字段 |
| `src/index.html` | 设置 UI |
| `src/styles.css` | 设置项样式 |
