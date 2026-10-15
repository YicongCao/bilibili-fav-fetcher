/** 媒体库索引页（数据用 <script src="library.js"> 注入，兼容 file:// 直接打开） */
export function renderLibraryPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>我的 B 站媒体库</title>
<style>
  :root { color-scheme: dark; --bg:#0f1115; --panel:#171a21; --line:#252a33; --text:#e6e8ee; --muted:#8b93a7; --accent:#4da3ff; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 -apple-system,"PingFang SC",sans-serif; }
  header { position:sticky; top:0; z-index:10; background:var(--bg); border-bottom:1px solid var(--line); padding:12px 20px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  input, select { background:#0f1115; color:var(--text); border:1px solid var(--line); border-radius:6px; padding:6px 8px; }
  #q { min-width:220px; flex:1; max-width:360px; }
  .count { color:var(--muted); font-size:13px; }
  main { padding:16px 20px; display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px; overflow:hidden; cursor:pointer; display:flex; flex-direction:column; }
  .card:hover { border-color:var(--accent); }
  .thumb { position:relative; aspect-ratio:16/9; background:#000 center/cover no-repeat; }
  .thumb .dur { position:absolute; right:6px; bottom:6px; background:rgba(0,0,0,.7); border-radius:4px; padding:1px 5px; font-size:11px; }
  .thumb .badges { position:absolute; left:6px; top:6px; display:flex; gap:4px; }
  .badge { background:rgba(0,0,0,.65); border-radius:4px; font-size:11px; padding:1px 5px; }
  .badge.hdr { background:rgba(245,166,35,.85); color:#221600; }
  .meta { padding:8px 10px; }
  .title { font-size:13px; line-height:1.4; height:2.8em; overflow:hidden; }
  .sub { color:var(--muted); font-size:12px; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  dialog { border:1px solid var(--line); border-radius:12px; background:var(--panel); color:var(--text); padding:0; width:min(960px,92vw); }
  dialog::backdrop { background:rgba(0,0,0,.6); }
  .player { padding:10px; }
  video { width:100%; background:#000; border-radius:8px; max-height:70vh; }
  .pmeta { padding:0 12px 14px; color:var(--muted); font-size:13px; }
  .pmeta b { color:var(--text); }
  .parts { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
  .parts button { background:#22262e; border:1px solid var(--line); color:var(--text); border-radius:6px; padding:3px 8px; font-size:12px; cursor:pointer; }
  .close { position:absolute; right:10px; top:6px; }
  .pmeta-wrap { position:relative; }
</style>
</head>
<body>
<header>
  <strong>我的 B 站媒体库</strong>
  <input id="q" placeholder="搜索标题 / UP / BV号" />
  <select id="folder"><option value="">全部收藏夹</option></select>
  <select id="up"><option value="">全部 UP</option></select>
  <select id="sort">
    <option value="favTime">按收藏时间</option>
    <option value="pubDate">按发布时间</option>
    <option value="title">按标题</option>
    <option value="size">按体积</option>
  </select>
  <span class="count" id="count"></span>
</header>
<main id="grid"></main>

<dialog id="dlg">
  <div class="pmeta-wrap">
    <div class="player">
      <video id="video" controls preload="metadata"></video>
    </div>
    <div class="pmeta">
      <div><b id="p-title"></b></div>
      <div id="p-sub"></div>
      <div class="parts" id="p-parts"></div>
      <div style="margin-top:10px"><button id="p-close">关闭 (Esc)</button></div>
    </div>
  </div>
</dialog>

<script src="library.js"></script>
<script>
const DATA = window.__BILI_LIBRARY__ || { items: [], folders: [], ups: [] };
const grid = document.getElementById('grid');
const dlg = document.getElementById('dlg');
const video = document.getElementById('video');

const fmtDur = (s) => { const m = Math.floor(s/60), ss = Math.floor(s%60); const h = Math.floor(m/60); return h ? h+':'+String(m%60).padStart(2,'0')+':'+String(ss).padStart(2,'0') : m+':'+String(ss).padStart(2,'0'); };
const fmtSize = (n) => n ? (n/1024/1024/1024).toFixed(2)+' GB' : '-';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// 填充筛选项
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
  grid.innerHTML = list.map(it => \`
    <div class="card" data-id="\${it.bvid}">
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
  openVideo(card.dataset.id);
});

function openVideo(bvid) {
  const group = DATA.items.filter(it => it.bvid === bvid).sort((a,b)=>a.page-b.page);
  if (!group.length) return;
  play(group[0], group);
}

function play(item, group) {
  document.getElementById('p-title').textContent = item.title + (item.partTitle ? ' · ' + item.partTitle : '');
  document.getElementById('p-sub').innerHTML = \`\${esc(item.up.name)} · \${esc(item.folder||'')} · \${fmtDur(item.duration)} · \${fmtSize(item.size)} · <a href="https://www.bilibili.com/video/\${item.bvid}" target="_blank">原页面</a>\`;
  video.poster = item.poster ? encodeURI(item.poster) : '';
  video.src = encodeURI(item.video);
  // 字幕轨道
  video.querySelectorAll('track').forEach(t => t.remove());
  for (const sub of item.subtitles || []) {
    const tr = document.createElement('track');
    tr.kind = 'subtitles'; tr.label = sub.format.toUpperCase();
    tr.src = encodeURI(sub.file);
    if (sub.format === 'ass') tr.default = true;
    video.appendChild(tr);
  }
  document.getElementById('p-parts').innerHTML = group.map(g => \`<button data-page="\${g.page}">P\${g.page}\${g.partTitle?' '+esc(g.partTitle):''}</button>\`).join('');
  document.getElementById('p-parts').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const page = Number(b.dataset.page);
    play(group.find(g => g.page === page) || group[0], group);
  };
  dlg.showModal();
  video.play().catch(() => {});
}

document.getElementById('p-close').onclick = () => { dlg.close(); video.pause(); };
dlg.addEventListener('close', () => video.pause());
document.getElementById('q').oninput = render;
document.getElementById('folder').onchange = render;
document.getElementById('up').onchange = render;
document.getElementById('sort').onchange = render;
render();
</script>
</body>
</html>`;
}
