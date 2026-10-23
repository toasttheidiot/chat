const sb = supabase.createClient(new URL(SUPABASE_URL.trim()).origin, SUPABASE_ANON_KEY.trim());
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let me, profile, sub, isMod = false;

const setTheme = t => { try { localStorage.setItem('theme', t); } catch {} document.documentElement.dataset.theme = t; };
addEventListener('storage', e => { if (e.key === 'theme') document.documentElement.dataset.theme = e.newValue || 'dark'; });

function paintAvatar(el, p) {
  el.textContent = ''; el.style.backgroundImage = '';
  if (p.avatar_url) el.style.backgroundImage = `url(${JSON.stringify(p.avatar_url)})`;
  else el.textContent = p.username[0].toUpperCase();
}

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
    <button>Sign in</button><p></p></form>`;
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

// Signs in, loads your profile, blocks banned users. Used by every page.
async function auth() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) await login();
  me = session.user;
  const { data: p } = await sb.from('profiles').select('*').eq('id', me.id).single();
  if (!p) { await sb.auth.signOut(); location.reload(); return new Promise(() => {}); }
  profile = p;
  if (profile.banned) await showBan();
  isMod = !!(await sb.rpc('is_mod')).data;
}

// page: 'home' | 'dms' | 'rooms'
async function boot(page) {
  await auth();
  $('#side').innerHTML = `
    <div class="prof"><div class="pfp"></div>
      <a class="who" href="index.html"><b>${esc(profile.username)}</b><small>${esc(profile.description || 'No description yet')}</small></a>
      <a class="cog" href="settings.html" target="_blank" rel="noopener" title="Settings">&#9881;</a></div>
    <div class="tabs"><a href="dms.html" class="${page === 'dms' ? 'on' : ''}">DMs</a><a href="rooms.html" class="${page === 'rooms' ? 'on' : ''}">Rooms</a></div>
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

// Sidebar list: click to open, drag to reorder, optional right-click menu
function list(items, selected, onPick, emptyText, onMenu) {
  const el = $('#list');
  el.innerHTML = items.length ? '' : `<div class="hint">${emptyText}</div>`;
  const ids = () => [...el.querySelectorAll('.item')].map(x => x.dataset.id);
  let dragged = null, before = '';
  for (const it of items) {
    const b = document.createElement('div'); // div, not button: Firefox can’t drag buttons
    b.className = 'item' + (it.id === selected ? ' on' : '');
    b.setAttribute('role', 'button'); b.tabIndex = 0; b.draggable = true; b.dataset.id = it.id;
    b.innerHTML = esc(it.label) + (it.sub ? `<small>${esc(it.sub)}</small>` : '');
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
  m.style.left = Math.min(x, innerWidth - 160) + 'px';
  m.style.top = Math.min(y, innerHeight - 90) + 'px';
  document.body.append(m);
}

async function openChat(table, col, val, opts = {}) {
  const el = $('#content');
  el.innerHTML = `<div class="msgs"></div>` + (opts.locked ? '<div class="send locked">Only the room owner and people they allow can type in this channel.</div>' : `<form class="send"><input placeholder="Type a message" autocomplete="off" maxlength="2000"><button type="button" class="plus" title="Add an image or GIF">+</button><button>Send</button></form>`);
  const box = $('.msgs', el), names = {};
  const nm = async id => names[id] ??= (await sb.from('profiles').select('username').eq('id', id).single()).data?.username || 'unknown';
  const find = id => box.querySelector(`[data-id="${id}"]`);
  const setEdited = (d, m) => {
    $('.txt', d).textContent = m.content;
    if (m.edited_at && !$('i', d)) $('small', d).insertAdjacentHTML('beforeend', ' <i>edited</i>');
  };
  const att = m => m.image_url && /^https:\/\//.test(m.image_url)
    ? `<a href="${esc(m.image_url)}" target="_blank" rel="noopener"><img class="att" src="${esc(m.image_url)}" alt="image" loading="lazy"></a>` : '';
  const send = async (content, image_url) => {
    const { error } = await sb.from(table).insert({ [col]: val, user_id: me.id, content, ...(image_url ? { image_url } : {}) });
    if (error) alert(error.message);
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
  const add = async m => {
    const d = document.createElement('div');
    d.className = 'msg'; d.dataset.id = m.id; d.dataset.user = m.user_id;
    d.innerHTML = `<b>${esc(await nm(m.user_id))}</b><small>${new Date(m.created_at).toLocaleString()}${m.edited_at ? ' <i>edited</i>' : ''}</small><div class="txt">${esc(m.content)}</div>${att(m)}`;
    box.append(d); box.scrollTop = box.scrollHeight;
    $('img', d)?.addEventListener('load', () => box.scrollTop = box.scrollHeight);
  };

  const edit = d => {
    const txt = $('.txt', d), old = txt.textContent;
    const i = document.createElement('input');
    i.className = 'editbox'; i.value = old; i.maxLength = 2000;
    txt.replaceChildren(i); i.focus();
    let done = false;
    const finish = async save => {
      if (done) return; done = true;
      const v = i.value.trim();
      if (!save || !v || v === old) return void (txt.textContent = old);
      const { data, error } = await sb.from(table).update(isMod ? { content: v } : { content: v, edited_at: new Date().toISOString() }).eq('id', d.dataset.id).select().single();
      if (error) { alert(error.message); txt.textContent = old; return; }
      setEdited(d, data);
    };
    i.onkeydown = e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); };
    i.onblur = () => finish(false);
  };
  const del = async d => {
    if (!confirm('Delete this message?')) return;
    const { error } = await sb.from(table).delete().eq('id', d.dataset.id);
    if (error) return alert(error.message);
    d.remove();
  };
  const who = d => ({ id: d.dataset.user, name: $('b', d).textContent });
  const ban = async d => {
    const t = who(d);
    if (!confirm(`Ban ${t.name}?`)) return;
    const { error } = await sb.rpc('ban_user', { uid: t.id });
    alert(error ? error.message : `${t.name} is banned.`);
  };
  const nuke = async d => {
    const t = who(d);
    if (!confirm(`Permanently delete ${t.name}’s account and all their messages?`)) return;
    const { error } = await sb.rpc('mod_delete_account', { uid: t.id });
    if (error) return alert(error.message);
    box.querySelectorAll(`[data-user="${t.id}"]`).forEach(x => x.remove());
  };
  const rm = opts.room;
  const setPerm = async (uid, perm, val) => {
    const { error } = await sb.rpc('set_member_perm', { rid: rm.id, uid, perm, val });
    alert(error ? error.message : 'Permission updated.');
  };
  const kick = async d => {
    const t = who(d);
    if (!confirm(`Kick ${t.name} from this room?`)) return;
    const { error } = await sb.rpc('kick_member', { rid: rm.id, uid: t.id });
    alert(error ? error.message : `${t.name} was kicked.`);
  };
  box.oncontextmenu = async e => {
    const d = e.target.closest('.msg');
    if (!d) return;
    const uid = d.dataset.user, own = uid === me.id;
    const roomActions = rm && !own && uid !== rm.owner && (rm.isOwner || rm.canKick);
    if (!own && !isMod && !roomActions) return; // others only get the normal browser menu
    e.preventDefault();
    const x = e.clientX, y = e.clientY, items = [];
    if (own || isMod) items.push(['Edit', () => edit(d)], ['Delete', () => del(d), true]);
    if (roomActions) {
      if (rm.isOwner) {
        const { data: p } = await sb.from('room_members').select('can_talk,can_kick,can_channels').eq('room_id', rm.id).eq('user_id', uid).maybeSingle();
        items.push(
          [p?.can_talk ? 'Stop allowing talking everywhere' : 'Allow talking everywhere', () => setPerm(uid, 'can_talk', !p?.can_talk)],
          [p?.can_kick ? 'Stop allowing kicking' : 'Allow kicking', () => setPerm(uid, 'can_kick', !p?.can_kick)],
          [p?.can_channels ? 'Stop allowing creating channels' : 'Allow creating channels', () => setPerm(uid, 'can_channels', !p?.can_channels)]);
      }
      items.push(['Kick from room', () => kick(d), true]);
    }
    if (isMod && !own) items.push(['Ban', () => ban(d), true], ['Delete account', () => nuke(d), true]);
    ctxMenu(x, y, items);
  };

  const { data } = await sb.from(table).select('*').eq(col, val).order('created_at', { ascending: false }).limit(100);
  for (const m of (data || []).reverse()) await add(m);
  if (sub) sb.removeChannel(sub);
  const filter = `${col}=eq.${val}`;
  sub = sb.channel(`${table}-${val}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, p => add(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, p => { const d = find(p.new.id); if (d) setEdited(d, p.new); })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, p => find(p.old.id)?.remove())
    .subscribe();
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
    send(t);
  };
  }
}
