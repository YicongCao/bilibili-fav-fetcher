/** 控制端页面（单文件，iOS 风格：毛玻璃 + 大圆角 + 分段控件 + 胶囊按钮） */
export function renderControlPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>bili 下载控制端</title>
<style>
  :root {
    color-scheme: dark;
    /* iOS 语义色（dark） */
    --bg:#000; --bg-group:#0b0b0d;
    --surface:rgba(28,28,30,.72); --surface-solid:#1c1c1e; --surface-2:#2c2c2e; --surface-3:#3a3a3c;
    --sep:rgba(84,84,88,.55);
    --label:#fff; --label-2:rgba(235,235,245,.62); --label-3:rgba(235,235,245,.34);
    --blue:#0a84ff; --green:#30d158; --orange:#ff9f0a; --red:#ff453a; --purple:#bf5af2; --indigo:#5e5ce6;
    --r-lg:20px; --r-md:14px; --r-sm:10px;
    --ease:cubic-bezier(.25,.1,.25,1);
  }
  * { box-sizing:border-box; }
  html, body { height:100%; }
  body {
    margin:0; background:
      radial-gradient(1200px 600px at 12% -10%, rgba(10,132,255,.16), transparent 60%),
      radial-gradient(900px 500px at 100% 0%, rgba(191,90,242,.13), transparent 55%),
      var(--bg);
    color:var(--label);
    font:14px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","PingFang SC",sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  h1,h2,h3 { margin:0; font-weight:600; letter-spacing:.01em; }
  /* ---------- 毛玻璃顶栏 ---------- */
  header {
    position:sticky; top:0; z-index:20;
    display:flex; align-items:center; gap:14px; flex-wrap:wrap;
    padding:14px 22px;
    background:rgba(12,12,14,.72);
    backdrop-filter:saturate(180%) blur(20px); -webkit-backdrop-filter:saturate(180%) blur(20px);
    border-bottom:1px solid var(--sep);
  }
  .brand { display:flex; align-items:center; gap:10px; }
  .brand .dot { width:10px; height:10px; border-radius:50%; background:var(--green); box-shadow:0 0 10px rgba(48,209,88,.7); }
  .brand h1 { font-size:16px; }
  .pill {
    display:inline-flex; align-items:center; gap:6px;
    padding:4px 12px; border-radius:999px; font-size:12px; font-weight:500;
    background:var(--surface-2); color:var(--label-2); border:1px solid var(--sep);
  }
  .pill b { color:var(--label); font-weight:600; }
  .pill.running { background:rgba(48,209,88,.16); color:var(--green); border-color:rgba(48,209,88,.35); }
  .pill.paused  { background:rgba(255,159,10,.16); color:var(--orange); border-color:rgba(255,159,10,.35); }
  .pill.warn    { background:rgba(255,69,58,.16); color:#ff8b84; border-color:rgba(255,69,58,.35); }
  #alerts { padding:0 22px; }
  #alerts:not(:empty) { padding-top:12px; }
  .alertbar {
    display:flex; align-items:center; gap:10px; margin-bottom:8px;
    padding:10px 14px; border-radius:var(--r-md); font-size:13px;
    background:rgba(255,159,10,.14); border:1px solid rgba(255,159,10,.35); color:#ffd08a;
  }
  .alertbar.error { background:rgba(255,69,58,.14); border-color:rgba(255,69,58,.4); color:#ff8b84; }
  .alertbar .x { margin-left:auto; background:transparent; border:0; color:inherit; padding:2px 8px; }
  .spacer { flex:1; }
  /* ---------- 按钮：胶囊三级 ---------- */
  button {
    font:inherit; font-size:13px; font-weight:500; cursor:pointer;
    padding:7px 14px; border-radius:999px;
    border:1px solid transparent; background:var(--surface-2); color:var(--label);
    transition:transform .18s var(--ease), background .18s var(--ease), opacity .18s var(--ease);
  }
  button:hover { background:var(--surface-3); }
  button:active { transform:scale(.96); }
  button:disabled { opacity:.45; cursor:default; transform:none; }
  button.filled { background:var(--blue); color:#fff; }
  button.filled:hover { background:#3d9bff; }
  button.tinted { background:rgba(10,132,255,.18); color:#8fc6ff; border-color:rgba(10,132,255,.35); }
  button.tinted:hover { background:rgba(10,132,255,.28); }
  button.danger { background:rgba(255,69,58,.18); color:#ff8b84; border-color:rgba(255,69,58,.35); }
  button.tiny { font-size:12px; padding:4px 10px; }
  a { text-decoration:none; color:inherit; }
  /* ---------- 小组件网格 ---------- */
  .dash { padding:18px 22px 0; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; }
  .card {
    position:relative; overflow:hidden;
    background:var(--surface); border:1px solid var(--sep); border-radius:var(--r-lg);
    padding:14px 16px;
    backdrop-filter:blur(20px) saturate(180%); -webkit-backdrop-filter:blur(20px) saturate(180%);
    box-shadow:0 8px 24px rgba(0,0,0,.28);
    transition:transform .2s var(--ease), border-color .2s var(--ease);
  }
  .card:hover { transform:translateY(-2px); border-color:rgba(10,132,255,.4); }
  .card .k { color:var(--label-2); font-size:12px; letter-spacing:.02em; }
  .card .v { font-size:26px; font-weight:600; margin-top:4px; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
  .card .v.small { font-size:19px; }
  .card .s { color:var(--label-3); font-size:11px; margin-top:3px; }
  .card.accent::after {
    content:''; position:absolute; inset:0; border-radius:var(--r-lg); pointer-events:none;
    background:linear-gradient(180deg, rgba(10,132,255,.10), transparent 55%);
  }
  /* ---------- 操作区 / 进度条 ---------- */
  .dash-actions { display:flex; gap:10px; align-items:center; margin-top:14px; flex-wrap:wrap; }
  .dash-actions .muted { color:var(--label-3); font-size:12px; }
  .usage { margin-top:12px; display:flex; align-items:center; gap:12px; font-size:12px; color:var(--label-2); }
  .bar { height:5px; background:var(--surface-3); border-radius:999px; overflow:hidden; min-width:90px; flex:1; }
  .bar > i { display:block; height:100%; background:linear-gradient(90deg,#0a84ff,#5e5ce6); border-radius:999px; transition:width .35s var(--ease); }
  .bar > i.over { background:linear-gradient(90deg,#ff453a,#ff9f0a); }
  .bar > i.near { background:linear-gradient(90deg,#ff9f0a,#ffd60a); }
  /* ---------- 主体 ---------- */
  main { padding:18px 22px 28px; display:grid; grid-template-columns: 1fr 340px; gap:16px; align-items:start; }
  .panel {
    background:var(--surface); border:1px solid var(--sep); border-radius:var(--r-lg);
    padding:14px 16px;
    backdrop-filter:blur(20px) saturate(180%); -webkit-backdrop-filter:blur(20px) saturate(180%);
    box-shadow:0 8px 24px rgba(0,0,0,.24);
  }
  .panel + .panel { margin-top:14px; }
  .panel > h2 { font-size:13px; color:var(--label); margin-bottom:10px; }
  aside { display:flex; flex-direction:column; gap:14px; }
  aside .panel { margin-top:0; }
  /* ---------- 分段控件 ---------- */
  .seg { display:flex; position:relative; background:var(--surface-2); border-radius:11px; padding:2px; gap:2px; }
  .seg button {
    flex:1; border:0; background:transparent; color:var(--label-2); border-radius:9px;
    padding:6px 10px; font-size:13px; font-weight:500;
  }
  .seg button.active { background:var(--surface-3); color:var(--label); box-shadow:0 1px 3px rgba(0,0,0,.3); }
  /* ---------- iOS 列表 ---------- */
  .list { border-radius:var(--r-md); overflow:hidden; border:1px solid var(--sep); }
  .list-head {
    display:grid; grid-template-columns: minmax(0,1fr) 132px 84px 120px 96px 132px;
    gap:10px; padding:8px 12px; font-size:11px; color:var(--label-3);
    background:var(--surface-2); border-bottom:1px solid var(--sep);
  }
  .row {
    display:grid; grid-template-columns: minmax(0,1fr) 132px 84px 120px 96px 132px;
    gap:10px; align-items:center; padding:10px 12px;
    border-bottom:1px solid var(--sep); transition:background .18s var(--ease);
  }
  .row:last-child { border-bottom:0; }
  .row:hover { background:rgba(255,255,255,.035); }
  .tcell { display:flex; align-items:center; gap:10px; min-width:0; }
  .tcell .thumb { width:56px; height:32px; border-radius:6px; object-fit:cover; background:var(--surface-2); flex:none; }
  .row .name { font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .row .err { color:#ff8b84; font-size:11px; margin-top:2px; }
  .cell-num, .speed { font-variant-numeric:tabular-nums; white-space:nowrap; }
  .badge { font-size:11px; padding:2px 7px; border-radius:999px; background:var(--surface-3); color:var(--label-2); margin:0 4px 4px 0; display:inline-block; }
  .badge.hdr { background:rgba(255,159,10,.18); color:var(--orange); }
  .badge.ytdlp { background:rgba(191,90,242,.18); color:#d8a7ff; }
  .stage { font-size:11px; padding:2px 8px; border-radius:999px; background:var(--surface-3); color:var(--label-2); }
  .stage.done { background:rgba(48,209,88,.16); color:var(--green); }
  .stage.failed { background:rgba(255,69,58,.16); color:#ff8b84; }
  .stage.downloading { background:rgba(10,132,255,.18); color:#8fc6ff; }
  .stage.muxing { background:rgba(94,92,230,.18); color:#a8a5ff; }
  .row-actions { display:flex; gap:6px; justify-content:flex-end; }
  .pct { font-size:11px; color:var(--label-3); margin-top:4px; font-variant-numeric:tabular-nums; }
  /* ---------- 表单 ---------- */
  label { color:var(--label-2); font-size:12px; display:block; margin:12px 0 5px; }
  input, select {
    font:inherit; font-size:13px; width:100%;
    background:var(--surface-2); color:var(--label);
    border:1px solid var(--sep); border-radius:var(--r-sm); padding:8px 10px;
    transition:border-color .18s var(--ease);
  }
  input:focus, select:focus { outline:none; border-color:var(--blue); }
  ::placeholder { color:var(--label-3); }
  .field { display:flex; gap:10px; }
  .field > * { flex:1; }
  .btn-row { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }
  .hint { font-size:12px; color:var(--label-2); margin-top:10px; min-height:16px; }
  /* ---------- 日志 ---------- */
  #logs {
    height:300px; overflow:auto; border-radius:var(--r-md); background:#000; border:1px solid var(--sep);
    padding:10px 12px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px;
    white-space:pre-wrap; color:var(--label-2); line-height:1.6;
  }
  /* ---------- Toast / 确认框 ---------- */
  #toast {
    position:fixed; left:50%; bottom:28px; transform:translate(-50%, 20px);
    background:rgba(44,44,46,.92); color:var(--label); border:1px solid var(--sep);
    padding:11px 18px; border-radius:999px; font-size:13px; z-index:99;
    backdrop-filter:blur(20px); opacity:0; pointer-events:none;
    transition:opacity .22s var(--ease), transform .22s var(--ease);
    box-shadow:0 10px 30px rgba(0,0,0,.4);
  }
  #toast.show { opacity:1; transform:translate(-50%, 0); }
  #sheet { border:0; padding:0; background:transparent; max-width:420px; width:92vw; }
  #sheet::backdrop { background:rgba(0,0,0,.55); backdrop-filter:blur(2px); }
  .alert {
    background:rgba(44,44,46,.92); backdrop-filter:blur(24px); border-radius:var(--r-lg);
    border:1px solid var(--sep); overflow:hidden; text-align:center;
    animation:pop .22s var(--ease);
  }
  @keyframes pop { from { transform:scale(.94); opacity:0; } to { transform:scale(1); opacity:1; } }
  .alert .body { padding:20px 20px 14px; }
  .alert .title { font-size:15px; font-weight:600; }
  .alert .msg { font-size:13px; color:var(--label-2); margin-top:6px; line-height:1.45; }
  .alert .acts { display:flex; border-top:1px solid var(--sep); }
  .alert .acts button {
    flex:1; border-radius:0; background:transparent; border:0; padding:12px; font-size:15px;
    color:#8fc6ff;
  }
  .alert .acts button + button { border-left:1px solid var(--sep); color:var(--label); font-weight:600; }
  .alert .acts button:active { background:rgba(255,255,255,.06); }
  @media (max-width: 1080px) {
    main { grid-template-columns:1fr; }
    .list-head { display:none; }
    .row { grid-template-columns: minmax(0,1fr) 96px; }
  }
</style>
</head>
<body>
<header>
  <div class="brand"><span class="dot"></span><h1>bili 下载控制端</h1></div>
  <span class="pill" id="s-pill">队列 <b id="s-status">-</b></span>
  <span class="pill">剩余 <b id="s-remaining">0</b></span>
  <span class="pill">在途 <b id="s-inflight">0</b></span>
  <span class="pill">完成 <b id="s-done">0</b></span>
  <span class="pill">失败 <b id="s-failed">0</b></span>
  <span class="pill">已下载 <b id="s-bytes">0</b></span>
  <span class="pill" id="s-slots">下载 0/3 · 转码 0/3</span>
  <span class="pill" id="s-eta">ETA -</span>
  <span class="pill warn" id="s-stalled" style="display:none">停滞 <b>0</b></span>
  <span class="spacer"></span>
  <button id="btn-refresh">刷新</button>
</header>
<div id="alerts"></div>

<section class="dash">
  <div class="cards">
    <div class="card accent"><div class="k">任务总数</div><div class="v" id="d-total">-</div><div class="s" id="d-total-sub">排队 / 剩余</div></div>
    <div class="card accent"><div class="k">进行中</div><div class="v" id="d-running">0</div><div class="s" id="d-running-sub">下载 / 转码</div></div>
    <div class="card"><div class="k">已完成</div><div class="v" id="d-done">0</div><div class="s" id="d-done-sub">失败 / 剩余</div></div>
    <div class="card"><div class="k">已下载视频</div><div class="v" id="d-videos">0</div><div class="s" id="d-videos-sub">占用空间</div></div>
    <div class="card"><div class="k">总下载速度</div><div class="v" id="d-speed">0 MB/s</div><div class="s" id="d-speed-sub">实时合计</div></div>
    <div class="card"><div class="k">磁盘剩余</div><div class="v small" id="d-free">-</div><div class="s" id="d-free-sub">所在卷容量</div></div>
    <div class="card"><div class="k">登录态</div><div class="v small" id="d-auth">-</div><div class="s" id="d-auth-sub">会员状态</div></div>
  </div>
  <div class="dash-actions">
    <button id="btn-dl" class="filled">暂停下载</button>
    <button id="btn-mux" class="tinted">暂停转码</button>
    <a href="/library" target="_blank" rel="noreferrer"><button class="tinted">打开媒体库</button></a>
    <button id="btn-clean-cache">清理已完成缓存</button>
    <button id="btn-build-index">重建媒体库</button>
    <button id="btn-export-failed">导出失败清单</button>
    <button id="btn-clear-failed">清空失败队列</button>
    <span class="muted" id="d-root"></span>
  </div>
  <div class="usage">
    <span id="d-usage-text">outputs 占用</span>
    <div class="bar"><i id="d-usage-bar" style="width:0%"></i></div>
  </div>
</section>

<main>
  <section class="panel">
    <h2>任务</h2>
    <div class="field" style="margin-bottom:12px">
      <input id="q" placeholder="搜索标题 / 文件名" />
      <select id="filter" style="max-width:180px">
        <option value="">全部状态</option>
        <option value="downloading">下载中</option>
        <option value="muxing">封装中</option>
        <option value="queued">排队中</option>
        <option value="failed">失败</option>
        <option value="done">完成</option>
      </select>
    </div>
    <div class="list">
      <div class="list-head"><span>任务</span><span>画质</span><span>状态</span><span>进度</span><span>速度</span><span style="text-align:right">操作</span></div>
      <div id="rows"></div>
    </div>
  </section>

  <aside>
    <section class="panel">
      <h2>添加下载</h2>
      <div class="seg">
        <button id="tab-fav" class="active">收藏夹</button>
        <button id="tab-up">UP 主</button>
      </div>
      <div id="pane-fav">
        <label>收藏夹</label>
        <select id="add-folder"><option value="">全部收藏夹</option></select>
        <label>数量上限（留空 = 全部）</label>
        <input id="add-fav-limit" type="number" min="1" placeholder="例如 20" />
        <label>排序</label>
        <select id="add-fav-order">
          <option value="favTime">按收藏时间（新→旧）</option>
          <option value="pubDate">按发布时间（新→旧）</option>
        </select>
        <div class="btn-row">
          <button id="btn-add-fav" class="filled">加入队列</button>
          <button id="btn-scan">刷新收藏夹</button>
        </div>
      </div>
      <div id="pane-up" style="display:none">
        <label>UP 主（mid / 主页链接 / 昵称）</label>
        <input id="add-up-target" placeholder="123456 或 space.bilibili.com/123456" />
        <label>数量上限（留空 = 全部投稿）</label>
        <input id="add-up-limit" type="number" min="1" placeholder="例如 10" />
        <label>标题关键词（可选）</label>
        <input id="add-up-kw" placeholder="留空不过滤" />
        <div class="btn-row"><button id="btn-add-up" class="filled">抓取并加入队列</button></div>
      </div>
      <div class="hint" id="add-msg"></div>
    </section>

    <section class="panel">
      <h2>热改配置</h2>
      <label>并行任务数（1-3）</label>
      <input id="cfg-parallel" type="number" min="1" max="3" />
      <label>限速（如 5MB/s，留空不限）</label>
      <input id="cfg-speed" placeholder="5MB/s" />
      <label>清晰度上限</label>
      <select id="cfg-quality">
        <option value="best">best</option><option value="8K">8K</option><option value="4K">4K</option>
        <option value="1080P">1080P</option><option value="720P">720P</option>
      </select>
      <label>引擎</label>
      <select id="cfg-engine">
        <option value="auto">auto（失败自动切换）</option><option value="native">native</option><option value="ytdlp">ytdlp</option>
      </select>
      <div class="btn-row"><button id="btn-save" class="filled">保存配置</button></div>
    </section>

    <section class="panel">
      <h2>日志</h2>
      <div class="field">
        <select id="log-level">
          <option value="">全部级别</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
        </select>
        <button id="btn-log-dl">下载</button>
      </div>
      <div id="logs" style="margin-top:8px"></div>
    </section>
  </aside>
</main>

<div id="toast"></div>
<dialog id="sheet"><div class="alert">
  <div class="body"><div class="title" id="sheet-title"></div><div class="msg" id="sheet-msg"></div></div>
  <div class="acts"><button id="sheet-cancel">取消</button><button id="sheet-ok">确定</button></div>
</div></dialog>

<script>
const state = { tasks: [], stats: {}, dash: null, logs: [] };
const fmtBytes = (n) => { const u=['B','KB','MB','GB','TB']; let v=n||0,i=0; while(v>=1024&&i<u.length-1){v/=1024;i++;} return v.toFixed(i?1:0)+' '+u[i]; };
const fmtSpeed = (bps) => (bps ? (bps/1048576).toFixed(1)+' MB/s' : '0 MB/s');
const fmtEta = (sec) => {
  if (!sec || sec < 0) return '-';
  const h = Math.floor(sec/3600), m = Math.floor(sec%3600/60), s = Math.floor(sec%60);
  return h ? h+'时'+String(m).padStart(2,'0')+'分' : m+'分'+String(s).padStart(2,'0')+'秒';
};
const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
const hiddenAlerts = new Set();

function renderAlerts(alerts) {
  const box = document.getElementById('alerts');
  const list = (alerts || []).filter(a => !hiddenAlerts.has(a.msg));
  box.innerHTML = list.map(a => '<div class="alertbar ' + (a.level === 'error' ? 'error' : '') + '">' +
    (a.level === 'error' ? '⚠️' : '⚡') + ' ' + escapeHtml(a.msg) +
    '<button class="x" data-msg="' + escapeHtml(a.msg) + '">✕</button></div>').join('');
  box.querySelectorAll('.x').forEach(btn => {
    btn.onclick = () => { hiddenAlerts.add(btn.dataset.msg); renderAlerts(alerts); };
  });
}

let toastTimer = null;
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function confirmSheet(title, msg) {
  return new Promise((resolve) => {
    const dlg = document.getElementById('sheet');
    document.getElementById('sheet-title').textContent = title;
    document.getElementById('sheet-msg').textContent = msg;
    const ok = document.getElementById('sheet-ok'), cancel = document.getElementById('sheet-cancel');
    const done = (v) => { dlg.close(); ok.onclick = cancel.onclick = null; resolve(v); };
    ok.onclick = () => done(true); cancel.onclick = () => done(false);
    dlg.showModal();
  });
}

async function loadDashboard() {
  let d;
  try { d = await (await fetch('/api/dashboard')).json(); } catch { return; }
  state.dash = d;
  const t = d.tasks || {};
  set('d-total', t.total ?? 0);
  set('d-total-sub', '排队 ' + (t.queued ?? 0) + ' · 剩余 ' + (t.remaining ?? 0));
  set('d-running', t.running ?? 0);
  set('d-running-sub', '下载 ' + (t.downloading ?? 0) + ' · 转码 ' + (t.muxing ?? 0));
  set('d-done', t.done ?? 0);
  set('d-done-sub', '失败 ' + (t.failed ?? 0) + ' · 剩余 ' + (t.remaining ?? 0));
  set('d-videos', (d.videos && d.videos.downloaded) ?? 0);
  set('d-videos-sub', '占用 ' + fmtBytes(d.disk ? d.disk.usedBytes : (d.videos ? d.videos.bytesDone : 0)));
  set('d-speed', fmtSpeed(d.speedBps));
  set('d-speed-sub', '本次会话累计 ' + fmtBytes(d.videos ? d.videos.bytesDone : 0));
  set('d-free', d.disk ? fmtBytes(d.disk.freeBytes) : '-');
  set('d-free-sub', d.disk && d.disk.totalBytes ? '容量 ' + fmtBytes(d.disk.totalBytes) : '所在卷容量');

  const a = d.auth || {};
  set('d-auth', a.login ? (a.uname || '已登录') : '未登录');
  set('d-auth-sub', a.login ? ((a.vip || '-') + (a.days != null ? ' · 剩余 ' + a.days + ' 天' : '')) : '执行 bili login 扫码');
  set('d-root', 'outputs：' + (d.root || '-'));

  const disk = d.disk || {};
  const pct = disk.limitBytes ? Math.min(100, Math.round((disk.usedBytes / disk.limitBytes) * 100)) : 0;
  const bar = document.getElementById('d-usage-bar');
  bar.style.width = pct + '%';
  bar.className = disk.limitBytes && disk.usedBytes >= disk.limitBytes ? 'over' : pct >= 90 ? 'near' : '';
  set('d-usage-text', 'outputs 占用 ' + fmtBytes(disk.usedBytes || 0) + (disk.limitBytes ? ' / 上限 ' + fmtBytes(disk.limitBytes) : '（未设上限）') + (disk.cacheBytes ? ' · 缓存 ' + fmtBytes(disk.cacheBytes) : ''));

  // 队列占用 / ETA / 停滞 / 告警
  const slots = (d.queue && d.queue.slots) || {};
  set('s-slots', '下载 ' + ((slots.download && slots.download.used) ?? 0) + '/' + ((slots.download && slots.download.max) ?? 3) +
    ' · 转码 ' + ((slots.mux && slots.mux.used) ?? 0) + '/' + ((slots.mux && slots.mux.max) ?? 3));
  set('s-eta', 'ETA ' + fmtEta(d.etaSec));
  const stallPill = document.getElementById('s-stalled');
  const stalled = (d.tasks && d.tasks.stalled) || 0;
  stallPill.style.display = stalled ? '' : 'none';
  stallPill.innerHTML = '停滞 <b>' + stalled + '</b>';
  renderAlerts(d.alerts);
  // 大数字卡片：速度卡副标题显示整体 ETA
  set('d-speed-sub', d.etaSec ? ('预计还需 ' + fmtEta(d.etaSec) + ' · 本次会话累计 ' + fmtBytes(d.videos ? d.videos.bytesDone : 0)) : ('本次会话累计 ' + fmtBytes(d.videos ? d.videos.bytesDone : 0)));

  const dl = document.getElementById('btn-dl');
  const q = d.queue || {};
  // paused 但还有在飞任务时如实显示，避免「显示继续下载却还在跑」的观感矛盾
  dl.textContent = q.status === 'paused'
    ? (q.inflight > 0 ? '暂停中…（在飞 ' + q.inflight + '）' : '继续下载')
    : '暂停下载';
  dl.className = q.status === 'paused' ? 'tinted' : 'filled';
  dl.disabled = false;
  const mx = document.getElementById('btn-mux');
  mx.textContent = d.mux && d.mux.paused ? '继续转码' : '暂停转码';
}

document.getElementById('btn-dl').onclick = async () => {
  const running = state.dash && state.dash.queue && state.dash.queue.status === 'running';
  await fetch(running ? '/api/queue/pause' : '/api/queue/resume', { method: 'POST' });
  loadDashboard(); loadStats();
};
document.getElementById('btn-mux').onclick = async () => {
  const paused = state.dash && state.dash.mux && state.dash.mux.paused;
  await fetch(paused ? '/api/mux/resume' : '/api/mux/pause', { method: 'POST' });
  loadDashboard();
};
document.getElementById('btn-clean-cache').onclick = async () => {
  const yes = await confirmSheet('清理分片缓存？', '删除已完成 / 已跳过任务遗留的中间分片，未完成任务的分片会保留，不影响续传。');
  if (!yes) return;
  const btn = document.getElementById('btn-clean-cache');
  btn.disabled = true; btn.textContent = '清理中…';
  const res = await (await fetch('/api/cache/clean', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ scope: 'done' }) })).json();
  btn.disabled = false; btn.textContent = '清理已完成缓存';
  toast(res.ok ? '已释放 ' + fmtBytes(res.bytes) + '（' + res.removed + ' 个目录）' : ('清理失败：' + (res.error || '')));
  loadDashboard();
};

// 添加下载：收藏夹 / UP 主两个入口
const msg = (t) => { document.getElementById('add-msg').textContent = t; };
function switchTab(which) {
  document.getElementById('pane-fav').style.display = which === 'fav' ? '' : 'none';
  document.getElementById('pane-up').style.display = which === 'up' ? '' : 'none';
  document.getElementById('tab-fav').className = which === 'fav' ? 'active' : '';
  document.getElementById('tab-up').className = which === 'up' ? 'active' : '';
}
document.getElementById('tab-fav').onclick = () => switchTab('fav');
document.getElementById('tab-up').onclick = () => switchTab('up');

async function loadFolders() {
  const data = await (await fetch('/api/folders')).json();
  const sel = document.getElementById('add-folder');
  const cur = sel.value;
  sel.innerHTML = '<option value="">全部收藏夹</option>' + (data.folders || []).map(f => '<option value="' + escapeHtml(f.title) + '">' + escapeHtml(f.title) + '（' + f.count + '）</option>').join('');
  sel.value = cur;
}

document.getElementById('btn-add-fav').onclick = async () => {
  const btn = document.getElementById('btn-add-fav');
  btn.disabled = true; msg('正在规划任务…');
  const res = await (await fetch('/api/enqueue/favorites', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      folder: document.getElementById('add-folder').value || undefined,
      limit: document.getElementById('add-fav-limit').value ? Number(document.getElementById('add-fav-limit').value) : undefined,
      order: document.getElementById('add-fav-order').value,
    }),
  })).json();
  btn.disabled = false;
  const text = res.ok ? ('已加入 ' + res.added + ' 个任务（匹配 ' + res.matched + ' 个稿件）') : ('失败：' + (res.error || ''));
  msg(text); toast(text);
  loadTasks(); loadStats(); loadDashboard();
};

document.getElementById('btn-scan').onclick = async () => {
  const btn = document.getElementById('btn-scan');
  btn.disabled = true; msg('正在重新扫描收藏夹…');
  const res = await (await fetch('/api/scan', { method: 'POST' })).json();
  btn.disabled = false;
  const text = res.ok ? ('扫描完成：' + res.videos + ' 个视频，' + res.dirs + ' 个目录') : ('失败：' + (res.error || ''));
  msg(text); toast(text);
  loadFolders();
};

document.getElementById('btn-add-up').onclick = async () => {
  const target = document.getElementById('add-up-target').value.trim();
  if (!target) { msg('请填写 UP 主 mid / 主页链接 / 昵称'); return; }
  const btn = document.getElementById('btn-add-up');
  btn.disabled = true; msg('正在抓取 ' + target + ' 的投稿…');
  const res = await (await fetch('/api/enqueue/up', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      target,
      limit: document.getElementById('add-up-limit').value ? Number(document.getElementById('add-up-limit').value) : undefined,
      keyword: document.getElementById('add-up-kw').value || undefined,
    }),
  })).json();
  btn.disabled = false;
  const text = res.ok ? (res.up + '（mid=' + res.mid + '）共 ' + res.total + ' 个投稿，已加入 ' + res.added + ' 个任务 → ' + res.dir) : ('失败：' + (res.error || ''));
  msg(text); toast(text);
  loadTasks(); loadStats(); loadDashboard();
};

async function loadTasks() {
  const res = await fetch('/api/tasks?limit=300');
  const data = await res.json();
  state.tasks = data.tasks || [];
  render();
}
async function loadStats() {
  const res = await fetch('/api/stats');
  state.stats = await res.json();
  const st = state.stats.status || '-';
  set('s-status', st);
  const pill = document.getElementById('s-pill');
  pill.className = 'pill ' + (st === 'running' ? 'running' : st === 'paused' ? 'paused' : '');
  document.getElementById('s-remaining').textContent = state.stats.remaining ?? 0;
  document.getElementById('s-inflight').textContent = state.stats.inflight ?? 0;
  document.getElementById('s-done').textContent = state.stats.done ?? 0;
  document.getElementById('s-failed').textContent = state.stats.failed ?? 0;
  document.getElementById('s-bytes').textContent = fmtBytes(state.stats.bytesDone);
}
async function loadLogs() {
  const res = await fetch('/api/logs/tail');
  const data = await res.json();
  state.logs = data.lines || [];
  renderLogs();
}
function renderLogs() {
  const level = document.getElementById('log-level').value;
  const lines = (state.logs || []).filter((l) => !level || l.includes('[' + level + ']'));
  const el = document.getElementById('logs');
  el.textContent = lines.join('\\n');
  el.scrollTop = el.scrollHeight;
}

function render() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const f = document.getElementById('filter').value;
  const rows = state.tasks.filter(t => (!f || t.stage === f) && (!q || (t.title+' '+t.baseName).toLowerCase().includes(q)));
  document.getElementById('rows').innerHTML = rows.slice(0, 120).map(t => {
    const pct = t.progress && t.progress.bytesTotal ? Math.round(t.progress.bytesDone / t.progress.bytesTotal * 100) : 0;
    const speed = t.progress && t.progress.speedBps ? fmtBytes(t.progress.speedBps) + '/s' : '-';
    const stalled = t.stage === 'downloading' && (!t.progress || !t.progress.speedBps) && Date.now() - (t.updatedAt || 0) > 60000;
    const thumb = t.cover ? '<img class="thumb" loading="lazy" src="' + escapeHtml(t.cover) + '" alt="" />' : '';
    return \`<div class="row">
      <div class="tcell">\${thumb}<div style="min-width:0"><div class="name" title="\${escapeHtml(t.title)}">\${escapeHtml(t.baseName)}</div>\${t.error ? '<div class="err">'+escapeHtml(t.error.slice(0,80))+'</div>' : ''}</div></div>
      <div>\${t.quality ? '<span class="badge">'+t.quality+'</span>' : ''}\${t.hdr ? '<span class="badge hdr">HDR</span>' : ''}\${t.fps ? '<span class="badge">'+t.fps+'fps</span>' : ''}<span class="badge \${t.engine==='ytdlp'?'ytdlp':''}">\${t.engine}</span></div>
      <div><span class="stage \${t.stage}">\${t.stage}</span>\${stalled ? '<span class="badge" style="background:rgba(255,69,58,.18);color:#ff8b84">停滞</span>' : ''}\${t.retryCount > 0 ? '<span class="badge">重试 '+t.retryCount+'</span>' : ''}</div>
      <div><div class="bar"><i style="width:\${pct}%"></i></div><div class="pct">\${pct}%\${t.progress && t.progress.etaSec ? ' · ETA '+fmtEta(t.progress.etaSec) : ''}</div></div>
      <div class="speed">\${speed}</div>
      <div class="row-actions">
        <button class="tiny" data-act="prioritize" data-id="\${t.id}">插队</button>
        <button class="tiny" data-act="retry" data-id="\${t.id}">重试</button>
        <button class="tiny" data-act="ytdlp" data-id="\${t.id}">副引擎</button>
        <button class="tiny" data-act="cancel" data-id="\${t.id}">取消</button>
      </div>
    </div>\`;
  }).join('');
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

document.getElementById('rows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  await fetch('/api/tasks/' + btn.dataset.id + '/' + btn.dataset.act, { method: 'POST' });
  loadTasks(); loadStats();
});
document.getElementById('btn-refresh').onclick = () => { loadTasks(); loadStats(); loadLogs(); };
document.getElementById('btn-build-index').onclick = async () => {
  const btn = document.getElementById('btn-build-index');
  btn.disabled = true; btn.textContent = '重建中…';
  const res = await (await fetch('/api/library/rebuild', { method: 'POST' })).json();
  btn.disabled = false; btn.textContent = '重建媒体库';
  toast(res.ok ? ('媒体库已重建：' + res.items + ' 个视频') : ('重建失败：' + (res.error || '')));
};
document.getElementById('btn-export-failed').onclick = async () => {
  const head = await (await fetch('/api/tasks/failed')).json();
  if (!head.total) { toast('当前没有失败任务'); return; }
  const a = document.createElement('a');
  a.href = '/api/tasks/failed?format=csv';
  a.download = '';
  a.click();
  toast('已导出 ' + head.total + ' 条失败清单');
};
document.getElementById('btn-clear-failed').onclick = async () => {
  const yes = await confirmSheet('清空失败队列？', '把失败任务移出队列（记录仍保留，可随时「重试」放回）。');
  if (!yes) return;
  const res = await (await fetch('/api/queue/clear-failed', { method: 'POST' })).json();
  toast(res.ok ? ('已移出 ' + res.cleared + ' 个失败任务') : ('操作失败：' + (res.error || '')));
  loadTasks(); loadStats(); loadDashboard();
};
document.getElementById('btn-log-dl').onclick = () => {
  const blob = new Blob([(state.logs || []).join('\\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bili-' + new Date().toISOString().slice(0, 10) + '.log';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('日志已导出');
};
document.getElementById('log-level').onchange = renderLogs;
document.getElementById('q').oninput = render;
document.getElementById('filter').onchange = render;
document.getElementById('btn-save').onclick = async () => {
  const patch = {
    download: {
      maxParallelTasks: Number(document.getElementById('cfg-parallel').value) || 3,
      maxSpeed: document.getElementById('cfg-speed').value || null,
      quality: document.getElementById('cfg-quality').value,
    },
    engines: { mode: document.getElementById('cfg-engine').value },
  };
  await fetch('/api/config', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch) });
  toast('配置已更新（新任务立即生效）');
};

(async function init() {
  const cfg = await (await fetch('/api/config')).json();
  document.getElementById('cfg-parallel').value = cfg.download.maxParallelTasks;
  document.getElementById('cfg-speed').value = cfg.download.maxSpeed ?? '';
  document.getElementById('cfg-quality').value = cfg.download.quality;
  document.getElementById('cfg-engine').value = cfg.engines.mode;
  await loadDashboard(); await loadStats(); await loadTasks(); await loadLogs(); await loadFolders();
  const es = new EventSource('/api/events');
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.t === 'task.update') {
      const idx = state.tasks.findIndex(t => t.id === data.task.id);
      if (idx >= 0) state.tasks[idx] = data.task; else state.tasks.unshift(data.task);
      render();
    } else if (data.t === 'queue.stats') loadStats();
    else if (data.t === 'disk.warn') {
      toast('磁盘不足预警：仅剩 ' + (data.freeGB || 0).toFixed(1) + ' GB，下载已暂停');
      loadDashboard();
    } else if (data.t === 'auth.expired') {
      toast('登录态失效，请重新扫码登录');
      loadDashboard();
    }
  };
  setInterval(() => { loadDashboard(); loadStats(); loadLogs(); }, 5000);
  setInterval(loadTasks, 10000);
})();
</script>
</body>
</html>`;
}
