const sb = supabase.createClient(new URL(SUPABASE_URL.trim()).origin, SUPABASE_ANON_KEY.trim());
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
addEventListener('DOMContentLoaded', () => {
  if (location.pathname.includes('/beta/')) return;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;z-index:200;left:0;right:0;top:0;padding:10px 14px;background:#b00020;color:#fff;font:14px system-ui,sans-serif';
  d.textContent = 'Wrong file: the beta app.js was uploaded outside the beta folder.';
  document.body.append(d);
});

let me, profile, sub, typingCh, isMod = false, isBeta = false;

const BADGES = {
  mod: { name: 'Moderator', color: '#3b82f6',
    icon: '<g transform="translate(-.6 .6)"><line x1="4.9" y1="11.6" x2="9.5" y2="7" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><rect x="7.7" y="5" width="5" height="2.6" rx=".6" fill="#fff" transform="rotate(45 10.2 6.3)"/></g>' },
  beta: { name: 'Beta tester', color: '#f97316',
    icon: '<line x1="5.9" y1="3.6" x2="10.1" y2="3.6" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/><path d="M6.8 3.8V10.4a1.2 1.2 0 0 0 2.4 0V3.8" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.8 8h2.4v2.4a1.2 1.2 0 0 1-2.4 0z" fill="#fff"/>' }
};
const badge = k => BADGES[k]
  ? `<svg class="badge" viewBox="0 0 16 16" role="img" aria-label="${BADGES[k].name}"><title>${BADGES[k].name}</title><circle cx="8" cy="8" r="8" fill="${BADGES[k].color}"/>${BADGES[k].icon}</svg>`
  : '';

const setTheme = t => { try { localStorage.setItem('theme', t); } catch {} document.documentElement.dataset.theme = t; };
addEventListener('storage', e => { if (e.key === 'theme') document.documentElement.dataset.theme = e.newValue || 'dark'; });

function paintAvatar(el, p) {
  el.textContent = ''; el.style.backgroundImage = '';
  if (p.avatar_url) el.style.backgroundImage = `url(${JSON.stringify(p.avatar_url)})`;
  else el.textContent = p.username[0].toUpperCase();
}

async function signOutNow() {
  try { await sb.auth.signOut({ scope: 'local' }); } catch {}
  try { Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k)); } catch {}
  location.href = 'index.html';
}
addEventListener('storage', e => {
  if (e.key && e.key.startsWith('sb-') && e.key.endsWith('-auth-token') && !e.newValue) location.reload();
});

function showBan() {
  const g = document.createElement('div');
  g.className = 'gate'; g.style.zIndex = 100;
  g.innerHTML = `<div class="ban"><h2>You are banned</h2><p>${esc(BAN_MESSAGE)}</p><a href="${esc(BAN_BUTTON_URL)}">${esc(BAN_BUTTON_TEXT)}</a></div>`;
  document.body.append(g);
  return new Promise(() => {});
}

function login() {
  const g = document.createElement('div');
  g.className = 'gate';
  g.innerHTML = `<form><h2>Sign in</h2><input name="u" placeholder="Username" autocomplete="username" required>
    <input name="p" type="password" placeholder="Password" autocomplete="current-password" required>
    <button>Sign in</button><p></p><a href="../signup.html" style="text-align:center;text-decoration:underline">Create an account</a></form>`;
  document.body.append(g);
  const f = $('form', g), msg = $('p', g);
  f.onsubmit = async e => {
    e.preventDefault();
    msg.textContent = '';
    const email = f.u.value.trim().toLowerCase() + '@gmail.com';
    const { error } = await sb.auth.signInWithPassword({ email, password: f.p.value });
    if (error) return msg.textContent = /fetch/i.test(error.message)
      ? 'Cannot reach Supabase. Check SUPABASE_URL in config.js, that your project is not paused, and that no ad blocker is blocking supabase.co.'
      : error.message;
    location.reload();
  };
  return new Promise(() => {});
}

const dot = n => `<span class="dot">${n > 99 ? '99+' : n}</span>`;
const arr = x => Array.isArray(x) ? x : typeof x === 'string' ? x.replace(/[{}]/g, '').split(',').filter(Boolean) : [];

function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const x = v => Math.round(255 * v).toString(16).padStart(2, '0');
  return '#' + x(f(0)) + x(f(8)) + x(f(4));
}
const autoColor = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return hslHex(h % 360, 55, 42); };
function paintBanner(el, p) {
  el.style.backgroundColor = p.banner_color || autoColor(p.id);
  el.style.backgroundImage = p.banner_url ? `url(${JSON.stringify(p.banner_url)})` : '';
  el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center';
}
document.head.insertAdjacentHTML('beforeend', `<style>
.pcard{width:min(600px,94vw);background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:0 10px 40px #0009}
.pbanner{height:120px;position:relative}
.pclose{position:absolute;top:8px;right:8px;width:30px;height:30px;padding:0;border-radius:50%;background:#0008;color:#fff;border:0;font-size:18px;line-height:1}
.pbody{display:flex;gap:20px;padding:0 28px 32px;min-height:170px}
.pfp.huge{width:120px;height:120px;font-size:44px;margin-top:-60px;border:4px solid var(--panel);flex:none;position:relative;z-index:1}
.pinfo{min-width:0;padding-top:16px}
.pname{margin:0;font-size:24px;overflow-wrap:anywhere}
.pdesc{margin:10px 0 0;font-size:16px;line-height:1.5;color:var(--mute);overflow-wrap:anywhere;white-space:pre-wrap}
.pact{margin-top:12px}
.pbannerprev{height:90px;border-radius:12px;border:1px solid var(--line);margin-bottom:12px}
.msg .head b,.msg .pfp{cursor:pointer}.msg .head b:hover,.msg.uh .head b{text-decoration:underline}
#top.plink{cursor:pointer}#top.plink:hover{text-decoration:underline}
</style>`);

async function openProfile(uid) {
  let { data: p } = await sb.from('profile_badges').select('id,username,avatar_url,badge,description,banner_url,banner_color').eq('id', uid).maybeSingle();
  if (!p) ({ data: p } = await sb.from('profiles').select('id,username,avatar_url,description').eq('id', uid).maybeSingle());
  if (!p) return alert('Could not load that profile.');
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="pcard"><div class="pbanner"><button class="pclose" aria-label="Close">&times;</button></div>
    <div class="pbody"><div class="pfp huge"></div><div class="pinfo"><h3 class="pname"></h3><p class="pdesc"></p></div></div></div>`;
  document.body.append(m);
  paintBanner($('.pbanner', m), p);
  paintAvatar($('.pfp', m), p);
  $('.pname', m).innerHTML = esc(p.username) + badge(p.badge);
  $('.pdesc', m).textContent = p.description || 'No description yet.';
  if (uid === me.id) {
    const b = document.createElement('button');
    b.className = 'pact'; b.textContent = 'Edit profile';
    b.onclick = () => window.open('settings.html', '_blank', 'noopener');
    $('.pinfo', m).append(b);
  }
  const onKey = e => e.key === 'Escape' && close();
  const close = () => { m.remove(); removeEventListener('keydown', onKey); };
  addEventListener('keydown', onKey);
  m.onclick = e => { if (e.target === m) close(); };
  $('.pclose', m).onclick = close;
}

function showNoBeta() {
  const g = document.createElement('div');
  g.className = 'gate'; g.style.zIndex = 100;
  g.innerHTML = '<div class="ban"><h2>Beta testers only</h2><p>Your account doesn’t have access to the beta.</p><a href="../index.html">Back to the app</a></div>';
  document.body.append(g);
  return new Promise(() => {});
}

async function auth(allowMods = false) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) await login();
  me = session.user;
  const { data: p } = await sb.from('profiles').select('*').eq('id', me.id).single();
  if (!p) { await sb.auth.signOut(); location.reload(); return new Promise(() => {}); }
  profile = p;
  if (profile.banned) await showBan();
  isMod = !!(await sb.rpc('is_mod')).data;
  isBeta = !!(await sb.rpc('is_beta')).data;
  if (!isBeta && !(allowMods && isMod)) await showNoBeta();
  profile.badge = (await sb.from('profile_badges').select('badge').eq('id', me.id).maybeSingle()).data?.badge || null;
}

async function boot(page) {
  await auth(page === 'changes');
  document.head.insertAdjacentHTML('beforeend', `<style>.tabs{gap:8px;padding:14px 8px}.tabs a{padding:7px 14px}.badge{width:16px;height:16px;vertical-align:-3px;margin-left:5px;flex:none}
.dot{display:inline-block;min-width:18px;height:18px;line-height:18px;padding:0 5px;border-radius:9px;background:#e53935;color:#fff;font-size:11px;font-weight:700;text-align:center;margin-left:6px;vertical-align:1px}
.send{position:relative}
.mpop{position:absolute;left:14px;bottom:100%;margin-bottom:6px;width:min(320px,80%);max-height:220px;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:4px;box-shadow:0 6px 20px #0008;z-index:15}
.mopt{padding:7px 10px;border-radius:6px;cursor:pointer}.mopt.on,.mopt:hover{background:var(--sel)}
.mention{background:rgba(59,130,246,.25);border-radius:4px;padding:0 3px;font-weight:600}
.msg.mentioned{background:rgba(245,158,11,.12);box-shadow:inset 3px 0 0 #f59e0b;border-radius:4px;margin-left:-10px;margin-right:-8px;padding:2px 8px 2px 10px}
</style>`);
  $('#side').innerHTML = `
    <div class="betatag">BETA</div><div class="prof"><div class="pfp"></div>
      <a class="who" href="index.html"><b>${esc(profile.username)}${badge(profile.badge)}</b><small>${esc(profile.description || 'No description yet')}</small></a>
      <a class="cog" href="settings.html" target="_blank" rel="noopener" title="Settings">&#9881;</a></div>
    <div class="tabs"><a href="dms.html" class="${page === 'dms' ? 'on' : ''}">DMs</a><a href="rooms.html" class="${page === 'rooms' ? 'on' : ''}">Rooms</a><a href="changes.html" class="${page === 'changes' ? 'on' : ''}">Changes</a></div>
    <div id="list"></div><div class="foot"></div>`;
  paintAvatar($('.pfp'), profile);
  if (page === 'home') $('#top').hidden = true;
}

function addButton(label, fn) {
  const b = document.createElement('button');
  b.textContent = label; b.onclick = fn;
  $('.foot').append(b);
  return b;
}

const saveOrder = ids => sb.from('list_order').upsert(ids.map((item_id, position) => ({ user_id: me.id, item_id, position })));
async function applyOrder(items) {
  const { data } = await sb.from('list_order').select('item_id,position').eq('user_id', me.id);
  const pos = Object.fromEntries((data || []).map(r => [r.item_id, r.position]));
  return items.map((it, i) => ({ it, k: pos[it.id] ?? 1e9 + i })).sort((x, y) => x.k - y.k).map(x => x.it);
}

function list(items, selected, onPick, emptyText, onMenu) {
  const el = $('#list');
  el.innerHTML = items.length ? '' : `<div class="hint">${emptyText}</div>`;
  const ids = () => [...el.querySelectorAll('.item')].map(x => x.dataset.id);
  let dragged = null, before = '';
  for (const it of items) {
    const b = document.createElement('div');
    b.className = 'item' + (it.id === selected ? ' on' : '');
    b.setAttribute('role', 'button'); b.tabIndex = 0; b.draggable = true; b.dataset.id = it.id;
    const inner = esc(it.label) + (it.badge ? badge(it.badge) : '') + (it.count ? dot(it.count) : '') + (it.sub ? `<small>${esc(it.sub)}</small>` : '');
    if (it.isRoom) {
      b.classList.add('hasicon');
      b.innerHTML = `<span class="itxt">${inner}</span>`;
      b.prepend(roomIcon(it));
    } else b.innerHTML = inner;
    b.onclick = () => onPick(it);
    b.onkeydown = e => { if (e.key === 'Enter') onPick(it); };
    if (onMenu) b.oncontextmenu = e => { e.preventDefault(); onMenu(it, e); };
    b.ondragstart = e => {
      dragged = b; before = ids().join();
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.id);
      setTimeout(() => b.classList.add('drag'));
    };
    b.ondragover = e => {
      if (!dragged) return;
      e.preventDefault();
      if (dragged === b) return;
      const r = b.getBoundingClientRect();
      el.insertBefore(dragged, e.clientY < r.top + r.height / 2 ? b : b.nextSibling);
    };
    b.ondrop = e => e.preventDefault();
    b.ondragend = () => {
      b.classList.remove('drag'); dragged = null;
      if (ids().join() !== before) saveOrder(ids());
    };
    el.append(b);
  }
}

const closeMenu = () => $('.ctx')?.remove();
addEventListener('click', closeMenu);
addEventListener('keydown', e => e.key === 'Escape' && closeMenu());
addEventListener('scroll', closeMenu, true);
function ctxMenu(x, y, items) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'ctx';
  for (const [t, fn, bad] of items) {
    const b = document.createElement('button');
    if (bad) b.className = 'danger';
    b.textContent = t; b.onclick = () => { closeMenu(); fn(); };
    m.append(b);
  }
  document.body.append(m);
  m.style.left = Math.max(4, Math.min(x, innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = Math.max(4, Math.min(y, innerHeight - m.offsetHeight - 8)) + 'px';
}

document.head.insertAdjacentHTML('beforeend', `<style>
.betatag{background:var(--text);color:var(--bg);font-size:11px;font-weight:700;letter-spacing:.1em;text-align:center;padding:3px}
.item.hasicon{display:flex;align-items:center;gap:10px}
.itxt{min-width:0;flex:1}
.ricon{flex:none;width:36px;height:36px;border-radius:50%;background-size:cover;background-position:center;display:grid;place-items:center;color:#fff;font-weight:700}
.ricon.sm{width:28px;height:28px;font-size:13px}
.ricon.big{width:64px;height:64px;font-size:26px}
#top{align-items:center}
.rgear{margin-left:auto;padding:4px 12px}
.rbar{display:flex;align-items:center;gap:10px;padding:6px 14px;background:var(--raise);border-top:1px solid var(--line);font-size:13px;color:var(--mute)}
.rbar b{color:var(--text)}
.rbar .rping{padding:2px 8px;font-size:12px;margin-left:auto}
.rbar .rx{padding:0 8px;font-size:18px;line-height:1.4}
.rref{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--mute);margin-bottom:2px;cursor:pointer;overflow:hidden;white-space:nowrap}
.rref:hover{color:var(--text)}
.rref .rtxt{overflow:hidden;text-overflow:ellipsis}
.fwd{font-size:12px;color:var(--mute);font-style:italic;margin-bottom:2px}
.msg.flash{animation:flash 1.6s}
@keyframes flash{0%,60%{background:rgba(59,130,246,.25)}100%{background:transparent}}
.fwdbox{width:min(460px,94vw)}
.fsearch{width:100%}
.flist{overflow:auto;display:grid;gap:2px;align-content:start;min-height:160px;max-height:50vh;color:var(--mute)}
.fhead{font-size:12px;color:var(--mute);text-transform:uppercase;letter-spacing:.06em;padding:8px 8px 2px}
.frow{padding:8px 10px;border-radius:8px;cursor:pointer;color:var(--text)}
.frow:hover{background:var(--hover)}
.frow.off{opacity:.45;cursor:not-allowed}
.rset{width:min(540px,94vw);overflow:auto}
.rsec{padding:8px 0;border-bottom:1px solid var(--line)}
.rbtns{display:flex;gap:8px;flex-wrap:wrap}
.nrow{display:flex;gap:8px}.nrow input{flex:1}
.clist{display:grid;gap:4px;margin-top:8px}
.crow{display:flex;align-items:center;gap:10px;padding:6px 8px;background:var(--bg);border:1px solid var(--line);border-radius:8px}
.crow.drag{opacity:.4}
.grip{cursor:grab;color:var(--mute)}
.cname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpanel{display:grid;gap:8px;margin-top:8px}
.tpanel select,.tpanel input{width:100%}
select{background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font:inherit}
.tsec{padding:8px 0}
.typing{height:18px;padding:0 20px;font-size:12px;color:var(--mute);animation:pulse 1.4s ease-in-out infinite}
.typing:empty{animation:none}
@keyframes pulse{0%,100%{opacity:.35}50%{opacity:.85}}
</style>`);

function roomIcon(r, cls = '') {
  const s = document.createElement('span');
  s.className = 'ricon ' + cls;
  if (r.icon_url) s.style.backgroundImage = `url(${JSON.stringify(r.icon_url)})`;
  else { s.textContent = (r.name || r.label || '?')[0].toUpperCase(); s.style.backgroundColor = autoColor(r.id); }
  return s;
}

function askText(title, label, value = '', max = 50) {
  return new Promise(res => {
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<form class="pick dlg" style="width:min(400px,92vw)"><h3></h3><label><span></span><input maxlength="${max}"></label><div class="row"><button type="button" class="x">Cancel</button><button>OK</button></div></form>`;
    document.body.append(m);
    $('h3', m).textContent = title;
    $('label span', m).textContent = label;
    const inp = $('input', m);
    inp.value = value; inp.focus(); inp.select();
    const done = v => { m.remove(); res(v); };
    $('.x', m).onclick = () => done(null);
    m.onclick = e => { if (e.target === m) done(null); };
    $('form', m).onsubmit = e => { e.preventDefault(); done(inp.value); };
  });
}

function sortable(el, sel, key, done) {
  let dragged = null, before = '';
  const ids = () => [...el.querySelectorAll(sel)].map(x => x.dataset[key]);
  el.ondragstart = e => {
    const t = e.target.closest(sel);
    if (!t) return;
    dragged = t; before = ids().join();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.dataset[key]);
    setTimeout(() => t.classList.add('drag'));
  };
  el.ondragover = e => {
    if (!dragged) return;
    e.preventDefault();
    const t = e.target.closest(sel);
    if (!t || t === dragged) return;
    const r = t.getBoundingClientRect();
    el.insertBefore(dragged, e.clientY < r.top + r.height / 2 ? t : t.nextSibling);
  };
  el.ondrop = e => e.preventDefault();
  el.ondragend = () => {
    if (!dragged) return;
    dragged.classList.remove('drag');
    const changed = ids().join() !== before;
    dragged = null;
    if (changed) done(ids());
  };
}

async function forwardDialog(msg) {
  if (!msg) return;
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = '<div class="pick fwdbox"><h3>Forward message</h3><input class="fsearch" placeholder="Search people, rooms or channels"><div class="flist">Loading…</div></div>';
  document.body.append(m);
  const onKey = e => e.key === 'Escape' && close();
  const close = () => { m.remove(); removeEventListener('keydown', onKey); };
  addEventListener('keydown', onKey);
  m.onclick = e => { if (e.target === m) close(); };
  const box = $('.flist', m), search = $('.fsearch', m);
  const [dmRes, roomRes] = await Promise.all([
    sb.from('dms').select('id,user_a,user_b'),
    sb.from('room_members').select('can_talk,rooms(id,name,owner_id)').eq('user_id', me.id)
  ]);
  const dms = dmRes.data || [];
  const rms = (roomRes.data || []).filter(r => r.rooms);
  const others = dms.map(d => d.user_a === me.id ? d.user_b : d.user_a);
  const { data: ps } = others.length ? await sb.from('profiles').select('id,username').in('id', others) : { data: [] };
  const { data: chs } = rms.length
    ? await sb.from('channels').select('id,name,room_id,read_only').in('room_id', rms.map(r => r.rooms.id)).order('position').order('created_at')
    : { data: [] };
  const people = dms.map((d, i) => ({ dm: d.id, uid: others[i], name: (ps || []).find(p => p.id === others[i])?.username || 'unknown' }));
  let found = [];
  const go = async (table, col, val) => {
    const { error } = await sb.from(table).insert({
      [col]: val, user_id: me.id, content: msg.content, forward_from: msg.forward_from || msg.user_id,
      ...(msg.image_url ? { image_url: msg.image_url } : {})
    });
    if (error) return alert(error.message);
    close();
  };
  const row = (label, fn, off) => {
    const r = document.createElement('div');
    r.className = 'frow' + (off ? ' off' : '');
    r.textContent = label;
    if (!off) r.onclick = fn;
    box.append(r);
  };
  const head = t => {
    const h = document.createElement('div');
    h.className = 'fhead'; h.textContent = t;
    box.append(h);
  };
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    box.innerHTML = '';
    const ppl = people.filter(p => p.name.toLowerCase().includes(q));
    const extra = found.filter(f => !people.some(p => p.uid === f.id));
    if (ppl.length || extra.length) {
      head('People');
      ppl.forEach(p => row('@' + p.name, () => go('dm_messages', 'dm_id', p.dm)));
      extra.forEach(f => row('@' + f.username + '  (start a DM)', async () => {
        const { data, error } = await sb.rpc('start_dm', { uname: f.username });
        if (error) return alert(error.message);
        go('dm_messages', 'dm_id', data);
      }));
    }
    for (const r of rms) {
      const own = r.rooms.owner_id === me.id;
      const list = (chs || []).filter(c => c.room_id === r.rooms.id && (!q || r.rooms.name.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)));
      if (!list.length) continue;
      head(r.rooms.name);
      list.forEach(c => row((c.read_only ? '🔒 ' : '# ') + c.name, () => go('room_messages', 'channel_id', c.id), c.read_only && !(own || r.can_talk)));
    }
    if (!box.children.length) box.textContent = 'No results.';
  };
  let t;
  search.oninput = () => {
    draw();
    clearTimeout(t);
    const q = search.value.trim().replace(/[%_]/g, '');
    if (q.length < 2) { found = []; return; }
    t = setTimeout(async () => {
      const { data } = await sb.from('profiles').select('id,username').ilike('username', q + '%').neq('id', me.id).limit(6);
      found = data || [];
      draw();
    }, 250);
  };
  draw();
  search.focus();
}

function timeoutText(until) {
  if (!until) return 'Not timed out.';
  const d = new Date(until);
  if (d <= new Date()) return 'Not timed out.';
  return d.getFullYear() >= 9000 ? 'Timed out forever.' : 'Timed out until ' + d.toLocaleString() + '.';
}

async function openChat(table, col, val, opts = {}) {
  const el = $('#content');
  el.innerHTML = `<div class="msgs"></div><div class="rbar" hidden></div><div class="typing"></div>` + (opts.locked ? `<div class="send locked">${esc(opts.lockedMsg || 'Only the room owner and people they allow can type in this channel.')}</div>` : `<form class="send"><input placeholder="Type a message" autocomplete="off" maxlength="2000"><button type="button" class="plus" title="Add an image or GIF">+</button><button>Send</button></form>`);
  const box = $('.msgs', el), profs = {}, rows = new Map(), refs = {};
  let replying = null;
  const rbar = $('.rbar', el);
  const typingBar = $('.typing', el);
  let typingNow = false, typingTimer;
  if (typingCh) sb.removeChannel(typingCh);
  const tch = typingCh = sb.channel(`typing-${table}-${val}`, { config: { presence: { key: me.id } } });
  tch.on('presence', { event: 'sync' }, () => {
    const others = Object.entries(tch.presenceState()).filter(([k]) => k !== me.id).map(([, metas]) => metas);
    const names = others.filter(ms => ms.some(x => x.typing)).map(ms => ms[0].name);
    let t = '';
    if (names.length > 2) t = names.length === others.length ? 'Everyone is typing..!' : 'Many people are typing...';
    else if (names.length === 2) t = `${names[0]} & ${names[1]} are typing...`;
    else if (names.length === 1) t = `${names[0]} is typing...`;
    typingBar.textContent = t;
  }).subscribe(s => { if (s === 'SUBSCRIBED') tch.track({ name: profile.username, typing: false }); });
  const setTyping = on => {
    if (on === typingNow) return;
    typingNow = on;
    try { tch.track({ name: profile.username, typing: on }); } catch {}
  };
  const pf = id => profs[id] ??= sb.from('profile_badges').select('username,avatar_url,badge').eq('id', id).maybeSingle()
    .then(async r => r.data || (await sb.from('profiles').select('username,avatar_url').eq('id', id).maybeSingle()).data || { username: 'unknown' });
  const layout = () => {
    let prev = null;
    for (const d of box.children) {
      d.classList.toggle('grp', !!prev && prev.dataset.user === d.dataset.user && d.dataset.t - prev.dataset.t < 3600000 && !d.dataset.rich);
      prev = d;
    }
  };
  const find = id => box.querySelector(`[data-id="${id}"]`);
  const setEdited = async (d, m) => {
    rows.set(String(m.id), m);
    $('.txt', d).innerHTML = await mhtml(m);
    if (m.edited_at && !$('.eu', d)) {
      $('.head small', d).insertAdjacentHTML('beforeend', ' <i>edited</i>');
      $('.body', d).insertAdjacentHTML('beforeend', '<i class="eu">edited</i>');
    }
  };
  const mhtml = async m => {
    const names = new Set((await Promise.all(arr(m.mentions).map(pf))).map(p => p.username.toLowerCase()));
    if (m.mention_all) names.add('all');
    return esc(m.content).replace(/@([^\s@]+)/g, (full, w) => {
      const tail = (w.match(/[.,!?;:)]+$/) || [''])[0], bare = tail ? w.slice(0, -tail.length) : w;
      const hit = names.has(w.toLowerCase()) ? w : names.has(bare.toLowerCase()) ? bare : null;
      return hit === null ? full : `<span class="mention">@${hit}</span>` + (hit === w ? '' : tail);
    });
  };
  const att = m => m.image_url && /^https:\/\//.test(m.image_url)
    ? `<a href="${esc(m.image_url)}" target="_blank" rel="noopener"><img class="att" src="${esc(m.image_url)}" alt="image" loading="lazy"></a>` : '';
  const send = async (content, image_url) => {
    const extra = replying ? { reply_to: replying.id, ...(rm ? { reply_ping: replying.ping } : {}) } : {};
    const { error } = await sb.from(table).insert({ [col]: val, user_id: me.id, content, ...(image_url ? { image_url } : {}), ...extra });
    if (error) return alert(error.message);
    clearReply();
  };
  const pickImage = () => {
    const f = document.createElement('input');
    f.type = 'file'; f.accept = 'image/png,image/jpeg,image/gif,image/webp';
    f.onchange = async () => {
      const file = f.files[0];
      if (!file) return;
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return alert('Only images can be sent (PNG, JPG, GIF or WebP).');
      if (file.size > 5 * 1024 * 1024) return alert('Images must be under 5 MB.');
      const path = `${me.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${file.type.split('/')[1].replace('jpeg', 'jpg')}`;
      const up = await sb.storage.from('chat-images').upload(path, file, { contentType: file.type });
      if (up.error) return alert(up.error.message);
      send('', sb.storage.from('chat-images').getPublicUrl(path).data.publicUrl);
    };
    f.click();
  };
  const gifPicker = () => {
    if (typeof GIPHY_API_KEY === 'undefined' || !GIPHY_API_KEY) return alert('Add your Giphy API key as GIPHY_API_KEY in config.js first.');
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = '<div class="pick"><input placeholder="Search GIFs"><div class="grid"></div><small>Powered by GIPHY</small></div>';
    document.body.append(m);
    const input = $('input', m), grid = $('.grid', m);
    const onKey = e => e.key === 'Escape' && close();
    const close = () => { m.remove(); removeEventListener('keydown', onKey); };
    addEventListener('keydown', onKey);
    m.onclick = e => { if (e.target === m) close(); };
    const load = async q => {
      grid.textContent = 'Loading…';
      try {
        const ep = q ? `search?q=${encodeURIComponent(q)}&` : 'trending?';
        const r = await (await fetch(`https://api.giphy.com/v1/gifs/${ep}api_key=${GIPHY_API_KEY}&limit=24&rating=pg-13`)).json();
        grid.textContent = r.data?.length ? '' : 'No GIFs found.';
        for (const g of r.data || []) {
          const i = document.createElement('img');
          i.src = g.images.fixed_height_small.url; i.alt = g.title;
          i.onclick = () => { close(); send('', g.images.fixed_height.url); };
          grid.append(i);
        }
      } catch { grid.textContent = 'Could not reach Giphy.'; }
    };
    let t;
    input.oninput = () => { clearTimeout(t); t = setTimeout(() => load(input.value.trim()), 400); };
    load(''); input.focus();
  };
  const clearReply = () => { replying = null; rbar.hidden = true; rbar.innerHTML = ''; };
  const renderReply = () => {
    rbar.hidden = false;
    rbar.innerHTML = '<span>Replying to <b></b></span>' + (rm ? '<button type="button" class="rping"></button>' : '') + '<button type="button" class="rx" aria-label="Cancel reply">&times;</button>';
    $('b', rbar).textContent = replying.name;
    const ping = $('.rping', rbar);
    if (ping) {
      ping.textContent = replying.ping ? '@ ON' : '@ OFF';
      ping.onclick = () => { replying.ping = !replying.ping; ping.textContent = replying.ping ? '@ ON' : '@ OFF'; };
    }
    $('.rx', rbar).onclick = clearReply;
  };
  const startReply = d => {
    replying = { id: d.dataset.id, name: who(d).name, ping: true };
    renderReply();
    $('.send input', el)?.focus();
  };
  const copy = async d => {
    const r = rows.get(d.dataset.id);
    try { await navigator.clipboard.writeText(r.content || r.image_url || ''); }
    catch { alert('Could not copy to the clipboard.'); }
  };
  const getRef = id => refs[id] ??= sb.from(table).select('id,user_id,content,image_url').eq('id', id).maybeSingle().then(r => r.data);
  const fillRef = async (d, id) => {
    const r = await getRef(id), t = $('.rtxt', d);
    if (!r) { t.textContent = 'Original message was deleted'; return; }
    const p = await pf(r.user_id);
    const b = document.createElement('b');
    b.textContent = '@' + p.username;
    t.textContent = '';
    t.append(b, ' ' + (r.content || (r.image_url ? 'Click to see attachment' : '')).slice(0, 90));
  };
  const fillFwd = async (d, uid) => { $('.fwd b', d).textContent = (await pf(uid)).username; };
  const add = async m => {
    const p = await pf(m.user_id);
    const html = await mhtml(m);
    const d = document.createElement('div');
    d.className = 'msg'; d.dataset.id = m.id; d.dataset.user = m.user_id; d.dataset.t = new Date(m.created_at).getTime();
    d.dataset.rich = m.reply_to || m.forward_from ? '1' : '';
    d.innerHTML = `<div class="pfp sm"></div><div class="body">${m.reply_to ? '<div class="rref"><span>&#8617;</span><span class="rtxt">Loading…</span></div>' : ''}<div class="head"><b>${esc(p.username)}</b>${badge(p.badge)}<small>${new Date(m.created_at).toLocaleString()}${m.edited_at ? ' <i>edited</i>' : ''}</small></div>${m.forward_from ? '<div class="fwd">&#8618; Forwarded from <b></b></div>' : ''}<div class="txt">${html}</div>${att(m)}${m.edited_at ? '<i class="eu">edited</i>' : ''}</div>`;
    rows.set(String(m.id), m);
    if (m.reply_to) {
      $('.rref', d).onclick = () => {
        const o = find(m.reply_to);
        if (!o) return;
        o.scrollIntoView({ block: 'center', behavior: 'smooth' });
        o.classList.remove('flash');
        void o.offsetWidth;
        o.classList.add('flash');
      };
      fillRef(d, m.reply_to);
    }
    if (m.forward_from) fillFwd(d, m.forward_from);
    paintAvatar($('.pfp', d), p);
    d.classList.toggle('mentioned', m.user_id !== me.id && (arr(m.mentions).includes(me.id) || !!m.mention_all));
    const openMe = () => openProfile(m.user_id), pic = $('.pfp', d);
    pic.onclick = openMe; $('.head b', d).onclick = openMe;
    pic.onmouseenter = () => d.classList.add('uh'); pic.onmouseleave = () => d.classList.remove('uh');
    box.append(d); layout(); box.scrollTop = box.scrollHeight;
    $('img', d)?.addEventListener('load', () => box.scrollTop = box.scrollHeight);
  };

  const edit = d => {
    const txt = $('.txt', d), old = txt.textContent, oldHTML = txt.innerHTML;
    const i = document.createElement('input');
    i.className = 'editbox'; i.value = old; i.maxLength = 2000;
    txt.replaceChildren(i); i.focus();
    let done = false;
    const finish = async save => {
      if (done) return; done = true;
      const v = i.value.trim();
      if (!save || !v || v === old) return void (txt.innerHTML = oldHTML);
      const { data, error } = await sb.from(table).update(isMod ? { content: v } : { content: v, edited_at: new Date().toISOString() }).eq('id', d.dataset.id).select().single();
      if (error) { alert(error.message); txt.innerHTML = oldHTML; return; }
      setEdited(d, data);
    };
    i.onkeydown = e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); };
    i.onblur = () => finish(false);
  };
  const del = async d => {
    if (!confirm('Delete this message?')) return;
    const { error } = await sb.from(table).delete().eq('id', d.dataset.id);
    if (error) return alert(error.message);
    d.remove(); layout();
  };
  const who = d => ({ id: d.dataset.user, name: $('.head b', d).textContent });
  const banUser = async (uid, name) => {
    if (!confirm(`Ban ${name}?`)) return false;
    const { error } = await sb.rpc('ban_user', { uid });
    alert(error ? error.message : `${name} is banned.`);
    return !error;
  };
  const nukeUser = async (uid, name) => {
    if (!confirm(`Permanently delete ${name}’s account and all their messages?`)) return false;
    const { error } = await sb.rpc('mod_delete_account', { uid });
    if (error) { alert(error.message); return false; }
    box.querySelectorAll(`[data-user="${uid}"]`).forEach(x => x.remove());
    layout();
    return true;
  };
  const rm = opts.room;
  const PERMS = [
    ['can_talk', 'Talk everywhere', 'Can type in read-only channels.'],
    ['can_kick', 'Kick members', 'Can remove people from this room.'],
    ['can_channels', 'Create channels', 'Can add new channels.'],
    ['can_mention_all', 'Use @all', 'Can mention everyone in the room.']
  ];
  const DURATIONS = [['1800', '30 minutes'], ['3600', '1 hour'], ['7200', '2 hours'], ['10800', '3 hours'], ['14400', '4 hours'], ['18000', '5 hours'], ['forever', 'Forever'], ['custom', 'Custom (seconds)']];
  const kickUser = async (uid, name) => {
    if (!confirm(`Kick ${name} from this room?`)) return false;
    const { error } = await sb.rpc('kick_member', { rid: rm.id, uid });
    alert(error ? error.message : `${name} was kicked.`);
    return !error;
  };
  const windowFor = (m, prof) => {
    m.className = 'modal';
    document.body.append(m);
    $('h3', m).innerHTML = esc(prof.username) + badge(prof.badge);
    paintAvatar($('.pfp', m), prof);
    const onKey = e => e.key === 'Escape' && close();
    const close = () => { m.remove(); removeEventListener('keydown', onKey); };
    addEventListener('keydown', onKey);
    m.onclick = e => { if (e.target === m) close(); };
    $('.x', m).onclick = close;
    return close;
  };
  const permDialog = async uid => {
    const [prof, { data: p }] = await Promise.all([pf(uid),
      sb.from('room_members').select('can_talk,can_kick,can_channels,can_mention_all,timeout_until').eq('room_id', rm.id).eq('user_id', uid).maybeSingle()]);
    if (!p) return alert('That person is no longer in this room.');
    const m = document.createElement('div');
    m.innerHTML = `<div class="pick dlg" style="width:min(440px,92vw)"><div class="phead"><div class="pfp" style="width:64px;height:64px;font-size:24px"></div><h3></h3></div>
      ${PERMS.map(([k, t, sub]) => `<div class="prow"><div><b>${t}</b><div class="note">${sub}</div></div><input type="checkbox" class="sw" data-k="${k}"></div>`).join('')}
      <div class="tsec"><div class="prow"><div><b>Time out</b><div class="note tstat"></div></div><button type="button" class="tbtn">Time out</button></div>
        <div class="tpanel" hidden><select class="tsel">${DURATIONS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
          <input class="tsecs" type="number" min="1" max="31536000" placeholder="Seconds" hidden>
          <div class="rbtns"><button type="button" class="tapply">Apply time out</button><button type="button" class="tclear">Remove time out</button></div></div></div>
      <p class="note pmsg"></p>
      <div class="pfoot" style="justify-content:space-between"><button type="button" class="kickbtn danger">Kick from room</button><button type="button" class="x">Done</button></div></div>`;
    const close = windowFor(m, prof);
    const note = t => { $('.pmsg', m).textContent = t; };
    for (const sw of m.querySelectorAll('input[data-k]')) {
      sw.checked = !!p[sw.dataset.k];
      sw.onchange = async () => {
        const { error } = await sb.rpc('set_member_perm', { rid: rm.id, uid, perm: sw.dataset.k, val: sw.checked });
        if (error) { sw.checked = !sw.checked; note(error.message); }
        else note('Saved.');
      };
    }
    const showStatus = until => { $('.tstat', m).textContent = timeoutText(until); };
    showStatus(p.timeout_until);
    $('.tbtn', m).onclick = () => { $('.tpanel', m).hidden = !$('.tpanel', m).hidden; };
    $('.tsel', m).onchange = e => { $('.tsecs', m).hidden = e.target.value !== 'custom'; };
    const setTimeoutFor = async (secs, forever) => {
      const { error } = await sb.rpc('set_timeout', { rid: rm.id, uid, secs, forever });
      if (error) return note(error.message);
      const { data } = await sb.from('room_members').select('timeout_until').eq('room_id', rm.id).eq('user_id', uid).maybeSingle();
      showStatus(data?.timeout_until);
      $('.tpanel', m).hidden = true;
      note('Saved.');
    };
    $('.tapply', m).onclick = () => {
      const v = $('.tsel', m).value;
      if (v === 'forever') return setTimeoutFor(0, true);
      if (v === 'custom') {
        const n = Math.floor(Number($('.tsecs', m).value));
        if (!(n >= 1 && n <= 31536000)) return note('Enter a number of seconds from 1 to 31536000.');
        return setTimeoutFor(n, false);
      }
      setTimeoutFor(Number(v), false);
    };
    $('.tclear', m).onclick = () => setTimeoutFor(0, false);
    $('.kickbtn', m).onclick = async () => { if (await kickUser(uid, prof.username)) close(); };
  };
  const manageDialog = async uid => {
    const prof = await pf(uid);
    const m = document.createElement('div');
    m.innerHTML = `<div class="pick dlg" style="width:min(420px,92vw)"><div class="phead"><div class="pfp" style="width:64px;height:64px;font-size:24px"></div><h3></h3></div>
      <div class="prow"><div><b>Ban</b><div class="note">They see a ban screen instead of the app.</div></div><button type="button" class="mban danger">Ban</button></div>
      <div class="prow"><div><b>Delete account</b><div class="note">Permanently removes the account and all its messages.</div></div><button type="button" class="mdel danger">Delete account</button></div>
      <div class="pfoot"><button type="button" class="x">Done</button></div></div>`;
    const close = windowFor(m, prof);
    $('.mban', m).onclick = async () => { if (await banUser(uid, prof.username)) close(); };
    $('.mdel', m).onclick = async () => { if (await nukeUser(uid, prof.username)) close(); };
  };
  const reportDialog = r => {
    if (!r) return;
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<form class="pick dlg" style="width:min(440px,92vw)"><h3>Report message</h3>
      <label>Additional notes (optional)<textarea maxlength="1000" rows="4" placeholder="What is wrong with this message?"></textarea></label>
      <p class="note rmsg2"></p>
      <div class="row"><button type="button" class="x">Cancel</button><button>Send report</button></div></form>`;
    document.body.append(m);
    const close = () => m.remove();
    $('.x', m).onclick = close;
    m.onclick = e => { if (e.target === m) close(); };
    $('textarea', m).focus();
    $('form', m).onsubmit = async e => {
      e.preventDefault();
      const { error } = await sb.rpc('report_message', { rkind: rm ? 'room' : 'dm', mid: r.id, rnote: $('textarea', m).value });
      if (error) { $('.rmsg2', m).textContent = error.message; return; }
      close();
      alert('Report sent. Moderators will review it.');
    };
  };
  box.oncontextmenu = async e => {
    const d = e.target.closest('.msg');
    if (!d) return;
    e.preventDefault();
    const uid = d.dataset.user, own = uid === me.id, r = rows.get(d.dataset.id);
    const ownerTools = rm && !own && uid !== rm.owner && rm.isOwner;
    const kickOnly = rm && !own && uid !== rm.owner && !rm.isOwner && rm.canKick;
    const items = [];
    if (!opts.locked) items.push(['Reply', () => startReply(d)]);
    items.push([r?.content ? 'Copy text' : 'Copy image link', () => copy(d)], ['Forward', () => forwardDialog(r)]);
    if (own || isMod) items.push(['Edit', () => edit(d)], ['Delete', () => del(d), true]);
    if (!own) items.push(['Report', () => reportDialog(r), true]);
    if (ownerTools) items.push(['Edit permissions', () => permDialog(uid)]);
    if (kickOnly) items.push(['Kick from room', () => kickUser(uid, who(d).name), true]);
    if (isMod && !own) items.push(['Manage user', () => manageDialog(uid)]);
    ctxMenu(e.clientX, e.clientY, items);
  };

  const { data } = await sb.from(table).select('*').eq(col, val).order('created_at', { ascending: false }).limit(100);
  for (const m of (data || []).reverse()) await add(m);
  if (sub) sb.removeChannel(sub);
  const filter = `${col}=eq.${val}`;
  sub = sb.channel(`${table}-${val}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, p => add(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, p => { const d = find(p.new.id); if (d) setEdited(d, p.new); })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, p => { find(p.old.id)?.remove(); layout(); })
    .subscribe();
  let members = null;
  const loadMembers = async () => {
    if (members) return members;
    const { data: rows } = await sb.from('room_members').select('user_id').eq('room_id', rm.id);
    const ids = (rows || []).map(r => r.user_id);
    let ps = ids.length ? (await sb.from('profile_badges').select('id,username').in('id', ids)).data : [];
    if (!ps && ids.length) ps = (await sb.from('profiles').select('id,username').in('id', ids)).data;
    return members = (ps || []).sort((a, z) => a.username.localeCompare(z.username, undefined, { sensitivity: 'base' }));
  };
  const mentionBox = (input, form) => {
    const pop = document.createElement('div');
    pop.className = 'mpop'; pop.hidden = true;
    form.append(pop);
    const canAll = rm.isOwner || rm.canAll;
    let shown = [], sel = 0;
    const close = () => { pop.hidden = true; shown = []; };
    const draw = () => {
      pop.innerHTML = '';
      shown.forEach((o, i) => {
        const r = document.createElement('div');
        r.className = 'mopt' + (i === sel ? ' on' : '');
        r.textContent = '@' + o.username + (o.id === 'all' ? ' – notify everyone' : '');
        r.onmousedown = e => { e.preventDefault(); choose(o); };
        pop.append(r);
      });
      pop.hidden = !shown.length;
    };
    const token = () => {
      const m = /(^|\s)@([^\s@]*)$/.exec(input.value.slice(0, input.selectionStart));
      return m && { q: m[2].toLowerCase(), start: input.selectionStart - m[2].length - 1 };
    };
    const choose = o => {
      const t = token();
      if (!t) return;
      const before = input.value.slice(0, t.start) + '@' + o.username + ' ';
      input.value = before + input.value.slice(input.selectionStart);
      input.setSelectionRange(before.length, before.length);
      close(); input.focus();
    };
    const update = async () => {
      const t = token();
      if (!t) return close();
      const pool = [...(canAll ? [{ id: 'all', username: 'all' }] : []), ...await loadMembers()];
      const low = u => u.username.toLowerCase();
      shown = [...pool.filter(u => low(u).startsWith(t.q)), ...pool.filter(u => !low(u).startsWith(t.q) && low(u).includes(t.q))];
      sel = 0; draw();
    };
    input.addEventListener('input', update);
    input.addEventListener('click', update);
    input.addEventListener('blur', close);
    input.addEventListener('keyup', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) update(); });
    input.addEventListener('keydown', e => {
      if (pop.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
        draw(); pop.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(shown[sel]); }
      else if (e.key === 'Escape') close();
    });
  };

  if (!opts.locked) {
  $('.plus', el).onclick = e => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    ctxMenu(r.left - 60, r.top - 90, [['Upload image', pickImage], ['Search GIFs', gifPicker]]);
  };
  $('form', el).onsubmit = e => {
    e.preventDefault();
    const i = $('input', e.target), t = i.value.trim();
    if (!t) return;
    i.value = '';
    clearTimeout(typingTimer);
    setTyping(false);
    send(t);
  };
  $('input', el).addEventListener('input', e => {
    clearTimeout(typingTimer);
    if (!e.target.value.trim()) return setTyping(false);
    setTyping(true);
    typingTimer = setTimeout(() => setTyping(false), 4000);
  });
  $('input', el).addEventListener('keydown', e => {
    const pop = $('.mpop', el);
    if (e.key === 'Escape' && replying && (!pop || pop.hidden)) clearReply();
  });
  if (rm) mentionBox($('input', el), $('form', el));
  }
}
