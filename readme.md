# bilibili 收藏夹下载器

一个本地 CLI 工具：用自己的 B 站登录态扫描收藏夹（或指定 UP 主的投稿），把视频连同弹幕、封面、metadata 离线化，并提供可播放的本地媒体库索引页与控制端网页。

> 仅供个人对已收藏内容做离线备份与学习研究，下载内容不得公开分发或用于商业用途。不破解会员权益、不绕过付费内容。

## 特性

- **登录态**：扫码 / 手动粘贴 / 导入 Cookie，凭据本地保存（`.local/cookies.json`，权限 0600）
- **收藏夹扫描**：按收藏夹名称建目录，导出 `outputs/index.json` 全量 metadata
- **UP 主模式**：给 mid / 主页 URL / 昵称，按发布时间从新到旧下载全部投稿
- **最高可用画质**：自动选账号可播的最高档（大会员即 8K / 4K / HDR / 杜比视界 / 60fps），无权益自动降级
- **多线程流水线**：下载队列与转码队列并行度各 3，边下边转
- **双引擎**：主引擎自研（分片级续传），副引擎 yt-dlp，任务失败自动切换
- **分段流归一化**：DASH(m4s) / 多段 durl 统一合成单个 mp4（默认 `-c copy` 不重编码）
- **弹幕**：`.ass` + `.srt` 各一份，与视频同名同目录
- **封面 + metadata**：同名 `.jpg` 与 `.meta.json`，并写入容器内 tags
- **多 P**：全部下载，用 `[P1] [P2]…` 后缀区分
- **超时与停滞**：连接 / 首字节 / 读空闲 / 速率停滞 / 任务总时长 / 转码停滞多级超时，停滞三级响应（重连 → 重建会话 → 切引擎）
- **队列可中断可恢复**：任务粒度断点续传；首次重试排队首，第 2 次起排队尾并退避
- **控制端网页**：实时看板（进度 / 速度 / 队列占用 / 停滞提示 / 日志）+ 任务级控制 + 配置热更新

## 实现进度

按 `PLAN.md` 的 S0–S11 推进，每完成一节即提交并推送：

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| S0 | 工程骨架与基础设施 | ✅ |
| S1 | 登录与 API 客户端（WBI / buvid3） | ✅（`refresh_token` 自动续期待补） |
| S2 | 收藏夹扫描与 metadata 导出 | ✅ |
| S3 | 选流、引擎抽象、多线程分片下载 | ✅ |
| S4 | 转码/拼接队列与流水线 | ✅ |
| S5 | 弹幕下载与 ass/srt 生成 | ✅ |
| S6 | 封面与同名 `.meta.json` | ✅ |
| S7 | 队列、任务库、超时、断点续传、双引擎切换 | ✅ |
| S8 | UP 主模式 | ✅ |
| S9 | 控制端网页 | ✅ |
| S10 | 媒体库索引页与播放器 | 🚧（`library/scanLibrary.ts`、`web/libraryPage.ts` 已写，`build-index` / `serve` 命令待接线） |
| S11 | 打磨与文档定稿 | ⬜ |

详细设计见 [PLAN.md](./PLAN.md)。

## 快速开始

```bash
npm install
```

开发期用 `npm run bili -- <命令>` 直接跑 TS 源码；也可 `npm run build` 编译到 `dist/` 后用 `npx bili`。

### 登录（只需一次）

```bash
npm run bili -- login --qr                        # 扫码登录（默认）
npm run bili -- login --manual                    # 手动粘贴 Cookie
npm run bili -- login --import ./cookies.txt      # 导入 Netscape / Cookie-Editor 导出
npm run bili -- whoami                            # 查看当前登录用户与会员状态
npm run bili -- doctor                            # 环境自检（Node / ffmpeg / 登录态 / 磁盘 / 连通性）
```

### 扫描与下载

```bash
npm run bili -- scan                              # 扫描收藏夹，建目录并导出 index.json
npm run bili -- scan --fav 123,456                # 只扫指定收藏夹
npm run bili -- download                          # 按收藏时间倒序下载
npm run bili -- download --limit 5 --dry-run      # 只列出将要下载的任务
npm run bili -- download --folder 科普            # 只下某个收藏夹
npm run bili -- download --order pubDate          # 按发布时间排序
npm run bili -- download --pages collected        # all | collected | first
npm run bili -- download --force                  # 忽略已存在产物

npm run bili -- up 123456                         # UP 主模式：mid / 主页 URL / 昵称
npm run bili -- up "UP名" --since 2024-01-01 --keyword 关键词 --limit 10
```

### 控制端网页

```bash
npm run bili -- web                               # 启动控制端（默认 127.0.0.1:8765，自动开浏览器）
npm run bili -- web --port 8899 --no-open         # 换端口、不自动打开
npm run bili -- web --no-download                 # 只看板，不启动下载
```

页面提供：总览条（各状态计数 / 总进度 / 实时速度 / ETA / 下载 x/3 + 转码 y/3 / 磁盘剩余）、任务表（画质徽标 / 阶段 / 分片进度 / 引擎 / 停滞提示）、任务级控制（暂停 / 继续 / 取消 / 重试 / 插队 / 换引擎）、全局控制、配置热更新、日志 tail。

### 查询与补偿

```bash
npm run bili -- status                            # 队列与任务状态概览
npm run bili -- repair --failed                   # 重跑失败任务
npm run bili -- repair --need-mux                 # 只重跑待封装任务
npm run bili -- repair --engine ytdlp             # 强制用副引擎
```

### 待实现（S10）

```bash
bili build-index                                  # 生成 outputs/index.html + library.js 媒体库
bili serve --port 8765                            # 静态服务（支持 Range，可拖动进度条）
```

## 产物目录

```
outputs/
├─ index.json                   # 全部收藏视频 metadata 汇总（唯一权威清单）
├─ favorites.json               # 收藏夹结构
├─ <收藏夹名>/
│  ├─ <标题> [P1] [BV号].mp4
│  ├─ <标题> [P1] [BV号].ass    # 弹幕（带样式）
│  ├─ <标题> [P1] [BV号].srt    # 弹幕（兼容简单播放器）
│  ├─ <标题> [P1] [BV号].jpg    # 封面
│  └─ <标题> [P1] [BV号].meta.json
├─ up/<UP名>(<mid>)/            # UP 主模式产物
├─ .state/                      # tasks.json / queue.json（断点续传依据）
└─ .cache/                      # 下载中间分片（未自动清理，见「已知限制」）
```

## 配置

可选 `config.json`（放在仓库根目录），未配置的项全部走 `src/config.ts` 里的默认值。常用项：

| 分组 | 键 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `auth` | `cookieFile` | `.local/cookies.json` | 登录态路径，也可用 `--cookie-file` 覆盖 |
| `output` | `root` / `filenameTemplate` / `partSuffix` | `outputs` / `{title} [P{p}] [{bvid}]` / `auto` | 目录与命名 |
| `output` | `sidecarMeta` / `nfo` | `true` / `false` | 同名 `.meta.json`、可选 `.nfo` |
| `download` | `maxParallelTasks` / `maxStreamsPerTask` | `3` / `3` | 下载任务并发、单流 Range 分片数 |
| `download` | `quality` / `preferHdr` / `preferHighFps` / `codec` | `best` / `true` / `true` / `auto` | 选流策略 |
| `download` | `pages` / `folderPick` | `all` / `non-default-first` | 分 P 范围、多收藏夹归属 |
| `download` | `maxSpeed` / `minFreeDiskGB` | `null` / `5` | 限速、磁盘下限保护 |
| `mux` | `container` / `maxParallel` / `faststart` | `mp4` / `3` / `true` | 封装容器与转码并发 |
| `danmaku` | `enabled` / `formats` | `true` / `["ass","srt"]` | 弹幕输出格式 |
| `timeout` | `idleMs` / `stallMs` / `taskMs` | `20000` / `60000` / `1800000` | 读空闲、速率停滞、任务总时长 |
| `engines` | `mode` / `ytdlp.autoDownload` | `auto` / `true` | 引擎模式、副引擎二进制自动获取 |
| `control` | `host` / `port` | `127.0.0.1` / `8765` | 控制端监听 |

## 已确认的产品决策

| 项 | 结论 |
| --- | --- |
| 清晰度 | `best`，取账号可播最高档，不做体积上限 |
| 容器 | `mp4`（`mov` 可选） |
| 多收藏夹归属 | 优先保存到**非默认收藏夹**（取收藏时间最新的那个） |
| 弹幕 | `.ass` + `.srt` 各一份 |
| 多分 P | 全部下载，文件名加 `[P1] [P2]…` 后缀，不建子目录 |
| 副引擎 | yt-dlp 允许自动下载二进制（PATH → brew → 自动下载） |
| 并发 | 下载 / 转码各 3 |
| 重试排队 | 首次排队首，第 2 次起排队尾并退避 |

## 已知限制

- **中间分片不自动清理**：任务封装成功后 `outputs/.cache/media/<taskId>/` 里的分片仍会保留，长期下载会明显占盘。当前需手动删除（只删 `stage === 'done'` 对应目录即可，不影响已完成产物）；补上自动清理在后续打磨阶段。
- **登录态不自动续期**：`refresh_token` 续期尚未实现，cookie 过期后需重新 `bili login`。
- **控制端默认端口 8765**：若被其他程序（如编辑器）占用，用 `bili web --port <其他端口>`。
- HLS / 加密 m3u8 源目前未做专项样本验证；主引擎优先处理 DASH 与多段 durl。

## 环境要求

- Node ≥ 20
- ffmpeg（缺失时自动下载 `ffmpeg-static`；也可 `brew install ffmpeg`）

## 开发

```bash
npm run lint      # tsc --noEmit
npm test          # vitest run
npm run build     # 编译到 dist/
```

## 安全与合规

- 凭据、产物、二进制均不入库：`.gitignore` 已忽略 `outputs/ state/ .local/ bin/`
- 日志中的 cookie 一律脱敏
- 不破解会员权益、不绕过付费内容；下载内容仅限个人离线使用
