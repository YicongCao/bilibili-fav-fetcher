/** 媒体库索引页（iOS 风格；数据用 <script src="library.js"> 注入，兼容 file://）
 *  功能：两级筛选树、网格/列表视图、排序、删除（保留 metadata 并标记）、底部抽屉播放器、
 *  滚动分页（1000+ 条不卡）、file:// 提示 */
export function renderLibraryPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>我的 B 站媒体库</title>
<style>
  :root {
    color-scheme: dark;
    --bg:#000; --surface:rgba(28,28,30,.72); --surface-2:#2c2c2e; --surface-3:#3a3a3c;
    --sep:rgba(84,84,88,.55);
    --label:#fff; --label-2:rgba(235,235,245,.62); --label-3:rgba(235,235,245,.34);
    --blue:#0a84ff; --orange:#ff9f0a; --green:#30d158;
    --r-lg:22px; --r-md:16px; --r-sm:10px;
    --ease:cubic-bezier(.25,.1,.25,1);
  }
  * { box-sizing:border-box; }
  body {
    margin:0; height:100vh; overflow:hidden; color:var(--label); background:
      radial-gradient(1100px 520px at 8% -12%, rgba(10,132,255,.14), transparent 60%),
      radial-gradient(900px 480px at 100% 0%, rgba(191,90,242,.12), transparent 55%),
      var(--bg);
    font:14px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","PingFang SC",sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  header {
    position:sticky; top:0; z-index:20; display:flex; align-items:center; gap:12px; flex-wrap:wrap;
    padding:14px 22px; background:rgba(12,12,14,.72);
    backdrop-filter:saturate(180%) blur(20px); -webkit-backdrop-filter:saturate(180%) blur(20px);
    border-bottom:1px solid var(--sep);
  }
  h1 { font-size:17px; margin:0; font-weight:600; }
  .count { color:var(--label-2); font-size:12px; }
  .spacer { flex:1; }
  input, select, button { font:inherit; font-size:13px; color:var(--label); }
  input, select {
    background:var(--surface-2); border:1px solid var(--sep); border-radius:999px; padding:7px 14px;
    transition:border-color .18s var(--ease);
  }
  #q { min-width:220px; flex:0 1 300px; }
  input:focus, select:focus { outline:none; border-color:var(--blue); }
  ::placeholder { color:var(--label-3); }
  button { background:var(--surface-2); border:1px solid transparent; border-radius:999px; padding:7px 14px; cursor:pointer;
    transition:transform .18s var(--ease), background .18s var(--ease); }
  button:active { transform:scale(.96); }
  button:hover { background:var(--surface-3); }
  button.filled { background:var(--blue); color:#fff; }
  button.filled:hover { background:#3d9bff; }
  button.tiny { padding:4px 10px; font-size:12px; }
  input[type=range] { padding:0; border:0; background:transparent; width:110px; accent-color:var(--blue); cursor:pointer; }
  /* ---------- 布局：侧栏筛选树 + 内容（两栏各自独立滚动） ---------- */
  body { display:flex; flex-direction:column; }
  .wrap { flex:1 1 auto; min-height:0; display:grid; grid-template-columns:216px minmax(0,1fr); gap:18px;
    padding:18px 22px 22px; align-items:start; overflow:hidden; }
  .side { height:100%; overflow-y:auto; overscroll-behavior:contain; padding-right:2px; }
  .tree { background:var(--surface); border:1px solid var(--sep); border-radius:var(--r-md); padding:8px;
    backdrop-filter:blur(20px) saturate(180%); -webkit-backdrop-filter:blur(20px) saturate(180%); }
  /* 细滚动条（贴近 iOS 观感） */
  .side::-webkit-scrollbar, main::-webkit-scrollbar { width:8px; }
  .side::-webkit-scrollbar-thumb, main::-webkit-scrollbar-thumb { background:rgba(255,255,255,.16); border-radius:999px; }
  .side::-webkit-scrollbar-track, main::-webkit-scrollbar-track { background:transparent; }
  .tree h3 { font-size:11px; color:var(--label-3); font-weight:500; padding:6px 8px; }
  .node {
    display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:9px; font-size:13px;
    color:var(--label-2); cursor:pointer; transition:background .16s var(--ease), color .16s var(--ease);
  }
  .node:hover { background:rgba(255,255,255,.06); color:var(--label); }
  .node.on { background:var(--blue); color:#fff; }
  .node .n { margin-left:auto; font-size:11px; color:var(--label-3); font-variant-numeric:tabular-nums; }
  .node.on .n { color:rgba(255,255,255,.85); }
  .node.sub { padding-left:20px; font-size:12px; }
  main { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:16px; align-content:start;
    /* 固定高度 + 独立滚动时必须显式声明行高，否则 auto 行会把卡片压扁（封面 aspect-ratio 失效） */
    grid-auto-rows:max-content;
    height:100%; overflow-y:auto; overscroll-behavior:contain; padding:2px 4px 8px 2px; }
  main.list { grid-template-columns:1fr; gap:10px; }
  /* ---------- 卡片 ---------- */
  .card {
    background:var(--surface); border:1px solid var(--sep); border-radius:var(--r-lg); overflow:hidden;
    cursor:pointer; display:flex; flex-direction:column;
    backdrop-filter:blur(20px) saturate(180%); -webkit-backdrop-filter:blur(20px) saturate(180%);
    box-shadow:0 8px 24px rgba(0,0,0,.3);
    transition:transform .22s var(--ease), box-shadow .22s var(--ease), border-color .22s var(--ease);
  }
  .card:hover { transform:translateY(-4px) scale(1.015); border-color:rgba(10,132,255,.45); box-shadow:0 16px 38px rgba(0,0,0,.45); }
  .thumb { position:relative; aspect-ratio:16/9; background:#0b0b0d center/cover no-repeat; }
  .thumb .dur { position:absolute; right:8px; bottom:8px; background:rgba(0,0,0,.66); backdrop-filter:blur(6px);
    border-radius:999px; padding:2px 8px; font-size:11px; font-variant-numeric:tabular-nums; }
  .thumb .badges { position:absolute; left:8px; top:8px; display:flex; gap:5px; flex-wrap:wrap; }
  .badge { background:rgba(0,0,0,.6); backdrop-filter:blur(6px); border-radius:999px; font-size:11px; padding:2px 8px; }
  .badge.hdr { background:rgba(255,159,10,.9); color:#221600; font-weight:600; }
  .badge.missing { background:rgba(255,69,58,.9); color:#fff; }
  .meta { padding:10px 12px 12px; }
  .title { font-size:13px; line-height:1.4; height:2.8em; overflow:hidden; }
  .sub { color:var(--label-3); font-size:12px; margin-top:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .card.deleted, .row.deleted, .card.missing, .row.missing { opacity:.6; }
  .card.missing:hover, .row.missing:hover { opacity:.85; }
  /* ---------- 列表行 ---------- */
  .row {
    display:grid; grid-template-columns:112px minmax(0,1fr) 110px 84px 96px auto; gap:14px; align-items:center;
    background:var(--surface); border:1px solid var(--sep); border-radius:var(--r-md); padding:8px 12px 8px 8px;
    backdrop-filter:blur(20px) saturate(180%); -webkit-backdrop-filter:blur(20px) saturate(180%);
    cursor:pointer; transition:transform .2s var(--ease), border-color .2s var(--ease), background .2s var(--ease);
  }
  .row:hover { transform:translateY(-1px); border-color:rgba(10,132,255,.45); background:rgba(44,44,46,.6); }
  .row .rt { width:112px; aspect-ratio:16/9; border-radius:var(--r-sm); background:#0b0b0d center/cover no-repeat; position:relative; }
  .row .rt .dur { position:absolute; right:5px; bottom:4px; background:rgba(0,0,0,.66); border-radius:999px; padding:1px 6px; font-size:10px; font-variant-numeric:tabular-nums; }
  .row .r-title { font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .row .r-sub { color:var(--label-3); font-size:12px; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .row .r-cell { font-size:12px; color:var(--label-2); font-variant-numeric:tabular-nums; }
  .row .r-acts { display:flex; gap:6px; }
  .empty { color:var(--label-2); padding:60px 0; text-align:center; grid-column:1/-1; }
  /* ---------- 播放器抽屉 ---------- */
  dialog { border:0; padding:0; background:transparent; width:min(1000px,94vw); max-width:none; }
  dialog::backdrop { background:rgba(0,0,0,.6); backdrop-filter:blur(3px); }
  .sheet {
    background:rgba(28,28,30,.92); backdrop-filter:blur(24px) saturate(180%);
    border:1px solid var(--sep); border-radius:var(--r-lg); overflow:hidden;
    box-shadow:0 24px 70px rgba(0,0,0,.6); animation:sheetIn .28s var(--ease);
  }
  @keyframes sheetIn { from { transform:translateY(24px) scale(.98); opacity:0; } to { transform:none; opacity:1; } }
  .player { padding:14px 14px 0; }
  .stage { position:relative; border-radius:var(--r-md); overflow:hidden; background:#000; }
  video { width:100%; background:#000; border-radius:var(--r-md); max-height:60vh; display:block; }
  /* 弹幕层：覆盖在视频上，不拦截鼠标 */
  #dm { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; display:block; }
  .pmeta { padding:12px 18px 16px; }
  .pmeta .t { font-size:15px; font-weight:600; line-height:1.35; }
  .pmeta .s { color:var(--label-2); font-size:12px; margin-top:5px; }
  .pmeta a { color:#8fc6ff; text-decoration:none; }
  .parts { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
  .parts button { background:var(--surface-2); color:var(--label-2); font-size:12px; padding:5px 12px; }
  .parts button.on { background:var(--blue); color:#fff; }
  .sheet-acts { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }
  .grabber { width:38px; height:5px; border-radius:999px; background:var(--surface-3); margin:8px auto 0; }
  /* ---------- 分段控件 / Toast / 确认框 / 提示条 ---------- */
  .seg { display:flex; background:var(--surface-2); border-radius:11px; padding:2px; gap:2px; }
  .seg button { flex:1; background:transparent; border:0; border-radius:9px; padding:6px 12px; font-size:13px; color:var(--label-2); }
  .seg button.active { background:var(--surface-3); color:var(--label); box-shadow:0 1px 3px rgba(0,0,0,.3); }
  #toast {
    position:fixed; left:50%; bottom:28px; transform:translate(-50%,20px);
    background:rgba(44,44,46,.92); color:var(--label); border:1px solid var(--sep);
    padding:11px 18px; border-radius:999px; font-size:13px; z-index:99; opacity:0; pointer-events:none;
    backdrop-filter:blur(20px); box-shadow:0 10px 30px rgba(0,0,0,.4);
    transition:opacity .22s var(--ease), transform .22s var(--ease);
  }
  #toast.show { opacity:1; transform:translate(-50%,0); }
  #sheet { border:0; padding:0; background:transparent; max-width:400px; width:92vw; }
  #sheet::backdrop { background:rgba(0,0,0,.55); }
  .alert { background:rgba(44,44,46,.92); backdrop-filter:blur(24px); border-radius:var(--r-lg); border:1px solid var(--sep);
    overflow:hidden; text-align:center; animation:pop .22s var(--ease); }
  @keyframes pop { from { transform:scale(.94); opacity:0; } to { transform:scale(1); opacity:1; } }
  .alert .body { padding:20px 20px 14px; }
  .alert .title { font-size:15px; font-weight:600; }
  .alert .msg { font-size:13px; color:var(--label-2); margin-top:6px; line-height:1.45; }
  .alert .acts { display:flex; border-top:1px solid var(--sep); }
  .alert .acts button { flex:1; border-radius:0; background:transparent; border:0; padding:12px; font-size:15px; color:#8fc6ff; }
  .alert .acts button + button { border-left:1px solid var(--sep); color:var(--label); font-weight:600; }
  #filehint { display:none; background:rgba(255,159,10,.14); border-bottom:1px solid rgba(255,159,10,.3);
    color:#ffd08a; font-size:12px; padding:8px 22px; }
  #morespace { grid-column:1/-1; text-align:center; color:var(--label-3); font-size:12px; padding:14px 0; }
  /* 窄屏回到整页滚动（侧栏不再独立滚动） */
  @media (max-width: 900px) {
    body { height:auto; overflow:auto; }
    .wrap { overflow:visible; grid-template-columns:1fr; }
    .side, main { height:auto; overflow:visible; }
  }
</style>
</head>
<body>
<header>
  <h1>我的 B 站媒体库</h1>
  <span class="count" id="count"></span>
  <span class="spacer"></span>
  <input id="q" placeholder="搜索标题 / UP / BV号" />
  <select id="sort">
    <option value="favTime">按收藏时间</option>
    <option value="pubDate">按发布时间</option>
    <option value="title">按标题</option>
    <option value="size">按体积（大→小）</option>
    <option value="duration">按时长（长→短）</option>
  </select>
  <div class="seg" style="width:150px">
    <button id="view-grid" class="active">网格</button>
    <button id="view-list">列表</button>
  </div>
  <button id="toggle-deleted">显示已删除</button>
</header>
<div id="filehint">file:// 模式下无法拖动进度条、也无法删除视频 —— 运行 <b>bili serve</b> 或控制端打开 /library 获得完整体验。</div>

<div class="wrap">
  <aside class="side"><div class="tree" id="tree"></div></aside>
  <main id="grid"></main>
</div>

<dialog id="dlg"><div class="sheet">
  <div class="grabber"></div>
  <div class="player">
    <div class="stage">
      <video id="video" controls preload="metadata"></video>
      <canvas id="dm"></canvas>
    </div>
  </div>
  <div class="pmeta">
    <div class="t" id="p-title"></div>
    <div class="s" id="p-sub"></div>
    <div class="parts" id="p-parts"></div>
    <div class="sheet-acts">
      <button id="p-open" class="filled">打开 B 站原页面</button>
      <button id="p-dm">弹幕：开</button>
      <select id="p-dm-size" style="width:96px" title="弹幕字号">
        <option value="0.8">弹幕 小</option><option value="1" selected>弹幕 中</option><option value="1.3">弹幕 大</option>
      </select>
      <select id="p-dm-area" style="width:104px" title="弹幕显示区域">
        <option value="1" selected>区域 全部</option><option value="0.5">区域 半屏</option><option value="0.25">区域 1/4</option>
      </select>
      <input id="p-dm-opacity" type="range" min="20" max="100" step="5" title="弹幕不透明度" />
      <button id="p-copy">复制路径</button>
      <button id="p-pip">画中画</button>
      <select id="p-rate" style="width:96px">
        <option value="0.5">0.5×</option><option value="1" selected>1.0×</option>
        <option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2.0×</option>
      </select>
      <button id="p-close">关闭 (Esc)</button>
    </div>
  </div>
</div></dialog>

<div id="toast"></div>
<dialog id="sheet"><div class="alert">
  <div class="body"><div class="title" id="sheet-title"></div><div class="msg" id="sheet-msg"></div></div>
  <div class="acts"><button id="sheet-cancel">取消</button><button id="sheet-ok">删除</button></div>
</div></dialog>

<script src="library.js"></script>
<script>
let DATA = window.__BILI_LIBRARY__ || { items: [], folders: [], ups: [] };
const grid = document.getElementById('grid');
const dlg = document.getElementById('dlg');
const video = document.getElementById('video');
const canManage = location.protocol !== 'file:';
const PAGE = 60;
let current = null;
let view = localStorage.getItem('bili-lib-view') || 'grid';
let showDeleted = false;
let page = 1;
let selFolder = '';
let selUp = '';

const fmtDur = (s) => { const m = Math.floor(s/60), ss = Math.floor(s%60); const h = Math.floor(m/60); return h ? h+':'+String(m%60).padStart(2,'0')+':'+String(ss).padStart(2,'0') : m+':'+String(ss).padStart(2,'0'); };
const fmtSize = (n) => !n ? '-' : n >= 1073741824 ? (n/1073741824).toFixed(2)+' GB' : (n/1048576).toFixed(0)+' MB';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const idOf = (it) => it.bvid + ':' + it.page;
const isMissing = (it) => !it.deleted && !it.size;

let toastTimer = null;
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function confirmSheet(title, msg, okText) {
  return new Promise((resolve) => {
    const box = document.getElementById('sheet');
    document.getElementById('sheet-title').textContent = title;
    document.getElementById('sheet-msg').textContent = msg;
    document.getElementById('sheet-ok').textContent = okText || '确定';
    const ok = document.getElementById('sheet-ok'), cancel = document.getElementById('sheet-cancel');
    const done = (v) => { box.close(); ok.onclick = cancel.onclick = null; resolve(v); };
    ok.onclick = () => done(true); cancel.onclick = () => done(false);
    box.showModal();
  });
}

if (!canManage) document.getElementById('filehint').style.display = 'block';

/** 两级筛选树：收藏夹 → 该收藏夹下的 UP */
function renderTree() {
  const base = DATA.items.filter(it => showDeleted || !it.deleted);
  let html = '<h3>收藏夹</h3>';
  html += '<div class="node ' + (selFolder === '' && selUp === '' ? 'on' : '') + '" data-folder="" data-up="">全部<span class="n">' + base.length + '</span></div>';
  for (const f of DATA.folders) {
    const n = base.filter(it => it.folder === f).length;
    if (!n) continue;
    html += '<div class="node ' + (selFolder === f && !selUp ? 'on' : '') + '" data-folder="' + esc(f) + '" data-up="">' + esc(f) + '<span class="n">' + n + '</span></div>';
    if (selFolder === f) {
      const ups = new Map();
      for (const it of base.filter(x => x.folder === f)) ups.set(it.up.mid, (ups.get(it.up.mid) || 0) + 1);
      for (const [mid, cnt] of [...ups.entries()].sort((a, b) => b[1] - a[1])) {
        const name = base.find(x => x.up.mid === mid).up.name;
        html += '<div class="node sub ' + (selUp === String(mid) ? 'on' : '') + '" data-folder="' + esc(f) + '" data-up="' + mid + '">' + esc(name) + '<span class="n">' + cnt + '</span></div>';
      }
    }
  }
  document.getElementById('tree').innerHTML = html;
  document.getElementById('tree').querySelectorAll('.node').forEach(n => {
    n.onclick = () => {
      selFolder = n.dataset.folder || '';
      selUp = n.dataset.up || '';
      page = 1; renderTree(); render();
    };
  });
}

/* ---------- 弹幕：自研 ASS 解析 + canvas 渲染（浏览器原生 track 不认 .ass） ---------- */
const canvas = document.getElementById('dm');
const ctx = canvas.getContext('2d');
let dmOn = localStorage.getItem('bili-dm-on') !== '0';
let dmScale = Number(localStorage.getItem('bili-dm-size') || 1);
let dmOpacity = Number(localStorage.getItem('bili-dm-opacity') || 1);
let dmArea = Number(localStorage.getItem('bili-dm-area') || 1);
let dmData = { events: [], resX: 1920, resY: 1080 };
let dmActive = [];
let dmCursor = 0;
let dmRaf = 0;

const assTime = (s) => {
  // 注意：本文件是模板字符串，正则里的反斜杠要写成 \\ 才会出现在页面上
  const m = /(\\d+):(\\d+):(\\d+(?:\\.\\d+)?)/.exec(s || '');
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
};

/** 只解析我们自己生成的 ASS（\move 滚动 / \an8 顶部 / \an2 底部 / \pos 定位 / \fs 字号 / \c&HBBGGRR& 颜色） */
function parseAss(src) {
  let resX = 1920;
  let resY = 1080;
  const events = [];
  let inEvents = false;
  for (const raw of src.split(/\\r?\\n/)) {
    let m;
    if ((m = /^\\s*PlayResX\\s*:\\s*(\\d+)/i.exec(raw))) { resX = Number(m[1]); continue; }
    if ((m = /^\\s*PlayResY\\s*:\\s*(\\d+)/i.exec(raw))) { resY = Number(m[1]); continue; }
    if (/^\\[Events\\]/i.test(raw)) { inEvents = true; continue; }
    if (/^\\[/.test(raw)) { inEvents = false; continue; }
    if (!inEvents || !/^Dialogue:/i.test(raw)) continue;

    const parts = raw.slice(raw.indexOf(':') + 1).trim().split(',');
    if (parts.length < 10) continue;
    const start = assTime(parts[1]);
    const end = assTime(parts[2]);
    const withTags = parts.slice(9).join(',');
    const tagMatch = /^\\{([^}]*)\\}/.exec(withTags);
    const tags = tagMatch ? tagMatch[1] : '';
    const text = (tagMatch ? withTags.slice(tagMatch[0].length) : withTags)
      .replace(/\\\\N/gi, ' ').replace(/\\\\n/gi, ' ').trim();
    if (!text) continue;

    const move = /\\\\move\\(\\s*(-?[\\d.]+)\\s*,\\s*(-?[\\d.]+)\\s*,\\s*(-?[\\d.]+)\\s*,\\s*(-?[\\d.]+)/.exec(tags);
    const pos = /\\\\pos\\(\\s*(-?[\\d.]+)\\s*,\\s*(-?[\\d.]+)/.exec(tags);
    const fs = /\\\\fs([\\d.]+)/.exec(tags);
    const col = /\\\\(?:1?c)&H([0-9a-f]{6})&/i.exec(tags);
    const an = /\\\\an(\\d)/.exec(tags);

    let color = '#ffffff';
    if (col) {
      const h = col[1];
      color = 'rgb(' + parseInt(h.slice(4, 6), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(0, 2), 16) + ')';
    }
    const size = fs ? Number(fs[1]) : Math.round(resY * 0.045);

    if (move) {
      events.push({ start, end, text, mode: 'scroll', x: +move[1], y: +move[2], x2: +move[3], size, color });
    } else if (pos) {
      const mode = an ? (an[1] === '2' ? 'bottom' : 'top') : 'top';
      events.push({ start, end, text, mode, x: +pos[1], y: +pos[2], x2: +pos[1], size, color });
    } else {
      events.push({ start, end, text, mode: 'scroll', x: resX, y: size, x2: -size, size, color });
    }
  }
  events.sort((a, b) => a.start - b.start);
  return { events, resX, resY };
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(video.clientWidth * dpr);
  const h = Math.round(video.clientHeight * dpr);
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

async function loadDanmaku(item) {
  dmActive = []; dmCursor = 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const ass = (item.subtitles || []).find((s) => s.format === 'ass');
  if (!ass) { dmData = { events: [], resX: 1920, resY: 1080 }; return; }
  try {
    const text = await (await fetch(encodeURI(ass.file), { cache: 'force-cache' })).text();
    dmData = parseAss(text);
  } catch {
    dmData = { events: [], resX: 1920, resY: 1080 };   // file:// 下取不到，静默降级
  }
  syncDanmakuButton();
}

/** 拖动进度条后游标要回退，否则往回拖会丢弹幕 */
function rewindDanmaku() {
  dmCursor = 0;
  dmActive = [];
}

function drawDanmaku() {
  dmRaf = requestAnimationFrame(drawDanmaku);
  if (!dmOn || !dmData.events.length) return;
  resizeCanvas();
  const t = video.currentTime;
  const list = dmData.events;
  // 滚动游标：只把新进入的弹幕加入活动集，再剔除已结束的
  while (dmCursor < list.length && list[dmCursor].start <= t) dmActive.push(list[dmCursor++]);
  if (dmActive.length > 400) dmActive = dmActive.filter((e) => e.end >= t);
  else dmActive = dmActive.filter((e) => e.end >= t);

  const scale = canvas.width / dmData.resX;
  const areaBottom = canvas.height * dmArea;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = dmOpacity;
  for (const e of dmActive) {
    const p = e.end > e.start ? Math.min(1, Math.max(0, (t - e.start) / (e.end - e.start))) : 1;
    const y = e.y * scale;
    if (y > areaBottom) continue;   // 超出显示区域的弹幕不画
    const fontSize = Math.max(10, e.size * scale * dmScale);
    ctx.font = '600 ' + fontSize.toFixed(1) + 'px -apple-system,"PingFang SC",sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.lineWidth = Math.max(1.5, fontSize / 8);
    let x;
    if (e.mode === 'scroll') {
      x = (e.x + (e.x2 - e.x) * p) * scale;
      ctx.textAlign = 'left';
    } else {
      x = e.x * scale;
      ctx.textAlign = 'center';
    }
    ctx.strokeText(e.text, x, y);
    ctx.fillStyle = e.color;
    ctx.fillText(e.text, x, y);
  }
  ctx.globalAlpha = 1;
}

function syncDanmakuButton() {
  const btn = document.getElementById('p-dm');
  btn.textContent = '弹幕：' + (!dmData.events.length ? '无' : dmOn ? '开' : '关');
  btn.className = dmOn && dmData.events.length ? 'filled' : '';
  btn.disabled = !dmData.events.length;
}

async function refreshData() {
  try {
    DATA = await (await fetch('library.json?t=' + Date.now())).json();
  } catch {
    location.reload();
  }
}

async function removeItem(id) {
  const it = DATA.items.find(x => idOf(x) === id);
  if (!it) return;
  const yes = await confirmSheet('删除这个视频？', esc(it.title) + '\\n将删除视频文件与字幕，保留封面与 metadata，并标记为已删除 —— 下载器以后不会再重复下载它。');
  if (!yes) return;
  const res = await (await fetch('/api/library/delete', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids: [id] }),
  })).json();
  toast(res.ok ? '已删除，释放 ' + fmtSize(res.bytes) : ('删除失败：' + (res.error || '')));
  await refreshData(); renderTree(); render();
}

async function restoreItem(id) {
  const res = await (await fetch('/api/library/restore', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids: [id] }),
  })).json();
  toast(res.ok ? '已恢复，下次扫描可重新下载' : ('恢复失败：' + (res.error || '')));
  await refreshData(); renderTree(); render();
}

function setView(v) {
  view = v;
  localStorage.setItem('bili-lib-view', v);
  grid.className = v === 'list' ? 'list' : '';
  document.getElementById('view-grid').className = v === 'grid' ? 'active' : '';
  document.getElementById('view-list').className = v === 'list' ? 'active' : '';
  page = 1; render();
}

function filtered() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const sort = document.getElementById('sort').value;
  let list = DATA.items.filter(it => {
    if (!showDeleted && it.deleted) return false;
    if (selFolder && it.folder !== selFolder) return false;
    if (selUp && String(it.up.mid) !== selUp) return false;
    if (q && !(it.title + ' ' + it.up.name + ' ' + it.bvid).toLowerCase().includes(q)) return false;
    return true;
  });
  list.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'zh') : (b[sort] || 0) - (a[sort] || 0));
  return list;
}

function render() {
  const list = filtered();
  const shown = list.slice(0, page * PAGE);
  const deletedCount = DATA.items.filter(it => it.deleted).length;
  const missingCount = DATA.items.filter(isMissing).length;
  document.getElementById('count').textContent =
    list.length + ' 个视频' + (deletedCount ? '（已删除 ' + deletedCount + '）' : '') + (missingCount ? '（缺失 ' + missingCount + '）' : '');
  if (!list.length) { grid.innerHTML = '<div class="empty">没有匹配的视频</div>'; return; }

  const badge = (it) =>
    (it.qualityLabel ? '<span class="badge">' + esc(it.qualityLabel) + '</span>' : '') +
    (it.hdr ? '<span class="badge hdr">HDR</span>' : '') +
    (it.deleted ? '<span class="badge missing">已删除</span>' : isMissing(it) ? '<span class="badge missing">文件缺失</span>' : '');

  const html = view === 'list'
    ? shown.map(it => \`
      <div class="row \${it.deleted?'deleted':''} \${isMissing(it)?'missing':''}" data-id="\${it.bvid}" data-page="\${it.page}">
        <div class="rt" style="background-image:url('\${encodeURI(it.poster || '')}')"><span class="dur">\${fmtDur(it.duration)}</span></div>
        <div>
          <div class="r-title" title="\${esc(it.title)}">\${esc(it.title)}\${it.page>1?' P'+it.page:''} \${it.deleted?'<span class="badge missing">已删除</span>':isMissing(it)?'<span class="badge missing">缺失</span>':''}</div>
          <div class="r-sub">\${esc(it.up.name)} · \${esc(it.folder||'')}</div>
        </div>
        <div class="r-cell">\${fmtSize(it.size)}</div>
        <div class="r-cell">\${fmtDur(it.duration)}</div>
        <div class="r-cell">\${it.qualityLabel ? '<span class="badge">'+esc(it.qualityLabel)+'</span>' : ''}\${it.hdr?'<span class="badge hdr">HDR</span>':''}</div>
        <div class="r-acts">
          \${canManage ? (it.deleted
            ? '<button class="tiny" data-act="restore" data-key="'+idOf(it)+'">恢复</button>'
            : '<button class="tiny" data-act="del" data-key="'+idOf(it)+'">删除</button>') : ''}
        </div>
      </div>\`).join('')
    : shown.map(it => \`
      <div class="card \${it.deleted?'deleted':''} \${isMissing(it)?'missing':''}" data-id="\${it.bvid}" data-page="\${it.page}">
        <div class="thumb" style="background-image:url('\${encodeURI(it.poster || '')}')">
          <div class="badges">\${badge(it)}</div>
          <div class="dur">\${fmtDur(it.duration)}</div>
        </div>
        <div class="meta">
          <div class="title" title="\${esc(it.title)}">\${esc(it.title)}\${it.page>1?' P'+it.page:''}</div>
          <div class="sub">\${esc(it.up.name)} · \${esc(it.folder||'')} · \${fmtSize(it.size)}</div>
          \${canManage ? '<div class="sub" style="margin-top:8px">' + (it.deleted
            ? '<button class="tiny" data-act="restore" data-key="'+idOf(it)+'">恢复（可重新下载）</button>'
            : '<button class="tiny" data-act="del" data-key="'+idOf(it)+'">删除</button>') + '</div>' : ''}
        </div>
      </div>\`).join('');

  grid.innerHTML = html + (list.length > shown.length
    ? '<div id="morespace">已显示 ' + shown.length + ' / ' + list.length + '，继续下滑加载更多</div>' : '');
}

// 滚动分页：内容列（宽屏）或整页（窄屏）接近底部时再加载一页，避免 1000+ 条一次性渲染
function maybeLoadMore() {
  // 宽屏时 main 自己滚；窄屏回退到整页滚
  const el = grid.scrollHeight - grid.clientHeight > 8 ? grid : document.documentElement;
  if (el.scrollTop + el.clientHeight < el.scrollHeight - 400) return;
  if (page * PAGE >= filtered().length) return;
  page += 1; render();
}
window.addEventListener('scroll', maybeLoadMore, true);   // capture：同时捕获内容列的滚动

grid.addEventListener('click', (e) => {
  const actBtn = e.target.closest('button[data-act]');
  if (actBtn) {
    e.stopPropagation();
    const key = actBtn.dataset.key;
    if (actBtn.dataset.act === 'del') removeItem(key); else restoreItem(key);
    return;
  }
  const card = e.target.closest('.card, .row'); if (!card) return;
  const pageNo = Number(card.dataset.page || 1);
  const group = DATA.items.filter(it => it.bvid === card.dataset.id).sort((a, b) => a.page - b.page);
  if (!group.length) return;
  play(group.find(g => g.page === pageNo) || group[0], group);
});

function play(item, group) {
  current = item;
  document.getElementById('p-title').textContent = item.title + (item.partTitle ? ' · ' + item.partTitle : '');
  document.getElementById('p-sub').innerHTML = \`\${esc(item.up.name)} · \${esc(item.folder||'')} · \${fmtDur(item.duration)} · \${fmtSize(item.size)}\`;
  video.poster = item.poster ? encodeURI(item.poster) : '';
  video.src = encodeURI(item.video);
  // 原生 track 只认 WebVTT，ASS 交给上面的 canvas 弹幕层渲染
  video.querySelectorAll('track').forEach(t => t.remove());
  for (const sub of item.subtitles || []) {
    if (sub.format === 'ass') continue;
    const tr = document.createElement('track');
    tr.kind = 'subtitles'; tr.label = sub.format.toUpperCase();
    tr.src = encodeURI(sub.file);
    tr.default = true;
    video.appendChild(tr);
  }
  void loadDanmaku(item);
  document.getElementById('p-parts').innerHTML = group.map(g => \`<button data-page="\${g.page}" class="\${g.page===item.page?'on':''}">P\${g.page}\${g.partTitle?' '+esc(g.partTitle):''}</button>\`).join('');
  document.getElementById('p-parts').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const p = Number(b.dataset.page);
    play(group.find(g => g.page === p) || group[0], group);
  };
  if (!dlg.open) dlg.showModal();
  video.play().catch(() => {});
}

document.getElementById('p-open').onclick = () => { if (current) window.open('https://www.bilibili.com/video/' + current.bvid, '_blank'); };
document.getElementById('p-dm').onclick = () => {
  dmOn = !dmOn;
  localStorage.setItem('bili-dm-on', dmOn ? '1' : '0');
  syncDanmakuButton();
  if (!dmOn) ctx.clearRect(0, 0, canvas.width, canvas.height);
};
document.getElementById('p-dm-size').onchange = (e) => {
  dmScale = Number(e.target.value);
  localStorage.setItem('bili-dm-size', String(dmScale));
};
document.getElementById('p-dm-area').onchange = (e) => {
  dmArea = Number(e.target.value);
  localStorage.setItem('bili-dm-area', String(dmArea));
};
document.getElementById('p-dm-opacity').oninput = (e) => {
  dmOpacity = Number(e.target.value) / 100;
  localStorage.setItem('bili-dm-opacity', String(dmOpacity));
};
window.addEventListener('resize', resizeCanvas);
video.addEventListener('loadedmetadata', resizeCanvas);
video.addEventListener('seeking', rewindDanmaku);
if (!dmRaf) dmRaf = requestAnimationFrame(drawDanmaku);
document.getElementById('p-dm-size').value = String(dmScale);
document.getElementById('p-dm-area').value = String(dmArea);
document.getElementById('p-dm-opacity').value = String(Math.round(dmOpacity * 100));
syncDanmakuButton();
document.getElementById('p-close').onclick = () => { dlg.close(); video.pause(); };
dlg.addEventListener('close', () => video.pause());
document.getElementById('p-rate').onchange = (e) => { video.playbackRate = Number(e.target.value); };
document.getElementById('p-pip').onclick = async () => {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await video.requestPictureInPicture();
  } catch { toast('当前浏览器不支持画中画'); }
};
document.getElementById('p-copy').onclick = async () => {
  if (!current) return;
  const text = (DATA.root ? DATA.root + '/' : '') + current.video;
  try { await navigator.clipboard.writeText(text); toast('已复制路径：' + text); }
  catch { toast('复制失败，路径：' + text); }
};
document.getElementById('q').oninput = () => { page = 1; render(); };
document.getElementById('sort').onchange = () => { page = 1; render(); };
document.getElementById('view-grid').onclick = () => setView('grid');
document.getElementById('view-list').onclick = () => setView('list');
document.getElementById('toggle-deleted').onclick = () => {
  showDeleted = !showDeleted;
  document.getElementById('toggle-deleted').textContent = showDeleted ? '隐藏已删除' : '显示已删除';
  page = 1; renderTree(); render();
};
document.addEventListener('keydown', (e) => {
  if (!dlg.open) return;
  if (e.key === 'Escape') { e.preventDefault(); dlg.close(); }
  else if (e.key === ' ') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
  else if (e.key === 'ArrowRight') video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
  else if (e.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 5);
});
renderTree();
setView(view);
</script>
</body>
</html>`;
}
