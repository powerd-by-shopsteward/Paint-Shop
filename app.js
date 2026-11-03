/* ══════════════════════════════════════════════════════════════
   2. UTILITIES
   ══════════════════════════════════════════════════════════════ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const todayStr = () => new Date().toISOString().split('T')[0];
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const rs = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const round2 = (n) => Math.round(n * 100) / 100;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function openModal(html, onMount) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-overlay';
  wrap.innerHTML = `<div class="modal">${html}<button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div>`;
  wrap.addEventListener('click', e => { if(e.target === wrap) wrap.remove(); });
  $('#modal-root').appendChild(wrap);
  if(onMount) onMount(wrap);
}

function closeModal() {
  const root = $('#modal-root');
  if(root.lastElementChild) root.removeChild(root.lastElementChild);
}

/* ══════════════════════════════════════════════════════════════
   3. DATA SYNC & AUTH
   ══════════════════════════════════════════════════════════════ */
async function syncDB() {
  try {
    const tables = ['customers', 'retailers', 'suppliers', 'products', 'invoices', 'invoice_items', 'payments', 'supplier_invoices', 'supplier_invoice_items', 'supplier_payments', 'returns', 'expenses'];
    await Promise.all(tables.map(async t => {
      const { data } = await sb.from(t).select('*');
      if(data) DB[t] = data;
    }));
    window.DB_SYNCED = true;
  } catch(e) { console.error('Sync failed', e); toast('Data sync failed', 'error'); }
}

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  SESSION = session;
}

async function login(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if(error) throw error;
  const { data: { session } } = await sb.auth.getSession();
  SESSION = session;
  await syncDB();
  await loadSubscription();
  route();
}

async function logout() {
  await sb.auth.signOut();
  SESSION = null;
  location.hash = '#/';
  route();
}

/* ══════════════════════════════════════════════════════════════
   4. SUBSCRIPTION SYSTEM (MANDATORY)
   ══════════════════════════════════════════════════════════════ */
const SUB = { loaded: false, active: false, expires_at: null, planAmount: 599, upi: 'shopsteward.in@ybl' };

async function loadSubscription() {
  try {
    const { data } = await sb.from('subscriptions').select('*').eq('id', 1).maybeSingle();
    if(data) {
      SUB.loaded = true; SUB.active = data.active; SUB.expires_at = data.expires_at;
    } else {
      const nextYear = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 1);
      await sb.from('subscriptions').insert({ id: 1, active: true, expires_at: nextYear.toISOString() });
      SUB.loaded = true; SUB.active = true; SUB.expires_at = nextYear.toISOString();
    }
  } catch(e) { SUB.loaded = true; SUB.active = true; SUB.expires_at = new Date(Date.now() + 31536000000).toISOString(); }
}

function isSubActive() {
  if(!SUB.loaded) return true;
  return SUB.active && new Date(SUB.expires_at) > new Date();
}

function getSubDaysLeft() {
  if(!SUB.expires_at) return 0;
  return Math.max(0, Math.ceil((new Date(SUB.expires_at) - Date.now()) / 86400000));
}

function openSubscriptionModal() {
  openModal(`
    <h2 style="font-size:20px;margin-bottom:8px;">Renew Subscription</h2>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:24px;">Keep your shop running smoothly.</p>
    <div style="text-align:center;background:var(--bg);padding:24px;border-radius:12px;margin-bottom:20px;">
      <div style="font-size:32px;font-weight:800;color:var(--primary);margin-bottom:8px;">₹${SUB.planAmount}</div>
      <div style="font-size:13px;font-weight:600;">Yearly Plan</div>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);padding:16px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
      <span style="font-family:monospace;font-size:14px;">${SUB.upi}</span>
      <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${SUB.upi}');toast('Copied','success')">Copy</button>
    </div>
  `);
}

/* ══════════════════════════════════════════════════════════════
   5. LAYOUT & ROUTER
   ══════════════════════════════════════════════════════════════ */
const NAV_LINKS = [
  { group: 'Main Menu', items: [
    { href: '#/', icon: '📊', label: 'Dashboard' },
    { href: '#/invoices', icon: '📄', label: 'Invoices' },
    { href: '#/purchases', icon: '📥', label: 'Purchases' },
    { href: '#/inventory', icon: '📦', label: 'Inventory' }
  ]},
  { group: 'Features', items: [
    { href: '#/customers', icon: '🧑', label: 'Customers' },
    { href: '#/suppliers', icon: '🏢', label: 'Vendors' },
    { href: '#/expenses', icon: '💸', label: 'Expenses' }
  ]},
  { group: 'General', items: [
    { href: '#/myshop', icon: '⚙️', label: 'Settings' }
  ]}
];

function renderLayout() {
  const hash = location.hash || '#/';
  $('#app').innerHTML = `
    <div class="layout">
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <div class="brand-logo">🎨</div>
          <div class="brand-text">Finora</div>
        </div>
        <div style="flex:1;overflow-y:auto;">
          ${NAV_LINKS.map(g => `
            <div class="nav-group">
              <div class="nav-group-title">${g.group}</div>
              <nav class="nav">
                ${g.items.map(it => `<a href="${it.href}" class="${hash === it.href ? 'active' : ''}"><span class="icon">${it.icon}</span>${it.label}</a>`).join('')}
              </nav>
            </div>
          `).join('')}
        </div>
        <div class="sub-pill" onclick="openSubscriptionModal()">
          <div class="sub-pill-header"><span>⭐ Pro Plan</span><span style="color:${getSubDaysLeft() < 15 ? 'var(--red)' : 'var(--primary)'}">${getSubDaysLeft()}d</span></div>
          <div class="sub-bar"><div class="sub-bar-fill" style="width:${(getSubDaysLeft()/365)*100}%;background:var(--primary)"></div></div>
        </div>
        <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px;">
          <button class="btn btn-ghost" style="width:100%;justify-content:flex-start;" onclick="logout()">🚪 Log Out</button>
        </div>
      </aside>
      <div class="main-wrap">
        <header class="topbar">
          <div class="topbar-title" style="display:flex;align-items:center;gap:16px;">
            <button onclick="document.getElementById('sidebar').classList.toggle('open')" style="display:none;font-size:20px;" id="mob-menu">☰</button>
            <div>
              <h1>Hi, ${esc(SETTINGS.owner_name)}! Welcome back.</h1>
              <p>Manage your paint shop and review recent transactions.</p>
            </div>
          </div>
          <div class="topbar-actions">
            <div class="search-box"><span>🔍</span><input type="text" placeholder="Search product..."></div>
            <button class="topbar-icon">🔔</button>
            <div class="avatar">${esc(SETTINGS.owner_name.substring(0,2).toUpperCase())}</div>
          </div>
        </header>
        ${!isSubActive() ? `<div style="background:var(--red-bg);color:var(--red);padding:12px 32px;display:flex;justify-content:space-between;align-items:center;font-weight:600;"><span>⚠ Your subscription expired. Data is read-only.</span><button class="btn btn-primary btn-sm" onclick="openSubscriptionModal()">Renew Now</button></div>` : ''}
        <main id="content" class="main"></main>
      </div>
    </div>
  `;
  if(window.innerWidth <= 768) $('#mob-menu').style.display = 'block';
}

async function route() {
  if(!SESSION && location.hash !== '#/login') { location.hash = '#/login'; return; }
  const path = location.hash.split('?')[0] || '#/';
  
  if(path === '#/login') { renderLogin(); return; }
  if(!window.DB_SYNCED) await syncDB();
  
  renderLayout();
  const content = $('#content');
  
  try {
    if(path === '#/') renderDashboard(content);
    else if(path === '#/products') renderProducts(content);
    else if(path === '#/invoices') renderInvoices(content);
    else if(path === '#/customers') renderCustomers(content);
    else if(path === '#/myshop') renderMyShop(content);
    else { content.innerHTML = '<h2>Page under construction</h2>'; }
  } catch(e) { content.innerHTML = `<div style="color:red;padding:20px;">Error: ${e.message}</div>`; }
}

function renderLogin() {
  $('#app').innerHTML = `
    <div style="display:flex;min-height:100vh;background:var(--bg);align-items:center;justify-content:center;">
      <div style="width:100%;max-width:400px;padding:40px;background:var(--card);border-radius:16px;box-shadow:var(--shadow-md);">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="width:48px;height:48px;background:var(--primary);color:white;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:16px;">🎨</div>
          <h1 style="font-size:24px;font-weight:800;">Finora Paint Shop</h1>
          <p style="color:var(--text-muted);font-size:14px;">Sign in to manage your business</p>
        </div>
        <form id="login-form">
          <div style="margin-bottom:16px;"><label class="label">Email</label><input class="input" type="email" id="email" required placeholder="owner@example.com"></div>
          <div style="margin-bottom:24px;"><label class="label">Password</label><input class="input" type="password" id="password" required placeholder="••••••••"></div>
          <button class="btn btn-primary" style="width:100%;" id="login-btn">Sign In</button>
        </form>
      </div>
    </div>
  `;
  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#login-btn'); btn.textContent = 'Signing in...'; btn.disabled = true;
    try { await login($('#email').value, $('#password').value); } 
    catch(e) { toast(e.message, 'error'); btn.textContent = 'Sign In'; btn.disabled = false; }
  };
}

window.addEventListener('hashchange', route);
(async function boot() {
  await initAuth();
  if(SESSION) { await syncDB(); await loadSubscription(); }
  route();
})();
