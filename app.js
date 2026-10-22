const sb = supabase.createClient(new URL(SUPABASE_URL.trim()).origin, SUPABASE_ANON_KEY.trim());
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let me, profile, sub;

function login() {
  const g = document.createElement('div');
  g.className = 'gate';
  g.innerHTML = `<form><h2>Sign in</h2><input name="u" placeholder="Username (new accounts only)">
    <input name="e" type="email" placeholder="Email" required><input name="p" type="password" placeholder="Password" required>
    <button value="in">Sign in</button><button value="up" type="button">Create account</button><p></p></form>`;
  document.body.append(g);
  const f = $('form', g), msg = $('p', g);
  const go = async up => {
    msg.textContent = '';
    const email = f.e.value, password = f.p.value;
    const r = up
      ? await sb.auth.signUp({ email, password, options: { data: { username: f.u.value.trim() } } })
      : await sb.auth.signInWithPassword({ email, password });
    if (r.error) return msg.textContent = r.error.message;
    if (!r.data.session) return msg.textContent = 'Check your email to confirm, then sign in.';
    location.reload();
  };
  f.onsubmit = e => { e.preventDefault(); go(false); };
  $('[type=button]', g).onclick = () => go(true);
  return new Promise(() => {});
}

// page: 'home' | 'dms' | 'rooms'
async function boot(page) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) await login();
  me = session.user;
  const { data: p } = await sb.from('profiles').select('*').eq('id', me.id).single();
  profile = p || { username: me.email, description: '' };
  const pfp = profile.avatar_url ? `style="background-image:url('${esc(profile.avatar_url)}')"` : '';
  $('#side').innerHTML = `
    <div class="prof"><div class="pfp" ${pfp}>${profile.avatar_url ? '' : esc(profile.username[0].toUpperCase())}</div>
      <a class="who" href="index.html"><b>${esc(profile.username)}</b><small>${esc(profile.description || 'No description yet')}</small></a>
      <button class="cog" title="Settings" onclick="alert('Settings coming soon')">&#9881;</button></div>
    <div class="tabs"><a href="dms.html" class="${page === 'dms' ? 'on' : ''}">DMs</a><a href="rooms.html" class="${page === 'rooms' ? 'on' : ''}">Rooms</a></div>
    <div id="list"></div><div class="foot"></div>`;
  if (page === 'home') $('#top').hidden = true;
}

function addButton(label, fn) {
  const b = document.createElement('button');
  b.textContent = label; b.onclick = fn;
  $('.foot').append(b);
  return b;
}

function list(items, selected, onPick, emptyText) {
  const el = $('#list');
  el.innerHTML = items.length ? '' : `<div class="hint">${emptyText}</div>`;
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'item' + (it.id === selected ? ' on' : '');
    b.innerHTML = esc(it.label) + (it.sub ? `<small>${esc(it.sub)}</small>` : '');
    b.onclick = () => onPick(it);
    el.append(b);
  }
}

async function openChat(table, col, val) {
  const el = $('#content');
  el.innerHTML = `<div class="msgs"></div><form class="send"><input placeholder="Type a message" autocomplete="off" maxlength="2000"><button>Send</button></form>`;
  const box = $('.msgs', el), names = {};
  const nm = async id => names[id] ??= (await sb.from('profiles').select('username').eq('id', id).single()).data?.username || 'unknown';
  const add = async m => {
    const d = document.createElement('div');
    d.className = 'msg';
    d.innerHTML = `<b>${esc(await nm(m.user_id))}</b><small>${new Date(m.created_at).toLocaleString()}</small><div>${esc(m.content)}</div>`;
    box.append(d); box.scrollTop = box.scrollHeight;
  };
  const { data } = await sb.from(table).select('*').eq(col, val).order('created_at', { ascending: false }).limit(100);
  for (const m of (data || []).reverse()) await add(m);
  if (sub) sb.removeChannel(sub);
  sub = sb.channel(`${table}-${val}`).on('postgres_changes',
    { event: 'INSERT', schema: 'public', table, filter: `${col}=eq.${val}` }, p => add(p.new)).subscribe();
  $('form', el).onsubmit = async e => {
    e.preventDefault();
    const i = e.target.firstElementChild, t = i.value.trim();
    if (!t) return;
    i.value = '';
    const { error } = await sb.from(table).insert({ [col]: val, user_id: me.id, content: t });
    if (error) alert(error.message);
  };
}