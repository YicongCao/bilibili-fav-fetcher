# 哔哩哔哩收藏夹下载器 · 策划案与技术方案

> 版本 v1.0 · 目标：一个可长期运行的本地 CLI 工具，把**自己账号收藏（或指定 UP 主投稿）的视频**按时间倒序离线化（视频 + 弹幕 + 封面 + 元数据），并生成一个可离线浏览/播放的静态 HTML 索引。
>
> 声明：工具仅供个人对已收藏内容做离线备份与学习研究，下载内容不得公开分发或用于商业用途；需遵守 B 站用户协议与著作权法。

---

## 0. 运行环境与前提

| 项 | 现状/结论 |
| --- | --- |
| Node | v24.16（本机已装），要求 ≥ 20 |
| npm | 11.13 |
| Python | 3.13（仅作可选辅助，不作为主栈） |
| ffmpeg | **未安装** → 工具启动时自动探测；缺失则自动下载 `ffmpeg-static` 二进制，失败再提示 `brew install ffmpeg` |
| yt-dlp | **未安装** → 不作为主依赖，仅作为可选下载后端（`--backend yt-dlp`） |

技术栈结论：**Node + TypeScript 全栈自研**（下载、弹幕、索引、前端同一语言，便于长期维护）；不引入 Python。

---

## 1. 目标与非目标

### 1.1 目标（Must）
1. **登录态获取**：扫码 / 手动粘贴 / 导入 Cookie 三种方式，持久化到本地，会话过期自动提示。
2. **收藏夹扫描**：拉取全部收藏夹，按收藏夹名称在 `outputs/` 下建目录；根目录导出**全部收藏视频 metadata**。
3. **最高可用画质**：自动选择当前账号能播的最高清晰度；大会员优先 4K / HDR / 杜比视界 / 60 帧，无权益时自动降级。
4. **顺序下载**：按「加入收藏时间」或「发布时间」**从新到旧**，落到所属收藏夹目录。
5. **多线程 + 单一队列**：下载与转码各一条队列，**并行度上限均为 3**，两阶段流水线**重叠执行**（边下边转）；**所有下载任务必须进入下载队列**，队列可中断、可恢复、自身带 metadata。
6. **双下载引擎**：主引擎 = 自研 Node 引擎（选流可控、分片级续传、无外部依赖）；副引擎 = yt-dlp（应对接口变更与疑难格式）；**任务级失败自动切换**，两引擎产出同一契约（§3.13）。
7. **分段流归一化**：DASH(m4s) / HLS(m3u8) / 多段 `durl` 统一拼成单文件，**封装优先 mp4（可选 mov）**，默认只重封装不重编码。
8. **弹幕**：下载并转换为 `.ass`（默认）/ `.srt`，与视频**同目录同名**。
9. **封面与 metadata**：封面大图 + **同名 `.meta.json`**（可选 `.nfo`）+ 容器内 tags，全部与视频**同目录同名**。
10. **多 P 全量下载**：多分 P 稿件默认 `pages: all` 全部下载，文件名用 `[P1] [P2]…` 区分，每个 P 各自带弹幕/封面/metadata。
11. **UP 主模式**：给定 UP 主 → 拉取全部投稿元数据 → 从新到旧下载。
12. **媒体库索引页**：生成 `outputs/index.html`，支持筛选/搜索/排序/播放，多 P 按稿件聚合。
13. **控制端网页**：实时任务看板（速度/进度/队列/引擎/日志）+ 任务级控制（暂停/继续/取消/插队/重试/换引擎）+ 配置热更新 + **按任务粒度断点续传**，进程重启自动恢复。
14. **超时机制**：多级超时（连接/首字节/读空闲/速率停滞/任务总时长/转码停滞/API），长时间无速度即判定 stall 并按三级响应处理（重连 → 重建会话 → 切引擎）。
15. **工程性**：幂等跳过、限速与风控退避、失败报告、`bili repair` 补偿。

### 1.2 非目标（Won't）
- 不破解大会员、不做 DRM/付费课程/番剧（`pgc`）下载。
- 不做分布式、不做 GUI 客户端（仅 CLI + 静态网页）。
- 不上传、不转码重编码（默认 `copy` 封装，不损失画质）。

---

## 2. 总体架构

```
┌──── CLI (commander) ──────────┐   ┌──── 控制端 Web ──────────────┐
│ login scan download up        │   │ HTTP + WebSocket :8765       │
│ build-index web serve repair  │◄─►│ 看板 / 控制 / 日志 / 热改配置 │
│ status doctor                 │   └──────────────┬───────────────┘
└──────────────┬────────────────┘                  │
               │                      ┌────────────▼─────────────┐
┌──────────────▼────────────────┐     │ Engine 引擎（常驻）      │
│ Auth   cookie · WBI · buvid3  │     │ TaskStore 任务状态机      │
├───────────────────────────────┤     │ EventBus 事件广播        │
│ API    nav / fav / space      │     └────────────┬─────────────┘
│        view / playurl / dm    │                  │
│        （限流·重试·错误映射）  │                  │
├───────────────────────────────┤     ┌────────────▼─────────────┐
│ Core   Scanner 扫描            │     │ 流水线（阶段重叠执行）    │
│        Quality 选流            │     │ Plan ─► DownloadQueue ≤3 │
│        Namer  Reporter         │     │      ─► MuxQueue    ≤3   │
├───────────────────────────────┤     │      ─► Finalize         │
│ 能力   HLS/DASH/durl 归一化     │     └────────────┬─────────────┘
│        Danmaku(pb→ass/srt)    │                   │
│        Cover   Library 索引    │                   │
├───────────────────────────────┤     ┌────────────▼─────────────┐
│ 存储   outputs/ state/ logs/   │◄────┤ TaskStore 原子落盘(节流) │
└───────────────────────────────┘     └──────────────────────────┘
```

### 2.1 仓库目录结构

```
bilibili-fav-downloader/
├─ package.json                # type: module, bin: bili
├─ tsconfig.json
├─ config.example.json         # 全部可配项的默认值与注释
├─ .env.example                # BILI_SESSDATA / BILI_JCT / BILI_DEDE_USER_ID
├─ README.md                   # 使用说明
├─ PLAN.md                     # 本文档
├─ assets/
│  └─ dm.proto                 # 弹幕 protobuf schema
├─ src/
│  ├─ cli/                     # commands/*.ts, index.ts
│  ├─ auth/                    # cookie.ts, wbi.ts, fingerprint.ts, qrlogin.ts
│  ├─ api/                     # client.ts, nav.ts, favorite.ts, space.ts,
│  │                           # view.ts, playurl.ts, danmaku.ts, errors.ts
│  ├─ core/                    # scanner.ts, scheduler.ts, quality.ts,
│  │                           # downloader.ts, hls.ts, segjoin.ts,
│  │                           # muxer.ts, muxQueue.ts, pipeline.ts,
│  │                           # queue.ts, taskStore.ts, watchdog.ts,
│  │                           # namer.ts, reporter.ts
│  ├─ danmaku/                 # protobuf.ts, ass.ts, srt.ts, layout.ts
│  ├─ core/engines/            # native.ts（主） / ytdlp.ts（副） / index.ts（切换）
│  ├─ library/                 # scanLibrary.ts, buildHtml.ts
│  ├─ server/                  # http.ts, ws.ts, routes.ts, events.ts
│  ├─ web/                     # library: template.html / app.js / style.css
│  │                           # control: control.html / control.js
│  ├─ utils/                   # http.ts, fsx.ts, logger.ts, format.ts, ffmpeg.ts
│  └─ types/                   # 数据模型（见 §5）
├─ outputs/                    # 【产物，gitignore】
├─ state/                      # 【WBI 缓存 / 控制端 token，gitignore】
├─ .local/                     # 【开发期测试账号登录态，gitignore，权限 0600】
├─ bin/                        # 【自动下载的 ffmpeg / yt-dlp 二进制，gitignore】
└─ tests/fixtures/             # 脱敏的真实接口响应样本（可提交，离线测试用）
```

**.gitignore（必须）**
```
node_modules/
outputs/
state/
.local/
bin/
*.part
*.part[0-9]
*.muxing
*.m4s
.DS_Store
```

### 2.2 outputs 目录结构（产物）

```
outputs/
├─ index.json                  # ★ 全部收藏视频 metadata 汇总（唯一权威清单）
├─ favorites.json              # ★ 收藏夹结构（id/名称/数量/封面/层级）
├─ up/
│  └─ <UP名>(<mid>)/
│     ├─ metadata.json         # 该 UP 全部投稿 metadata
│     └─ <视频文件>.mp4 / .ass / .jpg
├─ 编程学习/                    # ← 收藏夹名称目录（一个收藏夹一个）
│  ├─ metadata.json            # 该收藏夹视频列表（可关）
│  ├─ 【官方】XX 教程 [P1] [BV1xx411c7mD].mp4      # ← 多 P 全部下载，P 序号后缀区分
│  ├─ 【官方】XX 教程 [P1] [BV1xx411c7mD].ass
│  ├─ 【官方】XX 教程 [P1] [BV1xx411c7mD].srt     (可选)
│  ├─ 【官方】XX 教程 [P1] [BV1xx411c7mD].jpg
│  ├─ 【官方】XX 教程 [P1] [BV1xx411c7mD].meta.json   # ← 同名 metadata 侧车
│  ├─ 【官方】XX 教程 [P2] [BV1xx411c7mD].mp4 / .ass / .jpg / .meta.json
│  └─ ...
├─ 音乐现场/
│  └─ ...
├─ index.html                  # ★ 生成的索引页（离线可用）
├─ library.js                  # 索引数据（window.__BILI_LIBRARY__ = {...}）
└─ .state/                     # 隐藏：状态库与日志
   ├─ tasks.json               # ★ 任务库：任务粒度断点续传的唯一依据
   ├─ db.json                  # 轻量索引（bvid_cid → taskId，供幂等查询）
   └─ logs/YYYY-MM-DD.log
```

> `library.js` 而非 `library.json`：`<script src>` 在 `file://` 下可加载，而 `fetch()` 会被 CORS 拦；这样双击 `index.html` 也能用。同时提供 `bili serve` 走 HTTP（支持 Range，可拖动进度条）。

---

## 3. 功能详细设计

### 3.1 登录态获取（三种方式，任选其一）

| 方式 | 命令 | 实现要点 |
| --- | --- | --- |
| **A. 扫码登录（推荐）** | `bili login --qr` | 1) `GET passport.bilibili.com/x/passport-login/web/qrcode/generate` 取 `qrcode_key`+`url`；<br>2) 终端用 `qrcode-terminal` 打印二维码；<br>3) 轮询 `.../web/qrcode/poll?qrcode_key=`，状态 `86101`未扫 / `86090`已扫未确认 / `0`成功；<br>4) 成功返回 `data.url`（crossDomain 跳转链接），其 query 含 `DedeUserID / DedeUserID__ckMd5 / SESSDATA / bili_jct / sid / refresh_token` |
| **B. 手动粘贴** | `bili login --manual` | 交互式输入 `SESSDATA`、`bili_jct(csrf)`、`DedeUserID`，可从浏览器 DevTools→Application→Cookies 复制；另外支持 `BILI_COOKIE='a=b; c=d'` 一次性整串 |
| **C. 导入文件** | `bili login --import ./cookies.txt` | 支持 Netscape `cookies.txt` 与 Cookie-Editor 导出的 JSON 数组两种格式；自动提取 `SESSDATA/bili_jct/DedeUserID/buvid3/b_nut/sid` |

- 凭据存放 `state/cookies.json`（权限 `0600`），**gitignore**；支持 `--cookie-file` 指定。
- 启动任何需登录命令前先做会话校验：命中 `api.bilibili.com/x/web-interface/nav` → `data.isLogin === true` 且 `mid` 与 cookie 一致；否则抛 `AUTH_EXPIRED` 并提示 `bili login`。
- 需要 `buvid3` 指纹 cookie：优先调 `POST api.bilibili.com/x/frontend/finger/spi` 取 `data.b_3/b_4`，失败则本地生成 UUIDv4 兜底；连同 `b_nut=时间戳`、`b_lsid`、`CURRENT_FNVAL=4048` 一起注入。
- 所有请求统一：`User-Agent` 桌面 Chrome、`Referer: https://www.bilibili.com/`、`Origin: https://www.bilibili.com`。

### 3.2 WBI 签名（必须）

2023 年后收藏夹/空间/播放地址等接口强制 WBI：

1. `GET x/web-interface/nav` → `data.wbi_img.img_url/sub_url`，取文件名去掉扩展名得到 `img_key/sub_key`；
2. `raw = img_key + sub_key`，按固定 `MixinKeyEncTab`（64 位乱序表，代码内置常量）重排后取**前 32 位** → `mixin_key`；
3. 请求参数追加 `wts=<秒级时间戳>`，按 key 升序排序，value 过滤掉 `!'()*` 后 URL-encode，拼 query；
4. `w_rid = md5(query + mixin_key)`，追加到 query 末尾；
5. `mixin_key` 缓存到 `state/wbi.json`，**每天（img_key 轮换）刷新一次**。

> 所有 API 调用统一走 `api/client.ts`，签名在其中自动注入，业务层无感。

### 3.3 收藏夹扫描与 metadata 导出

**Step 1 · 收藏夹列表**
- `GET x/v3/fav/folder/created/list-all?up_mid={mid}` → 自己创建的
- `GET x/v3/fav/folder/collected/list-all?up_mid={mid}` → 收藏的他人收藏夹（可开关，默认关）
- 字段：`id / fid / mid / title / media_count / fav_state / attr / cover`
- 顶层与子收藏夹（新版支持文件夹分组）以 `fid` 父子关系还原成树，目录只按**叶子收藏夹名**建立。

**Step 2 · 逐个收藏夹拉全量资源**
- `GET x/v3/fav/resource/list?media_id={fid}&pn={n}&ps=20&order=mtime&type=0&platform=web`
- 分页直到 `has_more === false`；`order=mtime` 即「按加入收藏时间倒序」（另有 `view / pubtime`）
- 条目 `data.medias[]`：`id(aid) / bv_id / title / cover / intro / page(分P序号) / duration / upper{mid,name,face} / cnt_info{play,collect,danmaku} / pubtime / fav_time / type / link`
- `type === 2` 为普通视频 → 处理；`21`(视频合集)、`12`(音频)、图文/直播等 → 记入 `skipped` 统计并写日志（后续可扩展）

**Step 3 · 建目录 + 导出 metadata**
- 每个收藏夹：`outputs/{清洗后的收藏夹名}/`，重名追加 `({fid})`
- `outputs/favorites.json`：收藏夹结构树
- `outputs/index.json`：**全部收藏视频 metadata 汇总**，一条一视频（同一 bvid 的多个分 P 聚合成一条 + `pages[]`）
- `outputs/{folder}/metadata.json`：该收藏夹子集（可用 `output.perFolderMetadata: false` 关闭）

`index.json` 单条结构见 §5.1。

### 3.4 任务模型与调度

- **任务（Task）是唯一的工作与续传单元**：一个任务 = **一个分 P**（含该分 P 的「选流 → 下载全部分片 → 拼接/转封装 → 弹幕 → 封面 → metadata → 落库」全过程）。
  - 多 P 稿件按 `download.pages` 展开为多个任务，默认 `all`（**全部 P 都下**）；同一稿件的多个 P **按 page 升序连续排期**，避免与别的视频交错
  - 任务之间互不依赖，可任意排序、暂停、重试、插队；且**引擎无关**：同一任务既能交给主引擎也能交给副引擎执行（§3.13）
- **排序**：`favTime`（默认，按加入收藏时间倒序）/ `pubDate`（按发布时间倒序）；UP 主模式固定 `pubDate`。
- **归属目录**：主收藏夹 → `outputs/{收藏夹名}/`；同时属于多个收藏夹时按 `linkMode`：`first`（默认，只在主目录存实体，索引页多分类可见）/ `hardlink` / `copy`。
- **状态机**（任务级，落盘到 `outputs/.state/tasks.json`）：

```
queued → planning → downloading → muxing → finalizing → done
            │            │           │
            └────────────┴───────────┴─► failed（可重试 / 可 cancel）
                                   paused（用户暂停，保留已下载分片）
```

- **跳过**：`done` 且产物存在 → `skip`；`--force` 覆盖。
- **结束产出**：终端/网页汇总表（成功/跳过/失败/总大小/耗时）+ `failed.json` + 日志。

### 3.5 最高可用画质选流（`core/quality.ts`）

请求：`GET x/player/wbi/playurl?bvid=&cid=&fnval=4048&fourk=1&qn=0&platform=web`（WBI）
> `fnval=4048` = `16(DASH) + 64(HDR) + 128(4K) + 256(杜比音频) + 512(8K) + 1024(杜比视界) + 2048(AV1)`，一次把大会员权益全开；实际可用项以返回的 `support_formats` 与 `dash.*` 为准。

**选择算法（默认 `quality: "best"`）**

| 维度 | 规则 |
| --- | --- |
| 清晰度优先级 | 8K(127) > 杜比视界(126) > HDR 真彩(125) > 4K(120) > 1080P60(116) > 1080P+(112) > 1080P(80) > 720P60(74) > 720P(64) > 480P(32) > 360P(16) |
| HDR / 杜比 | `preferHdr: true`：同分辨率下优先 `id ∈ {126,125}`；播放器不支持时可用 `--no-hdr` 退回 SDR |
| 帧率 | `preferHighFps: true`：同 `id` 下取 `frame_rate` 更大的（60 > 30） |
| 编码 | `codec: avc \| hevc \| av1 \| auto`；默认 `auto`：HDR/4K 优先 hevc，其余 avc，硬解支持时 av1；`codecid` 映射 `avc=7 / hevc=12 / av01=13` |
| 音质 | 杜比全景声(`dash.dolby`) > FLAC(`dash.flac`) > 320K(30280) > 132K(30232) > 64K(30216) |
| 上限保护 | `maxResolution`（`8K/4K/1080P/720P`）与 `maxBitrate` 可封顶；`minFreeDiskGB` 不足时自动降一档 |
| 降级 | 目标档位缺失 → 逐级向下取第一个存在项，并在任务上记 `qualityDegraded: {want, got}` |

- 结果写入任务 `streams`：视频/音频各记录 `url / backupUrls / bytes / codec / hdr / fps / qualityId`。
- 大会员判定：`data.vip_status` / `has_paid`；非大会员拿不到高码流属正常降级，不报失败。

### 3.6 下载队列：多线程，上限 3（`core/downloader.ts`）

> 本节描述**主引擎（自研 native）**的实现；副引擎 yt-dlp 与失败自动切换见 §3.13。

- **并发模型**（三层，硬上限均为 3，配置可下调）：
  1. `download.maxParallelTasks = 3`：**同时下载的任务数**（每个任务含视频流 + 音频流）
  2. `download.maxStreamsPerTask = 3`：**单条流（如 video.m4s）内的 HTTP Range 分片线程数**
  3. 全局请求池：所有请求经过同一个限流器，`maxGlobalRequests = 9`，配合 800ms±30% 抖动间隔，避免触发 -412
- **分片下载**：
  - 先 `HEAD`/`Range: bytes=0-0` 取 `Content-Length`、`Accept-Ranges`；支持 Range 且 > `minPartSize`(8MB) 才分片，否则单线程
  - 每个分片写独立临时文件 `{name}.m4s.part{index}`，并记录 `{index, start, end, received}`；续传时用 `Range: bytes=start+received-` 续跑
  - `base_url` 失败自动切 `backup_url`，仍失败计入任务重试
  - 全局限速 `maxSpeed`（令牌桶）+ 单任务速度显示（供网页看板）
- **HLS / 多段流**（见 §3.7）：分段下载同样复用本队列，每段作为一个「可续传单元」。

### 3.7 转码/拼接队列：上限 3，与下载并行（`core/muxQueue.ts`）

- **流水线重叠**：任务一旦下载完所有分片，立即把「拼接/封装作业」推入 `MuxQueue`，下载槽位立刻释放给下一个任务 —— **下载与转码同时跑**，不存在「先全部下完再转」的空窗。
- **MuxQueue 并行度 3**，作业类型与命令：

| 源类型 | 处理方式（默认 `-c copy`，不重编码） |
| --- | --- |
| **DASH**（video.m4s + audio.m4s） | `ffmpeg -y -i v.m4s -i a.m4s -c copy -movflags +faststart out.mp4` |
| **多段 durl（MP4/FLV，同编码）** | 先按序**二进制拼接**（mp4/flv 分段可直接 `cat`），再 `ffmpeg -i joined -c copy`；编码参数不一致时改用 concat demuxer |
| **多段 durl（TS）** | `cat` 成 `.ts` → `ffmpeg -i in.ts -c copy -bsf:a aac_adtstoasc out.mp4` |
| **m3u8/HLS（无加密）** | 逐段下载 → 本地重写 playlist → `ffmpeg -protocol_whitelist file,http,https -allowed_extensions ALL -i local.m3u8 -c copy -movflags +faststart out.mp4` |
| **m3u8（AES-128，`#EXT-X-KEY`）** | 取 key（URI+IV）→ 段解密（`crypto` AES-128-CBC）→ 明文段走上面同一条路径；或改写为本地 key 路径交给 ffmpeg |
| **m3u8（fMP4，`#EXT-X-MAP`）** | init segment + 各段拼接 → `ffmpeg -c copy` |
| **无法 copy（罕见：编码不被容器接受）** | 才允许 `forceTranscode` 重编码（`libx264 + aac`，CRF 20），默认关闭并在日志显著告警 |

- **m3u8 解析**（`core/hls.ts`）：支持 `#EXT-X-VERSION / TARGETDURATION / MEDIA-SEQUENCE / EXTINF / BYTERANGE / KEY / MAP / DISCONTINUITY`；嵌套 playlist（master → media playlist）自动选**码率最高**的子列表。
- **拼接实现**（`core/segjoin.ts`）：优先「字节级拼接」（零 CPU）→ `concat demuxer` → `concat protocol`；每步失败自动降级到下一档。
- **封装优先级**：`container: mp4`（默认，HTML5/播放器兼容性最好）→ `mov`（备选，HDR/Alpha 场景）；参数 `-movflags +faststart`，写入 `title / artist / comment(BV号) / date / description` 元数据；HDR 追加 `-color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc`（杜比视界保留 `dvvC/dvhe` box，仅在 mov/mp4 可承载时）。
- **进程管理**：
  - `ffmpeg -hide_banner -nostdin -progress pipe:1 -y`，解析 `out_time_us / total_size / speed` → 实时进度推给网页
  - ffmpeg 内部线程 `-threads min(3, cpuCount-1)`，避免与下载抢 CPU
  - 每个作业写 `out.mp4.muxing`，完成后 `rename`；崩溃残留下次启动自动清理并重跑（**不重下**）
  - 队列满时的背压：`muxQueue.maxPendingGB`（默认 5GB）超出则暂缓拉取新下载任务
- **无 ffmpeg**：`utils/ffmpeg.ts` 探测系统 → 自动下载 `ffmpeg-static` → 仍失败则保留分片并标记 `need_mux`，装好 ffmpeg 后 `bili repair` 只跑转码阶段。

### 3.8 弹幕下载与字幕生成

- 拉取：`GET x/v2/dm/web/seg.so?type=1&oid={cid}&segment_index={n}`（protobuf）
  - 段数 = `ceil(duration_sec / 360)`，从 1 遍历到 N（并发 2，间隔 300ms）
  - 用 `protobufjs` 加载 `assets/dm.proto`（`DmSegMobileReply.elements: DanmakuElem[]`）
  - `DanmakuElem`：`id / progress(ms) / mode(1滚动 4底部 5顶部 6逆向 7定位 8高级) / fontsize / color(RGB→BGR) / midHash / content / ctime / weight / pool / idStr`
  - 去重：按 `dmid` 去重；可选 `danmaku.dedup: true`
- **ASS 生成**（默认，推荐，能还原位置/颜色/滚动）：
  - `PlayResX/Y` 按视频实际分辨率（取不到用 1920×1080）
  - 字号 `fontsize * (PlayResY / 1080)`；样式 `fontFamily`、`outline`、`shadow`、`bold`
  - 滚动：`\move(W+r, y, -textWidth, y)`，`duration = scrollDuration`（默认 8s，可配 6~12）
  - 顶部/底部：`\an8 / \an2`，固定 `duration = 4s`
  - **防重叠**：按模式分轨道（`轨道数 = floor(可用高度 / 行高)`），同一轨道内用「前一条滚出屏幕时间 > 本条进入时间」判定可复用；轨道满则丢弃该条（或按 `danmaku.maxPerScreen` 降采样）
  - 输出 `UTF-8 with BOM`（Windows 播放器友好）
- **SRT 生成**（可选）：仅文本 + 时间轴，`displayMs` 默认 5s；顶部/底部在文本前加 `[top]`/`[bottom]` 标注；时间格式 `HH:MM:SS,mmm`
- 落盘：`{同名}.ass` / `{同名}.srt`，与视频同目录 → 播放器（PotPlayer/IINA/VLC/mpv）自动识别
- 分 P 视频：按 cid 分别生成，文件名 `{标题} [P{p}] [{bvid}].ass`

### 3.9 封面 · metadata 落盘（均与视频同名同目录）

**封面**
- URL 取 `media.cover`（`view` 接口为 `pic`）；优先去掉 `@320w_200h_1c` 之类的裁剪后缀取原图
- 按 `Content-Type` 决定扩展名（`image/jpeg→.jpg`、`image/png→.png`、`image/webp→.jpg` 统一），**文件名与视频完全一致**
- 作为 `<video poster>` 在 HTML 索引中直接使用

**metadata 侧车文件（默认开启 `output.sidecarMeta: true`）**
- 每个视频产出 **`{与视频完全同名}.meta.json`**（仅扩展名不同），内容 = 该分 P 的完整 `VideoMeta` + 本地产物清单 + 下载参数：

```jsonc
{
  "schema": "bili-dl/meta@1",
  "bvid": "BV1xx411c7mD", "aid": 170001, "cid": 279786, "page": 2, "partTitle": "第二集",
  "title": "【官方】XX 教程", "desc": "...", "up": { "mid": 123, "name": "..." },
  "pubDate": 1600000000, "favTime": 1610000000, "duration": 1234,
  "tid": 36, "tname": "科普", "stat": { "view": 1, "danmaku": 2, "like": 3, "favorite": 4 },
  "cover": "https://i0.hdslb.com/...", "url": "https://www.bilibili.com/video/BV...",
  "folders": [{ "fid": 123, "title": "编程学习", "page": 2 }],
  "files": {
    "video": "【官方】XX 教程 [P2] [BV1xx411c7mD].mp4",
    "subtitles": ["....ass"], "poster": "....jpg", "meta": "....meta.json"
  },
  "media": { "container": "mp4", "size": 123456789, "qualityId": 120,
             "qualityLabel": "4K", "hdr": true, "fps": 60,
             "codec": "hevc", "width": 3840, "height": 2160 },
  "engine": { "used": "native", "switchedFrom": null, "attempts": 1 },
  "downloadedAt": 1760000000000, "toolVersion": "1.0.0"
}
```
- **一份文件三种用途**：① 播放器/刮削器可读（`--emit-nfo` 额外生成同名 `.nfo`，Kodi/Jellyfin/Plex 兼容）；② 索引页直接用它重建库（`build-index` 优先读 `.meta.json`，不依赖网络）；③ 文件被移动后仍能自证身份
- **容器内也写一份**：封装时写入 `title / artist(UP) / date / comment(BV号+分P) / description / genre`，用 ffprobe 校验，避免只有 sidecar 时信息丢失
- 与 `.state/tasks.json` 的关系：`tasks.json` 是**运行时状态**，`*.meta.json` 是**成品档案**；重命名/移动视频时只要带上同名 sidecar，索引页仍能识别

### 3.10 UP 主模式

- 解析输入：`bili up 123456` / `bili up https://space.bilibili.com/123456` / `bili up "UP名"`（昵称走 `x/web-interface/wbi/search/type?search_type=bili_user` 取首个 mid）
- 元信息：`GET x/space/wbi/acc/info?mid=` → 名称、头像、签名、粉丝数
- 投稿列表：`GET x/space/wbi/arc/search?mid=&pn=&ps=50&order=pubdate&platform=web`（WBI）
  - `data.list.vlist[]`：`aid / bvid / title / pic / length / play / comment / video_review / created / author / mid`
  - 翻页至 `pn * ps >= data.page.count`
  - 生成 `outputs/up/{UP名}({mid})/metadata.json`
- 下载：**从新到旧**（`created` 倒序），目录 `outputs/up/{UP名}({mid})/`，其余流程（清晰度/弹幕/封面/断点）与收藏夹模式完全一致
- 可选过滤：`--keyword`、`--since 2023-01-01`、`--min-duration 60`

### 3.11 媒体库索引页与播放

`bili build-index` 扫描 `outputs/`（跳过 `.state/`、`.part*`、`.m4s`、`.muxing`；**优先读取每个视频的同名 `.meta.json`**，缺失时再按文件名反推）生成：

**数据层 `outputs/library.js`**
```js
window.__BILI_LIBRARY__ = {
  generatedAt: 1760000000000,
  folders: [{ id, name, count, cover }],
  ups: [{ mid, name, count }],
  items: [{
    id, bvid, cid, page, partTitle, groupId: "bvid",   // 同一稿件的多个 P 共享 groupId
    title, up, mid, duration, pubDate, favTime,
    folder, dir, video: "相对路径", poster: "相对路径", meta: "相对路径",
    subtitles: [{ lang:"chs", file:"相对路径", format:"ass" }],
    container: "mp4", width, height, hdr, fps, size, quality, downloadedAt, tags:[]
  }]
};
```

**页面 `outputs/index.html`**（单文件，零外部依赖，离线可用）
- 顶部：总数 / 已下载 / 总大小 / 生成时间；搜索框
- 左侧：按「收藏夹」「UP 主」两级筛选树 + 「全部 / 未下载 / 有弹幕」状态筛选
- 主区：网格卡片（封面 poster + 时长角标 + UP + 收藏时间）/ 列表视图可切换
- 排序：收藏时间、发布时间、时长、大小、标题
- **播放器**（点击卡片打开）：
  - `<video controls poster>`，支持拖动（HTTP 模式）；`<track kind="subtitles" srclang="zh" default>` 加载 ass/srt
  - 轨道切换、倍速、画中画、全屏；分 P 下拉切换
  - 键盘：`空格`播放/暂停、`←/→` 5s、`J/L` 10s、`F` 全屏、`Esc` 关闭
  - 显示该文件对应的 B 站原始链接、简介、播放/弹幕数、本地路径「复制路径 / 在访达中显示」
- 兼容 `file://`：数据用 `<script src="library.js">` 注入；`file://` 下视频播放受限时页面顶部提示「运行 `bili serve` 获得最佳体验」
- `bili serve --port 8765`：Node 静态服务器，支持 Range、目录浏览、自动打开浏览器

### 3.12 控制端网页（实时看板 + 任务级断点续传）

启动方式：`bili web`（等价于 `bili serve --control`），常驻本地服务 `http://127.0.0.1:8765`，同时提供媒体库索引与控制台两个页面。

**后端（`src/server/`）**
- Node 原生 `http` + `ws`（WebSocket）双通道：
  - REST：`GET /api/tasks`、`POST /api/tasks/:id/{pause,resume,cancel,retry}`、`POST /api/queue/{pause,resume}`、`PATCH /api/config`、`GET /api/events(SSE 备选)`、`GET /api/logs/tail`、`GET /api/login/qr`
  - WebSocket 推送：`task.update`（进度/速度/阶段）、`queue.stats`、`log.append`、`auth.expired`、`disk.warn`
- 默认只监听 `127.0.0.1`；要局域网访问必须显式 `--host` + 自动生成的 token（存 `state/control.token`）

**页面功能（`web/control.html`）**
1. **总览条**：任务总数、各状态计数、总进度、实时速度、ETA、下载队列占用 `x/3`、转码队列占用 `y/3`、**停滞/超时计数**、队列状态（`running/paused`）、磁盘剩余、cookie 有效期倒计时
2. **任务表格**：封面缩图 / 标题 / UP / 目标画质（含 `4K`、`HDR`、`60fps`、`HEVC` 徽标）/ 阶段 badge / 进度条（分片 `n/m`）/ 速度 / ETA / 重试次数 / **停滞提示（「停滞 45s，重连中」）** / 错误信息；支持按状态筛选、搜索、排序
3. **任务级控制**：暂停、继续、取消、重试、**插队（置顶）**、单任务改清晰度（触发重新选流与重下）、**强制重连/绕过当前超时**
4. **全局控制**：暂停全部 / 继续、清空失败队列、导出失败清单、一键 `build-index`
5. **热改配置**：并发数（1~3）、限速、清晰度上限、弹幕开关、封装格式 —— 改完立即生效并持久化
6. **登录区**：cookie 状态；失效时页面直接显示扫码二维码，手机确认后自动继续
7. **日志面板**：实时 tail，按 level 过滤，可下载

**断点续传（任务粒度 + 内部四级）**

| 层级 | 记录内容 | 恢复行为 |
| --- | --- | --- |
| **任务级**（核心） | `tasks.json` 中每个任务：`status/stage/priority/streams/segments/retryCount/error` | 重启后：`done` 跳过；`downloading/muxing` → 校验已有分片后回到对应 stage 继续；`failed` 留在队列等手动/自动重试 |
| 分片级 | `.part{i}` 文件的 `{start,end,received}` | `Range: bytes=start+received-` 续跑，不用重下已完成分片 |
| 段级（m3u8/durl） | 每段独立临时文件 + 完成标记 | 已完成的段直接跳过 |
| 转码级 | 中间产物 `*.muxing` | 崩溃残留清理后**只重跑转码，不重下** |

- **落盘策略**：状态变更走「内存即时 + 500ms 节流原子落盘（`.tmp` → rename）」；进程 `SIGINT/SIGTERM` 优雅退出时强制 flush；异常 kill 后最坏只丢 0.5s 进度。
- **幂等校验**：恢复时用 `Content-Length`/`ETag`/文件实际大小三方比对，不一致则丢弃该分片重下。
- **任务 ID 稳定**：`taskId = sha1(bvid + cid + quality + container)`，重名/改名不影响续传；目录变化时按新路径重建软/硬链接。

### 3.13 下载引擎：自研主引擎 + yt-dlp 副引擎（失败自动切换）

**结论：两套都做 —— 主引擎自研，副引擎 yt-dlp，默认 `auto` 动态切换。**

- **为什么主引擎自研**：选流（HDR/杜比/60fps/编码）要完全可控；分片级断点续传、风控退避、与任务库/控制端深度集成；无外部二进制依赖；弹幕/封面/metadata 本来就是我们自己做。
- **为什么还要 yt-dlp**：B 站接口与流格式变动频繁，yt-dlp 的 extractor 更新最快，是天然的「灾备」；覆盖疑难格式（各类 HLS、加密、特殊 durl）成本极低。

**统一引擎接口（`src/core/engines/`）**
```ts
interface DownloadEngine {
  readonly name: 'native' | 'ytdlp';
  capabilities: { resume: boolean; multiThread: boolean; dash: boolean;
                  hls: boolean; hdr: boolean; selectQuality: boolean };
  healthcheck(): Promise<{ ok: boolean; version?: string; reason?: string }>;
  plan(task: TaskRecord): Promise<DownloadPlan>;     // 写回 task.streams / task.segments
  run(task: TaskRecord, hooks: ProgressHooks): Promise<RawResult>;
  cancel(task: TaskRecord): Promise<void>;
}
```
> 引擎**只负责**「把媒体流取到磁盘并合成单文件容器」。选流策略、命名、弹幕、封面、metadata、续传状态机、落库都在引擎之外 —— 两个引擎产出**同一契约**。

**能力对比**

| 维度 | native（主） | ytdlp（副） |
| --- | --- | --- |
| 多线程 | 单流 Range 分片 ≤3，任务级 3 | `--concurrent-fragments 3`（原生 DASH/HLS 分片并发） |
| 断点续传 | **分片级 / 段级**（精细） | 文件级 `.part`（`-c`，粒度较粗） |
| 清晰度/HDR | 自研选流，完全可控 | `-f` 表达式 + `--remux-video mp4` |
| m3u8 / 加密 | 自研解析 + AES-128 | 内建，覆盖更全 |
| 风控 | cookie + WBI + buvid + 退避 | `--cookies` 传 Netscape 临时文件 |
| 进度 | 事件级，直供看板 | 解析 stdout（`--newline --progress-template`） |
| 依赖 | 无（除 ffmpeg） | 需二进制（首次自动下载 + 版本锁） |
| 弹幕/封面 | 自研（yt-dlp 不提供 B 站弹幕） | 由引擎外的统一流程补齐 |

**切换策略（任务级，`engine.mode: auto`）**

触发（任一命中即切副引擎）：
1. 同一任务主引擎失败 ≥ `engine.failover.afterFailures`（默认 2）次；
2. 错误类型命中：`PARSE_PLAYURL / NO_STREAM / HLS_KEY_FAIL / JOIN_FAIL / RANGE_NOT_SUPPORTED / MUX_FAIL / HTTP_5xx`；
3. 同一类错误在最近 20 个任务内出现 ≥3 次（判定为系统性故障，如接口变更）→ 批量切换。

切换动作：
- `task.engine = 'ytdlp'`、`switchedFrom = 'native'`，重置重试计数，优先级 +500 尽快验证
- **代价说明**：清除该任务半成品分片（副引擎无法复用我们的 `.part`），该任务**从头重下**
- 冷却 `cooldownTasks = 5`；副引擎连续 10 个任务成功后自动回主引擎
- 两引擎都失败 → `failed`，错误里保留 `engineErrors: [{engine, code, message}]`，`bili repair --engine ytdlp` 可指定
- 手动覆盖：`--engine native | ytdlp`（强制单引擎，不切换）

**yt-dlp 的获取与版本**
- 探测顺序：`config.engines.ytdlp.path` → `PATH` → `brew` 安装 → 首次运行时下载官方二进制到 `bin/yt-dlp`
- 版本锁定 + 每天最多一次自检更新提示（B 站 extractor 变更频繁）
- 完全不可用时降级为「纯主引擎」，控制端顶部常驻提示「副引擎不可用，已关闭自动切换」

**参数映射**

| 我们的配置 | yt-dlp 参数 |
| --- | --- |
| `quality: best` | `-f "bv*[height<=2160]+ba/bv*+ba/b"`（HDR/杜比时放宽 `--format-sort`） |
| `container: mp4` | `--remux-video mp4`（失败退化 `--merge-output-format mp4`） |
| `maxSpeed` | `--limit-rate 5M` |
| `maxStreamsPerTask: 3` | `--concurrent-fragments 3` |
| 断点 | 关闭 `--no-part`，由我们管理临时目录 |
| 登录态 | `--cookies <tmp netscape>`（由 `state/cookies.json` 生成：SESSDATA / bili_jct / DedeUserID / buvid3） |
| 输出 | `-o "<outDir>/<baseName>.%(ext)s"`（`--restrict-filenames` 关闭，命名由我们把控） |
| 噪声 | `--no-write-thumbnail --no-write-subs --no-playlist`（封面/字幕我们自己下） |

**产物一致性校验（两引擎共用）**：完成后统一 `ffprobe`（容器 / 时长 / 音视频流 / 分辨率 / HDR 标识）→ 统一 rename 到目标文件名 → 统一生成 `.ass/.srt/.jpg/.meta.json` → 落库。校验失败记 `MUX_FAIL`，按常规重试并可能触发引擎切换。

### 3.14 超时与停滞（stall）检测

**核心原则：不看总耗时，看「有没有在动」—— 长时间无下载速度即触发超时。**

**多级超时清单**

| 层级 | 检测对象 | 默认阈值 | 判定错误码 |
| --- | --- | --- | --- |
| 连接超时 | TCP/TLS 建连 | `connectTimeout 10s` | `CONNECT_TIMEOUT` |
| 首字节超时 | 请求发出 → 收到首字节 | `headersTimeout 15s` | `HEADERS_TIMEOUT` |
| 读空闲 | 流式读取期间无新字节 | `idleTimeout 20s` | `READ_IDLE` |
| **速率停滞** | 滑动窗口（10s）速率 < `minSpeedBps` | `stallTimeout 60s` | `STALL` |
| 任务总时长 | 任务开始 → 结束 | `taskTimeout 30min`（且 ≥ 预估 `大小/最低速率`） | `TASK_TIMEOUT` |
| 转码停滞 | ffmpeg `-progress` 无输出/无进度增长 | `muxIdleTimeout 5min` | `MUX_TIMEOUT` |
| 接口超时 | 任意 API 调用（`playurl`/`nav` 等 15s） | `apiTimeout 10s` | `API_TIMEOUT` |

**停滞判定细节**
- 采样：每 2s 记录 `(bytesDone, now)`；窗口 10s 内增量 < `minSpeedBps × 10`（默认 8KB/s）且持续 `stallGraceSec`(15s) 后才开始计时，累计 `stallTimeout` 即判 STALL
- **宽限豁免**（防误判）：① 刚建连/刚切片的 15s 内不判；② 用户限速低于 `minSpeedBps` 时阈值自动降为 `max(1KB/s, maxSpeed×0.1)`；③ 任务被 `paused`、写盘阻塞、系统休眠期间不计时；④ 整网不可达 → 全局暂停等待恢复，而非逐个判失败
- 记录：`task.stallCount / lastProgressAt / bytesAtLastCheck`；事件 `task.stalled` 实时推到控制端（显示「停滞 45s，正在重连…」）

**STALL 三级响应**

1. **第 1 次**：不换引擎 —— 断开连接，按已写偏移 `Range` 续跑；同时切 `backup_url`
2. **第 2 次**：重建会话（重取 `buvid3` + 刷新 WBI）后重试；该任务 **retryCount=1 → 排到队首**
3. **第 3 次**：判定 `TIMEOUT`，**触发引擎切换**（native → ytdlp）；若已是副引擎 → `failed(TIMEOUT)`（retryCount≥2 排到队尾）

> 连接类超时（`CONNECT/HEADERS_TIMEOUT`、`READ_IDLE`）先按同一套三级响应处理；连续命中则合并计入 `stallCount`。

### 3.15 任务队列：单一入口 · 可中断 · 可恢复 · 自带 metadata

- **单一入口**：扫描产出、UP 模式、`bili repair`、引擎切换重排、手动 `--add` —— **所有下载任务一律 `queue.enqueue(task)`**，不存在「队列之外的下载」。
- **队列 metadata**（`outputs/.state/queue.json`，与 `tasks.json` 分离、独立原子落盘）：

```jsonc
{
  "schema": "bili-dl/queue@1",
  "status": "running" | "paused" | "stopped",
  "cursor": 42,                        // 已消费到的序号
  "order": ["<taskId>", "..."],        // 显式顺序（含重排后的位置）
  "inflight": ["<taskId>", "..."],     // 运行中槽位（≤ maxParallelTasks）
  "delayed": [{ "id": "<taskId>", "notBefore": 1760000000000 }],   // 退避延迟队列
  "stats": { "total": 120, "done": 42, "failed": 3, "skipped": 5,
             "bytesDone": 12345678, "startedAt": 1760000000000 },
  "configSnapshot": { "maxParallelTasks": 3, "quality": "best", "engineMode": "auto" },
  "heartbeat": 1760000000000,          // 用于判定上次进程是否异常退出
  "updatedAt": 1760000000000
}
```

- **可中断**
  - `SIGINT/SIGTERM` → `status = paused`，停止取新任务；在途任务 flush 分片进度（等待 ≤10s），超时则直接落盘退出
  - 控制端「暂停」= 只停取新任务，在途跑完；「停止」= 在途也中断（保留分片）
  - `kill -9` / 崩溃：`heartbeat` 超时即判定异常退出，下次启动按 §4.4 扫盘校验后恢复
- **可恢复**
  - 启动 `queue.load()` → 校验 `order` 与 `tasks.json` 一致性（补齐缺失任务、清理孤儿）→ 未完成任务按原顺序继续
  - `--resume`（默认）/ `--restart`（丢弃队列重建）
- **重试排队规则（明确）**

| 情况 | 落位 |
| --- | --- |
| 首次失败（retryCount 0→1） | **队列头部**，立即重试（多为瞬时错误） |
| 第 2 次及以后（retryCount ≥1） | **队列尾部**，并进入 `delayed`：`notBefore = now + min(30s × 2^(n-1), 10min)` |
| 引擎切换后的重试 | 视为新尝试，放**头部**（优先级 +500） |
| 用户手动重试 / 插队 | 头部 |
| 停滞 STALL 第 2 次 | 头部（见 §3.14） |

  - 队首插入**不抢占**正在跑的任务（槽位满则等下一个空位）
  - 同一 `taskId` 在队列中**只出现一次**（幂等入队）

### 3.16 开发期登录态：一次提供、后续免干预

- 用户在 **S1 阶段只做一次**扫码：`bili login --qr --cookie-file .local/cookies.json`（`.local/` 已 gitignore，文件权限 0600）
- 保存：`SESSDATA / bili_jct / DedeUserID / buvid3 / b_nut / sid` + **`refresh_token` 与 `refresh_csrf`**
- **自动续期**（尽量不打断开发）：启动时与每 12h 检查 `GET x/passport-login/web/cookie/info`，可续则 `POST x/passport-login/web/cookie/refresh`（带 `refresh_csrf`）刷新 SESSDATA，成功后回写 `.local/cookies.json`
- 续期也失败 → 队列置 `paused`，控制端/终端明确提示「登录态失效，需重新扫码」。这是**唯一需要用户再次干预**的场景，除此之外 S1~S11 全部自动验证
- 降低对真实接口的依赖：`tests/fixtures/` 保存脱敏的真实响应样本（`playurl` / `resource/list` / `seg.so` 等），`npm test` 走离线契约测试（不需要登录），`npm run test:e2e` 才用测试账号真实跑 1~3 个视频
- **安全**：日志/错误/报告中 cookie 一律脱敏为 `SESSDATA=***`；`bili doctor` 只输出「有效 / 剩余天数」；绝不把 `.local/`、`state/`、`outputs/` 提交进仓库

---

## 4. 关键技术点

### 4.1 接口清单（集中封装，便于应对变更）

| 用途 | 接口 | 鉴权 |
| --- | --- | --- |
| 会话校验 / WBI 密钥 | `GET x/web-interface/nav` | cookie |
| 扫码登录 | `passport.bilibili.com/x/passport-login/web/qrcode/{generate,poll}` | 无 |
| 设备指纹 | `POST x/frontend/finger/spi` | 无 |
| 收藏夹列表 | `GET x/v3/fav/folder/created/list-all` | cookie + WBI |
| 收藏夹内容 | `GET x/v3/fav/resource/list` | cookie + WBI |
| 稿件信息（分P/时长/封面/简介） | `GET x/web-interface/view?bvid=` | cookie（WBI 视情况） |
| UP 信息 | `GET x/space/wbi/acc/info?mid=` | cookie + WBI |
| UP 投稿 | `GET x/space/wbi/arc/search?mid=&order=pubdate` | cookie + WBI |
| 播放地址 | `GET x/player/wbi/playurl?bvid=&cid=&fnval=4048` | cookie + WBI |
| 弹幕段 | `GET x/v2/dm/web/seg.so?oid=&segment_index=` | cookie |
| 封面 | `GET {pic}`（直连 i0.hdslb.com） | Referer |

### 4.2 错误码与风控处理

| code | 含义 | 策略 |
| --- | --- | --- |
| `0` | 成功 | — |
| `-101` | 未登录 | 立即中止批次，抛 `AUTH_EXPIRED`，提示 `bili login` |
| `-352` | 风控（请求异常） | 重建 `buvid3/b_nut`、随机 UA、间隔 ×3，重试 3 次后跳过 |
| `-412` | 请求被拦截 | 同上 + 降并发至 1，冷却 60s |
| `-403` / `-404` | 稿件失效/仅自见/地区限制 | 记 `dead`，不重试 |
| `-509` | 请求过快 | 指数退避（1s→2s→4s…上限 60s） |
| 大会员专属 | `playurl` 无对应清晰度 | 自动降级到可用最高，日志 warn |
| 网络/5xx | — | 重试 3 次，指数退避 |

### 4.3 文件名清洗规则（`core/namer.ts`）
1. 替换非法字符 `\/:*?"<>|\r\n\t` 为 `_`（Windows/macOS 双兼容）
2. 去除控制字符与不可见字符，压缩连续空白
3. 去掉首尾空格与 `.`（避免 macOS/Windows 边界问题）
4. 保留 `.` 但禁止以 `.` 结尾；按 UTF-8 字节安全截断到 120 字节
5. 同一目录重名 → 追加 ` ({bvid})` → 再 `-2`、`-3`
6. 收藏夹目录名同规则；空名回退 `未命名收藏夹({fid})`
7. 模板变量：`{title} {bvid} {up} {mid} {pubdate:YYYYMMDD} {favdate:YYYYMMDD} {p} {ptitle} {quality} {container}`
   - 默认视频模板：`{title} [P{p}] [{bvid}]`
   - **P 后缀规则**（`output.partSuffix`）：多 P 稿件（`pages.length > 1`）**每个 P 都下载**，文件名统一带 `[P{p}]`；单 P 稿件默认**不加**后缀（`auto`），可设为 `always`（强制加）/ `never`（只用 ptitle 或无后缀）
   - 分 P 有独立标题时可选用 `{ptitle}`：`{title} [P{p} {ptitle}] [{bvid}]`
   - 多 P 也可选择归到子目录（`output.groupMultiP: false` 默认关闭；开启时为 `{title}/{title} [P{p}].mp4`）
   - **同名同目录四件套**：弹幕 `.ass/.srt`、封面 `.jpg`、metadata `.meta.json`（+ 可选 `.nfo`）**强制与视频文件名完全一致**，仅扩展名不同；`build-index` 与 `linkMode` 复制/硬链接时整组一起处理

### 4.4 任务库与断点续传
- 权威状态库 `outputs/.state/tasks.json`（每个任务一条完整记录，§5.2）；`db.json` 只做 `bvid_cid → taskId` 索引
- 原子写：写 `.tmp` → `rename`；**500ms 节流 + 关键节点强制 flush**（任务开始/阶段切换/完成/失败/退出）
- 恢复流程（启动时 `taskStore.recover()`）：
  1. 读 `tasks.json`；2. 扫盘校验每个未完成任务的临时文件与已完成分片；3. `downloading` → 续传剩余分片；`muxing` → 清理残留后重跑转码；`queued` → 直接排队；`failed` → 保留等待重试
- `bili status` 打印进度概览；`bili repair [--failed|--need-mux]` 补偿

### 4.5 并发与流水线细则

```
                 ┌──────────── 限流器(全局9 req, 800ms±30%) ────────────┐
Plan(1) ─► DownloadQueue(max 3 任务 × 每流 ≤3 分片线程) ─┐             │
                                                        ├─► 同一限流器 │
                                        MuxQueue(max 3 ffmpeg) ───────┘
                                                        │
                                            Finalize(弹幕/封面/落库, 串行)
```

- **两个队列独立计数、流水线重叠**：下载任务完成即刻交棒转码队列，下载槽立刻给下一个任务；典型稳态 = 3 个在下载 + 3 个在转码
- **背压**：`muxQueue` 待处理临时文件超过 `maxPendingGB`(5GB) 时暂停拉取新下载任务；磁盘剩余 < `minFreeDiskGB`(5GB) 时全局暂停并推 `disk.warn` 到网页
- **公平性**：同一任务的多个分片按「最慢分片优先补线程」动态调整；`maxStreamsPerTask` 在 3 个任务同时跑时自动降为 2（3×2=6 < 9）以避免单任务饿死
- **CPU 与 IO 隔离**：ffmpeg `-threads min(3, cpu-1)`，下载线程只做网络 IO + 写盘，不参与解码

### 4.6 事件协议（网页 ↔ 引擎）

```ts
type ServerEvent =
  | { t:'task.update', id, status, stage, progress:number, speedBps:number, etaSec:number }
  | { t:'task.add', task:TaskSummary }
  | { t:'task.error', id, code, message, retryCount }
  | { t:'queue.stats', downloading:number, muxing:number, pending:number, done:number }
  | { t:'log.append', level, ts, msg }
  | { t:'auth.expired' } | { t:'disk.warn', freeGB:number } | { t:'config.updated', config };
```
- WebSocket 为主通道，断线走 SSE 兜底；前端断线自动重连并重拉 `/api/tasks` 全量快照，保证进度不丢。

---

## 5. 数据模型（`src/types`）

### 5.1 `outputs/index.json`
```ts
interface LibraryIndex {
  version: 1;
  generatedAt: number;              // ms
  user: { mid: number; name: string; face?: string };
  folders: FavoriteFolder[];        // 内联收藏夹结构
  videos: VideoMeta[];              // 全量（收藏夹模式）
  ups?: UpChannel[];                // UP 主模式产物
  stats: { total: number; byStatus: Record<string, number>; skipped: SkippedItem[] };
}

interface FavoriteFolder {
  fid: number; mid: number; title: string; dir: string;      // dir 为 outputs 下相对路径
  mediaCount: number; cover?: string; parentId?: number; isCollected: boolean;
}

interface VideoMeta {
  bvid: string; aid: number;
  title: string; desc?: string;
  up: { mid: number; name: string; face?: string };
  pubDate: number;                  // 秒（发布时间）
  favTime: number;                  // 秒（加入收藏时间，UP 模式为 null）
  duration: number;                 // 秒
  cover: string;                    // 远端 URL
  tid?: number; tname?: string;     // 分区
  stat?: { view: number; danmaku: number; like: number; favorite: number; coin: number; share: number; reply: number };
  folders: { fid: number; title: string; page: number }[];   // 所属收藏夹 + 收藏的分 P
  pages: { cid: number; page: number; part: string; duration: number; selected: boolean }[];
  url: string;                      // https://www.bilibili.com/video/{bvid}
  local?: {
    status: 'pending'|'downloading'|'done'|'failed'|'skipped'|'dead';
    dir: string;                    // 相对 outputs 的路径
    video?: string; poster?: string;
    subtitles?: { format: 'ass'|'srt'; file: string }[];
    size?: number; container?: 'mp4'|'mov';
    qualityId?: number; qualityLabel?: string;   // 120 / "4K"
    hdr?: boolean; fps?: number; codec?: string; width?: number; height?: number;
    taskId?: string;                // 关联 tasks.json，便于断点续传定位
    downloadedAt?: number; error?: { code: string; message: string; at: number };
  };
}
```

### 5.2 任务记录 `outputs/.state/tasks.json`（断点续传的唯一依据）

```ts
interface TaskRecord {
  id: string;                       // sha1(bvid+cid+quality+container)，稳定不变
  source: 'favorite' | 'up';
  bvid: string; aid: number; cid: number; page: number; ptitle?: string;
  title: string; up: { mid: number; name: string };
  orderKey: number;                 // favTime 或 pubDate，用于排序
  outDir: string; baseName: string; container: 'mp4' | 'mov';
  stage: 'queued'|'planning'|'downloading'|'muxing'|'finalizing'
       | 'done'|'failed'|'paused'|'dead'|'skipped';
  priority: number;                 // 越大越先；插队 +1000
  streams?: { video: StreamSel; audio?: StreamSel };
  segments?: Segment[];             // m3u8 / 多段 durl 的段级续传
  parts?: Part[];                   // 单流 Range 分片级续传
  progress: { bytesDone: number; bytesTotal: number; speedBps: number; etaSec: number };
  quality?: { want: string; got: string; hdr: boolean; fps: number;
              codec: string; width: number; height: number; degraded: boolean };
  engine: 'native' | 'ytdlp';        // 当前执行引擎
  engineHistory: { engine: 'native'|'ytdlp'; at: number; result: 'failed'|'switched' }[];
  retryCount: number; maxRetry: number;
  error?: { code: string; message: string; at: number };
  engineErrors?: { engine: string; code: string; message: string }[];  // 双引擎都失败时留证
  createdAt: number; updatedAt: number; startedAt?: number; finishedAt?: number;
}

interface StreamSel { qualityId: number; codec: string; url: string;
  backupUrls: string[]; bytes: number; fps: number; hdr: boolean;
  file: string; done: boolean; }

interface Part    { index: number; file: string; start: number; end: number; received: number; }
interface Segment { index: number; url: string; file: string; bytes: number; done: boolean; }
```

**队列 metadata `outputs/.state/queue.json`（§3.15）**

```ts
interface QueueState {
  schema: 'bili-dl/queue@1';
  status: 'running' | 'paused' | 'stopped';
  cursor: number;                       // 已消费序号
  order: string[];                      // 显式顺序（含重排后的位置）
  inflight: string[];                   // 运行中槽位 ≤ maxParallelTasks
  delayed: { id: string; notBefore: number }[];   // 退避延迟队列
  stats: { total: number; done: number; failed: number; skipped: number;
           bytesDone: number; startedAt: number };
  configSnapshot: { maxParallelTasks: number; quality: string; engineMode: string };
  heartbeat: number;                    // 判定上次进程是否异常退出
  updatedAt: number;
}
```

### 5.3 配置项（`config.json`，全部有默认值）
```jsonc
{
  "auth": { "cookieFile": "state/cookies.json", "preferEnv": true },
  "output": {
    "root": "outputs",
    "filenameTemplate": "{title} [P{p}] [{bvid}]",
    "partSuffix": "auto",            // auto(多P才加) | always | never
    "groupMultiP": false,            // true 时多 P 归入 {title}/ 子目录
    "perFolderMetadata": true,       // 每个收藏夹一份 metadata.json
    "sidecarMeta": true,             // ★ 每个视频一份同名 .meta.json
    "nfo": false,                    // 可选：同名 .nfo（Kodi/Jellyfin/Plex）
    "writeContainerTags": true,      // 同时写 mp4/mov 内建 metadata
    "upDirTemplate": "up/{up}({mid})"
  },
  "engines": {
    "mode": "auto",                  // auto | native | ytdlp（auto = 失败自动切换）
    "native": { "enabled": true },
    "ytdlp": {
      "enabled": true,
      "path": null,                  // null = PATH/brew/自动下载
      "autoUpdateCheck": true,       // 每天最多一次
      "concurrentFragments": 3
    },
    "failover": {
      "afterFailures": 2,            // 单任务失败 N 次后切副引擎
      "errorCodes": ["PARSE_PLAYURL","NO_STREAM","HLS_KEY_FAIL",
                     "JOIN_FAIL","RANGE_NOT_SUPPORTED","MUX_FAIL","HTTP_5XX"],
      "systemicWindow": 20,          // 20 个任务内同类错误 ≥3 次 → 批量切换
      "systemicThreshold": 3,
      "cooldownTasks": 5,            // 切换后的冷却任务数
      "backToPrimaryAfter": 10       // 副引擎连续 10 个成功 → 回主引擎
    }
  },
  "scan": { "includeCollectedFolders": false, "resourceOrder": "mtime" },
  "timeout": {
    "connectMs": 10000,          // TCP/TLS 建连
    "headersMs": 15000,          // 首字节
    "idleMs": 20000,             // 流式读取无新字节
    "stallMs": 60000,            // ★ 速率低于阈值持续这么久 → STALL
    "stallSampleWindowMs": 10000,
    "minSpeedBps": 8192,         // 8KB/s；低于此值视为「没在动」
    "stallGraceMs": 15000,       // 建连/切片后的宽限期，不判停滞
    "taskMs": 1800000,           // 单任务总时长上限 30min
    "muxIdleMs": 300000,         // ffmpeg 无进度 5min
    "apiMs": 10000
  },
  "queue": {
    "retryHeadUntil": 1,         // retryCount <= 1 放队首；>=2 放队尾
    "backoffBaseMs": 30000,      // 第 2 次起 30s → 60s → 120s…
    "backoffMaxMs": 600000,      // 退避上限 10min
    "flushIntervalMs": 500,      // 队列 metadata 节流落盘
    "heartbeatMs": 5000,
    "shutdownGraceMs": 10000     // 退出时在途任务 flush 等待上限
  },
  "download": {
    "orderBy": "favTime",            // favTime | pubDate
    "maxParallelTasks": 3,           // 同时下载的任务数，硬上限 3
    "maxStreamsPerTask": 3,          // 单条流的 Range 分片线程，硬上限 3
    "maxGlobalRequests": 9,          // 3 任务 × 3 线程，全局请求池
    "maxSpeed": null,                // 例 "5MB/s"
    "requestIntervalMs": 800,        // ±30% 抖动
    "retry": 3,
    "quality": "best",               // best | 8K | 4K | 1080P | 720P
    "maxResolution": "8K",
    "preferHdr": true,               // 4K HDR / 杜比视界优先
    "preferHighFps": true,           // 同画质取 60fps
    "codec": "auto",                 // auto | avc | hevc | av1
    "audioQuality": "best",          // dolby > flac > 320k
    "fnval": 4048,                   // DASH+HDR+4K+杜比+8K+AV1 全开
    "pages": "all",                  // all(全部P) | collected(只下被收藏的P) | first
    "skipExisting": true,
    "linkMode": "first",             // first | hardlink | copy
    "minFreeDiskGB": 5,
    "timeoutMs": 30000
  },
  "mux": {
    "container": "mp4",              // mp4 | mov（mp4 优先）
    "maxParallel": 3,                // 转码/拼接队列，硬上限 3，与下载并行
    "ffmpegThreads": "auto",         // min(3, cpu-1)
    "strategy": "auto",              // auto | concat-bytes | concat-demuxer | remux
    "forceTranscode": false,         // 仅无法 copy 时手动开启（会重编码）
    "faststart": true,
    "maxPendingGB": 5                // 待转码临时文件背压阈值
  },
  "control": {
    "host": "127.0.0.1",             // 局域网访问需显式 --host + token
    "port": 8765,
    "openBrowser": true,
    "stateFlushMs": 500              // 状态节流落盘间隔
  },
  "danmaku": {
    "enabled": true,
    "formats": ["ass"],              // ["ass"] | ["srt"] | ["ass","srt"]
    "scrollDuration": 8,
    "maxPerScreen": 40,
    "fontFamily": "Microsoft YaHei",
    "fontSizeScale": 1.0,
    "dedup": true
  },
  "cover": { "enabled": true, "original": true },
  "web": { "title": "B站收藏夹本地库", "pageSize": 60, "embedData": false }
}
```

### 5.4 CLI 命令矩阵
```bash
bili login [--qr|--manual|--import <file>]     # 获取并校验登录态
bili whoami                                     # 打印当前登录用户
bili doctor                                     # 环境自检（node/ffmpeg/cookie/磁盘/连通性）
bili scan [--fav 123,456] [--include-collected] # 扫描收藏夹结构 + 导出 index.json
bili download [--order favTime|pubDate] [--folder 名称] [--up mid]
              [--quality best|4K|1080P] [--hdr/--no-hdr] [--container mp4|mov]
              [--tasks 3] [--streams 3] [--speed 5MB/s]
              [--pages all|collected|first] [--engine auto|native|ytdlp]
              [--danmaku ass] [--no-cover] [--no-sidecar-meta] [--nfo]
              [--limit N] [--force] [--dry-run]
bili up <mid|url|昵称> [--since YYYY-MM-DD] [--keyword 关键词]   # 元信息 + 下载
bili web [--port 8765] [--host 0.0.0.0] [--no-open]  # ★ 控制端网页（常驻）
bili build-index                                # 生成 index.html + library.js
bili serve [--port 8765] [--open]               # 仅静态媒体库服务
bili status [--watch]                           # 下载进度概览
bili repair [--failed|--need-mux]               # 补偿重跑
```

> `bili download` 默认也会拉起控制端（除非 `--headless`）；`--headless` 下进度走终端 TUI。

---

## 6. 执行步骤拆解

> 每个阶段都有可验证产出（DoD）。顺序执行，前一阶段验收通过再进入下一阶段。
> 预估为单人开发参考工时。

### 6.0 前置：登录态（用户只需干预一次）与提交规范

**登录态**
1. S1 完成后，用户**只做一次**扫码：`bili login --qr --cookie-file .local/cookies.json`
2. 之后 S2~S11 全部用该凭据自动验证；靠 `refresh_token` 自动续期（§3.16）尽量延长有效期
3. **唯一需要再次干预的场景**：续期也失败 → 队列置 `paused` 并明确提示「登录态失效，请重新扫码」
4. `.local/` 已 gitignore（文件 0600）；日志/报告中的 cookie 一律脱敏

**提交规范（每小节一个 commit，过程可追溯）**
- 格式：`type(scope): 简述`；`type ∈ feat|fix|refactor|perf|test|docs|chore`，`scope ∈ auth|api|core|queue|engine|mux|danmaku|library|server|web|cli`
- 正文记录**本 commit 的 DoD 验证结果**（命令 + 实际输出摘要），便于事后回溯
- 每个执行小节完成即提交；小节内每完成一个可验证子项也可单独提交
- **每个 commit 必须满足**：`npm run lint && npm test` 通过、能编译、`git status` 中不含 `outputs/ state/ .local/ bin/` 及任何凭据文件
- 提交作者：沿用仓库本地 git config（当前为 `pixelcao`）；若后续接入要求企业邮箱的远端，提交时显式传 `GIT_AUTHOR_NAME/EMAIL` 与 `GIT_COMMITTER_NAME/EMAIL`

**预期 commit 清单**

| 阶段 | commit（示例） |
| --- | --- |
| S0 | `chore: 初始化 TS 工程骨架与配置` / `chore: 添加 .gitignore 与目录约定` |
| S1 | `feat(auth): 扫码登录与 cookie 持久化` / `feat(api): WBI 签名与统一请求客户端` |
| S2 | `feat(core): 收藏夹扫描与 index.json 导出` |
| S3 | `feat(core): 最高可用画质选流` / `feat(engine): native 引擎多线程分片下载` |
| S4 | `feat(mux): HLS/分段拼接与转码队列` / `feat(core): 下载-转码流水线交棒` |
| S5 | `feat(danmaku): protobuf 解析与 ass/srt 生成` |
| S6 | `feat(core): 封面与同名 meta.json 侧车` |
| S7 | `feat(queue): 任务队列、可中断恢复与队列 metadata` / `feat(core): 超时与停滞检测` / `feat(engine): yt-dlp 副引擎与失败自动切换` |
| S8 | `feat(core): UP 主模式` |
| S9 | `feat(server): 控制端网页与实时看板` |
| S10 | `feat(library): 媒体库索引页与播放器` |
| S11 | `docs: README 与配置说明` / `fix: 端到端打磨与边界处理` |

### S0 · 工程骨架与基础设施（2h）
1. `npm init` + TypeScript（`tsconfig`：ESM、`strict`）、`tsx` 运行、`vitest` 测试、`eslint`+`prettier`
2. 建立 §2.1 目录骨架、`config.example.json`、`.gitignore`（`outputs/`、`state/`、`node_modules/`）
3. `utils/logger.ts`（pino，同时写 `outputs/.state/logs/`）、`utils/fsx.ts`（原子写、确保目录、安全路径拼接）、`utils/http.ts`（undici，超时/代理/重试骨架）
4. **DoD**：`npx tsx src/cli/index.ts --help` 可运行；`bili doctor` 能打印 Node/ffmpeg/磁盘信息

### S1 · 登录与 API 客户端（4h）
1. `auth/wbi.ts`（mixin key 计算 + 每日缓存）、`auth/fingerprint.ts`（buvid3/b_nut）
2. `auth/qrlogin.ts` 扫码三态轮询；`auth/cookie.ts` 解析/序列化/校验（三种导入方式）
3. `api/client.ts`：统一注入 UA/Referer/Cookie/WBI/限流/重试，统一错误映射（§4.2）
4. `api/nav.ts`
5. **开发期凭据（用户唯一一次干预）**：`auth/refresh.ts` 保存 `refresh_token/refresh_csrf` 并实现自动续期；凭据落 `.local/cookies.json`（0600 + gitignore），日志脱敏
6. **DoD**：`bili login --qr` 扫码成功；`bili whoami` 输出 `用户名(mid)`；`.local/cookies.json` 权限 0600 且 `git check-ignore` 命中；`bili doctor` 显示「登录态有效 / 剩余 N 天」；连续 50 次 nav 请求零 -412

### S2 · 收藏夹扫描与 metadata 导出（4h）
1. `api/favorite.ts`：`list-all` + `resource/list` 分页（含 WBI、`order=mtime`）
2. `core/namer.ts` 名称清洗（先写单测：非法字符/超长/重名/emoji）
3. `core/scanner.ts`：建目录、聚合 bvid↔分P、**按 `pages: all` 展开成任务**（同一稿件多 P 按 page 升序连续排期）、产出 `favorites.json` / `index.json` / 各目录 `metadata.json`
4. 跳过项统计（非 type=2）
5. **DoD**：`bili scan` 后 `outputs/` 下目录数与收藏夹数一致；`jq '.videos|length' outputs/index.json` 等于各收藏夹视频总数；抽查 3 条的 `favTime/pubDate/up` 与网页一致

### S3 · 选流、引擎抽象与多线程下载队列（6h）
1. `api/view.ts`（分 P cid/时长/封面）、`api/playurl.ts`（WBI、`fnval=4048`）
2. `core/quality.ts`：最高可用画质选流（清晰度/HDR/杜比/60fps/编码/音质 + 降级链 + 磁盘保护），单测覆盖「大会员列表」「非大会员列表」「缺失目标档」
3. `core/engines/`：`DownloadEngine` 统一接口（§3.13）+ `native.ts` 主引擎落地：任务并发 ≤3、单流 Range 分片 ≤3、全局请求池与令牌桶限速、分片 `.part{i}` + `{received}` 续传、`backup_url` 切换
4. **DoD**：`--limit 1` 能拿到视频+音频 m4s；日志打印最终 `quality{id,label,hdr,fps,codec}`；人为 kill 进程后重跑显示「续传 from x bytes」而非从头开始

### S4 · 转码/拼接队列 + 流水线（5h）
1. `utils/ffmpeg.ts`：探测系统 ffmpeg → `ffmpeg-static` 自动下载 → 失败提示；`-progress pipe:1` 解析
2. `core/hls.ts`：m3u8 解析（master/media、`#EXT-X-KEY` AES-128、`#EXT-X-MAP` fMP4、`BYTERANGE`、`DISCONTINUITY`）
3. `core/segjoin.ts`：`concat-bytes` → `concat-demuxer` → `remux` 三级降级；`.muxing` 中间产物与原子 rename
4. `core/muxQueue.ts`：并行 ≤3、ffmpeg `-threads` 限制、`maxPendingGB` 背压、与下载队列交棒的 `pipeline.ts`
5. **DoD**：构造 3 类样本（DASH / 多段 durl / 一个加密 m3u8）全部产出单文件 mp4 且 `ffprobe` 显示音视频流齐全、时长正确；稳态观察到「3 下载 + 3 转码」同时跑

### S5 · 弹幕下载与字幕生成（5h）
1. `assets/dm.proto` + `danmaku/protobuf.ts`（protobufjs 解析，单测校验字段）
2. 分段并发拉取 + `dmid` 去重
3. `danmaku/layout.ts` 轨道分配与防重叠（先写单测：10 条同时间弹幕不重叠）
4. `danmaku/ass.ts`（滚动/顶部/底部/颜色/字号/BOM）、`danmaku/srt.ts`
5. 接入下载流程，同名同目录落盘
6. **DoD**：随机抽 1 个视频，`.ass` 在 PotPlayer/IINA 中与画面对齐；弹幕条数与网页数量级一致；`--danmaku srt` 能生成 srt

### S6 · 封面与 metadata 落盘（2.5h）
1. 原图 URL 还原、`Content-Type` → 扩展名、同名落盘
2. **同名 `.meta.json` 侧车**（§3.9）：schema 定义 + 写入 + 可选 `.nfo`；封装时同步写容器 tags 并用 `ffprobe` 校验
3. 下载完成后回写 `index.json` 的 `local` 字段（状态/路径/大小/分辨率/时间）
4. **DoD**：`outputs/{folder}/` 下每完成一个视频都有同名四件套（`.mp4/.ass/.jpg/.meta.json`）；`ffprobe -show_entries format_tags` 能看到标题/UP/BV；`index.json` 的 `local.status` 正确

### S7 · 队列、任务库、超时、断点续传与双引擎切换（8h）
1. **`core/queue.ts`**：单一入口 `enqueue()`、`queue.json` metadata（§3.15）、可中断（SIGINT/暂停/停止 + 优雅 flush）、可恢复（`load()` + 一致性校验）、`delayed` 退避队列
2. **重试排队规则**：首次失败 → **队首**；第 2 次及以上 → **队尾** + `min(30s×2^(n-1), 10min)` 退避；引擎切换/手动重试 → 队首；同 `taskId` 幂等入队
3. `core/taskStore.ts`：`tasks.json` 结构、稳定 `taskId`、节流原子落盘、`recover()` 恢复流程（§4.4）
4. `core/scheduler.ts`：全局排序队列（`favTime`/`pubDate` 倒序）、优先级与插队、多收藏夹归属策略
5. **`core/watchdog.ts`**：多级超时（连接/首字节/读空闲/速率停滞/任务总时长/转码停滞/API）+ 宽限豁免 + STALL 三级响应（§3.14）
6. **`core/engines/ytdlp.ts` 副引擎 + `core/engines/index.ts` 切换策略**：yt-dlp 自动获取/版本检查、参数映射、`-f` 表达式、cookie 临时文件、进度解析、产物一致性校验
7. **Failover**：失败计数 / 错误码命中 / 系统性故障批量切换 / 冷却与回主；看板显示引擎徽标与 `engineHistory`
8. `core/reporter.ts`：终端汇总 + 失败清单；`bili status [--watch]` / `bili repair [--failed|--need-mux] [--engine ytdlp]`
9. **DoD**：① 30+ 视频收藏夹全量跑通、顺序从新到旧、失败率 0；② `kill -9` 后重启从原阶段继续（分片/段/转码分别验证），二次运行全 `skip`；③ **Ctrl-C 优雅中断后 `--resume` 队列顺序不丢失**；④ mock 失败验证「第 1 次重试在队首、第 2 次在队尾且带退避」；⑤ 断网/`--speed 1B/s` 模拟无速度，验证 60s 内触发 STALL 并按三级响应处理；⑥ 人为让主引擎失败（mock `NO_STREAM`）验证自动切 yt-dlp 并成功产出

### S8 · UP 主模式（2.5h）
1. `api/space.ts`：`acc/info` + `wbi/arc/search` 分页 + 昵称搜索
2. UP 目录建立、`up/{名}({mid})/metadata.json`
3. 复用 S3~S7 管线，`orderBy` 固定 `pubDate`
4. 过滤参数：`--since/--keyword/--min-duration/--limit`
5. **DoD**：`bili up <mid> --limit 3` 产出 3 个按发布时间倒序的完整视频（含弹幕封面）

### S9 · 控制端网页（6h）
1. `server/http.ts` + `server/ws.ts` + `server/routes.ts`：REST 控制接口 + WebSocket 事件推送（§4.6）
2. `server/events.ts`：`EventBus` 订阅引擎内部事件（任务/队列/日志/风控/磁盘）
3. `web/control.html` + `control.js`：总览条、任务表（含 `4K/HDR/60fps` 徽标、分片进度、**引擎徽标 native/ytdlp 与切换次数**）、任务级控制（含「改用副引擎重下」按钮）、全局控制、热改配置（含 `engines.mode`）、扫码登录区、日志 tail
4. `bili web` 命令 + `--host/--port/--no-open` + token；默认仅 `127.0.0.1`
5. **DoD**：`bili web` 打开后进度实时刷新（<1s 延迟）；暂停/继续/取消/插队即时生效；改并发数立刻生效；页面上看得到「下载 x/3、转码 y/3」

### S10 · 媒体库索引页与播放器（6h）
1. `library/scanLibrary.ts`：扫描 outputs → `library.js`（跳过 `.state/.part/.m4s`，识别同名 ass/srt/jpg/png）
2. `web/template.html` + `app.js` + `style.css`（构建时内联进单文件 `index.html`）
3. 功能：收藏夹/UP 筛选、搜索、排序、网格/列表、统计条、缺失灰显
4. 播放器：`<video>` + `<track>` + poster + 倍速/画中画/全屏 + 快捷键 + 分 P 切换 + 元信息面板 + 复制路径
5. `bili serve`（Node 静态服务，Range 支持，`--open`）
6. **DoD**：`bili build-index && bili serve` 后浏览器可浏览全部视频、点击可播、字幕可选；双击 `outputs/index.html` 走 `file://` 也能出列表

### S11 · 打磨与文档（3h）
1. `README.md`：安装、`brew install ffmpeg`、快速开始、常见问题、配置说明
2. 边界处理：磁盘不足预警、超长标题、空收藏夹、cookie 过期交互提示
3. 性能：1000+ 条目的索引分页/虚拟滚动；扫描增量更新（只拉新增）
4. 最终端到端验收（§7）

**合计约 54h**，建议节奏：S0→S2 打通「登录+扫描」；S3→S4 打通「选流+下载+转码流水线」；S5→S7 打通「弹幕封面+metadata+队列超时续传+双引擎切换」；S8→S10 打通「UP 模式 + 控制端 + 索引页」；S11 收尾。每小节结束即 commit（§6.0）。

---

## 7. 验收标准（端到端）

1. `bili login --qr` 30 秒内完成登录，`bili whoami` 正确。
2. `bili scan` 在 `outputs/` 生成与收藏夹一一对应的目录，`outputs/index.json` 覆盖全部收藏视频，字段完整率 100%（除可选字段）。
3. `bili download` 按收藏时间倒序；抽查前 5 个视频的 `favTime` 单调不增。
4. **画质**：大会员账号下 4K 源能被识别并落到 4K/HDR/60fps 档（`ffprobe` 验证分辨率、帧率、色彩空间）；无权益时自动降级且任务标记 `degraded`。
5. 每个完成视频同目录存在**同名四件套** `.mp4` / `.ass` / `.jpg` / `.meta.json`；视频可播、弹幕时间轴对齐、封面可显示；`ffprobe` 能读到容器 tags；`build-index` 优先读 `.meta.json` 还原条目。
5b. **多 P 稿件**：一个 5P 的收藏视频产出 5 个文件，文件名依次带 `[P1]…[P5]`，每个都有各自的弹幕/封面/metadata；索引页按 `groupId` 聚合并可下拉切 P。
6. **分段源**：构造 DASH / 多段 durl / 加密 m3u8 三个样本，均能产出**单个** mp4（或配置的 mov）且时长、音轨正确，无重编码（除非显式开启）。
7. **并发**：稳态为「下载 ≤3 任务 + 转码 ≤3 作业」并行；单任务内分片 ≤3；全程无 -412。
8. **断点续传**：`kill -9` 后重启，任务从原阶段继续（分片/段/转码三级分别验证）；二次运行全 `skip`；`bili repair` 能补齐失败项。
9. `bili up <mid>` 按发布时间倒序下载，产物结构同上。
10. `bili web`：进度 <1s 延迟刷新，暂停/继续/取消/插队/热改并发即时生效；`bili build-index` + `bili serve` 后索引数量 = 本地视频数，筛选/搜索/排序/播放可用。
11. **双引擎**：mock 主引擎 `NO_STREAM` 失败 → 自动切 yt-dlp 并产出符合同一契约的产物（同名四件套 + 容器 tags + 落库）；`--engine ytdlp` 全程只走副引擎也成功；yt-dlp 缺失时自动降级为主引擎并在看板提示。
12. **超时**：`--speed 1B/s` 或直接断网，任务在 `stallMs` 内被判 STALL 并按三级响应处理（重连 → 重建会话 → 切引擎），控制端能看到「停滞 N s」提示；限速到极低时不误判。
13. **队列**：Ctrl-C 中断后 `--resume` 队列顺序与游标不丢；`kill -9` 后 `heartbeat` 判定异常退出并正确恢复；第 1 次失败任务出现在队首、第 2 次出现在队尾且带退避延迟；`queue.json` 与 `tasks.json` 一致性校验能修正孤儿任务。
14. **开发期登录态**：除首次扫码外无人工干预；`refresh_token` 续期可用；`.local/` 被 gitignore、日志中无明文 cookie。

---

## 8. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| B 站接口/WBI 规则变更 | 扫描或下载失效 | API 全部收敛在 `src/api`，附「契约快照测试」（保存真实响应样本）；失效时只改一层 |
| 风控 -352/-412 | 批量被封、限速 | 限速 + 抖动、buvid 轮换、低并发、失败冷却；提供 `--slow` 极稳模式 |
| ffmpeg 缺失 | 无法合流 | 优先系统 ffmpeg，其次自动下载 `ffmpeg-static`；保底保留分片 + `bili repair` 只跑转码 |
| 大会员/地区限制内容 | 下不到 | 自动降级清晰度，标记 `degraded`；不尝试绕过鉴权 |
| ffmpeg 并发抢占 CPU | 下载变慢/界面卡 | `mux.maxParallel=3` + `ffmpegThreads=min(3,cpu-1)`；转码与下载 IO 分离；可一键降到 1 |
| HDR/杜比/HEVC 兼容性 | 播放器放不出/偏色 | 默认 mp4 + 正确色彩元数据（`bt2020/smpte2084`）；提供 `--no-hdr` 与 `--codec avc` 回退 |
| m3u8 加密 key 取不到 | 拼接失败 | key 请求带 Referer 重试 3 次；失败记 `failed(code:KEY_FETCH)`，不产出损坏文件 |
| 状态文件损坏/写入中断 | 进度丢失 | 原子写 `.tmp`→rename + 保留 `tasks.bak.json`（上一版）；`recover()` 以扫盘结果为准校验 |
| 临时文件堆积占磁盘 | 磁盘写满 | `maxPendingGB` 背压 + `minFreeDiskGB` 暂停 + 启动/退出时清理孤儿 `.part/.muxing` |
| 文件名非法/超长/重名 | 写盘失败 | `namer.ts` 统一清洗 + 单测；重名自动加后缀 |
| yt-dlp 下载失败/版本过旧 | 副引擎不可用 | 多级获取（PATH/brew/自动下载）+ 版本锁与日检；不可用则降级纯主引擎并在看板提示 |
| 两引擎产物不一致（命名/容器/tags） | 索引错乱 | 引擎只产出裸媒体文件，**命名/侧车/落库全在引擎外统一执行**；完成后 `ffprobe` 校验 |
| 切换引擎导致重复下载 | 流量浪费 | 仅在错误码命中时切换；切换前记录 `engineHistory`，同一任务对同一引擎最多切 1 次 |
| 多 P 稿件任务量翻倍 | 磁盘/时间超预期 | 扫描阶段预估总大小并提示；`--pages collected` 可只下被收藏的 P；控制端可批量取消 |
| 磁盘占满 | 下载中断 | 启动前与每任务前检查剩余空间，低于阈值暂停并提示 |
| 数据量巨大（数千条） | 索引页卡顿 | `library.js` 分片/分页 + 虚拟滚动；扫描增量 |
| 合规 | 法律风险 | README 明确「个人离线备份、禁止分发」；默认不上传任何数据、不外发统计 |
| Stall 误判（慢速但正常的网络） | 正常任务被反复重试 | 宽限期 + 阈值随用户限速自适应 + 暂停/休眠不计时；连续误判时自动放宽 `minSpeedBps` |
| 队列 metadata 与任务库不一致 | 顺序错乱/任务丢失 | 启动时双向校验（孤儿清理 + 缺失补全）；保留 `queue.bak.json`；校验失败可 `--restart` 按 `orderKey` 重建 |
| 测试账号登录态过期 | 开发被迫中断 | `refresh_token` 自动续期（12h 一次）；离线 fixtures 覆盖大部分测试；真需扫码时只在终端提示一次 |
| 凭据误提交 | 安全事故 | `.gitignore` 强制忽略 `.local/ state/ outputs/ bin/`；提交前脚本 `scripts/pre-commit-check` 扫描敏感字段（`SESSDATA`/`bili_jct`）并阻断 |

---

## 9. 待定项（可在 S0 前确认，不阻塞开工）

1. 默认清晰度：`best`（账号能给的最高，大会员即 4K/HDR/60fps）。是否需要一个「体积上限」策略（单文件 > N GB 自动降一档）？
2. 默认容器：`mp4`（兼容性最好）。HDR/杜比场景是否要默认切 `mov`？
3. 同一视频属于多个收藏夹：默认只落在主收藏夹目录（索引里多分类可见），是否需要硬链接多份？
4. 弹幕默认只出 `.ass` 还是 `.ass` + `.srt` 各一份？
5. 多分 P 视频：**默认全部下载（`pages: all`）并用 `[P{n}]` 后缀区分**（已定）；是否要把多 P 收进 `{标题}/` 子目录（默认关闭，平铺）？
6. 副引擎 yt-dlp 是否默认开启自动下载二进制（约 30MB）？还是只使用系统已装版本（默认：PATH → brew → 自动下载）？

> 以上均已给出默认值（best / mp4 / first / 仅 ass / all P + `[P{n}]` / 双引擎 auto；下载与转码并行度均为 3），可直接开工，后续改配置即可。
