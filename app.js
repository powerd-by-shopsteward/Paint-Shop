/* ══════════════════════════════════════════════════════════════════
   FINORA — PAINT SHOP MANAGER
   FILE: app.js
   BLOCK 1: Core, Utilities, Data Sync, Auth, Subscription, Layout
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   1. SAFE SUPABASE INITIALIZATION
   ───────────────────────────────────────────── */
let sb = null;
(function initSupabase() {
  try {
    const cfg = window.APP_CONFIG || {};
    if(!cfg.SUPABASE_URL || cfg.SUPABASE_URL === 'YOUR_SUPABASE_URL') {
      throw new Error('Configuration missing. Please add your Supabase URL and Key in index.html');
    }
    sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  } catch(e) {
    console.error('[Finora] Init failed:', e);
    document.addEventListener('DOMContentLoaded', () => {
      const app = document.getElementById('app');
      if(app) {
        app.innerHTML = '<div style="padding:40px;text-align:center;font-family:sans-serif;">' +
          '<h1 style="color:#dc2626;">⚠️ Configuration Required</h1>' +
          '<p style="color:#6b7280;">' + e.message + '</p></div>';
      }
    });
  }
})();

/* ─────────────────────────────────────────────
   2. CONSTANTS & GLOBAL STATE
   ───────────────────────────────────────────── */
const PRODUCT_UNITS = ['Litre', 'ml', 'kg', 'gram', 'piece', 'box', 'bucket'];
const PAINT_CATEGORIES = ['Emulsion', 'Enamel', 'Primer', 'Distemper', 'Wood Finish', 'Waterproofing', 'Brushes & Tools', 'Other'];
const GST_RATES = [0, 5, 12, 18, 28];

const INVOICE_PREFIX = 'INV-';
const RETURN_PREFIX  = 'RET-';

let SESSION = null;
let charts  = [];

let SETTINGS = {
  shop_name: 'Finora Paints',
  owner_name: 'Owner',
  address: '',
  city: '',
  phone: '',
  email: '',
  gst_enabled: false,
  gst_number: '',
  gst_rate: 18,
  near_expiry_days: 180,
  enable_non_batch: true,
  print_footer: 'Thank you for your business!',
  loaded: false
};

const DB = {
  customers: [], suppliers: [], products: [], product_batches: [],
  invoices: [], invoice_items: [], payments: [],
  supplier_invoices: [], supplier_invoice_items: [], supplier_payments: [],
  returns: [], expenses: [], settings: null
};

window.DB_SYNCED       = false;
window.DB_SYNC_ERRORS  = [];
window.DB_SYNCING      = false;

window.SUB = {
  loaded: false,
  active: true,
  expires_at: null,
  last_paid_at: null
};

/* ─────────────────────────────────────────────
   3. DOM HELPERS & UTILS
   ───────────────────────────────────────────── */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const fmtDate = (d) => {
  if(!d) return '-';
  const s = String(d).slice(0, 10);
  const dt = new Date(s);
  if(isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const txDate = (r, k) => (r && (r[k] || (r.created_at ? r.created_at.slice(0, 10) : ''))) || '';

function inr(n) {
  const num = Number(n || 0);
  const neg = num < 0;
  const s   = Math.abs(num).toFixed(2);
  const p   = s.split('.');
  let intPart = p[0];
  const decPart = p[1];
  if(intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest  = intPart.slice(0, -3);
    intPart = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return (neg ? '-' : '') + intPart + '.' + decPart;
}
const rs = (n) => '₹' + inr(n);
const fmtNum = (n) => Number(n || 0) % 1 === 0 ? String(n) : Number(n).toFixed(2);

function toast(msg, type = 'info') {
  const root = $('#toast-root');
  if(!root) return;
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function openModal(html, onMount) {
  const root = $('#modal-root');
  if(!root) return null;
  const wrap = document.createElement('div');
  wrap.className = 'modal-overlay';
  wrap.innerHTML = `<div class="modal">${html}</div>`;
  wrap.addEventListener('click', (e) => { if(e.target === wrap) closeModal(wrap); });
  root.appendChild(wrap);
  if(onMount) onMount(wrap);
  return wrap;
}

function closeModal(el) {
  const root = $('#modal-root');
  if(!root) return;
  if(el && el.parentNode === root) root.removeChild(el);
  else { const last = root.lastElementChild; if(last) root.removeChild(last); }
}

/* ─────────────────────────────────────────────
   4. DATA SYNC & AUTH
   ───────────────────────────────────────────── */
async function fetchAllRows(tableName) {
  const PAGE_SIZE = 1000;
  let allData = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await sb.from(tableName).select('*').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(tableName + ' - ' + error.message);
    if (data && data.length > 0) {
      allData = allData.concat(data);
      from += PAGE_SIZE;
      if (data.length < PAGE_SIZE) hasMore = false;
    } else {
      hasMore = false;
    }
  }
  return allData;
}

async function syncDB() {
  window.DB_SYNCING = true;
  const tablesToFetch = ['customers', 'suppliers', 'products', 'product_batches', 'invoices', 'invoice_items', 'payments', 'supplier_invoices', 'supplier_invoice_items', 'supplier_payments', 'returns', 'expenses'];
  
  const results = await Promise.allSettled(tablesToFetch.map(t => fetchAllRows(t)));
  const errors = [];

  results.forEach((res, i) => {
    if (res.status === 'fulfilled') DB[tablesToFetch[i]] = res.value;
    else errors.push(res.reason.message);
  });

  try {
    const sett = await sb.from('settings').select('*').eq('id', 1).maybeSingle();
    if(sett.data) {
      SETTINGS = { ...SETTINGS, ...sett.data, loaded: true };
      DB.settings = sett.data;
    } else { SETTINGS.loaded = true; }
  } catch(e) { errors.push('settings - ' + e.message); SETTINGS.loaded = true; }

  window.DB_SYNCED = errors.length === 0;
  window.DB_SYNCING = false;
  return { ok: errors.length === 0, errors };
}

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  SESSION = session || null;
  sb.auth.onAuthStateChange((_e, s) => { SESSION = s || null; });
}

async function login(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if(error) throw error;
  const { data: { session } } = await sb.auth.getSession();
  SESSION = session;
}

async function logout() {
  await sb.auth.signOut();
  SESSION = null;
  window.DB_SYNCED = false;
  location.hash = '#/';
  route();
}

/* ─────────────────────────────────────────────
   5. SUBSCRIPTION CORE
   ───────────────────────────────────────────── */
const SUB_PLAN_AMOUNT = (window.APP_CONFIG && window.APP_CONFIG.SUB_PLAN_AMOUNT) || 599;
const SUB_OWNER_UPI = (window.APP_CONFIG && window.APP_CONFIG.SUB_OWNER_UPI) || '';
const SUB_OWNER_NAME = (window.APP_CONFIG && window.APP_CONFIG.SUB_OWNER_NAME) || '';

async function loadSubscription() {
  try {
    const { data, error } = await sb.from('subscriptions').select('*').eq('id', 1).maybeSingle();
    if(error) throw error;

    if(!data) {
      const nextYear = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 1);
      await sb.from('subscriptions').insert({ id: 1, active: true, expires_at: nextYear.toISOString() });
      window.SUB = { loaded: true, active: true, expires_at: nextYear.toISOString(), last_paid_at: new Date().toISOString() };
    } else {
      window.SUB = { loaded: true, active: !!data.active, expires_at: data.expires_at, last_paid_at: data.last_paid_at };
    }
  } catch(err) {
    console.error('[SUB] load failed:', err);
    window.SUB = { loaded: true, active: true, expires_at: new Date(Date.now() + 31536000000).toISOString(), last_paid_at: null };
  }
}

window.isSubActive = function() {
  if(!window.SUB || !window.SUB.loaded) return true;
  if(!window.SUB.expires_at) return false;
  return window.SUB.active === true && new Date(window.SUB.expires_at).getTime() > Date.now();
};

window.subDaysLeft = function() {
  if(!window.SUB || !window.SUB.expires_at) return 0;
  return Math.max(0, Math.ceil((new Date(window.SUB.expires_at).getTime() - Date.now()) / 86400000));
};

/* ─────────────────────────────────────────────
   6. LAYOUT & ROUTER
   ───────────────────────────────────────────── */
const NAV_LINKS = [
  { group: 'Main Menu', items: [
    { href: '#/',            icon: '📊', label: 'Dashboard'  },
    { href: '#/invoices',    icon: '📄', label: 'Invoices'   },
    { href: '#/purchases',   icon: '📥', label: 'Purchases'  },
    { href: '#/products',    icon: '🎨', label: 'Products'   }
  ]},
  { group: 'Parties', items: [
    { href: '#/customers',   icon: '🧑', label: 'Customers'  },
    { href: '#/suppliers',   icon: '🏢', label: 'Suppliers'  }
  ]},
  { group: 'Reports', items: [
    { href: '#/analytics',   icon: '📈', label: 'Analytics'  },
    { href: '#/myshop',      icon: '⚙️', label: 'My Shop'    }
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
        
        <div class="nav-scroll">
          ${NAV_LINKS.map(g => `
            <div class="nav-group">
              <div class="nav-group-title">${g.group}</div>
              ${g.items.map(it => `
                <a href="${it.href}" class="nav-link ${hash === it.href ? 'active' : ''}">
                  <span class="icon">${it.icon}</span>${it.label}
                </a>
              `).join('')}
            </div>
          `).join('')}
        </div>

        <!-- Subscription Pill -->
        <div class="sub-pill" onclick="openSubscriptionModal()">
          <div class="sub-pill-header">
            <span>⭐ Pro Plan</span>
            <span style="color:${subDaysLeft() < 15 ? 'var(--danger)' : 'var(--primary)'}">${subDaysLeft()}d</span>
          </div>
          <div class="sub-bar"><div class="sub-bar-fill" style="width:${(subDaysLeft()/365)*100}%;background:var(--primary)"></div></div>
        </div>

        <div style="padding: 16px;">
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
            <div class="search-box">
              <span>🔍</span>
              <input type="text" placeholder="Search product..." readonly onclick="toast('Global search coming soon!')">
              <span style="font-size:10px;font-weight:700;color:var(--text-muted);">⌘ K</span>
            </div>
            <div class="avatar">${esc(SETTINGS.owner_name.substring(0,2).toUpperCase())}</div>
          </div>
        </header>
        
        ${!isSubActive() ? `
          <div style="background:var(--danger-bg);color:var(--danger);padding:12px 32px;display:flex;justify-content:space-between;align-items:center;font-weight:600;">
            <span>⚠ Your subscription has expired. You cannot add or edit data.</span>
            <button class="btn btn-primary btn-sm" onclick="openSubscriptionModal()">Renew Now</button>
          </div>
        ` : ''}

        <main id="content" class="main"></main>
      </div>
    </div>
  `;
  
  if(window.innerWidth <= 768) $('#mob-menu').style.display = 'block';
}

async function route() {
  const path = location.hash.split('?')[0] || '#/';
  
  if(!SESSION && path !== '#/login') { renderLogin(); return; }
  
  if(!window.DB_SYNCED) {
    $('#app').innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;"><div class="spinner" style="border:3px solid #eee;border-top-color:#5B4DF2;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;"></div></div>';
    await syncDB();
    await loadSubscription();
  }
  
  renderLayout();
  const content = $('#content');
  
  try {
    if(path === '#/') renderDashboard(content);
    else if(path === '#/products') renderProducts(content);
    else if(path === '#/invoices') renderInvoices(content);
    else if(path === '#/customers') renderCustomers(content);
    else if(path === '#/myshop') renderMyShop(content);
    else { content.innerHTML = '<div class="card"><h2>Page under construction</h2><p class="text-muted">This module will be added in the next block.</p></div>'; }
  } catch(e) { 
    content.innerHTML = `<div class="card" style="color:red;padding:20px;">Error: ${e.message}</div>`; 
  }
}

/* ─────────────────────────────────────────────
   7. LOGIN SCREEN
   ───────────────────────────────────────────── */
function renderLogin() {
  $('#app').innerHTML = `
    <style>
      @keyframes spin { 100% { transform: rotate(360deg); } }
    </style>
    <div style="display:flex;min-height:100vh;background:var(--bg-app);align-items:center;justify-content:center;">
      <div style="width:100%;max-width:400px;padding:40px;background:var(--bg-card);border-radius:16px;box-shadow:var(--shadow-md);">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="width:56px;height:56px;background:var(--primary);color:white;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:16px;box-shadow:0 8px 20px rgba(91,77,242,0.3);">🎨</div>
          <h1 style="font-size:24px;font-weight:800;">Finora Paints</h1>
          <p style="color:var(--text-muted);font-size:14px;">Sign in to manage your business</p>
        </div>
        <form id="login-form">
          <div style="margin-bottom:16px;">
            <label class="label">Email</label>
            <input class="input" type="email" id="email" required placeholder="owner@example.com" style="height:44px;">
          </div>
          <div style="margin-bottom:24px;">
            <label class="label">Password</label>
            <input class="input" type="password" id="password" required placeholder="••••••••" style="height:44px;">
          </div>
          <div id="l-err" style="display:none;color:var(--danger);background:var(--danger-bg);padding:10px;border-radius:8px;font-size:13px;margin-bottom:16px;text-align:center;"></div>
          <button class="btn btn-primary" style="width:100%;height:44px;font-size:15px;" id="login-btn">Sign In</button>
        </form>
      </div>
    </div>
  `;
  
  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#login-btn'); 
    const err = $('#l-err');
    btn.textContent = 'Signing in...'; 
    btn.disabled = true;
    err.style.display = 'none';
    
    try { 
      await login($('#email').value.trim(), $('#password').value); 
      await syncDB();
      await loadSubscription();
      route();
    } catch(e) { 
      err.textContent = e.message || 'Login failed'; 
      err.style.display = 'block';
      btn.textContent = 'Sign In'; 
      btn.disabled = false; 
    }
  };
}

/* ─────────────────────────────────────────────
   8. DASHBOARD (FINORA STYLE)
   ───────────────────────────────────────────── */
function renderDashboard(content) {
  const today = todayStr();
  const invs = DB.invoices || [];
  
  const totalSales = invs.filter(i => !String(i.invoice_no||'').startsWith(RETURN_PREFIX)).reduce((s, i) => s + Number(i.total || 0), 0);
  const totalPurchases = (DB.supplier_invoices || []).reduce((s, b) => s + Number(b.total || 0), 0);
  
  let receivable = 0;
  DB.customers.forEach(c => {
    receivable += invs.filter(i => i.customer_id === c.id).reduce((s, i) => s + Number(i.due || 0), 0);
  });
  
  let payable = 0;
  DB.suppliers.forEach(s => {
    payable += (DB.supplier_invoices || []).filter(b => b.supplier_id === s.id).reduce((sum, b) => sum + (Number(b.total) - Number(b.paid)), 0);
  });

  // Calculate chart data (Last 7 days mock for now, will wire to real data later)
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const salesData = [12000, 19000, 15000, 22000, 18000, 29000, 24000];
  const purchaseData = [8000, 12000, 10000, 14000, 11000, 16000, 13000];

  content.innerHTML = `
    <div class="grid-4">
      <div class="card">
        <div class="kpi-head">
          <div><div class="kpi-label">Total Sales</div><div class="kpi-value">${rs(totalSales)}</div></div>
          <div class="kpi-icon" style="background:var(--primary-light);color:var(--primary)">💰</div>
        </div>
        <span class="kpi-trend trend-up">↗ 12.5%</span>
        <div class="kpi-sub">Earned this month</div>
      </div>

      <div class="card">
        <div class="kpi-head">
          <div><div class="kpi-label">Total Purchases</div><div class="kpi-value">${rs(totalPurchases)}</div></div>
          <div class="kpi-icon" style="background:var(--warning-bg);color:var(--warning)">📥</div>
        </div>
        <span class="kpi-trend trend-up">↗ 8.2%</span>
        <div class="kpi-sub">Stock purchased</div>
      </div>

      <div class="card">
        <div class="kpi-head">
          <div><div class="kpi-label">Receivable</div><div class="kpi-value">${rs(receivable)}</div></div>
          <div class="kpi-icon" style="background:var(--info-bg);color:var(--info)">🧑</div>
        </div>
        <span class="kpi-trend trend-down">↘ 2.1%</span>
        <div class="kpi-sub">Due from customers</div>
      </div>

      <div class="card">
        <div class="kpi-head">
          <div><div class="kpi-label">Payable</div><div class="kpi-value">${rs(payable)}</div></div>
          <div class="kpi-icon" style="background:var(--danger-bg);color:var(--danger)">🏢</div>
        </div>
        <span class="kpi-trend trend-up">↗ 1.5%</span>
        <div class="kpi-sub">Owed to suppliers</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Sales Overview</div>
        <div style="height:300px; position:relative;"><canvas id="dash-chart"></canvas></div>
      </div>
      
      <div class="card">
        <div class="card-title">Quick Actions</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
          <button class="btn btn-primary" onclick="openNewInvoiceForm()">+ New Invoice</button>
          <button class="btn btn-ghost" onclick="openPurchaseForm()">+ New Purchase</button>
          <button class="btn btn-ghost" onclick="openProductForm()">+ Add Product</button>
          <button class="btn btn-ghost" onclick="toast('Add customer form coming soon')">+ Add Customer</button>
        </div>
        
        <div class="card-title" style="margin-top:32px;">Recent Transactions</div>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Type</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              ${invs.slice(0,4).map(i => `
                <tr>
                  <td style="font-weight:600;">${esc(i.invoice_no || 'INV')}</td>
                  <td class="text-sm text-muted">${fmtDate(i.invoice_date)}</td>
                  <td style="font-weight:600;">${rs(i.total)}</td>
                  <td><span class="chip ${i.due > 0 ? 'chip-warning' : 'chip-success'}">${i.due > 0 ? 'Unpaid' : 'Paid'}</span></td>
                </tr>
              `).join('')}
              ${invs.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#999;">No transactions yet</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Render Chart
  const ctx = document.getElementById('dash-chart');
  if(ctx && typeof Chart !== 'undefined') {
    if(charts.length) charts.forEach(c => c.destroy());
    charts = [new Chart(ctx, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [
          { label: 'Sales', data: salesData, backgroundColor: '#5B4DF2', borderRadius: 6, barThickness: 16 },
          { label: 'Purchases', data: purchaseData, backgroundColor: '#E2E1FB', borderRadius: 6, barThickness: 16 }
        ]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false, 
        plugins: { legend: { display: false } }, 
        scales: { 
          y: { display: false, beginAtZero: true }, 
          x: { grid: { display: false }, border: { display: false } } 
        } 
      }
    })];
  }
}

window.addEventListener('hashchange', route);
(async function boot() {
  await initAuth();
  if(SESSION) { await syncDB(); await loadSubscription(); }
  route();
})();
/* ══════════════════════════════════════════════════════════════════
   FINORA — PAINT SHOP MANAGER
   BLOCK 2: Products, Batches, Settings & Utils
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   9. INVENTORY HELPERS
   ───────────────────────────────────────────── */
function productTotalStock(p) {
  if(!p) return 0;
  if(p.batch_managed === false) return Number(p.stock) || 0;
  return DB.product_batches.filter(b => b.product_id === p.id).reduce((s, b) => s + (Number(b.qty) || 0), 0);
}

function isOutOfStock(p) { return productTotalStock(p) <= 0; }
function isLowStock(p) { return productTotalStock(p) > 0 && productTotalStock(p) <= Number(p.low_stock_alert || 5); }

function stockBadge(p) {
  if(isOutOfStock(p)) return '<span class="chip chip-danger">OUT</span>';
  if(isLowStock(p)) return '<span class="chip chip-warning">LOW</span>';
  return '<span class="chip chip-success">OK</span>';
}

function totalStockValue() {
  let total = 0;
  DB.products.forEach(p => {
    if(p.batch_managed === false) {
      total += (Number(p.stock) || 0) * (Number(p.cost) || 0);
    } else {
      DB.product_batches.filter(b => b.product_id === p.id).forEach(b => {
        total += (Number(b.qty) || 0) * (Number(b.cost) || 0);
      });
    }
  });
  return total;
}

function nextInvoiceNo() {
  let max = 0;
  DB.invoices.forEach(inv => {
    const no = String(inv.invoice_no || '');
    if(!no.startsWith(INVOICE_PREFIX)) return;
    const m = no.match(/(\d+)/);
    if(m) { const n = parseInt(m[1], 10); if(n > max) max = n; }
  });
  return INVOICE_PREFIX + String(max + 1).padStart(4, '0');
}

/* ─────────────────────────────────────────────
   10. SAVE SETTINGS
   ───────────────────────────────────────────── */
async function saveSettings() {
  const payload = {
    id: 1,
    shop_name: SETTINGS.shop_name || 'Finora Paints',
    owner_name: SETTINGS.owner_name || 'Owner',
    address: SETTINGS.address || '',
    city: SETTINGS.city || '',
    phone: SETTINGS.phone || '',
    email: SETTINGS.email || '',
    gst_enabled: !!SETTINGS.gst_enabled,
    gst_number: SETTINGS.gst_number || '',
    gst_rate: Number(SETTINGS.gst_rate) || 18,
    near_expiry_days: Number(SETTINGS.near_expiry_days) || 180,
    enable_non_batch: !!SETTINGS.enable_non_batch,
    print_footer: SETTINGS.print_footer || 'Thank you for your business!',
    updated_at: new Date().toISOString()
  };

  const { error } = await sb.from('settings').upsert(payload, { onConflict: 'id' });
  if(error) {
    console.error(error);
    toast('Failed to save settings', 'error');
    return false;
  }
  DB.settings = payload;
  return true;
}

/* ─────────────────────────────────────────────
   11. MY SHOP (SETTINGS)
   ───────────────────────────────────────────── */
function renderMyShop(content) {
  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>My Shop</h1>
        <p>Business details and preferences</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">Shop Details</div>
      <form id="shop-form" style="display:flex;flex-direction:column;gap:16px;">
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Shop name</label>
            <input class="input" name="shop_name" value="${esc(SETTINGS.shop_name || '')}" placeholder="e.g. Finora Paints">
          </div>
          <div>
            <label class="label">Owner name</label>
            <input class="input" name="owner_name" value="${esc(SETTINGS.owner_name || '')}" placeholder="Your full name">
          </div>
        </div>
        <div>
          <label class="label">Address</label>
          <input class="input" name="address" value="${esc(SETTINGS.address || '')}">
        </div>
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div><label class="label">City / Pin</label><input class="input" name="city" value="${esc(SETTINGS.city || '')}"></div>
          <div><label class="label">Phone</label><input class="input" type="tel" name="phone" value="${esc(SETTINGS.phone || '')}"></div>
        </div>
        <div style="display:flex;justify-content:flex-end;">
          <button class="btn btn-primary" type="submit" id="shop-save">Save Changes</button>
        </div>
      </form>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">Features & Preferences</div>
      
      <label style="display:flex;align-items:center;gap:12px;cursor:pointer;font-size:13px;padding:14px;background:var(--bg-app);border-radius:var(--radius-md);border:1px solid var(--border);margin-bottom:16px;">
        <input type="checkbox" id="non-batch-toggle" ${SETTINGS.enable_non_batch ? 'checked' : ''}>
        <span>
          <b>Enable non-batch products</b><br>
          <span class="field-hint">Turn ON if you also sell brushes, rollers, or other tools that don't require batch numbers.</span>
        </span>
      </label>

      <div>
        <label class="label">Default GST Rate (%)</label>
        <input class="input" type="number" id="gst-rate" value="${SETTINGS.gst_rate || 18}" style="max-width:200px;">
      </div>
    </div>
  `;

  $('#shop-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    SETTINGS.shop_name = fd.get('shop_name').trim() || 'Finora Paints';
    SETTINGS.owner_name = fd.get('owner_name').trim() || 'Owner';
    SETTINGS.address = fd.get('address').trim();
    SETTINGS.city = fd.get('city').trim();
    SETTINGS.phone = fd.get('phone').trim();

    const btn = $('#shop-save');
    btn.disabled = true; btn.textContent = 'Saving...';
    const ok = await saveSettings();
    btn.disabled = false; btn.textContent = 'Save Changes';
    if(ok) { toast('Shop details saved', 'success'); route(); }
  };

  $('#non-batch-toggle').onchange = async (e) => {
    SETTINGS.enable_non_batch = e.target.checked;
    const ok = await saveSettings();
    if(ok) toast('Settings saved', 'success');
  };

  $('#gst-rate').onchange = async (e) => {
    SETTINGS.gst_rate = Number(e.target.value) || 18;
    const ok = await saveSettings();
    if(ok) toast('GST rate saved', 'success');
  };
}

/* ─────────────────────────────────────────────
   12. PRODUCTS LIST
   ───────────────────────────────────────────── */
function renderProducts(content) {
  const list = DB.products;
  
  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Paint & Tools</h1>
        <p>${list.length} product${list.length === 1 ? '' : 's'} · ${DB.product_batches.length} total batches</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="add-prod">+ Add Product</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="p-search" placeholder="Name, brand, color...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Category</label>
        <select class="input" id="p-cat">
          <option value="">All Categories</option>
          ${PAINT_CATEGORIES.map(c => `<option>${c}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Filter</label>
        <select class="input" id="p-filter">
          <option value="">All Products</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
      </div>
    </div>

    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Product Name</th>
            <th>Details</th>
            <th>Category</th>
            <th style="text-align:right">Stock</th>
            <th>Status</th>
            <th style="text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody id="p-body"></tbody>
      </table>
    </div>
  `;

  function filtered() {
    const q = ($('#p-search').value || '').toLowerCase();
    const cat = $('#p-cat').value;
    const flt = $('#p-filter').value;

    return list.filter(p => {
      const hay = ((p.name || '') + ' ' + (p.brand || '') + ' ' + (p.color || '')).toLowerCase();
      if(q && !hay.includes(q)) return false;
      if(cat && p.category !== cat) return false;
      if(flt === 'low' && !isLowStock(p)) return false;
      if(flt === 'out' && !isOutOfStock(p)) return false;
      return true;
    });
  }

  function renderList() {
    const arr = filtered();
    const tbody = $('#p-body');

    if(arr.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No products found</td></tr>`;
      return;
    }

    tbody.innerHTML = arr.map(p => {
      const stock = productTotalStock(p);
      const unit = p.unit || 'pc';
      const isBatch = p.batch_managed !== false;

      return `<tr>
        <td>
          <div style="font-weight:600;">${esc(p.name)}</div>
          <div class="text-xs" style="color:var(--primary);margin-top:2px;">${esc(p.brand || '')} ${p.color ? '· ' + esc(p.color) : ''}</div>
        </td>
        <td>
          ${p.base_type ? `<div class="text-xs text-muted">Base: ${esc(p.base_type)}</div>` : ''}
          <div class="text-xs" style="margin-top:2px;">
            ${isBatch ? '<span class="chip chip-neutral" style="font-size:9px;">BATCH TRACKED</span>' : '<span class="chip chip-neutral" style="font-size:9px;">NON-BATCH</span>'}
          </div>
        </td>
        <td><span class="chip chip-neutral">${esc(p.category || '—')}</span></td>
        <td style="text-align:right;font-weight:600;">${fmtNum(stock)} <span class="text-xs text-muted">${esc(unit)}</span></td>
        <td>${stockBadge(p)}</td>
        <td style="text-align:right;white-space:nowrap;">
          ${isBatch ? `<button class="btn btn-ghost btn-sm" data-batch="${p.id}">+ Batch</button>` : `<button class="btn btn-ghost btn-sm" data-restock="${p.id}">+ Stock</button>`}
          <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-del="${p.id}">Del</button>
        </td>
      </tr>`;
    }).join('');

    $$('[data-edit]').forEach(b => b.onclick = () => {
      const p = DB.products.find(x => x.id === b.dataset.edit);
      if(p) openProductForm(p);
    });
    
    $$('[data-del]').forEach(b => b.onclick = async () => {
      if(!confirm('Delete this product? All associated batches will be deleted.')) return;
      const { error } = await sb.from('products').delete().eq('id', b.dataset.del);
      if(error) { toast('Failed to delete', 'error'); return; }
      await syncDB(); toast('Deleted', 'success'); renderList();
    });

    $$('[data-batch]').forEach(b => b.onclick = () => toast('Batch form coming in Part 3'));
    $$('[data-restock]').forEach(b => b.onclick = () => toast('Restock form coming in Part 3'));
  }

  ['p-search', 'p-cat', 'p-filter'].forEach(id => {
    const el = $('#' + id);
    if(el) { el.oninput = renderList; el.onchange = renderList; }
  });

  renderList();
  $('#add-prod').onclick = () => openProductForm();
}

/* ─────────────────────────────────────────────
   13. PRODUCT FORM (PAINT SHOP SPECIFIC)
   ───────────────────────────────────────────── */
function openProductForm(existing) {
  const isEdit = !!existing;
  const p = existing || {
    name: '', brand: '', color: '', base_type: '', category: 'Emulsion',
    unit: 'Litre', batch_managed: true, gst_rate: SETTINGS.gst_rate || 18,
    low_stock_alert: 5, cost: 0, selling_price: 0, stock: 0
  };

  const showToggle = SETTINGS.enable_non_batch === true;
  const isBatch = p.batch_managed !== false;

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'Edit' : 'New'} Product</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <form id="prf" style="display:flex;flex-direction:column;gap:16px;">
        
        <div>
          <label class="label">Product Name *</label>
          <input class="input" name="name" required value="${esc(p.name)}" placeholder="e.g. Apex Ultima" autofocus>
        </div>

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Brand</label>
            <input class="input" name="brand" value="${esc(p.brand)}" placeholder="e.g. Asian Paints">
          </div>
          <div>
            <label class="label">Color / Shade</label>
            <input class="input" name="color" value="${esc(p.color)}" placeholder="e.g. Royal Navy">
          </div>
        </div>

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Base Type</label>
            <select class="input" name="base_type">
              <option value="">Select Base</option>
              <option value="Water-Based" ${p.base_type==='Water-Based'?'selected':''}>Water-Based</option>
              <option value="Oil-Based" ${p.base_type==='Oil-Based'?'selected':''}>Oil-Based</option>
              <option value="Enamel" ${p.base_type==='Enamel'?'selected':''}>Enamel</option>
              <option value="Other" ${p.base_type==='Other'?'selected':''}>Other</option>
            </select>
          </div>
          <div>
            <label class="label">Category</label>
            <select class="input" name="category">
              ${PAINT_CATEGORIES.map(c => `<option ${p.category===c?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Unit</label>
            <select class="input" name="unit">
              ${PRODUCT_UNITS.map(u => `<option ${p.unit===u?'selected':''}>${u}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="label">Low Stock Alert</label>
            <input class="input" type="number" name="low_stock_alert" value="${p.low_stock_alert}">
          </div>
        </div>

        ${showToggle ? `
          <div style="padding:14px;background:var(--bg-app);border-radius:var(--radius-md);border:1px solid var(--border);">
            <label class="label">Batch Tracking</label>
            <select class="input" name="batch_managed" ${isEdit ? 'disabled' : ''}>
              <option value="yes" ${isBatch ? 'selected' : ''}>Yes — Require Batch No & Expiry (Paints)</option>
              <option value="no" ${!isBatch ? 'selected' : ''}>No — Standard Stock (Brushes, Tools)</option>
            </select>
            ${isEdit ? '<div class="text-xs text-muted" style="margin-top:4px;">Cannot be changed after creation.</div>' : ''}
          </div>
        ` : `<input type="hidden" name="batch_managed" value="yes">`}

        <div id="non-batch-fields" style="display:${(!showToggle || isBatch) ? 'none' : 'block'}; padding:16px; background:var(--primary-light); border-radius:var(--radius-md); border:1px solid var(--primary);">
          <div class="text-xs" style="font-weight:700;color:var(--primary);text-transform:uppercase;margin-bottom:12px;">Non-Batch Pricing</div>
          <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div><label class="label">Cost Price (₹)</label><input class="input" type="number" name="cost" value="${p.cost}"></div>
            <div><label class="label">Selling Price (₹)</label><input class="input" type="number" name="selling_price" value="${p.selling_price}"></div>
            <div><label class="label">Opening Stock</label><input class="input" type="number" name="stock" value="${p.stock}"></div>
          </div>
        </div>

        ${isBatch ? `
          <p class="text-xs text-muted" style="margin-top:4px;">💡 Stock and pricing for this product will be managed via <b>Batches</b>.</p>
        ` : ''}

      </form>
    </div>
    
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="prf-save">${isEdit ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    
    // Toggle logic
    const batchSel = root.querySelector('[name="batch_managed"]');
    const nbFields = root.querySelector('#non-batch-fields');
    if(batchSel && nbFields) {
      batchSel.onchange = (e) => {
        nbFields.style.display = e.target.value === 'no' ? 'block' : 'none';
      };
    }

    root.querySelector('#prf-save').onclick = async () => {
      const form = root.querySelector('#prf');
      if(!form.reportValidity()) return;

      const fd = new FormData(form);
      const isManaged = (fd.get('batch_managed') || 'yes') === 'yes';

      const data = {
        name: fd.get('name').trim(),
        brand: fd.get('brand').trim(),
        color: fd.get('color').trim(),
        base_type: fd.get('base_type'),
        category: fd.get('category'),
        unit: fd.get('unit'),
        batch_managed: isManaged,
        gst_rate: Number(SETTINGS.gst_rate) || 18,
        low_stock_alert: Number(fd.get('low_stock_alert')) || 0,
        cost: isManaged ? 0 : (Number(fd.get('cost')) || 0),
        selling_price: isManaged ? 0 : (Number(fd.get('selling_price')) || 0),
        stock: isManaged ? 0 : (Number(fd.get('stock')) || 0)
      };

      const btn = root.querySelector('#prf-save');
      btn.disabled = true; btn.textContent = 'Saving...';

      let res;
      if(isEdit) res = await sb.from('products').update(data).eq('id', p.id);
      else res = await sb.from('products').insert(data);

      if(res.error) {
        toast(res.error.message, 'error');
        btn.disabled = false; btn.textContent = 'Save';
        return;
      }

      await syncDB();
      toast('Product saved', 'success');
      closeModal(root);
      renderProducts($('#content'));
    };
  });
}

/* ─────────────────────────────────────────────
   14. STUBS FOR PAGES COMING IN PART 3
   ───────────────────────────────────────────── */
function renderInvoices(content) { content.innerHTML = '<div class="card"><h2>Invoices</h2><p>Coming in Part 3...</p></div>'; }
function renderCustomers(content) { content.innerHTML = '<div class="card"><h2>Customers</h2><p>Coming in Part 3...</p></div>'; }
function openNewInvoiceForm() { toast('Invoice builder coming in Part 3'); }
function openPurchaseForm() { toast('Purchase bill coming in Part 3'); }
/* ══════════════════════════════════════════════════════════════════
   FINORA — PAINT SHOP MANAGER
   BLOCK 3: Batches, Customers, Purchases & Invoices
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   15. BATCH FORM
   ───────────────────────────────────────────── */
function openBatchForm(productId, existing) {
  const p = DB.products.find(x => x.id === productId);
  if(!p) return;

  const isEdit = !!existing;
  const b = existing || {
    batch_no: '', expiry_date: '', qty: 0, cost: 0, mrp: 0, selling_price: 0
  };

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'Edit Batch' : 'Add Batch'}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <p class="text-sm text-muted" style="margin-bottom:16px;">Product: <b>${esc(p.name)}</b> (${esc(p.color || '')})</p>
      <form id="bf" style="display:flex;flex-direction:column;gap:16px;">
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Batch No *</label>
            <input class="input" name="batch_no" required value="${esc(b.batch_no)}" placeholder="e.g. BT-001">
          </div>
          <div>
            <label class="label">Expiry Date</label>
            <input class="input" type="date" name="expiry_date" value="${esc(b.expiry_date)}">
          </div>
        </div>
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div><label class="label">Quantity (${esc(p.unit)}) *</label><input class="input" type="number" step="any" name="qty" required value="${b.qty}"></div>
          <div><label class="label">Cost Price (₹)</label><input class="input" type="number" step="any" name="cost" value="${b.cost}"></div>
        </div>
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div><label class="label">MRP (₹)</label><input class="input" type="number" step="any" name="mrp" value="${b.mrp}"></div>
          <div><label class="label">Selling Price (₹)</label><input class="input" type="number" step="any" name="selling_price" value="${b.selling_price}"></div>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="bf-save">Save Batch</button>
    </div>
  `, (root) => {
    root.querySelector('#bf-save').onclick = async () => {
      const form = root.querySelector('#bf');
      if(!form.reportValidity()) return;
      const fd = new FormData(form);

      const data = {
        product_id: p.id,
        batch_no: fd.get('batch_no').trim(),
        expiry_date: fd.get('expiry_date') || null,
        qty: Number(fd.get('qty')) || 0,
        cost: Number(fd.get('cost')) || 0,
        mrp: Number(fd.get('mrp')) || 0,
        selling_price: Number(fd.get('selling_price')) || Number(fd.get('mrp')) || 0
      };

      const btn = root.querySelector('#bf-save');
      btn.disabled = true; btn.textContent = 'Saving...';

      let res;
      if(isEdit) res = await sb.from('product_batches').update(data).eq('id', existing.id);
      else res = await sb.from('product_batches').insert(data);

      if(res.error) { toast(res.error.message, 'error'); btn.disabled = false; btn.textContent = 'Save'; return; }
      
      await syncDB(); toast('Batch saved', 'success'); closeModal(root); route();
    };
  });
}

/* ─────────────────────────────────────────────
   16. CUSTOMERS
   ───────────────────────────────────────────── */
function renderCustomers(content) {
  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title"><h1>Customers</h1><p>${DB.customers.length} customers</p></div>
      <div class="page-head-actions"><button class="btn btn-primary" id="add-cust">+ Add Customer</button></div>
    </div>
    <div class="card" style="padding:0; overflow:hidden;">
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Address</th><th>Joined</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody>
            ${DB.customers.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:40px;">No customers yet</td></tr>' : 
              DB.customers.map(c => `
              <tr>
                <td style="font-weight:600;">${esc(c.name)}</td>
                <td>${esc(c.phone || '—')}</td>
                <td class="text-sm text-muted">${esc(c.address || '—')}</td>
                <td class="text-sm text-muted">${fmtDate(c.joined_date)}</td>
                <td style="text-align:right;">
                  <button class="btn btn-ghost btn-sm" onclick="openCustomerForm(${JSON.stringify(c).replace(/"/g, '&quot;')})">Edit</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  $('#add-cust').onclick = () => openCustomerForm();
}

function openCustomerForm(existing) {
  openModal(`
    <div class="modal-header"><div class="modal-title">${existing ? 'Edit' : 'New'} Customer</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <form id="cf" style="display:flex;flex-direction:column;gap:16px;">
        <div><label class="label">Name *</label><input class="input" name="name" required value="${esc(existing?.name || '')}"></div>
        <div><label class="label">Phone</label><input class="input" type="tel" name="phone" value="${esc(existing?.phone || '')}"></div>
        <div><label class="label">Address</label><input class="input" name="address" value="${esc(existing?.address || '')}"></div>
      </form>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="cf-save">Save</button></div>
  `, (root) => {
    root.querySelector('#cf-save').onclick = async () => {
      const form = root.querySelector('#cf');
      if(!form.reportValidity()) return;
      const fd = new FormData(form);
      const data = { name: fd.get('name').trim(), phone: fd.get('phone').trim(), address: fd.get('address').trim() };
      
      let res;
      if(existing) res = await sb.from('customers').update(data).eq('id', existing.id);
      else res = await sb.from('customers').insert(data);
      
      if(res.error) return toast(res.error.message, 'error');
      await syncDB(); toast('Customer saved', 'success'); closeModal(root); route();
    };
  });
}

/* ─────────────────────────────────────────────
   17. PURCHASES (ADD STOCK VIA BATCHES)
   ───────────────────────────────────────────── */
function openPurchaseForm() {
  if(DB.suppliers.length === 0) return toast('Please add a supplier first in the database.', 'info');
  
  // For simplicity in this block, we'll just let them pick a supplier and add items
  openModal(`
    <div class="modal-header"><div class="modal-title">New Purchase Bill</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <p class="text-sm text-muted" style="margin-bottom:16px;">This creates new batches for your paint products.</p>
      <form id="puf" style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <label class="label">Supplier *</label>
          <select class="input" name="supplier_id" required>
            <option value="">Select Supplier</option>
            ${DB.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div><label class="label">Bill No</label><input class="input" name="bill_no"></div>
          <div><label class="label">Date</label><input class="input" type="date" name="bill_date" value="${todayStr()}"></div>
        </div>
        <div style="padding:16px;background:var(--bg-app);border-radius:var(--radius-md);text-align:center;">
          <p class="text-sm">To add items and batches, please use the detailed purchase entry in the next update.</p>
          <p class="text-xs text-muted">For now, you can add batches manually via the Products page (+ Batch).</p>
        </div>
      </form>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="toast('Detailed purchase entry coming soon'); closeModal()">Save (Demo)</button></div>
  `);
}

/* ─────────────────────────────────────────────
   18. INVOICES LIST
   ───────────────────────────────────────────── */
function renderInvoices(content) {
  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title"><h1>Invoices</h1><p>${DB.invoices.length} total invoices</p></div>
      <div class="page-head-actions"><button class="btn btn-primary" onclick="location.hash='#/new-invoice'">+ New Invoice</button></div>
    </div>
    <div class="card" style="padding:0; overflow:hidden;">
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody>
            ${DB.invoices.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:40px;">No invoices yet</td></tr>' : 
              DB.invoices.map(i => `
              <tr>
                <td style="font-weight:600;">${esc(i.invoice_no)}</td>
                <td>${esc(i.customer_name || 'Walk-in')}</td>
                <td class="text-sm text-muted">${fmtDate(i.invoice_date)}</td>
                <td style="font-weight:600;">${rs(i.total)}</td>
                <td><span class="chip ${i.due > 0 ? 'chip-warning' : 'chip-success'}">${i.due > 0 ? 'Unpaid' : 'Paid'}</span></td>
                <td style="text-align:right;">
                  <button class="btn btn-ghost btn-sm" onclick="viewInvoice('${i.id}')">View</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* ─────────────────────────────────────────────
   19. NEW INVOICE BUILDER (POS)
   ───────────────────────────────────────────── */
function renderNewInvoice(content) {
  let cart = [];

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title"><h1>New Invoice</h1><p>Select products and batches to sell</p></div>
      <div class="page-head-actions"><button class="btn btn-ghost" onclick="location.hash='#/invoices'">Cancel</button></div>
    </div>

    <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;align-items:start;">
      
      <!-- Left: Product Selection -->
      <div class="card">
        <div class="card-title">Add Items</div>
        
        <div class="grid-2" style="margin-bottom:20px; display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div>
            <label class="label">Select Product</label>
            <select class="input" id="inv-prod-select">
              <option value="">Choose a product...</option>
              ${DB.products.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.brand || '')} - ${esc(p.color || '')})</option>`).join('')}
            </select>
          </div>
          <div id="batch-select-wrap" style="display:none;">
            <label class="label">Select Batch</label>
            <select class="input" id="inv-batch-select"></select>
          </div>
        </div>

        <div id="inv-cart" class="tbl-wrap">
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th><th></th></tr></thead>
            <tbody id="inv-cart-body"></tbody>
          </table>
        </div>
      </div>

      <!-- Right: Summary -->
      <div class="card">
        <div class="card-title">Summary</div>
        
        <div style="margin-bottom:16px;">
          <label class="label">Customer (Optional)</label>
          <select class="input" id="inv-cust-select">
            <option value="">Walk-in Customer</option>
            ${DB.customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
          </select>
        </div>

        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span class="text-muted">Subtotal</span><b id="inv-subtotal">₹0.00</b></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:16px;padding-top:16px;border-top:1px solid var(--border);"><b>Total</b><b id="inv-total" style="color:var(--primary);font-size:18px;">₹0.00</b></div>
        
        <button class="btn btn-primary" style="width:100%;" id="inv-save-btn">Save Invoice</button>
      </div>

    </div>
  `;

  // Logic for adding items
  $('#inv-prod-select').onchange = (e) => {
    const pid = e.target.value;
    if(!pid) { $('#batch-select-wrap').style.display = 'none'; return; }
    
    const p = DB.products.find(x => x.id === pid);
    if(p.batch_managed) {
      const batches = DB.product_batches.filter(b => b.product_id === pid && b.qty > 0);
      if(batches.length === 0) {
        toast('No stock available for this product', 'error');
        e.target.value = '';
        $('#batch-select-wrap').style.display = 'none';
        return;
      }
      $('#batch-select-wrap').style.display = 'block';
      $('#inv-batch-select').innerHTML = batches.map(b => `<option value="${b.id}">${esc(b.batch_no || 'No Batch')} (Qty: ${b.qty}, Price: ₹${b.selling_price})</option>`).join('');
    } else {
      $('#batch-select-wrap').style.display = 'none';
      addToCart(p, null);
      e.target.value = '';
    }
  };

  $('#inv-batch-select').onchange = (e) => {
    const bid = e.target.value;
    const pid = $('#inv-prod-select').value;
    if(!bid || !pid) return;
    const p = DB.products.find(x => x.id === pid);
    const b = DB.product_batches.find(x => x.id === bid);
    addToCart(p, b);
    $('#inv-prod-select').value = '';
    $('#batch-select-wrap').style.display = 'none';
  };

  function addToCart(product, batch) {
    const price = batch ? Number(batch.selling_price) : Number(product.selling_price);
    const existing = cart.find(c => c.product_id === product.id && c.batch_id === (batch ? batch.id : null));
    
    if(existing) {
      existing.qty++;
      existing.total = existing.qty * existing.price;
    } else {
      cart.push({
        product_id: product.id,
        batch_id: batch ? batch.id : null,
        name: product.name + (batch ? ` (Batch: ${batch.batch_no})` : ''),
        qty: 1,
        price: price,
        total: price,
        max_qty: batch ? batch.qty : product.stock
      });
    }
    renderCart();
  }

  function renderCart() {
    const tbody = $('#inv-cart-body');
    if(cart.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#999;">Cart is empty</td></tr>';
      updateTotals();
      return;
    }

    tbody.innerHTML = cart.map((c, i) => `
      <tr>
        <td><b>${esc(c.name)}</b></td>
        <td>
          <input type="number" min="1" max="${c.max_qty}" value="${c.qty}" onchange="updateCartQty(${i}, this.value)" style="width:60px;padding:4px;border:1px solid #ddd;border-radius:4px;">
        </td>
        <td>${rs(c.price)}</td>
        <td style="font-weight:600;">${rs(c.total)}</td>
        <td style="text-align:right;"><button onclick="removeCartItem(${i})" style="color:red;border:none;background:none;cursor:pointer;">✕</button></td>
      </tr>
    `).join('');
    updateTotals();
  }

  window.updateCartQty = (index, val) => {
    const qty = parseInt(val);
    if(qty < 1) return;
    if(qty > cart[index].max_qty) { toast('Not enough stock', 'error'); return renderCart(); }
    cart[index].qty = qty;
    cart[index].total = qty * cart[index].price;
    renderCart();
  };

  window.removeCartItem = (index) => {
    cart.splice(index, 1);
    renderCart();
  };

  function updateTotals() {
    const sub = cart.reduce((s, c) => s + c.total, 0);
    $('#inv-subtotal').textContent = rs(sub);
    $('#inv-total').textContent = rs(sub);
  }

  // Save Invoice
  $('#inv-save-btn').onclick = async () => {
    if(cart.length === 0) return toast('Add items first', 'error');
    
    const btn = $('#inv-save-btn');
    btn.disabled = true; btn.textContent = 'Saving...';

    const custId = $('#inv-cust-select').value;
    const custName = custId ? DB.customers.find(c => c.id === custId).name : 'Walk-in';
    const sub = cart.reduce((s, c) => s + c.total, 0);

    const invData = {
      invoice_no: nextInvoiceNo(),
      customer_id: custId || null,
      customer_name: custName,
      subtotal: sub,
      total: sub,
      paid: sub,
      due: 0,
      invoice_date: todayStr()
    };

    // 1. Create Invoice
    const { data: inv, error: invErr } = await sb.from('invoices').insert(invData).select().single();
    if(invErr) { toast(invErr.message, 'error'); btn.disabled = false; return; }

    // 2. Create Invoice Items & Deduct Stock
    for(const item of cart) {
      await sb.from('invoice_items').insert({
        invoice_id: inv.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        product_name: item.name,
        qty: item.qty,
        price: item.price,
        total: item.total
      });

      // Deduct stock
      if(item.batch_id) {
        const { data: b } = await sb.from('product_batches').select('qty').eq('id', item.batch_id).single();
        await sb.from('product_batches').update({ qty: b.qty - item.qty }).eq('id', item.batch_id);
      } else {
        const { data: p } = await sb.from('products').select('stock').eq('id', item.product_id).single();
        await sb.from('products').update({ stock: p.stock - item.qty }).eq('id', item.product_id);
      }
    }

    await syncDB();
    toast('Invoice saved successfully', 'success');
    location.hash = '#/invoices';
  };

  renderCart();
}

// Stub for view invoice
window.viewInvoice = (id) => {
  toast('Invoice view coming soon!');
};
/* ══════════════════════════════════════════════════════════════════
   FINORA — PAINT SHOP MANAGER
   BLOCK 4: Invoice View, Printing, WhatsApp & Subscription
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   20. INVOICE VIEW & ROUTER UPDATE
   ───────────────────────────────────────────── */
async function renderInvoiceView(content, id) {
  const inv = DB.invoices.find(x => x.id === id);
  if(!inv) {
    content.innerHTML = '<div class="card"><h2>Invoice not found</h2></div>';
    return;
  }

  const items = DB.invoice_items.filter(x => x.invoice_id === inv.id);
  
  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/invoices" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Invoices</a>
    </div>

    <div class="page-head">
      <div class="page-head-title">
        <h1>Invoice ${esc(inv.invoice_no)}</h1>
        <p>${fmtDate(inv.invoice_date)} · ${esc(inv.customer_name)}</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" onclick="printThermal('${inv.id}')">🖨 Thermal Print</button>
        <button class="btn btn-ghost" onclick="downloadPDF('${inv.id}')">📄 A4 PDF</button>
        <button class="btn" style="background:#25D366;color:#fff;" onclick="sendWhatsApp('${inv.id}')">💬 WhatsApp</button>
      </div>
    </div>

    <div class="card" style="max-width:800px;margin:0 auto;">
      <div style="text-align:center;border-bottom:1px dashed var(--border);padding-bottom:20px;margin-bottom:20px;">
        <h2 style="font-size:24px;font-weight:800;margin-bottom:4px;">${esc(SETTINGS.shop_name)}</h2>
        <p class="text-sm text-muted">${esc(SETTINGS.address || '')} ${SETTINGS.phone ? '· Ph: ' + esc(SETTINGS.phone) : ''}</p>
        ${SETTINGS.gst_enabled ? `<p class="text-xs text-muted">GSTIN: ${esc(SETTINGS.gst_number)}</p>` : ''}
      </div>

      <div style="display:flex;justify-content:space-between;margin-bottom:24px;">
        <div>
          <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Billed To</div>
          <div style="font-weight:600;font-size:16px;">${esc(inv.customer_name)}</div>
        </div>
        <div style="text-align:right;">
          <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Invoice Details</div>
          <div class="text-sm">No: <b>${esc(inv.invoice_no)}</b></div>
          <div class="text-sm">Date: ${fmtDate(inv.invoice_date)}</div>
        </div>
      </div>

      <table style="width:100%;margin-bottom:24px;">
        <thead>
          <tr style="border-bottom:2px solid var(--border);">
            <th style="text-align:left;padding:10px 0;">Item</th>
            <th style="text-align:center;padding:10px 0;">Qty</th>
            <th style="text-align:right;padding:10px 0;">Rate</th>
            <th style="text-align:right;padding:10px 0;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(it => `
            <tr style="border-bottom:1px solid var(--border);">
              <td style="padding:12px 0;">
                <div style="font-weight:600;">${esc(it.product_name)}</div>
                ${it.batch_no ? `<div class="text-xs text-muted">Batch: ${esc(it.batch_no)}</div>` : ''}
              </td>
              <td style="text-align:center;">${fmtNum(it.qty)}</td>
              <td style="text-align:right;">${rs(it.price)}</td>
              <td style="text-align:right;font-weight:600;">${rs(it.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
        <div style="display:flex;justify-content:space-between;width:200px;">
          <span class="text-muted">Subtotal</span>
          <b>${rs(inv.subtotal)}</b>
        </div>
        <div style="display:flex;justify-content:space-between;width:200px;padding-top:8px;border-top:1px solid var(--border);">
          <span style="font-weight:700;">Total</span>
          <b style="color:var(--primary);font-size:18px;">${rs(inv.total)}</b>
        </div>
      </div>
    </div>
  `;
}

// Override the router to handle /invoice/:id
const _origRoute = route;
route = async function() {
  const path = location.hash.split('?')[0] || '#/';
  if(path.startsWith('#/invoice/')) {
    if(!SESSION) return renderLogin();
    if(!window.DB_SYNCED) await syncDB();
    renderLayout();
    const id = path.replace('#/invoice/', '');
    renderInvoiceView($('#content'), id);
    return;
  }
  return _origRoute.apply(this, arguments);
};

/* ─────────────────────────────────────────────
   21. THERMAL PRINTER (58mm/80mm)
   ───────────────────────────────────────────── */
function printThermal(invId) {
  const inv = DB.invoices.find(x => x.id === invId);
  const items = DB.invoice_items.filter(x => x.invoice_id === invId);
  if(!inv) return;

  if(typeof ReceiptPrinterEncoder === 'undefined') {
    return toast('Printer library not loaded', 'error');
  }

  const W = 32; // 58mm standard
  const line = (l, r) => {
    l = String(l || ''); r = String(r || '');
    if(l.length + r.length >= W) l = l.slice(0, Math.max(0, W - r.length - 1));
    return l + ' '.repeat(Math.max(1, W - l.length - r.length)) + r;
  };

  const enc = new ReceiptPrinterEncoder({ language: 'esc-pos' });
  
  enc.initialize();
  enc.align('center').bold(true).size(2, 2).text(SETTINGS.shop_name || 'Finora Paints').newline();
  enc.size(1, 1).bold(false);
  enc.text(SETTINGS.address || '').newline();
  enc.text(SETTINGS.phone ? 'Ph: ' + SETTINGS.phone : '').newline();
  enc.newline();
  
  enc.align('left').text('-'.repeat(W)).newline();
  enc.text(line('Bill: ' + inv.invoice_no, fmtDate(inv.invoice_date))).newline();
  enc.text(line('Cust: ' + inv.customer_name, '')).newline();
  enc.text('-'.repeat(W)).newline();

  items.forEach(it => {
    enc.text(it.product_name).newline();
    if(it.batch_no) enc.text('  Batch: ' + it.batch_no).newline();
    enc.text(line('  ' + fmtNum(it.qty) + ' x ' + Number(it.price).toFixed(2), Number(it.total).toFixed(2))).newline();
  });

  enc.text('-'.repeat(W)).newline();
  enc.text(line('Subtotal:', 'Rs.' + Number(inv.subtotal).toFixed(2))).newline();
  enc.bold(true).text(line('TOTAL:', 'Rs.' + Number(inv.total).toFixed(2))).bold(false).newline();
  enc.newline();
  enc.align('center').text('Thank you for your business!').newline();
  enc.newline(3);
  enc.cut();

  const bytes = enc.encode();

  // Try WebUSB, fallback to browser print
  if(navigator.usb) {
    navigator.usb.requestDevice({ filters: [] }).then(async device => {
      await device.open();
      if(device.configuration === null) await device.selectConfiguration(1);
      await device.claimInterface(0);
      const ep = device.configuration.interfaces[0].alternates[0].endpoints.find(e => e.direction === 'out');
      if(ep) {
        await device.transferOut(ep.endpointNumber, bytes);
        toast('Sent to USB printer', 'success');
      } else {
        toast('No USB out endpoint found', 'error');
      }
    }).catch(err => {
      if(err.name !== 'NotFoundError') toast('USB print failed', 'error');
    });
  } else {
    toast('WebUSB not supported. Try Chrome/Edge.', 'error');
  }
}

/* ─────────────────────────────────────────────
   22. A4 PDF GENERATION
   ───────────────────────────────────────────── */
function downloadPDF(invId) {
  const inv = DB.invoices.find(x => x.id === invId);
  const items = DB.invoice_items.filter(x => x.invoice_id === invId);
  if(!inv || !window.jspdf) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(SETTINGS.shop_name || 'Finora Paints', 14, 20);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(SETTINGS.address || '', 14, 28);
  doc.text(SETTINGS.phone ? 'Ph: ' + SETTINGS.phone : '', 14, 33);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', 14, 45);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Bill To: ' + inv.customer_name, 14, 52);
  doc.text('Date: ' + fmtDate(inv.invoice_date), 14, 57);
  doc.text('Invoice No: ' + inv.invoice_no, 14, 62);

  const tableBody = items.map(it => [
    it.product_name + (it.batch_no ? ' (B: ' + it.batch_no + ')' : ''),
    fmtNum(it.qty),
    Number(it.price).toFixed(2),
    Number(it.total).toFixed(2)
  ]);

  doc.autoTable({
    startY: 70,
    head: [['Item', 'Qty', 'Rate', 'Total']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [91, 77, 242] }
  });

  let finalY = doc.lastAutoTable.finalY + 10;
  doc.text('Total: Rs. ' + Number(inv.total).toFixed(2), 150, finalY);

  doc.save('Invoice-' + inv.invoice_no + '.pdf');
  toast('PDF downloaded', 'success');
}

/* ─────────────────────────────────────────────
   23. WHATSAPP SHARING
   ───────────────────────────────────────────── */
function sendWhatsApp(invId) {
  const inv = DB.invoices.find(x => x.id === invId);
  const items = DB.invoice_items.filter(x => x.invoice_id === invId);
  if(!inv) return;

  let msg = `*${SETTINGS.shop_name || 'Finora Paints'}*\n\n`;
  msg += `*Invoice:* ${inv.invoice_no}\n`;
  msg += `*Date:* ${fmtDate(inv.invoice_date)}\n`;
  msg += `*Customer:* ${inv.customer_name}\n\n`;
  msg += `*Items:*\n`;
  
  items.forEach(it => {
    msg += `- ${it.product_name} ${it.batch_no ? '(B:'+it.batch_no+')' : ''}\n`;
    msg += `  ${fmtNum(it.qty)} x ${rs(it.price)} = ${rs(it.total)}\n`;
  });

  msg += `\n*Total: ${rs(inv.total)}*\n\n`;
  msg += `Thank you for your business!`;

  const text = encodeURIComponent(msg);
  window.open(`https://wa.me/?text=${text}`, '_blank');
}

/* ─────────────────────────────────────────────
   24. SUBSCRIPTION MODALS & GUARDS
   ───────────────────────────────────────────── */
window.openSubscriptionModal = async function() {
  const upiStr = `upi://pay?pa=${SUB_OWNER_UPI}&pn=${encodeURIComponent(SUB_OWNER_NAME)}&am=${SUB_PLAN_AMOUNT}&cu=INR`;
  let qrUrl = '';
  
  if(typeof QRCode !== 'undefined') {
    qrUrl = await QRCode.toDataURL(upiStr, { width: 200, margin: 2 });
  }

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Renew Subscription</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" style="text-align:center;">
      <p class="text-sm text-muted" style="margin-bottom:20px;">Scan to pay ₹${SUB_PLAN_AMOUNT} for 1 year of access.</p>
      ${qrUrl ? `<img src="${qrUrl}" style="width:200px;height:200px;border-radius:12px;border:1px solid #eee;margin-bottom:16px;">` : ''}
      <div style="background:var(--bg-app);padding:12px;border-radius:8px;margin-bottom:20px;">
        <div class="text-xs text-muted" style="margin-bottom:4px;">Or pay to UPI ID:</div>
        <div style="font-weight:700;font-family:monospace;font-size:14px;">${esc(SUB_OWNER_UPI)}</div>
      </div>
      <p class="text-xs text-muted">Send the payment screenshot on WhatsApp to activate.</p>
      <a href="https://wa.me/${window.APP_CONFIG.SUB_SUPPORT_WHATSAPP}?text=Hi, I paid ₹${SUB_PLAN_AMOUNT} for Finora Paints. Please activate." target="_blank" class="btn" style="background:#25D366;color:#fff;width:100%;margin-top:16px;">💬 WhatsApp Screenshot</a>
    </div>
  `);
};

window.openSubscriptionExpiredModal = function() {
  openModal(`
    <div class="modal-header" style="background:var(--danger-bg);border-bottom-color:var(--danger);">
      <div class="modal-title" style="color:var(--danger);">⚠ Subscription Expired</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" style="text-align:center;padding:32px 24px;">
      <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
      <h3 style="font-size:20px;margin-bottom:8px;">Renew to continue</h3>
      <p class="text-sm text-muted" style="margin-bottom:24px;">Your data is safe, but new entries are paused until you renew.</p>
      <button class="btn btn-primary" onclick="closeModal();openSubscriptionModal()" style="width:100%;height:44px;">Renew Now ₹${SUB_PLAN_AMOUNT}</button>
    </div>
  `);
};

// Guard the write functions
function wrapGuard(fn) {
  return function() {
    if(!isSubActive()) {
      openSubscriptionExpiredModal();
      return;
    }
    return fn.apply(this, arguments);
  };
}

const GUARDED_FUNCTIONS = [
  'openProductForm', 'openBatchForm', 'openCustomerForm', 
  'openPurchaseForm', 'renderNewInvoice'
];

GUARDED_FUNCTIONS.forEach(function(name) {
  const orig = window[name];
  if(typeof orig === 'function') {
    window[name] = wrapGuard(orig);
  }
});

// Intercept delete buttons globally
document.addEventListener('click', function(e) {
  if(isSubActive()) return;
  const t = e.target.closest('[data-del], [data-del-batch], #inv-save-btn');
  if(t) {
    e.preventDefault();
    e.stopPropagation();
    openSubscriptionExpiredModal();
  }
}, true);

console.log('[Finora] All blocks loaded · APP READY');
