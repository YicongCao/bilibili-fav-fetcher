/** 媒体库索引页（iOS 风格：毛玻璃顶栏 + 大圆角卡片 + 底部抽屉播放器；数据仍用 <script src="library.js"> 注入，兼容 file://） */
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
    --bg:#000; --surface:rgba(28,28,30,.72); --surface-solid:#1c1c1e; --surface-2:#2c2c2e; --surface-3:#3a3a3c;
    --sep:rgba(84,84,88,.55);
    --label:#fff; --label-2:rgba(235,235,245,.62); --label-3:rgba(235,235,245,.34);
    --blue:#0a84ff; --orange:#ff9f0a; --green:#30d158;
    --r-lg:22px; --r-md:16px; --r-sm:10px;
    --ease:cubic-bezier(.25,.1,.25,1);
  }
  * { box-sizing:border-box; }
  body {
    margin:0; color:var(--label); background:
      radial-gradient(1100px 520px at 8% -12%, rgba(10,132,255,.14), transparent 60%),
      radial-gradient(900px 480px at 100% 0%, rgba(191,90,242,.12), transparent 55%),
      var(--bg);
    font:14px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","PingFang SC",sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  /* ---------- 毛玻璃顶栏 ---------- */
  header {
    position:sticky; top:0; z-index:20; display:flex; align-items:center; gap:12px; flex-wrap:wrap;
    padding:14px 22px;
    background:rgba(12,12,14,.72);
    backdrop-filter:saturate(180%) blur(20px); -webkit-backdrop-filter:saturate(180%) blur(20px);
    border-bottom:1px solid var(--sep);
  }
  h1 { font-size:17px; margin:0; font-weight:600; letter-spacing:.01em; }
  .count { color:var(--label-2); font-size:12px; }
  .spacer { flex:1; }
  input, select {
    font:inherit; font-size:13px; color:var(--label);
    background:var(--surface-2); border:1px solid var(--sep); border-radius:999px; padding:7px 14px;
    transition:border-color .18s var(--ease);
  }
  #q { min-width:240px; flex:0 1 320px; }
  input:focus, select:focus { outline:none; border-color:var(--blue); }
  select { border-radius:999px; padding:7px 12px; }
  ::placeholder { color:var(--label-3); }
  button { font:inherit; font-size:13px; color:var(--label); background:var(--surface-2);
    border:1px solid transparent; border-radius:999px; padding:7px 14px; cursor:pointer;
    transition:transform .18s var(--ease), background .18s var(--ease); }
  button:active { transform:scale(.96); }
  button:hover { background:var(--surface-3); }
  button.filled { background:var(--blue); color:#fff; }
  button.filled:hover { background:#3d9bff; }
  /* ---------- 网格卡片 ---------- */
  main { padding:18px 22px 32px; display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:16px; }
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
  .thumb .badges { position:absolute; left:8px; top:8px; display:flex; gap:5px; }
  .badge { background:rgba(0,0,0,.6); backdrop-filter:blur(6px); border-radius:999px; font-size:11px; padding:2px 8px; }
  .badge.hdr { background:rgba(255,159,10,.9); color:#221600; font-weight:600; }
  .meta { padding:10px 12px 12px; }
  .title { font-size:13px; line-height:1.4; height:2.8em; overflow:hidden; }
  .sub { color:var(--label-3); font-size:12px; margin-top:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .empty { color:var(--label-2); padding:60px 0; text-align:center; grid-column:1/-1; }
  /* ---------- 底部抽屉播放器（iOS sheet） ---------- */
  dialog { border:0; padding:0; background:transparent; width:min(1000px,94vw); max-width:none; }
  dialog::backdrop { background:rgba(0,0,0,.6); backdrop-filter:blur(3px); }
  .sheet {
    background:rgba(28,28,30,.92); backdrop-filter:blur(24px) saturate(180%);
    border:1px solid var(--sep); border-radius:var(--r-lg); overflow:hidden;
    box-shadow:0 24px 70px rgba(0,0,0,.6);
    animation:sheetIn .28s var(--ease);
  }
  @keyframes sheetIn { from { transform:translateY(24px) scale(.98); opacity:0; } to { transform:none; opacity:1; } }
  .player { padding:14px 14px 0; }
  video { width:100%; background:#000; border-radius:var(--r-md); max-height:64vh; display:block; }
  .pmeta { padding:12px 18px 16px; position:relative; }
  .pmeta .t { font-size:15px; font-weight:600; line-height:1.35; }
  .pmeta .s { color:var(--label-2); font-size:12px; margin-top:5px; }
  .pmeta a { color:#8fc6ff; text-decoration:none; }
  .parts { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
  .parts button { background:var(--surface-2); color:var(--label-2); font-size:12px; padding:5px 12px; }
  .parts button.on { background:var(--blue); color:#fff; }
  .sheet-acts { display:flex; gap:8px; margin-top:14px; }
  .grabber { width:38px; height:5px; border-radius:999px; background:var(--surface-3); margin:8px auto 0; }
</style>
</head>
<body>
<header>
  <h1>我的 B 站媒体库</h1>
  <span class="count" id="count"></span>
  <span class="spacer"></span>
  <input id="q" placeholder="搜索标题 / UP / BV号" />
  <select id="folder"><option value="">全部收藏夹</option></select>
  <select id="up"><option value="">全部 UP</option></select>
  <select id="sort">
    <option value="favTime">按收藏时间</option>
    <option value="pubDate">按发布时间</option>
    <option value="title">按标题</option>
    <option value="size">按体积</option>
  </select>
</header>
<main id="grid"></main>

<dialog id="dlg"><div class="sheet">
  <div class="grabber"></div>
  <div class="player">
    <video id="video" controls preload="metadata"></video>
  </div>
  <div class="pmeta">
    <div class="t" id="p-title"></div>
    <div class="s" id="p-sub"></div>
    <div class="parts" id="p-parts"></div>
    <div class="sheet-acts">
      <button id="p-open" class="filled">打开 B 站原页面</button>
      <button id="p-close">关闭 (Esc)</button>
    </div>
  </div>
</div></dialog>

<script src="library.js"></script>
<script>
const DATA = window.__BILI_LIBRARY__ || { items: [], folders: [], ups: [] };
const grid = document.getElementById('grid');
const dlg = document.getElementById('dlg');
const video = document.getElementById('video');
let current = null;

const fmtDur = (s) => { const m = Math.floor(s/60), ss = Math.floor(s%60); const h = Math.floor(m/60); return h ? h+':'+String(m%60).padStart(2,'0')+':'+String(ss).padStart(2,'0') : m+':'+String(ss).padStart(2,'0'); };
const fmtSize = (n) => n ? (n/1024/1024/1024).toFixed(2)+' GB' : '-';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

for (const f of DATA.folders) { const o = document.createElement('option'); o.value = f; o.textContent = f; document.getElementById('folder').appendChild(o); }
for (const u of DATA.ups) { const o = document.createElement('option'); o.value = String(u.mid); o.textContent = u.name + '（' + u.count + '）'; document.getElementById('up').appendChild(o); }

function render() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const folder = document.getElementById('folder').value;
  const up = document.getElementById('up').value;
  const sort = document.getElementById('sort').value;

  let list = DATA.items.filter(it => {
    if (folder && it.folder !== folder) return false;
    if (up && String(it.up.mid) !== up) return false;
    if (q && !(it.title + ' ' + it.up.name + ' ' + it.bvid).toLowerCase().includes(q)) return false;
    return true;
  });
  list.sort((a,b) => sort === 'title' ? a.title.localeCompare(b.title,'zh') : sort === 'size' ? (b.size||0)-(a.size||0) : (b[sort]||0)-(a[sort]||0));

  document.getElementById('count').textContent = list.length + ' 个视频';
  if (!list.length) { grid.innerHTML = '<div class="empty">没有匹配的视频</div>'; return; }
  grid.innerHTML = list.map(it => \`
    <div class="card" data-id="\${it.bvid}" data-page="\${it.page}">
      <div class="thumb" style="background-image:url('\${encodeURI(it.poster || '')}')">
        <div class="badges">
          \${it.qualityLabel ? '<span class="badge">'+esc(it.qualityLabel)+'</span>' : ''}
          \${it.hdr ? '<span class="badge hdr">HDR</span>' : ''}
        </div>
        <div class="dur">\${fmtDur(it.duration)}</div>
      </div>
      <div class="meta">
        <div class="title" title="\${esc(it.title)}">\${esc(it.title)}\${it.page>1?' P'+it.page:''}</div>
        <div class="sub">\${esc(it.up.name)} · \${esc(it.folder||'')} · \${fmtSize(it.size)}</div>
      </div>
    </div>\`).join('');
}

grid.addEventListener('click', (e) => {
  const card = e.target.closest('.card'); if (!card) return;
  const page = Number(card.dataset.page || 1);
  const group = DATA.items.filter(it => it.bvid === card.dataset.id).sort((a,b)=>a.page-b.page);
  if (!group.length) return;
  play(group.find(g => g.page === page) || group[0], group);
});

function play(item, group) {
  current = item;
  document.getElementById('p-title').textContent = item.title + (item.partTitle ? ' · ' + item.partTitle : '');
  document.getElementById('p-sub').innerHTML = \`\${esc(item.up.name)} · \${esc(item.folder||'')} · \${fmtDur(item.duration)} · \${fmtSize(item.size)}\`;
  video.poster = item.poster ? encodeURI(item.poster) : '';
  video.src = encodeURI(item.video);
  video.querySelectorAll('track').forEach(t => t.remove());
  for (const sub of item.subtitles || []) {
    const tr = document.createElement('track');
    tr.kind = 'subtitles'; tr.label = sub.format.toUpperCase();
    tr.src = encodeURI(sub.file);
    if (sub.format === 'ass') tr.default = true;
    video.appendChild(tr);
  }
  document.getElementById('p-parts').innerHTML = group.map(g => \`<button data-page="\${g.page}" class="\${g.page===item.page?'on':''}">P\${g.page}\${g.partTitle?' '+esc(g.partTitle):''}</button>\`).join('');
  document.getElementById('p-parts').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const page = Number(b.dataset.page);
    play(group.find(g => g.page === page) || group[0], group);
  };
  if (!dlg.open) dlg.showModal();
  video.play().catch(() => {});
}

document.getElementById('p-open').onclick = () => { if (current) window.open('https://www.bilibili.com/video/' + current.bvid, '_blank'); };
document.getElementById('p-close').onclick = () => { dlg.close(); video.pause(); };
dlg.addEventListener('close', () => video.pause());
document.getElementById('q').oninput = render;
document.getElementById('folder').onchange = render;
document.getElementById('up').onchange = render;
document.getElementById('sort').onchange = render;
document.addEventListener('keydown', (e) => {
  if (!dlg.open) return;
  if (e.key === 'Escape') { e.preventDefault(); dlg.close(); }
  else if (e.key === ' ') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
  else if (e.key === 'ArrowRight') video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
  else if (e.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 5);
});
render();
</script>
</body>
</html>`;
}
