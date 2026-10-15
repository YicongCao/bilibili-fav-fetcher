# bilibili 收藏夹下载器

一个本地 CLI 工具：用自己的 B 站登录态扫描收藏夹（或指定 UP 主的投稿），把视频连同弹幕、封面、metadata 离线化，并提供可播放的本地媒体库索引页与控制端网页。

> 仅供个人对已收藏内容做离线备份与学习研究，下载内容不得公开分发或用于商业用途。不破解会员权益、不绕过付费内容。

## 特性

- **登录态**：扫码 / 手动粘贴 / 导入 Cookie，凭据本地保存（`.local/cookies.json`，权限 0600）
- **自定义输出目录**：`--out /Volumes/xxx/outputs`（或 `BILI_OUT` 环境变量、`config.json` 里的 `output.root`），可直接指向外置硬盘
- **占用上限**：`limits.maxOutputGB`（默认 500GB）限制 outputs 目录总占用，超限自动暂停下载队列
- **收藏夹扫描**：按收藏夹名称建目录，导出 `outputs/index.json` 全量 metadata
- **UP 主模式**：给 mid / 主页 URL / 昵称，按发布时间从新到旧下载全部投稿
- **最高可用画质**：自动选账号可播的最高档（大会员即 8K / 4K / HDR / 杜比视界 / 60fps），无权益自动降级
- **多线程流水线**：下载队列与转码队列并行度各 3，边下边转
- **分片缓存自动回收**：任务封装成功即删它的中间分片，另有 `bili cache` 手动清残留
- **双引擎**：主引擎自研（分片级续传），副引擎 yt-dlp，任务失败自动切换
- **分段流归一化**：DASH(m4s) / 多段 durl 统一合成单个 mp4（默认 `-c copy` 不重编码）
- **弹幕**：`.ass` + `.srt` 各一份，与视频同名同目录
- **封面 + metadata**：同名 `.jpg` 与 `.meta.json`，并写入容器内 tags
- **多 P**：全部下载，用 `[P1] [P2]…` 后缀区分
- **超时与停滞**：连接 / 首字节 / 读空闲 / 速率停滞 / 任务总时长 / 转码停滞多级超时，停滞三级响应（重连 → 重建会话 → 切引擎）
- **队列可中断可恢复**：任务粒度断点续传；首次重试排队首，第 2 次起排队尾并退避
- **控制端网页**：dashboard（任务数 / 已下载视频与占用 / 总速度 / 磁盘 / 登录态·会员状态 + 一键暂停继续下载与转码 + 清理缓存）+「添加下载」（按收藏夹 / 按 UP 主入队，可刷新收藏夹）+ 实时任务表与任务级控制 + 配置热更新

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
| S10 | 媒体库索引页与播放器 | ✅ |
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

### 指定 outputs 目录

默认 `./outputs`。三种方式，优先级 `--out` > 环境变量 `BILI_OUT` > `config.json` 的 `output.root`：

```bash
npm run bili -- scan --out "/Volumes/Lenovo 1TB/outputs"
export BILI_OUT="/Volumes/Lenovo 1TB/outputs"     # 之后所有命令都走这里
```

`--out` 是所有子命令的通用选项（`scan` / `download` / `up` / `web` / `status` / `repair` / `doctor`），路径带空格时加引号即可。

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

界面按 iOS 设计语言统一（深色 + 毛玻璃顶栏、20px 圆角玻璃卡片、iOS 语义色、分段控件、胶囊三级按钮、数字等宽对齐），在 1440 / 1180 / 900 三档宽度下均无横向溢出。

页面提供：

- **dashboard**：任务总数 / 进行中（下载·转码）/ 已完成 / 已下载视频数与占用空间（含上限进度条）/ 总下载速度 MB/s / 磁盘剩余 / 登录态与会员状态；两个按钮分别**暂停 / 继续全局下载**与**暂停 / 继续全局转码**（转码暂停时已下载分片保留，恢复后继续封装）
- **添加下载**：两个 tab ——「收藏夹」（选收藏夹 + 数量上限 + 排序 → 加入队列，旁边可一键刷新收藏夹）与「UP 主」（填 mid / 主页链接 / 昵称 + 数量上限 + 关键词 → 抓取投稿并加入队列）。队列取空后控制端仍会继续轮询，随时加任务都会接着跑
- **任务表**（画质徽标 / 阶段 / 分片进度 / 引擎 / 停滞提示）+ 任务级控制（暂停 / 继续 / 取消 / 重试 / 插队）、配置热更新、日志 tail

### 查询与补偿

```bash
npm run bili -- cache --dry-run                   # 查看分片缓存占多少、将释放多少
npm run bili -- cache                             # 只清已完成/已跳过任务的残留分片（保留续传分片）
npm run bili -- cache --all                       # 清空全部分片（未完成任务将重新完整下载）

npm run bili -- status                            # 队列与任务状态概览（含 outputs 占用/上限）
npm run bili -- reconcile [--dry-run]             # 任务库对账：成品已在盘上却还在队列里的补记为已完成
npm run bili -- repair --failed                   # 重跑失败任务
npm run bili -- repair --need-mux                 # 只重跑待封装任务
npm run bili -- repair --engine ytdlp             # 强制用副引擎
```

### 媒体库索引页与播放

```bash
npm run bili -- build-index                       # 生成 outputs/index.html + library.js（离线可用）
npm run bili -- serve --port 8765                 # 静态服务（支持 Range，可拖动进度条）
```

`build-index` 读取 `index.json`（优先每个视频的同名 `.meta.json`）生成 `library.js` / `library.json` 与单文件 `index.html`；控制端运行时会**自动重建**（启动时一次 + 每完成一个任务防抖重建），也可 `POST /api/library/rebuild` 手动触发。

页面同样是 iOS 风格：毛玻璃 sticky 顶栏（搜索 / 收藏夹 / UP / 排序）、16:9 封面大圆角卡片（悬浮微放大、画质与 HDR 角标、时长胶囊）、点击弹出**底部抽屉播放器**（`<track>` 加载 ass/srt、分 P 切换、原页面链接，快捷键 `空格` 播放暂停、`←/→` ±5s、`Esc` 关闭）。双击 `index.html` 走 `file://` 也能出列表；要拖动进度条就用 `bili serve`。控制端页面也有「打开媒体库」入口（`/library`）。

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
│  └─ deleted.json              # 媒体库里手动删除的分 P（保留 metadata，避免重复下载）
└─ .cache/                      # 下载中间分片（成功后自动回收，见「已知限制」）
```

## 配置

可选 `config.json`（放在仓库根目录），未配置的项全部走 `src/config.ts` 里的默认值。常用项：

| 分组 | 键 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `auth` | `cookieFile` | `.local/cookies.json` | 登录态路径，也可用 `--cookie-file` 覆盖 |
| `limits` | `maxOutputGB` / `warnRatio` / `pauseOnExceed` | `500` / `0.9` / `true` | outputs 总占用上限（GB）、告警比例、超限自动暂停 |
| `output` | `root` / `filenameTemplate` / `partSuffix` | `outputs` / `{title} [P{p}] [{bvid}]` / `auto` | 目录与命名 |
| `output` | `sidecarMeta` / `nfo` | `true` / `false` | 同名 `.meta.json`、可选 `.nfo` |
| `output` | `cleanCacheOnDone` | `true` | 封装成功后立即删除该任务的中间分片 |
| `download` | `maxParallelTasks` / `maxStreamsPerTask` | `3` / `3` | 下载任务并发、单流 Range 分片数 |
| `download` | `quality` / `preferHdr` / `preferHighFps` / `codec` | `best` / `true` / `true` / `auto` | 选流策略 |
| `download` | `pages` / `folderPick` | `all` / `non-default-first` | 分 P 范围、多收藏夹归属 |
| `download` | `maxSpeed` / `minFreeDiskGB` | `null` / `5` | 限速、磁盘下限保护 |
| `mux` | `container` / `maxParallel` / `faststart` | `mp4` / `3` / `true` | 封装容器与转码并发 |
| `danmaku` | `enabled` / `formats` | `true` / `["ass","srt"]` | 弹幕输出格式 |
| `timeout` | `idleMs` / `stallMs` / `taskMs` | `20000` / `60000` / `1800000` | 读空闲、速率停滞、任务总时长 |
| `engines` | `mode` / `ytdlp.autoDownload` | `auto` / `true` | 引擎模式、副引擎二进制自动获取 |
| `control` | `host` / `port` | `127.0.0.1` / `8765` | 控制端监听 |
| `scan` | `includeCollectedFolders` | `false` | 是否一并扫描「收藏的他人收藏夹」 |

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

- **历史残留分片需手动清一次**：自动回收只对新完成的任务生效；此前攒下的残留用 `bili cache`（只清已完成任务的）或 `bili cache --all` 处理，dashboard 会单独显示「缓存」占用。
- **占用上限只做「不再新增」**：达到 `limits.maxOutputGB` 后暂停下载队列，但不会自动删除已有内容（在途任务会跑完）。
- **登录态不自动续期**：`refresh_token` 续期尚未实现，cookie 过期后需重新 `bili login`；控制端会给出红色告警条，但页面内扫码（PLAN §3.12 的 `GET /api/login/qr`）还没做。
- **控制端默认端口 8765**：若被其他程序（如编辑器）占用，用 `bili web --port <其他端口>`。
- HLS / 加密 m3u8 源目前未做专项样本验证；主引擎优先处理 DASH 与多段 durl。

## 常见问题与故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `控制端端口 8765 已被占用` | 端口被其他程序（编辑器等）占用 | `bili web --port 8899` |
| 控制端提示「登录态失效」/`-101` | cookie 过期（约数月）或被踢 | 重新 `bili login --qr`；控制端顶部会有红色告警条 |
| 重启后又自动下载了几个 | 旧版本启动会强制 resume | 新版沿用上次队列状态；也可 `bili web --paused` 强制启动即暂停 |
| 按钮显示「暂停下载」但速度还在跑 | 「暂停」只停止取新任务，在飞任务会跑完 | 属预期；在飞数归零后按钮变「继续下载」 |
| 磁盘被分片缓存吃满 | 历史任务残留分片 | `bili cache --dry-run` 看占用 → `bili cache` 只清已完成任务的；dashboard 有「清理已完成缓存」按钮 |
| 任务卡住不动、显示「停滞」 | 网络/风控导致长时间无速度 | 看门狗会自动重连 → 重建会话 → 切换副引擎；也可在任务行点「副引擎」手动切 |
| 下载到的清晰度比预期低 | 非大会员无高码流权益 / 稿件本身无该档 | 属正常降级，任务会标记 `degraded`；确认账号权益后用「副引擎」重试一次 |
| 媒体库页面空白 | `library.js` 损坏或未生成 | 控制端点「重建媒体库」，或 `bili build-index` |
| 媒体库里删掉的视频又被下载 | 删除标记丢失 | 标记在 `.state/deleted.json`；删除请走页面按钮，不要手删文件 |
| `file://` 打开媒体库能看不能拖进度条 | 浏览器限制本地文件 Range | 用 `bili serve` 或控制端的 `/library` |
| ffmpeg 缺失 | 系统未装 | `brew install ffmpeg`，或让程序自动下载 `ffmpeg-static` |
| 大量 `-412` / `-352` | 请求过频被风控 | 控制端把并行降到 1、设 `maxSpeed` 限速；或在配置里调大 `download.requestIntervalMs` |

日志文件：`outputs/.state/logs/<日期>.log`（控制端「日志」面板可按级别过滤并导出）。

## 环境要求

- Node ≥ 20
- ffmpeg（缺失时自动下载 `ffmpeg-static`；也可 `brew install ffmpeg`）

## 开发

```bash
npm run lint             # tsc --noEmit
npm test                 # vitest run（离线，不需要登录态）
npm run test:fixtures    # 只跑接口契约测试（tests/fixtures 里的真实响应样本）
npm run capture:fixtures # 重新抓取真实响应样本（需要登录态）
npm run check:secret     # 提交前自检：阻断 SESSDATA / bili_jct / outputs 等误提交
npm run build            # 编译到 dist/
```

测试覆盖：`namer`（命名清洗/截断/重名）、`quality`（选流与降级链，走 fixture）、`cache`（分片回收）、`deleted`（删除标记闭环）、`scanner`（多收藏夹归属）、`static`（路径穿越防护）。接口契约测试读 `tests/fixtures/*.json`，B 站接口一改就会红。

## 安全与合规

- 凭据、产物、二进制均不入库：`.gitignore` 已忽略 `outputs/ state/ .local/ bin/`
- 日志中的 cookie 一律脱敏
- 不破解会员权益、不绕过付费内容；下载内容仅限个人离线使用
