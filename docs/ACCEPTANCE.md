# 端到端验收报告（PLAN §7）

验收时间：2026-10-15 · 账号：大会员 · 机器：macOS / Node 24
验收用临时目录：`/Volumes/Lenovo 1TB/e2e`（与主 `outputs` 隔离，验收后清理）

## 结论总览

| # | 验收项 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 扫码登录 + `whoami` | ✅ | 控制端登录态显示「二葱Pulsar / 大会员 / LV6」；页面内扫码（`/api/login/qr` + PNG + 轮询）已接通 |
| 2 | 扫描目录与 index.json 覆盖 | ✅ | `bili scan --fav 316457943` → 14 个视频、1 个目录、跳过失效 5 |
| 3 | 收藏时间倒序 | ✅ | `download` 默认 `orderBy=favTime`，日志顺序与收藏时间一致 |
| 4 | 画质（4K/HDR/60fps） | ✅ | `仅5L容积…[BV1NSptzAEZf]` → 4K 3840x2160 59.94fps hevc；`社交的手腕` → 1080P60；非大会员降级有单测覆盖 |
| 5 | 同名五件套 + 容器 tags | ✅ | `空中浩劫/` 下每个视频 `.mp4/.ass/.srt/.jpg/.meta.json` 齐全；`ffprobe` 读到 `title/artist/date/comment=BV1NSptzAEZf P1` |
| 5b | 多 P 稿件 | ✅ | `国家地理.空中浩劫…第18季 [P1] [BV1Eb411J722].mp4`（P 后缀规则生效） |
| 6 | 分段源（DASH / 多段 durl / 加密 m3u8） | ⚠️ 部分 | DASH（本轮全部样本）✅；多段 durl 与加密 m3u8 暂无样本，代码路径未实测 |
| 7 | 并发 ≤3 + ≤3 且无 -412 | ✅ | 控制端显示「下载 0/3 · 转码 0/3」；全程未出现 -412/-352 |
| 8 | 断点续传（三级） | ✅ | `kill -9` 中断后重跑：4 个完成、2 个跳过、0 失败，62MB 分片被复用；二次运行全 `skip`；`.muxing` 残留由转码级恢复 |
| 9 | UP 主模式 | ✅ | `bili up 946974 --limit 1` → `up/影视飓风(946974)/…（4K 3840x2160 hevc）` |
| 10 | 控制端网页 + 媒体库 | ✅ | 实时刷新 <1s（SSE）、暂停/继续/取消/重试/插队/副引擎重下即时生效；媒体库 257 条 + 列表视图 + 删除标记 |
| 11 | 双引擎 | ⚠️ 部分 | 启动自检「主 native ✓，副 yt-dlp ✓」；failover 自动切换未做 mock 实测 |
| 12 | 超时/停滞 | ⚠️ 部分 | Watchdog 与三级响应已实现；60s STALL 需限速环境，未做计时实测 |
| 13 | 队列可中断可恢复 | ✅ | SIGINT → `status=paused / cursor=9 / order=14` 完整保留，在途 3 个落盘后续跑；`done` 不再被重规划冲回 `queued`（本次修复） |
| 14 | 登录态续期 | ❌ | `refresh_token` 续期未实现（README 已知限制）；已提供页面内扫码替代 |

## 关键命令与实测输出

**扫描**

```
$ npm run bili -- scan --fav 316457943 --out "/Volumes/Lenovo 1TB/e2e"
收藏夹「空中浩劫」：14 个视频
扫描完成：14 个视频，1 个目录（全量；已跳过 非视频 0 / 失效 5）
```

**下载（limit 2，首次）**

```
规划出 2 个任务（来自 14 个稿件）
引擎：主 native ✓，副 yt-dlp ✓
✔ 仅5L容积，史上最小5090 ITX核弹机箱 [BV1NSptzAEZf]（4K 3840x2160 59.94fps hevc）
✔ 社交的手腕 [BV17DKqzvEfH]（1080P60 1080x1920 60.001fps hevc）
完成 2 个，失败 0 个，跳过 0 个，用时 6.0s
```

**幂等（二次运行）**

```
完成 0 个，失败 0 个，跳过 2 个，用时 0.0s
```

**kill -9 续传**

```
$ pkill -9 -f "download --limit 6"     # 下载中途强杀，.cache 残留 62M
$ npm run bili -- download --limit 6 …
完成 4 个，失败 0 个，跳过 2 个，用时 28.3s
# 分片复用完成，缓存自动回收到 24K
```

**Ctrl-C 优雅中断 → 队列顺序不丢**

```
queue.json: status=paused  cursor=9  order=14  inflight=3
stats: {"total":14,"done":6,"failed":0,"skipped":4,"bytesDone":523959891}
```

**修复：重规划不再冲掉已完成状态**

```
修复前：stage 分布 {"queued":11,"done":1,"downloading":2}   ← 6 个已完成的被冲回 queued
修复后：完成 8 个，失败 0 个，跳过 6 个 → {"skipped":6,"done":8}
```

**UP 主模式**

```
$ npm run bili -- up 946974 --limit 1 --out "/Volumes/Lenovo 1TB/e2e"
✔ 让百万人尖叫的鬼屋？我们发现了这里的秘密…… [BV1KiJk67Ezw].mp4（3840x2160，873s）
完成 9，失败 0，跳过 6
```

## 自动化门禁

- `npm run lint`：通过
- `npm test`：22 个通过（namer / quality 契约 / cache / deleted / scanner / static）
- `npm run check:secret`：无敏感字段

## 未完成项与后续建议

1. **多段 durl / 加密 m3u8 样本**：需构造样本跑一次 `hls.ts` + `segjoin.ts` 降级链。
2. **STALL 实测**：用 `--speed` 极低限速或断网，验证 60s 内触发并按「重连 → 重建会话 → 切引擎」三级响应。
3. **双引擎 failover 实测**：mock 主引擎 `NO_STREAM`，验证自动切 yt-dlp 且产物符合同一契约。
4. **登录态续期**：实现 `refresh_token` 自动续期，消除唯一的「需要人工再次扫码」。
