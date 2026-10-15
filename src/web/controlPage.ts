/** 控制端页面（单文件，无需构建产物拷贝） */
export function renderControlPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>bili 下载控制端</title>
<style>
  :root { color-scheme: dark; --bg:#0f1115; --panel:#171a21; --line:#252a33; --text:#e6e8ee; --muted:#8b93a7; --accent:#4da3ff; --ok:#3ecf8e; --warn:#f5a623; --err:#ff5c5c; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 -apple-system,"PingFang SC",sans-serif; }
  header { padding:14px 20px; border-bottom:1px solid var(--line); display:flex; gap:20px; align-items:center; flex-wrap:wrap; }
  h1 { font-size:16px; margin:0; }
  .stats { display:flex; gap:16px; color:var(--muted); font-size:13px; flex-wrap:wrap; }
  .stats b { color:var(--text); font-weight:600; }
  main { padding:16px 20px; display:grid; grid-template-columns: 1fr 320px; gap:16px; }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th,td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); vertical-align:middle; }
  th { color:var(--muted); font-weight:500; }
  .bar { height:6px; background:#22262e; border-radius:3px; overflow:hidden; min-width:80px; }
  .bar > i { display:block; height:100%; background:var(--accent); }
  .badge { font-size:11px; padding:1px 6px; border-radius:4px; background:#22262e; color:var(--muted); margin-right:4px; }
  .badge.hdr { background:#3a2a12; color:var(--warn); }
  .badge.ytdlp { background:#2a2136; color:#c39bf5; }
  .stage { font-size:11px; padding:1px 6px; border-radius:4px; background:#22262e; }
  /* 速度列固定宽 + 等宽数字，避免速度变化时整列跳动 */
  td.speed, th.speed { width:96px; min-width:96px; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .stage.done { background:#123024; color:var(--ok); }
  .stage.failed { background:#331616; color:var(--err); }
  .stage.downloading { background:#132639; color:var(--accent); }
  button { background:#22262e; color:var(--text); border:1px solid var(--line); border-radius:6px; padding:4px 8px; font-size:12px; cursor:pointer; }
  button:hover { border-color:var(--accent); }
  .row-actions { display:flex; gap:4px; }
  .controls { display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
  label { color:var(--muted); font-size:12px; display:block; margin:8px 0 4px; }
  input, select { background:#0f1115; color:var(--text); border:1px solid var(--line); border-radius:6px; padding:4px 6px; width:100%; }
  #logs { height:320px; overflow:auto; font-family:ui-monospace,Menlo,monospace; font-size:11px; white-space:pre-wrap; color:var(--muted); }
  .err { color:var(--err); font-size:11px; }
  .dash { margin:16px 20px 0; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; }
  .card { background:#12151b; border:1px solid var(--line); border-radius:8px; padding:10px 12px; }
  .card .k { color:var(--muted); font-size:12px; }
  .card .v { font-size:20px; font-weight:600; margin-top:2px; }
  .card .s { color:var(--muted); font-size:11px; margin-top:2px; }
  .dash-actions { display:flex; gap:8px; align-items:center; margin-top:12px; flex-wrap:wrap; }
  .dash-actions .muted { color:var(--muted); font-size:12px; }
  .dash-actions a { text-decoration:none; }
  .tabs { display:flex; gap:6px; margin-bottom:6px; }
  .tab { flex:1; }
  .tab.active { background:#17324d; border-color:#2b5d8c; }
  .usage { margin-top:10px; display:flex; align-items:center; gap:10px; font-size:12px; color:var(--muted); }
  .usage .bar { flex:1; }
  .usage .bar > i.over { background:var(--err); }
  .usage .bar > i.near { background:var(--warn); }
  button.primary { background:#17324d; border-color:#2b5d8c; }
</style>
</head>
<body>
<header>
  <h1>bili 下载控制端</h1>
  <div class="stats">
    <span>队列 <b id="s-status">-</b></span>
    <span>剩余 <b id="s-remaining">0</b></span>
    <span>在途 <b id="s-inflight">0</b></span>
    <span>完成 <b id="s-done">0</b></span>
    <span>失败 <b id="s-failed">0</b></span>
    <span>已下载 <b id="s-bytes">0</b></span>
  </div>
  <div class="controls">
    <button id="btn-pause">暂停队列</button>
    <button id="btn-resume">继续</button>
    <button id="btn-refresh">刷新</button>
  </div>
</header>
<section class="panel dash">
  <div class="cards">
    <div class="card"><div class="k">任务总数</div><div class="v" id="d-total">-</div><div class="s" id="d-total-sub">排队 / 剩余</div></div>
    <div class="card"><div class="k">进行中</div><div class="v" id="d-running">0</div><div class="s" id="d-running-sub">下载 / 转码</div></div>
    <div class="card"><div class="k">已完成</div><div class="v" id="d-done">0</div><div class="s" id="d-done-sub">失败 / 剩余</div></div>
    <div class="card"><div class="k">已下载视频</div><div class="v" id="d-videos">0</div><div class="s" id="d-videos-sub">占用空间</div></div>
    <div class="card"><div class="k">总下载速度</div><div class="v" id="d-speed">0 MB/s</div><div class="s" id="d-speed-sub">实时合计</div></div>
    <div class="card"><div class="k">磁盘剩余</div><div class="v" id="d-free">-</div><div class="s" id="d-free-sub">所在卷容量</div></div>
    <div class="card"><div class="k">登录态</div><div class="v" id="d-auth">-</div><div class="s" id="d-auth-sub">会员状态</div></div>
  </div>
  <div class="dash-actions">
    <button id="btn-dl" class="primary">暂停下载</button>
    <button id="btn-mux" class="primary">暂停转码</button>
    <a href="/library" target="_blank" rel="noreferrer"><button>打开媒体库</button></a>
    <button id="btn-clean-cache">清理已完成缓存</button>
    <span class="muted" id="d-root"></span>
  </div>
  <div class="usage">
    <span id="d-usage-text">outputs 占用</span>
    <div class="bar"><i id="d-usage-bar" style="width:0%"></i></div>
  </div>
</section>
<main>
  <section class="panel">
    <div class="controls">
      <input id="q" placeholder="搜索标题 / 文件名" style="max-width:280px" />
      <select id="filter" style="max-width:160px">
        <option value="">全部状态</option>
        <option value="downloading">下载中</option>
        <option value="muxing">封装中</option>
        <option value="queued">排队中</option>
        <option value="failed">失败</option>
        <option value="done">完成</option>
      </select>
    </div>
    <table>
      <thead><tr><th>任务</th><th>画质</th><th>状态</th><th>进度</th><th class="speed">速度</th><th>操作</th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </section>
  <aside style="display:flex;flex-direction:column;gap:16px">
    <section class="panel">
      <h1 style="font-size:13px;margin-bottom:8px">添加下载</h1>
      <div class="tabs">
        <button id="tab-fav" class="tab active">收藏夹</button>
        <button id="tab-up" class="tab">UP 主</button>
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
        <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
          <button id="btn-add-fav" class="primary">加入队列</button>
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
        <div style="margin-top:10px"><button id="btn-add-up" class="primary">抓取并加入队列</button></div>
      </div>
      <div id="add-msg" style="font-size:12px;color:var(--muted);margin-top:8px"></div>
    </section>
    <section class="panel">
      <h1 style="font-size:13px;margin-bottom:8px">热改配置</h1>
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
      <div style="margin-top:10px"><button id="btn-save">保存配置</button></div>
    </section>
    <section class="panel">
      <h1 style="font-size:13px;margin-bottom:8px">日志</h1>
      <div id="logs"></div>
    </section>
  </aside>
</main>
<script>
const state = { tasks: [], stats: {}, dash: null };
const fmtBytes = (n) => { const u=['B','KB','MB','GB','TB']; let v=n||0,i=0; while(v>=1024&&i<u.length-1){v/=1024;i++;} return v.toFixed(i?1:0)+' '+u[i]; };
const fmtSpeed = (bps) => (bps ? (bps/1048576).toFixed(1)+' MB/s' : '0 MB/s');
const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

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

  const dl = document.getElementById('btn-dl');
  const q = d.queue || {};
  // paused 但还有在飞任务时如实显示，避免「显示继续下载却还在跑」的观感矛盾
  dl.textContent = q.status === 'paused'
    ? (q.inflight > 0 ? '暂停中…（在飞 ' + q.inflight + '）' : '继续下载')
    : '暂停下载';
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
  if (!confirm('删除已完成/已跳过任务遗留的中间分片（未完成任务的分片保留）？')) return;
  const btn = document.getElementById('btn-clean-cache');
  btn.disabled = true; btn.textContent = '清理中…';
  const res = await (await fetch('/api/cache/clean', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ scope: 'done' }) })).json();
  btn.disabled = false; btn.textContent = '清理已完成缓存';
  alert(res.ok ? '已释放 ' + fmtBytes(res.bytes) + '（' + res.removed + ' 个目录）' : ('清理失败：' + (res.error || '')));
  loadDashboard();
};

// 添加下载：收藏夹 / UP 主两个入口
const msg = (t) => { document.getElementById('add-msg').textContent = t; };
function switchTab(which) {
  document.getElementById('pane-fav').style.display = which === 'fav' ? '' : 'none';
  document.getElementById('pane-up').style.display = which === 'up' ? '' : 'none';
  document.getElementById('tab-fav').className = 'tab' + (which === 'fav' ? ' active' : '');
  document.getElementById('tab-up').className = 'tab' + (which === 'up' ? ' active' : '');
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
  msg(res.ok ? ('已加入 ' + res.added + ' 个任务（匹配 ' + res.matched + ' 个稿件）') : ('失败：' + (res.error || '')));
  loadTasks(); loadStats(); loadDashboard();
};

document.getElementById('btn-scan').onclick = async () => {
  const btn = document.getElementById('btn-scan');
  btn.disabled = true; msg('正在重新扫描收藏夹…');
  const res = await (await fetch('/api/scan', { method: 'POST' })).json();
  btn.disabled = false;
  msg(res.ok ? ('扫描完成：' + res.videos + ' 个视频，' + res.dirs + ' 个目录') : ('失败：' + (res.error || '')));
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
  msg(res.ok ? (res.up + '（mid=' + res.mid + '）共 ' + res.total + ' 个投稿，已加入 ' + res.added + ' 个任务 → ' + res.dir) : ('失败：' + (res.error || '')));
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
  document.getElementById('s-status').textContent = state.stats.status || '-';
  document.getElementById('s-remaining').textContent = state.stats.remaining ?? 0;
  document.getElementById('s-inflight').textContent = state.stats.inflight ?? 0;
  document.getElementById('s-done').textContent = state.stats.done ?? 0;
  document.getElementById('s-failed').textContent = state.stats.failed ?? 0;
  document.getElementById('s-bytes').textContent = fmtBytes(state.stats.bytesDone);
}
async function loadLogs() {
  const res = await fetch('/api/logs/tail');
  const data = await res.json();
  const el = document.getElementById('logs');
  el.textContent = (data.lines || []).join('\\n');
  el.scrollTop = el.scrollHeight;
}

function render() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const f = document.getElementById('filter').value;
  const rows = state.tasks.filter(t => (!f || t.stage === f) && (!q || (t.title+' '+t.baseName).toLowerCase().includes(q)));
  document.getElementById('rows').innerHTML = rows.slice(0, 120).map(t => {
    const pct = t.progress && t.progress.bytesTotal ? Math.round(t.progress.bytesDone / t.progress.bytesTotal * 100) : 0;
    const speed = t.progress?.speedBps ? fmtBytes(t.progress.speedBps) + '/s' : '-';
    return \`<tr>
      <td title="\${escapeHtml(t.title)}">\${escapeHtml(t.baseName)}<div class="err">\${t.error ? escapeHtml(t.error.slice(0,80)) : ''}</div></td>
      <td>\${t.quality ? '<span class="badge">'+t.quality+'</span>' : ''}\${t.hdr ? '<span class="badge hdr">HDR</span>' : ''}\${t.fps ? '<span class="badge">'+t.fps+'fps</span>' : ''}<span class="badge \${t.engine==='ytdlp'?'ytdlp':''}">\${t.engine}</span></td>
      <td><span class="stage \${t.stage}">\${t.stage}</span></td>
      <td><div class="bar"><i style="width:\${pct}%"></i></div><div style="font-size:11px;color:var(--muted)">\${pct}%</div></td>
      <td class="speed">\${speed}</td>
      <td><div class="row-actions">
        <button data-act="prioritize" data-id="\${t.id}">插队</button>
        <button data-act="retry" data-id="\${t.id}">重试</button>
        <button data-act="cancel" data-id="\${t.id}">取消</button>
      </div></td>
    </tr>\`;
  }).join('');
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

document.getElementById('rows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  await fetch('/api/tasks/' + btn.dataset.id + '/' + btn.dataset.act, { method: 'POST' });
  loadTasks(); loadStats();
});
document.getElementById('btn-pause').onclick = () => fetch('/api/queue/pause', { method:'POST' }).then(loadStats);
document.getElementById('btn-resume').onclick = () => fetch('/api/queue/resume', { method:'POST' }).then(loadStats);
document.getElementById('btn-refresh').onclick = () => { loadTasks(); loadStats(); loadLogs(); };
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
  alert('配置已更新（新任务立即生效）');
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
  };
  setInterval(() => { loadDashboard(); loadStats(); loadLogs(); }, 5000);
  setInterval(loadTasks, 10000);
})();
</script>
</body>
</html>`;
}
