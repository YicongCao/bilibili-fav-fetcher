# bilibili 收藏夹下载器

一个本地 CLI 工具：用自己的 B 站登录态扫描收藏夹，把收藏的视频（含弹幕、封面、metadata）离线化，并提供可播放的本地媒体库索引页与控制端网页。

> 仅供个人对已收藏内容做离线备份与学习研究，下载内容不得公开分发或用于商业用途。

## 特性

- **登录态**：扫码 / 手动粘贴 / 导入 Cookie，凭据本地保存并自动续期
- **收藏夹扫描**：按收藏夹名称建目录，根目录导出全量 metadata
- **最高可用画质**：自动选账号可播的最高档（大会员即 4K / HDR / 杜比视界 / 60fps），无权益自动降级
- **多线程流水线**：下载队列与转码队列并行度各 3，边下边转
- **双引擎**：主引擎自研（分片级续传），副引擎 yt-dlp，任务失败自动切换
- **分段流归一化**：DASH / HLS(m3u8，含 AES-128) / 多段 durl 统一拼成单个 mp4（默认不重编码）
- **弹幕**：`.ass` + `.srt` 各一份，与视频同名同目录
- **封面 + metadata**：同名 `.jpg` 与 `.meta.json`，并写入容器内 tags
- **多 P**：全部下载，用 `[P1] [P2]…` 后缀区分
- **超时与停滞**：长时间无速度自动重连 / 切引擎
- **队列可中断可恢复**：按任务粒度断点续传；首次重试排队首，第 2 次起排队尾并退避
- **控制端网页**：实时看板 + 任务级控制 + 配置热更新
- **媒体库索引页**：离线可用的筛选 / 搜索 / 播放页面

## 实现进度

按 `PLAN.md` 的 S0–S11 推进，每完成一节即提交并推送：

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| S0 | 工程骨架与基础设施 | ✅ |
| S1 | 登录与 API 客户端（WBI / buvid3） | ✅（自动续期待补） |
| S2 | 收藏夹扫描与 metadata 导出 | ⬜ |
| S3 | 选流、引擎抽象、多线程下载队列 | ⬜ |
| S4 | 转码/拼接队列与流水线 | ⬜ |
| S5 | 弹幕下载与 ass/srt 生成 | ⬜ |
| S6 | 封面与同名 `.meta.json` | ⬜ |
| S7 | 队列、任务库、超时、断点续传、双引擎切换 | ⬜ |
| S8 | UP 主模式 | ⬜ |
| S9 | 控制端网页 | ⬜ |
| S10 | 媒体库索引页与播放器 | ⬜ |
| S11 | 打磨与文档定稿 | ⬜ |

详细设计见 [PLAN.md](./PLAN.md)。

## 快速开始

```bash
npm install

# 已实现
npm run bili -- login --qr       # 扫码登录（凭据存 .local/cookies.json）
npm run bili -- login --manual   # 手动粘贴 Cookie
npm run bili -- login --import ./cookies.txt   # 导入 Netscape / Cookie-Editor 导出
npm run bili -- whoami           # 查看当前登录用户与会员状态
npm run bili -- doctor           # 环境自检（Node / ffmpeg / 登录态 / 磁盘 / 连通性）

# 计划中（随实现进度更新）
bili scan                       # 扫描收藏夹，建目录并导出 outputs/index.json
bili download                   # 按收藏时间倒序下载（默认起控制端）
bili up <mid|主页URL|昵称>       # 按 UP 主从新到旧下载

bili web                        # 打开控制端网页
bili build-index                # 生成 outputs/index.html 媒体库
bili serve                      # 静态服务（支持进度条拖动）

bili status                     # 下载进度
bili repair                     # 重跑失败 / 待转码任务
```

bili scan                       # 扫描收藏夹，建目录并导出 outputs/index.json
bili download                   # 按收藏时间倒序下载（默认起控制端）
bili up <mid|主页URL|昵称>       # 按 UP 主从新到旧下载

bili web                        # 打开控制端网页
bili build-index                # 生成 outputs/index.html 媒体库
bili serve                      # 静态服务（支持进度条拖动）

bili status                     # 下载进度
bili repair                     # 重跑失败 / 待转码任务
```

## 产物目录

```
outputs/
├─ index.json                   # 全部收藏视频 metadata 汇总
├─ favorites.json               # 收藏夹结构
├─ <收藏夹名>/
│  ├─ <标题> [P1] [BV号].mp4
│  ├─ <标题> [P1] [BV号].ass     # 弹幕（ass，带样式）
│  ├─ <标题> [P1] [BV号].srt     # 弹幕（srt，兼容简单播放器）
│  ├─ <标题> [P1] [BV号].jpg     # 封面
│  └─ <标题> [P1] [BV号].meta.json
├─ up/<UP名>(<mid>)/
├─ index.html / library.js      # 媒体库索引页
└─ .state/                      # tasks.json / queue.json / logs
```

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

## 环境要求

- Node ≥ 20
- ffmpeg（缺失时自动下载 `ffmpeg-static`；也可 `brew install ffmpeg`）

## 安全与合规

- 凭据、产物、二进制均不入库：`.gitignore` 已忽略 `outputs/ state/ .local/ bin/`
- 日志中的 cookie 一律脱敏
- 不破解会员权益、不绕过付费内容；下载内容仅限个人离线使用
