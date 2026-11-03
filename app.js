/* ══════════════════════════════════════════════════════════════════
   FINORA PAINT SHOP — PART 1 (CORE, LOGIN, DASHBOARD)
   ══════════════════════════════════════════════════════════════════ */

/* ─── 1. SAFE SUPABASE INIT ─────────────────────────────────────── */
let sb = null;
try {
  const cfg = window.APP_CONFIG || {};
  if(!cfg.SUPABASE_URL || cfg.SUPABASE_URL === 'YOUR_SUPABASE_URL_HERE') {
    throw new Error("Please put your real Supabase URL and Key inside index.html");
  }
  sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
} catch (e) {
  document.body.innerHTML = `
    <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:#F4F7FE; font-family:sans-serif; padding:20px;">
      <div style="background:white; padding:40px; border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,0.1); text-align:center; max-width:500px;">
        <div style="font-size:40px; margin-bottom:16px;">⚠️</div>
        <h1 style="color:#EE5D50; font-size:20px; margin-bottom:8px;">Configuration Error</h1>
        <p style="color:#1B2559; font-size:14px;">${e.message}</p>
      </div>
    </div>`;
  throw e;
}

/* ─── 2. GLOBAL STATE ───────────────────────────────────────────── */
let SESSION = null;
let charts = [];
let DB = { products: [], product_batches: [], customers: [], suppliers: [], invoices: [], invoice_items: [], supplier_invoices: [], supplier_invoice_items: [], expenses: [] };
let SETTINGS = { shop_name: 'Finora Paints', owner_name: 'Owner', gst_rate: 18 };
window.SUB = { loaded: false, active: true, expires_at: null };

/* ─── 3. UTILITIES ──────────────────────────────────────────────── */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const rs = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toast(msg, type = 'info') {
  const root = $('#toast-root');
  if(!root) return;
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function openModal(html, onMount) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-overlay"><div class="modal">${html}<button class="modal-close" onclick="document.getElementById('modal-root').innerHTML=''">✕</button></div></div>`;
  if(onMount) onMount(root);
}
function closeModal() { $('#modal-root').innerHTML = ''; }

/* ─── 4. DATA SYNC & AUTH ───────────────────────────────────────── */
async function syncDB() {
  try {
    const tables = ['products', 'product_batches', 'customers', 'suppliers', 'invoices', 'invoice_items', 'supplier_invoices', 'supplier_invoice_items', 'expenses'];
    await Promise.all(tables.map(async (t) => {
      const { data } = await sb.from(t).select('*');
      if (data) DB[t] = data;
    }));
    const { data: sett } = await sb.from('settings').select('*').eq('id', 1).single();
    if (sett) SETTINGS = sett;
  } catch (e) {
    console.error('Sync error', e);
  }
}

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  SESSION = session;
}

/* ─── 5. BOOT & ROUTER ──────────────────────────────────────────── */
async function route() {
  if (!SESSION) {
    renderLogin();
    return;
  }
  
  renderLayout();
  const path = location.hash || '#/';
  const content = $('#content');
  
  if (path === '#/' || path === '') {
    renderDashboard(content);
  } else {
    content.innerHTML = `<div class="card"><h2>Page under construction</h2></div>`;
  }
}

// Start the app safely
(async function boot() {
  try {
    const app = $('#app');
    app.innerHTML = `<div style="height:100vh;display:flex;align-items:center;justify-content:center;color:var(--primary);font-weight:700;">Loading...</div>`;
    
    await initAuth();
    if (SESSION) {
      await syncDB();
    }
    
    // Force router to run
    window.addEventListener('hashchange', route);
    route();
    
  } catch (e) {
    console.error("Boot error:", e);
    document.body.innerHTML = `<div style="padding:40px;color:red;font-family:sans-serif;">Fatal Error: ${e.message}</div>`;
  }
})();

/* ─── 6. LOGIN SCREEN ───────────────────────────────────────────── */
function renderLogin() {
  $('#app').innerHTML = `
    <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--bg-main);">
      <div class="card" style="width:100%; max-width:400px; padding:40px;">
        <div style="text-align:center; margin-bottom:30px;">
          <div style="width:50px; height:50px; background:var(--primary); color:white; border-radius:12px; display:inline-flex; align-items:center; justify-content:center; font-size:24px; margin-bottom:16px;">🎨</div>
          <h2 style="font-size:24px; font-weight:700; color:var(--text-main);">Welcome Back</h2>
          <p style="font-size:14px; color:var(--text-muted);">Sign in to Finora Paint Shop</p>
        </div>
        
        <div id="login-err" style="display:none; background:var(--red-bg); color:var(--red); padding:12px; border-radius:8px; font-size:13px; margin-bottom:16px; text-align:center;"></div>

        <form id="login-form" style="display:flex; flex-direction:column; gap:20px;">
          <div>
            <label class="label">Email</label>
            <input class="input" type="email" id="email" required placeholder="admin@finora.com">
          </div>
          <div>
            <label class="label">Password</label>
            <input class="input" type="password" id="password" required placeholder="••••••••">
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%; height:48px;" id="login-btn">Sign In</button>
        </form>
      </div>
    </div>
  `;

  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#login-btn');
    const err = $('#login-err');
    btn.textContent = 'Signing in...';
    btn.disabled = true;
    err.style.display = 'none';

    const { error } = await sb.auth.signInWithPassword({
      email: $('#email').value,
      password: $('#password').value
    });

    if (error) {
      err.textContent = error.message;
      err.style.display = 'block';
      btn.textContent = 'Sign In';
      btn.disabled = false;
      return;
    }

    const { data: { session } } = await sb.auth.getSession();
    SESSION = session;
    await syncDB();
    route();
  };
}

/* ─── 7. FINORA LAYOUT (SIDEBAR & TOPBAR) ───────────────────────── */
function renderLayout() {
  const hash = location.hash || '#/';
  
  $('#app').innerHTML = `
    <div class="layout">
      <!-- SIDEBAR -->
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-logo">🎨</div>
          <div class="brand-text">Finora</div>
        </div>
        
        <div class="nav-group">
          <div class="nav-group-title">Main Menu</div>
          <a href="#/" class="nav-link ${hash === '#/' ? 'active' : ''}"><span class="icon">📊</span> Dashboard</a>
          <a href="#/analytics" class="nav-link ${hash === '#/analytics' ? 'active' : ''}"><span class="icon">📈</span> Analytics</a>
          <a href="#/invoices" class="nav-link ${hash === '#/invoices' ? 'active' : ''}"><span class="icon">📄</span> Invoices</a>
        </div>

        <div class="nav-group">
          <div class="nav-group-title">Features</div>
          <a href="#/products" class="nav-link ${hash === '#/products' ? 'active' : ''}"><span class="icon">🎨</span> Products</a>
          <a href="#/purchases" class="nav-link ${hash === '#/purchases' ? 'active' : ''}"><span class="icon">📥</span> Purchases</a>
          <a href="#/customers" class="nav-link ${hash === '#/customers' ? 'active' : ''}"><span class="icon">🧑</span> Customers</a>
        </div>

        <div class="nav-group" style="margin-top:auto;">
          <a href="#/settings" class="nav-link ${hash === '#/settings' ? 'active' : ''}"><span class="icon">⚙️</span> Settings</a>
          <a href="#" class="nav-link" onclick="sb.auth.signOut().then(()=>location.reload())"><span class="icon">🚪</span> Log out</a>
        </div>
      </aside>

      <!-- MAIN CONTENT -->
      <div class="main-wrap">
        <header class="topbar">
          <div class="topbar-title">
            <h1>Hi, ${esc(SETTINGS.owner_name)}! Welcome back.</h1>
            <p>Manage your cards and review recent transactions.</p>
          </div>
          <div class="topbar-actions">
            <div class="search-box">
              <span style="color:var(--text-muted);">🔍</span>
              <input type="text" placeholder="Search product">
              <span style="font-size:12px; color:var(--text-muted);">⌘ K</span>
            </div>
            <button style="font-size:20px; color:var(--text-muted);">🔔</button>
            <div class="avatar">${esc(SETTINGS.owner_name.substring(0,2).toUpperCase())}</div>
          </div>
        </header>

        <main id="content" style="flex:1;"></main>
      </div>
    </div>
  `;
}

/* ─── 8. DASHBOARD (EXACT FINORA MATCH) ─────────────────────────── */
function renderDashboard(content) {
  content.innerHTML = `
    <div class="grid-kpi">
      <!-- Card 1 -->
      <div class="card">
        <div class="kpi-head">
          <div class="kpi-icon" style="background:var(--blue-bg); color:var(--blue);">💳</div>
          <div class="kpi-label">Current Balance</div>
        </div>
        <div class="kpi-value">₹7,00,750</div>
        <div class="kpi-trend trend-up">↗ 47.89%</div>
        <div class="kpi-sub" style="margin-top:12px;">You earned an additional <span>₹3,345.00</span>!</div>
      </div>

      <!-- Card 2 -->
      <div class="card">
        <div class="kpi-head">
          <div class="kpi-icon" style="background:var(--orange-bg); color:var(--orange);">🛡️</div>
          <div class="kpi-label">Total Savings</div>
        </div>
        <div class="kpi-value">₹5,30,000</div>
        <div class="kpi-trend trend-up">↗ 42.33%</div>
        <div class="kpi-sub" style="margin-top:12px;">You saved an extra <span>₹1,456.00</span>!</div>
      </div>

      <!-- Card 3 -->
      <div class="card">
        <div class="kpi-head">
          <div class="kpi-icon" style="background:#FFF4E5; color:#F79009;">🪙</div>
          <div class="kpi-label">Total Income</div>
        </div>
        <div class="kpi-value">₹28,75,075</div>
        <div class="kpi-trend trend-up">↗ 50.76%</div>
        <div class="kpi-sub" style="margin-top:12px;">Your income increased by <span>₹3,345.00</span>!</div>
      </div>

      <!-- Card 4 (Quick Actions) -->
      <div class="card quick-actions">
        <div class="quick-title">Quick Actions</div>
        <div class="quick-sub">Create something new</div>
        <div class="quick-btns">
          <button class="quick-btn"><span class="icon">📄</span> Invoice</button>
          <button class="quick-btn"><span class="icon">📥</span> Purchase</button>
          <button class="quick-btn"><span class="icon">🎨</span> Product</button>
          <button class="quick-btn"><span class="icon">🧑</span> Customer</button>
        </div>
      </div>
    </div>

    <div class="charts-row">
      <!-- Bar Chart -->
      <div class="card">
        <div class="card-title">Spending Overview</div>
        <div class="chart-container">
          <canvas id="spendingChart"></canvas>
        </div>
      </div>

      <!-- Donut Chart -->
      <div class="card">
        <div class="card-title">Earning Overview</div>
        <div class="chart-container">
          <canvas id="earningChart"></canvas>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Recent Transactions</div>
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Transaction</th><th>Date</th><th>Amount</th><th>Account</th><th>Category</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-weight:600;">Dribbble Pro Business Plan</td>
              <td class="text-muted">Wed 10:39 AM</td>
              <td style="font-weight:600;">-₹50,000</td>
              <td class="text-muted">VISA 8374</td>
              <td class="text-muted">Subscription</td>
              <td><span class="chip chip-success">Success</span></td>
            </tr>
            <tr>
              <td style="font-weight:600;">Paint Inventory Restock</td>
              <td class="text-muted">Tue 02:15 PM</td>
              <td style="font-weight:600; color:var(--green);">+₹1,20,000</td>
              <td class="text-muted">Bank Transfer</td>
              <td class="text-muted">Purchase</td>
              <td><span class="chip chip-success">Success</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Render Charts
  if (charts.length) charts.forEach(c => c.destroy());
  
  const ctxSpend = document.getElementById('spendingChart').getContext('2d');
  charts.push(new Chart(ctxSpend, {
    type: 'bar',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      datasets: [
        { label: 'Transfer', data: [30, 40, 45, 50, 49, 60, 70, 91, 80, 60, 50, 40], backgroundColor: '#4318FF', borderRadius: 6, barThickness: 12 },
        { label: 'Withdrawals', data: [20, 30, 35, 40, 39, 50, 60, 81, 70, 50, 40, 30], backgroundColor: '#E9E3FF', borderRadius: 6, barThickness: 12 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } } },
      scales: {
        y: { display: false, beginAtZero: true },
        x: { grid: { display: false }, border: { display: false } }
      }
    }
  }));

  const ctxEarn = document.getElementById('earningChart').getContext('2d');
  charts.push(new Chart(ctxEarn, {
    type: 'doughnut',
    data: {
      labels: ['Salary', 'Template Sell', 'Payment', 'Others'],
      datasets: [{
        data: [45, 25, 20, 10],
        backgroundColor: ['#4318FF', '#05CD99', '#FFB547', '#E0E5F2'],
        borderWidth: 0, cutout: '75%'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 20 } } }
    }
  }));
}
/* ══════════════════════════════════════════════════════════════════
   FINORA PAINT SHOP — PART 2 (PRODUCTS & BATCHES)
   ══════════════════════════════════════════════════════════════════ */

/* ─── 9. STOCK UTILITIES ────────────────────────────────────────── */
function getProductStock(p) {
  if (!p) return 0;
  // If non-batch, return standard stock
  if (p.batch_managed === false) return Number(p.stock) || 0;
  // If batch-managed, sum up the quantities from all batches
  return DB.product_batches.filter(b => b.product_id === p.id).reduce((sum, b) => sum + (Number(b.qty) || 0), 0);
}

function getStockStatus(p) {
  const stock = getProductStock(p);
  if (stock <= 0) return '<span class="chip chip-danger">Out of Stock</span>';
  if (stock <= (Number(p.low_stock_alert) || 5)) return '<span class="chip chip-warning">Low Stock</span>';
  return '<span class="chip chip-success">In Stock</span>';
}

/* ─── 10. PRODUCTS PAGE RENDERER ────────────────────────────────── */
function renderProducts(content) {
  // Update the router to allow #/products
  window.activeRenderProducts = true; 

  content.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <div>
        <h2 style="font-size:20px; font-weight:700; color:var(--text-main);">Products & Inventory</h2>
        <p style="font-size:13px; color:var(--text-muted); margin-top:4px;">Manage paints, tools, and stock batches.</p>
      </div>
      <button class="btn btn-primary" onclick="openProductForm()">+ Add Product</button>
    </div>

    <div class="card" style="padding:0; overflow:hidden;">
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Category</th>
              <th>Tracking</th>
              <th style="text-align:right;">Stock</th>
              <th>Status</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${DB.products.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted);">No products added yet.</td></tr>' : 
              DB.products.map(p => {
                const isBatch = p.batch_managed !== false;
                const stock = getProductStock(p);
                return `
                <tr>
                  <td>
                    <div style="font-weight:600; color:var(--text-main);">${esc(p.name)}</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">${esc(p.brand || '')} ${p.color ? '· ' + esc(p.color) : ''}</div>
                  </td>
                  <td><span class="chip" style="background:var(--bg-main); color:var(--text-main);">${esc(p.category || 'Uncategorized')}</span></td>
                  <td>
                    ${isBatch 
                      ? '<span class="chip chip-primary" style="background:var(--primary-light); color:var(--primary);">Batch Tracked</span>' 
                      : '<span class="chip" style="background:#E0E5F2; color:#1B2559;">Standard</span>'}
                  </td>
                  <td style="text-align:right; font-weight:700; font-size:15px;">${stock} <span style="font-size:12px; color:var(--text-muted); font-weight:500;">${esc(p.unit)}</span></td>
                  <td>${getStockStatus(p)}</td>
                  <td style="text-align:right;">
                    ${isBatch 
                      ? `<button class="btn btn-ghost btn-sm" onclick="openBatchForm('${p.id}')" style="color:var(--primary); font-weight:600;">+ Add Batch</button>`
                      : `<button class="btn btn-ghost btn-sm" onclick="openRestockForm('${p.id}')" style="color:var(--primary); font-weight:600;">+ Restock</button>`
                    }
                    <button class="btn btn-ghost btn-sm" onclick="openProductForm('${p.id}')">Edit</button>
                    <button class="btn btn-ghost btn-sm" onclick="deleteProduct('${p.id}')" style="color:var(--red);">Del</button>
                  </td>
                </tr>
                `;
              }).join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* ─── 11. PRODUCT FORM (ADD / EDIT) ─────────────────────────────── */
function openProductForm(id = null) {
  const existing = id ? DB.products.find(p => p.id === id) : null;
  const isEdit = !!existing;
  
  const p = existing || {
    name: '', brand: '', color: '', base_type: '', category: 'Emulsion',
    unit: 'Litre', batch_managed: true, low_stock_alert: 5, cost: 0, selling_price: 0, stock: 0
  };

  const showToggle = SETTINGS.enable_non_batch !== false;
  const isBatch = p.batch_managed !== false;

  openModal(`
    <h3 style="font-size:18px; font-weight:700; margin-bottom:20px;">${isEdit ? 'Edit Product' : 'Add New Product'}</h3>
    
    <form id="product-form" style="display:flex; flex-direction:column; gap:16px;">
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div>
          <label class="label">Product Name *</label>
          <input class="input" name="name" required value="${esc(p.name)}" placeholder="e.g. Apex Ultima">
        </div>
        <div>
          <label class="label">Brand</label>
          <input class="input" name="brand" value="${esc(p.brand)}" placeholder="e.g. Asian Paints">
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div>
          <label class="label">Color / Shade</label>
          <input class="input" name="color" value="${esc(p.color)}" placeholder="e.g. Royal Navy">
        </div>
        <div>
          <label class="label">Base Type</label>
          <select class="input" name="base_type">
            <option value="">Select Base</option>
            <option value="Water-Based" ${p.base_type === 'Water-Based' ? 'selected' : ''}>Water-Based</option>
            <option value="Oil-Based" ${p.base_type === 'Oil-Based' ? 'selected' : ''}>Oil-Based</option>
            <option value="Enamel" ${p.base_type === 'Enamel' ? 'selected' : ''}>Enamel</option>
            <option value="Other" ${p.base_type === 'Other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div>
          <label class="label">Category</label>
          <select class="input" name="category">
            ${['Emulsion', 'Enamel', 'Primer', 'Distemper', 'Wood Finish', 'Waterproofing', 'Brushes & Tools', 'Other'].map(c => 
              `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>`
            ).join('')}
          </select>
        </div>
        <div>
          <label class="label">Unit</label>
          <select class="input" name="unit">
            ${['Litre', 'ml', 'kg', 'gram', 'piece', 'box', 'bucket'].map(u => 
              `<option value="${u}" ${p.unit === u ? 'selected' : ''}>${u}</option>`
            ).join('')}
          </select>
        </div>
      </div>

      ${showToggle ? `
        <div style="background:var(--bg-main); padding:16px; border-radius:12px;">
          <label class="label" style="margin-bottom:8px;">Batch Tracking</label>
          <select class="input" name="batch_managed" id="batch-managed-select" ${isEdit ? 'disabled' : ''}>
            <option value="true" ${isBatch ? 'selected' : ''}>Yes (Paints - Requires Batch No & Expiry)</option>
            <option value="false" ${!isBatch ? 'selected' : ''}>No (Tools - Standard Stock)</option>
          </select>
          ${isEdit ? '<div style="font-size:11px; color:var(--text-muted); margin-top:6px;">Batch tracking cannot be changed after creation.</div>' : ''}
        </div>
      ` : `<input type="hidden" name="batch_managed" value="true">`}

      <!-- Non-Batch Fields -->
      <div id="non-batch-fields" style="display:${(!showToggle || isBatch) ? 'none' : 'grid'}; grid-template-columns:1fr 1fr; gap:16px; padding:16px; background:var(--primary-light); border-radius:12px; border:1px solid #d5c9ff;">
        <div>
          <label class="label">Cost Price (₹)</label>
          <input class="input" type="number" name="cost" value="${p.cost}">
        </div>
        <div>
          <label class="label">Selling Price (₹)</label>
          <input class="input" type="number" name="selling_price" value="${p.selling_price}">
        </div>
        <div style="grid-column: span 2;">
          <label class="label">Opening Stock (${p.unit})</label>
          <input class="input" type="number" name="stock" value="${p.stock}">
        </div>
      </div>

      <div>
        <label class="label">Low Stock Alert (Qty)</label>
        <input class="input" type="number" name="low_stock_alert" value="${p.low_stock_alert}">
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Save'} Product</button>
      </div>
    </form>
  `, (root) => {
    const toggle = root.querySelector('#batch-managed-select');
    const nbFields = root.querySelector('#non-batch-fields');
    
    if (toggle) {
      toggle.onchange = (e) => {
        nbFields.style.display = e.target.value === 'false' ? 'grid' : 'none';
      };
    }

    root.querySelector('#product-form').onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;
      const fd = new FormData(form);
      
      const isManaged = fd.get('batch_managed') === 'true';
      
      const data = {
        name: fd.get('name').trim(),
        brand: fd.get('brand').trim(),
        color: fd.get('color').trim(),
        base_type: fd.get('base_type'),
        category: fd.get('category'),
        unit: fd.get('unit'),
        batch_managed: isManaged,
        low_stock_alert: Number(fd.get('low_stock_alert')) || 5,
        cost: isManaged ? 0 : Number(fd.get('cost')),
        selling_price: isManaged ? 0 : Number(fd.get('selling_price')),
        stock: isManaged ? 0 : Number(fd.get('stock'))
      };

      const btn = form.querySelector('button[type="submit"]');
      btn.textContent = 'Saving...'; btn.disabled = true;

      if (isEdit) {
        await sb.from('products').update(data).eq('id', id);
      } else {
        await sb.from('products').insert(data);
      }

      await syncDB();
      toast('Product saved', 'success');
      closeModal();
      route(); // Refresh
    };
  });
}

/* ─── 12. BATCH FORM (FOR PAINTS) ───────────────────────────────── */
function openBatchForm(productId, batchId = null) {
  const p = DB.products.find(x => x.id === productId);
  if (!p) return;

  const existing = batchId ? DB.product_batches.find(b => b.id === batchId) : null;
  const isEdit = !!existing;
  
  const b = existing || {
    batch_no: '', expiry_date: '', qty: 0, cost: 0, selling_price: 0
  };

  openModal(`
    <h3 style="font-size:18px; font-weight:700; margin-bottom:20px;">${isEdit ? 'Edit Batch' : 'Add New Batch'}</h3>
    <p style="font-size:13px; color:var(--text-muted); margin-bottom:20px;">Product: <b>${esc(p.name)}</b> (${esc(p.color)})</p>
    
    <form id="batch-form" style="display:flex; flex-direction:column; gap:16px;">
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div>
          <label class="label">Batch No *</label>
          <input class="input" name="batch_no" required value="${esc(b.batch_no)}" placeholder="e.g. BT-001">
        </div>
        <div>
          <label class="label">Expiry Date</label>
          <input class="input" type="date" name="expiry_date" value="${esc(b.expiry_date)}">
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div>
          <label class="label">Quantity (${esc(p.unit)}) *</label>
          <input class="input" type="number" name="qty" required value="${b.qty}" placeholder="0">
        </div>
        <div>
          <label class="label">Cost Price (₹) *</label>
          <input class="input" type="number" name="cost" required value="${b.cost}" placeholder="0">
        </div>
      </div>

      <div>
        <label class="label">Selling Price (₹) *</label>
        <input class="input" type="number" name="selling_price" required value="${b.selling_price}" placeholder="0">
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Save'} Batch</button>
      </div>
    </form>
  `, (root) => {
    root.querySelector('#batch-form').onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;
      const fd = new FormData(form);
      
      const data = {
        product_id: productId,
        batch_no: fd.get('batch_no').trim(),
        expiry_date: fd.get('expiry_date') || null,
        qty: Number(fd.get('qty')) || 0,
        cost: Number(fd.get('cost')) || 0,
        selling_price: Number(fd.get('selling_price')) || 0
      };

      const btn = form.querySelector('button[type="submit"]');
      btn.textContent = 'Saving...'; btn.disabled = true;

      if (isEdit) {
        await sb.from('product_batches').update(data).eq('id', batchId);
      } else {
        await sb.from('product_batches').insert(data);
      }

      await syncDB();
      toast('Batch saved', 'success');
      closeModal();
      route(); // Refresh
    };
  });
}

/* ─── 13. RESTOCK FORM (FOR NON-BATCH) ──────────────────────────── */
function openRestockForm(productId) {
  const p = DB.products.find(x => x.id === productId);
  if (!p) return;

  openModal(`
    <h3 style="font-size:18px; font-weight:700; margin-bottom:20px;">Restock Product</h3>
    <p style="font-size:13px; color:var(--text-muted); margin-bottom:20px;">Product: <b>${esc(p.name)}</b></p>
    
    <form id="restock-form" style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <label class="label">Quantity to Add (${esc(p.unit)}) *</label>
        <input class="input" type="number" name="qty" required placeholder="e.g. 50" autofocus>
      </div>
      <div>
        <label class="label">Update Cost Price? (Optional)</label>
        <input class="input" type="number" name="cost" value="${p.cost}" placeholder="₹">
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Add Stock</button>
      </div>
    </form>
  `, (root) => {
    root.querySelector('#restock-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const qty = Number(fd.get('qty'));
      const cost = Number(fd.get('cost'));

      if (qty <= 0) return toast('Quantity must be greater than 0', 'error');

      const btn = e.target.querySelector('button[type="submit"]');
      btn.textContent = 'Saving...'; btn.disabled = true;

      await sb.from('products').update({ 
        stock: (Number(p.stock) || 0) + qty,
        cost: cost
      }).eq('id', productId);

      await syncDB();
      toast('Stock updated', 'success');
      closeModal();
      route(); 
    };
  });
}

/* ─── 14. DELETE PRODUCT ────────────────────────────────────────── */
async function deleteProduct(id) {
  if(!confirm('Are you sure you want to delete this product? All its batches will be deleted too.')) return;
  
  const { error } = await sb.from('products').delete().eq('id', id);
  if(error) return toast(error.message, 'error');
  
  await syncDB();
  toast('Product deleted', 'success');
  route();
}

/* ─── 15. ROUTER UPDATE ─────────────────────────────────────────── */
// We override the router from Part 1 to include the new products route.
const previousRoute = route;
route = async function() {
  if (!SESSION) {
    renderLogin();
    return;
  }
  
  renderLayout();
  const path = location.hash || '#/';
  const content = $('#content');
  
  if (path === '#/' || path === '') {
    renderDashboard(content);
  } else if (path === '#/products') {
    renderProducts(content);
  } else {
    content.innerHTML = `<div class="card" style="text-align:center; padding:60px;"><h2>Page under construction</h2><p style="color:var(--text-muted); margin-top:8px;">Next module coming soon.</p></div>`;
  }
};

// Re-run the route to apply changes
route();
/* ══════════════════════════════════════════════════════════════════
   FINORA PAINT SHOP — PART 3 (CUSTOMERS, SUPPLIERS, PURCHASES, INVOICES)
   ══════════════════════════════════════════════════════════════════ */

/* ─── 16. CUSTOMERS ─────────────────────────────────────────────── */
function renderCustomers(content) {
  content.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <div>
        <h2 style="font-size:20px; font-weight:700; color:var(--text-main);">Customers</h2>
        <p style="font-size:13px; color:var(--text-muted); margin-top:4px;">Manage your buyers and contractors.</p>
      </div>
      <button class="btn btn-primary" onclick="openCustomerForm()">+ Add Customer</button>
    </div>

    <div class="card" style="padding:0; overflow:hidden;">
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Phone</th><th>Address</th><th>Added On</th><th style="text-align:right;">Actions</th></tr>
          </thead>
          <tbody>
            ${DB.customers.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-muted);">No customers added yet.</td></tr>' : 
              DB.customers.map(c => `
              <tr>
                <td style="font-weight:600;">${esc(c.name)}</td>
                <td class="text-muted">${esc(c.phone || '—')}</td>
                <td class="text-muted">${esc(c.address || '—')}</td>
                <td class="text-muted">${fmtDate(c.created_at)}</td>
                <td style="text-align:right;">
                  <button class="btn btn-ghost btn-sm" onclick="openCustomerForm('${c.id}')">Edit</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openCustomerForm(id = null) {
  const existing = id ? DB.customers.find(c => c.id === id) : null;
  const isEdit = !!existing;
  const c = existing || { name: '', phone: '', address: '' };

  openModal(`
    <h3 style="font-size:18px; font-weight:700; margin-bottom:20px;">${isEdit ? 'Edit' : 'New'} Customer</h3>
    <form id="cust-form" style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <label class="label">Full Name *</label>
        <input class="input" name="name" required value="${esc(c.name)}" placeholder="e.g. Ramesh Kumar">
      </div>
      <div>
        <label class="label">Phone Number</label>
        <input class="input" name="phone" value="${esc(c.phone)}" placeholder="10-digit mobile">
      </div>
      <div>
        <label class="label">Address</label>
        <input class="input" name="address" value="${esc(c.address)}" placeholder="Area, City">
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Customer</button>
      </div>
    </form>
  `, (root) => {
    root.querySelector('#cust-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = { name: fd.get('name').trim(), phone: fd.get('phone').trim(), address: fd.get('address').trim() };
      
      if (isEdit) await sb.from('customers').update(data).eq('id', id);
      else await sb.from('customers').insert(data);
      
      await syncDB(); toast('Customer saved', 'success'); closeModal(); route();
    };
  });
}

/* ─── 17. SUPPLIERS ─────────────────────────────────────────────── */
function renderSuppliers(content) {
  content.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <div>
        <h2 style="font-size:20px; font-weight:700; color:var(--text-main);">Suppliers & Companies</h2>
        <p style="font-size:13px; color:var(--text-muted); margin-top:4px;">Manage your paint distributors.</p>
      </div>
      <button class="btn btn-primary" onclick="openSupplierForm()">+ Add Supplier</button>
    </div>

    <div class="card" style="padding:0; overflow:hidden;">
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr><th>Company Name</th><th>Phone</th><th>Address</th><th>Added On</th><th style="text-align:right;">Actions</th></tr>
          </thead>
          <tbody>
            ${DB.suppliers.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-muted);">No suppliers added yet.</td></tr>' : 
              DB.suppliers.map(s => `
              <tr>
                <td style="font-weight:600;">${esc(s.name)}</td>
                <td class="text-muted">${esc(s.phone || '—')}</td>
                <td class="text-muted">${esc(s.address || '—')}</td>
                <td class="text-muted">${fmtDate(s.created_at)}</td>
                <td style="text-align:right;">
                  <button class="btn btn-ghost btn-sm" onclick="openSupplierForm('${s.id}')">Edit</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openSupplierForm(id = null) {
  const existing = id ? DB.suppliers.find(s => s.id === id) : null;
  const isEdit = !!existing;
  const s = existing || { name: '', phone: '', address: '' };

  openModal(`
    <h3 style="font-size:18px; font-weight:700; margin-bottom:20px;">${isEdit ? 'Edit' : 'New'} Supplier</h3>
    <form id="sup-form" style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <label class="label">Company Name *</label>
        <input class="input" name="name" required value="${esc(s.name)}" placeholder="e.g. Asian Paints Ltd.">
      </div>
      <div>
        <label class="label">Phone Number</label>
        <input class="input" name="phone" value="${esc(s.phone)}">
      </div>
      <div>
        <label class="label">Address</label>
        <input class="input" name="address" value="${esc(s.address)}">
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Supplier</button>
      </div>
    </form>
  `, (root) => {
    root.querySelector('#sup-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = { name: fd.get('name').trim(), phone: fd.get('phone').trim(), address: fd.get('address').trim() };
      
      if (isEdit) await sb.from('suppliers').update(data).eq('id', id);
      else await sb.from('suppliers').insert(data);
      
      await syncDB(); toast('Supplier saved', 'success'); closeModal(); route();
    };
  });
}

/* ─── 18. PURCHASES (CREATE BATCHES) ────────────────────────────── */
function renderPurchases(content) {
  content.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <div>
        <h2 style="font-size:20px; font-weight:700; color:var(--text-main);">Purchases</h2>
        <p style="font-size:13px; color:var(--text-muted); margin-top:4px;">Record incoming stock and create batches.</p>
      </div>
      <button class="btn btn-primary" onclick="openPurchaseForm()">+ New Purchase</button>
    </div>

    <div class="card" style="padding:0; overflow:hidden;">
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr><th>Bill No</th><th>Supplier</th><th>Date</th><th>Total Amount</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${DB.supplier_invoices.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-muted);">No purchase bills yet.</td></tr>' : 
              DB.supplier_invoices.map(b => {
                const sup = DB.suppliers.find(s => s.id === b.supplier_id);
                return `
                <tr>
                  <td style="font-weight:600;">${esc(b.bill_no || '—')}</td>
                  <td class="text-muted">${esc(sup ? sup.name : 'Unknown')}</td>
                  <td class="text-muted">${fmtDate(b.bill_date)}</td>
                  <td style="font-weight:600;">${rs(b.total)}</td>
                  <td><span class="chip ${b.paid >= b.total ? 'chip-success' : 'chip-warning'}">${b.paid >= b.total ? 'Paid' : 'Unpaid'}</span></td>
                </tr>
              `}).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openPurchaseForm() {
  if (DB.suppliers.length === 0) return toast('Please add a Supplier first', 'error');
  
  let cart = [];

  openModal(`
    <h3 style="font-size:18px; font-weight:700; margin-bottom:20px;">New Purchase Bill</h3>
    <form id="pur-form" style="display:flex; flex-direction:column; gap:16px;">
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div>
          <label class="label">Supplier *</label>
          <select class="input" name="supplier_id" required>
            <option value="">Select Supplier</option>
            ${DB.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="label">Bill No</label>
          <input class="input" name="bill_no" required placeholder="Invoice No">
        </div>
      </div>

      <div style="background:var(--bg-main); padding:16px; border-radius:12px;">
        <label class="label" style="margin-bottom:12px; color:var(--primary);">Add Items</label>
        <div style="display:grid; grid-template-columns:2fr 1fr; gap:12px; margin-bottom:12px;">
          <select class="input" id="pur-prod">
            <option value="">Select Product...</option>
            ${DB.products.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.brand || '')})</option>`).join('')}
          </select>
          <input class="input" type="number" id="pur-qty" value="1" placeholder="Qty">
        </div>

        <div id="pur-batch-fields" style="display:none; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
          <input class="input" id="pur-batch" placeholder="Batch No">
          <input class="input" type="date" id="pur-expiry" placeholder="Expiry">
          <input class="input" type="number" id="pur-cost" placeholder="Cost ₹">
          <input class="input" type="number" id="pur-sell" placeholder="Sell ₹">
        </div>

        <button type="button" class="btn btn-ghost" style="width:100%; border:1px dashed var(--primary);" onclick="addPurItem()">+ Add Item to Bill</button>
        
        <div id="pur-cart" style="margin-top:16px; display:flex; flex-direction:column; gap:8px;"></div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; padding-top:16px; border-top:1px solid var(--border);">
        <div style="font-size:16px; font-weight:700;">Total: <span id="pur-total" style="color:var(--primary);">₹0.00</span></div>
        <div style="display:flex; gap:10px;">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Bill</button>
        </div>
      </div>
    </form>
  `, (root) => {
    root.querySelector('#pur-prod').onchange = (e) => {
      const p = DB.products.find(x => x.id === e.target.value);
      root.querySelector('#pur-batch-fields').style.display = (p && p.batch_managed) ? 'grid' : 'none';
    };

    window.addPurItem = () => {
      const pid = root.querySelector('#pur-prod').value;
      const qty = Number(root.querySelector('#pur-qty').value);
      if (!pid || qty <= 0) return toast('Select product and valid qty', 'error');
      
      const p = DB.products.find(x => x.id === pid);
      const isBatch = p.batch_managed;
      
      const batchNo = root.querySelector('#pur-batch').value;
      const expiry = root.querySelector('#pur-expiry').value;
      const cost = Number(root.querySelector('#pur-cost').value) || 0;
      const sell = Number(root.querySelector('#pur-sell').value) || 0;

      if (isBatch && (!batchNo || cost <= 0 || sell <= 0)) return toast('Fill all batch details', 'error');

      cart.push({ product_id: pid, name: p.name, qty, isBatch, batch_no: batchNo, expiry, cost, sell, total: qty * cost });
      
      root.querySelector('#pur-cart').innerHTML = cart.map((c, i) => `
        <div style="display:flex; justify-content:space-between; font-size:13px; padding:8px; background:#fff; border-radius:8px; border:1px solid var(--border);">
          <div><b>${esc(c.name)}</b> ${c.batch_no ? `(B: ${c.batch_no})` : ''} <br><span style="color:var(--text-muted);">${c.qty} x ₹${c.cost}</span></div>
          <div style="font-weight:700;">₹${c.total}</div>
        </div>
      `).join('');
      
      root.querySelector('#pur-total').textContent = rs(cart.reduce((s, c) => s + c.total, 0));
    };

    root.querySelector('#pur-form').onsubmit = async (e) => {
      e.preventDefault();
      if (cart.length === 0) return toast('Add items to the bill first', 'error');
      
      const btn = e.target.querySelector('button[type="submit"]');
      btn.textContent = 'Saving...'; btn.disabled = true;

      const fd = new FormData(e.target);
      const total = cart.reduce((s, c) => s + c.total, 0);

      // 1. Create Bill
      const { data: bill, error: bErr } = await sb.from('supplier_invoices').insert({
        supplier_id: fd.get('supplier_id'), bill_no: fd.get('bill_no'), bill_date: todayStr(), total: total, paid: total
      }).select().single();

      if (bErr) { toast(bErr.message, 'error'); btn.textContent = 'Save Bill'; btn.disabled = false; return; }

      // 2. Insert Items and Batches
      for (const item of cart) {
        await sb.from('supplier_invoice_items').insert({
          supplier_invoice_id: bill.id, product_id: item.product_id, batch_no: item.batch_no, expiry_date: item.expiry, qty: item.qty, cost: item.cost, total: item.total
        });

        if (item.isBatch) {
          await sb.from('product_batches').insert({
            product_id: item.product_id, batch_no: item.batch_no, expiry_date: item.expiry, qty: item.qty, cost: item.cost, selling_price: item.sell
          });
        } else {
          // Non-batch stock update
          const { data: p } = await sb.from('products').select('stock').eq('id', item.product_id).single();
          await sb.from('products').update({ stock: (p.stock || 0) + item.qty, cost: item.cost, selling_price: item.sell }).eq('id', item.product_id);
        }
      }

      await syncDB(); toast('Purchase saved', 'success'); closeModal(); route();
    };
  });
}

/* ─── 19. INVOICES (LIST & POS) ─────────────────────────────────── */
function renderInvoices(content) {
  content.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <div>
        <h2 style="font-size:20px; font-weight:700; color:var(--text-main);">Invoices</h2>
        <p style="font-size:13px; color:var(--text-muted); margin-top:4px;">Sell paints and manage sales.</p>
      </div>
      <button class="btn btn-primary" onclick="location.hash='#/new-invoice'">+ New Invoice</button>
    </div>

    <div class="card" style="padding:0; overflow:hidden;">
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr><th>Invoice No</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th><th style="text-align:right;">Action</th></tr>
          </thead>
          <tbody>
            ${DB.invoices.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted);">No invoices yet.</td></tr>' : 
              DB.invoices.map(i => `
              <tr>
                <td style="font-weight:600;">${esc(i.invoice_no)}</td>
                <td class="text-muted">${esc(i.customer_name || 'Walk-in')}</td>
                <td class="text-muted">${fmtDate(i.invoice_date)}</td>
                <td style="font-weight:600;">${rs(i.total)}</td>
                <td><span class="chip ${i.due > 0 ? 'chip-warning' : 'chip-success'}">${i.due > 0 ? 'Unpaid' : 'Paid'}</span></td>
                <td style="text-align:right;">
                  <button class="btn btn-ghost btn-sm" onclick="location.hash='#/invoice/${i.id}'">View</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderNewInvoice(content) {
  let cart = [];

  content.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <div>
        <h2 style="font-size:20px; font-weight:700; color:var(--text-main);">New Invoice (POS)</h2>
        <p style="font-size:13px; color:var(--text-muted); margin-top:4px;">Select products and batches to sell.</p>
      </div>
      <button class="btn btn-ghost" onclick="location.hash='#/invoices'">Cancel</button>
    </div>

    <div style="display:grid; grid-template-columns:2fr 1.2fr; gap:24px; align-items:start;">
      
      <!-- LEFT: CART -->
      <div class="card">
        <div style="display:flex; gap:12px; margin-bottom:20px; background:var(--bg-main); padding:16px; border-radius:12px;">
          <div style="flex:1;">
            <label class="label">Select Product</label>
            <select class="input" id="pos-prod">
              <option value="">Choose product...</option>
              ${DB.products.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.color || '')})</option>`).join('')}
            </select>
          </div>
          <div style="flex:1; display:none;" id="pos-batch-wrap">
            <label class="label">Select Batch</label>
            <select class="input" id="pos-batch"></select>
          </div>
        </div>

        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th><th></th></tr></thead>
            <tbody id="pos-cart-body"></tbody>
          </table>
        </div>
      </div>

      <!-- RIGHT: SUMMARY -->
      <div class="card" style="position:sticky; top:30px;">
        <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">Summary</h3>
        
        <div style="margin-bottom:16px;">
          <label class="label">Customer</label>
          <select class="input" id="pos-cust">
            <option value="">Walk-in Customer</option>
            ${DB.customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
          </select>
        </div>

        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span class="text-muted">Subtotal</span><b id="pos-subtotal">₹0.00</b>
        </div>
        <div style="display:flex; justify-content:space-between; padding-top:16px; border-top:1px solid var(--border); margin-bottom:24px;">
          <b style="font-size:16px;">Total</b><b id="pos-total" style="color:var(--primary); font-size:20px;">₹0.00</b>
        </div>
        
        <button class="btn btn-primary" style="width:100%; height:48px;" id="pos-save">Save Invoice</button>
      </div>
    </div>
  `;

  // Product Selection Logic
  $('#pos-prod').onchange = (e) => {
    const pid = e.target.value;
    if(!pid) { $('#pos-batch-wrap').style.display = 'none'; return; }
    
    const p = DB.products.find(x => x.id === pid);
    if (p.batch_managed) {
      const batches = DB.product_batches.filter(b => b.product_id === pid && b.qty > 0);
      if (batches.length === 0) {
        toast('No stock available for this paint', 'error');
        e.target.value = '';
        $('#pos-batch-wrap').style.display = 'none';
        return;
      }
      $('#pos-batch-wrap').style.display = 'block';
      $('#pos-batch').innerHTML = batches.map(b => `<option value="${b.id}">${esc(b.batch_no)} (Qty: ${b.qty})</option>`).join('');
    } else {
      $('#pos-batch-wrap').style.display = 'none';
      addToCart(p, null);
      e.target.value = '';
    }
  };

  $('#pos-batch').onchange = (e) => {
    const bid = e.target.value;
    const pid = $('#pos-prod').value;
    if (!bid || !pid) return;
    addToCart(DB.products.find(x => x.id === pid), DB.product_batches.find(x => x.id === bid));
    $('#pos-prod').value = ''; 
    $('#pos-batch-wrap').style.display = 'none';
  };

  function addToCart(product, batch) {
    const price = batch ? Number(batch.selling_price) : Number(product.selling_price);
    const existing = cart.find(c => c.product_id === product.id && c.batch_id === (batch ? batch.id : null));
    
    if (existing) {
      existing.qty++;
      existing.total = existing.qty * existing.price;
    } else {
      cart.push({
        product_id: product.id, batch_id: batch ? batch.id : null, name: product.name,
        batch_no: batch ? batch.batch_no : null, qty: 1, price: price, total: price, max_qty: batch ? batch.qty : product.stock
      });
    }
    renderCart();
  }

  function renderCart() {
    const tbody = $('#pos-cart-body');
    if (cart.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">Cart is empty</td></tr>';
      updateTotals(); return;
    }

    tbody.innerHTML = cart.map((c, i) => `
      <tr>
        <td>
          <div style="font-weight:600;">${esc(c.name)}</div>
          ${c.batch_no ? `<div style="font-size:11px; color:var(--text-muted);">Batch: ${esc(c.batch_no)}</div>` : ''}
        </td>
        <td>
          <input type="number" min="1" max="${c.max_qty}" value="${c.qty}" onchange="updateCartQty(${i}, this.value)" style="width:60px; padding:6px; border:1px solid var(--border); border-radius:6px;">
        </td>
        <td>${rs(c.price)}</td>
        <td style="font-weight:600;">${rs(c.total)}</td>
        <td style="text-align:right;"><button onclick="removeCartItem(${i})" style="color:var(--red); font-size:16px;">✕</button></td>
      </tr>
    `).join('');
    updateTotals();
  }

  window.updateCartQty = (i, val) => {
    const qty = parseInt(val);
    if (qty < 1) return;
    if (qty > cart[i].max_qty) { toast('Not enough stock', 'error'); return renderCart(); }
    cart[i].qty = qty;
    cart[i].total = qty * cart[i].price;
    renderCart();
  };

  window.removeCartItem = (i) => { cart.splice(i, 1); renderCart(); };

  function updateTotals() {
    const sub = cart.reduce((s, c) => s + c.total, 0);
    $('#pos-subtotal').textContent = rs(sub);
    $('#pos-total').textContent = rs(sub);
  }

  $('#pos-save').onclick = async () => {
    if (cart.length === 0) return toast('Cart is empty', 'error');
    const btn = $('#pos-save');
    btn.textContent = 'Saving...'; btn.disabled = true;

    const custId = $('#pos-cust').value;
    const custName = custId ? DB.customers.find(c => c.id === custId).name : 'Walk-in';
    const sub = cart.reduce((s, c) => s + c.total, 0);
    
    // Generate Invoice No
    let max = 0;
    DB.invoices.forEach(inv => { const m = String(inv.invoice_no).match(/(\d+)/); if(m && parseInt(m[1]) > max) max = parseInt(m[1]); });
    const invNo = 'INV-' + String(max + 1).padStart(4, '0');

    // 1. Create Invoice
    const { data: inv, error: invErr } = await sb.from('invoices').insert({
      invoice_no: invNo, customer_id: custId || null, customer_name: custName,
      subtotal: sub, total: sub, paid: sub, due: 0, invoice_date: todayStr()
    }).select().single();

    if (invErr) { toast(invErr.message, 'error'); btn.textContent = 'Save Invoice'; btn.disabled = false; return; }

    // 2. Create Items & Deduct Stock
    for (const item of cart) {
      await sb.from('invoice_items').insert({
        invoice_id: inv.id, product_id: item.product_id, batch_id: item.batch_id,
        product_name: item.name, batch_no: item.batch_no, qty: item.qty, price: item.price, total: item.total
      });

      if (item.batch_id) {
        const { data: b } = await sb.from('product_batches').select('qty').eq('id', item.batch_id).single();
        await sb.from('product_batches').update({ qty: b.qty - item.qty }).eq('id', item.batch_id);
      } else {
        const { data: p } = await sb.from('products').select('stock').eq('id', item.product_id).single();
        await sb.from('products').update({ stock: p.stock - item.qty }).eq('id', item.product_id);
      }
    }

    await syncDB(); toast('Invoice Saved!', 'success'); location.hash = '#/invoices';
  };

  renderCart();
}

/* ─── 20. ROUTER UPDATE ─────────────────────────────────────────── */
const prevRoute = route;
route = async function() {
  if (!SESSION) return renderLogin();
  
  renderLayout();
  const path = location.hash || '#/';
  const content = $('#content');
  
  if (path === '#/' || path === '') renderDashboard(content);
  else if (path === '#/products') renderProducts(content);
  else if (path === '#/customers') renderCustomers(content);
  else if (path === '#/suppliers') renderSuppliers(content);
  else if (path === '#/purchases') renderPurchases(content);
  else if (path === '#/invoices') renderInvoices(content);
  else if (path === '#/new-invoice') renderNewInvoice(content);
  else content.innerHTML = `<div class="card" style="text-align:center; padding:60px;"><h2>Page under construction</h2></div>`;
};

route();
/* ══════════════════════════════════════════════════════════════════
   FINORA PAINT SHOP — PART 4 (INVOICE VIEW, PRINTING, SHARING)
   ══════════════════════════════════════════════════════════════════ */

/* ─── 21. SUBSCRIPTION GUARD (MANDATORY) ────────────────────────── */
// A simple guard to check if the user is allowed to make changes.
window.checkSubscription = function() {
  // In a real scenario, this checks window.SUB.expires_at > Date.now()
  // For now, we will assume it is active unless manually set to false.
  if (window.SUB && window.SUB.active === false) {
    openModal(`
      <div style="text-align:center; padding:20px;">
        <div style="font-size:40px; margin-bottom:16px;">⚠️</div>
        <h3 style="font-size:20px; font-weight:700; color:var(--red); margin-bottom:8px;">Subscription Expired</h3>
        <p style="font-size:14px; color:var(--text-muted); margin-bottom:24px;">Please renew your plan to continue adding data.</p>
        <button class="btn btn-primary" onclick="closeModal()">Renew Now</button>
      </div>
    `);
    return false;
  }
  return true;
};

/* ─── 22. INVOICE VIEW ──────────────────────────────────────────── */
function renderInvoiceView(content, id) {
  const inv = DB.invoices.find(x => x.id === id);
  if (!inv) {
    content.innerHTML = `<div class="card" style="text-align:center; padding:60px;"><h2>Invoice not found</h2></div>`;
    return;
  }

  const items = DB.invoice_items.filter(x => x.invoice_id === inv.id);
  
  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/invoices" style="color:var(--text-muted); font-size:14px; font-weight:500; display:inline-flex; align-items:center; gap:6px;">
        ← Back to Invoices
      </a>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:24px;">
      <div>
        <h2 style="font-size:24px; font-weight:700; color:var(--text-main);">Invoice ${esc(inv.invoice_no)}</h2>
        <p style="font-size:14px; color:var(--text-muted); margin-top:4px;">${fmtDate(inv.invoice_date)} · ${esc(inv.customer_name)}</p>
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-ghost" onclick="printThermal('${inv.id}')">🖨 Thermal</button>
        <button class="btn btn-ghost" onclick="downloadPDF('${inv.id}')">📄 A4 PDF</button>
        <button class="btn" style="background:#25D366; color:#fff;" onclick="sendWhatsApp('${inv.id}')">💬 WhatsApp</button>
      </div>
    </div>

    <!-- The Paper Receipt -->
    <div class="card" style="max-width:800px; margin:0 auto; padding:40px; box-shadow:0 10px 40px rgba(0,0,0,0.08);">
      
      <!-- Header -->
      <div style="display:flex; justify-content:space-between; border-bottom:2px solid var(--bg-main); padding-bottom:24px; margin-bottom:24px;">
        <div>
          <div style="font-size:24px; font-weight:700; color:var(--primary); margin-bottom:4px;">${esc(SETTINGS.shop_name)}</div>
          <div style="font-size:13px; color:var(--text-muted);">${esc(SETTINGS.address || '')}</div>
          ${SETTINGS.phone ? `<div style="font-size:13px; color:var(--text-muted);">Ph: ${esc(SETTINGS.phone)}</div>` : ''}
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">Invoice Details</div>
          <div style="font-size:14px; font-weight:600; margin-top:4px;">${esc(inv.invoice_no)}</div>
          <div style="font-size:14px; color:var(--text-muted);">${fmtDate(inv.invoice_date)}</div>
        </div>
      </div>

      <!-- Billed To -->
      <div style="margin-bottom:32px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Billed To</div>
        <div style="font-size:16px; font-weight:600;">${esc(inv.customer_name)}</div>
      </div>

      <!-- Items -->
      <table style="width:100%; margin-bottom:32px;">
        <thead>
          <tr style="border-bottom:1px solid var(--border);">
            <th style="text-align:left; padding-bottom:12px; font-size:12px; color:var(--text-muted);">Item Description</th>
            <th style="text-align:center; padding-bottom:12px; font-size:12px; color:var(--text-muted);">Batch</th>
            <th style="text-align:center; padding-bottom:12px; font-size:12px; color:var(--text-muted);">Qty</th>
            <th style="text-align:right; padding-bottom:12px; font-size:12px; color:var(--text-muted);">Price</th>
            <th style="text-align:right; padding-bottom:12px; font-size:12px; color:var(--text-muted);">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(it => `
            <tr style="border-bottom:1px solid var(--bg-main);">
              <td style="padding:16px 0; font-weight:600; color:var(--text-main);">${esc(it.product_name)}</td>
              <td style="text-align:center; color:var(--text-muted); font-size:13px;">${esc(it.batch_no || '—')}</td>
              <td style="text-align:center; font-weight:600;">${it.qty}</td>
              <td style="text-align:right; color:var(--text-muted);">${rs(it.price)}</td>
              <td style="text-align:right; font-weight:700;">${rs(it.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- Totals -->
      <div style="display:flex; justify-content:flex-end;">
        <div style="width:250px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:12px; font-size:14px;">
            <span style="color:var(--text-muted);">Subtotal</span>
            <span style="font-weight:600;">${rs(inv.subtotal)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding-top:12px; border-top:1px solid var(--border); font-size:16px;">
            <span style="font-weight:700;">Total</span>
            <span style="font-weight:700; color:var(--primary);">${rs(inv.total)}</span>
          </div>
        </div>
      </div>

      <div style="margin-top:40px; text-align:center; font-size:12px; color:var(--text-muted);">
        Thank you for your business!
      </div>
    </div>
  `;
}

/* ─── 23. PRINTING & SHARING ────────────────────────────────────── */

// 1. WhatsApp
function sendWhatsApp(invId) {
  const inv = DB.invoices.find(x => x.id === invId);
  const items = DB.invoice_items.filter(x => x.invoice_id === invId);
  
  let msg = `*${SETTINGS.shop_name}*\n\n`;
  msg += `*Invoice:* ${inv.invoice_no}\n`;
  msg += `*Date:* ${fmtDate(inv.invoice_date)}\n`;
  msg += `*Customer:* ${inv.customer_name}\n\n`;
  msg += `*Items:*\n`;
  
  items.forEach(it => {
    msg += `- ${it.product_name} ${it.batch_no ? `(B: ${it.batch_no})` : ''}\n`;
    msg += `  ${it.qty} x ${rs(it.price)} = ${rs(it.total)}\n`;
  });

  msg += `\n*Total: ${rs(inv.total)}*\n\nThank you!`;

  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

// 2. A4 PDF (jsPDF)
function downloadPDF(invId) {
  const inv = DB.invoices.find(x => x.id === invId);
  const items = DB.invoice_items.filter(x => x.invoice_id === invId);
  
  if (!window.jspdf) return toast('PDF library loading...', 'info');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(67, 24, 255); // Finora Purple
  doc.text(SETTINGS.shop_name || 'Finora Paints', 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.setFont('helvetica', 'normal');
  doc.text(SETTINGS.address || '', 14, 28);
  doc.text(SETTINGS.phone ? 'Ph: ' + SETTINGS.phone : '', 14, 33);

  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', 14, 45);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Bill To: ' + inv.customer_name, 14, 52);
  doc.text('Date: ' + fmtDate(inv.invoice_date), 14, 57);
  doc.text('Invoice No: ' + inv.invoice_no, 14, 62);

  const tableBody = items.map(it => [
    it.product_name,
    it.batch_no || '-',
    it.qty.toString(),
    Number(it.price).toFixed(2),
    Number(it.total).toFixed(2)
  ]);

  doc.autoTable({
    startY: 70,
    head: [['Item', 'Batch', 'Qty', 'Rate', 'Total']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [67, 24, 255] }
  });

  let finalY = doc.lastAutoTable.finalY + 10;
  doc.setFont('helvetica', 'bold');
  doc.text('Total: Rs. ' + Number(inv.total).toFixed(2), 150, finalY);

  doc.save('Invoice-' + inv.invoice_no + '.pdf');
  toast('PDF Downloaded', 'success');
}

// 3. Thermal Print (WebUSB)
async function printThermal(invId) {
  const inv = DB.invoices.find(x => x.id === invId);
  const items = DB.invoice_items.filter(x => x.invoice_id === invId);
  
  if (typeof ReceiptPrinterEncoder === 'undefined') return toast('Printer library not loaded', 'error');
  if (!navigator.usb) return toast('WebUSB not supported. Use Chrome/Edge.', 'error');

  const W = 32; // 58mm standard
  const line = (l, r) => {
    l = String(l || ''); r = String(r || '');
    if(l.length + r.length >= W) l = l.slice(0, Math.max(0, W - r.length - 1));
    return l + ' '.repeat(Math.max(1, W - l.length - r.length)) + r;
  };

  const enc = new ReceiptPrinterEncoder({ language: 'esc-pos' });
  
  enc.initialize();
  enc.align('center').bold(true).size(2, 2).text(SETTINGS.shop_name).newline();
  enc.size(1, 1).bold(false);
  enc.text(SETTINGS.phone ? 'Ph: ' + SETTINGS.phone : '').newline();
  enc.newline();
  
  enc.align('left').text('-'.repeat(W)).newline();
  enc.text(line('Bill: ' + inv.invoice_no, fmtDate(inv.invoice_date))).newline();
  enc.text(line('Cust: ' + inv.customer_name, '')).newline();
  enc.text('-'.repeat(W)).newline();

  items.forEach(it => {
    enc.text(it.product_name).newline();
    if(it.batch_no) enc.text('  Batch: ' + it.batch_no).newline();
    enc.text(line('  ' + it.qty + ' x ' + Number(it.price).toFixed(2), Number(it.total).toFixed(2))).newline();
  });

  enc.text('-'.repeat(W)).newline();
  enc.bold(true).text(line('TOTAL:', 'Rs.' + Number(inv.total).toFixed(2))).bold(false).newline();
  enc.newline();
  enc.align('center').text('Thank you! Visit again.').newline();
  enc.newline(3);
  enc.cut();

  try {
    const device = await navigator.usb.requestDevice({ filters: [] });
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    await device.claimInterface(0);
    const ep = device.configuration.interfaces[0].alternates[0].endpoints.find(e => e.direction === 'out');
    
    if (ep) {
      await device.transferOut(ep.endpointNumber, enc.encode());
      toast('Sent to Printer', 'success');
    } else {
      toast('No output endpoint found', 'error');
    }
  } catch (err) {
    if (err.name !== 'NotFoundError') toast('Printer connection failed', 'error');
  }
}

/* ─── 24. FINAL ROUTER UPDATE ───────────────────────────────────── */
route = async function() {
  if (!SESSION) return renderLogin();
  
  renderLayout();
  const path = location.hash || '#/';
  const content = $('#content');
  
  if (path === '#/' || path === '') renderDashboard(content);
  else if (path === '#/products') renderProducts(content);
  else if (path === '#/customers') renderCustomers(content);
  else if (path === '#/suppliers') renderSuppliers(content);
  else if (path === '#/purchases') renderPurchases(content);
  else if (path === '#/invoices') renderInvoices(content);
  else if (path === '#/new-invoice') renderNewInvoice(content);
  else if (path.startsWith('#/invoice/')) {
    const id = path.split('/')[2];
    renderInvoiceView(content, id);
  }
  else content.innerHTML = `<div class="card" style="text-align:center; padding:60px;"><h2>Page under construction</h2></div>`;
};

// Re-run the router to apply changes
route();
