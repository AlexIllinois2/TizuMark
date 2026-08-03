下面给你一个**可以直接落地执行的修改计划**，基于你当前仓库的结构和 Tauri 官方推荐的方式。
---
## 0. 现状速览
- 你的仓库是 **Tauri v2 项目**（`tauri.conf.json` 里 `"bundle": { "active": true, "targets": "all" }`，说明已经启用打包，且目标默认为 “all”）。
- 当前 CI：`.github/workflows/ci.yml` 只做前端检查、测试、Rust 测试，**不包含打包和发布步骤**；触发分支是 `master/main`，没有 `dev2`。
- Tauri 官方推荐用 **`tauri-apps/tauri-action`** 来在 GitHub Actions 里构建并发布产物，会自动调用 `tauri build` 并把产物上传到 GitHub Release。
你的需求：  
> 推送到 `dev2` 分支时，自动构建 Linux x64 的 **deb / rpm / AppImage** 三种包。
---
## 1. 整体思路（推荐方案）
**核心思路：**
1. 新增一个独立的 **“构建 & 发布 Linux 包” 工作流**，只在推送到 `dev2` 时触发。
2. 使用 `tauri-apps/tauri-action@v1` 来执行 `tauri build`，它会：
   - 在 Linux 上默认生成：
     - `.deb`
     - `.rpm`
     - `.AppImage`  
     具体取决于你 `tauri.conf.json` 的 `bundle.targets`（现在是 `"all"`，就都会生成）。
3. 限定为 **x64**：选择 `ubuntu-22.04`（x64 runner），不使用 ARM runner 即可。
4. 产物上传方式：
   - 可以简单利用 `tauri-action` 自带的 **自动创建 GitHub Release 并上传** 功能；
   - 或者如果你暂时不想发布正式 Release，也可以改成只上传构建产物（Artifacts）。
---
## 2. 具体修改步骤
### 2.1 在 `.github/workflows/` 下新建一个工作流文件
建议新建：
- `.github/workflows/linux-build.yml`
文件内容示例（下面是“最小可用 + 可解释”的版本）：
```yaml
name: linux-build-dev2
on:
  push:
    branches: [dev2]   # 只在推送到 dev2 分支时触发
jobs:
  build-linux-x64:
    runs-on: ubuntu-22.04  # x64 runner
    permissions:
      contents: write      # 允许创建 Release / 上传产物
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      - name: Install system dependencies (Tauri v2 Linux)
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            build-essential \
            curl \
            wget \
            file \
            libssl-dev \
            libayatana-appindicator3-dev \
            librsvg2-dev
      - name: Setup Node.js (LTS)
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - name: Install frontend dependencies
        run: npm ci
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: x86_64-unknown-linux-gnu
      - name: Cache Rust cargo artifacts
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            src-tauri/target
          key: ${{ runner.os }}-cargo-${{ hashFiles('src-tauri/Cargo.lock') }}
          restore-keys: |
            ${{ runner.os }}-cargo-
      - name: Build frontend (preBuild)
        run: npm run build:renderer   # 如果你项目有这个 script，保持和现有 CI 一致；如果没有可删除此步
      - name: Build Tauri app (Linux x64)
        uses: tauri-apps/tauri-action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          # 如果你的 tauri 项目在根目录，可以不用 projectPath；
          # 若以后改到 src-tauri，可加 projectPath: src-tauri
          tagName: dev2-build        # Release tag 名称（示例）
          releaseName: 'Dev2 Linux Build'
          releaseBody: 'Automated build from dev2 branch'
          releaseDraft: true         # 建议先为草稿，避免误发布正式版本
          prerelease: true
          args: ''                   # 默认即可，Linux x64 不需要额外 target 参数
      - 可选：如你只想上传 Artifacts 而不创建 Release，可以改为：
      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: linux-x64-bundles
          path: |
            src-tauri/target/release/bundle/deb/*.deb
            src-tauri/target/release/bundle/rpm/*.rpm
            src-tauri/target/release/bundle/appimage/*.AppImage
```
> 说明：  
> - `tauri-action` 会自动执行 `tauri build`，并根据你 `tauri.conf.json` 里的 `bundle.targets = "all"` 生成 `.deb / .rpm / .AppImage`。  
> - 使用 `ubuntu-22.04` runner + 不指定 ARM target，就已经是 **x64 构建**。  
> - 我加了 `releaseDraft: true`，避免误发布正式 Release；你可以根据需要改成 `false`。  
---
### 2.2 确认 `tauri.conf.json` 的打包配置
你已经配置了：
```json
"bundle": {
  "active": true,
  "targets": "all",
  ...
}
```
这意味着在 Linux 上执行 `tauri build` 时，**默认会生成 deb、rpm 和 AppImage**（以及其他可能的格式）。
如果你想**只保留 deb / rpm / AppImage**，也可以把 `targets` 改成：
```json
"bundle": {
  "active": true,
  "targets": ["deb", "rpm", "appimage"],
  ...
}
```
这步是可选的，不影响 CI 能跑起来。
---
### 2.3 前端构建命令要和现有 CI 对齐
看你现有的 `ci.yml`，前端构建步骤有：
- `npm run check`
- `npm test`（`pretest` 钩子里会执行 `build:renderer`）
- `npm run build-frontend`（前端聚合冒烟）
所以建议：
1. 在 `linux-build-dev2.yml` 中，至少保留：
   ```yaml
   - name: Install dependencies
     run: npm ci
   - name: Run frontend build
     run: npm run build-frontend
   ```
   如果你希望跑测试，也可以加：
   ```yaml
   - name: Run tests
     run: npm test
   ```
2. 如果你在 `tauri.conf.json` 里配置了 `beforeBuildCommand`，那 `tauri build` 前会自动跑前端构建；否则就要在 workflow 里手动跑。
---
### 2.4 触发分支：只保留 `dev2`
上面的工作流已经把 `on.push.branches` 设为 `[dev2]`，满足“推送到 dev2 自动构建”的需求。
如果你将来还想在主分支打正式发布包，可以再新建一个 `release.yml`，触发条件为 `release` 分支或 tag。
---
### 2.5 关于 AppImage 的坑（提前给你避坑）
- Tauri v2 的 AppImage 在 GitHub Actions 上偶尔会构建失败，这在官方讨论和问题里也有人反馈。  
- 建议先：
  - 用 `tauri-action` 的默认流程跑一遍；
  - 如果 AppImage 步骤失败，可以：
    - 先在本地 `npm run tauri build` 确认是否能生成 AppImage；
    - 或者暂时在 `tauri.conf.json` 里把 `"targets"` 去掉 `appimage`，先只构建 deb 和 rpm。
---
## 3. 推荐的执行顺序（你可以按这个顺序改）
1. 在本地切换到 `dev2` 分支。
2. 在 `.github/workflows/` 下新建 `linux-build-dev2.yml`，内容先按第 2.1 节的示例来（先使用 `releaseDraft: true`）。
3. 提交 & 推送到 `dev2`：
   - GitHub Actions 页面里应该会出现 `linux-build-dev2` 工作流运行。
4. 确认构建产物：
   - 进入 Action 对应的运行 → 在 “Artifacts” 或 “Releases” 里查看是否出现 `.deb / .rpm / .AppImage`。
5. 确认没问题后，再把 `releaseDraft` 改成 `false`，或按需要调整触发条件。
---
## 4. 如果你只想“构建但暂时不发 Release”
把 `tauri-action` 那一步改成只执行构建，并用 `upload-artifact` 上传即可（示例已在 2.1 中给出）。这样你可以先验证产物是否正确，再决定是否开启自动 Release。
---
如果你愿意，我可以在下一步直接帮你把 **完整的 `linux-build-dev2.yml` 写成一个可直接复制粘贴的版本**，并根据你当前的 `package.json` scripts 做对齐。
