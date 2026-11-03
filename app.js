/* ══════════════════════════════════════════════════════════════════
   PAINTBOOK — CORE LOGIC
   FILE: app.js
   STEP 3: Supabase init · Auth · Router · Shell · Dashboard · MyShop
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   1. CONSTANTS
   ───────────────────────────────────────────── */
const APP_VERSION = '1.0.0-phase1';

const PRODUCT_CATEGORIES = [
  'Paint', 'Primer', 'Putty', 'Thinner', 'Accessory', 'Other'
];

const BASE_UNITS = ['L', 'ml', 'kg', 'g', 'pc'];

const PACK_UNITS = ['L', 'ml', 'kg', 'g', 'pc', 'set', 'box', 'pack'];

/* ─────────────────────────────────────────────
   2. SUPABASE SAFE INIT
   ───────────────────────────────────────────── */
let sb = null;
(function initSupabase() {
  try {
    const cfg = window.APP_CONFIG || {};
    if (
      !cfg.SUPABASE_URL ||
      cfg.SUPABASE_URL === 'YOUR_SUPABASE_URL' ||
      !cfg.SUPABASE_ANON_KEY ||
      cfg.SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY'
    ) {
      throw new Error(
        'Configuration incomplete.\n\n' +
        'Open index.html and replace:\n' +
        '  YOUR_SUPABASE_URL      → your project URL\n' +
        '  YOUR_SUPABASE_ANON_KEY → your anon public key\n\n' +
        'Get both from https://app.supabase.com → Project Settings → API'
      );
    }
    if (typeof supabase === 'undefined') {
      throw new Error('Supabase library not loaded. Check your internet connection.');
    }
    sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  } catch (e) {
    console.error('[PaintBook] Init failed:', e);
    document.addEventListener('DOMContentLoaded', () => {
      const app = document.getElementById('app');
      if (!app) return;
      const safe = String(e.message || e).replace(/[<>&"']/g, c => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
      }[c]));
      app.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;background:#F7F7FB;">' +
          '<div style="max-width:560px;width:100%;background:#fff;border:1px solid #E9EAF0;border-radius:16px;padding:32px;box-shadow:0 10px 40px rgba(0,0,0,0.08);">' +
            '<div style="font-size:40px;margin-bottom:16px;">🎨</div>' +
            '<h1 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 12px;">PaintBook — Setup Required</h1>' +
            '<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:16px;margin-bottom:20px;font-family:ui-monospace,monospace;font-size:12px;color:#991b1b;white-space:pre-wrap;line-height:1.6;">' +
              safe +
            '</div>' +
            '<p style="font-size:13px;color:#6B7280;line-height:1.7;margin:0;">' +
              'The app needs your Supabase credentials before it can connect to a database.' +
            '</p>' +
          '</div>' +
        '</div>';
    });
    throw e;
  }
})();

/* ─────────────────────────────────────────────
   3. GLOBAL STATE
   ───────────────────────────────────────────── */
let SESSION = null;

let SETTINGS = {
  shop_name:              'PaintBook',
  owner_name:             'Owner',
  address:                '',
  city:                   '',
  phone:                  '',
  email:                  '',
  upi:                    '',
  logo:                   '',
  gst_enabled:            false,
  gst_number:             '',
  gst_rate:               0,
  low_stock_alert_default: 5,
  print_footer:           'Thank you! Visit again',
  loaded:                 false
};

const DB = {
  brands:          [],
  products:        [],
  variants:        [],
  product_batches: [],
  customers:       [],
  invoices:        [],
  invoice_items:   [],
  payments:        [],
  colorants:       [],
  mixes:           [],
  settings:        null
};

window.DB_SYNCED  = false;
window.DB_SYNCING = false;
window.DB_ERROR   = null;

/* ─────────────────────────────────────────────
   4. DOM HELPERS
   ───────────────────────────────────────────── */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ─────────────────────────────────────────────
   5. XSS ESCAPE
   ───────────────────────────────────────────── */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ─────────────────────────────────────────────
   6. DATE / TIME
   ───────────────────────────────────────────── */
const todayStr = () => new Date().toISOString().slice(0, 10);

const fmtDate = (d) => {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const txDate = (r, k) => (r && (r[k] || (r.created_at ? r.created_at.slice(0, 10) : ''))) || '';

const txDT = (r, k) => {
  if (!r) return '—';
  const d = txDate(r, k);
  if (!d) return '—';
  return fmtDate(d) + (r.tx_time ? ' ' + r.tx_time : '');
};

const enteredOn = (r) => {
  if (!r || !r.created_at) return '';
  const d = new Date(r.created_at);
  return 'Entered: ' + d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

/* ─────────────────────────────────────────────
   7. NUMBER / CURRENCY
   ───────────────────────────────────────────── */
function inr(n) {
  const num = Number(n || 0);
  const neg = num < 0;
  const s = Math.abs(num).toFixed(2);
  const p = s.split('.');
  let intPart = p[0];
  const decPart = p[1];
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    intPart = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return (neg ? '-' : '') + intPart + '.' + decPart;
}

const rs = (n) => '₹' + inr(n);

const fmtNum = (n) => {
  const v = Number(n || 0);
  return v % 1 === 0 ? String(v) : v.toFixed(2);
};

/* ─────────────────────────────────────────────
   8. TOAST
   ───────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const root = $('#toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ─────────────────────────────────────────────
   9. FAVICON
   ───────────────────────────────────────────── */
function applyFavicon() {
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = (SETTINGS && SETTINGS.logo) || 
    "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎨</text></svg>";
}

/* ─────────────────────────────────────────────
   10. MODAL SYSTEM
   ───────────────────────────────────────────── */
function openModal(html, onMount) {
  const root = $('#modal-root');
  if (!root) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'modal-overlay';
  wrapper.innerHTML = `<div class="modal">${html}</div>`;

  wrapper.addEventListener('click', (e) => {
    if (e.target === wrapper) closeModal(wrapper);
  });

  root.appendChild(wrapper);
  document.body.style.overflow = 'hidden';

  if (onMount) onMount(wrapper);
  return wrapper;
}

function closeModal(el) {
  const root = $('#modal-root');
  if (!root) return;

  if (el && el.parentNode === root) {
    root.removeChild(el);
  } else {
    const last = root.lastElementChild;
    if (last) root.removeChild(last);
  }

  if (root.children.length === 0) document.body.style.overflow = '';
}

/* Make closeModal globally accessible for inline onclick */
window.closeModal = closeModal;

function confirmDlg(msg, title) {
  return confirm((title ? title + '\n\n' : '') + msg);
}

/* ─────────────────────────────────────────────
   11. AUTH
   ───────────────────────────────────────────── */
async function initAuth() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    SESSION = session || null;

    sb.auth.onAuthStateChange((_e, s) => {
      SESSION = s || null;
    });
  } catch (e) {
    console.warn('[auth] init failed:', e);
    SESSION = null;
  }
}

async function login(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const { data: { session } } = await sb.auth.getSession();
  SESSION = session || null;
}

async function logout() {
  try { await sb.auth.signOut(); } catch (e) { console.error('[auth] signout error', e); }
  SESSION = null;
  window.DB_SYNCED = false;
  window.DB_ERROR = null;
  location.hash = '#/';
  route();
}

/* ─────────────────────────────────────────────
   12. SYNC DB
   ───────────────────────────────────────────── */
async function fetchAllRows(tableName) {
  const PAGE_SIZE = 1000;
  let allData = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await sb
      .from(tableName)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

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
  window.DB_ERROR = null;

  const errors = [];
  const tables = ['brands', 'products', 'variants', 'product_batches'];

  const results = await Promise.allSettled(tables.map(t => fetchAllRows(t)));

  results.forEach((res, i) => {
    const name = tables[i];
    if (res.status === 'fulfilled') {
      DB[name] = res.value;
    } else {
      errors.push(res.reason.message || String(res.reason));
    }
  });

    // Settings + Subscription
  try {
    const { data: settData, error: settErr } = await sb.from('settings').select('*').eq('id', 1).maybeSingle();
    if (settErr) throw settErr;

    if (settData) {
      SETTINGS = {
        shop_name:               settData.shop_name               || 'PaintBook',
        owner_name:              settData.owner_name              || 'Owner',
        address:                 settData.address                 || '',
        city:                    settData.city                    || '',
        phone:                   settData.phone                   || '',
        email:                   settData.email                   || '',
        upi:                     settData.upi                     || '',
        logo:                    settData.logo                    || '',
        gst_enabled:             !!settData.gst_enabled,
        gst_number:              settData.gst_number              || '',
        gst_rate:                Number(settData.gst_rate)        || 0,
        low_stock_alert_default: Number(settData.low_stock_alert_default) || 5,
        print_footer:            settData.print_footer            || 'Thank you! Visit again',
        loaded:                  true
      };
      DB.settings = settData;
    } else {
      SETTINGS.loaded = true;
    }
    applyFavicon();

    // ── SUBSCRIPTION ──
    const { data: subData, error: subErr } = await sb.from('subscriptions').select('*').eq('id', 1).maybeSingle();
    if (subErr) throw subErr;

    if (!subData) {
      // Auto-create 1-year trial
      const now = new Date();
      const nextYear = new Date(now);
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      const { data: created, error: cErr } = await sb.from('subscriptions').insert({
        id: 1, active: true, started_at: now.toISOString(), expires_at: nextYear.toISOString(), last_paid_at: now.toISOString(), amount: window.APP_CONFIG?.SUB_PLAN_AMOUNT || 599, notes: 'Auto-created on first login'
      }).select().single();

      if (!cErr) {
        window.SUB = { loaded: true, active: true, expires_at: created.expires_at, last_paid_at: created.last_paid_at };
      }
    } else {
      window.SUB = { loaded: true, active: !!subData.active, expires_at: subData.expires_at, last_paid_at: subData.last_paid_at };
    }
    localStorage.setItem('sub_cache_expiry', window.SUB.expires_at);
  } catch (e) {
    errors.push('settings/sub - ' + (e.message || e));
    SETTINGS.loaded = true;
  }
  window.DB_SYNCED = errors.length === 0;
  window.DB_ERROR = errors.length ? errors[0] : null;
  window.DB_SYNCING = false;

  if (errors.length) {
    console.error('[PaintBook] Sync errors:', errors);
    if (!window.__syncErrorShown) {
      toast('Sync issue: ' + (errors[0] || 'Unknown'), 'error');
      window.__syncErrorShown = true;
    }
  } else {
    window.__syncErrorShown = false;
  }

  return { ok: errors.length === 0, errors };
}

/* ─────────────────────────────────────────────
   13. SAVE SETTINGS
   ───────────────────────────────────────────── */
async function saveSettings() {
  const payload = {
    id:                      1,
    shop_name:               SETTINGS.shop_name               || 'PaintBook',
    owner_name:              SETTINGS.owner_name              || 'Owner',
    address:                 SETTINGS.address                 || '',
    city:                    SETTINGS.city                    || '',
    phone:                   SETTINGS.phone                   || '',
    email:                   SETTINGS.email                   || '',
    upi:                     SETTINGS.upi                     || '',
    logo:                    SETTINGS.logo                    || '',
    gst_enabled:             !!SETTINGS.gst_enabled,
    gst_number:              SETTINGS.gst_number              || '',
    gst_rate:                Number(SETTINGS.gst_rate)        || 0,
    low_stock_alert_default: Number(SETTINGS.low_stock_alert_default) || 5,
    print_footer:            SETTINGS.print_footer            || 'Thank you! Visit again',
    updated_at:              new Date().toISOString()
  };

  const { error } = await sb.from('settings').upsert(payload, { onConflict: 'id' });

  if (error) {
    console.error('[saveSettings]', error);
    toast('Failed to save settings.', 'error');
    return false;
  }

  DB.settings = payload;
  return true;
}

/* ─────────────────────────────────────────────
   14. LOGIN SCREEN
   ───────────────────────────────────────────── */
function renderLogin() {
  const app = $('#app');
  if (!app) return;

  app.innerHTML = `
    <style>
      .login-wrapper {
        min-height: 100vh;
        display: flex;
        background-color: #F7F7FB;
        overflow: hidden;
      }
      .login-left {
        flex: 1.2;
        background: linear-gradient(135deg, #5B5BD6 0%, #4F46E5 100%);
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        clip-path: polygon(0 0, 100% 0, 80% 100%, 0% 100%);
        z-index: 1;
      }
      .login-right {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 24px;
        background-color: #F7F7FB;
        position: relative;
        z-index: 2;
        margin-left: -5%;
      }
      .login-form-container { width: 100%; max-width: 380px; }
      .mobile-brand { display: none; text-align: center; margin-bottom: 32px; }

      @media (max-width: 900px) {
        .login-left  { display: none; }
        .login-right { margin-left: 0; flex: 1; }
        .mobile-brand { display: block; }
      }
    </style>

    <div class="login-wrapper">
      <div class="login-left">
        <div style="position:absolute;inset:0;background-image:radial-gradient(circle at 20% 30%, rgba(255,255,255,0.1) 0%, transparent 40%);pointer-events:none;"></div>

        <div style="position:relative;z-index:10;padding:0 60px;max-width:520px;">
          <div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:24px;backdrop-filter:blur(10px);">🎨</div>
          <h1 style="font-size:36px;font-weight:800;color:#fff;line-height:1.2;margin-bottom:16px;letter-spacing:-0.5px;">
            Run your paint shop with clarity.
          </h1>
          <p style="font-size:16px;color:rgba(255,255,255,0.8);line-height:1.6;">
            Brands, shades, pack sizes, batches, bills, udhar and reports — all in one simple dashboard.
          </p>
        </div>
      </div>

      <div class="login-right">
        <form id="login-form" class="login-form-container">
          <div class="mobile-brand">
            <div style="width:56px;height:56px;background:#5B5BD6;color:#fff;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 16px;box-shadow:0 8px 20px rgba(91,91,214,0.3);">🎨</div>
            <h1 style="font-size:24px;font-weight:800;color:#111827;">PaintBook</h1>
          </div>

          <h2 style="font-size:26px;font-weight:800;color:#111827;margin-bottom:8px;letter-spacing:-0.5px;">Welcome back</h2>
          <p style="color:#6B7280;font-size:14px;margin-bottom:32px;">Sign in to your shop.</p>

          <div style="display:flex;flex-direction:column;gap:20px;">
            <div>
              <label class="label" style="color:#374151;">Email</label>
              <input class="input" type="email" id="l-email" required autocomplete="username" placeholder="owner@yourshop.com" style="background:#fff;border-color:#D1D5DB;height:44px;">
            </div>
            <div>
              <label class="label" style="color:#374151;">Password</label>
              <input class="input" type="password" id="l-pwd" required autocomplete="current-password" placeholder="••••••••" style="background:#fff;border-color:#D1D5DB;height:44px;">
            </div>

            <div id="l-err" class="field-error" style="display:none;text-align:center;background:#FEF2F2;padding:10px;border-radius:8px;border:1px solid #FECACA;color:#DC2626;"></div>

            <button class="btn btn-primary btn-block btn-lg" type="submit" id="l-btn" style="margin-top:8px;font-size:15px;font-weight:700;height:48px;box-shadow:0 4px 14px rgba(91,91,214,0.3);">
              Sign In
            </button>
          </div>

          <p style="text-align:center;font-size:12px;color:#9CA3AF;margin-top:32px;">
            Only the shop owner can sign in
          </p>
        </form>
      </div>
    </div>
  `;

  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const errEl = $('#l-err');
    const btn = $('#l-btn');

    errEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      await login($('#l-email').value.trim(), $('#l-pwd').value);
      await syncDB();
      await route();
    } catch (err) {
      errEl.textContent = err.message || 'Login failed. Check your credentials.';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  };
}

/* ─────────────────────────────────────────────
   15. NAVIGATION
   ───────────────────────────────────────────── */
const NAV_LINKS = [
  { group: 'Main', items: [
    { href: '#/',          icon: '📊', label: 'Dashboard' }
  ]},
  { group: 'Sales', items: [
    { href: '#/invoices',  icon: '🧾', label: 'Invoices'  },
    { href: '#/returns',   icon: '↩️', label: 'Returns'   },
    { href: '#/customers', icon: '👥', label: 'Customers' }
  ]},
  { group: 'Purchases', items: [
    { href: '#/purchases', icon: '🛒', label: 'Purchases' },
    { href: '#/suppliers', icon: '🚚', label: 'Suppliers' }
  ]},
  { group: 'Catalog', items: [
    { href: '#/brands',    icon: '🏷️', label: 'Brands'    },
    { href: '#/products',  icon: '🎨', label: 'My Items'  },
    { href: '#/colorants', icon: '🎨', label: 'Colorants' }
  ]},
  { group: 'Finance', items: [
    { href: '#/expenses',  icon: '💸', label: 'Expenses'  }
  ]},
  { group: 'Reports', items: [
    { href: '#/reports',   icon: '📈', label: 'Reports'   },
    { href: '#/pnl',       icon: '💹', label: 'P&L'       }
  ]},
  { group: 'Settings', items: [
    { href: '#/myshop',    icon: '⚙️', label: 'My Shop'   },
    { href: '#/backup',    icon: '💾', label: 'Backup'    }
  ]}
];

const MOBILE_NAV_ITEMS = [
  { href: '#/',          icon: '🏠', label: 'Home'      },
  { href: '#/invoices',  icon: '🧾', label: 'Invoices'  },
  { href: '#/purchases', icon: '🛒', label: 'Purchases' },
  { href: '#/products',  icon: '🎨', label: 'Products'  },
  { href: '#__menu__',   icon: '☰',  label: 'More'      }
];

function currentPageTitle() {
  const hash = location.hash || '#/';
  for (const g of NAV_LINKS) {
    for (const it of g.items) {
      if (it.href === hash) return it.label;
    }
  }
  return 'Dashboard';
}

/* ─────────────────────────────────────────────
   16. APP SHELL
   ───────────────────────────────────────────── */
function renderLayout() {
  const app = $('#app');
  if (!app) return;
  const hash = location.hash || '#/';

  const sidebarHTML = NAV_LINKS.map(g => `
    <div class="nav-group">
      <div class="nav-group-title">${esc(g.group)}</div>
      <div style="display:flex;flex-direction:column;">
        ${g.items.map(it => {
          const isActive = hash === it.href || (it.href !== '#/' && hash.startsWith(it.href));
          return `<a href="${esc(it.href)}" class="nav-link ${isActive ? 'active' : ''}">
            <span class="icon">${esc(it.icon)}</span>${esc(it.label)}
          </a>`;
        }).join('')}
      </div>
    </div>
  `).join('');

  const mobileNavHTML = MOBILE_NAV_ITEMS.map(it => {
    const isActive = it.href === '#__menu__' ? '' : (
      hash === it.href || (it.href !== '#/' && hash.startsWith(it.href)) ? 'active' : ''
    );
    return `<a href="${esc(it.href)}" class="${isActive}" data-mnav="${esc(it.href)}">
      <span class="icon">${esc(it.icon)}</span> ${esc(it.label)}
    </a>`;
  }).join('');

  const currentTheme = localStorage.getItem('theme') || 'light';
  const themeIcon = currentTheme === 'dark' ? '☀️' : '🌙';

  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar" id="sidebar">
        <div class="brand" style="padding:24px 16px;border-bottom:none;gap:12px;overflow:hidden;width:100%;">
                   <div class="brand-logo" style="width:36px;height:36px;background:#5B5BD6;color:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;font-weight:700;overflow:hidden;">
            ${SETTINGS.logo ? `<img src="${esc(SETTINGS.logo)}" style="width:100%;height:100%;object-fit:cover;">` : '🎨'}
          </div>
          <div class="brand-text" style="font-size:16px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">
            ${esc(SETTINGS.shop_name || 'PaintBook')}
          </div>
        </div>

        <div class="nav-scroll">${sidebarHTML}</div>

        <div class="sidebar-footer">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0 4px;">
            <button class="btn btn-ghost btn-sm" id="btn-theme" style="padding:0;height:auto;"><span>${themeIcon}</span></button>
            <button class="btn btn-ghost btn-sm" id="btn-logout" style="padding:0;height:auto;color:var(--text-muted);font-size:12px;">Sign Out</button>
          </div>
        </div>
      </aside>

      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>

      <div class="main-wrap">
        <div class="mobile-header">
          <button class="hamburger" id="btn-hamburger">☰</button>
          <div class="mobile-brand">${esc(SETTINGS.shop_name || 'PaintBook')}</div>
          <button class="hamburger" id="btn-theme-mobile">${themeIcon}</button>
        </div>

        <header class="topbar" style="display:flex;justify-content:space-between;align-items:center;height:64px;padding-right:24px;">
         <div style="display:flex;height:100%;">
  <a href="#/" class="topbar-tab ${hash === '#/' ? 'active' : ''}">Overview</a>
  <a href="#/invoices" class="topbar-tab ${hash.startsWith('#/invoices') ? 'active' : ''}">Invoices</a>
  <a href="#/customers" class="topbar-tab ${hash.startsWith('#/customers') ? 'active' : ''}">Customers</a>
  <a href="#/purchases" class="topbar-tab ${hash.startsWith('#/purchases') ? 'active' : ''}">Purchases</a>
  <a href="#/reports" class="topbar-tab ${hash.startsWith('#/reports') || hash.startsWith('#/pnl') || hash.startsWith('#/margin') ? 'active' : ''}">Reports</a>
  <a href="#/products" class="topbar-tab ${hash.startsWith('#/products') ? 'active' : ''}">Products</a>
  <a href="#/myshop" class="topbar-tab ${hash.startsWith('#/myshop') ? 'active' : ''}">Settings</a>
</div>

          <div style="display:flex;align-items:center;gap:20px;flex-shrink:0;">
            <a href="#/myshop" style="display:flex;align-items:center;gap:12px;border-left:1px solid #E5E7EB;padding-left:20px;text-decoration:none;cursor:pointer;">
              <div class="topbar-avatar" style="width:32px;height:32px;font-size:12px;background:#F3F4F6;color:#111827;flex-shrink:0;">
                ${esc((SETTINGS.owner_name || 'O').charAt(0).toUpperCase())}
              </div>
              <div style="display:flex;flex-direction:column;white-space:nowrap;">
                <div style="font-size:13px;font-weight:600;color:#111827;line-height:1.2;">${esc(SETTINGS.owner_name || 'Owner')}</div>
                <div style="font-size:11px;color:#6B7280;line-height:1.2;">Admin</div>
              </div>
            </a>
          </div>
        </header>

        <main id="content" class="main" style="background:#F7F7FB;"></main>
      </div>
    </div>
    <nav id="mobile-nav">${mobileNavHTML}</nav>
  `;

  // Sidebar toggle
  const sidebar = $('#sidebar');
  const backdrop = $('#sidebar-backdrop');
  const openSidebar  = () => { sidebar.classList.add('open'); backdrop.classList.add('show'); };
  const closeSidebar = () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); };

  $('#btn-hamburger').onclick = openSidebar;
  backdrop.onclick = closeSidebar;
  $$('.sidebar .nav-link').forEach(a => a.onclick = closeSidebar);
  $$('#mobile-nav a').forEach(a => {
    if (a.dataset.mnav === '#__menu__') {
      a.onclick = (e) => { e.preventDefault(); openSidebar(); };
    }
  });

  // Theme toggle
  const toggleTheme = () => {
    const html = document.documentElement;
    const next = (html.getAttribute('data-theme') || 'light') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    const icon = next === 'dark' ? '☀️' : '🌙';
    if ($('#btn-theme')) $('#btn-theme').innerHTML = `<span>${icon}</span>`;
    if ($('#btn-theme-mobile')) $('#btn-theme-mobile').textContent = icon;
  };
  $('#btn-theme').onclick = toggleTheme;
  $('#btn-theme-mobile').onclick = toggleTheme;

  $('#btn-logout').onclick = () => {
    if (confirm('Sign out?')) logout();
  };
}

/* ─────────────────────────────────────────────
   17. DASHBOARD
   ───────────────────────────────────────────── */
function renderDashboard(content) {
  const brandCount   = DB.brands.length;
  const productCount = DB.products.length;
  const variantCount = DB.variants.length;
  const batchCount   = DB.product_batches.length;

  const totalStockValue = DB.variants.reduce((s, v) => {
    if (v.stock && Number(v.stock) > 0) {
      return s + (Number(v.stock) || 0) * (Number(v.cost) || 0);
    }
    return s;
  }, 0);

  const setupSteps = [
    { label: 'Create at least one brand', done: brandCount > 0, href: '#/brands', icon: '🏷️' },
    { label: 'Add your first product',    done: productCount > 0, href: '#/products', icon: '🎨' },
    { label: 'Add variants (shades × sizes)', done: variantCount > 0, href: '#/products', icon: '🎨' },
    { label: 'Add stock via batches',     done: batchCount > 0, href: '#/batches', icon: '📦' }
  ];

  const doneCount = setupSteps.filter(s => s.done).length;
  const setupComplete = doneCount === setupSteps.length;

  content.innerHTML = `
    <div class="page-head" style="align-items:center;margin-bottom:24px;">
      <div class="page-head-title">
        <h1 style="font-size:24px;">Welcome to PaintBook</h1>
        <p style="font-size:13px;color:#6B7280;">
          ${setupComplete ? 'Setup complete — you\'re ready to sell.' : `Setup progress: ${doneCount} of ${setupSteps.length} steps done.`}
        </p>
      </div>
      <div class="page-head-actions">
        <a href="#/myshop" class="btn btn-ghost" style="background:#fff;border:1px solid #E5E7EB;font-size:12px;font-weight:600;color:#374151;text-decoration:none;">
          ⚙️ Shop Settings
        </a>
      </div>
    </div>

    <div class="kpi-row" style="margin-bottom:20px;">
      <div class="kpi-card" style="border-radius:16px;">
        <div class="kpi-card-top">
          <div class="kpi-label">Brands</div>
          <div class="kpi-icon" style="color:var(--primary);background:var(--primary-light);">🏷️</div>
        </div>
        <div class="kpi-value">${brandCount}</div>
        <div class="kpi-trend text-muted">total</div>
      </div>
      <div class="kpi-card" style="border-radius:16px;">
        <div class="kpi-card-top">
          <div class="kpi-label">Product Lines</div>
          <div class="kpi-icon" style="color:#F59E0B;background:#FEF3C7;">🎨</div>
        </div>
        <div class="kpi-value">${productCount}</div>
        <div class="kpi-trend text-muted">total</div>
      </div>
      <div class="kpi-card" style="border-radius:16px;">
        <div class="kpi-card-top">
          <div class="kpi-label">Variants (SKUs)</div>
          <div class="kpi-icon" style="color:#10B981;background:#D1FAE5;">📋</div>
        </div>
        <div class="kpi-value">${variantCount}</div>
        <div class="kpi-trend text-muted">shade × size</div>
      </div>
      <div class="kpi-card" style="border-radius:16px;">
        <div class="kpi-card-top">
          <div class="kpi-label">Stock Value</div>
          <div class="kpi-icon" style="color:#5B5BD6;background:#EEEEFB;">💰</div>
        </div>
        <div class="kpi-value">${rs(totalStockValue)}</div>
        <div class="kpi-trend text-muted">${batchCount} batches</div>
      </div>
    </div>

    ${!setupComplete ? `
      <div class="card" style="margin-bottom:20px;border-radius:16px;">
        <div class="card-title" style="font-size:15px;margin-bottom:20px;">
          🚀 Getting Started
          <small>${doneCount}/${setupSteps.length} done</small>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${setupSteps.map((s, i) => `
            <a href="${s.done ? s.href : s.href}" style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:${s.done ? 'var(--success-bg)' : 'var(--bg-app)'};border:1px solid ${s.done ? 'var(--success)' : 'var(--border)'};border-radius:12px;text-decoration:none;color:inherit;transition:all 0.15s;">
              <div style="width:36px;height:36px;background:${s.done ? 'var(--success)' : 'var(--bg-card)'};color:${s.done ? '#fff' : 'var(--text-muted)'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">
                ${s.done ? '✓' : (i + 1)}
              </div>
              <div style="flex:1;">
                <div style="font-weight:600;font-size:13px;color:${s.done ? 'var(--success)' : 'var(--text-main)'};">${esc(s.label)}</div>
                <div class="text-xs text-muted">${s.done ? 'Completed' : 'Pending'}</div>
              </div>
              <div style="color:var(--text-muted);font-size:16px;">›</div>
            </a>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="card" style="border-radius:16px;margin-bottom:20px;">
      <div class="card-title" style="font-size:15px;margin-bottom:20px;">
        🩺 System Status
        <button class="btn btn-ghost btn-sm" id="btn-refresh" style="font-size:11px;">🔄 Refresh</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
          <span class="text-muted">Database</span>
          <b style="color:${window.DB_SYNCED ? 'var(--success)' : (window.DB_ERROR ? 'var(--danger)' : 'var(--warning)')};">
            ${window.DB_SYNCED ? '✅ Connected' : (window.DB_ERROR ? '❌ ' + esc(window.DB_ERROR) : '⏳ Syncing')}
          </b>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
          <span class="text-muted">Signed in as</span>
          <b>${esc(SESSION?.user?.email || '—')}</b>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
          <span class="text-muted">Settings row</span>
          <b style="color:${SETTINGS.loaded ? 'var(--success)' : 'var(--danger)'};">${SETTINGS.loaded ? '✅ Loaded' : '❌ Missing'}</b>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
          <span class="text-muted">Brands table</span>
          <b>${brandCount} record${brandCount === 1 ? '' : 's'}</b>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
          <span class="text-muted">Products table</span>
          <b>${productCount} record${productCount === 1 ? '' : 's'}</b>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
          <span class="text-muted">Variants table</span>
          <b>${variantCount} record${variantCount === 1 ? '' : 's'}</b>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;">
          <span class="text-muted">Batches table</span>
          <b>${batchCount} record${batchCount === 1 ? '' : 's'}</b>
        </div>
      </div>
    </div>

    <div class="card" style="border-radius:16px;background:var(--primary-light);border-color:var(--primary);">
      <div style="display:flex;gap:14px;align-items:flex-start;">
        <div style="font-size:24px;">ℹ️</div>
        <div style="flex:1;">
          <div style="font-weight:700;color:var(--primary);font-size:13px;margin-bottom:4px;">Phase 1 · Step 3 of 8</div>
          <div class="text-sm" style="color:var(--text-main);line-height:1.6;">
            Core shell is ready. Brand / Product / Batch pages will be built in the next steps.
            <b>My Shop</b> is fully working — set your shop name, address, phone, GST here.
          </div>
        </div>
      </div>
    </div>

    <div class="text-center text-xs text-muted" style="padding:24px 0;">
      PaintBook ${APP_VERSION}
    </div>
  `;

  const refreshBtn = $('#btn-refresh');
  if (refreshBtn) {
    refreshBtn.onclick = async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing...';
      await syncDB();
      route();
    };
  }
}

/* ─────────────────────────────────────────────
   18. STUB PAGES
   ───────────────────────────────────────────── */
function renderStub(content, opts) {
  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>${esc(opts.title)}</h1>
        <p>${esc(opts.subtitle)}</p>
      </div>
    </div>

    <div class="card" style="border-radius:16px;text-align:center;padding:60px 24px;">
      <div style="font-size:56px;opacity:0.3;margin-bottom:20px;">${opts.icon}</div>
      <div style="font-size:18px;font-weight:700;color:var(--text-main);margin-bottom:8px;">
        Coming in ${esc(opts.step)}
      </div>
      <div class="text-sm text-muted" style="max-width:420px;margin:0 auto 24px;line-height:1.7;">
        ${esc(opts.message)}
      </div>

      ${opts.currentCount !== undefined ? `
        <div style="display:inline-block;padding:12px 20px;background:var(--bg-app);border-radius:var(--radius-md);border:1px solid var(--border);">
          <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;letter-spacing:0.5px;">Currently in database</div>
          <div style="font-size:24px;font-weight:700;color:var(--primary);margin-top:4px;">${opts.currentCount} ${opts.countLabel || ''}</div>
        </div>
      ` : ''}
    </div>
  `;
}

/* ─────────────────────────────────────────────
   19. MY SHOP (fully working)
   ───────────────────────────────────────────── */
function renderMyShop(content) {
  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>My Shop</h1>
        <p>Business details and preferences</p>
      </div>
    </div>

        <!-- LOGO SECTION -->
    <div class="card" style="margin-bottom:20px;border-radius:16px;">
      <div class="card-title">Logo</div>
      <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;">
        <div style="width:100px;height:100px;border:1px solid var(--border);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;font-size:48px;background:var(--bg-app);overflow:hidden;flex-shrink:0;">
          ${SETTINGS.logo
            ? `<img src="${esc(SETTINGS.logo)}" style="max-width:100%;max-height:100%;object-fit:contain;" alt="Shop logo">`
            : '🎨'}
        </div>
        <div style="flex:1;min-width:200px;">
          <input type="file" id="logo-input" accept="image/png, image/jpeg, image/webp" style="display:none;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="btn-upload" class="btn btn-primary">📁 Upload Logo</button>
            ${SETTINGS.logo ? '<button id="btn-remove-logo" class="btn btn-ghost" style="color:var(--danger);">Remove</button>' : ''}
          </div>
          <p class="field-hint" style="margin-top:8px;">PNG, JPG, or WebP. Max 500 KB. Will appear on invoices, dashboard, and thermal print.</p>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;border-radius:16px;">
      <div class="card-title">Shop Details</div>
      <form id="shop-form" style="display:flex;flex-direction:column;gap:16px;">
        <div class="grid-2">
          <div>
            <label class="label">Shop name</label>
            <input class="input" name="shop_name" value="${esc(SETTINGS.shop_name || '')}" placeholder="e.g. Sharma Paint House">
          </div>
          <div>
            <label class="label">Owner name</label>
            <input class="input" name="owner_name" value="${esc(SETTINGS.owner_name || '')}" placeholder="Your full name">
          </div>
        </div>

        <div>
          <label class="label">Address</label>
          <input class="input" name="address" value="${esc(SETTINGS.address || '')}" placeholder="Street, area">
        </div>

        <div class="grid-2">
          <div>
            <label class="label">City / Pin</label>
            <input class="input" name="city" value="${esc(SETTINGS.city || '')}" placeholder="Kolkata - 700001">
          </div>
          <div>
            <label class="label">Phone</label>
            <input class="input" type="tel" name="phone" value="${esc(SETTINGS.phone || '')}" placeholder="10-digit mobile">
          </div>
        </div>

        <div class="grid-2">
          <div>
            <label class="label">Email</label>
            <input class="input" type="email" name="email" value="${esc(SETTINGS.email || '')}">
          </div>
          <div>
            <label class="label">UPI ID (for QR payments)</label>
            <input class="input" name="upi" value="${esc(SETTINGS.upi || '')}" placeholder="yourshop@upi">
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;">
          <button class="btn btn-primary" type="submit" id="shop-save">Save Changes</button>
        </div>
      </form>
    </div>

    <div class="card" style="margin-bottom:20px;border-radius:16px;">
      <div class="card-title">GST</div>
      <label style="display:flex;align-items:center;gap:12px;cursor:pointer;font-size:13px;padding:14px;background:var(--bg-app);border-radius:var(--radius-md);border:1px solid var(--border);">
        <input type="checkbox" id="gst-toggle" ${SETTINGS.gst_enabled ? 'checked' : ''}>
        <span>
          <b>Enable GST on invoices</b><br>
          <span class="field-hint">When on, invoices will show GST fields. Default rate is 0 — you can set per-line rates at billing time.</span>
        </span>
      </label>
      <div id="gst-fields" style="display:${SETTINGS.gst_enabled ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
        <div>
          <label class="label">GSTIN</label>
          <input class="input" id="gst-number" value="${esc(SETTINGS.gst_number || '')}" placeholder="22AAAAA0000A1Z5">
        </div>
        <div>
          <label class="label">Default GST Rate (%)</label>
          <input class="input" type="number" step="any" min="0" id="gst-rate" value="${SETTINGS.gst_rate || 0}">
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;border-radius:16px;">
      <div class="card-title">Preferences</div>
      <div>
        <label class="label">Default low-stock alert threshold</label>
        <input class="input" type="number" step="1" min="0" id="low-stock" value="${SETTINGS.low_stock_alert_default || 5}" style="max-width:200px;">
        <div class="field-hint">Pre-fills the "low stock alert" field when you create new variants.</div>
      </div>
    </div>

    <div class="card" style="border-radius:16px;">
      <div class="card-title">Print Settings</div>
      <div>
        <label class="label">Invoice footer message</label>
        <input class="input" id="print-footer" value="${esc(SETTINGS.print_footer || 'Thank you! Visit again')}" placeholder="Thank you! Visit again">
        <div class="field-hint">Shown at the bottom of every printed bill.</div>
      </div>
    </div>
  `;

  // ── LOGO UPLOAD LOGIC ──
  const uploadBtn = $('#btn-upload');
  const logoInput = $('#logo-input');
  if (uploadBtn && logoInput) {
    uploadBtn.onclick = () => logoInput.click();
    logoInput.onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;

      const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
      if (!ALLOWED.includes(f.type)) {
        toast('Only PNG, JPG, or WebP images are allowed.', 'error');
        e.target.value = '';
        return;
      }
      if (f.size > 1024 * 500) {
        toast('Image too large (max 500 KB). Please compress.', 'error');
        e.target.value = '';
        return;
      }

      const r = new FileReader();
      r.onload = async (ev) => {
        SETTINGS.logo = ev.target.result;
        const ok = await saveSettings();
        if (ok) {
          applyFavicon();
          toast('Logo updated', 'success');
          route();
        }
      };
      r.readAsDataURL(f);
    };
  }

  const rmBtn = $('#btn-remove-logo');
  if (rmBtn) {
    rmBtn.onclick = async () => {
      if (!confirm('Remove the shop logo?')) return;
      SETTINGS.logo = '';
      const ok = await saveSettings();
      if (ok) {
        applyFavicon();
        toast('Logo removed', 'success');
        route();
      }
    };
  }
   
  // Shop form save
  $('#shop-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    SETTINGS.shop_name  = (fd.get('shop_name')  || '').trim() || 'PaintBook';
    SETTINGS.owner_name = (fd.get('owner_name') || '').trim() || 'Owner';
    SETTINGS.address    = (fd.get('address')    || '').trim();
    SETTINGS.city       = (fd.get('city')       || '').trim();
    SETTINGS.phone      = (fd.get('phone')      || '').trim();
    SETTINGS.email      = (fd.get('email')      || '').trim();
    SETTINGS.upi        = (fd.get('upi')        || '').trim();

    const btn = $('#shop-save');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const ok = await saveSettings();

    btn.disabled = false;
    btn.textContent = 'Save Changes';

    if (ok) {
      toast('Shop details saved', 'success');
      route();
    }
  };

  // GST toggle
  $('#gst-toggle').onchange = async (e) => {
    SETTINGS.gst_enabled = e.target.checked;
    const gf = $('#gst-fields');
    if (gf) gf.style.display = SETTINGS.gst_enabled ? 'grid' : 'none';
    const ok = await saveSettings();
    if (ok) toast('GST ' + (SETTINGS.gst_enabled ? 'enabled' : 'disabled'), 'success');
  };

  ['gst-number', 'gst-rate', 'low-stock', 'print-footer'].forEach(id => {
    const el = $('#' + id);
    if (!el) return;
    el.onchange = async () => {
      if (id === 'gst-number')       SETTINGS.gst_number = el.value.trim();
      if (id === 'gst-rate')         SETTINGS.gst_rate = Number(el.value) || 0;
      if (id === 'low-stock')        SETTINGS.low_stock_alert_default = Number(el.value) || 5;
      if (id === 'print-footer')     SETTINGS.print_footer = el.value.trim() || 'Thank you! Visit again';
      const ok = await saveSettings();
      if (ok) toast('Saved', 'success');
    };
  });
}

/* ─────────────────────────────────────────────
   20. ROUTER
   ───────────────────────────────────────────── */
async function route() {
  const app = $('#app');
  if (!app) return;

  if (!SESSION) {
    renderLogin();
    return;
  }

  if (window.DB_SYNCED !== true) {
    app.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;"><div class="spinner"></div><div style="color:var(--text-muted);font-size:14px;">Loading shop data...</div></div>';
    await syncDB();
  }

  renderLayout();
  const content = $('#content');
  const title = $('#topbar-title');
  if (!content) return;
  if (title) title.textContent = currentPageTitle();

  const hash = location.hash || '#/';

  try {
    if (hash === '#/' || hash === '' || hash === '#') return renderDashboard(content);
    if (hash === '#/brands')   return renderBrands(content);
   if (hash === '#/products') return renderProducts(content);
const varMatch = hash.match(/^#\/product\/([^\/]+)\/variants$/);
if (varMatch) return renderVariants(content, varMatch[1]);
    if (hash === '#/batches')  return renderBatches(content);
     if (hash === '#/customers') return renderCustomers(content);
if (hash === '#/colorants') return renderColorants(content);
     if (hash === '#/returns')       return renderReturns(content);
if (hash === '#/expenses')      return renderExpenses(content);
     if (hash === '#/reports')              return renderReportsHub(content);
if (hash === '#/reports/brand-sales')  return renderBrandSalesReport(content);
if (hash === '#/reports/top-shades')   return renderTopShadesReport(content);
if (hash === '#/reports/dead-stock')   return renderDeadStockReport(content);
if (hash === '#/reports/brand-profit') return renderBrandProfitReport(content);
if (hash === '#/margin')               return renderMargin(content);
if (hash === '#/pnl')                  return renderPnL(content);
     if (hash === '#/suppliers')     return renderSuppliers(content);
if (hash === '#/purchases')     return renderPurchases(content);
if (hash === '#/new-purchase')  return renderNewPurchase(content);
const supMatch = hash.match(/^#\/supplier\/([^\/\?]+)/);
if (supMatch) return renderSupplierProfile(content, supMatch[1]);
const purMatch = hash.match(/^#\/purchase\/([^\/\?]+)/);
if (purMatch) return renderPurchaseView(content, purMatch[1]);
     if (hash === '#/invoices')     return renderInvoices(content);
if (hash === '#/new-invoice')  return renderNewInvoice(content, { customer_id: new URLSearchParams(hash.split('?')[1] || '').get('customer') });
const invMatch = hash.match(/^#\/invoice\/([^\/\?]+)/);
if (invMatch) return renderInvoiceView(content, invMatch[1]);
const custMatch = hash.match(/^#\/customer\/([^\/]+)$/);
if (custMatch) return renderCustomerProfile(content, custMatch[1]);
    if (hash === '#/myshop')   return renderMyShop(content);
     if (hash === '#/backup')       return renderBackup(content);
     // (nothing needed here, route is handled by renderLayout sub-banner)

    // Fallback
    return renderDashboard(content);
  } catch (err) {
    console.error('[route]', err);
    content.innerHTML = `
      <div class="card" style="border-color:var(--danger);border-radius:16px;">
        <div style="color:var(--danger);font-weight:700;margin-bottom:6px;">Something went wrong</div>
        <div class="text-sm text-muted">${esc(err.message || String(err))}</div>
        <div style="margin-top:12px;">
          <button class="btn btn-ghost btn-sm" onclick="location.reload()">Reload</button>
        </div>
      </div>
    `;
  }
}

/* ─────────────────────────────────────────────
   21. BOOT
   ───────────────────────────────────────────── */
window.addEventListener('hashchange', () => route());

(async function boot() {
  try {
    applyFavicon();
/* ══════════════════════════════════════════════════════════════════
   STEP 6 — VARIANTS  (Shade × Pack Size)
   
   Note: Some helpers below (productStockQty, productStockValue,
   renderProducts) intentionally OVERRIDE earlier definitions from
   Step 5. Function declarations resolve to the last one in scope,
   so these take over at runtime. Cleaner than patching older code.
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   6.1 STOCK HELPERS (variant + batch aware)
   ───────────────────────────────────────────── */
function variantStock(v, product) {
  if (!v) return 0;
  const p = product || DB.products.find(x => x.id === v.product_id);
  if (!p) return Number(v.stock) || 0;

  if (p.batch_managed === false) {
    return Number(v.stock) || 0;
  }

  return DB.product_batches
    .filter(b => b.variant_id === v.id)
    .reduce((s, b) => s + (Number(b.qty) || 0), 0);
}

function variantBatchCount(v) {
  if (!v) return 0;
  return DB.product_batches.filter(b => b.variant_id === v.id).length;
}

function variantStockBadge(v, product) {
  const stock = variantStock(v, product);
  const alert = Number(v.low_stock_alert) || 0;
  const p = product || DB.products.find(x => x.id === v.product_id);
  const isBatchManaged = p && p.batch_managed !== false;

  if (stock === 0) {
    if (isBatchManaged) {
      return '<span class="chip chip-warning" style="font-size:10px;">NO BATCHES</span>';
    }
    return '<span class="chip chip-danger" style="font-size:10px;">OUT</span>';
  }
  if (stock <= alert) {
    return '<span class="chip chip-warning" style="font-size:10px;">LOW</span>';
  }
  return '<span class="chip chip-success" style="font-size:10px;">OK</span>';
}

/* ─────────────────────────────────────────────
   6.2 OVERRIDE PRODUCT HELPERS (batch-aware)
   ───────────────────────────────────────────── */
function productStockQty(p) {
  if (!p) return 0;
  const variants = DB.variants.filter(v => v.product_id === p.id);

  if (p.batch_managed === false) {
    return variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
  }

  const variantIds = new Set(variants.map(v => v.id));
  return DB.product_batches
    .filter(b => variantIds.has(b.variant_id))
    .reduce((s, b) => s + (Number(b.qty) || 0), 0);
}

function productStockValue(p) {
  if (!p) return 0;
  const variants = DB.variants.filter(v => v.product_id === p.id);

  if (p.batch_managed === false) {
    return variants.reduce((s, v) => s + (Number(v.stock) || 0) * (Number(v.cost) || 0), 0);
  }

  const variantIds = new Set(variants.map(v => v.id));
  return DB.product_batches
    .filter(b => variantIds.has(b.variant_id))
    .reduce((s, b) => s + (Number(b.qty) || 0) * (Number(b.cost) || 0), 0);
}

/* ─────────────────────────────────────────────
   6.3 VARIANTS PAGE
   ───────────────────────────────────────────── */
function renderVariants(content, productId) {
  const product = DB.products.find(x => x.id === productId);
  if (!product) {
    content.innerHTML = `
      <div class="empty-state" style="padding:80px 20px;">
        <div class="empty-icon">🎨</div>
        <div class="empty-title">Product not found</div>
        <div class="empty-desc">It may have been deleted.</div>
        <a href="#/products" class="btn btn-primary">Back to Products</a>
      </div>
    `;
    return;
  }

  const brand = DB.brands.find(b => b.id === product.brand_id);
  const list = DB.variants.filter(v => v.product_id === productId);
  const isBatchManaged = product.batch_managed !== false;

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/products" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Products</a>
    </div>

    <div class="page-head" style="align-items:center;margin-bottom:24px;">
      <div>
        <h1 style="margin-bottom:8px;font-size:24px;">${esc(product.name)}</h1>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          ${brand ? `<span class="chip chip-primary">🏷️ ${esc(brand.name)}</span>` : '<span class="chip chip-neutral">No brand</span>'}
          <span class="chip chip-neutral">${esc(product.category || '—')}</span>
          ${isBatchManaged
            ? '<span class="chip chip-success">BATCH-MANAGED</span>'
            : '<span class="chip chip-warning">NON-BATCH</span>'}
        </div>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" id="v-bulk-add">📋 Bulk Add Sizes</button>
        <button class="btn btn-primary" id="v-add">+ Add Variant</button>
      </div>
    </div>

    ${isBatchManaged ? `
      <div class="card" style="margin-bottom:20px;background:var(--primary-light);border-color:var(--primary);border-radius:12px;box-shadow:none;">
        <div style="display:flex;gap:12px;align-items:flex-start;font-size:13px;">
          <span style="font-size:20px;">📦</span>
          <div>
            <b style="color:var(--primary);">Batch-managed product</b>
            <div class="text-muted" style="margin-top:4px;line-height:1.5;">
              Stock comes from <b>batches</b> (with batch number + mfg date).
              Stock shows 0 until batches are added (Step 7 — Batches page).
            </div>
          </div>
        </div>
      </div>
    ` : ''}

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;border-radius:16px;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="v-search" placeholder="Shade name, code or size...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Sort</label>
        <select class="input" id="v-sort">
          <option value="shade">Shade (A–Z)</option>
          <option value="shade-desc">Shade (Z–A)</option>
          <option value="size">Size (small first)</option>
          <option value="size-desc">Size (large first)</option>
          <option value="stock">Stock (low first)</option>
          <option value="stock-desc">Stock (high first)</option>
          <option value="newest">Newest first</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Shade</th>
            <th>Pack Size</th>
            <th style="text-align:right">Cost</th>
            <th style="text-align:right">MRP</th>
            <th style="text-align:right">Selling</th>
            <th style="text-align:right">Stock</th>
            <th>Status</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="v-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="v-mobile"></div>
  `;

  function filtered() {
    const q = ($('#v-search').value || '').toLowerCase().trim();
    const sortBy = $('#v-sort').value;

    let arr = list.filter(v => {
      if (!q) return true;
      const hay = ((v.shade_name || '') + ' ' + (v.shade_code || '') + ' ' + (v.pack_size || '')).toLowerCase();
      return hay.includes(q);
    });

    arr = arr.map(v => ({ ...v, _stock: variantStock(v, product) }));

    if (sortBy === 'shade')           arr.sort((a, b) => (a.shade_name || '').localeCompare(b.shade_name || ''));
    else if (sortBy === 'shade-desc') arr.sort((a, b) => (b.shade_name || '').localeCompare(a.shade_name || ''));
    else if (sortBy === 'size')       arr.sort((a, b) => Number(a.pack_size) - Number(b.pack_size));
    else if (sortBy === 'size-desc')  arr.sort((a, b) => Number(b.pack_size) - Number(a.pack_size));
    else if (sortBy === 'stock')      arr.sort((a, b) => a._stock - b._stock);
    else if (sortBy === 'stock-desc') arr.sort((a, b) => b._stock - a._stock);
    else if (sortBy === 'newest')     arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return arr;
  }

  function renderList() {
    const arr = filtered();

    // Desktop table
    const tbody = $('#v-body');
    if (tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">
             ${list.length === 0
               ? 'No variants yet. Click <b>+ Add Variant</b> or use <b>📋 Bulk Add Sizes</b> to create shades and sizes.'
               : 'No variants match your search.'}
           </td></tr>`
        : arr.map(v => {
            const stock = v._stock;
            const badge = variantStockBadge(v, product);
            const batchCnt = variantBatchCount(v);
            return `<tr>
              <td>
                <div style="font-weight:600;color:var(--text-main);">${esc(v.shade_name || '—')}</div>
                ${v.shade_code ? `<div class="text-xs text-muted" style="font-family:monospace;margin-top:2px;">${esc(v.shade_code)}</div>` : ''}
              </td>
              <td><span class="chip chip-neutral">${fmtNum(v.pack_size)} ${esc(v.pack_unit || '')}</span></td>
              <td style="text-align:right;" class="text-sm text-muted">${rs(v.cost)}</td>
              <td style="text-align:right;" class="text-sm text-muted">${rs(v.mrp)}</td>
              <td style="text-align:right;font-weight:600;">${rs(v.selling_price || v.mrp)}</td>
              <td style="text-align:right;">
                <div style="font-weight:600;">${fmtNum(stock)}</div>
                ${isBatchManaged ? `<div class="text-xs text-muted" style="margin-top:2px;">${batchCnt} batch${batchCnt === 1 ? '' : 'es'}</div>` : ''}
              </td>
              <td>${badge}</td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" data-edit-v="${v.id}">Edit</button>
                <button class="btn btn-ghost btn-sm" data-del-v="${v.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('');
    }

    // Mobile cards
    const mob = $('#v-mobile');
    if (mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">📋</div>
             <div class="empty-title">${list.length === 0 ? 'No variants yet' : 'No matches'}</div>
             <div class="empty-desc">${list.length === 0
               ? 'Tap "+ Add Variant" or "📋 Bulk Add Sizes" above to create shades and sizes.'
               : 'Try a different search.'}</div>
           </div>`
        : arr.map(v => {
            const stock = v._stock;
            const badge = variantStockBadge(v, product);
            return `
              <div class="mobile-card">
                <div class="mobile-card-head">
                  <div style="min-width:0;flex:1;">
                    <div class="mobile-card-title">${esc(v.shade_name || '—')}</div>
                    <div class="mobile-card-sub">
                      ${fmtNum(v.pack_size)} ${esc(v.pack_unit || '')}
                      ${v.shade_code ? ' · ' + esc(v.shade_code) : ''}
                    </div>
                  </div>
                  <div style="text-align:right;flex-shrink:0;">
                    ${badge}
                    <div style="font-weight:700;margin-top:4px;">${fmtNum(stock)}</div>
                  </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:11px;">
                  <div style="padding:8px;background:var(--bg-app);border-radius:6px;text-align:center;">
                    <div class="text-muted">Cost</div>
                    <div style="font-weight:600;">${rs(v.cost)}</div>
                  </div>
                  <div style="padding:8px;background:var(--bg-app);border-radius:6px;text-align:center;">
                    <div class="text-muted">MRP</div>
                    <div style="font-weight:600;">${rs(v.mrp)}</div>
                  </div>
                  <div style="padding:8px;background:var(--bg-app);border-radius:6px;text-align:center;">
                    <div class="text-muted">Sell</div>
                    <div style="font-weight:600;color:var(--primary);">${rs(v.selling_price || v.mrp)}</div>
                  </div>
                </div>
                <div class="mobile-card-foot">
                  <div class="text-xs text-muted">Alert at ${v.low_stock_alert || 0}</div>
                  <div style="display:flex;gap:8px;">
                    <button class="btn btn-ghost btn-sm" data-edit-v="${v.id}">Edit</button>
                    <button class="btn btn-ghost btn-sm" data-del-v="${v.id}" style="color:var(--danger);">Delete</button>
                  </div>
                </div>
              </div>
            `;
          }).join('');
    }

    $$('[data-edit-v]').forEach(btn => btn.onclick = () => {
      const v = DB.variants.find(x => x.id === btn.dataset.editV);
      if (v) openVariantForm(product, v);
    });

    $$('[data-del-v]').forEach(btn => btn.onclick = () => deleteVariant(btn.dataset.delV));
  }

  $('#v-search').oninput = renderList;
  $('#v-sort').onchange = renderList;
  $('#v-add').onclick = () => openVariantForm(product);
  $('#v-bulk-add').onclick = () => openBulkVariantForm(product);

  renderList();
}

/* ─────────────────────────────────────────────
   6.4 ADD/EDIT VARIANT
   ───────────────────────────────────────────── */
function openVariantForm(product, existing) {
  const isEdit = !!existing;
  const isBatchManaged = product.batch_managed !== false;

  const v = existing || {
    shade_name: '',
    shade_code: '',
    pack_size: '',
    pack_unit: product.unit_base || 'L',
    cost: 0,
    mrp: 0,
    selling_price: 0,
    stock: 0,
    low_stock_alert: product.low_stock_alert || SETTINGS.low_stock_alert_default || 5,
    notes: ''
  };

  const unitOptions = PACK_UNITS
    .map(u => `<option value="${esc(u)}" ${v.pack_unit === u ? 'selected' : ''}>${esc(u)}</option>`)
    .join('');

  openModal(`
    <div class="modal-header">
      <div>
        <div class="modal-title">${isEdit ? 'Edit Variant' : 'New Variant'}</div>
        <div class="text-xs text-muted" style="margin-top:2px;">For: <b>${esc(product.name)}</b></div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <form id="vf" style="display:flex;flex-direction:column;gap:16px;">

        <div class="grid-2">
          <div>
            <label class="label">Shade Name *</label>
            <input class="input" name="shade_name" required value="${esc(v.shade_name || '')}" placeholder="e.g. Ivory White" autofocus>
          </div>
          <div>
            <label class="label">Shade Code</label>
            <input class="input" name="shade_code" value="${esc(v.shade_code || '')}" placeholder="e.g. 1012">
          </div>
        </div>

        <div class="grid-2">
          <div>
            <label class="label">Pack Size *</label>
            <input class="input" name="pack_size" type="number" step="any" min="0.01" required value="${v.pack_size || ''}" placeholder="e.g. 4">
          </div>
          <div>
            <label class="label">Pack Unit</label>
            <select class="input" name="pack_unit">${unitOptions}</select>
          </div>
        </div>

        <div class="grid-2">
          <div>
            <label class="label">Cost Price (₹)</label>
            <input class="input" name="cost" type="number" step="any" min="0" value="${v.cost || 0}">
          </div>
          <div>
            <label class="label">MRP (₹)</label>
            <input class="input" name="mrp" type="number" step="any" min="0" value="${v.mrp || 0}" id="vf-mrp">
          </div>
        </div>

        <div>
          <label class="label">Selling Price (₹)</label>
          <input class="input" name="selling_price" type="number" step="any" min="0" value="${v.selling_price || 0}" id="vf-sp">
          <div class="field-hint">Defaults to MRP if left at 0</div>
        </div>

        ${isBatchManaged ? `
          <div style="padding:12px 16px;background:var(--primary-light);border-radius:var(--radius-md);border:1px solid var(--primary);font-size:12px;">
            <b style="color:var(--primary);">📦 Batch-managed</b>
            <div class="text-muted" style="margin-top:4px;">Stock comes from batches. ${isEdit ? 'Currently ' + variantBatchCount(existing) + ' batch(es).' : 'Add batches after saving this variant.'}</div>
          </div>
        ` : `
          <div>
            <label class="label">Stock ${isEdit ? '' : '(initial)'}</label>
            <input class="input" name="stock" type="number" step="any" min="0" value="${v.stock || 0}">
            <div class="field-hint">Non-batch product — stock is editable here</div>
          </div>
        `}

        <div>
          <label class="label">Low Stock Alert at</label>
          <input class="input" name="low_stock_alert" type="number" step="any" min="0" value="${v.low_stock_alert || 0}">
          <div class="field-hint">Warn me when stock drops to this level</div>
        </div>

        <div>
          <label class="label">Notes</label>
          <textarea class="input" name="notes" placeholder="Optional">${esc(v.notes || '')}</textarea>
        </div>

      </form>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="vf-save">${isEdit ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    const mrpEl = root.querySelector('#vf-mrp');
    const spEl = root.querySelector('#vf-sp');
    if (mrpEl && spEl) {
      mrpEl.addEventListener('input', () => {
        if (!spEl.value || Number(spEl.value) === 0) spEl.value = mrpEl.value;
      });
    }

    const nameInput = root.querySelector('[name="shade_name"]');
    if (nameInput) nameInput.focus();

    root.querySelector('#vf-save').onclick = async () => {
      const form = root.querySelector('#vf');
      if (!form.reportValidity()) return;

      const fd = new FormData(form);
      const shadeName = (fd.get('shade_name') || '').trim();
      const shadeCode = (fd.get('shade_code') || '').trim();
      const packSize  = Number(fd.get('pack_size'));
      const packUnit  = fd.get('pack_unit') || 'L';

      if (!shadeName) { toast('Shade name is required', 'error'); return; }
      if (!packSize || packSize <= 0) { toast('Pack size must be greater than 0', 'error'); return; }

      const dup = DB.variants.find(x =>
        x.product_id === product.id &&
        (x.shade_name || '').toLowerCase() === shadeName.toLowerCase() &&
        Number(x.pack_size) === packSize &&
        (x.pack_unit || 'L') === packUnit &&
        (!existing || x.id !== existing.id)
      );
      if (dup) {
        toast('A variant with this shade + size already exists', 'error');
        return;
      }

      const data = {
        product_id:      product.id,
        shade_name:      shadeName,
        shade_code:      shadeCode,
        pack_size:       packSize,
        pack_unit:       packUnit,
        cost:            Number(fd.get('cost')) || 0,
        mrp:             Number(fd.get('mrp')) || 0,
        selling_price:   Number(fd.get('selling_price')) || Number(fd.get('mrp')) || 0,
        low_stock_alert: Number(fd.get('low_stock_alert')) || 0,
        notes:           (fd.get('notes') || '').trim()
      };
      if (!isBatchManaged) data.stock = Number(fd.get('stock')) || 0;

      const btn = root.querySelector('#vf-save');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      let res;
      if (isEdit) res = await sb.from('variants').update(data).eq('id', existing.id).select().single();
      else        res = await sb.from('variants').insert(data).select().single();

      if (res.error) {
        console.error(res.error);
        toast('Failed to save variant: ' + (res.error.message || 'unknown'), 'error');
        btn.disabled = false;
        btn.textContent = isEdit ? 'Update' : 'Save';
        return;
      }

      await syncDB();
      toast(isEdit ? 'Variant updated' : 'Variant added', 'success');
      closeModal(root);
      route();
    };
  });
}

/* ─────────────────────────────────────────────
   6.5 BULK ADD VARIANTS
   ───────────────────────────────────────────── */
function openBulkVariantForm(product) {
  const isBatchManaged = product.batch_managed !== false;

  let rows = [
    { size: '', unit: product.unit_base || 'L', cost: '', mrp: '', sell: '' },
    { size: '', unit: product.unit_base || 'L', cost: '', mrp: '', sell: '' },
    { size: '', unit: product.unit_base || 'L', cost: '', mrp: '', sell: '' }
  ];

  openModal(`
    <div class="modal-header">
      <div>
        <div class="modal-title">Bulk Add Variants</div>
        <div class="text-xs text-muted" style="margin-top:2px;">Same shade, multiple sizes — for <b>${esc(product.name)}</b></div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <div class="grid-2" style="margin-bottom:20px;">
        <div>
          <label class="label">Shade Name *</label>
          <input class="input" id="bulk-shade-name" placeholder="e.g. Ivory White" autofocus>
        </div>
        <div>
          <label class="label">Shade Code</label>
          <input class="input" id="bulk-shade-code" placeholder="e.g. 1012">
        </div>
      </div>

      <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
        <label class="label" style="margin:0;">Sizes & Prices</label>
        <button type="button" class="btn btn-ghost btn-sm" id="bulk-add-row" style="font-size:12px;">+ Add Row</button>
      </div>

      <div id="bulk-rows"></div>

      <div class="field-hint" style="margin-top:12px;">
        Each row creates one variant. Empty rows are skipped.
        ${isBatchManaged ? 'Stock will be 0 until batches are added.' : 'Initial stock is 0 — edit after saving.'}
      </div>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="bulk-save">Save <span id="bulk-count">3</span> Variants</button>
    </div>
  `, (root) => {
    function renderRows() {
      const container = root.querySelector('#bulk-rows');
      container.innerHTML = rows.map((r, i) => `
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px;background:var(--bg-app);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;">
          <input class="input" type="number" step="any" min="0.01" data-i="${i}" data-f="size" placeholder="Size" value="${esc(r.size)}" style="flex:1;min-width:70px;">
          <select class="input" data-i="${i}" data-f="unit" style="flex:1;min-width:70px;">
            ${PACK_UNITS.map(u => `<option value="${esc(u)}" ${r.unit === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}
          </select>
          <input class="input" type="number" step="any" min="0" data-i="${i}" data-f="cost" placeholder="Cost ₹" value="${esc(r.cost)}" style="flex:1;min-width:80px;">
          <input class="input" type="number" step="any" min="0" data-i="${i}" data-f="mrp" placeholder="MRP ₹" value="${esc(r.mrp)}" style="flex:1;min-width:80px;">
          <input class="input" type="number" step="any" min="0" data-i="${i}" data-f="sell" placeholder="Sell ₹" value="${esc(r.sell)}" style="flex:1;min-width:80px;">
          <button type="button" class="btn btn-ghost btn-sm" data-remove="${i}" style="color:var(--danger);padding:0 8px;">✕</button>
        </div>
      `).join('');

      container.querySelectorAll('input, select').forEach(el => {
        el.oninput = el.onchange = () => {
          const i = Number(el.dataset.i);
          rows[i][el.dataset.f] = el.value;
        };
      });

      container.querySelectorAll('[data-remove]').forEach(btn => {
        btn.onclick = () => {
          const i = Number(btn.dataset.remove);
          if (rows.length <= 1) { toast('At least one row required', 'error'); return; }
          rows.splice(i, 1);
          renderRows();
        };
      });

      const cntEl = root.querySelector('#bulk-count');
      if (cntEl) cntEl.textContent = rows.length;
    }

    renderRows();

    root.querySelector('#bulk-add-row').onclick = () => {
      rows.push({ size: '', unit: product.unit_base || 'L', cost: '', mrp: '', sell: '' });
      renderRows();
    };

    root.querySelector('#bulk-save').onclick = async () => {
      const shadeName = (root.querySelector('#bulk-shade-name').value || '').trim();
      const shadeCode = (root.querySelector('#bulk-shade-code').value || '').trim();

      if (!shadeName) { toast('Shade name is required', 'error'); return; }

      const valid = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r.size || r.size === '') continue;
        const size = Number(r.size);
        if (!size || size <= 0) {
          toast(`Row ${i + 1}: enter a valid pack size`, 'error');
          return;
        }
        valid.push({
          product_id:      product.id,
          shade_name:      shadeName,
          shade_code:      shadeCode,
          pack_size:       size,
          pack_unit:       r.unit || product.unit_base || 'L',
          cost:            Number(r.cost) || 0,
          mrp:             Number(r.mrp) || 0,
          selling_price:   Number(r.sell) || Number(r.mrp) || 0,
          stock:           0,
          low_stock_alert: product.low_stock_alert || SETTINGS.low_stock_alert_default || 5,
          notes:           ''
        });
      }

      if (valid.length === 0) { toast('Add at least one size', 'error'); return; }

      for (let i = 0; i < valid.length; i++) {
        for (let j = i + 1; j < valid.length; j++) {
          if (valid[i].pack_size === valid[j].pack_size && valid[i].pack_unit === valid[j].pack_unit) {
            toast(`Rows ${i + 1} and ${j + 1} have the same size+unit`, 'error');
            return;
          }
        }
      }

      const dbDup = valid.find(nv =>
        DB.variants.find(ex =>
          ex.product_id === product.id &&
          (ex.shade_name || '').toLowerCase() === shadeName.toLowerCase() &&
          Number(ex.pack_size) === nv.pack_size &&
          (ex.pack_unit || 'L') === nv.pack_unit
        )
      );
      if (dbDup) {
        toast(`Variant "${shadeName} ${dbDup.pack_size}${dbDup.pack_unit}" already exists`, 'error');
        return;
      }

      const btn = root.querySelector('#bulk-save');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      const { error } = await sb.from('variants').insert(valid);

      if (error) {
        console.error(error);
        toast('Failed to save variants: ' + (error.message || 'unknown'), 'error');
        btn.disabled = false;
        btn.innerHTML = `Save <span id="bulk-count">${rows.length}</span> Variants`;
        return;
      }

      await syncDB();
      toast(`Added ${valid.length} variant${valid.length === 1 ? '' : 's'}`, 'success');
      closeModal(root);
      route();
    };
  });
}

/* ─────────────────────────────────────────────
   6.6 DELETE VARIANT
   ───────────────────────────────────────────── */
async function deleteVariant(variantId) {
  const v = DB.variants.find(x => x.id === variantId);
  if (!v) return;

  const batchCount = variantBatchCount(v);

  let msg = `Delete variant "${v.shade_name || '—'} · ${fmtNum(v.pack_size)}${v.pack_unit || ''}"?`;
  if (batchCount > 0) {
    msg += `\n\n⚠️ ${batchCount} batch${batchCount === 1 ? '' : 'es'} will also be deleted (with all their stock).`;
  }
  msg += '\n\nThis cannot be undone.';

  if (!confirmDlg(msg, 'Confirm Delete')) return;

  const { error } = await sb.from('variants').delete().eq('id', variantId);
  if (error) {
    console.error(error);
    toast('Failed to delete variant: ' + (error.message || 'unknown'), 'error');
    return;
  }

  await syncDB();
  toast('Variant deleted', 'success');
  route();
}

/* ─────────────────────────────────────────────
   6.7 OVERRIDE renderProducts (adds Variants button)
   ───────────────────────────────────────────── */
function renderProducts(content) {
  const list = DB.products;
  const categories = [...new Set(list.map(p => p.category).filter(Boolean))].sort();
  const brands = DB.brands;

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Products</h1>
        <p>${list.length} product line${list.length === 1 ? '' : 's'} · Click <b>Variants</b> to manage shades and sizes</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="add-product">+ Add Product</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;border-radius:16px;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="p-search" placeholder="Product name, brand or category...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Brand</label>
        <select class="input" id="p-brand">
          <option value="">All brands</option>
          <option value="__none__">Unassigned</option>
          ${brands.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Category</label>
        <select class="input" id="p-cat">
          <option value="">All</option>
          ${categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Type</label>
        <select class="input" id="p-type">
          <option value="">All</option>
          <option value="batch">Batch-managed</option>
          <option value="nonbatch">Non-batch</option>
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Sort</label>
        <select class="input" id="p-sort">
          <option value="name">Name (A–Z)</option>
          <option value="name-desc">Name (Z–A)</option>
          <option value="variants-desc">Most variants</option>
          <option value="stock-desc">Stock value (high)</option>
          <option value="newest">Newest first</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Category</th>
            <th>Unit</th>
            <th style="text-align:right">Variants</th>
            <th style="text-align:right">Stock</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="p-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="p-mobile"></div>
  `;

  function filtered() {
    const q       = ($('#p-search').value || '').toLowerCase().trim();
    const brandId = $('#p-brand').value;
    const cat     = $('#p-cat').value;
    const type    = $('#p-type').value;
    const sortBy  = $('#p-sort').value;

    let arr = list.filter(p => {
      const brand = DB.brands.find(b => b.id === p.brand_id);
      const hay = ((p.name || '') + ' ' + (p.category || '') + ' ' + (brand && brand.name ? brand.name : '')).toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (brandId === '__none__' && p.brand_id) return false;
      if (brandId && brandId !== '__none__' && p.brand_id !== brandId) return false;
      if (cat && p.category !== cat) return false;
      if (type === 'batch' && p.batch_managed !== true) return false;
      if (type === 'nonbatch' && p.batch_managed !== false) return false;
      return true;
    });

    arr = arr.map(p => ({
      ...p,
      _variantCount: productVariantCount(p),
      _stockQty:     productStockQty(p),
      _stockValue:   productStockValue(p)
    }));

    if (sortBy === 'name')               arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortBy === 'name-desc')     arr.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    else if (sortBy === 'variants-desc') arr.sort((a, b) => b._variantCount - a._variantCount);
    else if (sortBy === 'stock-desc')    arr.sort((a, b) => b._stockValue - a._stockValue);
    else if (sortBy === 'newest')        arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return arr;
  }

  function renderList() {
    const arr = filtered();

    const tbody = $('#p-body');
    if (tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">
             ${list.length === 0
               ? 'No products yet — click <b>+ Add Product</b> to create your first one.'
               : 'No products match your filters.'}
           </td></tr>`
        : arr.map(p => {
            const brand = DB.brands.find(b => b.id === p.brand_id);
            const isBatch = p.batch_managed !== false;
            return `<tr>
              <td>
                <div style="font-weight:600;color:var(--text-main);">${esc(p.name)}</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
                  ${brand
                    ? `<span class="chip chip-primary" style="font-size:9px;">🏷️ ${esc(brand.name)}</span>`
                    : `<span class="chip chip-neutral" style="font-size:9px;">No brand</span>`}
                  ${isBatch
                    ? `<span class="chip chip-success" style="font-size:9px;">BATCH</span>`
                    : `<span class="chip chip-neutral" style="font-size:9px;">NON-BATCH</span>`}
                </div>
              </td>
              <td><span class="chip chip-neutral">${esc(p.category || '—')}</span></td>
              <td class="text-sm text-muted">${esc(p.unit_base || '—')}</td>
              <td style="text-align:right;">
                <span class="chip ${p._variantCount > 0 ? 'chip-primary' : 'chip-neutral'}" style="cursor:pointer;" onclick="location.hash='#/product/${p.id}/variants'">
                  ${p._variantCount} SKU${p._variantCount === 1 ? '' : 's'}
                </span>
              </td>
              <td style="text-align:right;">
                <div style="font-weight:600;color:var(--text-main);">${fmtNum(p._stockQty)} ${esc(p.unit_base || '')}</div>
                <div class="text-xs text-muted" style="margin-top:2px;">${rs(p._stockValue)}</div>
              </td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" data-variants="${p.id}">Variants</button>
                <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
                <button class="btn btn-ghost btn-sm" data-del="${p.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('');
    }

    const mob = $('#p-mobile');
    if (mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">🎨</div>
             <div class="empty-title">${list.length === 0 ? 'No products yet' : 'No matches'}</div>
             <div class="empty-desc">${list.length === 0
               ? 'Tap "+ Add Product" above to create your first one.'
               : 'Try a different search or filter.'}</div>
           </div>`
        : arr.map(p => {
            const brand = DB.brands.find(b => b.id === p.brand_id);
            const isBatch = p.batch_managed !== false;
            return `
              <div class="mobile-card">
                <div class="mobile-card-head">
                  <div style="min-width:0;flex:1;">
                    <div class="mobile-card-title">${esc(p.name)}</div>
                    <div class="mobile-card-sub">${brand ? esc(brand.name) : 'No brand'} · ${esc(p.category || '—')}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
                      ${isBatch
                        ? `<span class="chip chip-success" style="font-size:9px;">BATCH</span>`
                        : `<span class="chip chip-neutral" style="font-size:9px;">NON-BATCH</span>`}
                      <span class="chip ${p._variantCount > 0 ? 'chip-primary' : 'chip-neutral'}" style="font-size:9px;cursor:pointer;" onclick="location.hash='#/product/${p.id}/variants'">${p._variantCount} SKU${p._variantCount === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                  <div style="text-align:right;flex-shrink:0;">
                    <div style="font-weight:700;">${fmtNum(p._stockQty)} ${esc(p.unit_base || '')}</div>
                    <div class="text-xs text-muted" style="margin-top:2px;">${rs(p._stockValue)}</div>
                  </div>
                </div>
                <div class="mobile-card-foot">
                  <div class="text-xs text-muted">Low alert: ${p.low_stock_alert || 0}</div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="btn btn-ghost btn-sm" data-variants="${p.id}">Variants</button>
                    <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
                    <button class="btn btn-ghost btn-sm" data-del="${p.id}" style="color:var(--danger);">Del</button>
                  </div>
                </div>
              </div>
            `;
          }).join('');
    }

    $$('[data-variants]').forEach(btn => btn.onclick = () => {
      location.hash = '#/product/' + btn.dataset.variants + '/variants';
    });

    $$('[data-edit]').forEach(btn => btn.onclick = () => {
      const p = DB.products.find(x => x.id === btn.dataset.edit);
      if (p) openProductForm(p);
    });

    $$('[data-del]').forEach(btn => btn.onclick = () => deleteProduct(btn.dataset.del));
  }

  $('#p-search').oninput = renderList;
  ['p-brand', 'p-cat', 'p-type', 'p-sort'].forEach(id => {
    const el = $('#' + id);
    if (el) el.onchange = renderList;
  });

  $('#add-product').onclick = () => openProductForm();

  renderList();
}
     
    // Theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Show spinner while auth resolves
    const app = $('#app');
    if (app) {
      app.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;"><div class="spinner"></div><div style="color:var(--text-muted);font-size:14px;">Connecting...</div></div>';
    }

    await initAuth();

    if (SESSION) {
      await syncDB();
    }

    await route();

    console.log('[PaintBook] Boot complete · ' + APP_VERSION);
  } catch (err) {
    console.error('[boot] fatal:', err);
    const app = $('#app');
    if (app) {
      app.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;">
          <div>
            <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
            <div style="font-size:18px;font-weight:700;margin-bottom:6px;">Could not start</div>
            <div class="text-sm text-muted" style="max-width:400px;margin:0 auto 16px;">${esc(err.message || String(err))}</div>
            <button class="btn btn-primary" onclick="location.reload()">Try Again</button>
          </div>
        </div>
      `;
    }
  }
})();
/* ─────────────────────────────────────────────
   19b. BRANDS — FULL CRUD (Step 4)
   ───────────────────────────────────────────── */
function renderBrands(content) {
  const list = DB.brands;

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Brands</h1>
        <p>${list.length} brand${list.length === 1 ? '' : 's'} · Asian Paints, Berger, Nerolac, Dulux and more</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="add-brand">+ Add Brand</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;border-radius:16px;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="b-search" placeholder="Brand name...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Sort</label>
        <select class="input" id="b-sort">
          <option value="name">Name (A–Z)</option>
          <option value="name-desc">Name (Z–A)</option>
          <option value="products-desc">Most products</option>
          <option value="newest">Newest first</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Brand</th>
            <th>Notes</th>
            <th style="text-align:right">Products</th>
            <th>Added</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="b-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="b-mobile"></div>
  `;

  function getProductCount(brandId) {
    return DB.products.filter(p => p.brand_id === brandId).length;
  }

  function filtered() {
    const q = ($('#b-search').value || '').toLowerCase().trim();
    const sortBy = $('#b-sort').value;

    let arr = list.filter(b => {
      if (q && !(b.name || '').toLowerCase().includes(q)) return false;
      return true;
    });

    arr = arr.map(b => ({ ...b, _productCount: getProductCount(b.id) }));

    if (sortBy === 'name')               arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortBy === 'name-desc')     arr.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    else if (sortBy === 'products-desc') arr.sort((a, b) => b._productCount - a._productCount);
    else if (sortBy === 'newest')        arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return arr;
  }

  function renderList() {
    const arr = filtered();

    // Desktop table
    const tbody = $('#b-body');
    if (tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted);">
             ${list.length === 0
               ? 'No brands yet — click <b>+ Add Brand</b> to create your first one.'
               : 'No brands match your search.'}
           </td></tr>`
        : arr.map(b => {
            const init = (b.name || 'B').charAt(0).toUpperCase();
            return `<tr>
              <td>
                <div style="display:flex;align-items:center;gap:12px;">
                  <div class="table-avatar" style="margin:0;background:var(--primary-light);color:var(--primary);">${esc(init)}</div>
                  <div>
                    <div style="font-weight:600;color:var(--text-main);">${esc(b.name)}</div>
                    <div class="text-xs text-muted" style="margin-top:2px;font-family:monospace;">${esc(String(b.id).slice(0, 8))}</div>
                  </div>
                </div>
              </td>
              <td class="text-sm text-muted">${esc(b.notes || '—')}</td>
              <td style="text-align:right;">
                <span class="chip ${b._productCount > 0 ? 'chip-primary' : 'chip-neutral'}">${b._productCount}</span>
              </td>
              <td class="text-sm text-muted">${fmtDate(b.created_at)}</td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" data-edit="${b.id}">Edit</button>
                <button class="btn btn-ghost btn-sm" data-del="${b.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('');
    }

    // Mobile cards
    const mob = $('#b-mobile');
    if (mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">🏷️</div>
             <div class="empty-title">${list.length === 0 ? 'No brands yet' : 'No matches'}</div>
             <div class="empty-desc">${list.length === 0
               ? 'Tap "+ Add Brand" above to create your first one.'
               : 'Try a different search.'}</div>
           </div>`
        : arr.map(b => {
            const init = (b.name || 'B').charAt(0).toUpperCase();
            return `
              <div class="mobile-card">
                <div class="mobile-card-head">
                  <div style="display:flex;gap:12px;align-items:center;">
                    <div class="table-avatar" style="margin:0;background:var(--primary-light);color:var(--primary);">${esc(init)}</div>
                    <div>
                      <div class="mobile-card-title">${esc(b.name)}</div>
                      <div class="mobile-card-sub">${esc(b.notes || 'No notes')}</div>
                    </div>
                  </div>
                  <span class="chip ${b._productCount > 0 ? 'chip-primary' : 'chip-neutral'}">${b._productCount} prod</span>
                </div>
                <div class="mobile-card-foot">
                  <div class="text-xs text-muted">${fmtDate(b.created_at)}</div>
                  <div style="display:flex;gap:8px;">
                    <button class="btn btn-ghost btn-sm" data-edit="${b.id}">Edit</button>
                    <button class="btn btn-ghost btn-sm" data-del="${b.id}" style="color:var(--danger);">Delete</button>
                  </div>
                </div>
              </div>
            `;
          }).join('');
    }

    // Bind
    $$('[data-edit]').forEach(btn => btn.onclick = () => {
      const b = DB.brands.find(x => x.id === btn.dataset.edit);
      if (b) openBrandForm(b);
    });

    $$('[data-del]').forEach(btn => btn.onclick = () => deleteBrand(btn.dataset.del));
  }

  $('#b-search').oninput = renderList;
  $('#b-sort').onchange = renderList;
  $('#add-brand').onclick = () => openBrandForm();

  renderList();
}

async function deleteBrand(id) {
  const b = DB.brands.find(x => x.id === id);
  if (!b) return;

  const productCount = DB.products.filter(p => p.brand_id === id).length;

  let msg = `Delete brand "${b.name}"?`;
  if (productCount > 0) {
    msg += `\n\n⚠️ ${productCount} product line${productCount === 1 ? '' : 's'} currently use this brand.\nThey will keep working but lose the brand link.`;
  }
  msg += '\n\nThis cannot be undone.';

  if (!confirmDlg(msg, 'Confirm Delete')) return;

  const { error } = await sb.from('brands').delete().eq('id', id);
  if (error) {
    console.error(error);
    toast('Failed to delete brand.', 'error');
    return;
  }

  await syncDB();
  toast('Brand deleted', 'success');
  route();
}

function openBrandForm(existing) {
  const b = existing || { name: '', notes: '' };

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${existing ? 'Edit' : 'New'} Brand</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <form id="bf" style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <label class="label">Brand Name *</label>
          <input class="input" name="name" required value="${esc(b.name || '')}" placeholder="e.g. Asian Paints" autofocus>
        </div>
        <div>
          <label class="label">Notes</label>
          <textarea class="input" name="notes" placeholder="Optional — any internal notes about this brand">${esc(b.notes || '')}</textarea>
        </div>
      </form>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="bf-save">${existing ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    const nameInput = root.querySelector('[name="name"]');
    if (nameInput) {
      nameInput.focus();
      // Enter key submits
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          root.querySelector('#bf-save').click();
        }
      });
    }

    root.querySelector('#bf-save').onclick = async () => {
      const form = root.querySelector('#bf');
      if (!form.reportValidity()) return;

      const fd = new FormData(form);
      const name = (fd.get('name') || '').trim();
      const notes = (fd.get('notes') || '').trim();

      if (!name) {
        toast('Brand name is required', 'error');
        return;
      }

      // Duplicate name check (case-insensitive)
      const dup = DB.brands.find(x =>
        (x.name || '').toLowerCase() === name.toLowerCase() &&
        (!existing || x.id !== existing.id)
      );
      if (dup) {
        toast('A brand with this name already exists', 'error');
        return;
      }

      const btn = root.querySelector('#bf-save');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      const data = { name, notes };

      let res;
      if (existing) {
        res = await sb.from('brands').update(data).eq('id', existing.id).select().single();
      } else {
        res = await sb.from('brands').insert(data).select().single();
      }

      if (res.error) {
        console.error(res.error);
        toast('Failed to save brand: ' + (res.error.message || 'unknown error'), 'error');
        btn.disabled = false;
        btn.textContent = existing ? 'Update' : 'Save';
        return;
      }

      await syncDB();
      toast(existing ? 'Brand updated' : 'Brand added', 'success');
      closeModal(root);
      route();
    };
  });
}
/* ─────────────────────────────────────────────
   19c. PRODUCTS — FULL CRUD (Step 5)
   ───────────────────────────────────────────── */
function productVariantCount(p) {
  return DB.variants.filter(v => v.product_id === p.id).length;
}

function productStockQty(p) {
  return DB.variants
    .filter(v => v.product_id === p.id)
    .reduce((s, v) => s + (Number(v.stock) || 0), 0);
}

function productStockValue(p) {
  return DB.variants
    .filter(v => v.product_id === p.id)
    .reduce((s, v) => s + (Number(v.stock) || 0) * (Number(v.cost) || 0), 0);
}

function productBatchCount(p) {
  const variantIds = new Set(DB.variants.filter(v => v.product_id === p.id).map(v => v.id));
  return DB.product_batches.filter(b => variantIds.has(b.variant_id)).length;
}

function renderProducts(content) {
  const list = DB.products;
  const categories = [...new Set(list.map(p => p.category).filter(Boolean))].sort();
  const brands = DB.brands;

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Products</h1>
        <p>${list.length} product line${list.length === 1 ? '' : 's'} · Manage shades and pack sizes via variants</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="add-product">+ Add Product</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;border-radius:16px;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="p-search" placeholder="Product name, brand or category...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Brand</label>
        <select class="input" id="p-brand">
          <option value="">All brands</option>
          <option value="__none__">Unassigned</option>
          ${brands.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Category</label>
        <select class="input" id="p-cat">
          <option value="">All</option>
          ${categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Type</label>
        <select class="input" id="p-type">
          <option value="">All</option>
          <option value="batch">Batch-managed</option>
          <option value="nonbatch">Non-batch</option>
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Sort</label>
        <select class="input" id="p-sort">
          <option value="name">Name (A–Z)</option>
          <option value="name-desc">Name (Z–A)</option>
          <option value="variants-desc">Most variants</option>
          <option value="stock-desc">Stock value (high)</option>
          <option value="newest">Newest first</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Category</th>
            <th>Unit</th>
            <th style="text-align:right">Variants</th>
            <th style="text-align:right">Stock</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="p-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="p-mobile"></div>
  `;

  function filtered() {
    const q       = ($('#p-search').value || '').toLowerCase().trim();
    const brandId = $('#p-brand').value;
    const cat     = $('#p-cat').value;
    const type    = $('#p-type').value;
    const sortBy  = $('#p-sort').value;

    let arr = list.filter(p => {
      const brand = DB.brands.find(b => b.id === p.brand_id);
      const hay = ((p.name || '') + ' ' + (p.category || '') + ' ' + (brand && brand.name ? brand.name : '')).toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (brandId === '__none__' && p.brand_id) return false;
      if (brandId && brandId !== '__none__' && p.brand_id !== brandId) return false;
      if (cat && p.category !== cat) return false;
      if (type === 'batch' && p.batch_managed !== true) return false;
      if (type === 'nonbatch' && p.batch_managed !== false) return false;
      return true;
    });

    arr = arr.map(p => ({
      ...p,
      _variantCount: productVariantCount(p),
      _stockQty:     productStockQty(p),
      _stockValue:   productStockValue(p)
    }));

    if (sortBy === 'name')               arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortBy === 'name-desc')     arr.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    else if (sortBy === 'variants-desc') arr.sort((a, b) => b._variantCount - a._variantCount);
    else if (sortBy === 'stock-desc')    arr.sort((a, b) => b._stockValue - a._stockValue);
    else if (sortBy === 'newest')        arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return arr;
  }

  function renderList() {
    const arr = filtered();

    // Desktop table
    const tbody = $('#p-body');
    if (tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">
             ${list.length === 0
               ? 'No products yet — click <b>+ Add Product</b> to create your first one.'
               : 'No products match your filters.'}
           </td></tr>`
        : arr.map(p => {
            const brand = DB.brands.find(b => b.id === p.brand_id);
            const isBatch = p.batch_managed !== false;
            return `<tr>
              <td>
                <div style="font-weight:600;color:var(--text-main);">${esc(p.name)}</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
                  ${brand
                    ? `<span class="chip chip-primary" style="font-size:9px;">🏷️ ${esc(brand.name)}</span>`
                    : `<span class="chip chip-neutral" style="font-size:9px;">No brand</span>`}
                  ${isBatch
                    ? `<span class="chip chip-success" style="font-size:9px;">BATCH</span>`
                    : `<span class="chip chip-neutral" style="font-size:9px;">NON-BATCH</span>`}
                </div>
              </td>
              <td><span class="chip chip-neutral">${esc(p.category || '—')}</span></td>
              <td class="text-sm text-muted">${esc(p.unit_base || '—')}</td>
              <td style="text-align:right;">
                <span class="chip ${p._variantCount > 0 ? 'chip-primary' : 'chip-neutral'}">
                  ${p._variantCount} SKU${p._variantCount === 1 ? '' : 's'}
                </span>
              </td>
              <td style="text-align:right;">
                <div style="font-weight:600;color:var(--text-main);">${fmtNum(p._stockQty)} ${esc(p.unit_base || '')}</div>
                <div class="text-xs text-muted" style="margin-top:2px;">${rs(p._stockValue)}</div>
              </td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
                <button class="btn btn-ghost btn-sm" data-del="${p.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('');
    }

    // Mobile cards
    const mob = $('#p-mobile');
    if (mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">🎨</div>
             <div class="empty-title">${list.length === 0 ? 'No products yet' : 'No matches'}</div>
             <div class="empty-desc">${list.length === 0
               ? 'Tap "+ Add Product" above to create your first one.'
               : 'Try a different search or filter.'}</div>
           </div>`
        : arr.map(p => {
            const brand = DB.brands.find(b => b.id === p.brand_id);
            const isBatch = p.batch_managed !== false;
            return `
              <div class="mobile-card">
                <div class="mobile-card-head">
                  <div style="min-width:0;flex:1;">
                    <div class="mobile-card-title">${esc(p.name)}</div>
                    <div class="mobile-card-sub">${brand ? esc(brand.name) : 'No brand'} · ${esc(p.category || '—')}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
                      ${isBatch
                        ? `<span class="chip chip-success" style="font-size:9px;">BATCH</span>`
                        : `<span class="chip chip-neutral" style="font-size:9px;">NON-BATCH</span>`}
                      <span class="chip ${p._variantCount > 0 ? 'chip-primary' : 'chip-neutral'}" style="font-size:9px;">${p._variantCount} SKU${p._variantCount === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                  <div style="text-align:right;flex-shrink:0;">
                    <div style="font-weight:700;">${fmtNum(p._stockQty)} ${esc(p.unit_base || '')}</div>
                    <div class="text-xs text-muted" style="margin-top:2px;">${rs(p._stockValue)}</div>
                  </div>
                </div>
                <div class="mobile-card-foot">
                  <div class="text-xs text-muted">Low alert: ${p.low_stock_alert || 0}</div>
                  <div style="display:flex;gap:8px;">
                    <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
                    <button class="btn btn-ghost btn-sm" data-del="${p.id}" style="color:var(--danger);">Delete</button>
                  </div>
                </div>
              </div>
            `;
          }).join('');
    }

    // Bind
    $$('[data-edit]').forEach(btn => btn.onclick = () => {
      const p = DB.products.find(x => x.id === btn.dataset.edit);
      if (p) openProductForm(p);
    });

    $$('[data-del]').forEach(btn => btn.onclick = () => deleteProduct(btn.dataset.del));
  }

  $('#p-search').oninput = renderList;
  ['p-brand', 'p-cat', 'p-type', 'p-sort'].forEach(id => {
    const el = $('#' + id);
    if (el) el.onchange = renderList;
  });

  $('#add-product').onclick = () => openProductForm();

  renderList();
}

async function deleteProduct(id) {
  const p = DB.products.find(x => x.id === id);
  if (!p) return;

  const vCount = productVariantCount(p);
  const bCount = productBatchCount(p);

  let msg = `Delete product "${p.name}"?`;
  if (vCount > 0 || bCount > 0) {
    msg += '\n\n⚠️ This will also delete:';
    if (vCount > 0) msg += `\n  • ${vCount} variant${vCount === 1 ? '' : 's'} (shades × pack sizes)`;
    if (bCount > 0) msg += `\n  • ${bCount} batch${bCount === 1 ? '' : 'es'} with stock`;
  }
  msg += '\n\nThis cannot be undone.';

  if (!confirmDlg(msg, 'Confirm Delete')) return;

  const { error } = await sb.from('products').delete().eq('id', id);
  if (error) {
    console.error(error);
    toast('Failed to delete product.', 'error');
    return;
  }

  await syncDB();
  toast('Product deleted', 'success');
  route();
}

function openProductForm(existing) {
  const isEdit = !!existing;
  const p = existing || {
    brand_id: null, name: '', category: 'Paint', unit_base: 'kg', // Default to kg
    batch_managed: true, gst_rate_default: 0, low_stock_alert: SETTINGS.low_stock_alert_default || 5, notes: ''
  };

  const brandOptions = DB.brands.length === 0
    ? `<option value="">— No brands yet —</option>`
    : `<option value="">— Select brand —</option>` +
      DB.brands.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(b => `<option value="${b.id}" ${p.brand_id === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');

  const catOptions = PRODUCT_CATEGORIES.map(c => `<option value="${esc(c)}" ${p.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const unitOptions = BASE_UNITS.map(u => `<option value="${esc(u)}" ${p.unit_base === u ? 'selected' : ''}>${esc(u)}</option>`).join('');
  const isBatchManaged = p.batch_managed !== false;

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'Edit' : 'Add'} Product</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <form id="pf" style="display:flex;flex-direction:column;gap:16px;">
        
        <div>
          <label class="label">Product Name *</label>
          <input class="input" name="name" required value="${esc(p.name || '')}" placeholder="e.g. Royale Luxury Emulsion or Paint Brush" autofocus>
        </div>

        <div class="grid-2">
          <div>
            <label class="label">Brand</label>
            <select class="input" name="brand_id">${brandOptions}</select>
          </div>
          <div>
            <label class="label">Category</label>
            <select class="input" name="category">${catOptions}</select>
          </div>
        </div>

        <label style="display:flex;align-items:center;justify-content:space-between;padding:14px;background:var(--bg-app);border-radius:8px;border:1px solid var(--border);cursor:pointer;">
          <div>
            <b style="font-size:13px;color:var(--text-main);">Track by Batch</b>
            <div class="field-hint" style="margin-top:2px;">Turn OFF for brushes, tapes, tools</div>
          </div>
          <input type="checkbox" name="batch_managed" id="pf-batch" ${isBatchManaged ? 'checked' : ''} ${isEdit ? 'disabled' : ''} style="width:20px;height:20px;accent-color:var(--primary);">
        </label>

        <div class="grid-2">
          <div>
            <label class="label">Base Unit (Weight/Volume)</label>
            <select class="input" name="unit_base" id="pf-unit">${unitOptions}</select>
          </div>
          <div>
            <label class="label">GST Rate (%)</label>
            <input class="input" type="number" step="any" min="0" name="gst_rate_default" value="${Number(p.gst_rate_default) || 0}">
          </div>
        </div>

        <!-- NON-BATCH PRICING (Shows instantly when toggle is off) -->
        <div id="pf-pricing-block" style="display:${isBatchManaged ? 'none' : 'block'};padding:16px;background:var(--primary-light);border-radius:8px;border:1px solid var(--primary);">
          <div style="font-size:12px;font-weight:700;color:var(--primary);margin-bottom:12px;text-transform:uppercase;">Pricing & Stock</div>
          
          <div class="grid-2" style="margin-bottom:12px;">
            <div>
              <label class="label">How many units in 1 Pack?</label>
              <input class="input" type="number" step="any" min="1" name="pack_size" id="pf-pack" value="1" placeholder="e.g. 10 (for a 10kg bucket)">
              <div class="field-hint">Leave 1 if selling loose (per kg)</div>
            </div>
            <div>
              <label class="label">Opening Stock (in Packs)</label>
              <input class="input" type="number" step="any" min="0" name="stock" id="pf-stock" value="0" placeholder="e.g. 10 buckets">
            </div>
          </div>

          <!-- Live Calculator -->
          <div id="pf-calc" style="display:none;background:#fff;padding:10px;border-radius:6px;font-size:12px;margin-bottom:12px;border:1px dashed var(--primary);font-weight:600;color:var(--text-main);">
            <!-- JS updates this -->
          </div>

          <div class="grid-2" style="margin-bottom:12px;">
            <div>
              <label class="label">Cost Price (₹ / Pack)</label>
              <input class="input" type="number" step="any" min="0" name="cost" value="0">
            </div>
            <div>
              <label class="label">Selling Price (₹ / Pack)</label>
              <input class="input" type="number" step="any" min="0" name="selling_price" value="0">
            </div>
          </div>
          <div class="grid-2">
             <div>
              <label class="label">MRP (₹ / Pack)</label>
              <input class="input" type="number" step="any" min="0" name="mrp" value="0">
            </div>
          </div>
        </div>

      </form>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="pf-save">${isEdit ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    const toggle = root.querySelector('#pf-batch');
    const block = root.querySelector('#pf-pricing-block');
    const packInput = root.querySelector('#pf-pack');
    const stockInput = root.querySelector('#pf-stock');
    const unitSelect = root.querySelector('#pf-unit');
    const calcBox = root.querySelector('#pf-calc');

    function updateCalculator() {
      const pack = Number(packInput.value) || 1;
      const packs = Number(stockInput.value) || 0;
      const unit = unitSelect.value;
      
      if (pack > 1 && packs > 0) {
        calcBox.style.display = 'block';
        calcBox.innerHTML = `Total base stock: <span style="color:var(--primary);font-size:14px;">${packs * pack} ${unit}</span> (${packs} packs × ${pack} ${unit})`;
      } else {
        calcBox.style.display = 'none';
      }
    }

    if (packInput) packInput.addEventListener('input', updateCalculator);
    if (stockInput) stockInput.addEventListener('input', updateCalculator);
    if (unitSelect) unitSelect.addEventListener('change', updateCalculator);

    if (toggle) {
      toggle.onchange = (e) => {
        block.style.display = e.target.checked ? 'none' : 'block';
      };
    }

    root.querySelector('#pf-save').onclick = async () => {
      const form = root.querySelector('#pf');
      if (!form.reportValidity()) return;

      const fd = new FormData(form);
      const isBatchNow = isEdit ? (existing.batch_managed !== false) : !!fd.get('batch_managed');
      const packSize = Number(fd.get('pack_size')) || 1;
      const stockPacks = Number(fd.get('stock')) || 0;
      const totalBaseStock = stockPacks * packSize;
      const baseUnit = fd.get('unit_base') || 'kg';

      const data = {
        name:             (fd.get('name') || '').trim(),
        brand_id:         fd.get('brand_id') || null,
        category:         fd.get('category') || 'Other',
        unit_base:        baseUnit,
        batch_managed:    isBatchNow,
        gst_rate_default: Number(fd.get('gst_rate_default')) || 0,
        low_stock_alert:  Number(fd.get('low_stock_alert')) || 5,
        notes:            (fd.get('notes') || '').trim()
      };

      const btn = root.querySelector('#pf-save');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      // 1. Save Product
      let res;
      if (isEdit) res = await sb.from('products').update(data).eq('id', existing.id).select().single();
      else        res = await sb.from('products').insert(data).select().single();

      if (res.error) {
        toast('Failed to save product', 'error');
        btn.disabled = false; btn.textContent = 'Save';
        return;
      }

      // 2. Auto-create hidden variant if NON-BATCH
      if (!isBatchNow && !isEdit) {
        await sb.from('variants').insert({
          product_id:      res.data.id,
          shade_name:      '',
          pack_size:       packSize,
          pack_unit:       baseUnit,
          conversion_factor: packSize, // Crucial for invoice deductions
          loose_unit:      baseUnit,
          cost:            Number(fd.get('cost')) || 0,
          mrp:             Number(fd.get('mrp')) || 0,
          selling_price:   Number(fd.get('selling_price')) || 0,
          stock:           totalBaseStock, // Save the calculated total (e.g. 100)
          low_stock_alert: data.low_stock_alert
        });
      }

      await syncDB();
      toast(isEdit ? 'Product updated' : 'Product added', 'success');
      closeModal(root);
      route();
    };
  });
}
/* ══════════════════════════════════════════════════════════════════
   STEP 7 — BATCHES  (manual stock entry for batch-managed variants)
   
   Paint-shop batch model:
   • Batch has MFG date (not expiry — paint doesn't expire like medicine)
   • Age matters: fresh / aging / old (old stock should move first = FIFO)
   • Each batch has its own cost / MRP / selling price (prices change over time)
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   7.1 BATCH AGE HELPER
   ───────────────────────────────────────────── */
function batchAge(mfgDate) {
  if (!mfgDate) {
    return { months: null, status: 'unknown', label: '—', cls: 'chip-neutral' };
  }
  const mfg = new Date(String(mfgDate).slice(0, 10));
  if (isNaN(mfg.getTime())) {
    return { months: null, status: 'unknown', label: '—', cls: 'chip-neutral' };
  }
  const now = new Date();
  const months = Math.floor((now - mfg) / (1000 * 60 * 60 * 24 * 30.44));

  if (months < 0) return { months, status: 'future', label: 'Future', cls: 'chip-warning' };
  if (months < 12) return { months, status: 'fresh', label: months + 'm', cls: 'chip-success' };
  if (months < 24) return { months, status: 'aging', label: months + 'm', cls: 'chip-warning' };
  return { months, status: 'old', label: Math.floor(months / 12) + 'y', cls: 'chip-danger' };
}

function renderBatchAgeBadge(mfgDate) {
  const info = batchAge(mfgDate);
  if (info.status === 'unknown') return '';
  return `<span class="chip ${info.cls}" style="font-size:10px;padding:2px 6px;">${esc(info.label)}</span>`;
}

/* ─────────────────────────────────────────────
   7.2 BATCHES LIST PAGE
   ───────────────────────────────────────────── */
function renderBatches(content) {
  const all = DB.product_batches;

  // Only products that are batch-managed can have batches
  const batchProducts = DB.products.filter(p => p.batch_managed !== false);

  // Helpers
  const getProduct = (variantId) => {
    const v = DB.variants.find(x => x.id === variantId);
    if (!v) return { variant: null, product: null };
    const p = DB.products.find(x => x.id === v.product_id);
    return { variant: v, product: p };
  };

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Batches</h1>
        <p>${all.length} batch${all.length === 1 ? '' : 'es'} · ${batchProducts.length} batch-managed product line${batchProducts.length === 1 ? '' : 's'}</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="add-batch">+ Add Batch</button>
      </div>
    </div>

    ${batchProducts.length === 0 ? `
      <div class="card" style="background:var(--warning-bg);border-color:var(--warning);margin-bottom:20px;border-radius:12px;box-shadow:none;">
        <div style="display:flex;gap:12px;align-items:flex-start;font-size:13px;">
          <span style="font-size:20px;">⚠️</span>
          <div>
            <b style="color:#92400e;">No batch-managed products yet</b>
            <div class="text-muted" style="margin-top:4px;line-height:1.5;">
              You need at least one <b>batch-managed</b> product line with a variant to create batches.
              Go to <a href="#/products" style="color:var(--primary);font-weight:600;">Products</a> and add one.
            </div>
          </div>
        </div>
      </div>
    ` : ''}

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;border-radius:16px;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="batch-search" placeholder="Batch no, shade or product name...">
      </div>
      <div style="flex:1;min-width:160px;">
        <label class="label">Product</label>
        <select class="input" id="batch-product">
          <option value="">All products</option>
          ${batchProducts
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map(p => `<option value="${p.id}">${esc(p.name)}</option>`)
            .join('')}
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Age</label>
        <select class="input" id="batch-age">
          <option value="">All ages</option>
          <option value="fresh">Fresh (&lt; 1y)</option>
          <option value="aging">Aging (1–2y)</option>
          <option value="old">Old (2y+)</option>
          <option value="empty">Empty (qty ≤ 0)</option>
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Sort</label>
        <select class="input" id="batch-sort">
          <option value="age-desc">Oldest first (FIFO)</option>
          <option value="age">Newest first</option>
          <option value="qty-desc">Qty (high)</option>
          <option value="qty">Qty (low)</option>
          <option value="product">Product (A–Z)</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Product · Shade</th>
            <th>Batch No</th>
            <th>MFG Date</th>
            <th style="text-align:right">Qty</th>
            <th style="text-align:right">Cost</th>
            <th style="text-align:right">MRP</th>
            <th style="text-align:right">Sell</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="batch-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="batch-mobile"></div>
  `;

  function filtered() {
    const q       = ($('#batch-search').value || '').toLowerCase().trim();
    const prodId  = $('#batch-product').value;
    const ageFlt  = $('#batch-age').value;
    const sortBy  = $('#batch-sort').value;

    let arr = all.map(b => {
      const { variant, product } = getProduct(b.variant_id);
      return {
        ...b,
        _variant: variant,
        _product: product,
        _age: batchAge(b.mfg_date)
      };
    });

    if (prodId) {
      arr = arr.filter(b => b._product && b._product.id === prodId);
    }

    if (q) {
      arr = arr.filter(b => {
        const hay = (
          (b.batch_no || '') + ' ' +
          (b._variant?.shade_name || '') + ' ' +
          (b._variant?.shade_code || '') + ' ' +
          (b._product?.name || '')
        ).toLowerCase();
        return hay.includes(q);
      });
    }

    if (ageFlt === 'fresh')      arr = arr.filter(b => b._age.status === 'fresh');
    else if (ageFlt === 'aging') arr = arr.filter(b => b._age.status === 'aging');
    else if (ageFlt === 'old')   arr = arr.filter(b => b._age.status === 'old');
    else if (ageFlt === 'empty') arr = arr.filter(b => Number(b.qty) <= 0);

    if (sortBy === 'age-desc') {
      arr.sort((a, b) => {
        const ad = a.mfg_date || '9999-12-31';
        const bd = b.mfg_date || '9999-12-31';
        return String(ad).localeCompare(String(bd));
      });
    } else if (sortBy === 'age') {
      arr.sort((a, b) => {
        const ad = a.mfg_date || '0000-01-01';
        const bd = b.mfg_date || '0000-01-01';
        return String(bd).localeCompare(String(ad));
      });
    } else if (sortBy === 'qty-desc') {
      arr.sort((a, b) => Number(b.qty || 0) - Number(a.qty || 0));
    } else if (sortBy === 'qty') {
      arr.sort((a, b) => Number(a.qty || 0) - Number(b.qty || 0));
    } else if (sortBy === 'product') {
      arr.sort((a, b) => {
        const an = (a._product?.name || '') + ' ' + (a._variant?.shade_name || '');
        const bn = (b._product?.name || '') + ' ' + (b._variant?.shade_name || '');
        return an.localeCompare(bn);
      });
    }

    return arr;
  }

  function renderList() {
    const arr = filtered();

    // Desktop table
    const tbody = $('#batch-body');
    if (tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">
             ${all.length === 0
               ? 'No batches yet — click <b>+ Add Batch</b> to record your first stock.'
               : 'No batches match your filters.'}
           </td></tr>`
        : arr.map(b => {
            const v = b._variant;
            const p = b._product;
            const ageBadge = renderBatchAgeBadge(b.mfg_date);
            const isEmpty = Number(b.qty) <= 0;
            const rowStyle = isEmpty ? 'style="opacity:0.55;"' : '';
            return `<tr ${rowStyle}>
              <td>
                <div style="font-weight:600;color:var(--text-main);">${esc(p?.name || '—')}</div>
                <div class="text-xs text-muted" style="margin-top:2px;">
                  ${v ? esc(v.shade_name || '—') + ' · ' + fmtNum(v.pack_size) + esc(v.pack_unit || '') : '—'}
                </div>
              </td>
              <td><span class="chip chip-neutral" style="font-family:monospace;font-size:11px;">${esc(b.batch_no || '—')}</span></td>
              <td>
                <div class="text-sm">${fmtDate(b.mfg_date)}</div>
                ${ageBadge ? `<div style="margin-top:3px;">${ageBadge}</div>` : ''}
              </td>
              <td style="text-align:right;font-weight:600;color:${isEmpty ? 'var(--text-light)' : 'var(--text-main)'};">
                ${fmtNum(b.qty)}
              </td>
              <td style="text-align:right;" class="text-sm text-muted">${rs(b.cost)}</td>
              <td style="text-align:right;" class="text-sm text-muted">${rs(b.mrp)}</td>
              <td style="text-align:right;font-weight:600;">${rs(b.selling_price || b.mrp)}</td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" data-edit-batch="${b.id}">Edit</button>
                <button class="btn btn-ghost btn-sm" data-del-batch="${b.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('');
    }

    // Mobile cards
    const mob = $('#batch-mobile');
    if (mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">📦</div>
             <div class="empty-title">${all.length === 0 ? 'No batches yet' : 'No matches'}</div>
             <div class="empty-desc">${all.length === 0
               ? 'Tap "+ Add Batch" above to record your first stock.'
               : 'Try a different search or filter.'}</div>
           </div>`
        : arr.map(b => {
            const v = b._variant;
            const p = b._product;
            const ageBadge = renderBatchAgeBadge(b.mfg_date);
            const isEmpty = Number(b.qty) <= 0;
            return `
              <div class="mobile-card" style="${isEmpty ? 'opacity:0.55;' : ''}">
                <div class="mobile-card-head">
                  <div style="min-width:0;flex:1;">
                    <div class="mobile-card-title">${esc(p?.name || '—')}</div>
                    <div class="mobile-card-sub">
                      ${v ? esc(v.shade_name || '—') + ' · ' + fmtNum(v.pack_size) + esc(v.pack_unit || '') : '—'}
                    </div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
                      <span class="chip chip-neutral" style="font-family:monospace;font-size:10px;">B: ${esc(b.batch_no || '—')}</span>
                      ${ageBadge}
                    </div>
                  </div>
                  <div style="text-align:right;flex-shrink:0;">
                    <div style="font-weight:700;font-size:15px;color:${isEmpty ? 'var(--text-light)' : 'var(--text-main)'};">${fmtNum(b.qty)}</div>
                    <div class="text-xs text-muted" style="margin-top:2px;">${esc(v?.pack_unit || '')}</div>
                  </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:11px;">
                  <div style="padding:8px;background:var(--bg-app);border-radius:6px;text-align:center;">
                    <div class="text-muted">Cost</div>
                    <div style="font-weight:600;">${rs(b.cost)}</div>
                  </div>
                  <div style="padding:8px;background:var(--bg-app);border-radius:6px;text-align:center;">
                    <div class="text-muted">MRP</div>
                    <div style="font-weight:600;">${rs(b.mrp)}</div>
                  </div>
                  <div style="padding:8px;background:var(--bg-app);border-radius:6px;text-align:center;">
                    <div class="text-muted">Sell</div>
                    <div style="font-weight:600;color:var(--primary);">${rs(b.selling_price || b.mrp)}</div>
                  </div>
                </div>
                <div class="mobile-card-foot">
                  <div class="text-xs text-muted">MFG: ${fmtDate(b.mfg_date)}</div>
                  <div style="display:flex;gap:8px;">
                    <button class="btn btn-ghost btn-sm" data-edit-batch="${b.id}">Edit</button>
                    <button class="btn btn-ghost btn-sm" data-del-batch="${b.id}" style="color:var(--danger);">Delete</button>
                  </div>
                </div>
              </div>
            `;
          }).join('');
    }

    $$('[data-edit-batch]').forEach(btn => btn.onclick = () => {
      const b = DB.product_batches.find(x => x.id === btn.dataset.editBatch);
      if (b) openBatchForm(b);
    });

    $$('[data-del-batch]').forEach(btn => btn.onclick = () => deleteBatch(btn.dataset.delBatch));
  }

  $('#batch-search').oninput = renderList;
  ['batch-product', 'batch-age', 'batch-sort'].forEach(id => {
    const el = $('#' + id);
    if (el) el.onchange = renderList;
  });

  $('#add-batch').onclick = () => openBatchForm(null, null, batchProducts.length === 0);

  renderList();
}

/* ─────────────────────────────────────────────
   7.3 ADD/EDIT BATCH FORM
   ───────────────────────────────────────────── */
function openBatchForm(existing, prefillVariantId, noProducts) {
  if (noProducts) {
    toast('Add a batch-managed product with at least one variant first', 'error');
    location.hash = '#/products';
    return;
  }

  const isEdit = !!existing;

  // Resolve default product from prefill or existing
  let defaultProductId = null;
  let defaultVariantId = null;

  if (existing) {
    const v = DB.variants.find(x => x.id === existing.variant_id);
    if (v) {
      defaultProductId = v.product_id;
      defaultVariantId = v.id;
    }
  } else if (prefillVariantId) {
    const v = DB.variants.find(x => x.id === prefillVariantId);
    if (v) {
      defaultProductId = v.product_id;
      defaultVariantId = v.id;
    }
  }

  const batchProducts = DB.products
    .filter(p => p.batch_managed !== false)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (batchProducts.length === 0) {
    toast('Add a batch-managed product with at least one variant first', 'error');
    return;
  }

  const b = existing || {
    batch_no: '',
    mfg_date: '',
    qty: '',
    cost: 0,
    mrp: 0,
    selling_price: 0
  };

  const productOptions = batchProducts.map(p => {
    const variantCount = DB.variants.filter(v => v.product_id === p.id).length;
    return `<option value="${p.id}" ${defaultProductId === p.id ? 'selected' : ''}>
      ${esc(p.name)} (${variantCount} variant${variantCount === 1 ? '' : 's'})
    </option>`;
  }).join('');

  function getVariantOptions(productId) {
    const variants = DB.variants
      .filter(v => v.product_id === productId)
      .sort((a, b) => {
        const cmp = (a.shade_name || '').localeCompare(b.shade_name || '');
        if (cmp !== 0) return cmp;
        return Number(a.pack_size) - Number(b.pack_size);
      });
    if (variants.length === 0) {
      return `<option value="">— No variants for this product —</option>`;
    }
    return variants.map(v =>
      `<option value="${v.id}" ${defaultVariantId === v.id ? 'selected' : ''}>
        ${esc(v.shade_name || '—')} · ${fmtNum(v.pack_size)} ${esc(v.pack_unit || '')}
      </option>`
    ).join('');
  }

  const selectedProductId = defaultProductId || batchProducts[0].id;
  const initialVariantOptions = getVariantOptions(selectedProductId);

  openModal(`
    <div class="modal-header">
      <div>
        <div class="modal-title">${isEdit ? 'Edit Batch' : 'New Batch'}</div>
        <div class="text-xs text-muted" style="margin-top:2px;">
          ${isEdit ? 'Editing batch stock and prices' : 'Record stock with batch number and MFG date'}
        </div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <form id="batchf" style="display:flex;flex-direction:column;gap:16px;">

        <div>
          <label class="label">Product Line *</label>
          <select class="input" id="batch-product-sel" ${isEdit ? 'disabled' : ''}>
            ${productOptions}
          </select>
          ${isEdit ? '<div class="field-hint">Product cannot be changed after batch is created</div>' : ''}
        </div>

        <div>
          <label class="label">Variant (Shade · Size) *</label>
          <select class="input" id="batch-variant-sel" name="variant_id" ${isEdit ? 'disabled' : ''} required>
            ${initialVariantOptions}
          </select>
          ${isEdit ? '<div class="field-hint">Variant cannot be changed after batch is created</div>' : ''}
        </div>

        <div class="grid-2">
          <div>
            <label class="label">Batch Number *</label>
            <input class="input" name="batch_no" required value="${esc(b.batch_no || '')}" placeholder="e.g. AP2412-B3" autofocus>
          </div>
          <div>
            <label class="label">MFG Date</label>
            <input class="input" type="date" name="mfg_date" value="${esc(b.mfg_date || '')}">
            <div class="field-hint">Optional — helps track stock age</div>
          </div>
        </div>

        <div>
          <label class="label">Quantity *</label>
          <input class="input" name="qty" type="number" step="any" min="0" required value="${b.qty || ''}" placeholder="e.g. 12">
          <div class="field-hint">Units in this batch. Set to 0 if sold out.</div>
        </div>

        <div class="grid-3">
          <div>
            <label class="label">Cost / Unit (₹)</label>
            <input class="input" name="cost" type="number" step="any" min="0" value="${b.cost || 0}">
          </div>
          <div>
            <label class="label">MRP (₹)</label>
            <input class="input" name="mrp" type="number" step="any" min="0" value="${b.mrp || 0}" id="batch-mrp">
          </div>
          <div>
            <label class="label">Selling Price (₹)</label>
            <input class="input" name="selling_price" type="number" step="any" min="0" value="${b.selling_price || 0}" id="batch-sp">
          </div>
        </div>
        <div class="field-hint" style="margin-top:-8px;">Selling price defaults to MRP if left at 0</div>

      </form>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="batchf-save">${isEdit ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    const productSel = root.querySelector('#batch-product-sel');
    const variantSel = root.querySelector('#batch-variant-sel');
    const mrpEl = root.querySelector('#batch-mrp');
    const spEl = root.querySelector('#batch-sp');

    // Update variants when product changes
    if (!isEdit && productSel) {
      productSel.onchange = () => {
        variantSel.innerHTML = getVariantOptions(productSel.value);
      };
    }

    // Selling price = MRP if empty
    if (mrpEl && spEl) {
      mrpEl.addEventListener('input', () => {
        if (!spEl.value || Number(spEl.value) === 0) spEl.value = mrpEl.value;
      });
    }

    root.querySelector('#batchf-save').onclick = async () => {
      const form = root.querySelector('#batchf');
      if (!form.reportValidity()) return;

      const fd = new FormData(form);

      const batchNo = (fd.get('batch_no') || '').trim();
      const mfgDate = fd.get('mfg_date') || null;
      const qty = Number(fd.get('qty'));
      const cost = Number(fd.get('cost')) || 0;
      const mrp = Number(fd.get('mrp')) || 0;
      const sp = Number(fd.get('selling_price')) || mrp;

      // Resolve variant id (disabled selects don't submit in FormData)
      const variantId = isEdit ? existing.variant_id : variantSel.value;

      if (!variantId) { toast('Select a variant', 'error'); return; }
      if (!batchNo) { toast('Batch number is required', 'error'); return; }
      if (isNaN(qty) || qty < 0) { toast('Quantity cannot be negative', 'error'); return; }

      // Duplicate check — same variant + same batch_no (except self)
      const dup = DB.product_batches.find(x =>
        x.variant_id === variantId &&
        (x.batch_no || '').toLowerCase() === batchNo.toLowerCase() &&
        (!existing || x.id !== existing.id)
      );
      if (dup) {
        toast('A batch with this number already exists for this variant', 'error');
        return;
      }

      const data = {
        variant_id:    variantId,
        batch_no:      batchNo,
        mfg_date:      mfgDate,
        qty:           qty,
        cost:          cost,
        mrp:           mrp,
        selling_price: sp
      };

      const btn = root.querySelector('#batchf-save');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      let res;
      if (isEdit) {
        res = await sb.from('product_batches').update(data).eq('id', existing.id).select().single();
      } else {
        res = await sb.from('product_batches').insert(data).select().single();
      }

      if (res.error) {
        console.error(res.error);
        toast('Failed to save batch: ' + (res.error.message || 'unknown'), 'error');
        btn.disabled = false;
        btn.textContent = isEdit ? 'Update' : 'Save';
        return;
      }

      await syncDB();
      toast(isEdit ? 'Batch updated' : 'Batch added · stock increased', 'success');
      closeModal(root);
      route();
    };
  });
}

/* ─────────────────────────────────────────────
   7.4 DELETE BATCH
   ───────────────────────────────────────────── */
async function deleteBatch(batchId) {
  const b = DB.product_batches.find(x => x.id === batchId);
  if (!b) return;

  const v = DB.variants.find(x => x.id === b.variant_id);
  const p = v ? DB.products.find(x => x.id === v.product_id) : null;
  const qty = Number(b.qty) || 0;

  let msg = `Delete batch "${b.batch_no}" of ${p?.name || 'product'}${v ? ' · ' + (v.shade_name || '') + ' ' + fmtNum(v.pack_size) + (v.pack_unit || '') : ''}?`;

  if (qty > 0) {
    msg += `\n\n⚠️ This batch has ${fmtNum(qty)} ${v?.pack_unit || ''} in stock.\nDeleting it will reduce the variant's total stock.`;
  }

  msg += '\n\nThis cannot be undone.';

  if (!confirmDlg(msg, 'Confirm Delete')) return;

  const { error } = await sb.from('product_batches').delete().eq('id', batchId);
  if (error) {
    console.error(error);
    toast('Failed to delete batch: ' + (error.message || 'unknown'), 'error');
    return;
  }

  await syncDB();
  toast('Batch deleted · stock adjusted', 'success');
  route();
}
/* ══════════════════════════════════════════════════════════════════
   STEP 8 — PHASE 2 · STEP 1
   Customers · Payments · Colorants · Schema expansions
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   8.1 OVERRIDE syncDB (now fetches all Phase 2 tables)
   ───────────────────────────────────────────── */
async function fetchAllRows(tableName) {
  const PAGE_SIZE = 1000;
  let allData = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await sb
      .from(tableName)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

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
  window.DB_ERROR = null;

  const errors = [];
  const tables = [
    'brands', 'products', 'variants', 'product_batches',
    'customers', 'invoices', 'invoice_items', 'payments',
    'colorants', 'mixes'
  ];

  const results = await Promise.allSettled(tables.map(t => fetchAllRows(t)));

  results.forEach((res, i) => {
    const name = tables[i];
    if (res.status === 'fulfilled') {
      DB[name] = res.value;
    } else {
      errors.push(res.reason.message || String(res.reason));
    }
  });

  // Settings (single row id=1)
  try {
    const { data, error } = await sb.from('settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;

    if (data) {
      SETTINGS = {
        shop_name:               data.shop_name               || 'PaintBook',
        owner_name:              data.owner_name              || 'Owner',
        address:                 data.address                 || '',
        city:                    data.city                    || '',
        phone:                   data.phone                   || '',
        email:                   data.email                   || '',
        upi:                     data.upi                     || '',
        logo:                    data.logo                    || '',
        gst_enabled:             !!data.gst_enabled,
        gst_number:              data.gst_number              || '',
        gst_rate:                Number(data.gst_rate)        || 0,
        low_stock_alert_default: Number(data.low_stock_alert_default) || 5,
        print_footer:            data.print_footer            || 'Thank you! Visit again',
        loaded:                  true
      };
      DB.settings = data;
    } else {
      SETTINGS.loaded = true;
    }
    applyFavicon();
  } catch (e) {
    errors.push('settings - ' + (e.message || e));
    SETTINGS.loaded = true;
  }

  window.DB_SYNCED = errors.length === 0;
  window.DB_ERROR = errors.length ? errors[0] : null;
  window.DB_SYNCING = false;

  if (errors.length) {
    console.error('[PaintBook] Sync errors:', errors);
    if (!window.__syncErrorShown) {
      toast('Sync issue: ' + (errors[0] || 'Unknown'), 'error');
      window.__syncErrorShown = true;
    }
  } else {
    window.__syncErrorShown = false;
  }

  return { ok: errors.length === 0, errors };
}

/* ─────────────────────────────────────────────
   8.2 DATE/TIME FIELD HELPERS
   ───────────────────────────────────────────── */
function dateTimeFieldHTML(dateVal, timeVal, label) {
  const today = todayStr();
  return `<div class="grid-2">
    <div>
      <label class="label">${esc(label || 'Date')} *</label>
      <input class="input" type="date" name="tx_date" required max="${today}" value="${esc(dateVal || today)}">
    </div>
    <div>
      <label class="label">Time (optional)</label>
      <input class="input" type="time" name="tx_time" value="${esc(timeVal || '')}">
    </div>
  </div>`;
}

function readDateTime(form) {
  const dEl = form.querySelector('input[name="tx_date"]');
  const tEl = form.querySelector('input[name="tx_time"]');
  const d = dEl ? dEl.value : '';
  const tm = (tEl && tEl.value ? tEl.value : '').trim();

  if (!d) { toast('Please pick a date', 'error'); return null; }
  if (d > todayStr()) { toast('Future dates not allowed', 'error'); return null; }
  return { date: d, time: tm };
}

/* ─────────────────────────────────────────────
   8.3 CUSTOMER STATS & OPTIONS
   ───────────────────────────────────────────── */
function customerStats(customerId) {
  if (!customerId) return { total_bought: 0, total_paid: 0, due: 0, opening: 0 };

  const c = DB.customers.find(x => x.id === customerId);
  const opening = Number(c?.opening_balance) || 0;

  const invs = DB.invoices.filter(i => i.customer_id === customerId);
  const pays = DB.payments.filter(p => p.customer_id === customerId);

  const total_bought = invs.reduce((s, i) => s + Number(i.total || 0), 0);
  const invPaid      = invs.reduce((s, i) => s + Number(i.paid  || 0), 0);
  const extraPaid    = pays.reduce((s, p) => s + Number(p.amount || 0), 0);
  const total_paid   = invPaid + extraPaid;
  const due          = Math.max(0, opening + total_bought - total_paid);

  return { total_bought, total_paid, due, opening };
}

function customerToOption(c) {
  const st = customerStats(c.id);
  return {
    id:         c.id,
    label:      c.name,
    sublabel:   c.phone || '',
    searchText: ((c.name || '') + ' ' + (c.phone || '')).toLowerCase(),
    dueText:    st.due > 0 ? 'Due ' + rs(st.due) : '',
    metaText:   ''
  };
}

/* ─────────────────────────────────────────────
   8.4 CUSTOMERS LIST
   ───────────────────────────────────────────── */
function renderCustomers(content) {
  const list = DB.customers;

  const totalDue = list.reduce((s, c) => s + customerStats(c.id).due, 0);
  const withDue = list.filter(c => customerStats(c.id).due > 0).length;

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Customers</h1>
        <p>${list.length} customer${list.length === 1 ? '' : 's'}${withDue > 0 ? ` · ${withDue} with pending udhar` : ''}</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="add-cust">+ Add Customer</button>
      </div>
    </div>

    ${totalDue > 0 ? `
      <div class="card" style="margin-bottom:20px;background:var(--warning-bg);border-color:var(--warning);border-radius:12px;box-shadow:none;">
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
          <div style="font-size:24px;">💳</div>
          <div style="flex:1;min-width:200px;">
            <div style="font-weight:700;color:#92400e;font-size:13px;">Total pending udhar</div>
            <div style="font-size:22px;font-weight:800;color:#92400e;margin-top:4px;">${rs(totalDue)}</div>
          </div>
          <div class="text-sm" style="color:#92400e;">Across ${withDue} customer${withDue === 1 ? '' : 's'}</div>
        </div>
      </div>
    ` : ''}

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;border-radius:16px;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="c-search" placeholder="Name or phone...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Sort</label>
        <select class="input" id="c-sort">
          <option value="name">Name (A–Z)</option>
          <option value="name-desc">Name (Z–A)</option>
          <option value="due-desc">Due (high first)</option>
          <option value="due">Due (low first)</option>
          <option value="newest">Newest first</option>
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Filter</label>
        <select class="input" id="c-filter">
          <option value="">All</option>
          <option value="due">Only with due</option>
          <option value="nodue">Only cleared</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Phone</th>
            <th>Joined</th>
            <th style="text-align:right">Billed</th>
            <th style="text-align:right">Due</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="c-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="c-mobile"></div>
  `;

  function filtered() {
    const q      = ($('#c-search').value || '').toLowerCase().trim();
    const sortBy = $('#c-sort').value;
    const flt    = $('#c-filter').value;

    let arr = list.map(c => ({ ...c, _stats: customerStats(c.id) }));

    if (q) {
      arr = arr.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
      );
    }
    if (flt === 'due')   arr = arr.filter(c => c._stats.due > 0);
    if (flt === 'nodue') arr = arr.filter(c => c._stats.due <= 0);

    if (sortBy === 'name')           arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortBy === 'name-desc') arr.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    else if (sortBy === 'due-desc')  arr.sort((a, b) => b._stats.due - a._stats.due);
    else if (sortBy === 'due')       arr.sort((a, b) => a._stats.due - b._stats.due);
    else if (sortBy === 'newest')    arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return arr;
  }

  function renderList() {
    const arr = filtered();

    const tbody = $('#c-body');
    if (tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">
             ${list.length === 0
               ? 'No customers yet — click <b>+ Add Customer</b> to create your first one.'
               : 'No customers match.'}
           </td></tr>`
        : arr.map(c => {
            const st = c._stats;
            const init = (c.name || 'C').charAt(0).toUpperCase();
            return `<tr>
              <td>
                <div style="display:flex;align-items:center;gap:12px;">
                  <div class="table-avatar" style="margin:0;">${esc(init)}</div>
                  <div>
                    <a href="#/customer/${c.id}" style="font-weight:600;color:var(--text-main);text-decoration:none;">${esc(c.name)}</a>
                  </div>
                </div>
              </td>
              <td>${c.phone ? `<a href="tel:${esc(c.phone)}" style="color:var(--text-muted);">${esc(c.phone)}</a>` : '—'}</td>
              <td class="text-sm text-muted">${fmtDate(c.joined_date)}</td>
              <td style="text-align:right;">${rs(st.total_bought)}</td>
              <td style="text-align:right;font-weight:${st.due > 0 ? '700' : '400'};color:${st.due > 0 ? 'var(--danger)' : 'var(--text-muted)'};">
                ${rs(st.due)}
              </td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" data-view="${c.id}">View</button>
                <button class="btn btn-ghost btn-sm" data-del="${c.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('');
    }

    const mob = $('#c-mobile');
    if (mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">👥</div>
             <div class="empty-title">${list.length === 0 ? 'No customers yet' : 'No matches'}</div>
             <div class="empty-desc">${list.length === 0
               ? 'Tap "+ Add Customer" above to create your first one.'
               : 'Try a different search or filter.'}</div>
           </div>`
        : arr.map(c => {
            const st = c._stats;
            const init = (c.name || 'C').charAt(0).toUpperCase();
            return `
              <a href="#/customer/${c.id}" class="mobile-card" style="text-decoration:none;color:inherit;">
                <div class="mobile-card-head">
                  <div style="display:flex;gap:12px;align-items:center;min-width:0;flex:1;">
                    <div class="table-avatar" style="margin:0;">${esc(init)}</div>
                    <div style="min-width:0;">
                      <div class="mobile-card-title">${esc(c.name)}</div>
                      <div class="mobile-card-sub">${esc(c.phone || 'No phone')} · Joined ${fmtDate(c.joined_date)}</div>
                    </div>
                  </div>
                  <div style="text-align:right;flex-shrink:0;">
                    <div style="font-weight:700;color:${st.due > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${rs(st.due)}</div>
                    <div class="text-xs text-muted" style="margin-top:2px;">${st.due > 0 ? 'Due' : 'Clear'}</div>
                  </div>
                </div>
              </a>
            `;
          }).join('');
    }

    $$('[data-view]').forEach(btn => btn.onclick = () => {
      location.hash = '#/customer/' + btn.dataset.view;
    });
    $$('[data-del]').forEach(btn => btn.onclick = () => deleteCustomer(btn.dataset.del));
  }

  $('#c-search').oninput = renderList;
  ['c-sort', 'c-filter'].forEach(id => {
    const el = $('#' + id);
    if (el) el.onchange = renderList;
  });
  $('#add-cust').onclick = () => openCustomerForm();

  renderList();
}

/* ─────────────────────────────────────────────
   8.5 CUSTOMER FORM
   ───────────────────────────────────────────── */
function openCustomerForm(existing) {
  const c = existing || {
    name: '',
    phone: '',
    opening_balance: 0,
    notes: '',
    joined_date: todayStr(),
    tx_time: ''
  };

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${existing ? 'Edit' : 'New'} Customer</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <form id="cf" style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <label class="label">Name *</label>
          <input class="input" name="name" required value="${esc(c.name || '')}" placeholder="e.g. Rajesh Kumar" autofocus>
        </div>
        <div>
          <label class="label">Phone</label>
          <input class="input" type="tel" name="phone" value="${esc(c.phone || '')}" placeholder="10-digit mobile">
        </div>
        <div>
          <label class="label">Opening Balance (₹)</label>
          <input class="input" type="number" step="any" name="opening_balance" value="${c.opening_balance || 0}">
          <div class="field-hint">What they already owe you when you start using PaintBook (leave 0 for new customers)</div>
        </div>
        <div>
          <label class="label">Notes</label>
          <textarea class="input" name="notes" placeholder="Optional">${esc(c.notes || '')}</textarea>
        </div>
        ${dateTimeFieldHTML(c.joined_date || todayStr(), c.tx_time || '', 'Joined')}
      </form>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="cf-save">${existing ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    const nameInput = root.querySelector('[name="name"]');
    if (nameInput) nameInput.focus();

    root.querySelector('#cf-save').onclick = async () => {
      const form = root.querySelector('#cf');
      if (!form.reportValidity()) return;

      const dt = readDateTime(form);
      if (!dt) return;

      const fd = new FormData(form);
      const name = (fd.get('name') || '').trim();
      if (!name) { toast('Name is required', 'error'); return; }

      const data = {
        name,
        phone:           (fd.get('phone') || '').trim(),
        opening_balance: Number(fd.get('opening_balance')) || 0,
        notes:           (fd.get('notes') || '').trim(),
        joined_date:     dt.date,
        tx_time:         dt.time
      };

      const btn = root.querySelector('#cf-save');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      let res;
      if (existing) res = await sb.from('customers').update(data).eq('id', existing.id).select().single();
      else          res = await sb.from('customers').insert(data).select().single();

      if (res.error) {
        console.error(res.error);
        toast('Failed to save customer: ' + (res.error.message || 'unknown'), 'error');
        btn.disabled = false;
        btn.textContent = existing ? 'Update' : 'Save';
        return;
      }

      await syncDB();
      toast(existing ? 'Customer updated' : 'Customer added', 'success');
      closeModal(root);

      if (!existing && res.data) {
        location.hash = '#/customer/' + res.data.id;
      } else {
        route();
      }
    };
  });
}

async function deleteCustomer(id) {
  const c = DB.customers.find(x => x.id === id);
  if (!c) return;

  const invCount = DB.invoices.filter(i => i.customer_id === id).length;
  const payCount = DB.payments.filter(p => p.customer_id === id).length;

  let msg = `Delete customer "${c.name}"?`;
  if (invCount || payCount) {
    msg += `\n\n⚠️ Their ${invCount} invoice${invCount === 1 ? '' : 's'} and ${payCount} payment${payCount === 1 ? '' : 's'} will remain in the system but lose the customer link.`;
  }
  msg += '\n\nThis cannot be undone.';

  if (!confirmDlg(msg, 'Confirm Delete')) return;

  const { error } = await sb.from('customers').delete().eq('id', id);
  if (error) {
    console.error(error);
    toast('Failed to delete customer.', 'error');
    return;
  }

  await syncDB();
  toast('Customer deleted', 'success');
  route();
}

/* ─────────────────────────────────────────────
   8.6 CUSTOMER PROFILE
   ───────────────────────────────────────────── */
function renderCustomerProfile(content, id) {
  const c = DB.customers.find(x => x.id === id);
  if (!c) {
    content.innerHTML = `
      <div class="empty-state" style="padding:80px 20px;">
        <div class="empty-icon">👤</div>
        <div class="empty-title">Customer not found</div>
        <div class="empty-desc">It may have been deleted.</div>
        <a href="#/customers" class="btn btn-primary">Back to Customers</a>
      </div>
    `;
    return;
  }

  const st   = customerStats(id);
  const invs = DB.invoices
    .filter(i => i.customer_id === id)
    .sort((a, b) => txDate(b, 'invoice_date').localeCompare(txDate(a, 'invoice_date')));
  const pays = DB.payments
    .filter(p => p.customer_id === id)
    .sort((a, b) => txDate(b, 'payment_date').localeCompare(txDate(a, 'payment_date')));

  const init = (c.name || 'C').charAt(0).toUpperCase();

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/customers" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Customers</a>
    </div>

    <div class="page-head" style="margin-bottom:24px;align-items:center;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div class="table-avatar" style="width:56px;height:56px;font-size:20px;margin:0;">${esc(init)}</div>
        <div>
          <h1 style="margin-bottom:2px;">${esc(c.name)}</h1>
          <p class="text-muted text-sm">
            ${c.phone ? '📞 ' + esc(c.phone) + ' &nbsp;·&nbsp; ' : ''}
            Joined ${fmtDate(c.joined_date)}
          </p>
        </div>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" id="btn-edit-c">✎ Edit</button>
        <button class="btn btn-ghost" id="btn-pay-c">+ Payment</button>
      </div>
    </div>

    <div class="grid-3" style="margin-bottom:24px;">
      <div class="card" style="padding:16px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Total Billed</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">${rs(st.total_bought)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Total Paid</div>
        <div style="font-size:20px;font-weight:700;color:var(--success);margin-top:4px;">${rs(st.total_paid)}</div>
      </div>
      <div class="card" style="padding:16px;${st.due > 0 ? 'background:var(--danger-bg);border-color:var(--danger);' : ''}">
        <div class="text-xs ${st.due > 0 ? '' : 'text-muted'}" style="text-transform:uppercase;font-weight:700;${st.due > 0 ? 'color:var(--danger);' : ''}">Outstanding Udhar</div>
        <div style="font-size:20px;font-weight:700;color:${st.due > 0 ? 'var(--danger)' : 'var(--text-main)'};margin-top:4px;">${rs(st.due)}</div>
      </div>
    </div>

    ${st.opening !== 0 ? `
      <div class="card" style="margin-bottom:24px;background:var(--bg-app);border-radius:12px;box-shadow:none;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Opening Balance</div>
            <div class="text-sm text-muted" style="margin-top:2px;">Amount owed when added to PaintBook</div>
          </div>
          <div style="font-size:18px;font-weight:700;color:${st.opening > 0 ? 'var(--danger)' : 'var(--success)'};">${rs(st.opening)}</div>
        </div>
      </div>
    ` : ''}

    ${c.notes ? `
      <div class="card" style="margin-bottom:24px;background:var(--warning-bg);border-color:var(--warning);border-radius:12px;box-shadow:none;">
        <div class="text-xs" style="text-transform:uppercase;font-weight:700;color:#92400e;margin-bottom:4px;">Notes</div>
        <div style="font-size:13px;color:#92400e;">${esc(c.notes)}</div>
      </div>
    ` : ''}

    <div class="grid-2" style="margin-bottom:24px;">
      <!-- Invoices -->
      <div class="card">
        <div class="card-title">Invoices <small>${invs.length}</small></div>
        ${!invs.length
          ? '<p class="text-sm text-muted text-center" style="padding:20px 0;">No invoices yet</p>'
          : `<div>${invs.slice(0, 10).map(i => `
              <div class="panel-list-item" style="border-bottom:1px solid var(--border);border-radius:0;padding:12px 0;cursor:pointer;" onclick="location.hash='#/invoice/${i.id}'">
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;font-size:13px;color:var(--text-main);">${esc(i.invoice_no || '')}</div>
                  <div class="text-xs text-muted">${txDT(i, 'invoice_date')}</div>
                </div>
                <div style="text-align:right;white-space:nowrap;">
                  <div style="font-weight:600;font-size:13px;">${rs(i.total)}</div>
                  ${Number(i.due) > 0
                    ? `<div style="color:var(--danger);font-size:11px;">Due ${rs(i.due)}</div>`
                    : '<div style="color:var(--success);font-size:11px;">Paid</div>'}
                </div>
              </div>
            `).join('')}</div>`}
      </div>

      <!-- Payments -->
      <div class="card">
        <div class="card-title">Payments <small>${pays.length}</small></div>
        ${!pays.length
          ? '<p class="text-sm text-muted text-center" style="padding:20px 0;">No payments yet</p>'
          : `<div>${pays.slice(0, 10).map(p => `
              <div style="display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);font-size:13px;align-items:center;">
                <div>
                  <div style="color:var(--success);font-weight:600;">
                    ${rs(p.amount)}
                    <span class="text-xs text-muted" style="font-weight:400;">— ${esc(p.mode || '')}</span>
                  </div>
                  <div class="text-xs text-muted">${txDT(p, 'payment_date')}</div>
                </div>
                <button class="btn btn-ghost btn-sm" data-pay-del="${p.id}" style="color:var(--danger);">Del</button>
              </div>
            `).join('')}</div>`}
      </div>
    </div>

    <!-- Statement Ledger -->
    <div class="card">
      <div class="card-title">Statement <small>Running balance</small></div>
      ${(() => {
        const tl = [
          ...invs.map(i => ({
            date: txDate(i, 'invoice_date'),
            type: 'Invoice',
            ref: i.invoice_no,
            id: i.id,
            debit: Number(i.total || 0),
            credit: Number(i.paid || 0)
          })),
          ...pays.map(p => ({
            date: txDate(p, 'payment_date'),
            type: 'Payment',
            ref: p.mode || 'Payment',
            id: p.id,
            debit: 0,
            credit: Number(p.amount || 0)
          }))
        ].sort((a, b) => a.date.localeCompare(b.date));

        let bal = Number(c.opening_balance) || 0;
        const rows = [];

        if (bal !== 0) {
          rows.push(`<tr>
            <td>—</td>
            <td><b>Opening Balance</b></td>
            <td style="text-align:right">${bal > 0 ? rs(bal) : '—'}</td>
            <td style="text-align:right;color:var(--success)">${bal < 0 ? rs(-bal) : '—'}</td>
            <td style="text-align:right;font-weight:700;color:${bal > 0 ? 'var(--danger)' : 'var(--success)'}">${rs(Math.abs(bal))}</td>
          </tr>`);
        }

        tl.forEach(x => {
          bal += x.debit - x.credit;
          rows.push(`<tr>
            <td>${fmtDate(x.date)}</td>
            <td>${x.type === 'Invoice'
                ? `<a href="#/invoice/${x.id}" style="font-weight:600;">${esc(x.ref || '')}</a>`
                : esc(x.ref || '')}</td>
            <td style="text-align:right">${x.debit ? rs(x.debit) : '—'}</td>
            <td style="text-align:right;color:var(--success)">${x.credit ? rs(x.credit) : '—'}</td>
            <td style="text-align:right;font-weight:700;color:${bal > 0 ? 'var(--danger)' : 'var(--success)'}">${rs(Math.abs(bal))}</td>
          </tr>`);
        });

        if (rows.length === 0) {
          rows.push(`<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">No transactions yet</td></tr>`);
        }

        return `<div class="table-wrap" style="border:0;box-shadow:none;">
          <table>
            <thead><tr>
              <th>Date</th>
              <th>Reference</th>
              <th style="text-align:right">Debit (Billed)</th>
              <th style="text-align:right">Credit (Paid)</th>
              <th style="text-align:right">Balance</th>
            </tr></thead>
            <tbody>${rows.join('')}</tbody>
          </table>
        </div>`;
      })()}
    </div>

    <div class="text-center text-xs text-muted" style="padding:20px 0;">${enteredOn(c)}</div>
  `;

  $('#btn-edit-c').onclick = () => openCustomerForm(c);
  $('#btn-pay-c').onclick  = () => openCustomerPaymentForm(id);

  $$('[data-pay-del]').forEach(btn => btn.onclick = async () => {
    const p = DB.payments.find(x => x.id === btn.dataset.payDel);
    if (!p) return;
    if (!confirmDlg('Delete payment of ' + rs(p.amount) + '?', 'Confirm Delete')) return;

    const { error } = await sb.from('payments').delete().eq('id', p.id);
    if (error) {
      console.error(error);
      toast('Failed to delete payment.', 'error');
      return;
    }

    await syncDB();
    toast('Payment deleted', 'success');
    route();
  });
}

/* ─────────────────────────────────────────────
   8.7 CUSTOMER PAYMENT FORM
   ───────────────────────────────────────────── */
function openCustomerPaymentForm(customerId, existing) {
  const c = DB.customers.find(x => x.id === customerId);
  if (!c) { toast('Customer not found', 'error'); return; }

  const p = existing || {
    amount: '',
    mode: 'cash',
    notes: '',
    payment_date: todayStr(),
    tx_time: ''
  };

  openModal(`
    <div class="modal-header">
      <div>
        <div class="modal-title">${existing ? 'Edit' : 'Record'} Payment</div>
        <div class="text-xs text-muted" style="margin-top:2px;">From: <b>${esc(c.name)}</b></div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <form id="payf" style="display:flex;flex-direction:column;gap:16px;">
        ${dateTimeFieldHTML(p.payment_date, p.tx_time, 'Payment Date')}

        <div>
          <label class="label">Amount (₹) *</label>
          <input class="input" type="number" step="any" min="0.01" name="amount" required value="${p.amount || ''}" autofocus>
        </div>

        <div>
          <label class="label">Mode</label>
          <select class="input" name="mode">
            <option value="cash"   ${p.mode === 'cash'   ? 'selected' : ''}>Cash</option>
            <option value="upi"    ${p.mode === 'upi'    ? 'selected' : ''}>UPI</option>
            <option value="card"   ${p.mode === 'card'   ? 'selected' : ''}>Card</option>
            <option value="bank"   ${p.mode === 'bank'   ? 'selected' : ''}>Bank Transfer</option>
            <option value="cheque" ${p.mode === 'cheque' ? 'selected' : ''}>Cheque</option>
          </select>
        </div>

        <div>
          <label class="label">Notes</label>
          <input class="input" name="notes" value="${esc(p.notes || '')}" placeholder="Optional reference">
        </div>
      </form>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="pay-save">${existing ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    root.querySelector('#pay-save').onclick = async () => {
      const form = root.querySelector('#payf');
      if (!form.reportValidity()) return;

      const dt = readDateTime(form);
      if (!dt) return;

      const fd = new FormData(form);
      const amt = Number(fd.get('amount')) || 0;
      if (amt <= 0) { toast('Amount must be greater than 0', 'error'); return; }

      const data = {
        customer_id:   customerId,
        customer_name: c.name || '',
        amount:        amt,
        mode:          fd.get('mode') || 'cash',
        notes:         (fd.get('notes') || '').trim(),
        payment_date:  dt.date,
        tx_time:       dt.time
      };

      const btn = root.querySelector('#pay-save');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      let res;
      if (existing) res = await sb.from('payments').update(data).eq('id', existing.id);
      else          res = await sb.from('payments').insert(data);

      if (res.error) {
        console.error(res.error);
        toast('Failed to save payment.', 'error');
        btn.disabled = false;
        btn.textContent = 'Save';
        return;
      }

      await syncDB();
      toast('Payment saved', 'success');
      closeModal(root);
      route();
    };
  });
}

/* ─────────────────────────────────────────────
   8.8 COLORANTS LIST
   ───────────────────────────────────────────── */
function colorantStockBadge(c) {
  const stock = Number(c.stock) || 0;
  const alert = Number(c.low_stock_alert) || 0;
  if (stock === 0)          return '<span class="chip chip-danger" style="font-size:10px;">OUT</span>';
  if (stock <= alert)       return '<span class="chip chip-warning" style="font-size:10px;">LOW</span>';
  return '<span class="chip chip-success" style="font-size:10px;">OK</span>';
}

function renderColorants(content) {
  const list = DB.colorants;

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Colorants</h1>
        <p>${list.length} colorant${list.length === 1 ? '' : 's'} · Used for custom tint mixes</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="add-colorant">+ Add Colorant</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;background:var(--primary-light);border-color:var(--primary);border-radius:12px;box-shadow:none;">
      <div style="display:flex;gap:12px;align-items:flex-start;font-size:13px;">
        <span style="font-size:20px;">🎨</span>
        <div>
          <b style="color:var(--primary);">About colorants</b>
          <div class="text-muted" style="margin-top:4px;line-height:1.5;">
            Colorants are the tint liquids you add to base paint. Each has its own stock (typically in ml).
            When you mix a custom shade in an invoice, the colorant stock is deducted automatically.
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;border-radius:16px;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="col-search" placeholder="Colorant name, code or brand...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Brand</label>
        <select class="input" id="col-brand">
          <option value="">All brands</option>
          <option value="__none__">Unassigned</option>
          ${DB.brands.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Status</label>
        <select class="input" id="col-filter">
          <option value="">All</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Colorant</th>
            <th>Brand</th>
            <th>Unit</th>
            <th style="text-align:right">Cost / Unit</th>
            <th style="text-align:right">Stock</th>
            <th>Status</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="col-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="col-mobile"></div>
  `;

  function filtered() {
    const q       = ($('#col-search').value || '').toLowerCase().trim();
    const brandId = $('#col-brand').value;
    const flt     = $('#col-filter').value;

    let arr = list.filter(c => {
      const brand = DB.brands.find(b => b.id === c.brand_id);
      const hay = ((c.name || '') + ' ' + (c.code || '') + ' ' + (brand?.name || '')).toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (brandId === '__none__' && c.brand_id) return false;
      if (brandId && brandId !== '__none__' && c.brand_id !== brandId) return false;
      if (flt === 'low' && Number(c.stock) > Number(c.low_stock_alert)) return false;
      if (flt === 'low' && Number(c.stock) <= 0) return false;
      if (flt === 'out' && Number(c.stock) > 0) return false;
      return true;
    });

    arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return arr;
  }

  function renderList() {
    const arr = filtered();

    const tbody = $('#col-body');
    if (tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">
             ${list.length === 0
               ? 'No colorants yet — click <b>+ Add Colorant</b> to create your first one.'
               : 'No colorants match your filters.'}
           </td></tr>`
        : arr.map(c => {
            const brand = DB.brands.find(b => b.id === c.brand_id);
            return `<tr>
              <td>
                <div style="font-weight:600;color:var(--text-main);">${esc(c.name)}</div>
                ${c.code ? `<div class="text-xs text-muted" style="font-family:monospace;margin-top:2px;">${esc(c.code)}</div>` : ''}
              </td>
              <td>${brand ? `<span class="chip chip-primary" style="font-size:10px;">${esc(brand.name)}</span>` : '<span class="text-xs text-muted">—</span>'}</td>
              <td class="text-sm text-muted">${esc(c.unit || 'ml')}</td>
              <td style="text-align:right;">${rs(c.cost_per_unit)}</td>
              <td style="text-align:right;font-weight:600;">${fmtNum(c.stock)} ${esc(c.unit || '')}</td>
              <td>${colorantStockBadge(c)}</td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" data-restock="${c.id}">+ Stock</button>
                <button class="btn btn-ghost btn-sm" data-edit="${c.id}">Edit</button>
                <button class="btn btn-ghost btn-sm" data-del="${c.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('');
    }

    const mob = $('#col-mobile');
    if (mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">🎨</div>
             <div class="empty-title">${list.length === 0 ? 'No colorants yet' : 'No matches'}</div>
             <div class="empty-desc">${list.length === 0
               ? 'Tap "+ Add Colorant" above to create your first one.'
               : 'Try a different search.'}</div>
           </div>`
        : arr.map(c => {
            const brand = DB.brands.find(b => b.id === c.brand_id);
            return `
              <div class="mobile-card">
                <div class="mobile-card-head">
                  <div style="min-width:0;flex:1;">
                    <div class="mobile-card-title">${esc(c.name)}</div>
                    <div class="mobile-card-sub">${brand ? esc(brand.name) : 'No brand'}${c.code ? ' · ' + esc(c.code) : ''}</div>
                  </div>
                  <div style="text-align:right;flex-shrink:0;">
                    ${colorantStockBadge(c)}
                    <div style="font-weight:700;margin-top:4px;">${fmtNum(c.stock)} ${esc(c.unit || '')}</div>
                  </div>
                </div>
                <div class="mobile-card-foot">
                  <div class="text-xs text-muted">Cost ${rs(c.cost_per_unit)} / ${esc(c.unit || 'ml')}</div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="btn btn-ghost btn-sm" data-restock="${c.id}">+ Stock</button>
                    <button class="btn btn-ghost btn-sm" data-edit="${c.id}">Edit</button>
                    <button class="btn btn-ghost btn-sm" data-del="${c.id}" style="color:var(--danger);">Del</button>
                  </div>
                </div>
              </div>
            `;
          }).join('');
    }

    $$('[data-edit]').forEach(btn => btn.onclick = () => {
      const c = DB.colorants.find(x => x.id === btn.dataset.edit);
      if (c) openColorantForm(c);
    });
    $$('[data-restock]').forEach(btn => btn.onclick = () => openColorantRestockForm(btn.dataset.restock));
    $$('[data-del]').forEach(btn => btn.onclick = () => deleteColorant(btn.dataset.del));
  }

  $('#col-search').oninput = renderList;
  ['col-brand', 'col-filter'].forEach(id => {
    const el = $('#' + id);
    if (el) el.onchange = renderList;
  });

  $('#add-colorant').onclick = () => openColorantForm();

  renderList();
}

/* ─────────────────────────────────────────────
   8.9 COLORANT FORM
   ───────────────────────────────────────────── */
function openColorantForm(existing) {
  const c = existing || {
    brand_id: null,
    name: '',
    code: '',
    unit: 'ml',
    cost_per_unit: 0,
    stock: 0,
    low_stock_alert: 20,
    notes: ''
  };

  const brandOptions = DB.brands.length === 0
    ? `<option value="">— No brands yet (add one in Brands) —</option>`
    : `<option value="">— Select brand —</option>` +
      DB.brands
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map(b => `<option value="${b.id}" ${c.brand_id === b.id ? 'selected' : ''}>${esc(b.name)}</option>`)
        .join('');

  const unitOptions = ['ml', 'g', 'pc']
    .map(u => `<option value="${u}" ${c.unit === u ? 'selected' : ''}>${u}</option>`)
    .join('');

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${existing ? 'Edit' : 'New'} Colorant</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <form id="colf" style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <label class="label">Colorant Name *</label>
          <input class="input" name="name" required value="${esc(c.name || '')}" placeholder="e.g. Blue, Yellow Oxide, Red" autofocus>
        </div>

        <div class="grid-2">
          <div>
            <label class="label">Code</label>
            <input class="input" name="code" value="${esc(c.code || '')}" placeholder="e.g. B-01">
          </div>
          <div>
            <label class="label">Brand</label>
            <select class="input" name="brand_id">${brandOptions}</select>
          </div>
        </div>

        <div class="grid-2">
          <div>
            <label class="label">Unit</label>
            <select class="input" name="unit">${unitOptions}</select>
          </div>
          <div>
            <label class="label">Cost per Unit (₹)</label>
            <input class="input" type="number" step="any" min="0" name="cost_per_unit" value="${c.cost_per_unit || 0}">
            <div class="field-hint">Cost of 1ml (or 1 unit)</div>
          </div>
        </div>

        <div class="grid-2">
          <div>
            <label class="label">${existing ? 'Current Stock' : 'Opening Stock'}</label>
            <input class="input" type="number" step="any" min="0" name="stock" value="${c.stock || 0}">
            <div class="field-hint">${existing ? 'Edit to correct — use + Stock for adding purchases' : 'How much you have now'}</div>
          </div>
          <div>
            <label class="label">Low Stock Alert at</label>
            <input class="input" type="number" step="any" min="0" name="low_stock_alert" value="${c.low_stock_alert || 0}">
          </div>
        </div>

        <div>
          <label class="label">Notes</label>
          <textarea class="input" name="notes" placeholder="Optional">${esc(c.notes || '')}</textarea>
        </div>
      </form>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="colf-save">${existing ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    const nameInput = root.querySelector('[name="name"]');
    if (nameInput) nameInput.focus();

    root.querySelector('#colf-save').onclick = async () => {
      const form = root.querySelector('#colf');
      if (!form.reportValidity()) return;

      const fd = new FormData(form);
      const name = (fd.get('name') || '').trim();
      if (!name) { toast('Name is required', 'error'); return; }

      const data = {
        brand_id:        fd.get('brand_id') || null,
        name,
        code:            (fd.get('code') || '').trim(),
        unit:            (fd.get('unit') || 'ml').trim(),
        cost_per_unit:   Number(fd.get('cost_per_unit')) || 0,
        stock:           Number(fd.get('stock')) || 0,
        low_stock_alert: Number(fd.get('low_stock_alert')) || 0,
        notes:           (fd.get('notes') || '').trim()
      };

      const btn = root.querySelector('#colf-save');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      let res;
      if (existing) res = await sb.from('colorants').update(data).eq('id', existing.id).select().single();
      else          res = await sb.from('colorants').insert(data).select().single();

      if (res.error) {
        console.error(res.error);
        toast('Failed to save colorant: ' + (res.error.message || 'unknown'), 'error');
        btn.disabled = false;
        btn.textContent = existing ? 'Update' : 'Save';
        return;
      }

      await syncDB();
      toast(existing ? 'Colorant updated' : 'Colorant added', 'success');
      closeModal(root);
      route();
    };
  });
}

/* ─────────────────────────────────────────────
   8.10 COLORANT RESTOCK
   ───────────────────────────────────────────── */
function openColorantRestockForm(colorantId) {
  const c = DB.colorants.find(x => x.id === colorantId);
  if (!c) { toast('Colorant not found', 'error'); return; }

  openModal(`
    <div class="modal-header">
      <div>
        <div class="modal-title">Restock: ${esc(c.name)}</div>
        <div class="text-xs text-muted" style="margin-top:2px;">Current: ${fmtNum(c.stock)} ${esc(c.unit || 'ml')}</div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <form id="crf" style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <label class="label">Quantity to Add (${esc(c.unit || 'ml')}) *</label>
          <input class="input" type="number" step="any" min="0.01" name="qty" required placeholder="e.g. 500" autofocus>
        </div>
        <div>
          <label class="label">Update cost per unit? (₹)</label>
          <input class="input" type="number" step="any" min="0" name="cost" value="${c.cost_per_unit || 0}">
          <div class="field-hint">Leave same if cost hasn't changed</div>
        </div>
      </form>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="crf-save">Add Stock</button>
    </div>
  `, (root) => {
    root.querySelector('#crf-save').onclick = async () => {
      const form = root.querySelector('#crf');
      if (!form.reportValidity()) return;

      const fd = new FormData(form);
      const qty = Number(fd.get('qty')) || 0;
      if (qty <= 0) { toast('Quantity must be greater than 0', 'error'); return; }

      const newCost = Number(fd.get('cost')) || 0;

      const btn = root.querySelector('#crf-save');
      btn.disabled = true;
      btn.textContent = 'Updating...';

      const newStock = (Number(c.stock) || 0) + qty;

      const { error } = await sb.from('colorants').update({
        stock: newStock,
        cost_per_unit: newCost,
        updated_at: new Date().toISOString()
      }).eq('id', c.id);

      if (error) {
        console.error(error);
        toast('Failed to update stock: ' + (error.message || 'unknown'), 'error');
        btn.disabled = false;
        btn.textContent = 'Add Stock';
        return;
      }

      await syncDB();
      toast(`Added ${fmtNum(qty)} ${c.unit || 'ml'} to stock`, 'success');
      closeModal(root);
      route();
    };
  });
}

async function deleteColorant(id) {
  const c = DB.colorants.find(x => x.id === id);
  if (!c) return;

  if (!confirmDlg(`Delete colorant "${c.name}"?\n\nIt has ${fmtNum(c.stock)} ${c.unit || ''} in stock.\n\nThis cannot be undone.`, 'Confirm Delete')) return;

  const { error } = await sb.from('colorants').delete().eq('id', id);
  if (error) {
    console.error(error);
    toast('Failed to delete colorant.', 'error');
    return;
  }

  await syncDB();
  toast('Colorant deleted', 'success');
  route();
}
/* ══════════════════════════════════════════════════════════════════
   STEP 9 — INVOICES (selling workflow + custom mix + print/PDF/share)
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   9.1 HELPERS
   ───────────────────────────────────────────── */
function nextInvoiceNo() {
  let max = 0;
  DB.invoices.forEach(inv => {
    const m = String(inv.invoice_no || '').match(/INV-(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  });
  return 'INV-' + String(max + 1).padStart(4, '0');
}

function variantSellableBatches(variantId) {
  return DB.product_batches
    .filter(b => b.variant_id === variantId && Number(b.qty) > 0)
    .sort((a, b) => {
      const ad = a.mfg_date || '9999-12-31';
      const bd = b.mfg_date || '9999-12-31';
      return String(ad).localeCompare(String(bd));
    });
}

function variantInfo(variantId) {
  const v = DB.variants.find(x => x.id === variantId);
  if (!v) return { variant: null, product: null, brand: null };
  const p = DB.products.find(x => x.id === v.product_id);
  const b = p ? DB.brands.find(x => x.id === p.brand_id) : null;
  return { variant: v, product: p, brand: b };
}

function variantLineLabel(v, p) {
  if (!v || !p) return '—';
  return `${p.name} · ${v.shade_name || '—'} · ${fmtNum(v.pack_size)}${v.pack_unit || ''}`;
}

function calculateVariantStockForInvoice(variantId) {
  const { variant, product } = variantInfo(variantId);
  if (!variant || !product) return 0;
  if (product.batch_managed === false) return Number(variant.stock) || 0;
  return variantSellableBatches(variantId).reduce((s, b) => s + Number(b.qty || 0), 0);
}

/* ─────────────────────────────────────────────
   9.2 INVOICES LIST
   ───────────────────────────────────────────── */
function renderInvoices(content) {
  const list = DB.invoices;

  const totalBilled = list.reduce((s, i) => s + Number(i.total || 0), 0);
  const totalDue = list.reduce((s, i) => s + Number(i.due || 0), 0);

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Invoices</h1>
        <p>${list.length} invoice${list.length === 1 ? '' : 's'} · ${rs(totalBilled)} billed${totalDue > 0 ? ` · ${rs(totalDue)} outstanding` : ''}</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="new-inv-btn">+ New Invoice</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;border-radius:16px;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="inv-search" placeholder="Invoice no, customer or phone...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Status</label>
        <select class="input" id="inv-filter">
          <option value="">All</option>
          <option value="due">Only with due</option>
          <option value="paid">Fully paid</option>
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Sort</label>
        <select class="input" id="inv-sort">
          <option value="date-desc">Newest first</option>
          <option value="date">Oldest first</option>
          <option value="total-desc">Total (high)</option>
          <option value="due-desc">Due (high)</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Customer</th>
            <th>Date</th>
            <th style="text-align:right">Total</th>
            <th style="text-align:right">Paid</th>
            <th style="text-align:right">Due</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="inv-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="inv-mobile"></div>
  `;

  function filtered() {
    const q      = ($('#inv-search').value || '').toLowerCase().trim();
    const flt    = $('#inv-filter').value;
    const sortBy = $('#inv-sort').value;

    let arr = list.filter(i => {
      const hay = ((i.invoice_no || '') + ' ' + (i.customer_name || '') + ' ' + (i.customer_phone || '')).toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (flt === 'due' && Number(i.due) <= 0) return false;
      if (flt === 'paid' && Number(i.due) > 0) return false;
      return true;
    });

    if (sortBy === 'date-desc')        arr.sort((a, b) => txDate(b, 'invoice_date').localeCompare(txDate(a, 'invoice_date')));
    else if (sortBy === 'date')        arr.sort((a, b) => txDate(a, 'invoice_date').localeCompare(txDate(b, 'invoice_date')));
    else if (sortBy === 'total-desc')  arr.sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
    else if (sortBy === 'due-desc')    arr.sort((a, b) => Number(b.due || 0) - Number(a.due || 0));

    return arr;
  }

  function renderList() {
    const arr = filtered();

    const tbody = $('#inv-body');
    if (tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">
             ${list.length === 0
               ? 'No invoices yet — click <b>+ New Invoice</b> to create your first one.'
               : 'No invoices match.'}
           </td></tr>`
        : arr.map(i => {
            const name = i.customer_name || 'Walk-in';
            return `<tr>
              <td>
                <a href="#/invoice/${i.id}" style="font-weight:600;color:var(--text-main);text-decoration:none;">${esc(i.invoice_no || '')}</a>
              </td>
              <td>${esc(name)}</td>
              <td class="text-sm text-muted">${txDT(i, 'invoice_date')}</td>
              <td style="text-align:right;">${rs(i.total)}</td>
              <td style="text-align:right;color:var(--success);">${rs(i.paid)}</td>
              <td style="text-align:right;font-weight:${Number(i.due) > 0 ? '600' : '400'};color:${Number(i.due) > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${rs(i.due)}</td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" data-view="${i.id}">View</button>
                <button class="btn btn-ghost btn-sm" data-del="${i.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('');
    }

    const mob = $('#inv-mobile');
    if (mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">🧾</div>
             <div class="empty-title">${list.length === 0 ? 'No invoices yet' : 'No matches'}</div>
             <div class="empty-desc">${list.length === 0
               ? 'Tap "+ New Invoice" above to create your first one.'
               : 'Try a different search.'}</div>
           </div>`
        : arr.map(i => {
            const name = i.customer_name || 'Walk-in';
            const due = Number(i.due || 0);
            return `
              <a href="#/invoice/${i.id}" class="mobile-card" style="text-decoration:none;color:inherit;">
                <div class="mobile-card-head">
                  <div>
                    <div class="mobile-card-title">${esc(name)}</div>
                    <div class="mobile-card-sub">${esc(i.invoice_no || '')} · ${fmtDate(txDate(i, 'invoice_date'))}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:700;">${rs(i.total)}</div>
                    <div class="text-xs" style="color:${due > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600;margin-top:2px;">
                      ${due > 0 ? 'Due ' + rs(due) : 'Paid'}
                    </div>
                  </div>
                </div>
              </a>
            `;
          }).join('');
    }

    $$('[data-view]').forEach(btn => btn.onclick = () => location.hash = '#/invoice/' + btn.dataset.view);
    $$('[data-del]').forEach(btn => btn.onclick = () => {
      const inv = DB.invoices.find(x => x.id === btn.dataset.del);
      if (inv) deleteInvoice(inv);
    });
  }

  $('#inv-search').oninput = renderList;
  ['inv-filter', 'inv-sort'].forEach(id => {
    const el = $('#' + id);
    if (el) el.onchange = renderList;
  });

  $('#new-inv-btn').onclick = () => location.hash = '#/new-invoice';
  renderList();
}

/* ─────────────────────────────────────────────
   9.3 NEW INVOICE BUILDER
   ───────────────────────────────────────────── */
function renderNewInvoice(content, preselect) {
  preselect = preselect || {};

  let lines = [];
  let selectedCustomer = preselect.customer_id
    ? DB.customers.find(c => c.id === preselect.customer_id)
    : null;

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/invoices" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Invoices</a>
    </div>

    <div class="page-head" style="margin-bottom:24px;">
      <div class="page-head-title">
        <h1>New Invoice</h1>
        <p>Add products, custom mixes, then save</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 360px;gap:24px;align-items:start;" class="invoice-builder-layout">
      <div style="display:flex;flex-direction:column;gap:20px;">

        <!-- Date & Customer -->
        <div class="card" style="border-radius:16px;">
          ${dateTimeFieldHTML(null, '', 'Invoice Date')}
          <div style="margin-top:16px;">
            <label class="label">Customer</label>
            <div style="display:flex;gap:8px;">
              <input class="input" id="ni-cust-name" placeholder="Walk-in (leave blank)" value="${esc(selectedCustomer?.name || '')}" style="flex:2;">
              <input class="input" id="ni-cust-phone" placeholder="Phone (optional)" value="${esc(selectedCustomer?.phone || '')}" style="flex:1;">
              <button type="button" class="btn btn-ghost" id="ni-pick-cust" title="Pick existing customer">👥</button>
            </div>
            <div class="field-hint">Type a name or pick from saved customers</div>
          </div>
        </div>

        <!-- Items -->
        <div class="card" style="border-radius:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
            <label class="label" style="margin:0;">Items</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-ghost btn-sm" id="ni-add-mix">🎨 Custom Mix</button>
              <button type="button" class="btn btn-primary btn-sm" id="ni-add-prod">+ Add Product</button>
            </div>
          </div>
          <div id="ni-lines"></div>
        </div>

      </div>

      <!-- Sticky summary -->
      <div style="position:sticky;top:84px;display:flex;flex-direction:column;gap:16px;">
        <div class="card" style="background:var(--navy);color:#fff;border:0;border-radius:16px;">
          <div style="font-weight:600;font-size:15px;padding-bottom:12px;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.1);">
            Bill Summary
          </div>
          <div id="ni-summary" style="display:flex;flex-direction:column;gap:10px;font-size:13px;"></div>

          <div style="margin-top:20px;display:flex;flex-direction:column;gap:12px;">
            <div>
              <label class="label" style="color:#9CA3AF;">Cash Discount (₹)</label>
              <input class="input" type="number" step="any" min="0" id="ni-disc" value="0" style="background:rgba(255,255,255,0.1);border-color:transparent;color:#fff;">
            </div>
            <div>
              <label class="label" style="color:#9CA3AF;">Paid Now (₹)</label>
              <input class="input" type="number" step="any" min="0" id="ni-paid" value="0" style="background:rgba(255,255,255,0.1);border-color:transparent;color:#fff;">
              <div class="text-xs" style="color:#9CA3AF;margin-top:4px;">Remaining will be recorded as customer udhar</div>
            </div>
          </div>
        </div>

        <div class="card" style="border-radius:16px;">
          <div>
            <label class="label">Notes</label>
            <input class="input" id="ni-notes" placeholder="Optional">
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px;">
            <button type="button" class="btn btn-ghost" id="ni-cancel" style="width:100%;">Cancel</button>
            <button type="button" class="btn btn-primary btn-lg" id="ni-save" style="width:100%;">Save Invoice</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // ── Customer picker ──
  $('#ni-pick-cust').onclick = () => openCustomerPickerModal((c) => {
    selectedCustomer = c;
    $('#ni-cust-name').value = c.name || '';
    $('#ni-cust-phone').value = c.phone || '';
  });

  // ── Add product ──
  $('#ni-add-prod').onclick = () => openVariantPickerModal((variantId) => {
    addProductLine(variantId);
  });

  // ── Add custom mix ──
  $('#ni-add-mix').onclick = () => openCustomMixModal((mixLine) => {
    lines.push(mixLine);
    renderLines();
    updateSummary();
  });

  // ── Add product line ──
  function addProductLine(variantId) {
    const { variant, product } = variantInfo(variantId);
    if (!variant || !product) return;

    const isBatch = product.batch_managed !== false;
    let batchId = null;
    let batchNo = '';

    if (isBatch) {
      const batches = variantSellableBatches(variantId);
      if (batches.length === 0) {
        toast('No stock for this variant — add a batch first', 'error');
        return;
      }
      batchId = batches[0].id;
      batchNo = batches[0].batch_no || '';
    } else {
      if (Number(variant.stock) <= 0) {
        toast('Out of stock', 'error');
        return;
      }
    }

    lines.push({
      line_type: 'product',
      variant_id: variant.id,
      variant_name: product.name,
      shade_name: variant.shade_name || '',
      pack_size: Number(variant.pack_size) || 1,
      pack_unit: variant.pack_unit || '',
      batch_id: batchId,
      batch_no: batchNo,
      qty: 1,
      rate: getSellingPriceForVariant(variant),
      gst_rate: Number(product.gst_rate_default) || 0,
      total: 0
    });
    recalcLineTotals();
    renderLines();
    updateSummary();
  }

  function recalcLineTotals() {
    lines.forEach(l => {
      l.total = (Number(l.qty) || 0) * (Number(l.rate) || 0);
    });
  }

  // ── Render lines ──
  function renderLines() {
    const box = $('#ni-lines');
    if (!lines.length) {
      box.innerHTML = '<p class="text-sm text-muted text-center" style="padding:24px 0;">No items yet. Click <b>+ Add Product</b> or <b>🎨 Custom Mix</b>.</p>';
      return;
    }

    box.innerHTML = lines.map((l, i) => {
      if (l.line_type === 'mix') {
        return `
          <div class="card" style="margin-bottom:8px;padding:16px;background:var(--primary-light);border:1px solid var(--primary);box-shadow:none;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;">
              <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:14px;color:var(--primary);">🎨 Custom Mix: ${esc(l.mix_data.shade_result || 'Custom')}</div>
                <div class="text-xs text-muted" style="margin-top:4px;">
                  Base: ${esc(l.variant_name)} · ${esc(l.shade_name)} · ${fmtNum(l.pack_size)}${esc(l.pack_unit)} × ${fmtNum(l.mix_data.base_qty)}
                  ${l.mix_data.colorants.length ? ' · ' + l.mix_data.colorants.map(c => `${c.qty}${c.unit} ${c.name}`).join(' + ') : ''}
                </div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" data-del="${i}" style="color:var(--danger);padding:4px 8px;">✕</button>
            </div>
            <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <label class="label" style="font-size:10px;">Price (₹)</label>
                <input class="input" type="number" step="any" min="0" data-i="${i}" data-f="rate" value="${l.rate}" style="padding:8px 10px;font-weight:600;color:var(--primary);">
              </div>
              <div>
                <label class="label" style="font-size:10px;">Total</label>
                <div style="padding:8px 10px;background:var(--bg-card);border-radius:var(--radius-sm);font-weight:700;font-size:14px;color:var(--primary);border:1px solid var(--border);">
                  ${rs(l.total)}
                </div>
              </div>
            </div>
          </div>
        `;
      }

      // Regular product line
      const { product } = variantInfo(l.variant_id);
      return `
        <div class="card" style="margin-bottom:8px;padding:16px;background:var(--bg-app);border:1px solid var(--border);box-shadow:none;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:14px;color:var(--text-main);">${esc(l.variant_name)}</div>
              <div class="text-xs text-muted" style="margin-top:2px;">${esc(l.shade_name)} · ${fmtNum(l.pack_size)}${esc(l.pack_unit)}</div>
              ${l.batch_id ? `
                <button type="button" class="chip chip-neutral" data-change-batch="${i}" style="cursor:pointer;margin-top:8px;font-family:monospace;font-size:10px;background:var(--bg-card);border:1px solid var(--border);">
                  B:${esc(l.batch_no || '—')} <span style="opacity:0.6;margin-left:4px;">↻</span>
                </button>
              ` : ''}
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-del="${i}" style="color:var(--danger);padding:4px 8px;">✕</button>
          </div>
          <div class="grid-3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;align-items:end;">
            <div>
              <label class="label" style="font-size:10px;">Qty ${l.pack_size > 0 && l.pack_unit ? '(in ' + esc(l.pack_unit) + ')' : ''}</label>
              <input class="input" type="number" step="any" min="0.001" data-i="${i}" data-f="qty" value="${l.qty}" style="padding:8px 10px;font-weight:600;">
            </div>
            <div>
              <label class="label" style="font-size:10px;">Rate (₹/tin)</label>
              <input class="input" type="number" step="any" min="0" data-i="${i}" data-f="rate" value="${l.rate}" style="padding:8px 10px;font-weight:600;color:var(--primary);">
            </div>
            <div>
              <label class="label" style="font-size:10px;">GST %</label>
              <input class="input" type="number" step="any" min="0" max="100" data-i="${i}" data-f="gst_rate" value="${l.gst_rate}" style="padding:8px 10px;">
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:1px dashed var(--border);">
            <span class="text-xs text-muted" style="font-weight:600;">Line total</span>
            <b class="line-total-val" style="font-size:16px;color:var(--text-main);">${rs(l.total)}</b>
          </div>
        </div>
      `;
    }).join('');

    // Wire inputs
    box.querySelectorAll('input[data-i]').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const i = +e.target.dataset.i;
        const f = e.target.dataset.f;
        if (f === 'gst_rate') {
          lines[i][f] = Number(e.target.value) || 0;
        } else if (f === 'qty') {
          lines[i][f] = Number(e.target.value) || 0;
        } else if (f === 'rate') {
          lines[i][f] = Number(e.target.value) || 0;
        }
        lines[i].total = (Number(lines[i].qty) || 0) * (Number(lines[i].rate) || 0);
        const card = e.target.closest('.card');
        const totalEl = card?.querySelector('.line-total-val');
        if (totalEl) totalEl.textContent = rs(lines[i].total);
        updateSummary();
      });
    });

    box.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = () => {
        lines.splice(+btn.dataset.del, 1);
        renderLines();
        updateSummary();
      };
    });

    box.querySelectorAll('[data-change-batch]').forEach(btn => {
      btn.onclick = () => {
        const i = +btn.dataset.changeBatch;
        const l = lines[i];
        openBatchPickerForLine(l.variant_id, l.batch_id, (batch) => {
          if (batch) {
            lines[i].batch_id = batch.id;
            lines[i].batch_no = batch.batch_no || '';
            renderLines();
          }
        });
      };
    });
  }

  // ── Summary ──
  function updateSummary() {
    recalcLineTotals();
    const subtotal = lines.reduce((s, l) => s + (Number(l.total) || 0), 0);
    const disc = Number($('#ni-disc').value) || 0;
    const total = Math.max(0, subtotal - disc);
    const paid = Math.min(Number($('#ni-paid').value) || 0, total);
    const due = Math.max(0, total - paid);

    // GST inclusive calc
    const taxable = subtotal > 0 ? (total / subtotal) : 1;
    const gstAmt = lines.reduce((s, l) => {
      const t = (Number(l.total) || 0) * taxable;
      const r = Number(l.gst_rate) || 0;
      return s + (t * r / (100 + r));
    }, 0);

    $('#ni-summary').innerHTML = `
      <div style="display:flex;justify-content:space-between;"><span style="color:#9CA3AF;">Subtotal (${lines.length} item${lines.length === 1 ? '' : 's'})</span><b>${rs(subtotal)}</b></div>
      ${disc > 0 ? `<div style="display:flex;justify-content:space-between;"><span style="color:#9CA3AF;">Cash Discount</span><b style="color:#F87171;">− ${rs(disc)}</b></div>` : ''}
      ${gstAmt > 0 ? `<div style="display:flex;justify-content:space-between;"><span style="color:#9CA3AF;">GST (included)</span><b style="color:#FBBF24;">${rs(gstAmt)}</b></div>` : ''}
      <div style="display:flex;justify-content:space-between;font-size:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);margin-top:8px;">
        <b>Total</b><b style="color:#34D399;">${rs(total)}</b>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;">
        <span style="color:#9CA3AF;">Paid</span><b style="color:#34D399;">${rs(paid)}</b>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#9CA3AF;">Due</span><b style="color:${due > 0 ? '#F87171' : '#34D399'};">${rs(due)}</b>
      </div>
    `;
  }

  $('#ni-disc').addEventListener('input', updateSummary);
  $('#ni-paid').addEventListener('input', updateSummary);

  // ── Save ──
  async function onSave() {
    if (lines.length === 0) { toast('Add at least one item', 'error'); return; }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!(Number(l.qty) > 0)) { toast(`Qty must be > 0 for line ${i + 1}`, 'error'); return; }
      if (!(Number(l.rate) > 0)) { toast(`Rate must be > 0 for line ${i + 1}`, 'error'); return; }
    }

    const dEl = document.querySelector('#content input[name="tx_date"]');
    const tEl = document.querySelector('#content input[name="tx_time"]');
    const dv = dEl ? dEl.value : '';
    const tv = (tEl && tEl.value) ? tEl.value.trim() : '';
    if (!dv) { toast('Pick a date', 'error'); return; }
    if (dv > todayStr()) { toast('Future dates not allowed', 'error'); return; }

    // Stock check
    for (const l of lines) {
      if (l.line_type === 'product') {
        const { product } = variantInfo(l.variant_id);
        if (product?.batch_managed === false) {
          const { variant } = variantInfo(l.variant_id);
          if (Number(variant.stock) < Number(l.qty)) {
            toast(`Not enough stock for ${l.variant_name} (have ${fmtNum(variant.stock)})`, 'error');
            return;
          }
        } else {
          const batch = DB.product_batches.find(b => b.id === l.batch_id);
          if (!batch || Number(batch.qty) < Number(l.qty)) {
            toast(`Batch ${l.batch_no} doesn't have enough stock (${fmtNum(batch?.qty || 0)} left)`, 'error');
            return;
          }
        }
      } else if (l.line_type === 'mix') {
        // Base stock
        const { product } = variantInfo(l.variant_id);
        const need = Number(l.mix_data.base_qty);
        if (product?.batch_managed === false) {
          const { variant } = variantInfo(l.variant_id);
          if (Number(variant.stock) < need) { toast('Not enough base paint stock', 'error'); return; }
        } else {
          const batch = DB.product_batches.find(b => b.id === l.batch_id);
          if (!batch || Number(batch.qty) < need) { toast('Not enough base paint stock', 'error'); return; }
        }
        // Colorant stock
        for (const c of l.mix_data.colorants) {
          const col = DB.colorants.find(x => x.id === c.colorant_id);
          if (!col || Number(col.stock) < Number(c.qty)) {
            toast(`Not enough ${c.name} (have ${fmtNum(col?.stock || 0)})`, 'error');
            return;
          }
        }
      }
    }

    const customerName = ($('#ni-cust-name').value || '').trim() || 'Walk-in';
    const customerPhone = ($('#ni-cust-phone').value || '').trim();
    const notes = ($('#ni-notes').value || '').trim();

    const subtotal = lines.reduce((s, l) => s + (Number(l.total) || 0), 0);
    const disc = Number($('#ni-disc').value) || 0;
    const total = Math.max(0, subtotal - disc);
    const paid = Math.min(Number($('#ni-paid').value) || 0, total);
    const due = Math.max(0, total - paid);

    const taxable = subtotal > 0 ? (total / subtotal) : 1;
    const gstAmt = lines.reduce((s, l) => {
      const t = (Number(l.total) || 0) * taxable;
      const r = Number(l.gst_rate) || 0;
      return s + (t * r / (100 + r));
    }, 0);

    const btn = $('#ni-save');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    // 1. Insert invoice
    const invData = {
      invoice_no: nextInvoiceNo(),
      customer_id: selectedCustomer?.id || null,
      customer_name: customerName,
      customer_phone: customerPhone,
      subtotal, cash_discount: disc, gst_amount: gstAmt,
      total, paid, due,
      notes,
      invoice_date: dv,
      tx_time: tv,
      gst_enabled: gstAmt > 0
    };

    const invRes = await sb.from('invoices').insert(invData).select().single();
    if (invRes.error) {
      console.error(invRes.error);
      toast('Failed to save invoice: ' + invRes.error.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Save Invoice';
      return;
    }
    const inv = invRes.data;

    // 2. Process each line
    for (const l of lines) {
      let mixId = null;

      if (l.line_type === 'mix') {
        // Create mix record
        const colorantsJson = l.mix_data.colorants.map(c => ({
          colorant_id: c.colorant_id,
          name: c.name,
          qty: c.qty,
          unit: c.unit || 'ml',
          cost_per_unit: c.cost_per_unit || 0
        }));
        const totalCost = l.mix_data.colorants.reduce((s, c) => s + (Number(c.cost_per_unit) || 0) * (Number(c.qty) || 0), 0);

        const mixRes = await sb.from('mixes').insert({
          mix_no: 'MIX-' + String(Date.now()).slice(-6),
          base_variant_id: l.variant_id,
          base_qty: l.mix_data.base_qty,
          shade_result: l.mix_data.shade_result,
          colorants_json: colorantsJson,
          invoice_id: inv.id,
          customer_name: customerName,
          total_cost: totalCost,
          mix_date: dv,
          tx_time: tv
        }).select().single();

        if (!mixRes.error) mixId = mixRes.data.id;

        // Deduct colorant stock
        for (const c of l.mix_data.colorants) {
          const col = DB.colorants.find(x => x.id === c.colorant_id);
          if (col) {
            await sb.from('colorants').update({
              stock: Math.max(0, Number(col.stock) - Number(c.qty)),
              updated_at: new Date().toISOString()
            }).eq('id', col.id);
          }
        }

        // Deduct base stock
        const { product } = variantInfo(l.variant_id);
        if (product?.batch_managed === false) {
          const { variant } = variantInfo(l.variant_id);
          await sb.from('variants').update({
            stock: Math.max(0, Number(variant.stock) - Number(l.mix_data.base_qty)),
            updated_at: new Date().toISOString()
          }).eq('id', l.variant_id);
        } else {
          const batch = DB.product_batches.find(b => b.id === l.batch_id);
          if (batch) {
            await sb.from('product_batches').update({
              qty: Math.max(0, Number(batch.qty) - Number(l.mix_data.base_qty)),
              updated_at: new Date().toISOString()
            }).eq('id', batch.id);
          }
        }
      } else {
        // Product line — deduct stock
        const { product } = variantInfo(l.variant_id);
        if (product?.batch_managed === false) {
          const { variant } = variantInfo(l.variant_id);
          await sb.from('variants').update({
            stock: Math.max(0, Number(variant.stock) - Number(l.qty)),
            updated_at: new Date().toISOString()
          }).eq('id', l.variant_id);
        } else {
          const batch = DB.product_batches.find(b => b.id === l.batch_id);
          if (batch) {
            await sb.from('product_batches').update({
              qty: Math.max(0, Number(batch.qty) - Number(l.qty)),
              updated_at: new Date().toISOString()
            }).eq('id', batch.id);
          }
        }
      }

      // Insert invoice item
      const taxableLine = (Number(l.total) || 0) * taxable;
      const gstLine = l.gst_rate > 0 ? (taxableLine * l.gst_rate / (100 + l.gst_rate)) : 0;

      await sb.from('invoice_items').insert({
        invoice_id: inv.id,
        variant_id: l.variant_id,
        variant_name: l.line_type === 'mix' ? ('Custom Mix: ' + l.variant_name) : l.variant_name,
        shade_name: l.line_type === 'mix' ? l.mix_data.shade_result : l.shade_name,
        pack_size: l.pack_size,
        pack_unit: l.pack_unit,
        batch_id: l.batch_id,
        batch_no: l.batch_no,
        qty: l.line_type === 'mix' ? 1 : l.qty,
        rate: l.rate,
        gst_rate: l.gst_rate,
        gst_amount: gstLine,
        total: l.total,
        line_type: l.line_type,
        mix_id: mixId
      });
    }

    await syncDB();
    toast('Invoice saved', 'success');

    // Reset form
    lines = [];
    renderLines();
    updateSummary();

    location.hash = '#/invoice/' + inv.id;
  }

  $('#ni-save').onclick = onSave;
  $('#ni-cancel').onclick = () => history.back();

  renderLines();
  updateSummary();
}

/* ─────────────────────────────────────────────
   9.4 CUSTOMER PICKER MODAL
   ───────────────────────────────────────────── */
function openCustomerPickerModal(onPick) {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Pick Customer</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <input class="input" id="cp-search" placeholder="Search by name or phone..." autofocus style="margin-bottom:16px;">
      <div id="cp-list" style="max-height:360px;overflow-y:auto;"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>
  `, (root) => {
    function renderList() {
      const q = (root.querySelector('#cp-search').value || '').toLowerCase().trim();
      const list = DB.customers.filter(c => {
        if (!q) return true;
        return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q);
      }).slice(0, 50);

      const box = root.querySelector('#cp-list');
      if (list.length === 0) {
        box.innerHTML = '<div class="empty-state" style="padding:30px 10px;"><div class="empty-icon">👥</div><div class="empty-title">No matches</div></div>';
        return;
      }

      box.innerHTML = list.map(c => {
        const st = customerStats(c.id);
        return `<div class="panel-list-item" data-cid="${c.id}" style="cursor:pointer;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;padding:12px;background:var(--bg-card);">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;color:var(--text-main);">${esc(c.name)}</div>
            <div class="text-xs text-muted">${esc(c.phone || 'No phone')}</div>
          </div>
          ${st.due > 0 ? `<div class="chip chip-warning" style="font-size:10px;">Due ${rs(st.due)}</div>` : ''}
        </div>`;
      }).join('');

      box.querySelectorAll('[data-cid]').forEach(el => {
        el.onclick = () => {
          const c = DB.customers.find(x => x.id === el.dataset.cid);
          if (c) {
            closeModal(root);
            onPick(c);
          }
        };
      });
    }

    root.querySelector('#cp-search').oninput = renderList;
    renderList();
  });
}

/* ─────────────────────────────────────────────
   9.5 VARIANT PICKER MODAL
   ───────────────────────────────────────────── */
function openVariantPickerModal(onPick) {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Add Product</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <input class="input" id="vp-search" placeholder="Search shade, size, product or brand..." autofocus style="margin-bottom:16px;">
      <div id="vp-list" style="max-height:420px;overflow-y:auto;"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>
  `, (root) => {
    function renderList() {
      const q = (root.querySelector('#vp-search').value || '').toLowerCase().trim();

      const items = DB.variants.map(v => {
        const { product, brand } = variantInfo(v.id);
        if (!product) return null;
        const stock = calculateVariantStockForInvoice(v.id);
        const price = getSellingPriceForVariant(v);
        const hay = (
          (product.name || '') + ' ' +
          (v.shade_name || '') + ' ' +
          (v.shade_code || '') + ' ' +
          (brand?.name || '') + ' ' +
          (fmtNum(v.pack_size)) + (v.pack_unit || '')
        ).toLowerCase();

        return { v, product, brand, stock, price, hay };
      }).filter(Boolean);

      const filtered = items.filter(it => !q || it.hay.includes(q)).slice(0, 60);

      const box = root.querySelector('#vp-list');
      if (filtered.length === 0) {
        box.innerHTML = '<div class="empty-state" style="padding:30px 10px;"><div class="empty-icon">🎨</div><div class="empty-title">No matches</div></div>';
        return;
      }

      box.innerHTML = filtered.map(it => {
        const isOut = it.stock <= 0;
        return `<div class="panel-list-item ${isOut ? 'disabled' : ''}" data-vid="${it.v.id}" style="cursor:${isOut ? 'not-allowed' : 'pointer'};opacity:${isOut ? '0.5' : '1'};border:1px solid var(--border);border-radius:8px;margin-bottom:6px;padding:12px;background:var(--bg-card);">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;color:var(--text-main);font-size:13px;">${esc(it.v.shade_name || '—')} · ${fmtNum(it.v.pack_size)}${esc(it.v.pack_unit || '')}</div>
            <div class="text-xs text-muted" style="margin-top:2px;">${esc(it.product.name)}${it.brand ? ' · ' + esc(it.brand.name) : ''}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-weight:700;font-size:13px;">${rs(it.price)}</div>
            <div class="text-xs" style="color:${isOut ? 'var(--danger)' : 'var(--text-muted)'};margin-top:2px;">
              ${isOut ? 'OUT' : fmtNum(it.stock) + ' in stock'}
            </div>
          </div>
        </div>`;
      }).join('');

      box.querySelectorAll('[data-vid]').forEach(el => {
        el.onclick = () => {
          const v = DB.variants.find(x => x.id === el.dataset.vid);
          if (!v) return;
          const stock = calculateVariantStockForInvoice(v.id);
          if (stock <= 0) { toast('Out of stock', 'error'); return; }
          closeModal(root);
          onPick(v.id);
        };
      });
    }

    root.querySelector('#vp-search').oninput = renderList;
    renderList();
  });
}

/* ─────────────────────────────────────────────
   9.6 BATCH PICKER (for a line)
   ───────────────────────────────────────────── */
function openBatchPickerForLine(variantId, currentBatchId, onPick) {
  const batches = variantSellableBatches(variantId);
  const { variant, product } = variantInfo(variantId);

  openModal(`
    <div class="modal-header">
      <div>
        <div class="modal-title">Pick Batch</div>
        <div class="text-xs text-muted" style="margin-top:2px;">${esc(variantLineLabel(variant, product))}</div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      ${batches.length === 0
        ? '<p class="text-sm text-muted text-center" style="padding:20px;">No sellable batches</p>'
        : batches.map(b => {
            const isCurrent = b.id === currentBatchId;
            return `<div class="panel-list-item ${isCurrent ? 'active' : ''}" data-bid="${b.id}" style="cursor:pointer;border:1px solid ${isCurrent ? 'var(--primary)' : 'var(--border)'};border-radius:8px;margin-bottom:6px;padding:12px;background:${isCurrent ? 'var(--primary-light)' : 'var(--bg-card)'};">
              <div style="flex:1;min-width:0;">
                <div style="font-family:monospace;font-weight:700;color:var(--text-main);">${esc(b.batch_no || '—')}</div>
                <div class="text-xs text-muted" style="margin-top:2px;">MFG: ${fmtDate(b.mfg_date)} · Qty: ${fmtNum(b.qty)} · Cost: ${rs(b.cost)}</div>
              </div>
              ${isCurrent ? '<span class="chip chip-primary" style="font-size:10px;">Current</span>' : ''}
            </div>`;
          }).join('')
      }
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>
  `, (root) => {
    root.querySelectorAll('[data-bid]').forEach(el => {
      el.onclick = () => {
        const b = batches.find(x => x.id === el.dataset.bid);
        if (b) {
          closeModal(root);
          onPick(b);
        }
      };
    });
  });
}

/* ─────────────────────────────────────────────
   9.7 CUSTOM MIX MODAL
   ───────────────────────────────────────────── */
function openCustomMixModal(onAdd) {
  // Only paint variants for base
  const paintVariants = DB.variants.map(v => {
    const { product, brand } = variantInfo(v.id);
    if (!product || product.category !== 'Paint') return null;
    return { v, product, brand, stock: calculateVariantStockForInvoice(v.id) };
  }).filter(x => x && x.stock > 0);

  if (paintVariants.length === 0) {
    toast('No paint variants in stock', 'error');
    return;
  }

  if (DB.colorants.length === 0) {
    toast('Add colorants first in Colorants page', 'error');
    return;
  }

  let state = {
    base_variant_id: paintVariants[0].v.id,
    base_qty: 1,
    base_batch_id: null,
    colorant_rows: [],
    shade_result: '',
    final_price: 0
  };

  // Auto-pick FIFO batch for base
  const initialBatches = variantSellableBatches(state.base_variant_id);
  if (initialBatches.length > 0) state.base_batch_id = initialBatches[0].id;

  openModal(`
    <div class="modal-header">
      <div class="modal-title">🎨 Custom Mix</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <form id="mixf" style="display:flex;flex-direction:column;gap:16px;">

        <div>
          <label class="label">Base Paint *</label>
          <select class="input" id="mix-base">
            ${paintVariants.map(x =>
              `<option value="${x.v.id}" ${state.base_variant_id === x.v.id ? 'selected' : ''}>
                ${esc(x.product.name)} · ${esc(x.v.shade_name || '')} · ${fmtNum(x.v.pack_size)}${esc(x.v.pack_unit || '')} (${fmtNum(x.stock)} in stock)
              </option>`
            ).join('')}
          </select>
        </div>

        <div class="grid-2">
          <div>
            <label class="label">Base Qty (tins) *</label>
            <input class="input" type="number" step="any" min="0.001" id="mix-base-qty" value="${state.base_qty}">
          </div>
          <div>
            <label class="label">Batch</label>
            <select class="input" id="mix-batch">
              ${initialBatches.map(b =>
                `<option value="${b.id}" ${state.base_batch_id === b.id ? 'selected' : ''}>
                  ${esc(b.batch_no || '—')} · Qty ${fmtNum(b.qty)} · ${fmtDate(b.mfg_date)}
                </option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <label class="label" style="margin:0;">Colorants</label>
            <button type="button" class="btn btn-ghost btn-sm" id="mix-add-col">+ Add Colorant</button>
          </div>
          <div id="mix-colorants"></div>
        </div>

        <div>
          <label class="label">Result Shade Name</label>
          <input class="input" id="mix-shade" placeholder="e.g. Light Sky Blue" value="${esc(state.shade_result)}">
        </div>

        <div>
          <label class="label">Final Price (₹) *</label>
          <input class="input" type="number" step="any" min="0" id="mix-price" value="${state.final_price}">
          <div class="field-hint">Prefilled with base cost. Override as needed.</div>
        </div>

      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="mix-add">Add to Invoice</button>
    </div>
  `, (root) => {
    function updateBatchOptions() {
      const vid = root.querySelector('#mix-base').value;
      const batches = variantSellableBatches(vid);
      const batchSel = root.querySelector('#mix-batch');
      batchSel.innerHTML = batches.length === 0
        ? '<option value="">No batches</option>'
        : batches.map(b => `<option value="${b.id}">${esc(b.batch_no || '—')} · Qty ${fmtNum(b.qty)}</option>`).join('');
      state.base_batch_id = batches[0]?.id || null;
    }

    function renderColorants() {
      const box = root.querySelector('#mix-colorants');
      if (state.colorant_rows.length === 0) {
        box.innerHTML = '<p class="text-xs text-muted" style="padding:8px 0;">No colorants added yet.</p>';
        return;
      }
      box.innerHTML = state.colorant_rows.map((r, i) => `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;padding:10px;background:var(--bg-app);border-radius:8px;border:1px solid var(--border);">
          <select class="input" data-ci="${i}" data-f="colorant_id" style="flex:2;">
            ${DB.colorants.map(c => `<option value="${c.id}" ${r.colorant_id === c.id ? 'selected' : ''}>${esc(c.name)} (${fmtNum(c.stock)} ${c.unit || 'ml'} left)</option>`).join('')}
          </select>
          <input class="input" type="number" step="any" min="0" data-ci="${i}" data-f="qty" value="${r.qty || ''}" placeholder="Qty" style="flex:1;min-width:80px;">
          <button type="button" class="btn btn-ghost btn-sm" data-remove-col="${i}" style="color:var(--danger);padding:0 8px;">✕</button>
        </div>
      `).join('');

      box.querySelectorAll('select[data-ci], input[data-ci]').forEach(el => {
        el.onchange = el.oninput = () => {
          const i = +el.dataset.ci;
          state.colorant_rows[i][el.dataset.f] = el.dataset.f === 'qty' ? Number(el.value) || 0 : el.value;
          autoPrice();
        };
      });
      box.querySelectorAll('[data-remove-col]').forEach(btn => {
        btn.onclick = () => {
          state.colorant_rows.splice(+btn.dataset.removeCol, 1);
          renderColorants();
          autoPrice();
        };
      });
    }

    function autoPrice() {
      const vid = root.querySelector('#mix-base').value;
      const { variant } = variantInfo(vid);
      const basePrice = getSellingPriceForVariant(variant) * (Number(root.querySelector('#mix-base-qty').value) || 1);
      const colCost = state.colorant_rows.reduce((s, r) => {
        const c = DB.colorants.find(x => x.id === r.colorant_id);
        return s + (Number(c?.cost_per_unit) || 0) * (Number(r.qty) || 0);
      }, 0);
      const suggested = basePrice + colCost;
      const priceEl = root.querySelector('#mix-price');
      if (priceEl && (!priceEl.value || Number(priceEl.value) === 0)) {
        priceEl.value = suggested.toFixed(2);
      }
      state.final_price = Number(priceEl.value) || suggested;
    }

    root.querySelector('#mix-base').onchange = () => {
      updateBatchOptions();
      autoPrice();
    };
    root.querySelector('#mix-base-qty').oninput = autoPrice;
    root.querySelector('#mix-batch').onchange = (e) => { state.base_batch_id = e.target.value; };
    root.querySelector('#mix-price').oninput = (e) => { state.final_price = Number(e.target.value) || 0; };
    root.querySelector('#mix-shade').oninput = (e) => { state.shade_result = e.target.value; };

    root.querySelector('#mix-add-col').onclick = () => {
      state.colorant_rows.push({ colorant_id: DB.colorants[0]?.id, qty: 10 });
      renderColorants();
      autoPrice();
    };

    root.querySelector('#mix-add').onclick = () => {
      const vid = root.querySelector('#mix-base').value;
      const baseQty = Number(root.querySelector('#mix-base-qty').value) || 0;
      const batchId = root.querySelector('#mix-batch').value;
      const shadeResult = (root.querySelector('#mix-shade').value || '').trim() || 'Custom Mix';
      const finalPrice = Number(root.querySelector('#mix-price').value) || 0;

      if (baseQty <= 0) { toast('Base qty must be > 0', 'error'); return; }
      if (!batchId) { toast('Select a batch', 'error'); return; }
      if (finalPrice <= 0) { toast('Price must be > 0', 'error'); return; }

      // Validate colorants
      for (const r of state.colorant_rows) {
        if (!r.colorant_id || !(r.qty > 0)) { toast('Fill all colorant rows', 'error'); return; }
        const c = DB.colorants.find(x => x.id === r.colorant_id);
        if (!c || Number(c.stock) < Number(r.qty)) { toast(`Not enough ${c?.name || 'colorant'}`, 'error'); return; }
      }

      const { variant, product } = variantInfo(vid);
      const batch = DB.product_batches.find(b => b.id === batchId);
      if (!batch || Number(batch.qty) < baseQty) { toast('Not enough base stock in batch', 'error'); return; }

      const colorants = state.colorant_rows.map(r => {
        const c = DB.colorants.find(x => x.id === r.colorant_id);
        return {
          colorant_id: r.colorant_id,
          name: c?.name || '',
          unit: c?.unit || 'ml',
          qty: Number(r.qty),
          cost_per_unit: Number(c?.cost_per_unit) || 0
        };
      });

      onAdd({
        line_type: 'mix',
        variant_id: variant.id,
        variant_name: product.name,
        shade_name: variant.shade_name || '',
        pack_size: Number(variant.pack_size) || 1,
        pack_unit: variant.pack_unit || '',
        batch_id: batchId,
        batch_no: batch.batch_no || '',
        qty: 1,
        rate: finalPrice,
        gst_rate: Number(product.gst_rate_default) || 0,
        total: finalPrice,
        mix_data: {
          base_qty: baseQty,
          shade_result: shadeResult,
          colorants
        }
      });

      closeModal(root);
    };

    renderColorants();
    autoPrice();
  });
}

/* ─────────────────────────────────────────────
   9.8 INVOICE VIEW
   ───────────────────────────────────────────── */
function renderInvoiceView(content, id) {
  const inv = DB.invoices.find(x => x.id === id);
  if (!inv) {
    content.innerHTML = `
      <div class="empty-state" style="padding:80px 20px;">
        <div class="empty-icon">🧾</div>
        <div class="empty-title">Invoice not found</div>
        <a href="#/invoices" class="btn btn-primary">Back to Invoices</a>
      </div>
    `;
    return;
  }

  const items = DB.invoice_items.filter(x => x.invoice_id === inv.id);
  const customer = inv.customer_id ? DB.customers.find(c => c.id === inv.customer_id) : null;
  const custName = inv.customer_name || customer?.name || 'Walk-in';
  const custPhone = inv.customer_phone || customer?.phone || '';

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/invoices" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Invoices</a>
    </div>

    <div class="page-head" style="margin-bottom:24px;">
      <div class="page-head-title">
        <h1>${esc(inv.invoice_no || '')}</h1>
        <p>${txDT(inv, 'invoice_date')}</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 320px;gap:24px;align-items:start;" class="invoice-view-layout">
      <div style="display:flex;flex-direction:column;gap:20px;">

        <div class="card" style="border-radius:16px;">
          <div class="grid-2">
            <div>
              <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;margin-bottom:6px;">Customer</div>
              <div style="font-weight:700;font-size:16px;">${esc(custName)}</div>
              ${custPhone ? `<div class="text-sm text-muted" style="margin-top:4px;">📞 ${esc(custPhone)}</div>` : ''}
            </div>
          </div>
        </div>

        <div class="card" style="border-radius:16px;">
          <div class="card-title">Items <small>${items.length} line${items.length === 1 ? '' : 's'}</small></div>
          <div class="table-wrap" style="border:0;box-shadow:none;">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Batch</th>
                  <th style="text-align:center">Qty</th>
                  <th style="text-align:right">Rate</th>
                  <th style="text-align:right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(it => `
                  <tr>
                    <td>
                      <strong>${esc(it.variant_name)}</strong>
                      ${it.line_type === 'mix' ? ' <span class="chip chip-primary" style="font-size:9px;">MIX</span>' : ''}
                      <div class="text-xs text-muted" style="margin-top:2px;">${esc(it.shade_name)} · ${fmtNum(it.pack_size)}${esc(it.pack_unit)}</div>
                    </td>
                    <td>${it.batch_no ? `<span class="chip chip-neutral" style="font-family:monospace;font-size:10px;">${esc(it.batch_no)}</span>` : '—'}</td>
                    <td style="text-align:center;">${fmtNum(it.qty)}</td>
                    <td style="text-align:right;">${rs(it.rate)}</td>
                    <td style="text-align:right;font-weight:600;">${rs(it.total)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card" style="border-radius:16px;">
          <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
            <div style="display:flex;justify-content:space-between;"><span class="text-muted">Subtotal</span><b>${rs(inv.subtotal)}</b></div>
            ${Number(inv.cash_discount) > 0 ? `<div style="display:flex;justify-content:space-between;"><span class="text-muted">Cash Discount</span><b style="color:var(--danger);">− ${rs(inv.cash_discount)}</b></div>` : ''}
            ${Number(inv.gst_amount) > 0 ? `<div style="display:flex;justify-content:space-between;"><span class="text-muted">GST (included)</span><b>${rs(inv.gst_amount)}</b></div>` : ''}
            <div style="display:flex;justify-content:space-between;font-size:16px;padding-top:8px;border-top:1px solid var(--border);margin-top:4px;"><b>Total</b><b style="color:var(--primary);">${rs(inv.total)}</b></div>
            <div style="display:flex;justify-content:space-between;"><span class="text-muted">Paid</span><b style="color:var(--success);">${rs(inv.paid)}</b></div>
            <div style="display:flex;justify-content:space-between;"><span class="text-muted">Due</span><b style="color:${Number(inv.due) > 0 ? 'var(--danger)' : 'var(--success)'};">${rs(inv.due)}</b></div>
          </div>
          ${inv.notes ? `<div style="margin-top:16px;padding:12px;background:var(--bg-app);border-radius:var(--radius-sm);font-size:12px;color:var(--text-muted);"><b style="color:var(--text-main);">Notes:</b> ${esc(inv.notes)}</div>` : ''}
        </div>

      </div>

      <div style="position:sticky;top:84px;display:flex;flex-direction:column;gap:16px;">
        <div class="card" style="border-radius:16px;">
          <div class="card-title">Print & Share</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
            <button class="btn btn-ghost" id="btn-print" style="font-size:12px;">🖨 Print</button>
            <button class="btn btn-ghost" id="btn-pdf" style="font-size:12px;">📄 PDF</button>
          </div>
          <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;margin-bottom:8px;">WhatsApp</div>
          <button class="btn" id="btn-wa" style="background:#25D366;color:#fff;justify-content:flex-start;font-size:12px;width:100%;" ${custPhone ? '' : 'disabled'}>
            💬 Send Text
          </button>
          ${!custPhone ? `<div class="field-hint" style="margin-top:10px;">Add a phone number to enable WhatsApp sharing.</div>` : ''}
        </div>

        <div class="card" style="border-radius:16px;">
          <button class="btn btn-danger btn-block" id="btn-del-inv">🗑 Delete Invoice</button>
          <div class="field-hint" style="text-align:center;margin-top:8px;">Stock will be restored</div>
        </div>
      </div>
    </div>

    <div class="text-center text-xs text-muted" style="padding:20px 0;">${enteredOn(inv)}</div>
  `;

  $('#btn-print').onclick = () => printInvoice(inv, items, custPhone);
  $('#btn-pdf').onclick = () => downloadInvoicePDF(inv, items, custPhone);
  if (custPhone) $('#btn-wa').onclick = () => shareInvoiceWhatsApp(inv, items, custPhone);
  $('#btn-del-inv').onclick = () => deleteInvoice(inv);
}

/* ─────────────────────────────────────────────
   9.9 DELETE INVOICE
   ───────────────────────────────────────────── */
async function deleteInvoice(inv) {
  const items = DB.invoice_items.filter(x => x.invoice_id === inv.id);
  const msg = `Delete invoice ${inv.invoice_no} of ${rs(inv.total)}?\n\nStock will be restored to batches + colorants.`;

  if (!confirmDlg(msg, 'Confirm Delete')) return;

  // Restore stock
  for (const it of items) {
    if (it.line_type === 'mix' && it.mix_id) {
      const mix = DB.mixes.find(m => m.id === it.mix_id);
      if (mix) {
        // Restore colorants
        for (const c of (mix.colorants_json || [])) {
          const col = DB.colorants.find(x => x.id === c.colorant_id);
          if (col) {
            await sb.from('colorants').update({
              stock: Number(col.stock) + Number(c.qty),
              updated_at: new Date().toISOString()
            }).eq('id', col.id);
          }
        }
        // Restore base
        const { product } = variantInfo(it.variant_id);
        if (product?.batch_managed === false) {
          const { variant } = variantInfo(it.variant_id);
          await sb.from('variants').update({
            stock: Number(variant.stock) + Number(mix.base_qty),
            updated_at: new Date().toISOString()
          }).eq('id', it.variant_id);
        } else if (it.batch_id) {
          const batch = DB.product_batches.find(b => b.id === it.batch_id);
          if (batch) {
            await sb.from('product_batches').update({
              qty: Number(batch.qty) + Number(mix.base_qty),
              updated_at: new Date().toISOString()
            }).eq('id', batch.id);
          }
        }
      }
    } else {
      const { product } = variantInfo(it.variant_id);
      if (product?.batch_managed === false) {
        const { variant } = variantInfo(it.variant_id);
        if (variant) {
          await sb.from('variants').update({
            stock: Number(variant.stock) + Number(it.qty),
            updated_at: new Date().toISOString()
          }).eq('id', it.variant_id);
        }
      } else if (it.batch_id) {
        const batch = DB.product_batches.find(b => b.id === it.batch_id);
        if (batch) {
          await sb.from('product_batches').update({
            qty: Number(batch.qty) + Number(it.qty),
            updated_at: new Date().toISOString()
          }).eq('id', batch.id);
        }
      }
    }
  }

  // Delete invoice (cascades items + sets mix.invoice_id to null)
  const { error } = await sb.from('invoices').delete().eq('id', inv.id);
  if (error) {
    console.error(error);
    toast('Failed to delete invoice.', 'error');
    return;
  }

  await syncDB();
  toast('Invoice deleted · stock restored', 'success');
  location.hash = '#/invoices';
}

/* ─────────────────────────────────────────────
   9.10 PRINT / PDF / WHATSAPP
   ───────────────────────────────────────────── */
function buildInvoicePlainText(inv, items, phone) {
  const W = 32;
  const line = (l, r) => {
    l = String(l || '');
    r = String(r || '');
    if (l.length + r.length >= W) l = l.slice(0, W - r.length - 1);
    return l + ' '.repeat(Math.max(1, W - l.length - r.length)) + r;
  };
  const dash = '-'.repeat(W);

  let t = '';
  t += (SETTINGS.shop_name || 'PaintBook') + '\n';
  if (SETTINGS.address) t += SETTINGS.address + '\n';
  if (SETTINGS.city) t += SETTINGS.city + '\n';
  if (SETTINGS.phone) t += 'Ph: ' + SETTINGS.phone + '\n';
  if (SETTINGS.gst_enabled && SETTINGS.gst_number) t += 'GSTIN: ' + SETTINGS.gst_number + '\n';
  t += dash + '\n';
  t += line('Bill: ' + (inv.invoice_no || ''), fmtDate(txDate(inv, 'invoice_date'))) + '\n';
  t += 'Customer: ' + (inv.customer_name || 'Walk-in') + '\n';
  if (inv.customer_phone) t += 'Ph: ' + inv.customer_phone + '\n';
  t += dash + '\n';

  items.forEach(it => {
    t += (it.variant_name || '') + '\n';
    if (it.shade_name) t += '  ' + it.shade_name + ' ' + fmtNum(it.pack_size) + (it.pack_unit || '') + '\n';
    if (it.batch_no) t += '  B:' + it.batch_no + '\n';
    t += line('  ' + fmtNum(it.qty) + ' x Rs.' + Number(it.rate || 0).toFixed(2), 'Rs.' + Number(it.total || 0).toFixed(2)) + '\n';
  });

  t += dash + '\n';
  t += line('Subtotal', 'Rs.' + Number(inv.subtotal || 0).toFixed(2)) + '\n';
  if (Number(inv.cash_discount) > 0) t += line('Discount', '-Rs.' + Number(inv.cash_discount).toFixed(2)) + '\n';
  if (Number(inv.gst_amount) > 0) t += line('GST (incl.)', 'Rs.' + Number(inv.gst_amount).toFixed(2)) + '\n';
  t += line('TOTAL', 'Rs.' + Number(inv.total || 0).toFixed(2)) + '\n';
  t += line('Paid', 'Rs.' + Number(inv.paid || 0).toFixed(2)) + '\n';
  if (Number(inv.due) > 0) t += line('DUE', 'Rs.' + Number(inv.due).toFixed(2)) + '\n';
  t += dash + '\n';
  t += (SETTINGS.print_footer || 'Thank you! Visit again') + '\n';
  return t;
}

function printInvoice(inv, items, phone) {
  const text = buildInvoicePlainText(inv, items, phone);
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page{size:58mm auto;margin:2mm}body{font-family:ui-monospace,monospace;font-size:11px;line-height:1.35;color:#000;margin:0;padding:0;white-space:pre-wrap;}</style></head><body>' + esc(text) + '</body></html>');
  doc.close();

  setTimeout(() => {
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { toast('Print failed: ' + e.message, 'error'); }
    setTimeout(() => iframe.remove(), 60000);
  }, 200);
}

function downloadInvoicePDF(inv, items, phone) {
  if (!(window.jspdf && window.jspdf.jsPDF)) {
    toast('PDF library not loaded', 'error');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(SETTINGS.shop_name || 'PaintBook', 14, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let y = 26;
  if (SETTINGS.address) { doc.text(SETTINGS.address, 14, y); y += 4; }
  if (SETTINGS.city) { doc.text(SETTINGS.city, 14, y); y += 4; }
  if (SETTINGS.phone) { doc.text('Ph: ' + SETTINGS.phone, 14, y); y += 4; }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('INVOICE', 14, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  y += 14;
  doc.text('Invoice No:', 14, y); doc.text(String(inv.invoice_no || ''), 45, y); y += 5;
  doc.text('Date:', 14, y); doc.text(fmtDate(txDate(inv, 'invoice_date')), 45, y); y += 5;
  doc.text('Customer:', 14, y); doc.text(inv.customer_name || 'Walk-in', 45, y); y += 5;
  if (inv.customer_phone) { doc.text('Phone:', 14, y); doc.text(inv.customer_phone, 45, y); y += 5; }

  const body = items.map(it => [
    (it.variant_name || '') + (it.shade_name ? ' · ' + it.shade_name : ''),
    it.batch_no || '-',
    fmtNum(it.qty) + ' ' + (it.pack_unit || ''),
    Number(it.rate || 0).toFixed(2),
    Number(it.total || 0).toFixed(2)
  ]);

  doc.autoTable({
    startY: y + 6,
    head: [['Item', 'Batch', 'Qty', 'Rate', 'Amount']],
    body,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [91, 91, 214], textColor: 255 }
  });

  let ty = doc.lastAutoTable.finalY + 8;
  const rightX = 196;
  const labelX = 130;

  doc.text('Subtotal:', labelX, ty); doc.text('Rs.' + Number(inv.subtotal || 0).toFixed(2), rightX, ty, { align: 'right' }); ty += 5;
  if (Number(inv.cash_discount) > 0) { doc.text('Cash Discount:', labelX, ty); doc.text('-Rs.' + Number(inv.cash_discount).toFixed(2), rightX, ty, { align: 'right' }); ty += 5; }
  if (Number(inv.gst_amount) > 0) { doc.text('GST (incl):', labelX, ty); doc.text('Rs.' + Number(inv.gst_amount).toFixed(2), rightX, ty, { align: 'right' }); ty += 5; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('TOTAL:', labelX, ty); doc.text('Rs.' + Number(inv.total || 0).toFixed(2), rightX, ty, { align: 'right' }); ty += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text('Paid:', labelX, ty); doc.text('Rs.' + Number(inv.paid || 0).toFixed(2), rightX, ty, { align: 'right' }); ty += 5;
  doc.text('Due:', labelX, ty); doc.text('Rs.' + Number(inv.due || 0).toFixed(2), rightX, ty, { align: 'right' });

  doc.save('Invoice-' + (inv.invoice_no || '').replace(/[^\w-]/g, '') + '.pdf');
  toast('PDF downloaded', 'success');
}

function shareInvoiceWhatsApp(inv, items, phone) {
  if (!phone) { toast('No phone number', 'error'); return; }

  const shopName = SETTINGS.shop_name || 'PaintBook';
  let msg = '*' + shopName + '*\n';
  if (SETTINGS.address) msg += SETTINGS.address + '\n';
  if (SETTINGS.phone) msg += 'Ph: ' + SETTINGS.phone + '\n\n';

  msg += '*' + (inv.invoice_no || '') + '*\n';
  msg += 'Date: ' + fmtDate(txDate(inv, 'invoice_date')) + '\n';
  msg += 'Customer: ' + (inv.customer_name || 'Walk-in') + '\n\n';

  msg += '*Items:*\n';
  items.forEach((it, i) => {
    msg += (i + 1) + '. ' + (it.variant_name || '');
    if (it.shade_name) msg += ' · ' + it.shade_name;
    if (it.pack_size) msg += ' ' + fmtNum(it.pack_size) + (it.pack_unit || '');
    msg += '\n   Qty: ' + fmtNum(it.qty) + ' × ₹' + Number(it.rate || 0).toFixed(2) + ' = ₹' + Number(it.total || 0).toFixed(2) + '\n';
  });

  msg += '\n--------------------\n';
  msg += 'Subtotal: ₹' + Number(inv.subtotal || 0).toFixed(2) + '\n';
  if (Number(inv.cash_discount) > 0) msg += 'Discount: -₹' + Number(inv.cash_discount).toFixed(2) + '\n';
  if (Number(inv.gst_amount) > 0) msg += 'GST (incl): ₹' + Number(inv.gst_amount).toFixed(2) + '\n';
  msg += '*TOTAL: ₹' + Number(inv.total || 0).toFixed(2) + '*\n';
  msg += 'Paid: ₹' + Number(inv.paid || 0).toFixed(2) + '\n';
  msg += '*Due: ₹' + Number(inv.due || 0).toFixed(2) + '*\n\n';
  msg += (SETTINGS.print_footer || 'Thank you! Visit again');

  const clean = String(phone).replace(/\D/g, '');
  const withCC = clean.length === 10 ? '91' + clean : clean;
  window.open('https://wa.me/' + withCC + '?text=' + encodeURIComponent(msg), '_blank');
}

/* ─────────────────────────────────────────────
   9.11 DASHBOARD OVERRIDE (real numbers)
   ───────────────────────────────────────────── */
function renderDashboard(content) {
  const today = todayStr();
  const todayInv = DB.invoices.filter(i => txDate(i, 'invoice_date') === today);
  const todaySales = todayInv.reduce((s, i) => s + Number(i.total || 0), 0);

  let totalDue = 0;
  DB.customers.forEach(c => { totalDue += customerStats(c.id).due; });

  const lowStockCount = DB.variants.filter(v => {
    const { product } = variantInfo(v.id);
    const stock = calculateVariantStockForInvoice(v.id);
    return stock <= (Number(v.low_stock_alert) || 0);
  }).length;

  const thisMonth = today.slice(0, 7);
  const monthMixes = DB.mixes.filter(m => String(m.mix_date || '').slice(0, 7) === thisMonth).length;

  const brandCount = DB.brands.length;
  const productCount = DB.products.length;
  const variantCount = DB.variants.length;

  const setupSteps = [
    { label: 'Create at least one brand', done: brandCount > 0, href: '#/brands', icon: '🏷️' },
    { label: 'Add your first product', done: productCount > 0, href: '#/products', icon: '🎨' },
    { label: 'Add variants (shades × sizes)', done: variantCount > 0, href: '#/products', icon: '🎨' },
    { label: 'Add stock via batches', done: DB.product_batches.length > 0, href: '#/batches', icon: '📦' },
    { label: 'Add colorants for custom mixes', done: DB.colorants.length > 0, href: '#/colorants', icon: '🎨' },
    { label: 'Record your first invoice', done: DB.invoices.length > 0, href: '#/new-invoice', icon: '🧾' }
  ];

  const doneCount = setupSteps.filter(s => s.done).length;
  const setupComplete = doneCount === setupSteps.length;

  content.innerHTML = `
    <div class="page-head" style="align-items:center;margin-bottom:24px;">
      <div class="page-head-title">
        <h1 style="font-size:24px;">Dashboard</h1>
        <p style="font-size:13px;color:#6B7280;">
          ${setupComplete ? 'Everything set up — you\'re ready to sell.' : `Setup: ${doneCount}/${setupSteps.length} complete`}
        </p>
      </div>
      <div class="page-head-actions">
        <a href="#/new-invoice" class="btn btn-primary" style="text-decoration:none;">+ New Invoice</a>
      </div>
    </div>

    <div class="kpi-row" style="margin-bottom:20px;">
      <div class="kpi-card" style="border-radius:16px;">
        <div class="kpi-card-top">
          <div class="kpi-label">Today's Sales</div>
          <div class="kpi-icon" style="color:#10B981;background:#D1FAE5;">💰</div>
        </div>
        <div class="kpi-value">${rs(todaySales)}</div>
        <div class="kpi-trend text-muted">${todayInv.length} invoice${todayInv.length === 1 ? '' : 's'}</div>
      </div>
      <div class="kpi-card" style="border-radius:16px;">
        <div class="kpi-card-top">
          <div class="kpi-label">Total Udhar</div>
          <div class="kpi-icon" style="color:#F59E0B;background:#FEF3C7;">💳</div>
        </div>
        <div class="kpi-value" style="color:${totalDue > 0 ? 'var(--danger)' : 'var(--text-main)'};">${rs(totalDue)}</div>
        <div class="kpi-trend text-muted">across customers</div>
      </div>
      <div class="kpi-card" style="border-radius:16px;">
        <div class="kpi-card-top">
          <div class="kpi-label">Low Stock</div>
          <div class="kpi-icon" style="color:var(--danger);background:var(--danger-bg);">⚠️</div>
        </div>
        <div class="kpi-value">${lowStockCount}</div>
        <div class="kpi-trend text-muted">variants</div>
      </div>
      <div class="kpi-card" style="border-radius:16px;">
        <div class="kpi-card-top">
          <div class="kpi-label">Custom Mixes</div>
          <div class="kpi-icon" style="color:#5B5BD6;background:#EEEEFB;">🎨</div>
        </div>
        <div class="kpi-value">${monthMixes}</div>
        <div class="kpi-trend text-muted">this month</div>
      </div>
    </div>

    ${!setupComplete ? `
      <div class="card" style="margin-bottom:20px;border-radius:16px;">
        <div class="card-title" style="font-size:15px;margin-bottom:20px;">
          🚀 Getting Started
          <small>${doneCount}/${setupSteps.length} done</small>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${setupSteps.map((s, i) => `
            <a href="${s.href}" style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:${s.done ? 'var(--success-bg)' : 'var(--bg-app)'};border:1px solid ${s.done ? 'var(--success)' : 'var(--border)'};border-radius:12px;text-decoration:none;color:inherit;">
              <div style="width:36px;height:36px;background:${s.done ? 'var(--success)' : 'var(--bg-card)'};color:${s.done ? '#fff' : 'var(--text-muted)'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">
                ${s.done ? '✓' : (i + 1)}
              </div>
              <div style="flex:1;">
                <div style="font-weight:600;font-size:13px;color:${s.done ? 'var(--success)' : 'var(--text-main)'};">${esc(s.label)}</div>
                <div class="text-xs text-muted">${s.done ? 'Completed' : 'Pending'}</div>
              </div>
              <div style="color:var(--text-muted);font-size:16px;">›</div>
            </a>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${DB.invoices.length > 0 ? `
      <div class="card" style="border-radius:16px;">
        <div class="card-title" style="font-size:15px;margin-bottom:20px;">Recent Invoices <small>Last 5</small></div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${DB.invoices.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5).map(i => `
            <a href="#/invoice/${i.id}" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--bg-app);border-radius:8px;text-decoration:none;color:inherit;gap:12px;">
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:13px;">${esc(i.customer_name || 'Walk-in')}</div>
                <div class="text-xs text-muted">${esc(i.invoice_no)} · ${fmtDate(txDate(i, 'invoice_date'))}</div>
              </div>
              <div style="text-align:right;flex-shrink:0;">
                <div style="font-weight:700;">${rs(i.total)}</div>
                ${Number(i.due) > 0 ? `<div class="text-xs" style="color:var(--danger);margin-top:2px;">Due ${rs(i.due)}</div>` : `<div class="text-xs" style="color:var(--success);margin-top:2px;">Paid</div>`}
              </div>
            </a>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="text-center text-xs text-muted" style="padding:24px 0;">PaintBook ${APP_VERSION}</div>
  `;
}
/* ══════════════════════════════════════════════════════════════════
   STEP 10 — SUPPLIERS + PURCHASES
   Purchase bills that auto-create batches and stock
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   10.0 DB INIT + SYNC OVERRIDE
   ───────────────────────────────────────────── */
if (!DB.suppliers)         DB.suppliers         = [];
if (!DB.purchases)         DB.purchases         = [];
if (!DB.purchase_items)    DB.purchase_items    = [];
if (!DB.supplier_payments) DB.supplier_payments = [];

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
  window.DB_ERROR = null;

  const errors = [];
  const tables = [
    'brands', 'products', 'variants', 'product_batches',
    'customers', 'invoices', 'invoice_items', 'payments',
    'colorants', 'mixes',
    'suppliers', 'purchases', 'purchase_items', 'supplier_payments'
  ];

  const results = await Promise.allSettled(tables.map(t => fetchAllRows(t)));

  results.forEach((res, i) => {
    const name = tables[i];
    if (res.status === 'fulfilled') {
      DB[name] = res.value;
    } else {
      errors.push(res.reason.message || String(res.reason));
    }
  });

  try {
    const { data, error } = await sb.from('settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    if (data) {
      SETTINGS = {
        shop_name:               data.shop_name               || 'PaintBook',
        owner_name:              data.owner_name              || 'Owner',
        address:                 data.address                 || '',
        city:                    data.city                    || '',
        phone:                   data.phone                   || '',
        email:                   data.email                   || '',
        upi:                     data.upi                     || '',
        logo:                    data.logo                    || '',
        gst_enabled:             !!data.gst_enabled,
        gst_number:              data.gst_number              || '',
        gst_rate:                Number(data.gst_rate)        || 0,
        low_stock_alert_default: Number(data.low_stock_alert_default) || 5,
        print_footer:            data.print_footer            || 'Thank you! Visit again',
        loaded:                  true
      };
      DB.settings = data;
    } else {
      SETTINGS.loaded = true;
    }
    applyFavicon();
  } catch (e) {
    errors.push('settings - ' + (e.message || e));
    SETTINGS.loaded = true;
  }

  window.DB_SYNCED = errors.length === 0;
  window.DB_ERROR = errors.length ? errors[0] : null;
  window.DB_SYNCING = false;

  if (errors.length) {
    console.error('[PaintBook] Sync errors:', errors);
    if (!window.__syncErrorShown) {
      toast('Sync issue: ' + (errors[0] || 'Unknown'), 'error');
      window.__syncErrorShown = true;
    }
  } else {
    window.__syncErrorShown = false;
  }

  return { ok: errors.length === 0, errors };
}

/* ─────────────────────────────────────────────
   10.1 SUPPLIER HELPERS
   ───────────────────────────────────────────── */
function supplierTypeLabel(type) {
  return {
    'company':     'Company',
    'distributor': 'Distributor',
    'wholesaler':  'Wholesaler',
    'other':       'Other'
  }[type] || 'Distributor';
}

function supplierTypeChip(type) {
  const cls = {
    'company':     'chip-primary',
    'distributor': 'chip-success',
    'wholesaler':  'chip-warning',
    'other':       'chip-neutral'
  }[type] || 'chip-neutral';
  return `<span class="chip ${cls}" style="font-size:10px;">${supplierTypeLabel(type)}</span>`;
}

function supplierTotals(supplierId) {
  const s = DB.suppliers.find(x => x.id === supplierId);
  const opening = Number(s?.opening_balance) || 0;

  const bills = DB.purchases.filter(b => b.supplier_id === supplierId);
  const pays  = DB.supplier_payments.filter(p => p.supplier_id === supplierId);

  const total_purchase = bills.reduce((sum, b) => sum + Number(b.total || 0), 0);
  const bill_paid      = bills.reduce((sum, b) => sum + Number(b.paid  || 0), 0);
  const extra_paid     = pays.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const total_paid     = bill_paid + extra_paid;
  const total_due      = Math.max(0, opening + total_purchase - total_paid);

  return { total_purchase, total_paid, total_due, opening, bill_paid, extra_paid };
}

/* ─────────────────────────────────────────────
   10.2 SUPPLIERS LIST
   ───────────────────────────────────────────── */
function renderSuppliers(content) {
  const list = DB.suppliers;

  const totalDue = list.reduce((s, x) => s + supplierTotals(x.id).total_due, 0);
  const withDue  = list.filter(x => supplierTotals(x.id).total_due > 0).length;

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Suppliers</h1>
        <p>${list.length} supplier${list.length === 1 ? '' : 's'}${withDue > 0 ? ` · ${withDue} with pending payable` : ''}</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="add-sup">+ Add Supplier</button>
      </div>
    </div>

    ${totalDue > 0 ? `
      <div class="card" style="margin-bottom:20px;background:var(--danger-bg);border-color:var(--danger);border-radius:12px;box-shadow:none;">
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
          <div style="font-size:24px;">💸</div>
          <div style="flex:1;min-width:200px;">
            <div style="font-weight:700;color:#991b1b;font-size:13px;">Total payable to suppliers</div>
            <div style="font-size:22px;font-weight:800;color:#991b1b;margin-top:4px;">${rs(totalDue)}</div>
          </div>
          <div class="text-sm" style="color:#991b1b;">Across ${withDue} supplier${withDue === 1 ? '' : 's'}</div>
        </div>
      </div>
    ` : ''}

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;border-radius:16px;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="s-search" placeholder="Name, shop or phone...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Type</label>
        <select class="input" id="s-type">
          <option value="">All types</option>
          <option value="company">Company</option>
          <option value="distributor">Distributor</option>
          <option value="wholesaler">Wholesaler</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Due</label>
        <select class="input" id="s-filter">
          <option value="">All</option>
          <option value="due">Only with due</option>
          <option value="nodue">Only cleared</option>
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Sort</label>
        <select class="input" id="s-sort">
          <option value="name">Name (A–Z)</option>
          <option value="due-desc">Due (high first)</option>
          <option value="newest">Newest first</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Supplier</th>
            <th>Type</th>
            <th>Phone</th>
            <th style="text-align:right">Billed</th>
            <th style="text-align:right">Due</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="s-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="s-mobile"></div>
  `;

  function filtered() {
    const q      = ($('#s-search').value || '').toLowerCase().trim();
    const typ    = $('#s-type').value;
    const flt    = $('#s-filter').value;
    const sortBy = $('#s-sort').value;

    let arr = list.map(s => ({ ...s, _t: supplierTotals(s.id) }));

    if (q) arr = arr.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.shop_name || '').toLowerCase().includes(q) ||
      (s.phone || '').includes(q)
    );
    if (typ) arr = arr.filter(s => s.type === typ);
    if (flt === 'due')   arr = arr.filter(s => s._t.total_due > 0);
    if (flt === 'nodue') arr = arr.filter(s => s._t.total_due <= 0);

    if (sortBy === 'name')          arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortBy === 'due-desc') arr.sort((a, b) => b._t.total_due - a._t.total_due);
    else if (sortBy === 'newest')   arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return arr;
  }

  function renderList() {
    const arr = filtered();

    const tbody = $('#s-body');
    if (tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">
             ${list.length === 0
               ? 'No suppliers yet — click <b>+ Add Supplier</b> to create your first one.'
               : 'No suppliers match.'}
           </td></tr>`
        : arr.map(s => {
            const t = s._t;
            const init = (s.name || 'S').charAt(0).toUpperCase();
            return `<tr>
              <td>
                <div style="display:flex;align-items:center;gap:12px;">
                  <div class="table-avatar" style="margin:0;">${esc(init)}</div>
                  <div>
                    <a href="#/supplier/${s.id}" style="font-weight:600;color:var(--text-main);text-decoration:none;">${esc(s.name)}</a>
                    ${s.shop_name ? `<div class="text-xs text-muted" style="margin-top:2px;">${esc(s.shop_name)}</div>` : ''}
                  </div>
                </div>
              </td>
              <td>${supplierTypeChip(s.type)}</td>
              <td>${s.phone ? `<a href="tel:${esc(s.phone)}" style="color:var(--text-muted);">${esc(s.phone)}</a>` : '—'}</td>
              <td style="text-align:right;">${rs(t.total_purchase)}</td>
              <td style="text-align:right;font-weight:${t.total_due > 0 ? '700' : '400'};color:${t.total_due > 0 ? 'var(--danger)' : 'var(--text-muted)'};">
                ${rs(t.total_due)}
              </td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" data-view="${s.id}">View</button>
                <button class="btn btn-ghost btn-sm" data-del="${s.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('');
    }

    const mob = $('#s-mobile');
    if (mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">🚚</div>
             <div class="empty-title">${list.length === 0 ? 'No suppliers yet' : 'No matches'}</div>
             <div class="empty-desc">${list.length === 0
               ? 'Tap "+ Add Supplier" above to create your first one.'
               : 'Try a different search.'}</div>
           </div>`
        : arr.map(s => {
            const t = s._t;
            const init = (s.name || 'S').charAt(0).toUpperCase();
            return `
              <a href="#/supplier/${s.id}" class="mobile-card" style="text-decoration:none;color:inherit;">
                <div class="mobile-card-head">
                  <div style="display:flex;gap:12px;align-items:center;min-width:0;flex:1;">
                    <div class="table-avatar" style="margin:0;">${esc(init)}</div>
                    <div style="min-width:0;">
                      <div class="mobile-card-title">${esc(s.name)}</div>
                      <div class="mobile-card-sub">${supplierTypeLabel(s.type)}${s.phone ? ' · ' + esc(s.phone) : ''}</div>
                    </div>
                  </div>
                  <div style="text-align:right;flex-shrink:0;">
                    <div style="font-weight:700;color:${t.total_due > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${rs(t.total_due)}</div>
                    <div class="text-xs text-muted" style="margin-top:2px;">${t.total_due > 0 ? 'Payable' : 'Clear'}</div>
                  </div>
                </div>
              </a>
            `;
          }).join('');
    }

    $$('[data-view]').forEach(btn => btn.onclick = () => location.hash = '#/supplier/' + btn.dataset.view);
    $$('[data-del]').forEach(btn => btn.onclick = () => deleteSupplier(btn.dataset.del));
  }

  $('#s-search').oninput = renderList;
  ['s-type', 's-filter', 's-sort'].forEach(id => {
    const el = $('#' + id);
    if (el) el.onchange = renderList;
  });

  $('#add-sup').onclick = () => openSupplierForm();
  renderList();
}

/* ─────────────────────────────────────────────
   10.3 SUPPLIER FORM
   ───────────────────────────────────────────── */
function openSupplierForm(existing) {
  const s = existing || {
    name: '',
    type: 'distributor',
    shop_name: '',
    phone: '',
    email: '',
    address: '',
    gst: '',
    notes: '',
    opening_balance: 0
  };

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${existing ? 'Edit' : 'New'} Supplier</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <form id="supf" style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <label class="label">Supplier Name *</label>
          <input class="input" name="name" required value="${esc(s.name || '')}" placeholder="e.g. Asian Paints Depot" autofocus>
        </div>

        <div class="grid-2">
          <div>
            <label class="label">Type *</label>
            <select class="input" name="type">
              <option value="company"     ${s.type === 'company'     ? 'selected' : ''}>Company (manufacturer)</option>
              <option value="distributor" ${s.type === 'distributor' ? 'selected' : ''}>Distributor</option>
              <option value="wholesaler"  ${s.type === 'wholesaler'  ? 'selected' : ''}>Wholesaler</option>
              <option value="other"       ${s.type === 'other'       ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div>
            <label class="label">Shop / Firm Name</label>
            <input class="input" name="shop_name" value="${esc(s.shop_name || '')}" placeholder="Optional">
          </div>
        </div>

        <div class="grid-2">
          <div>
            <label class="label">Phone</label>
            <input class="input" type="tel" name="phone" value="${esc(s.phone || '')}" placeholder="10-digit mobile">
          </div>
          <div>
            <label class="label">Email</label>
            <input class="input" type="email" name="email" value="${esc(s.email || '')}">
          </div>
        </div>

        <div>
          <label class="label">Address</label>
          <input class="input" name="address" value="${esc(s.address || '')}">
        </div>

        <div class="grid-2">
          <div>
            <label class="label">GSTIN</label>
            <input class="input" name="gst" value="${esc(s.gst || '')}" placeholder="22AAAAA0000A1Z5">
          </div>
          <div>
            <label class="label">Opening Balance (₹)</label>
            <input class="input" type="number" step="any" name="opening_balance" value="${s.opening_balance || 0}">
          </div>
        </div>

        <div>
          <label class="label">Notes</label>
          <textarea class="input" name="notes" placeholder="Optional">${esc(s.notes || '')}</textarea>
        </div>
      </form>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="supf-save">${existing ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    const nameInput = root.querySelector('[name="name"]');
    if (nameInput) nameInput.focus();

    root.querySelector('#supf-save').onclick = async () => {
      const form = root.querySelector('#supf');
      if (!form.reportValidity()) return;

      const fd = new FormData(form);
      const name = (fd.get('name') || '').trim();
      if (!name) { toast('Name is required', 'error'); return; }

      const data = {
        name,
        type:            (fd.get('type') || 'distributor').trim(),
        shop_name:       (fd.get('shop_name') || '').trim(),
        phone:           (fd.get('phone') || '').trim(),
        email:           (fd.get('email') || '').trim(),
        address:         (fd.get('address') || '').trim(),
        gst:             (fd.get('gst') || '').trim(),
        notes:           (fd.get('notes') || '').trim(),
        opening_balance: Number(fd.get('opening_balance')) || 0
      };

      const btn = root.querySelector('#supf-save');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      let res;
      if (existing) res = await sb.from('suppliers').update(data).eq('id', existing.id).select().single();
      else          res = await sb.from('suppliers').insert(data).select().single();

      if (res.error) {
        console.error(res.error);
        toast('Failed to save supplier: ' + (res.error.message || 'unknown'), 'error');
        btn.disabled = false;
        btn.textContent = existing ? 'Update' : 'Save';
        return;
      }

      await syncDB();
      toast(existing ? 'Supplier updated' : 'Supplier added', 'success');
      closeModal(root);

      if (!existing && res.data) location.hash = '#/supplier/' + res.data.id;
      else route();
    };
  });
}

async function deleteSupplier(id) {
  const s = DB.suppliers.find(x => x.id === id);
  if (!s) return;

  const billCount = DB.purchases.filter(b => b.supplier_id === id).length;
  const payCount  = DB.supplier_payments.filter(p => p.supplier_id === id).length;

  let msg = `Delete supplier "${s.name}"?`;
  if (billCount || payCount) {
    msg += `\n\n⚠️ ${billCount} purchase bill${billCount === 1 ? '' : 's'} and ${payCount} payment${payCount === 1 ? '' : 's'} will remain but lose the supplier link.`;
  }
  msg += '\n\nThis cannot be undone.';

  if (!confirmDlg(msg, 'Confirm Delete')) return;

  const { error } = await sb.from('suppliers').delete().eq('id', id);
  if (error) {
    console.error(error);
    toast('Failed to delete supplier.', 'error');
    return;
  }

  await syncDB();
  toast('Supplier deleted', 'success');
  route();
}

/* ─────────────────────────────────────────────
   10.4 SUPPLIER PROFILE
   ───────────────────────────────────────────── */
function renderSupplierProfile(content, id) {
  const s = DB.suppliers.find(x => x.id === id);
  if (!s) {
    content.innerHTML = `
      <div class="empty-state" style="padding:80px 20px;">
        <div class="empty-icon">🚚</div>
        <div class="empty-title">Supplier not found</div>
        <a href="#/suppliers" class="btn btn-primary">Back to Suppliers</a>
      </div>
    `;
    return;
  }

  const t = supplierTotals(id);
  const bills = DB.purchases
    .filter(b => b.supplier_id === id)
    .sort((a, b) => txDate(b, 'bill_date').localeCompare(txDate(a, 'bill_date')));
  const pays = DB.supplier_payments
    .filter(p => p.supplier_id === id)
    .sort((a, b) => txDate(b, 'payment_date').localeCompare(txDate(a, 'payment_date')));

  const init = (s.name || 'S').charAt(0).toUpperCase();

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/suppliers" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Suppliers</a>
    </div>

    <div class="page-head" style="margin-bottom:24px;align-items:center;">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div class="table-avatar" style="width:56px;height:56px;font-size:20px;margin:0;">${esc(init)}</div>
        <div>
          <h1 style="margin-bottom:6px;">${esc(s.name)}</h1>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            ${supplierTypeChip(s.type)}
            ${s.shop_name ? `<span class="text-sm text-muted">${esc(s.shop_name)}</span>` : ''}
            ${s.phone ? `<span class="text-sm text-muted">📞 ${esc(s.phone)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" id="btn-edit-s">✎ Edit</button>
        <button class="btn btn-ghost" id="btn-pay-s">+ Payment</button>
        <button class="btn btn-primary" id="btn-new-purchase">+ Purchase Bill</button>
      </div>
    </div>

    <div class="grid-4" style="margin-bottom:24px;">
      <div class="card" style="padding:16px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Total Purchases</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">${rs(t.total_purchase)}</div>
        <div class="text-xs text-muted" style="margin-top:2px;">${bills.length} bill${bills.length === 1 ? '' : 's'}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Total Paid</div>
        <div style="font-size:20px;font-weight:700;color:var(--success);margin-top:4px;">${rs(t.total_paid)}</div>
      </div>
      <div class="card" style="padding:16px;${t.total_due > 0 ? 'background:var(--danger-bg);border-color:var(--danger);' : ''}">
        <div class="text-xs" style="text-transform:uppercase;font-weight:700;${t.total_due > 0 ? 'color:#991b1b;' : 'color:var(--text-muted);'}">Payable</div>
        <div style="font-size:20px;font-weight:700;color:${t.total_due > 0 ? 'var(--danger)' : 'var(--text-main)'};margin-top:4px;">${rs(t.total_due)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Opening Balance</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">${rs(t.opening)}</div>
      </div>
    </div>

    ${s.address || s.gst || s.email ? `
      <div class="card" style="margin-bottom:24px;border-radius:12px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;margin-bottom:8px;">Details</div>
        ${s.address ? `<div class="text-sm" style="margin-bottom:4px;">📍 ${esc(s.address)}</div>` : ''}
        ${s.email   ? `<div class="text-sm" style="margin-bottom:4px;">✉️ ${esc(s.email)}</div>` : ''}
        ${s.gst     ? `<div class="text-sm text-muted;">GSTIN: <span style="font-family:monospace;">${esc(s.gst)}</span></div>` : ''}
      </div>
    ` : ''}

    <div class="grid-2" style="margin-bottom:24px;">
      <div class="card">
        <div class="card-title">Purchase Bills <small>${bills.length}</small></div>
        ${!bills.length
          ? '<p class="text-sm text-muted text-center" style="padding:20px 0;">No purchases yet</p>'
          : `<div>${bills.slice(0, 10).map(b => {
              const bal = Number(b.total || 0) - Number(b.paid || 0);
              return `<div style="display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);font-size:13px;align-items:center;">
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;">${esc(b.bill_no || '—')}</div>
                  <div class="text-xs text-muted">${txDT(b, 'bill_date')}</div>
                </div>
                <div style="text-align:right;white-space:nowrap;">
                  <div style="font-weight:600;">${rs(b.total)}</div>
                  <div class="text-xs" style="color:${bal > 0 ? 'var(--danger)' : 'var(--success)'};">
                    ${bal > 0 ? 'Due ' + rs(bal) : 'Paid'}
                  </div>
                </div>
              </div>`;
            }).join('')}</div>`}
      </div>

      <div class="card">
        <div class="card-title">Payments <small>${pays.length}</small></div>
        ${!pays.length
          ? '<p class="text-sm text-muted text-center" style="padding:20px 0;">No payments yet</p>'
          : `<div>${pays.slice(0, 10).map(p => `
              <div style="display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);font-size:13px;align-items:center;">
                <div>
                  <div style="color:var(--success);font-weight:600;">
                    ${rs(p.amount)}
                    <span class="text-xs text-muted" style="font-weight:400;">— ${esc(p.mode || '')}</span>
                  </div>
                  <div class="text-xs text-muted">${txDT(p, 'payment_date')}</div>
                </div>
                <button class="btn btn-ghost btn-sm" data-spay-del="${p.id}" style="color:var(--danger);">Del</button>
              </div>
            `).join('')}</div>`}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Ledger <small>Running balance</small></div>
      ${(() => {
        const tl = [
          ...bills.map(b => ({
            date: txDate(b, 'bill_date'),
            type: 'Bill',
            ref: b.bill_no || 'Purchase',
            id: b.id,
            debit: 0,
            credit: Number(b.total || 0)
          })),
          ...bills.filter(b => Number(b.paid) > 0).map(b => ({
            date: txDate(b, 'bill_date'),
            type: 'BillPayment',
            ref: 'Bill paid · ' + (b.bill_no || ''),
            id: b.id,
            debit: Number(b.paid),
            credit: 0
          })),
          ...pays.map(p => ({
            date: txDate(p, 'payment_date'),
            type: 'Payment',
            ref: p.mode || 'Payment',
            id: p.id,
            debit: Number(p.amount || 0),
            credit: 0
          }))
        ].sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          if (a.credit > 0 && b.debit > 0) return -1;
          if (a.debit > 0 && b.credit > 0) return 1;
          return 0;
        });

        let bal = t.opening;
        const rows = [];

        if (t.opening !== 0) {
          rows.push(`<tr>
            <td>—</td>
            <td><b>Opening Balance</b></td>
            <td style="text-align:right;color:var(--success)">${t.opening < 0 ? rs(-t.opening) : '—'}</td>
            <td style="text-align:right">${t.opening > 0 ? rs(t.opening) : '—'}</td>
            <td style="text-align:right;font-weight:700;color:${bal > 0 ? 'var(--danger)' : 'var(--success)'}">${rs(Math.abs(bal))}</td>
          </tr>`);
        }

        tl.forEach(x => {
          bal += x.credit - x.debit;
          rows.push(`<tr>
            <td>${fmtDate(x.date)}</td>
            <td>${x.type === 'Bill'
                ? `<a href="#/purchase/${x.id}" style="font-weight:600;color:var(--text-main);">${esc(x.ref || '')}</a>`
                : esc(x.ref || '')}</td>
            <td style="text-align:right;color:var(--success)">${x.debit ? rs(x.debit) : '—'}</td>
            <td style="text-align:right">${x.credit ? rs(x.credit) : '—'}</td>
            <td style="text-align:right;font-weight:700;color:${bal > 0 ? 'var(--danger)' : 'var(--success)'}">${rs(Math.abs(bal))}</td>
          </tr>`);
        });

        if (rows.length === 0) {
          rows.push(`<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">No transactions yet</td></tr>`);
        }

        return `<div class="table-wrap" style="border:0;box-shadow:none;">
          <table>
            <thead><tr>
              <th>Date</th>
              <th>Reference</th>
              <th style="text-align:right">Paid</th>
              <th style="text-align:right">Billed</th>
              <th style="text-align:right">Balance</th>
            </tr></thead>
            <tbody>${rows.join('')}</tbody>
          </table>
        </div>`;
      })()}
    </div>

    <div class="text-center text-xs text-muted" style="padding:20px 0;">${enteredOn(s)}</div>
  `;

  $('#btn-edit-s').onclick = () => openSupplierForm(s);
  $('#btn-pay-s').onclick  = () => openSupplierPaymentForm(id);
  $('#btn-new-purchase').onclick = () => {
    location.hash = '#/new-purchase';
    // Pre-select will be handled via sessionStorage workaround — simpler: set hash with query
    sessionStorage.setItem('purchase_supplier_id', id);
  };

  $$('[data-spay-del]').forEach(btn => btn.onclick = async () => {
    if (!confirmDlg('Delete this payment?', 'Confirm Delete')) return;
    const { error } = await sb.from('supplier_payments').delete().eq('id', btn.dataset.spayDel);
    if (error) { toast('Failed to delete.', 'error'); return; }
    await syncDB();
    toast('Payment deleted', 'success');
    route();
  });
}

/* ─────────────────────────────────────────────
   10.5 SUPPLIER PAYMENT FORM
   ───────────────────────────────────────────── */
function openSupplierPaymentForm(supplierId, existing) {
  const s = DB.suppliers.find(x => x.id === supplierId);
  if (!s) { toast('Supplier not found', 'error'); return; }

  const p = existing || {
    amount: '',
    mode: 'cash',
    notes: '',
    payment_date: todayStr(),
    tx_time: ''
  };

  openModal(`
    <div class="modal-header">
      <div>
        <div class="modal-title">${existing ? 'Edit' : 'Record'} Payment</div>
        <div class="text-xs text-muted" style="margin-top:2px;">To: <b>${esc(s.name)}</b></div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <form id="spf" style="display:flex;flex-direction:column;gap:16px;">
        ${dateTimeFieldHTML(p.payment_date, p.tx_time, 'Payment Date')}

        <div>
          <label class="label">Amount (₹) *</label>
          <input class="input" type="number" step="any" min="0.01" name="amount" required value="${p.amount || ''}" autofocus>
        </div>

        <div>
          <label class="label">Mode</label>
          <select class="input" name="mode">
            <option value="cash"   ${p.mode === 'cash'   ? 'selected' : ''}>Cash</option>
            <option value="upi"    ${p.mode === 'upi'    ? 'selected' : ''}>UPI</option>
            <option value="bank"   ${p.mode === 'bank'   ? 'selected' : ''}>Bank Transfer</option>
            <option value="cheque" ${p.mode === 'cheque' ? 'selected' : ''}>Cheque</option>
            <option value="neft"   ${p.mode === 'neft'   ? 'selected' : ''}>NEFT</option>
          </select>
        </div>

        <div>
          <label class="label">Notes</label>
          <input class="input" name="notes" value="${esc(p.notes || '')}" placeholder="Optional reference">
        </div>
      </form>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="spf-save">${existing ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    root.querySelector('#spf-save').onclick = async () => {
      const form = root.querySelector('#spf');
      if (!form.reportValidity()) return;
      const dt = readDateTime(form);
      if (!dt) return;

      const fd = new FormData(form);
      const amt = Number(fd.get('amount')) || 0;
      if (amt <= 0) { toast('Amount must be greater than 0', 'error'); return; }

      const data = {
        supplier_id:   supplierId,
        supplier_name: s.name || '',
        amount:        amt,
        mode:          fd.get('mode') || 'cash',
        notes:         (fd.get('notes') || '').trim(),
        payment_date:  dt.date,
        tx_time:       dt.time
      };

      const btn = root.querySelector('#spf-save');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      let res;
      if (existing) res = await sb.from('supplier_payments').update(data).eq('id', existing.id);
      else          res = await sb.from('supplier_payments').insert(data);

      if (res.error) {
        console.error(res.error);
        toast('Failed to save payment.', 'error');
        btn.disabled = false;
        btn.textContent = 'Save';
        return;
      }

      await syncDB();
      toast('Payment saved', 'success');
      closeModal(root);
      route();
    };
  });
}

/* ─────────────────────────────────────────────
   10.6 PURCHASES LIST
   ───────────────────────────────────────────── */
function renderPurchases(content) {
  const list = DB.purchases;

  const totalBilled = list.reduce((s, b) => s + Number(b.total || 0), 0);
  const totalDue    = list.reduce((s, b) => s + Math.max(0, Number(b.total || 0) - Number(b.paid || 0)), 0);

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Purchases</h1>
        <p>${list.length} purchase bill${list.length === 1 ? '' : 's'} · ${rs(totalBilled)} billed${totalDue > 0 ? ` · ${rs(totalDue)} payable` : ''}</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="new-pur-btn">+ New Purchase</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;border-radius:16px;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="pur-search" placeholder="Bill no, supplier name...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Status</label>
        <select class="input" id="pur-filter">
          <option value="">All</option>
          <option value="due">Only with due</option>
          <option value="paid">Fully paid</option>
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Sort</label>
        <select class="input" id="pur-sort">
          <option value="date-desc">Newest first</option>
          <option value="date">Oldest first</option>
          <option value="total-desc">Total (high)</option>
          <option value="due-desc">Due (high)</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Bill No</th>
            <th>Supplier</th>
            <th>Date</th>
            <th style="text-align:right">Total</th>
            <th style="text-align:right">Paid</th>
            <th style="text-align:right">Due</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="pur-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="pur-mobile"></div>
  `;

  function filtered() {
    const q = ($('#pur-search').value || '').toLowerCase().trim();
    const flt = $('#pur-filter').value;
    const sortBy = $('#pur-sort').value;

    let arr = list.filter(b => {
      const hay = ((b.bill_no || '') + ' ' + (b.supplier_name || '')).toLowerCase();
      if (q && !hay.includes(q)) return false;
      const bal = Number(b.total || 0) - Number(b.paid || 0);
      if (flt === 'due' && bal <= 0) return false;
      if (flt === 'paid' && bal > 0) return false;
      return true;
    });

    if (sortBy === 'date-desc')      arr.sort((a, b) => txDate(b, 'bill_date').localeCompare(txDate(a, 'bill_date')));
    else if (sortBy === 'date')      arr.sort((a, b) => txDate(a, 'bill_date').localeCompare(txDate(b, 'bill_date')));
    else if (sortBy === 'total-desc')arr.sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
    else if (sortBy === 'due-desc')  arr.sort((a, b) => (Number(b.total || 0) - Number(b.paid || 0)) - (Number(a.total || 0) - Number(a.paid || 0)));

    return arr;
  }

  function renderList() {
    const arr = filtered();

    const tbody = $('#pur-body');
    if (tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">
             ${list.length === 0
               ? 'No purchases yet — click <b>+ New Purchase</b> to record a bill.'
               : 'No purchases match.'}
           </td></tr>`
        : arr.map(b => {
            const bal = Number(b.total || 0) - Number(b.paid || 0);
            return `<tr>
              <td><a href="#/purchase/${b.id}" style="font-weight:600;color:var(--text-main);text-decoration:none;">${esc(b.bill_no || '—')}</a></td>
              <td>${esc(b.supplier_name || '—')}</td>
              <td class="text-sm text-muted">${txDT(b, 'bill_date')}</td>
              <td style="text-align:right;">${rs(b.total)}</td>
              <td style="text-align:right;color:var(--success);">${rs(b.paid)}</td>
              <td style="text-align:right;font-weight:${bal > 0 ? '600' : '400'};color:${bal > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${rs(bal)}</td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" data-view="${b.id}">View</button>
                <button class="btn btn-ghost btn-sm" data-del="${b.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('');
    }

    const mob = $('#pur-mobile');
    if (mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">🛒</div>
             <div class="empty-title">${list.length === 0 ? 'No purchases yet' : 'No matches'}</div>
           </div>`
        : arr.map(b => {
            const bal = Number(b.total || 0) - Number(b.paid || 0);
            return `
              <a href="#/purchase/${b.id}" class="mobile-card" style="text-decoration:none;color:inherit;">
                <div class="mobile-card-head">
                  <div>
                    <div class="mobile-card-title">${esc(b.supplier_name || '—')}</div>
                    <div class="mobile-card-sub">${esc(b.bill_no || '—')} · ${fmtDate(txDate(b, 'bill_date'))}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:700;">${rs(b.total)}</div>
                    <div class="text-xs" style="color:${bal > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600;margin-top:2px;">
                      ${bal > 0 ? 'Due ' + rs(bal) : 'Paid'}
                    </div>
                  </div>
                </div>
              </a>
            `;
          }).join('');
    }

    $$('[data-view]').forEach(btn => btn.onclick = () => location.hash = '#/purchase/' + btn.dataset.view);
    $$('[data-del]').forEach(btn => btn.onclick = () => {
      const b = DB.purchases.find(x => x.id === btn.dataset.del);
      if (b) deletePurchase(b);
    });
  }

  $('#pur-search').oninput = renderList;
  ['pur-filter', 'pur-sort'].forEach(id => {
    const el = $('#' + id);
    if (el) el.onchange = renderList;
  });

  $('#new-pur-btn').onclick = () => location.hash = '#/new-purchase';
  renderList();
}

/* ─────────────────────────────────────────────
   10.7 NEW PURCHASE FORM
   ───────────────────────────────────────────── */
function renderNewPurchase(content) {
  const preselectSupplierId = sessionStorage.getItem('purchase_supplier_id');
  sessionStorage.removeItem('purchase_supplier_id');

  let supplier = preselectSupplierId ? DB.suppliers.find(x => x.id === preselectSupplierId) : null;
  let lines = [];

  if (DB.suppliers.length === 0) {
    content.innerHTML = `
      <div class="page-head">
        <div class="page-head-title">
          <h1>New Purchase</h1>
          <p>Add a supplier first to record a purchase bill</p>
        </div>
      </div>
      <div class="card" style="text-align:center;padding:60px 20px;border-radius:16px;">
        <div class="empty-icon" style="font-size:56px;opacity:0.4;margin-bottom:20px;">🚚</div>
        <div class="empty-title">No suppliers yet</div>
        <div class="empty-desc" style="max-width:400px;margin:0 auto 24px;">You need at least one supplier to record a purchase bill.</div>
        <a href="#/suppliers" class="btn btn-primary">Go to Suppliers</a>
      </div>
    `;
    return;
  }

  const supplierOptions = DB.suppliers
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map(s => `<option value="${s.id}" ${supplier?.id === s.id ? 'selected' : ''}>${esc(s.name)} · ${supplierTypeLabel(s.type)}</option>`)
    .join('');

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/purchases" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Purchases</a>
    </div>

    <div class="page-head" style="margin-bottom:24px;">
      <div class="page-head-title">
        <h1>New Purchase Bill</h1>
        <p>Stock will be added to batches automatically</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 360px;gap:24px;align-items:start;">
      <div style="display:flex;flex-direction:column;gap:20px;">

        <div class="card" style="border-radius:16px;">
          ${dateTimeFieldHTML(null, '', 'Bill Date')}

          <div class="grid-2" style="margin-top:16px;">
            <div>
              <label class="label">Supplier *</label>
              <select class="input" id="np-supplier">
                <option value="">— Pick supplier —</option>
                ${supplierOptions}
              </select>
            </div>
            <div>
              <label class="label">Bill No</label>
              <input class="input" id="np-bill-no" placeholder="e.g. AP-2412-0042">
            </div>
          </div>
        </div>

        <div class="card" style="border-radius:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
            <label class="label" style="margin:0;">Items</label>
            <button type="button" class="btn btn-primary btn-sm" id="np-add-item">+ Add Item</button>
          </div>
          <div id="np-lines"></div>
        </div>

      </div>

      <div style="position:sticky;top:84px;display:flex;flex-direction:column;gap:16px;">
        <div class="card" style="background:var(--navy);color:#fff;border:0;border-radius:16px;">
          <div style="font-weight:600;font-size:15px;padding-bottom:12px;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.1);">
            Bill Summary
          </div>
          <div id="np-summary" style="display:flex;flex-direction:column;gap:10px;font-size:13px;"></div>

          <div style="margin-top:20px;display:flex;flex-direction:column;gap:12px;">
            <div>
              <label class="label" style="color:#9CA3AF;">Discount (₹)</label>
              <input class="input" type="number" step="any" min="0" id="np-disc" value="0" style="background:rgba(255,255,255,0.1);border-color:transparent;color:#fff;">
            </div>
            <div>
              <label class="label" style="color:#9CA3AF;">Paid Now (₹)</label>
              <input class="input" type="number" step="any" min="0" id="np-paid" value="0" style="background:rgba(255,255,255,0.1);border-color:transparent;color:#fff;">
            </div>
          </div>
        </div>

        <div class="card" style="border-radius:16px;">
          <div>
            <label class="label">Notes</label>
            <input class="input" id="np-notes" placeholder="Optional">
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px;">
            <button type="button" class="btn btn-ghost" id="np-cancel" style="width:100%;">Cancel</button>
            <button type="button" class="btn btn-primary btn-lg" id="np-save" style="width:100%;">Save Purchase</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Supplier selected?
  if (supplier) $('#np-supplier').value = supplier.id;

  // Add item
  $('#np-add-item').onclick = () => {
    openVariantPickerForPurchase((variantId) => {
      addPurchaseLine(variantId);
    });
  };

  function addPurchaseLine(variantId) {
    const { variant, product } = variantInfo(variantId);
    if (!variant || !product) return;

    // Suggest existing batches for this variant (help user pick batch_no)
    const existingBatches = DB.product_batches.filter(b => b.variant_id === variantId);

    lines.push({
      variant_id: variant.id,
      variant_name: product.name,
      shade_name: variant.shade_name || '',
      pack_size: Number(variant.pack_size) || 1,
      pack_unit: variant.pack_unit || '',
      batch_no: '',
      mfg_date: '',
      qty: 1,
      cost: Number(variant.cost) || 0,
      mrp: Number(variant.mrp) || 0,
      selling_price: Number(variant.selling_price) || Number(variant.mrp) || 0,
      total: Number(variant.cost) || 0,
      _existing_batches: existingBatches.map(b => ({ no: b.batch_no, qty: b.qty }))
    });
    renderLines();
    updateSummary();
  }

  function renderLines() {
    const box = $('#np-lines');
    if (!lines.length) {
      box.innerHTML = '<p class="text-sm text-muted text-center" style="padding:24px 0;">No items yet. Click <b>+ Add Item</b>.</p>';
      return;
    }

    box.innerHTML = lines.map((l, i) => `
      <div class="card" style="margin-bottom:8px;padding:16px;background:var(--bg-app);border:1px solid var(--border);box-shadow:none;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:var(--text-main);">${esc(l.variant_name)}</div>
            <div class="text-xs text-muted" style="margin-top:2px;">${esc(l.shade_name)} · ${fmtNum(l.pack_size)}${esc(l.pack_unit)}</div>
            ${l._existing_batches.length > 0 ? `
              <div class="text-xs text-muted" style="margin-top:6px;">
                Existing batches: ${l._existing_batches.map(b => `<code style="background:var(--bg-card);padding:1px 6px;border-radius:4px;font-size:10px;">${esc(b.no)}</code>`).join(' ')}
              </div>
            ` : ''}
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-del="${i}" style="color:var(--danger);padding:4px 8px;">✕</button>
        </div>

        <div class="grid-3" style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:12px;">
          <div>
            <label class="label" style="font-size:10px;">Batch No *</label>
            <input class="input" type="text" data-i="${i}" data-f="batch_no" value="${esc(l.batch_no)}" placeholder="e.g. AP2412-B3" style="padding:8px 10px;font-family:monospace;">
          </div>
          <div>
            <label class="label" style="font-size:10px;">MFG Date</label>
            <input class="input" type="date" data-i="${i}" data-f="mfg_date" value="${esc(l.mfg_date)}" style="padding:8px 10px;">
          </div>
          <div>
            <label class="label" style="font-size:10px;">Qty *</label>
            <input class="input" type="number" step="any" min="0.01" data-i="${i}" data-f="qty" value="${l.qty}" style="padding:8px 10px;font-weight:600;">
          </div>
        </div>

        <div class="grid-3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div>
            <label class="label" style="font-size:10px;">Cost / unit (₹)</label>
            <input class="input" type="number" step="any" min="0" data-i="${i}" data-f="cost" value="${l.cost}" style="padding:8px 10px;font-weight:600;color:var(--primary);">
          </div>
          <div>
            <label class="label" style="font-size:10px;">MRP (₹)</label>
            <input class="input" type="number" step="any" min="0" data-i="${i}" data-f="mrp" value="${l.mrp}" style="padding:8px 10px;">
          </div>
          <div>
            <label class="label" style="font-size:10px;">Sell Price (₹)</label>
            <input class="input" type="number" step="any" min="0" data-i="${i}" data-f="selling_price" value="${l.selling_price}" style="padding:8px 10px;color:var(--primary);">
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:1px dashed var(--border);">
          <span class="text-xs text-muted" style="font-weight:600;">Line total</span>
          <b style="font-size:16px;color:var(--text-main);">${rs(l.total)}</b>
        </div>
      </div>
    `).join('');

    box.querySelectorAll('input[data-i]').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const i = +e.target.dataset.i;
        const f = e.target.dataset.f;
        if (f === 'batch_no' || f === 'mfg_date') {
          lines[i][f] = e.target.value;
        } else {
          lines[i][f] = Number(e.target.value) || 0;
        }
        if (f === 'qty' || f === 'cost') {
          lines[i].total = (Number(lines[i].qty) || 0) * (Number(lines[i].cost) || 0);
          const card = e.target.closest('.card');
          if (card) {
            const totalEl = card.querySelector('div[style*="font-size:16px"]');
            if (totalEl) totalEl.textContent = rs(lines[i].total);
          }
        }
        updateSummary();
      });
    });

    box.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = () => {
        lines.splice(+btn.dataset.del, 1);
        renderLines();
        updateSummary();
      };
    });
  }

  function updateSummary() {
    const subtotal = lines.reduce((s, l) => s + (Number(l.total) || 0), 0);
    const disc = Number($('#np-disc').value) || 0;
    const total = Math.max(0, subtotal - disc);
    const paid = Math.min(Number($('#np-paid').value) || 0, total);
    const due = Math.max(0, total - paid);

    $('#np-summary').innerHTML = `
      <div style="display:flex;justify-content:space-between;"><span style="color:#9CA3AF;">Subtotal (${lines.length} item${lines.length === 1 ? '' : 's'})</span><b>${rs(subtotal)}</b></div>
      ${disc > 0 ? `<div style="display:flex;justify-content:space-between;"><span style="color:#9CA3AF;">Discount</span><b style="color:#F87171;">− ${rs(disc)}</b></div>` : ''}
      <div style="display:flex;justify-content:space-between;font-size:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);margin-top:8px;">
        <b>Total</b><b style="color:#34D399;">${rs(total)}</b>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;">
        <span style="color:#9CA3AF;">Paid</span><b style="color:#34D399;">${rs(paid)}</b>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#9CA3AF;">Due</span><b style="color:${due > 0 ? '#F87171' : '#34D399'};">${rs(due)}</b>
      </div>
    `;
  }

  $('#np-disc').addEventListener('input', updateSummary);
  $('#np-paid').addEventListener('input', updateSummary);

  // Save
  async function onSave() {
    const supplierId = $('#np-supplier').value;
    if (!supplierId) { toast('Pick a supplier', 'error'); return; }
    const sup = DB.suppliers.find(x => x.id === supplierId);
    if (!sup) { toast('Supplier not found', 'error'); return; }

    if (lines.length === 0) { toast('Add at least one item', 'error'); return; }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!(Number(l.qty) > 0)) { toast(`Qty must be > 0 for item ${i + 1}`, 'error'); return; }
      if (!(Number(l.cost) >= 0)) { toast(`Cost must be ≥ 0 for item ${i + 1}`, 'error'); return; }
      if (!l.batch_no || !String(l.batch_no).trim()) { toast(`Batch No required for item ${i + 1}`, 'error'); return; }
    }

    const dEl = document.querySelector('#content input[name="tx_date"]');
    const tEl = document.querySelector('#content input[name="tx_time"]');
    const dv = dEl ? dEl.value : '';
    const tv = (tEl && tEl.value) ? tEl.value.trim() : '';
    if (!dv) { toast('Pick a date', 'error'); return; }
    if (dv > todayStr()) { toast('Future dates not allowed', 'error'); return; }

    const billNo = ($('#np-bill-no').value || '').trim();
    const notes = ($('#np-notes').value || '').trim();
    const subtotal = lines.reduce((s, l) => s + (Number(l.total) || 0), 0);
    const disc = Number($('#np-disc').value) || 0;
    const total = Math.max(0, subtotal - disc);
    const paid = Math.min(Number($('#np-paid').value) || 0, total);

    const btn = $('#np-save');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    // 1. Insert purchase header
    const purRes = await sb.from('purchases').insert({
      supplier_id:   supplierId,
      supplier_name: sup.name || '',
      bill_no:       billNo,
      bill_date:     dv,
      tx_time:       tv,
      subtotal,
      discount:      disc,
      total,
      paid,
      notes
    }).select().single();

    if (purRes.error) {
      console.error(purRes.error);
      toast('Failed to save purchase: ' + purRes.error.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Save Purchase';
      return;
    }
    const purchase = purRes.data;

    // 2. Insert items + apply batches
    for (const l of lines) {
      await sb.from('purchase_items').insert({
        purchase_id:   purchase.id,
        variant_id:    l.variant_id,
        variant_name:  l.variant_name,
        shade_name:    l.shade_name,
        pack_size:     l.pack_size,
        pack_unit:     l.pack_unit,
        batch_no:      String(l.batch_no).trim(),
        mfg_date:      l.mfg_date || null,
        qty:           Number(l.qty),
        cost:          Number(l.cost) || 0,
        mrp:           Number(l.mrp) || 0,
        selling_price: Number(l.selling_price) || Number(l.mrp) || 0,
        total:         Number(l.total) || 0
      });

      await applyBatchFromPurchaseLine(l, supplierId);
    }

    await syncDB();
    toast('Purchase saved · batches updated', 'success');
    location.hash = '#/purchase/' + purchase.id;
  }

  $('#np-save').onclick = onSave;
  $('#np-cancel').onclick = () => history.back();

  renderLines();
  updateSummary();
}

/* ─────────────────────────────────────────────
   10.8 APPLY BATCH FROM PURCHASE
   ───────────────────────────────────────────── */
async function applyBatchFromPurchaseLine(line, supplierId) {
  const batchNo = String(line.batch_no || '').trim();
  if (!batchNo) return;

  // Find existing batch for this variant + batch_no
  const existing = DB.product_batches.find(b =>
    b.variant_id === line.variant_id &&
    (b.batch_no || '').trim().toLowerCase() === batchNo.toLowerCase()
  );

  if (existing) {
    // Update: add qty, refresh prices + mfg
    await sb.from('product_batches').update({
      qty:           Number(existing.qty || 0) + Number(line.qty || 0),
      cost:          Number(line.cost) || existing.cost || 0,
      mrp:           Number(line.mrp) || existing.mrp || 0,
      selling_price: Number(line.selling_price) || Number(line.mrp) || existing.selling_price || 0,
      mfg_date:      line.mfg_date || existing.mfg_date || null,
      supplier_id:   supplierId || existing.supplier_id || null,
      updated_at:    new Date().toISOString()
    }).eq('id', existing.id);
  } else {
    // Create new batch
    await sb.from('product_batches').insert({
      variant_id:    line.variant_id,
      batch_no:      batchNo,
      mfg_date:      line.mfg_date || null,
      qty:           Number(line.qty) || 0,
      cost:          Number(line.cost) || 0,
      mrp:           Number(line.mrp) || 0,
      selling_price: Number(line.selling_price) || Number(line.mrp) || 0,
      supplier_id:   supplierId || null
    });
  }
}

/* ─────────────────────────────────────────────
   10.9 PURCHASE VIEW
   ───────────────────────────────────────────── */
function renderPurchaseView(content, id) {
  const pur = DB.purchases.find(x => x.id === id);
  if (!pur) {
    content.innerHTML = `
      <div class="empty-state" style="padding:80px 20px;">
        <div class="empty-icon">🛒</div>
        <div class="empty-title">Purchase not found</div>
        <a href="#/purchases" class="btn btn-primary">Back to Purchases</a>
      </div>
    `;
    return;
  }

  const items = DB.purchase_items.filter(x => x.purchase_id === id);
  const supplier = pur.supplier_id ? DB.suppliers.find(s => s.id === pur.supplier_id) : null;

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/purchases" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Purchases</a>
    </div>

    <div class="page-head" style="margin-bottom:24px;">
      <div class="page-head-title">
        <h1>${esc(pur.bill_no || 'Purchase')}</h1>
        <p>${txDT(pur, 'bill_date')}</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 320px;gap:24px;align-items:start;">
      <div style="display:flex;flex-direction:column;gap:20px;">

        <div class="card" style="border-radius:16px;">
          <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;margin-bottom:6px;">Supplier</div>
          <div style="font-weight:700;font-size:16px;">
            ${supplier ? `<a href="#/supplier/${supplier.id}" style="color:var(--text-main);text-decoration:none;">${esc(supplier.name)}</a>` : esc(pur.supplier_name || '—')}
          </div>
          ${supplier?.phone ? `<div class="text-sm text-muted" style="margin-top:4px;">📞 ${esc(supplier.phone)}</div>` : ''}
        </div>

        <div class="card" style="border-radius:16px;">
          <div class="card-title">Items <small>${items.length} line${items.length === 1 ? '' : 's'}</small></div>
          <div class="table-wrap" style="border:0;box-shadow:none;">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Batch</th>
                  <th>MFG</th>
                  <th style="text-align:center">Qty</th>
                  <th style="text-align:right">Cost</th>
                  <th style="text-align:right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(it => `
                  <tr>
                    <td>
                      <strong>${esc(it.variant_name || '—')}</strong>
                      <div class="text-xs text-muted" style="margin-top:2px;">${esc(it.shade_name)} · ${fmtNum(it.pack_size)}${esc(it.pack_unit)}</div>
                    </td>
                    <td><span class="chip chip-neutral" style="font-family:monospace;font-size:10px;">${esc(it.batch_no || '—')}</span></td>
                    <td class="text-sm">${fmtDate(it.mfg_date)}</td>
                    <td style="text-align:center;">${fmtNum(it.qty)}</td>
                    <td style="text-align:right;">${rs(it.cost)}</td>
                    <td style="text-align:right;font-weight:600;">${rs(it.total)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card" style="border-radius:16px;">
          <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
            <div style="display:flex;justify-content:space-between;"><span class="text-muted">Subtotal</span><b>${rs(pur.subtotal)}</b></div>
            ${Number(pur.discount) > 0 ? `<div style="display:flex;justify-content:space-between;"><span class="text-muted">Discount</span><b style="color:var(--danger);">− ${rs(pur.discount)}</b></div>` : ''}
            <div style="display:flex;justify-content:space-between;font-size:16px;padding-top:8px;border-top:1px solid var(--border);margin-top:4px;"><b>Total</b><b style="color:var(--primary);">${rs(pur.total)}</b></div>
            <div style="display:flex;justify-content:space-between;"><span class="text-muted">Paid</span><b style="color:var(--success);">${rs(pur.paid)}</b></div>
            <div style="display:flex;justify-content:space-between;"><span class="text-muted">Due</span><b style="color:${Number(pur.total) - Number(pur.paid) > 0 ? 'var(--danger)' : 'var(--success)'};">${rs(Number(pur.total) - Number(pur.paid))}</b></div>
          </div>
          ${pur.notes ? `<div style="margin-top:16px;padding:12px;background:var(--bg-app);border-radius:var(--radius-sm);font-size:12px;color:var(--text-muted);"><b style="color:var(--text-main);">Notes:</b> ${esc(pur.notes)}</div>` : ''}
        </div>

      </div>

      <div style="position:sticky;top:84px;display:flex;flex-direction:column;gap:16px;">
        <div class="card" style="border-radius:16px;">
          <button class="btn btn-danger btn-block" id="btn-del-purchase">🗑 Delete Purchase</button>
          <div class="field-hint" style="text-align:center;margin-top:8px;">Batch stock will be reversed</div>
        </div>
      </div>
    </div>

    <div class="text-center text-xs text-muted" style="padding:20px 0;">${enteredOn(pur)}</div>
  `;

  $('#btn-del-purchase').onclick = () => deletePurchase(pur);
}

/* ─────────────────────────────────────────────
   10.10 DELETE PURCHASE
   ───────────────────────────────────────────── */
async function deletePurchase(purchase) {
  const items = DB.purchase_items.filter(x => x.purchase_id === purchase.id);

  // Pre-flight: check if any batch has been sold from
  for (const it of items) {
    if (!it.batch_no || !it.variant_id) continue;
    const batch = DB.product_batches.find(b =>
      b.variant_id === it.variant_id &&
      (b.batch_no || '').trim().toLowerCase() === String(it.batch_no).trim().toLowerCase()
    );
    if (batch && Number(batch.qty) < Number(it.qty)) {
      toast(`Cannot delete: batch "${it.batch_no}" has been sold from already`, 'error');
      return;
    }
  }

  const msg = `Delete purchase ${purchase.bill_no || ''} of ${rs(purchase.total)}?\n\nBatch stock from this purchase will be reversed (${items.length} line${items.length === 1 ? '' : 's'}).`;
  if (!confirmDlg(msg, 'Confirm Delete')) return;

  // Reverse batches
  for (const it of items) {
    if (!it.batch_no || !it.variant_id) continue;
    const batch = DB.product_batches.find(b =>
      b.variant_id === it.variant_id &&
      (b.batch_no || '').trim().toLowerCase() === String(it.batch_no).trim().toLowerCase()
    );
    if (batch) {
      const newQty = Math.max(0, Number(batch.qty || 0) - Number(it.qty || 0));
      await sb.from('product_batches').update({
        qty: newQty,
        updated_at: new Date().toISOString()
      }).eq('id', batch.id);
    }
  }

  const { error } = await sb.from('purchases').delete().eq('id', purchase.id);
  if (error) {
    console.error(error);
    toast('Failed to delete purchase.', 'error');
    return;
  }

  await syncDB();
  toast('Purchase deleted · stock reversed', 'success');
  location.hash = '#/purchases';
}

/* ─────────────────────────────────────────────
   10.11 VARIANT PICKER FOR PURCHASE
   ───────────────────────────────────────────── */
function openVariantPickerForPurchase(onPick) {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Add Item to Purchase</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <input class="input" id="pvp-search" placeholder="Search shade, size, product or brand..." autofocus style="margin-bottom:16px;">
      <div id="pvp-list" style="max-height:420px;overflow-y:auto;"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>
  `, (root) => {
    function renderList() {
      const q = (root.querySelector('#pvp-search').value || '').toLowerCase().trim();

      const items = DB.variants.map(v => {
        const { product, brand } = variantInfo(v.id);
        if (!product) return null;
        const stock = calculateVariantStockForInvoice(v.id);
        const hay = (
          (product.name || '') + ' ' +
          (v.shade_name || '') + ' ' +
          (v.shade_code || '') + ' ' +
          (brand?.name || '') + ' ' +
          fmtNum(v.pack_size) + (v.pack_unit || '')
        ).toLowerCase();
        return { v, product, brand, stock, hay };
      }).filter(Boolean);

      const filtered = items.filter(it => !q || it.hay.includes(q)).slice(0, 60);

      const box = root.querySelector('#pvp-list');
      if (filtered.length === 0) {
        box.innerHTML = '<div class="empty-state" style="padding:30px 10px;"><div class="empty-icon">🎨</div><div class="empty-title">No matches</div></div>';
        return;
      }

      box.innerHTML = filtered.map(it => `
        <div class="panel-list-item" data-vid="${it.v.id}" style="cursor:pointer;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;padding:12px;background:var(--bg-card);">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;color:var(--text-main);font-size:13px;">${esc(it.v.shade_name || '—')} · ${fmtNum(it.v.pack_size)}${esc(it.v.pack_unit || '')}</div>
            <div class="text-xs text-muted" style="margin-top:2px;">${esc(it.product.name)}${it.brand ? ' · ' + esc(it.brand.name) : ''}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-weight:600;font-size:12px;">${rs(it.v.cost)}</div>
            <div class="text-xs text-muted" style="margin-top:2px;">${fmtNum(it.stock)} in stock</div>
          </div>
        </div>
      `).join('');

      box.querySelectorAll('[data-vid]').forEach(el => {
        el.onclick = () => {
          closeModal(root);
          onPick(el.dataset.vid);
        };
      });
    }

    root.querySelector('#pvp-search').oninput = renderList;
    renderList();
  });
}
/* ══════════════════════════════════════════════════════════════════
   STEP 11 — RETURNS + EXPENSES
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   11.0 DB INIT + SYNC OVERRIDE
   ───────────────────────────────────────────── */
if (!DB.returns)  DB.returns  = [];
if (!DB.expenses) DB.expenses = [];

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
  window.DB_ERROR = null;

  const errors = [];
  const tables = [
    'brands', 'products', 'variants', 'product_batches',
    'customers', 'invoices', 'invoice_items', 'payments',
    'colorants', 'mixes',
    'suppliers', 'purchases', 'purchase_items', 'supplier_payments',
    'returns', 'expenses'
  ];

  const results = await Promise.allSettled(tables.map(t => fetchAllRows(t)));
  results.forEach((res, i) => {
    const name = tables[i];
    if (res.status === 'fulfilled') DB[name] = res.value;
    else errors.push(res.reason.message || String(res.reason));
  });

  try {
    const { data, error } = await sb.from('settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    if (data) {
      SETTINGS = {
        shop_name:               data.shop_name               || 'PaintBook',
        owner_name:              data.owner_name              || 'Owner',
        address:                 data.address                 || '',
        city:                    data.city                    || '',
        phone:                   data.phone                   || '',
        email:                   data.email                   || '',
        upi:                     data.upi                     || '',
        logo:                    data.logo                    || '',
        gst_enabled:             !!data.gst_enabled,
        gst_number:              data.gst_number              || '',
        gst_rate:                Number(data.gst_rate)        || 0,
        low_stock_alert_default: Number(data.low_stock_alert_default) || 5,
        print_footer:            data.print_footer            || 'Thank you! Visit again',
        loaded:                  true
      };
      DB.settings = data;
    } else {
      SETTINGS.loaded = true;
    }
    applyFavicon();
  } catch (e) {
    errors.push('settings - ' + (e.message || e));
    SETTINGS.loaded = true;
  }

  window.DB_SYNCED = errors.length === 0;
  window.DB_ERROR = errors.length ? errors[0] : null;
  window.DB_SYNCING = false;

  if (errors.length) {
    console.error('[PaintBook] Sync errors:', errors);
    if (!window.__syncErrorShown) {
      toast('Sync issue: ' + (errors[0] || 'Unknown'), 'error');
      window.__syncErrorShown = true;
    }
  } else {
    window.__syncErrorShown = false;
  }

  return { ok: errors.length === 0, errors };
}

/* ─────────────────────────────────────────────
   11.1 RETURNS PAGE (Shell with Tabs)
   ───────────────────────────────────────────── */
function renderReturns(content) {
  content.innerHTML = `
    <div class="page-head" style="margin-bottom:20px;">
      <div class="page-head-title">
        <h1>Returns</h1>
        <p>Customer returns &amp; supplier returns</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;padding:12px;border-radius:16px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" id="rt-tab-from">↩ From Customer</button>
        <button class="btn btn-ghost btn-sm" id="rt-tab-to">↪ To Supplier</button>
      </div>
    </div>

    <div id="rt-content"></div>

    <div class="card" style="margin-top:24px;border-radius:16px;">
      <div class="card-title">Recent Returns</div>
      <div id="rt-list"></div>
    </div>
  `;

  $('#rt-tab-from').onclick = () => {
    $('#rt-tab-from').className = 'btn btn-primary btn-sm';
    $('#rt-tab-to').className   = 'btn btn-ghost btn-sm';
    renderReturnFromCustomer();
  };
  $('#rt-tab-to').onclick = () => {
    $('#rt-tab-to').className   = 'btn btn-primary btn-sm';
    $('#rt-tab-from').className = 'btn btn-ghost btn-sm';
    renderReturnToSupplier();
  };

  renderReturnsList();
  renderReturnFromCustomer();
}

/* ─────────────────────────────────────────────
   11.2 RECENT RETURNS LIST
   ───────────────────────────────────────────── */
function renderReturnsList() {
  const box = $('#rt-list');
  if (!box) return;

  const arr = DB.returns.slice().sort((a, b) =>
    txDate(b, 'return_date').localeCompare(txDate(a, 'return_date'))
  ).slice(0, 30);

  if (arr.length === 0) {
    box.innerHTML = '<p class="text-sm text-muted text-center" style="padding:20px 0;">No returns recorded yet</p>';
    return;
  }

  box.innerHTML = `
    <div class="table-wrap" style="border:0;box-shadow:none;">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Direction</th>
            <th>Item</th>
            <th>Party</th>
            <th style="text-align:right">Qty</th>
            <th style="text-align:right">Amount</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody>
          ${arr.map(r => {
            const dirChip = r.direction === 'from_customer'
              ? '<span class="chip chip-primary" style="font-size:10px;">From Customer</span>'
              : '<span class="chip chip-warning" style="font-size:10px;">To Supplier</span>';

            const partyName = r.direction === 'from_customer'
              ? (r.customer_name || DB.customers.find(c => c.id === r.customer_id)?.name || 'Walk-in')
              : (r.supplier_name || DB.suppliers.find(s => s.id === r.supplier_id)?.name || '—');

            return `<tr>
              <td class="text-sm text-muted">${fmtDate(txDate(r, 'return_date'))}</td>
              <td>${dirChip}</td>
              <td>
                <strong>${esc(r.variant_name || '—')}</strong>
                <div class="text-xs text-muted" style="margin-top:2px;">
                  ${esc(r.shade_name || '')} ${r.pack_size ? fmtNum(r.pack_size) + (r.pack_unit || '') : ''}
                  ${r.batch_no ? ' · B:' + esc(r.batch_no) : ''}
                </div>
              </td>
              <td>${esc(partyName)}</td>
              <td style="text-align:right;">${fmtNum(r.qty)}</td>
              <td style="text-align:right;color:var(--danger);font-weight:600;">${rs(r.amount)}</td>
              <td style="text-align:right;">
                <button class="btn btn-ghost btn-sm" data-rt-del="${r.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  $$('[data-rt-del]').forEach(btn => btn.onclick = () => deleteReturn(btn.dataset.rtDel));
}

/* ─────────────────────────────────────────────
   11.3 RETURN FROM CUSTOMER
   ───────────────────────────────────────────── */
function renderReturnFromCustomer() {
  $('#rt-content').innerHTML = `
    <div class="card" style="border-radius:16px;">
      <div class="card-title">Return from Customer</div>

      <div style="display:flex;flex-direction:column;gap:16px;">
        ${dateTimeFieldHTML(null, '', 'Return Date')}

        <div>
          <label class="label">Invoice</label>
          <select class="input" id="rtc-invoice">
            <option value="">— Pick invoice —</option>
            ${DB.invoices.slice().sort((a, b) => txDate(b, 'invoice_date').localeCompare(txDate(a, 'invoice_date'))).map(i => {
              const cust = i.customer_name || 'Walk-in';
              return `<option value="${i.id}">${esc(i.invoice_no)} · ${esc(cust)} · ${rs(i.total)} · ${fmtDate(txDate(i, 'invoice_date'))}</option>`;
            }).join('')}
          </select>
          <div class="field-hint">Only invoices created in PaintBook can be returned</div>
        </div>

        <div id="rtc-lines-wrap"></div>
        <div id="rtc-fields" style="display:none;flex-direction:column;gap:16px;">
          <div class="grid-2">
            <div>
              <label class="label">Qty to Return *</label>
              <input class="input" type="number" step="any" min="0.001" id="rtc-qty" value="1">
            </div>
            <div>
              <label class="label">Refund Amount (₹) *</label>
              <input class="input" type="number" step="any" min="0" id="rtc-amount" value="0">
            </div>
          </div>
          <div>
            <label class="label">Reason</label>
            <input class="input" id="rtc-reason" placeholder="e.g. Wrong shade, unopened tin, damaged">
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;">
          <button class="btn btn-primary" id="rtc-submit" disabled>Record Return</button>
        </div>
      </div>
    </div>
  `;

  let selectedInvoice = null;
  let selectedLine = null;
  let selectedLineIdx = -1;

  function renderLines() {
    const wrap = $('#rtc-lines-wrap');
    const fields = $('#rtc-fields');
    const submit = $('#rtc-submit');

    if (!selectedInvoice) {
      wrap.innerHTML = '';
      fields.style.display = 'none';
      submit.disabled = true;
      return;
    }

    const items = DB.invoice_items.filter(x => x.invoice_id === selectedInvoice.id);
    if (items.length === 0) {
      wrap.innerHTML = '<p class="text-sm text-muted text-center" style="padding:14px 0;">No items on this invoice</p>';
      fields.style.display = 'none';
      submit.disabled = true;
      return;
    }

    wrap.innerHTML = `
      <label class="label">Select Item to Return</label>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${items.map((it, i) => {
          const isSelected = i === selectedLineIdx;
          return `<div data-line-idx="${i}" style="cursor:pointer;border:1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'};background:${isSelected ? 'var(--primary-light)' : 'var(--bg-card)'};border-radius:8px;padding:14px;display:flex;align-items:center;gap:12px;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:13px;color:var(--text-main);">${esc(it.variant_name)}</div>
              <div class="text-xs text-muted" style="margin-top:4px;">
                ${esc(it.shade_name || '')} ${it.pack_size ? '· ' + fmtNum(it.pack_size) + (it.pack_unit || '') : ''}
                ${it.batch_no ? ' · B:' + esc(it.batch_no) : ''}
              </div>
              <div class="text-xs text-muted" style="margin-top:4px;">
                Sold: <b>${fmtNum(it.qty)}</b> × ${rs(it.rate)}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-weight:700;">${rs(it.total)}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;

    wrap.querySelectorAll('[data-line-idx]').forEach(el => {
      el.onclick = () => {
        selectedLineIdx = parseInt(el.dataset.lineIdx, 10);
        selectedLine = items[selectedLineIdx];
        $('#rtc-qty').value = 1;
        $('#rtc-amount').value = Number(selectedLine.rate || 0).toFixed(2);
        renderLines();
      };
    });

    if (selectedLine) {
      fields.style.display = 'flex';
      submit.disabled = false;
    } else {
      fields.style.display = 'none';
      submit.disabled = true;
    }
  }

  $('#rtc-invoice').onchange = (e) => {
    selectedInvoice = e.target.value ? DB.invoices.find(i => i.id === e.target.value) : null;
    selectedLine = null;
    selectedLineIdx = -1;
    renderLines();
  };

  const qtyEl = $('#rtc-qty');
  if (qtyEl) {
    qtyEl.oninput = (e) => {
      if (!selectedLine) return;
      const q = Number(e.target.value) || 0;
      $('#rtc-amount').value = (q * Number(selectedLine.rate || 0)).toFixed(2);
    };
  }

  $('#rtc-submit').onclick = async () => {
    if (!selectedInvoice) { toast('Pick an invoice', 'error'); return; }
    if (!selectedLine) { toast('Pick an item', 'error'); return; }

    const dEl = document.querySelector('#rt-content input[name="tx_date"]');
    const tEl = document.querySelector('#rt-content input[name="tx_time"]');
    const dv = dEl ? dEl.value : '';
    const tv = (tEl && tEl.value) ? tEl.value.trim() : '';
    if (!dv) { toast('Pick a date', 'error'); return; }
    if (dv > todayStr()) { toast('Future dates not allowed', 'error'); return; }

    const qty = Number($('#rtc-qty').value) || 0;
    const amount = Number($('#rtc-amount').value) || 0;
    const reason = ($('#rtc-reason').value || '').trim();

    if (qty <= 0) { toast('Qty must be > 0', 'error'); return; }
    if (qty > Number(selectedLine.qty)) {
      toast(`Cannot return more than sold (${fmtNum(selectedLine.qty)})`, 'error');
      return;
    }
    if (amount < 0) { toast('Amount cannot be negative', 'error'); return; }

    const btn = $('#rtc-submit');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    // 1. Insert return record
    const returnData = {
      direction:     'from_customer',
      invoice_id:    selectedInvoice.id,
      customer_id:   selectedInvoice.customer_id || null,
      customer_name: selectedInvoice.customer_name || 'Walk-in',
      variant_id:    selectedLine.variant_id,
      variant_name:  selectedLine.variant_name,
      shade_name:    selectedLine.shade_name || '',
      pack_size:     selectedLine.pack_size || 0,
      pack_unit:     selectedLine.pack_unit || '',
      batch_id:      selectedLine.batch_id || null,
      batch_no:      selectedLine.batch_no || '',
      qty,
      amount,
      reason,
      return_date:   dv,
      tx_time:       tv
    };

    const { data: retData, error: retErr } = await sb.from('returns').insert(returnData).select().single();
    if (retErr) {
      console.error(retErr);
      toast('Failed to save return: ' + retErr.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Record Return';
      return;
    }

    // 2. Restore batch stock
    if (selectedLine.batch_id) {
      const batch = DB.product_batches.find(b => b.id === selectedLine.batch_id);
      if (batch) {
        await sb.from('product_batches').update({
          qty: Number(batch.qty || 0) + Number(qty),
          updated_at: new Date().toISOString()
        }).eq('id', batch.id);
      }
    } else {
      // Non-batch product — restore variant stock
      const { product } = variantInfo(selectedLine.variant_id);
      if (product?.batch_managed === false) {
        const { variant } = variantInfo(selectedLine.variant_id);
        if (variant) {
          await sb.from('variants').update({
            stock: Number(variant.stock || 0) + Number(qty),
            updated_at: new Date().toISOString()
          }).eq('id', selectedLine.variant_id);
        }
      }
    }

    // 3. Credit note — only if linked to a customer
    if (selectedInvoice.customer_id && amount > 0) {
      const creditNo = 'RET-' + String(Date.now()).slice(-6);
      const creditData = {
        invoice_no:     creditNo,
        customer_id:    selectedInvoice.customer_id,
        customer_name:  selectedInvoice.customer_name || '',
        customer_phone: selectedInvoice.customer_phone || '',
        subtotal:       -amount,
        cash_discount:  0,
        gst_amount:     0,
        total:          -amount,
        paid:           0,
        due:            -amount,
        notes:          `Return of ${selectedLine.variant_name} (${selectedLine.batch_no || 'no batch'}) from ${selectedInvoice.invoice_no}`,
        invoice_date:   dv,
        tx_time:        tv,
        gst_enabled:    false
      };

      const { data: cInv, error: cErr } = await sb.from('invoices').insert(creditData).select().single();

      if (!cErr && cInv) {
        await sb.from('invoice_items').insert({
          invoice_id:   cInv.id,
          variant_id:   selectedLine.variant_id,
          variant_name: selectedLine.variant_name,
          shade_name:   selectedLine.shade_name || '',
          pack_size:    selectedLine.pack_size || 0,
          pack_unit:    selectedLine.pack_unit || '',
          batch_id:     selectedLine.batch_id || null,
          batch_no:     selectedLine.batch_no || '',
          qty:          qty,
          rate:         Number(selectedLine.rate) || 0,
          gst_rate:     0,
          gst_amount:   0,
          total:        -amount,
          line_type:    'return'
        });
      }
    }

    await syncDB();
    toast('Return recorded · stock restored · udhar adjusted', 'success');
    route();
  };
}

/* ─────────────────────────────────────────────
   11.4 RETURN TO SUPPLIER
   ───────────────────────────────────────────── */
function renderReturnToSupplier() {
  $('#rt-content').innerHTML = `
    <div class="card" style="border-radius:16px;">
      <div class="card-title">Return to Supplier</div>

      <div style="display:flex;flex-direction:column;gap:16px;">
        ${dateTimeFieldHTML(null, '', 'Return Date')}

        <div>
          <label class="label">Supplier / Company *</label>
          <select class="input" id="rts-supplier">
            <option value="">— Pick supplier —</option>
            ${DB.suppliers.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(s =>
              `<option value="${s.id}">${esc(s.name)} · ${supplierTypeLabel(s.type)}</option>`
            ).join('')}
          </select>
        </div>

        <div>
          <label class="label">Product Variant *</label>
          <select class="input" id="rts-variant">
            <option value="">— Pick variant —</option>
            ${DB.variants.map(v => {
              const { product } = variantInfo(v.id);
              if (!product || product.batch_managed === false) return '';
              const stock = calculateVariantStockForInvoice(v.id);
              if (stock <= 0) return '';
              return `<option value="${v.id}">${esc(product.name)} · ${esc(v.shade_name || '')} · ${fmtNum(v.pack_size)}${esc(v.pack_unit || '')} (${fmtNum(stock)} in stock)</option>`;
            }).join('')}
          </select>
          <div class="field-hint">Only batch-managed variants with stock are shown</div>
        </div>

        <div id="rts-batch-wrap"></div>

        <div id="rts-fields" style="display:none;flex-direction:column;gap:16px;">
          <div class="grid-2">
            <div>
              <label class="label">Qty to Return *</label>
              <input class="input" type="number" step="any" min="0.001" id="rts-qty" value="1">
            </div>
            <div>
              <label class="label">Amount (₹) *</label>
              <input class="input" type="number" step="any" min="0" id="rts-amount" value="0">
            </div>
          </div>
          <div>
            <label class="label">Reason</label>
            <input class="input" id="rts-reason" placeholder="e.g. Damaged, non-moving, expired batch">
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;">
          <button class="btn btn-primary" id="rts-submit" disabled>Record Return</button>
        </div>
      </div>
    </div>
  `;

  let selectedSupplier = null;
  let selectedVariant  = null;
  let selectedBatch    = null;

  function renderBatchPicker() {
    const wrap = $('#rts-batch-wrap');
    const fields = $('#rts-fields');
    const submit = $('#rts-submit');

    if (!selectedVariant) {
      wrap.innerHTML = '';
      fields.style.display = 'none';
      submit.disabled = true;
      return;
    }

    const batches = DB.product_batches
      .filter(b => b.variant_id === selectedVariant.id && Number(b.qty) > 0)
      .sort((a, b) => String(a.mfg_date || '').localeCompare(String(b.mfg_date || '')));

    if (batches.length === 0) {
      wrap.innerHTML = '<p class="text-sm text-muted text-center" style="padding:14px 0;">No stock batches for this variant</p>';
      fields.style.display = 'none';
      submit.disabled = true;
      return;
    }

    wrap.innerHTML = `
      <label class="label">Select Batch *</label>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${batches.map(b => {
          const isSel = selectedBatch && selectedBatch.id === b.id;
          return `<div data-bid="${b.id}" style="cursor:pointer;border:1px solid ${isSel ? 'var(--primary)' : 'var(--border)'};background:${isSel ? 'var(--primary-light)' : 'var(--bg-card)'};border-radius:8px;padding:12px;display:flex;align-items:center;gap:12px;">
            <div style="flex:1;min-width:0;">
              <div style="font-family:monospace;font-weight:700;color:var(--text-main);">${esc(b.batch_no || '—')}</div>
              <div class="text-xs text-muted" style="margin-top:4px;">
                MFG: ${fmtDate(b.mfg_date)} · Qty: <b>${fmtNum(b.qty)}</b> · Cost: ${rs(b.cost)}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;

    wrap.querySelectorAll('[data-bid]').forEach(el => {
      el.onclick = () => {
        selectedBatch = batches.find(b => b.id === el.dataset.bid);
        if (selectedBatch) {
          $('#rts-qty').value = 1;
          $('#rts-amount').value = Number(selectedBatch.cost || 0).toFixed(2);
        }
        renderBatchPicker();
      };
    });

    if (selectedBatch) {
      fields.style.display = 'flex';
      submit.disabled = false;
    } else {
      fields.style.display = 'none';
      submit.disabled = true;
    }
  }

  $('#rts-supplier').onchange = (e) => {
    selectedSupplier = e.target.value ? DB.suppliers.find(s => s.id === e.target.value) : null;
  };

  $('#rts-variant').onchange = (e) => {
    selectedVariant = e.target.value ? DB.variants.find(v => v.id === e.target.value) : null;
    selectedBatch = null;
    renderBatchPicker();
  };

  const qtyEl = $('#rts-qty');
  if (qtyEl) {
    qtyEl.oninput = (e) => {
      if (!selectedBatch) return;
      const q = Number(e.target.value) || 0;
      $('#rts-amount').value = (q * Number(selectedBatch.cost || 0)).toFixed(2);
    };
  }

  $('#rts-submit').onclick = async () => {
    if (!selectedSupplier) { toast('Pick a supplier', 'error'); return; }
    if (!selectedVariant)  { toast('Pick a variant', 'error'); return; }
    if (!selectedBatch)    { toast('Pick a batch', 'error'); return; }

    const dEl = document.querySelector('#rt-content input[name="tx_date"]');
    const tEl = document.querySelector('#rt-content input[name="tx_time"]');
    const dv = dEl ? dEl.value : '';
    const tv = (tEl && tEl.value) ? tEl.value.trim() : '';
    if (!dv) { toast('Pick a date', 'error'); return; }
    if (dv > todayStr()) { toast('Future dates not allowed', 'error'); return; }

    const qty = Number($('#rts-qty').value) || 0;
    const amount = Number($('#rts-amount').value) || 0;
    const reason = ($('#rts-reason').value || '').trim();

    if (qty <= 0) { toast('Qty must be > 0', 'error'); return; }
    if (qty > Number(selectedBatch.qty)) {
      toast(`Cannot return more than batch has (${fmtNum(selectedBatch.qty)})`, 'error');
      return;
    }
    if (amount < 0) { toast('Amount cannot be negative', 'error'); return; }

    const btn = $('#rts-submit');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const { product } = variantInfo(selectedVariant.id);

    // 1. Insert return record
    const returnData = {
      direction:     'to_supplier',
      supplier_id:   selectedSupplier.id,
      supplier_name: selectedSupplier.name || '',
      variant_id:    selectedVariant.id,
      variant_name:  product?.name || '',
      shade_name:    selectedVariant.shade_name || '',
      pack_size:     selectedVariant.pack_size || 0,
      pack_unit:     selectedVariant.pack_unit || '',
      batch_id:      selectedBatch.id,
      batch_no:      selectedBatch.batch_no || '',
      qty,
      amount,
      reason,
      return_date:   dv,
      tx_time:       tv
    };

    const { error: retErr } = await sb.from('returns').insert(returnData);
    if (retErr) {
      console.error(retErr);
      toast('Failed to save return: ' + retErr.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Record Return';
      return;
    }

    // 2. Reduce batch qty
    await sb.from('product_batches').update({
      qty: Math.max(0, Number(selectedBatch.qty) - Number(qty)),
      updated_at: new Date().toISOString()
    }).eq('id', selectedBatch.id);

    // 3. Create credit-note supplier payment
    if (amount > 0) {
      await sb.from('supplier_payments').insert({
        supplier_id:   selectedSupplier.id,
        supplier_name: selectedSupplier.name || '',
        amount,
        mode:          'credit-note',
        notes:         `Return: ${product?.name || ''} · ${selectedVariant.shade_name || ''} × ${fmtNum(qty)} (Batch ${selectedBatch.batch_no || ''})`,
        payment_date:  dv,
        tx_time:       tv
      });
    }

    await syncDB();
    toast('Return recorded · stock reduced · payable credited', 'success');
    route();
  };
}

/* ─────────────────────────────────────────────
   11.5 DELETE RETURN (reverses everything)
   ───────────────────────────────────────────── */
async function deleteReturn(id) {
  const r = DB.returns.find(x => x.id === id);
  if (!r) return;

  if (!confirmDlg('Delete this return?\n\nStock and account balances will be reversed.', 'Confirm Delete')) return;

  // 1. Reverse stock
  if (r.batch_id) {
    const batch = DB.product_batches.find(b => b.id === r.batch_id);
    if (batch) {
      const delta = r.direction === 'from_customer' ? -Number(r.qty) : Number(r.qty);
      await sb.from('product_batches').update({
        qty: Math.max(0, Number(batch.qty) + delta),
        updated_at: new Date().toISOString()
      }).eq('id', batch.id);
    }
  } else if (r.variant_id) {
    const { product } = variantInfo(r.variant_id);
    if (product?.batch_managed === false) {
      const { variant } = variantInfo(r.variant_id);
      if (variant) {
        const delta = r.direction === 'from_customer' ? -Number(r.qty) : Number(r.qty);
        await sb.from('variants').update({
          stock: Math.max(0, Number(variant.stock) + delta),
          updated_at: new Date().toISOString()
        }).eq('id', r.variant_id);
      }
    }
  }

  // 2. Reverse credit note
  if (r.direction === 'from_customer' && r.customer_id && r.amount > 0) {
    const credits = DB.invoices.filter(i =>
      String(i.invoice_no || '').startsWith('RET-') &&
      i.customer_id === r.customer_id &&
      Math.abs(Number(i.total)) === Math.abs(Number(r.amount))
    );
    if (credits.length > 0) {
      credits.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      await sb.from('invoices').delete().eq('id', credits[0].id);
    }
  }

  if (r.direction === 'to_supplier' && r.supplier_id && r.amount > 0) {
    const credPays = DB.supplier_payments.filter(p =>
      p.supplier_id === r.supplier_id &&
      p.mode === 'credit-note' &&
      Number(p.amount) === Number(r.amount)
    );
    if (credPays.length > 0) {
      credPays.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      await sb.from('supplier_payments').delete().eq('id', credPays[0].id);
    }
  }

  // 3. Delete return
  const { error } = await sb.from('returns').delete().eq('id', r.id);
  if (error) {
    console.error(error);
    toast('Failed to delete return.', 'error');
    return;
  }

  await syncDB();
  toast('Return deleted · reversed', 'success');
  route();
}

/* ─────────────────────────────────────────────
   11.6 EXPENSES PAGE
   ───────────────────────────────────────────── */
function renderExpenses(content) {
  const list = DB.expenses;
  const today = todayStr();
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Expenses</h1>
        <p>${list.length} entr${list.length === 1 ? 'y' : 'ies'}</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="add-exp">+ Add Expense</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;border-radius:16px;">
      <div style="flex:1;min-width:140px;">
        <label class="label">From</label>
        <input class="input" type="date" id="ex-from" value="${firstOfMonth}" max="${today}">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">To</label>
        <input class="input" type="date" id="ex-to" value="${today}" max="${today}">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Category</label>
        <select class="input" id="ex-cat">
          <option value="">All categories</option>
          ${[...new Set(list.map(e => e.category).filter(Boolean))].sort().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div style="flex:0 0 auto;">
        <label class="label">&nbsp;</label>
        <button class="btn btn-ghost" id="ex-clear">All Time</button>
      </div>
    </div>

    <div class="kpi-row" style="margin-bottom:20px;">
      <div class="kpi-featured" style="grid-column:span 4;background:linear-gradient(135deg,#EF4444 0%,#DC2626 100%);border-radius:16px;">
        <div class="kpi-icon">💸</div>
        <div>
          <div class="kpi-label">Total Expenses (filtered)</div>
          <div class="kpi-value" id="ex-total">₹0.00</div>
        </div>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>Notes</th>
            <th style="text-align:right">Amount</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="ex-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="ex-mobile"></div>
  `;

  function filtered() {
    const f = $('#ex-from').value;
    const t = $('#ex-to').value;
    const cat = $('#ex-cat').value;

    return list
      .filter(e => {
        const d = txDate(e, 'expense_date');
        if (f && d < f) return false;
        if (t && d > t) return false;
        if (cat && e.category !== cat) return false;
        return true;
      })
      .sort((a, b) => txDate(b, 'expense_date').localeCompare(txDate(a, 'expense_date')));
  }

  function renderList() {
    const arr = filtered();
    const tot = arr.reduce((s, e) => s + Number(e.amount || 0), 0);

    const totalEl = $('#ex-total');
    if (totalEl) totalEl.textContent = rs(tot);

    const tbody = $('#ex-body');
    if (tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted);">
             ${list.length === 0
               ? 'No expenses yet — click <b>+ Add Expense</b> to record one.'
               : 'No expenses in this range.'}
           </td></tr>`
        : arr.map(e => `<tr>
            <td class="text-sm text-muted">${txDT(e, 'expense_date')}</td>
            <td><span class="chip chip-neutral">${esc(e.category || '—')}</span></td>
            <td class="text-sm text-muted">${esc(e.notes || '—')}</td>
            <td style="text-align:right;font-weight:600;color:var(--danger);">${rs(e.amount)}</td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn btn-ghost btn-sm" data-edit="${e.id}">Edit</button>
              <button class="btn btn-ghost btn-sm" data-del="${e.id}" style="color:var(--danger);">Del</button>
            </td>
          </tr>`).join('');
    }

    const mob = $('#ex-mobile');
    if (mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state"><div class="empty-icon">💸</div><div class="empty-title">${list.length === 0 ? 'No expenses yet' : 'No expenses in this range'}</div></div>`
        : arr.map(e => `
            <div class="mobile-card">
              <div class="mobile-card-head">
                <div>
                  <div class="mobile-card-title">${esc(e.category || '—')}</div>
                  <div class="mobile-card-sub">${e.notes ? esc(e.notes) + ' · ' : ''}${txDT(e, 'expense_date')}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-weight:700;color:var(--danger);">${rs(e.amount)}</div>
                </div>
              </div>
              <div class="mobile-card-foot">
                <div style="display:flex;gap:6px;">
                  <button class="btn btn-ghost btn-sm" data-edit="${e.id}">Edit</button>
                  <button class="btn btn-ghost btn-sm" data-del="${e.id}" style="color:var(--danger);">Delete</button>
                </div>
              </div>
            </div>
          `).join('');
    }

    $$('[data-edit]').forEach(btn => btn.onclick = () => {
      const e = DB.expenses.find(x => x.id === btn.dataset.edit);
      if (e) openExpenseForm(e);
    });

    $$('[data-del]').forEach(btn => btn.onclick = async () => {
      if (!confirmDlg('Delete this expense?', 'Confirm Delete')) return;
      const { error } = await sb.from('expenses').delete().eq('id', btn.dataset.del);
      if (error) { toast('Failed to delete.', 'error'); return; }
      await syncDB();
      toast('Deleted', 'success');
      route();
    });
  }

  ['ex-from', 'ex-to', 'ex-cat'].forEach(id => {
    const el = $('#' + id);
    if (el) el.onchange = renderList;
  });

  $('#ex-clear').onclick = () => {
    $('#ex-from').value = '';
    $('#ex-to').value = '';
    $('#ex-cat').value = '';
    renderList();
  };

  $('#add-exp').onclick = () => openExpenseForm();

  renderList();
}

/* ─────────────────────────────────────────────
   11.7 EXPENSE FORM
   ───────────────────────────────────────────── */
function openExpenseForm(existing) {
  const e = existing || {
    category: '',
    amount: '',
    notes: '',
    expense_date: todayStr(),
    tx_time: ''
  };

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${existing ? 'Edit' : 'Add'} Expense</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <form id="ef" style="display:flex;flex-direction:column;gap:16px;">
        ${dateTimeFieldHTML(e.expense_date, e.tx_time, 'Expense Date')}

        <div>
          <label class="label">Category *</label>
          <input class="input" name="category" required value="${esc(e.category || '')}"
                 placeholder="Rent, electricity, salary, transport..." autofocus list="exp-cats">
          <datalist id="exp-cats">
            <option>Rent</option>
            <option>Electricity</option>
            <option>Salary</option>
            <option>Transport</option>
            <option>Internet</option>
            <option>Packaging</option>
            <option>Maintenance</option>
            <option>Marketing</option>
            <option>Tea / Snacks</option>
            <option>Other</option>
          </datalist>
        </div>

        <div>
          <label class="label">Amount (₹) *</label>
          <input class="input" type="number" step="any" min="0.01" name="amount" required value="${e.amount || ''}">
        </div>

        <div>
          <label class="label">Notes</label>
          <input class="input" name="notes" value="${esc(e.notes || '')}" placeholder="Optional details">
        </div>
      </form>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="ef-save">${existing ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    root.querySelector('#ef-save').onclick = async () => {
      const form = root.querySelector('#ef');
      if (!form.reportValidity()) return;

      const dt = readDateTime(form);
      if (!dt) return;

      const fd = new FormData(form);
      const amt = Number(fd.get('amount')) || 0;
      if (amt <= 0) { toast('Amount must be greater than 0', 'error'); return; }

      const data = {
        category:     (fd.get('category') || '').trim(),
        amount:       amt,
        notes:        (fd.get('notes') || '').trim(),
        expense_date: dt.date,
        tx_time:      dt.time || null
      };
      if (!data.category) { toast('Category is required', 'error'); return; }

      const btn = root.querySelector('#ef-save');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      let res;
      if (existing) res = await sb.from('expenses').update(data).eq('id', existing.id);
      else          res = await sb.from('expenses').insert(data);

      if (res.error) {
        console.error(res.error);
        toast('Failed to save expense: ' + (res.error.message || 'unknown'), 'error');
        btn.disabled = false;
        btn.textContent = existing ? 'Update' : 'Save';
        return;
      }

      await syncDB();
      toast(existing ? 'Updated' : 'Added', 'success');
      closeModal(root);
      route();
    };
  });
}
/* ══════════════════════════════════════════════════════════════════
   STEP 12 — REPORTS · P&L · MARGIN
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   12.1 CHART MANAGEMENT (bulletproof)
   ───────────────────────────────────────────── */
window.charts = window.charts || [];
function destroyCharts() {
  (window.charts || []).forEach(c => { try { c.destroy(); } catch (e) {} });
  window.charts = [];
}
function pushChart(chart) {
  window.charts = window.charts || [];
  window.charts.push(chart);
}

/* ─────────────────────────────────────────────
   12.2 SHARED HELPERS
   ───────────────────────────────────────────── */
function reportDateRange(preset, customFrom, customTo) {
  const t = todayStr();
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const firstOfYear = new Date().getFullYear() + '-01-01';

  if (preset === 'today')  return { from: t, to: t, label: 'Today' };
  if (preset === 'week') {
    const d = new Date();
    const day = d.getDay() || 7;
    const mon = new Date(d);
    mon.setDate(d.getDate() - day + 1);
    return { from: mon.toISOString().slice(0, 10), to: t, label: 'This Week' };
  }
  if (preset === 'month')  return { from: firstOfMonth, to: t, label: 'This Month' };
  if (preset === 'year')   return { from: firstOfYear, to: t, label: 'This Year' };
  if (preset === 'custom') return { from: customFrom || '0000-01-01', to: customTo || '9999-12-31', label: (customFrom || '—') + ' to ' + (customTo || '—') };
  return { from: '0000-01-01', to: '9999-12-31', label: 'All Time' };
}

function isReturnInvoice(inv) {
  return String(inv?.invoice_no || '').startsWith('RET-');
}

function invoicesInRange(from, to) {
  return DB.invoices.filter(inv => {
    if (isReturnInvoice(inv)) return false;
    const d = txDate(inv, 'invoice_date');
    return d >= from && d <= to;
  });
}

function lineCost(item) {
  if (!item) return 0;
  const qty = Number(item.qty) || 0;
  if (item.batch_id) {
    const batch = DB.product_batches.find(b => b.id === item.batch_id);
    if (batch) return qty * (Number(batch.cost) || 0);
  }
  if (item.variant_id) {
    const variant = DB.variants.find(v => v.id === item.variant_id);
    if (variant) return qty * (Number(variant.cost) || 0);
  }
  return 0;
}

function lineInfo(item) {
  const variant = item.variant_id ? DB.variants.find(v => v.id === item.variant_id) : null;
  const product = variant ? DB.products.find(p => p.id === variant.product_id) : null;
  const brand = product ? DB.brands.find(b => b.id === product.brand_id) : null;
  return { variant, product, brand };
}

/* Reusable filter bar HTML */
function reportFilterBarHTML(prefix, activePreset) {
  const btns = [
    ['all', 'All Time'], ['today', 'Today'], ['week', 'This Week'],
    ['month', 'This Month'], ['year', 'This Year'], ['custom', 'Custom']
  ];
  return `
    <div class="card" style="margin-bottom:20px;border-radius:16px;padding:16px;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:${activePreset === 'custom' ? '12px' : '0'};" id="${prefix}-presets">
        ${btns.map(([v, l]) =>
          `<button class="btn btn-sm ${activePreset === v ? 'btn-primary' : 'btn-ghost'}" data-r="${v}">${l}</button>`
        ).join('')}
      </div>
      <div id="${prefix}-custom" style="display:${activePreset === 'custom' ? 'flex' : 'none'};gap:8px;flex-wrap:wrap;align-items:end;">
        <div><label class="label">From</label><input class="input" type="date" id="${prefix}-from"></div>
        <div><label class="label">To</label><input class="input" type="date" id="${prefix}-to"></div>
        <div><label class="label">&nbsp;</label><button class="btn btn-primary btn-sm" id="${prefix}-apply">Apply</button></div>
      </div>
    </div>
  `;
}

function wireReportFilterBar(prefix, onChange) {
  const state = { preset: 'month', customFrom: '', customTo: '' };
  const presets = document.getElementById(prefix + '-presets');
  const custom  = document.getElementById(prefix + '-custom');

  presets.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      state.preset = b.dataset.r;
      presets.querySelectorAll('button').forEach(x => {
        x.className = 'btn btn-sm ' + (x.dataset.r === state.preset ? 'btn-primary' : 'btn-ghost');
      });
      if (custom) custom.style.display = state.preset === 'custom' ? 'flex' : 'none';
      if (state.preset !== 'custom') onChange(state);
    };
  });

  const applyBtn = document.getElementById(prefix + '-apply');
  if (applyBtn) {
    applyBtn.onclick = () => {
      const f = document.getElementById(prefix + '-from').value;
      const t = document.getElementById(prefix + '-to').value;
      if (!f || !t) { toast('Pick both dates', 'error'); return; }
      if (f > t) { toast('From cannot be after To', 'error'); return; }
      state.customFrom = f;
      state.customTo = t;
      onChange(state);
    };
  }

  return state;
}

/* ─────────────────────────────────────────────
   12.3 REPORTS HUB
   ───────────────────────────────────────────── */
function renderReportsHub(content) {
  destroyCharts();

  const today = todayStr();
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const monthInvs = invoicesInRange(firstOfMonth, today);
  const monthRev = monthInvs.reduce((s, i) => s + Number(i.total || 0), 0);
  const monthItems = DB.invoice_items.filter(it => monthInvs.some(inv => inv.id === it.invoice_id));
  const monthCost = monthItems.reduce((s, it) => s + lineCost(it), 0);
  const monthProfit = monthRev - monthCost;

  content.innerHTML = `
    <div class="page-head" style="margin-bottom:24px;">
      <div class="page-head-title">
        <h1>Reports</h1>
        <p>Business insights and analytics</p>
      </div>
    </div>

    <div class="kpi-row" style="margin-bottom:24px;">
      <div class="kpi-featured" style="border-radius:16px;">
        <div class="kpi-icon">💰</div>
        <div>
          <div class="kpi-label">Revenue (This Month)</div>
          <div class="kpi-value">${rs(monthRev)}</div>
          <div class="kpi-trend">${monthInvs.length} invoice${monthInvs.length === 1 ? '' : 's'}</div>
        </div>
      </div>
      <div class="kpi-card" style="border-radius:16px;">
        <div class="kpi-card-top">
          <div class="kpi-label">Cost of Goods</div>
          <div class="kpi-icon" style="color:var(--warning);background:var(--warning-bg);">📦</div>
        </div>
        <div class="kpi-value">${rs(monthCost)}</div>
      </div>
      <div class="kpi-card" style="border-radius:16px;">
        <div class="kpi-card-top">
          <div class="kpi-label">Gross Profit</div>
          <div class="kpi-icon" style="color:var(--success);background:var(--success-bg);">💹</div>
        </div>
        <div class="kpi-value" style="color:${monthProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">${rs(monthProfit)}</div>
      </div>
      <div class="kpi-card" style="border-radius:16px;">
        <div class="kpi-card-top">
          <div class="kpi-label">Avg Margin</div>
          <div class="kpi-icon" style="color:var(--primary);background:var(--primary-light);">%</div>
        </div>
        <div class="kpi-value">${monthRev > 0 ? ((monthProfit / monthRev) * 100).toFixed(1) : '0.0'}%</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
      ${[
        { title: 'Sales by Brand',   desc: 'Revenue breakdown across companies', href: '#/reports/brand-sales',  icon: '🏷️', accent: 'var(--primary)' },
        { title: 'Top Shades',       desc: 'Best-selling colours and pack sizes', href: '#/reports/top-shades',   icon: '🎨', accent: '#F59E0B' },
        { title: 'Dead Stock',       desc: 'Inventory not sold in a while',       href: '#/reports/dead-stock',   icon: '💤', accent: '#6B7280' },
        { title: 'Profit by Brand',  desc: 'Which company gives the most profit', href: '#/reports/brand-profit', icon: '💹', accent: 'var(--success)' },
        { title: 'Product Margin',   desc: 'Per-SKU profitability across sales',  href: '#/margin',               icon: '📊', accent: '#8B5CF6' },
        { title: 'Profit & Loss',    desc: 'Revenue, COGS, expenses and net',     href: '#/pnl',                  icon: '📈', accent: '#EF4444' }
      ].map(r => `
        <a href="${r.href}" style="display:block;padding:24px;background:var(--bg-card);border:1px solid var(--border);border-radius:16px;text-decoration:none;color:inherit;transition:all 0.2s;box-shadow:var(--shadow-sm);" onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='var(--shadow-md)';this.style.borderColor='${r.accent}'" onmouseout="this.style.transform='';this.style.boxShadow='var(--shadow-sm)';this.style.borderColor='var(--border)'">
          <div style="width:48px;height:48px;border-radius:12px;background:${r.accent}22;color:${r.accent};display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:16px;">${r.icon}</div>
          <div style="font-weight:700;font-size:15px;color:var(--text-main);margin-bottom:4px;">${r.title}</div>
          <div class="text-sm text-muted" style="line-height:1.5;">${r.desc}</div>
        </a>
      `).join('')}
    </div>
  `;
}

/* ─────────────────────────────────────────────
   12.4 SALES BY BRAND
   ───────────────────────────────────────────── */
function renderBrandSalesReport(content) {
  destroyCharts();

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/reports" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Reports</a>
    </div>

    <div class="page-head" style="margin-bottom:20px;">
      <div class="page-head-title">
        <h1>Sales by Brand</h1>
        <p>Revenue contribution per brand</p>
      </div>
    </div>

    ${reportFilterBarHTML('bs', 'month')}
    <div id="bs-content"></div>
  `;

  function run(state) {
    const range = reportDateRange(state.preset, state.customFrom, state.customTo);
    const invs = invoicesInRange(range.from, range.to);
    const items = DB.invoice_items.filter(it => invs.some(inv => inv.id === it.invoice_id));

    const map = {};
    items.forEach(it => {
      const { brand } = lineInfo(it);
      const name = brand?.name || 'Unbranded';
      if (!map[name]) map[name] = { name, qty: 0, revenue: 0, invoices: new Set() };
      map[name].qty     += Number(it.qty)   || 0;
      map[name].revenue += Number(it.total) || 0;
      map[name].invoices.add(it.invoice_id);
    });

    const totalRev = Object.values(map).reduce((s, x) => s + x.revenue, 0);
    const arr = Object.values(map).sort((a, b) => b.revenue - a.revenue);
    const box = $('#bs-content');

    if (arr.length === 0) {
      box.innerHTML = '<div class="card" style="padding:60px 20px;border-radius:16px;"><div class="empty-state"><div class="empty-icon">🏷️</div><div class="empty-title">No sales in this range</div></div></div>';
      return;
    }

    box.innerHTML = `
      <div class="card" style="margin-bottom:20px;border-radius:16px;">
        <div class="card-title">Revenue by Brand <small>${range.label}</small></div>
        <div style="position:relative;height:300px;"><canvas id="bs-chart"></canvas></div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Brand</th>
              <th style="text-align:right">Units</th>
              <th style="text-align:right">Invoices</th>
              <th style="text-align:right">Revenue</th>
              <th style="text-align:right">Share</th>
            </tr>
          </thead>
          <tbody>
            ${arr.map((x, i) => {
              const share = totalRev > 0 ? (x.revenue / totalRev) * 100 : 0;
              return `<tr>
                <td><b>${i + 1}</b></td>
                <td><strong>${esc(x.name)}</strong></td>
                <td style="text-align:right;">${fmtNum(x.qty)}</td>
                <td style="text-align:right;">${x.invoices.size}</td>
                <td style="text-align:right;font-weight:600;color:var(--primary);">${rs(x.revenue)}</td>
                <td style="text-align:right;font-weight:600;">${share.toFixed(1)}%</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    const ctx = document.getElementById('bs-chart');
    if (ctx) {
      const colors = ['#5B5BD6','#3B82F6','#8B5CF6','#F59E0B','#EF4444','#10B981','#06B6D4','#EC4899','#84CC16','#F97316'];
      pushChart(new Chart(ctx, {
        type: 'bar',
        data: {
          labels: arr.map(x => x.name),
          datasets: [{
            label: 'Revenue',
            data: arr.map(x => x.revenue),
            backgroundColor: arr.map((_, i) => colors[i % colors.length]),
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: c => rs(c.parsed.y) } }
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: v => '₹' + Number(v).toLocaleString('en-IN') }, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { grid: { display: false } }
          }
        }
      }));
    }
  }

  const state = wireReportFilterBar('bs', run);
  run(state);
}

/* ─────────────────────────────────────────────
   12.5 TOP SHADES
   ───────────────────────────────────────────── */
function renderTopShadesReport(content) {
  destroyCharts();

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/reports" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Reports</a>
    </div>

    <div class="page-head" style="margin-bottom:20px;">
      <div class="page-head-title">
        <h1>Top Shades</h1>
        <p>Best-selling colours across all products</p>
      </div>
    </div>

    ${reportFilterBarHTML('ts', 'month')}
    <div id="ts-content"></div>
  `;

  function run(state) {
    const range = reportDateRange(state.preset, state.customFrom, state.customTo);
    const invs = invoicesInRange(range.from, range.to);
    const items = DB.invoice_items.filter(it => invs.some(inv => inv.id === it.invoice_id));

    const map = {};
    items.forEach(it => {
      const key = (it.shade_name || it.variant_name || 'Unknown') + '|' + (it.pack_size || '') + (it.pack_unit || '');
      if (!map[key]) map[key] = { shade: it.shade_name || '—', variant: it.variant_name, pack: `${fmtNum(it.pack_size || 0)}${it.pack_unit || ''}`, qty: 0, revenue: 0 };
      map[key].qty     += Number(it.qty) || 0;
      map[key].revenue += Number(it.total) || 0;
    });

    const arr = Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 20);
    const box = $('#ts-content');

    if (arr.length === 0) {
      box.innerHTML = '<div class="card" style="padding:60px 20px;border-radius:16px;"><div class="empty-state"><div class="empty-icon">🎨</div><div class="empty-title">No sales in this range</div></div></div>';
      return;
    }

    const maxRev = arr[0].revenue || 1;

    box.innerHTML = `
      <div class="card" style="border-radius:16px;">
        <div class="card-title">Top 20 Shades <small>${range.label}</small></div>
        <div>
          ${arr.map((x, i) => {
            const pct = (x.revenue / maxRev) * 100;
            return `<div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--border);">
              <div style="width:32px;text-align:center;font-weight:700;color:var(--text-muted);font-size:13px;">${i + 1}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:13px;">${esc(x.shade)} <span class="text-muted" style="font-weight:400;font-size:11px;">· ${esc(x.variant)} · ${esc(x.pack)}</span></div>
                <div style="height:6px;background:var(--border);border-radius:3px;margin-top:6px;overflow:hidden;">
                  <div style="height:100%;width:${pct}%;background:linear-gradient(90deg, #5B5BD6, #818CF8);border-radius:3px;"></div>
                </div>
              </div>
              <div style="text-align:right;flex-shrink:0;">
                <div style="font-weight:700;font-size:13px;">${rs(x.revenue)}</div>
                <div style="font-size:11px;color:var(--text-muted);">${fmtNum(x.qty)} sold</div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }


  const state = wireReportFilterBar('ts', run);
  run(state);
}

/* ─────────────────────────────────────────────
   12.6 DEAD STOCK
   ───────────────────────────────────────────── */
function renderDeadStockReport(content) {
  destroyCharts();

  let days = 90;

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/reports" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Reports</a>
    </div>

    <div class="page-head" style="margin-bottom:20px;">
      <div class="page-head-title">
        <h1>Dead Stock</h1>
        <p>Inventory that hasn't sold in a while</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;border-radius:16px;padding:16px;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;" id="ds-days">
        <button class="btn btn-sm btn-ghost" data-d="30">30 days</button>
        <button class="btn btn-sm btn-primary" data-d="90">90 days</button>
        <button class="btn btn-sm btn-ghost" data-d="180">180 days</button>
        <button class="btn btn-sm btn-ghost" data-d="365">365 days</button>
        <button class="btn btn-sm btn-ghost" data-d="99999">Never sold</button>
      </div>
    </div>

    <div id="ds-content"></div>
  `;

  function run() {
    const today = new Date(todayStr());

    // Last sale date per variant
    const lastSale = {};
    DB.invoices.forEach(inv => {
      if (isReturnInvoice(inv)) return;
      const items = DB.invoice_items.filter(it => it.invoice_id === inv.id);
      items.forEach(it => {
        if (!it.variant_id) return;
        const d = txDate(inv, 'invoice_date');
        if (!lastSale[it.variant_id] || d > lastSale[it.variant_id]) {
          lastSale[it.variant_id] = d;
        }
      });
    });

    // For each variant with stock > 0, check days since last sale
    const dead = [];
    DB.variants.forEach(v => {
      const { product } = lineInfo({ variant_id: v.id });
      if (!product) return;

      const stock = product.batch_managed === false
        ? Number(v.stock) || 0
        : DB.product_batches.filter(b => b.variant_id === v.id && Number(b.qty) > 0).reduce((s, b) => s + Number(b.qty), 0);

      if (stock <= 0) return;

      const last = lastSale[v.id];
      let daysSince = null;
      if (!last) {
        daysSince = Infinity;
      } else {
        daysSince = Math.floor((today - new Date(last)) / 86400000);
      }

      if (daysSince >= days) {
        const cost = product.batch_managed === false
          ? Number(v.cost) || 0
          : (DB.product_batches
              .filter(b => b.variant_id === v.id && Number(b.qty) > 0)
              .reduce((s, b) => s + Number(b.qty) * Number(b.cost || 0), 0) / stock);

        dead.push({
          variant: v,
          product,
          stock,
          costValue: stock * cost,
          lastSale: last || null,
          daysSince: daysSince === Infinity ? null : daysSince
        });
      }
    });

    dead.sort((a, b) => b.costValue - a.costValue);

    const totalValue = dead.reduce((s, x) => s + x.costValue, 0);
    const box = $('#ds-content');

    if (dead.length === 0) {
      box.innerHTML = '<div class="card" style="padding:60px 20px;border-radius:16px;"><div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">No dead stock</div><div class="empty-desc">All your inventory has moved within ' + (days === 99999 ? 'ever' : days + ' days') + '.</div></div></div>';
      return;
    }

    box.innerHTML = `
      <div class="kpi-row" style="margin-bottom:20px;">
        <div class="kpi-featured" style="grid-column:span 4;background:linear-gradient(135deg,#6B7280 0%,#374151 100%);border-radius:16px;">
          <div class="kpi-icon">💤</div>
          <div>
            <div class="kpi-label">Locked-up Capital</div>
            <div class="kpi-value">${rs(totalValue)}</div>
            <div class="kpi-trend">${dead.length} variant${dead.length === 1 ? '' : 's'} · ${days === 99999 ? 'never sold' : 'no sales in ' + days + ' days'}</div>
          </div>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product · Shade</th>
              <th>Pack</th>
              <th style="text-align:right">Stock</th>
              <th style="text-align:right">Cost Value</th>
              <th>Last Sale</th>
              <th style="text-align:right">Days Since</th>
            </tr>
          </thead>
          <tbody>
            ${dead.map(x => `
              <tr>
                <td>
                  <strong>${esc(x.product.name)}</strong>
                  <div class="text-xs text-muted" style="margin-top:2px;">${esc(x.variant.shade_name || '—')}</div>
                </td>
                <td><span class="chip chip-neutral">${fmtNum(x.variant.pack_size)}${esc(x.variant.pack_unit || '')}</span></td>
                <td style="text-align:right;">${fmtNum(x.stock)}</td>
                <td style="text-align:right;font-weight:600;color:var(--danger);">${rs(x.costValue)}</td>
                <td class="text-sm text-muted">${x.lastSale ? fmtDate(x.lastSale) : '<span class="chip chip-warning" style="font-size:10px;">Never</span>'}</td>
                <td style="text-align:right;font-weight:700;color:${x.daysSince === null || x.daysSince > 365 ? 'var(--danger)' : 'var(--warning)'};">
                  ${x.daysSince === null ? '∞' : x.daysSince + 'd'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  $('#ds-days').querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      days = Number(btn.dataset.d);
      $('#ds-days').querySelectorAll('button').forEach(b => {
        b.className = 'btn btn-sm ' + (Number(b.dataset.d) === days ? 'btn-primary' : 'btn-ghost');
      });
      run();
    };
  });

  run();
}

/* ─────────────────────────────────────────────
   12.7 PROFIT BY BRAND
   ───────────────────────────────────────────── */
function renderBrandProfitReport(content) {
  destroyCharts();

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/reports" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Reports</a>
    </div>

    <div class="page-head" style="margin-bottom:20px;">
      <div class="page-head-title">
        <h1>Profit by Brand</h1>
        <p>Which company actually makes you the most money</p>
      </div>
    </div>

    ${reportFilterBarHTML('bp', 'month')}
    <div id="bp-content"></div>
  `;

  function run(state) {
    const range = reportDateRange(state.preset, state.customFrom, state.customTo);
    const invs = invoicesInRange(range.from, range.to);
    const items = DB.invoice_items.filter(it => invs.some(inv => inv.id === it.invoice_id));

    const map = {};
    items.forEach(it => {
      const { brand } = lineInfo(it);
      const name = brand?.name || 'Unbranded';
      if (!map[name]) map[name] = { name, revenue: 0, cost: 0 };
      map[name].revenue += Number(it.total) || 0;
      map[name].cost    += lineCost(it);
    });

    const arr = Object.values(map)
      .map(x => ({ ...x, profit: x.revenue - x.cost, margin: x.revenue > 0 ? ((x.revenue - x.cost) / x.revenue) * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit);

    const box = $('#bp-content');

    if (arr.length === 0) {
      box.innerHTML = '<div class="card" style="padding:60px 20px;border-radius:16px;"><div class="empty-state"><div class="empty-icon">💹</div><div class="empty-title">No sales in this range</div></div></div>';
      return;
    }

    box.innerHTML = `
      <div class="card" style="margin-bottom:20px;border-radius:16px;">
        <div class="card-title">Profit by Brand <small>${range.label}</small></div>
        <div style="position:relative;height:300px;"><canvas id="bp-chart"></canvas></div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Brand</th>
              <th style="text-align:right">Revenue</th>
              <th style="text-align:right">Cost</th>
              <th style="text-align:right">Profit</th>
              <th style="text-align:right">Margin</th>
            </tr>
          </thead>
          <tbody>
            ${arr.map(x => {
              const pc = x.profit >= 0 ? 'var(--success)' : 'var(--danger)';
              return `<tr>
                <td><strong>${esc(x.name)}</strong></td>
                <td style="text-align:right;">${rs(x.revenue)}</td>
                <td style="text-align:right;" class="text-muted">${rs(x.cost)}</td>
                <td style="text-align:right;font-weight:600;color:${pc};">${rs(x.profit)}</td>
                <td style="text-align:right;color:${pc};">${x.margin.toFixed(1)}%</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    const ctx = document.getElementById('bp-chart');
    if (ctx) {
      pushChart(new Chart(ctx, {
        type: 'bar',
        data: {
          labels: arr.map(x => x.name),
          datasets: [
            { label: 'Revenue', data: arr.map(x => x.revenue), backgroundColor: '#5B5BD6', borderRadius: 6 },
            { label: 'Cost',    data: arr.map(x => x.cost),    backgroundColor: '#E0E0F5', borderRadius: 6 },
            { label: 'Profit',  data: arr.map(x => x.profit),  backgroundColor: '#10B981', borderRadius: 6 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: { callbacks: { label: c => c.dataset.label + ': ' + rs(c.parsed.y) } }
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: v => '₹' + Number(v).toLocaleString('en-IN') }, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { grid: { display: false } }
          }
        }
      }));
    }
  }

  const state = wireReportFilterBar('bp', run);
  run(state);
}

/* ─────────────────────────────────────────────
   12.8 MARGIN (per product)
   ───────────────────────────────────────────── */
function renderMargin(content) {
  destroyCharts();

  content.innerHTML = `
    <div class="page-head" style="margin-bottom:20px;">
      <div class="page-head-title">
        <h1>Product Margin</h1>
        <p>Every product you've sold, ranked by profitability</p>
      </div>
    </div>

    ${reportFilterBarHTML('mg', 'month')}
    <div id="mg-content"></div>
  `;

  function run(state) {
    const range = reportDateRange(state.preset, state.customFrom, state.customTo);
    const invs = invoicesInRange(range.from, range.to);
    const items = DB.invoice_items.filter(it => invs.some(inv => inv.id === it.invoice_id));

    // Aggregate by variant_id
    const map = {};
    items.forEach(it => {
      const key = it.variant_id || it.variant_name;
      if (!map[key]) {
        const { product } = lineInfo(it);
        map[key] = {
          variant_id: it.variant_id,
          variant_name: it.variant_name,
          shade_name: it.shade_name || '',
          pack_size: it.pack_size || 0,
          pack_unit: it.pack_unit || '',
          product_name: product?.name || it.variant_name,
          qty: 0,
          revenue: 0,
          cost: 0
        };
      }
      map[key].qty     += Number(it.qty) || 0;
      map[key].revenue += Number(it.total) || 0;
      map[key].cost    += lineCost(it);
    });

    const arr = Object.values(map)
      .map(x => ({ ...x, profit: x.revenue - x.cost, margin: x.revenue > 0 ? ((x.revenue - x.cost) / x.revenue) * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit);

    const totals = arr.reduce((acc, x) => {
      acc.revenue += x.revenue;
      acc.cost    += x.cost;
      acc.profit  += x.profit;
      acc.qty     += x.qty;
      return acc;
    }, { revenue: 0, cost: 0, profit: 0, qty: 0 });

    const box = $('#mg-content');

    if (arr.length === 0) {
      box.innerHTML = '<div class="card" style="padding:60px 20px;border-radius:16px;"><div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">No sales in this range</div></div></div>';
      return;
    }

    const avgMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

    box.innerHTML = `
      <div class="kpi-row" style="margin-bottom:20px;">
        <div class="kpi-card" style="border-left:4px solid var(--primary);border-radius:16px;">
          <div class="kpi-card-top"><div class="kpi-label">Revenue</div></div>
          <div class="kpi-value">${rs(totals.revenue)}</div>
          <div class="kpi-trend text-muted">${fmtNum(totals.qty)} units · ${arr.length} SKU${arr.length === 1 ? '' : 's'}</div>
        </div>
        <div class="kpi-card" style="border-left:4px solid var(--warning);border-radius:16px;">
          <div class="kpi-card-top"><div class="kpi-label">Cost of Goods</div></div>
          <div class="kpi-value">${rs(totals.cost)}</div>
          <div class="kpi-trend text-muted">from batch costs</div>
        </div>
        <div class="kpi-card" style="border-left:4px solid ${totals.profit >= 0 ? 'var(--success)' : 'var(--danger)'};border-radius:16px;">
          <div class="kpi-card-top"><div class="kpi-label">${totals.profit >= 0 ? 'Profit' : 'Loss'}</div></div>
          <div class="kpi-value" style="color:${totals.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">${rs(totals.profit)}</div>
          <div class="kpi-trend text-muted">net</div>
        </div>
        <div class="kpi-card" style="border-left:4px solid var(--primary);border-radius:16px;">
          <div class="kpi-card-top"><div class="kpi-label">Avg Margin</div></div>
          <div class="kpi-value">${avgMargin.toFixed(1)}%</div>
          <div class="kpi-trend text-muted">across products</div>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product · Shade</th>
              <th>Pack</th>
              <th style="text-align:right">Qty Sold</th>
              <th style="text-align:right">Revenue</th>
              <th style="text-align:right">Cost</th>
              <th style="text-align:right">Profit</th>
              <th style="text-align:right">Margin</th>
            </tr>
          </thead>
          <tbody>
            ${arr.map(x => {
              const pc = x.profit >= 0 ? 'var(--success)' : 'var(--danger)';
              return `<tr>
                <td>
                  <strong>${esc(x.product_name)}</strong>
                  <div class="text-xs text-muted" style="margin-top:2px;">${esc(x.shade_name || '—')}</div>
                </td>
                <td><span class="chip chip-neutral">${fmtNum(x.pack_size)}${esc(x.pack_unit || '')}</span></td>
                <td style="text-align:right;">${fmtNum(x.qty)}</td>
                <td style="text-align:right;">${rs(x.revenue)}</td>
                <td style="text-align:right;" class="text-muted">${rs(x.cost)}</td>
                <td style="text-align:right;font-weight:600;color:${pc};">${rs(x.profit)}</td>
                <td style="text-align:right;color:${pc};font-weight:600;">${x.margin.toFixed(1)}%</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  const state = wireReportFilterBar('mg', run);
  run(state);
}

/* ─────────────────────────────────────────────
   12.9 PROFIT & LOSS
   ───────────────────────────────────────────── */
function renderPnL(content) {
  destroyCharts();

  content.innerHTML = `
    <div class="page-head" style="margin-bottom:20px;">
      <div class="page-head-title">
        <h1>Profit & Loss</h1>
        <p>Complete income statement</p>
      </div>
    </div>

    ${reportFilterBarHTML('pnl', 'month')}
    <div id="pnl-content"></div>
  `;

  function run(state) {
    const range = reportDateRange(state.preset, state.customFrom, state.customTo);

    // Sales & COGS
    const invs = invoicesInRange(range.from, range.to);
    const items = DB.invoice_items.filter(it => invs.some(inv => inv.id === it.invoice_id));

    const grossRevenue = invs.reduce((s, i) => s + Number(i.total || 0), 0);
    const cogs = items.reduce((s, it) => s + lineCost(it), 0);

    // Returns (from customer — reduce revenue)
    const custReturns = DB.returns
      .filter(r => r.direction === 'from_customer' && txDate(r, 'return_date') >= range.from && txDate(r, 'return_date') <= range.to)
      .reduce((s, r) => s + Number(r.amount || 0), 0);

    // Supplier returns (reduce COGS)
    const supReturns = DB.returns
      .filter(r => r.direction === 'to_supplier' && txDate(r, 'return_date') >= range.from && txDate(r, 'return_date') <= range.to)
      .reduce((s, r) => s + Number(r.amount || 0), 0);

    const netRevenue = grossRevenue - custReturns;
    const netCogs = cogs - supReturns;
    const grossProfit = netRevenue - netCogs;

    // Expenses
    const expList = DB.expenses.filter(e => {
      const d = txDate(e, 'expense_date');
      return d >= range.from && d <= range.to;
    });
    const totalExpenses = expList.reduce((s, e) => s + Number(e.amount || 0), 0);

    // Expense breakdown
    const expMap = {};
    expList.forEach(e => {
      const cat = e.category || 'Other';
      expMap[cat] = (expMap[cat] || 0) + Number(e.amount || 0);
    });
    const expBreakdown = Object.entries(expMap).sort((a, b) => b[1] - a[1]);

    const netProfit = grossProfit - totalExpenses;
    const netMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

    // Monthly trend (last 6 months for chart)
    const monthlyMap = {};
    invoicesInRange('0000-01-01', '9999-12-31').forEach(inv => {
      const d = txDate(inv, 'invoice_date');
      const key = d.slice(0, 7);
      if (!monthlyMap[key]) monthlyMap[key] = { month: key, revenue: 0, cogs: 0 };
      monthlyMap[key].revenue += Number(inv.total || 0);
    });
    DB.invoice_items.forEach(it => {
      const inv = DB.invoices.find(i => i.id === it.invoice_id);
      if (!inv || isReturnInvoice(inv)) return;
      const d = txDate(inv, 'invoice_date');
      const key = d.slice(0, 7);
      if (!monthlyMap[key]) monthlyMap[key] = { month: key, revenue: 0, cogs: 0 };
      monthlyMap[key].cogs += lineCost(it);
    });

    const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

    const box = $('#pnl-content');
    const isProfit = netProfit >= 0;
    const pnlColor = isProfit ? 'var(--success)' : 'var(--danger)';

    box.innerHTML = `
      <div class="card" style="margin-bottom:20px;border-radius:16px;padding:28px;">
        <div style="text-align:center;padding:20px 0;">
          <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;letter-spacing:1px;">
            ${isProfit ? 'Net Profit' : 'Net Loss'} · ${range.label}
          </div>
          <div style="font-size:42px;font-weight:800;letter-spacing:-1.5px;color:${pnlColor};margin:12px 0;line-height:1.1;">
            ${rs(Math.abs(netProfit))}
          </div>
          <div class="text-sm text-muted">Net margin: <b style="color:${pnlColor};">${netMargin.toFixed(1)}%</b></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;border-radius:16px;">
        <div class="card-title">Income Statement</div>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:14px;">

          <div style="display:flex;justify-content:space-between;padding:10px 0;">
            <span style="font-weight:600;">Gross Sales</span>
            <span style="font-weight:600;">${rs(grossRevenue)}</span>
          </div>

          ${custReturns > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:6px 0;padding-left:20px;color:var(--text-muted);">
              <span>Less: Customer Returns</span>
              <span style="color:var(--danger);">− ${rs(custReturns)}</span>
            </div>
          ` : ''}

          <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid var(--border);">
            <span style="font-weight:600;">Net Sales</span>
            <span style="font-weight:700;">${rs(netRevenue)}</span>
          </div>

          <div style="height:8px;"></div>

          <div style="display:flex;justify-content:space-between;padding:10px 0;">
            <span style="color:var(--text-muted);">Cost of Goods Sold</span>
            <span>${rs(cogs)}</span>
          </div>

          ${supReturns > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:6px 0;padding-left:20px;color:var(--text-muted);">
              <span>Less: Supplier Returns</span>
              <span style="color:var(--success);">− ${rs(supReturns)}</span>
            </div>
          ` : ''}

          <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid var(--border);">
            <span style="font-weight:600;">Net COGS</span>
            <span style="font-weight:700;">${rs(netCogs)}</span>
          </div>

          <div style="display:flex;justify-content:space-between;padding:12px 0;background:var(--bg-app);margin:8px -12px;padding-left:12px;padding-right:12px;border-radius:8px;">
            <span style="font-weight:700;">Gross Profit</span>
            <span style="font-weight:700;color:${grossProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">${rs(grossProfit)}</span>
          </div>

          <div style="height:8px;"></div>

          <div style="display:flex;justify-content:space-between;padding:10px 0;">
            <span style="color:var(--text-muted);">Operating Expenses</span>
            <span>${rs(totalExpenses)}</span>
          </div>

          <div style="display:flex;justify-content:space-between;padding:12px 0;border-top:2px solid var(--border);margin-top:8px;font-size:16px;">
            <span style="font-weight:800;">Net ${isProfit ? 'Profit' : 'Loss'}</span>
            <span style="font-weight:800;color:${pnlColor};">${rs(netProfit)}</span>
          </div>

        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div class="card" style="border-radius:16px;">
          <div class="card-title">Revenue vs COGS <small>Last 6 months</small></div>
          <div style="position:relative;height:260px;"><canvas id="pnl-chart"></canvas></div>
        </div>

        <div class="card" style="border-radius:16px;">
          <div class="card-title">Expenses by Category <small>${expBreakdown.length}</small></div>
          ${expBreakdown.length === 0
            ? '<div class="empty-state" style="padding:40px 10px;"><div class="empty-icon">💸</div><div class="empty-title">No expenses</div></div>'
            : `<div style="display:flex;flex-direction:column;gap:8px;">
                ${expBreakdown.map(([cat, amt]) => {
                  const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                  return `<div>
                    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                      <span style="font-weight:600;">${esc(cat)}</span>
                      <span style="font-weight:600;">${rs(amt)}</span>
                    </div>
                    <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
                      <div style="height:100%;width:${pct}%;background:linear-gradient(90deg, #EF4444, #F87171);border-radius:3px;"></div>
                    </div>
                  </div>`;
                }).join('')}
              </div>`
          }
        </div>
      </div>
    `;

    const ctx = document.getElementById('pnl-chart');
    if (ctx && monthly.length > 0) {
      pushChart(new Chart(ctx, {
        type: 'bar',
        data: {
          labels: monthly.map(m => m.month),
          datasets: [
            { label: 'Revenue', data: monthly.map(m => m.revenue), backgroundColor: '#5B5BD6', borderRadius: 6 },
            { label: 'COGS',    data: monthly.map(m => m.cogs),    backgroundColor: '#F59E0B', borderRadius: 6 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: { callbacks: { label: c => c.dataset.label + ': ' + rs(c.parsed.y) } }
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: v => '₹' + Number(v).toLocaleString('en-IN') }, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { grid: { display: false } }
          }
        }
      }));
    }
  }

  const state = wireReportFilterBar('pnl', run);
  run(state);
}
/* ══════════════════════════════════════════════════════════════════
   STEP 13 — BACKUP & RESTORE
   Full shop export + smart merge import (upsert by id)
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   13.1 BACKUP PAGE
   ───────────────────────────────────────────── */
function renderBackup(content) {
  content.innerHTML = `
    <div class="page-head" style="margin-bottom:24px;">
      <div class="page-head-title">
        <h1>Backup & Restore</h1>
        <p>Export or restore your shop data</p>
      </div>
    </div>

    <!-- EXPORT -->
    <div class="card" style="margin-bottom:20px;border-radius:16px;">
      <div class="card-title">Download Backup</div>
      <p class="text-sm text-muted" style="margin-bottom:16px;line-height:1.6;">
        Get a full JSON snapshot of your shop — brands, products, variants, batches, customers, invoices, purchases, returns, expenses, colorants, mixes and settings.
        Use this file to migrate to another device or keep a safe copy.
      </p>

      <div style="background:var(--bg-app);border-radius:var(--radius-md);padding:16px;margin-bottom:16px;font-size:13px;line-height:2;">
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Brands</span><b>${DB.brands.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Products</span><b>${DB.products.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Variants</span><b>${DB.variants.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Batches</span><b>${DB.product_batches.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Colorants</span><b>${DB.colorants.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Customers</span><b>${DB.customers.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Suppliers</span><b>${DB.suppliers.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Invoices</span><b>${DB.invoices.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Purchases</span><b>${DB.purchases.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Returns</span><b>${DB.returns.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Expenses</span><b>${DB.expenses.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Mixes</span><b>${DB.mixes.length}</b></div>
      </div>

      <button id="btn-export" class="btn btn-primary btn-block">
        📥 Download Backup (JSON)
      </button>
    </div>

    <!-- RESTORE -->
    <div class="card" style="border-radius:16px;">
      <div class="card-title">Restore from Backup</div>

      <div style="padding:16px;background:var(--warning-bg);border:1px solid var(--warning);border-radius:var(--radius-md);margin-bottom:16px;font-size:12px;color:#78350f;line-height:1.7;">
        <b>⚠️ Smart Merge:</b><br>
        Existing rows with the same ID will be <b>updated</b>. New rows will be <b>added</b>. Nothing is deleted.
        Safe to run multiple times. All tables are restored in dependency order so foreign keys stay intact.
      </div>

      <input type="file" id="restore-file" accept="application/json,.json" style="display:none;">
      <button id="btn-restore" class="btn btn-ghost btn-block">
        📤 Choose Backup File
      </button>

      <div id="restore-status" style="margin-top:16px;display:none;"></div>
    </div>
  `;

  /* ── EXPORT ── */
  document.getElementById('btn-export').onclick = () => {
    try {
      const payload = {
        version: 1,
        app: 'PaintBook',
        exported_at: new Date().toISOString(),
        settings: cleanSettingsForExport(SETTINGS),
        brands:          DB.brands,
        products:        DB.products,
        variants:        DB.variants,
        product_batches: DB.product_batches,
        customers:       DB.customers,
        invoices:        DB.invoices,
        invoice_items:   DB.invoice_items,
        payments:        DB.payments,
        colorants:       DB.colorants,
        mixes:           DB.mixes,
        suppliers:       DB.suppliers,
        purchases:       DB.purchases,
        purchase_items:  DB.purchase_items,
        supplier_payments: DB.supplier_payments,
        returns:         DB.returns,
        expenses:        DB.expenses
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'paintbook-backup-' + todayStr() + '.json';
      a.click();
      URL.revokeObjectURL(url);
      toast('Backup downloaded', 'success');
    } catch (e) {
      console.error(e);
      toast('Failed to export: ' + e.message, 'error');
    }
  };

  /* ── RESTORE ── */
  document.getElementById('btn-restore').onclick = () => {
    document.getElementById('restore-file').click();
  };

  document.getElementById('restore-file').onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast('File too large (max 50 MB)', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = JSON.parse(ev.target.result);

        // Validate
        if (!raw || typeof raw !== 'object' || raw.app !== 'PaintBook') {
          toast('This is not a PaintBook backup file', 'error');
          return;
        }

        if (!confirm('Merge this backup into your current data?\n\nExisting rows with the same ID will be UPDATED.\nNew rows will be ADDED.\nNothing will be deleted.\n\nContinue?')) {
          return;
        }

        await runRestore(raw);

      } catch (err) {
        console.error(err);
        alert('Import failed: ' + (err.message || err));
      }
    };
    reader.readAsText(file);
  };
}

/* ─────────────────────────────────────────────
   13.2 HELPERS
   ───────────────────────────────────────────── */
function cleanSettingsForExport(s) {
  // Drop the transient "loaded" flag before export
  const out = { ...s };
  delete out.loaded;
  return out;
}

/* Columns allowed in each table for import.
   Any unknown columns in the backup are dropped — safety against schema drift. */
const RESTORE_SCHEMA = {
  brands: ['id', 'name', 'notes', 'created_at', 'updated_at'],
  products: ['id', 'brand_id', 'name', 'category', 'unit_base', 'batch_managed', 'gst_rate_default', 'low_stock_alert', 'notes', 'created_at', 'updated_at'],
  variants: ['id', 'product_id', 'shade_name', 'shade_code', 'pack_size', 'pack_unit', 'cost', 'mrp', 'selling_price', 'stock', 'low_stock_alert', 'notes', 'created_at', 'updated_at'],
  product_batches: ['id', 'variant_id', 'batch_no', 'mfg_date', 'qty', 'cost', 'mrp', 'selling_price', 'supplier_id', 'created_at', 'updated_at'],
  customers: ['id', 'name', 'phone', 'opening_balance', 'notes', 'joined_date', 'tx_time', 'created_at', 'updated_at'],
  suppliers: ['id', 'name', 'type', 'shop_name', 'phone', 'email', 'address', 'gst', 'notes', 'opening_balance', 'created_at', 'updated_at'],
  invoices: ['id', 'invoice_no', 'customer_id', 'customer_name', 'customer_phone', 'subtotal', 'cash_discount', 'gst_amount', 'total', 'paid', 'due', 'notes', 'invoice_date', 'tx_time', 'gst_enabled', 'created_at'],
  invoice_items: ['id', 'invoice_id', 'variant_id', 'variant_name', 'shade_name', 'pack_size', 'pack_unit', 'batch_id', 'batch_no', 'qty', 'rate', 'gst_rate', 'gst_amount', 'total', 'line_type', 'mix_id', 'created_at'],
  payments: ['id', 'customer_id', 'customer_name', 'amount', 'mode', 'notes', 'payment_date', 'tx_time', 'created_at'],
  colorants: ['id', 'brand_id', 'name', 'code', 'unit', 'cost_per_unit', 'stock', 'low_stock_alert', 'notes', 'created_at', 'updated_at'],
  mixes: ['id', 'mix_no', 'base_variant_id', 'base_qty', 'shade_result', 'colorants_json', 'invoice_id', 'customer_name', 'total_cost', 'notes', 'mix_date', 'tx_time', 'created_at'],
  purchases: ['id', 'supplier_id', 'supplier_name', 'bill_no', 'bill_date', 'tx_time', 'subtotal', 'discount', 'gst_amount', 'total', 'paid', 'notes', 'created_at'],
  purchase_items: ['id', 'purchase_id', 'variant_id', 'variant_name', 'shade_name', 'pack_size', 'pack_unit', 'batch_no', 'mfg_date', 'qty', 'cost', 'mrp', 'selling_price', 'total', 'created_at'],
  supplier_payments: ['id', 'supplier_id', 'supplier_name', 'amount', 'mode', 'notes', 'payment_date', 'tx_time', 'created_at'],
  returns: ['id', 'direction', 'invoice_id', 'purchase_id', 'customer_id', 'customer_name', 'supplier_id', 'supplier_name', 'variant_id', 'variant_name', 'shade_name', 'pack_size', 'pack_unit', 'batch_id', 'batch_no', 'qty', 'amount', 'reason', 'return_date', 'tx_time', 'created_at'],
  expenses: ['id', 'category', 'amount', 'notes', 'expense_date', 'tx_time', 'created_at']
};

/* Strict order matters — parents before children */
const RESTORE_ORDER = [
  'brands',
  'suppliers',
  'products',
  'variants',
  'product_batches',
  'customers',
  'colorants',
  'invoices',
  'invoice_items',
  'mixes',
  'payments',
  'purchases',
  'purchase_items',
  'supplier_payments',
  'returns',
  'expenses'
];

function cleanRowForRestore(row, allowedCols) {
  const out = {};
  for (const k of Object.keys(row)) {
    if (allowedCols.includes(k)) out[k] = row[k];
  }
  return out;
}

/* ─────────────────────────────────────────────
   13.3 RUN RESTORE
   ───────────────────────────────────────────── */
async function runRestore(raw) {
  const statusBox = document.getElementById('restore-status');
  const restoreBtn = document.getElementById('btn-restore');

  if (restoreBtn) {
    restoreBtn.disabled = true;
    restoreBtn.textContent = 'Restoring...';
  }

  function showStatus(html) {
    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.innerHTML = html;
    }
  }

  // Header progress
  showStatus(`
    <div style="background:var(--primary-light);border:1px solid var(--primary);border-radius:var(--radius-md);padding:16px;font-size:13px;">
      <div style="font-weight:700;color:var(--primary);margin-bottom:8px;">⏳ Restoring backup...</div>
      <div id="restore-progress-text" class="text-muted">Preparing...</div>
    </div>
  `);

  const report = { added: 0, failed: 0, tables: {}, errors: [] };

  // Loop through tables in dependency order
  for (const tableName of RESTORE_ORDER) {
    const allowedCols = RESTORE_SCHEMA[tableName];
    const rows = Array.isArray(raw[tableName]) ? raw[tableName] : [];

    const progressEl = document.getElementById('restore-progress-text');
    if (progressEl) progressEl.textContent = `Importing ${tableName} (${rows.length} row${rows.length === 1 ? '' : 's'})...`;

    if (!rows.length) {
      report.tables[tableName] = '0 rows';
      continue;
    }

    let tAdded = 0, tFailed = 0;

    // Insert in chunks of 100 to avoid request size limits
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map(r => cleanRowForRestore(r, allowedCols));

      // Validate every row has an id
      const invalid = chunk.filter(r => !r.id);
      if (invalid.length) {
        tFailed += invalid.length;
        report.errors.push(`${tableName}: ${invalid.length} rows missing id`);
        continue;
      }

      const { error } = await sb.from(tableName).upsert(chunk, { onConflict: 'id' });

      if (error) {
        console.error(`[restore] ${tableName}:`, error);
        tFailed += chunk.length;
        if (report.errors.length < 20) {
          report.errors.push(`${tableName}: ${error.message}`);
        }
      } else {
        tAdded += chunk.length;
      }
    }

    report.added  += tAdded;
    report.failed += tFailed;
    report.tables[tableName] = `${tAdded} ok${tFailed ? `, ${tFailed} failed` : ''}`;
  }

  // Settings (special — single row id=1)
  const progressEl2 = document.getElementById('restore-progress-text');
  if (progressEl2) progressEl2.textContent = 'Applying settings...';

  if (raw.settings && typeof raw.settings === 'object') {
    const s = raw.settings;
    const settingsPayload = {
      id: 1,
      shop_name:               s.shop_name               || SETTINGS.shop_name               || 'PaintBook',
      owner_name:              s.owner_name              || SETTINGS.owner_name              || 'Owner',
      address:                 s.address                 || '',
      city:                    s.city                    || '',
      phone:                   s.phone                   || '',
      email:                   s.email                   || '',
      upi:                     s.upi                     || '',
      logo:                    s.logo                    || '',
      gst_enabled:             !!s.gst_enabled,
      gst_number:              s.gst_number              || '',
      gst_rate:                Number(s.gst_rate)        || 0,
      low_stock_alert_default: Number(s.low_stock_alert_default) || 5,
      print_footer:            s.print_footer            || 'Thank you! Visit again',
      updated_at:              new Date().toISOString()
    };

    const { error } = await sb.from('settings').upsert(settingsPayload, { onConflict: 'id' });
    if (!error) {
      report.tables['settings'] = 'applied';
    } else {
      report.errors.push('settings: ' + error.message);
      report.tables['settings'] = 'failed';
    }
  }

  // Sync fresh data from DB
  if (progressEl2) progressEl2.textContent = 'Refreshing data...';
  await syncDB();

  // Build summary
  const totalLabel = `✅ Merged ${report.added} row${report.added === 1 ? '' : 's'} successfully${report.failed ? ` · ⚠️ ${report.failed} failed` : ''}.`;

  const tableLines = RESTORE_ORDER
    .filter(t => report.tables[t])
    .map(t => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;"><span class="text-muted">${t}</span><b>${esc(report.tables[t])}</b></div>`)
    .join('');

  const errorBlock = report.errors.length
    ? `<div style="margin-top:12px;padding:10px;background:var(--danger-bg);border:1px solid var(--danger);border-radius:8px;font-size:11px;color:#991b1b;line-height:1.6;">
        <b>Errors:</b><br>${report.errors.map(esc).join('<br>')}
      </div>`
    : '';

  showStatus(`
    <div style="background:var(--success-bg);border:1px solid var(--success);border-radius:var(--radius-md);padding:16px;font-size:13px;">
      <div style="font-weight:700;color:var(--success);margin-bottom:8px;">${totalLabel}</div>
      ${report.tables['settings'] ? `<div style="font-size:12px;margin-bottom:8px;">Settings: <b>${esc(report.tables['settings'])}</b></div>` : ''}
      <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--success);">
        ${tableLines}
      </div>
      ${errorBlock}
    </div>
  `);

  if (restoreBtn) {
    restoreBtn.disabled = false;
    restoreBtn.textContent = '📤 Choose Backup File';
  }

  toast('Backup merged · refreshing...', 'success');

  // Small delay so user sees the summary
  setTimeout(() => {
    route();
  }, 1200);
}
/* ══════════════════════════════════════════════════════════════════
   STEP 14 — SUBSCRIPTION, DOMAIN MODAL & AI SCANNER (FINAL)
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   14.1 GLOBAL STATE
   ───────────────────────────────────────────── */
if (!window.SUB) {
  window.SUB = { loaded: false, active: true, expires_at: null, last_paid_at: null };
}
const SUB_PLAN_AMOUNT  = (window.APP_CONFIG && window.APP_CONFIG.SUB_PLAN_AMOUNT)  || 599;
const SUB_OWNER_UPI    = (window.APP_CONFIG && window.APP_CONFIG.SUB_OWNER_UPI)    || 'shopsteward.in@ybl';
const SUB_OWNER_NAME   = (window.APP_CONFIG && window.APP_CONFIG.SUB_OWNER_NAME)   || 'Samiran Das';
const SUB_SUPPORT_WHATSAPP = (window.APP_CONFIG && window.APP_CONFIG.SUB_SUPPORT_WHATSAPP) || '918637560557';

/* ─────────────────────────────────────────────
   14.2 HELPERS
   ───────────────────────────────────────────── */
window.subDaysLeft = function () {
  if (!window.SUB || !window.SUB.expires_at) return 0;
  return Math.max(0, Math.ceil((new Date(window.SUB.expires_at).getTime() - Date.now()) / 86400000));
};

window.subPercentLeft = function () {
  if (!window.SUB || !window.SUB.expires_at) return 0;
  const total = 365 * 86400000;
  const left  = Math.max(0, new Date(window.SUB.expires_at).getTime() - Date.now());
  return Math.max(0, Math.min(100, Math.round((left / total) * 100)));
};

window.subDaysOverdue = function () {
  if (!window.SUB || !window.SUB.expires_at) return 0;
  return Math.max(0, Math.ceil((Date.now() - new Date(window.SUB.expires_at).getTime()) / 86400000));
};

window.isSubActive = function () {
  if (!window.SUB || !window.SUB.loaded) return true;
  if (!window.SUB.expires_at) return false;
  return window.SUB.active === true && new Date(window.SUB.expires_at).getTime() > Date.now();
};

window.isSubExpiringSoon = function () {
  return isSubActive() && subDaysLeft() <= 7;
};

window.isSubExpired = function () {
  return !isSubActive();
};

window.subStatusColor = function () {
  if (isSubExpired()) return 'var(--danger)';
  if (subDaysLeft() <= 7) return 'var(--warning)';
  return 'var(--success)';
};

window.subStatusLabel = function () {
  if (isSubExpired()) return 'Expired';
  if (subDaysLeft() <= 7) return 'Expiring Soon';
  return 'Active';
};

/* ─────────────────────────────────────────────
   14.3 UPI QR BUILDER
   ───────────────────────────────────────────── */
function buildUpiString(amount, note) {
  const amt = Number(amount).toFixed(2);
  const tn  = encodeURIComponent((note || 'Subscription').substring(0, 50));
  const pn  = encodeURIComponent(SUB_OWNER_NAME || 'PaintBook');
  return `upi://pay?pa=${SUB_OWNER_UPI}&pn=${pn}&am=${amt}&cu=INR&tn=${tn}`;
}

async function generateQRBase64(text) {
  if (typeof QRCode === 'undefined') {
    console.error('QRCode library not loaded');
    return '';
  }
  try {
    return await QRCode.toDataURL(text, { width: 400, margin: 2, color: { dark: '#1E1E3A', light: '#FFFFFF' } });
  } catch (err) {
    console.error('QR generation failed', err);
    return '';
  }
}

/* ─────────────────────────────────────────────
   14.4 SIDEBAR PILL & TOP BANNER
   ───────────────────────────────────────────── */
window.renderSubSidebarPill = function () {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  let pill = document.getElementById('sub-sidebar-pill');
  if (!pill) {
    pill = document.createElement('a');
    pill.id = 'sub-sidebar-pill';
    pill.href = '#/myshop';
    pill.className = 'pro-plan-card';
    pill.style.cssText = 'display:block;margin:16px 16px 6px;padding:12px 14px;border-radius:12px;background:#F8F8FF;text-decoration:none;cursor:pointer;transition:background 0.15s;';
    const footer = sidebar.querySelector('.sidebar-footer');
    if (footer) sidebar.insertBefore(pill, footer);
    else sidebar.appendChild(pill);
  }

  if (!window.SUB || !SUB.loaded) {
    pill.style.display = 'none';
    return;
  }
  pill.style.display = 'block';

  const color = subStatusColor();
  const pct   = subPercentLeft();
  const days  = subDaysLeft();
  const label = days > 0 ? days + 'd' : 'Expired';

  pill.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:14px;">⭐</span>
        <span style="font-size:12px;font-weight:700;color:#111827;">Pro Plan</span>
      </div>
      <span style="font-size:10px;font-weight:700;color:${color};background:${color}22;padding:3px 8px;border-radius:6px;">${label}</span>
    </div>
    <div style="height:6px;background:#E5E7EB;border-radius:999px;overflow:hidden;">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:999px;"></div>
    </div>
    <div style="font-size:10px;color:#6B7280;margin-top:6px;font-weight:500;">${subStatusLabel()}</div>
  `;
};

window.renderSubTopBanner = function () {
  const mainWrap = document.querySelector('.main-wrap');
  if (!mainWrap) return;

  const content = mainWrap.querySelector('#content');
  if (!content) return;

  const existing = document.getElementById('sub-top-banner');
  if (existing) existing.remove();

  if (!window.SUB || !SUB.loaded) return;
  if (isSubActive() && !isSubExpiringSoon()) return;

  const expired  = isSubExpired();
  const pct      = subPercentLeft();
  const days     = subDaysLeft();
  const overdue  = subDaysOverdue();

  const barColor = expired ? 'var(--danger)' : 'var(--warning)';
  const textColor= expired ? '#991b1b' : '#92400e';
  const bg       = expired ? 'var(--danger-bg)' : 'var(--warning-bg)';
  const border   = expired ? 'var(--danger)' : 'var(--warning)';

  const banner = document.createElement('div');
  banner.id = 'sub-top-banner';
  banner.style.cssText = `margin:0;padding:14px 24px;background:${bg};border-bottom:1px solid ${border};`;

  banner.innerHTML = `
    <div style="max-width:1440px;margin:0 auto;display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="font-size:13px;font-weight:600;color:${textColor};">
          ⚠ ${expired ? 'Subscription expired' : 'Subscription ending soon'}
        </div>
        <button id="sub-banner-renew" style="background:var(--primary);color:#fff;border:none;padding:7px 16px;border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer;">
          Renew Now ₹${SUB_PLAN_AMOUNT}
        </button>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="flex:1;height:6px;background:rgba(255,255,255,0.6);border-radius:999px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${barColor};border-radius:999px;"></div>
        </div>
        <div style="font-size:11px;font-weight:600;color:${textColor};white-space:nowrap;">
          ${expired ? overdue + ' days overdue' : days + ' days left'}
        </div>
      </div>
    </div>
  `;

  mainWrap.insertBefore(banner, content);

  const btn = banner.querySelector('#sub-banner-renew');
  if (btn) btn.onclick = () => openSubscriptionModal();
};

window.updateSubscriptionUI = function () {
  try { renderSubSidebarPill(); } catch (e) { console.error(e); }
  try { renderSubTopBanner(); } catch (e) { console.error(e); }
};

/* Hook into layout and shop render */
const _origRenderLayout = window.renderLayout;
if (typeof _origRenderLayout === 'function') {
  window.renderLayout = function () {
    _origRenderLayout.apply(this, arguments);
    try { renderSubSidebarPill(); renderSubTopBanner(); } catch (e) {}
  };
}

const _origRenderMyShop = window.renderMyShop;
if (typeof _origRenderMyShop === 'function') {
  window.renderMyShop = function (content) {
    _origRenderMyShop.apply(this, arguments);
    try {
      const slot = document.createElement('div');
      slot.id = 'sub-card-slot';
      content.appendChild(slot);

      const old = content.querySelector('#sub-card-root');
      if (old) old.remove();

      const wrap = document.createElement('div');
      wrap.innerHTML = buildSubCardHTML();
      if (wrap.firstElementChild) slot.parentNode.insertBefore(wrap.firstElementChild, slot);

      const mainBtn = content.querySelector('#sub-main-btn');
      if (mainBtn) mainBtn.onclick = () => openSubscriptionModal();

      const mgBtn = content.querySelector('#sub-manage-btn');
      if (mgBtn) mgBtn.onclick = () => openSubscriptionManageModal();
    } catch (e) {
      console.warn('[SUB] card inject failed:', e);
    }
  };
}

/* ─────────────────────────────────────────────
   14.5 SUBSCRIPTION CARD (for My Shop)
   ───────────────────────────────────────────── */
function buildSubCardHTML() {
  if (!window.SUB || !SUB.loaded) return '';

  const pct          = subPercentLeft();
  const days         = subDaysLeft();
  const color        = subStatusColor();
  const status       = subStatusLabel();
  const expired      = isSubExpired();
  const overdue      = subDaysOverdue();
  const expiringSoon = isSubExpiringSoon();
  const expiresStr   = SUB.expires_at ? fmtDate(SUB.expires_at) : '—';
  const lastPaidStr  = SUB.last_paid_at ? fmtDate(SUB.last_paid_at) : 'First activation';

  const circumference = 2 * Math.PI * 32;
  const dash          = (pct / 100) * circumference;

  let btnText, btnId;
  if (expired) { btnText = 'Subscribe Now ₹' + SUB_PLAN_AMOUNT; btnId = 'sub-main-btn'; }
  else if (expiringSoon) { btnText = 'Renew Now ₹' + SUB_PLAN_AMOUNT; btnId = 'sub-main-btn'; }
  else { btnText = 'Manage Subscription'; btnId = 'sub-manage-btn'; }

  return `
    <div class="card" id="sub-card-root" style="margin-top:20px;padding:24px;border-radius:16px;">
      <div style="display:flex;gap:20px;align-items:center;margin-bottom:20px;">
        <div style="position:relative;width:80px;height:80px;flex-shrink:0;">
          <svg width="80" height="80" viewBox="0 0 80 80" style="transform:rotate(-90deg);">
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--border)" stroke-width="7"/>
            <circle cx="40" cy="40" r="32" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference - dash}"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;">
            <div style="font-size:16px;font-weight:800;color:${color};line-height:1;">${pct}%</div>
            <div style="font-size:8px;color:var(--text-muted);margin-top:1px;">LEFT</div>
          </div>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:16px;font-weight:700;color:var(--text-main);margin-bottom:8px;">Pro Plan</div>
          <span style="display:inline-block;background:${color}22;color:${color};font-size:10px;font-weight:700;padding:4px 12px;border-radius:999px;border:1px solid ${color}44;">
            ● ${status.toUpperCase()}
          </span>
        </div>
      </div>

      <div style="font-size:12px;color:var(--text-muted);line-height:2;margin-bottom:20px;padding:14px;background:var(--bg-app);border-radius:var(--radius-md);border:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;"><span>Plan</span><b style="color:var(--text-main);">₹${SUB_PLAN_AMOUNT} / year</b></div>
        <div style="display:flex;justify-content:space-between;"><span>Expires</span><b style="color:var(--text-main);">${expiresStr}</b></div>
        <div style="display:flex;justify-content:space-between;"><span>Remaining</span>${expired ? `<b style="color:var(--danger);">Overdue ${overdue}d</b>` : `<b style="color:${color};">${days} days</b>`}</div>
        <div style="display:flex;justify-content:space-between;"><span>Last paid</span><b style="color:var(--text-main);font-size:11px;">${lastPaidStr}</b></div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="${btnId}" class="btn btn-primary" style="flex:1;justify-content:center;font-weight:600;">${btnText}</button>
      </div>
    </div>
  `;
}

/* ─────────────────────────────────────────────
   14.6 MODALS
   ───────────────────────────────────────────── */
window.openSubscriptionModal = async function () {
  const upiStr = buildUpiString(SUB_PLAN_AMOUNT, 'PaintBook Subscription');
  const qrUrl  = await generateQRBase64(upiStr);

  const waText = encodeURIComponent(
    'Hi, I have paid ₹' + SUB_PLAN_AMOUNT + ' for the PaintBook subscription.\n\nShop: ' +
    (SETTINGS.shop_name || '') + '\nUPI: ' + SUB_OWNER_UPI + '\n\nPlease activate.'
  );
  const waLink = `https://wa.me/${SUB_SUPPORT_WHATSAPP}?text=${waText}`;

  openModal(`
    <div class="modal-header">
      <div>
        <div class="modal-title">Subscribe to Pro</div>
        <div class="text-xs text-muted" style="margin-top:2px;">Pay ₹${SUB_PLAN_AMOUNT} for 1 year of unlimited access.</div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;">
        <div style="flex:0 0 240px;text-align:center;">
          <div style="background:#fff;padding:16px;border-radius:var(--radius-lg);border:1px solid var(--border);display:inline-block;">
            ${qrUrl
              ? `<img src="${qrUrl}" style="width:200px;height:200px;display:block;border-radius:6px;" alt="UPI QR">`
              : '<div style="width:200px;height:200px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:12px;">QR unavailable</div>'
            }
          </div>
          <div class="text-sm fw-600" style="color:var(--primary);margin-top:12px;">Scan to pay ₹${SUB_PLAN_AMOUNT}</div>
        </div>

        <div style="flex:1;min-width:240px;">
          <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:8px;">Or pay to this UPI ID</div>

          <div style="background:var(--bg-app);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;">
            <code style="font-size:14px;color:var(--text-main);font-weight:600;font-family:monospace;word-break:break-all;">${esc(SUB_OWNER_UPI)}</code>
            <button id="sub-copy-upi" class="btn btn-ghost btn-sm">📋 Copy</button>
          </div>

          <div class="text-sm text-muted" style="margin-bottom:16px;">Receiver: <b style="color:var(--text-main);">${esc(SUB_OWNER_NAME)}</b></div>

          <div class="text-sm" style="color:var(--text-muted);line-height:1.9;margin-bottom:20px;padding:14px;background:var(--bg-app);border-radius:var(--radius-md);border-left:3px solid var(--primary);">
            <b style="color:var(--text-main);">How to activate:</b><br>
            1. Pay ₹${SUB_PLAN_AMOUNT} via any UPI app<br>
            2. Send the payment screenshot on WhatsApp<br>
            3. Activated within a few hours
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="${esc(waLink)}" target="_blank" rel="noopener noreferrer" class="btn" style="background:#25D366;color:#fff;font-weight:600;">
              💬 Send screenshot on WhatsApp
            </a>
            <button class="btn btn-ghost" onclick="closeModal()">Close</button>
          </div>
        </div>
      </div>
    </div>
  `, (root) => {
    const copyBtn = root.querySelector('#sub-copy-upi');
    if (copyBtn) copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(SUB_OWNER_UPI);
        toast('UPI ID copied', 'success');
      } catch (e) {
        prompt('Copy this UPI ID:', SUB_OWNER_UPI);
      }
    };
  });
};

window.openSubscriptionManageModal = function () {
  if (!window.SUB || !SUB.loaded) return;

  const expiresStr  = SUB.expires_at ? fmtDate(SUB.expires_at) : '—';
  const lastPaidStr = SUB.last_paid_at ? fmtDate(SUB.last_paid_at) : 'First activation';
  const days        = subDaysLeft();

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Your Subscription</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body">
      <div style="background:var(--bg-app);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;font-size:13px;line-height:2;color:var(--text-muted);">
        <div style="display:flex;justify-content:space-between;"><span>Status</span><b style="color:var(--success);">● Active</b></div>
        <div style="display:flex;justify-content:space-between;"><span>Plan</span><b style="color:var(--text-main);">₹${SUB_PLAN_AMOUNT} / year</b></div>
        <div style="display:flex;justify-content:space-between;"><span>Expires</span><b style="color:var(--text-main);">${expiresStr}</b></div>
        <div style="display:flex;justify-content:space-between;"><span>Days remaining</span><b style="color:var(--primary);">${days} days</b></div>
        <div style="display:flex;justify-content:space-between;"><span>Last paid</span><b style="color:var(--text-main);">${lastPaidStr}</b></div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
    </div>
  `);
};

window.openSubscriptionExpiredModal = function () {
  const overdue = subDaysOverdue();

  const waText = encodeURIComponent(
    'Hi, I have paid ₹' + SUB_PLAN_AMOUNT + ' for renewal. Please activate.\nShop: ' + (SETTINGS.shop_name || '')
  );
  const waLink = `https://wa.me/${SUB_SUPPORT_WHATSAPP}?text=${waText}`;

  openModal(`
    <div class="modal-header" style="background:var(--danger-bg);border-bottom-color:var(--danger);">
      <div>
        <div class="modal-title" style="color:var(--danger);">⚠ Subscription Expired</div>
        <div class="text-xs" style="color:#991b1b;margin-top:2px;">Renew to continue saving new data.</div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body" style="padding:32px 24px;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;">⚠️</div>

      <div style="font-size:16px;font-weight:700;color:var(--text-main);margin-bottom:8px;">
        Renew for ₹${SUB_PLAN_AMOUNT}
      </div>
      <div class="text-sm text-muted" style="margin-bottom:24px;">
        We will activate within a few hours after we receive your screenshot.
      </div>

      <div style="background:var(--bg-app);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:24px;">
        <code style="font-size:14px;color:var(--text-main);font-weight:600;font-family:monospace;word-break:break-all;">${esc(SUB_OWNER_UPI)}</code>
        <button id="sub-exp-copy" class="btn btn-ghost btn-sm">📋 Copy</button>
      </div>

      <div class="text-sm text-muted" style="margin-bottom:24px;">Receiver: <b style="color:var(--text-main);">${esc(SUB_OWNER_NAME)}</b></div>

      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
        <a href="${esc(waLink)}" target="_blank" rel="noopener noreferrer" class="btn" style="background:#25D366;color:#fff;font-weight:600;">💬 WhatsApp us</a>
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      </div>
    </div>

    <div style="margin-top:16px;padding:16px;border-top:1px solid var(--border);text-align:center;font-size:12px;color:var(--text-muted);line-height:1.9;">
      <div style="color:var(--danger);font-weight:600;margin-bottom:4px;">⚠ Overdue by ${overdue} day${overdue === 1 ? '' : 's'}</div>
      <div>Your existing data is safe. New entries are paused until renewal.</div>
    </div>
  `, (root) => {
    const copyBtn = root.querySelector('#sub-exp-copy');
    if (copyBtn) copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(SUB_OWNER_UPI);
        toast('UPI ID copied', 'success');
      } catch (e) {
        prompt('Copy this UPI ID:', SUB_OWNER_UPI);
      }
    };
  });
};

/* ─────────────────────────────────────────────
   14.7 WRITE GUARDS
   ───────────────────────────────────────────── */
function wrapGuard(fn) {
  return function () {
    if (!isSubActive()) {
      openSubscriptionExpiredModal();
      return;
    }
    return fn.apply(this, arguments);
  };
}

const GUARDED_FUNCTIONS = [
  'openCustomerForm', 'openProductForm', 'openVariantForm', 'openBulkVariantForm',
  'openSupplierForm', 'openExpenseForm', 'openBatchForm', 'openColorantForm',
  'openCustomMixModal'
];

GUARDED_FUNCTIONS.forEach(function (name) {
  const orig = window[name];
  if (typeof orig === 'function') {
    window[name] = wrapGuard(orig);
  }
});

// Global click interceptor for critical buttons
document.addEventListener('click', function (e) {
  if (isSubActive()) return;

  const t = e.target.closest(
    '[data-del],[data-del-batch],[data-rt-del],[data-spay-del],[data-pay-del],' +
    '#ni-save,#ni-save-print,#rtc-submit,#rts-submit,#np-save,#btn-del-inv,#btn-del-purchase,' +
    '[data-edit],[data-edit-batch],[data-edit-v],[data-restock]'
  );
  if (t) {
    e.preventDefault();
    e.stopPropagation();
    openSubscriptionExpiredModal();
  }
}, true);

/* ─────────────────────────────────────────────
   14.8 DOMAIN MODAL (with premium animations)
   ───────────────────────────────────────────── */
window.openDomainModal = function (suggestedDomain) {
  const supportPhone = window.APP_CONFIG.SUB_SUPPORT_WHATSAPP || '918637560557';

  const makeWaLink = (planName, price) => {
    const msg = `Hi, I want to claim a domain for my shop (${SETTINGS.shop_name || 'PaintBook'}).\n\nPlan: ${planName}\nDomain: ${suggestedDomain}\nPrice: ${price}\n\nPlease guide me on how to proceed.`;
    return `https://wa.me/${supportPhone}?text=${encodeURIComponent(msg)}`;
  };

  openModal(`
    <style>
      @keyframes bgShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
      @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes pulseGlow { 0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); } 70% { box-shadow: 0 0 0 12px rgba(16, 185, 129, 0); } 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); } }
      @keyframes shimmer { 100% { left: 200%; } }

      .premium-ai-banner {
        background: linear-gradient(270deg, #064E3B, #0F766E, #064E3B);
        background-size: 200% 200%;
        animation: bgShift 3s ease infinite, pulseGlow 2s infinite;
        border: 1px solid #10B981;
        border-radius: var(--radius-lg);
        padding: 16px;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        transition: transform 0.2s ease;
        position: relative;
        overflow: hidden;
      }
      .premium-ai-banner:hover { transform: scale(1.02); }
      .premium-ai-banner::before {
        content: ''; position: absolute; top: 0; left: -100%; width: 50%; height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
        animation: shimmer 2.5s infinite;
      }

      .premium-domain-card {
        border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px;
        background: linear-gradient(135deg, #ffffff 0%, #F8F8FF 100%);
        display: flex; flex-direction: column; justify-content: space-between;
        position: relative; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        opacity: 0; animation: fadeUp 0.5s ease forwards; overflow: hidden;
      }
      .premium-domain-card:hover {
        transform: translateY(-4px); box-shadow: 0 12px 24px -8px rgba(91, 91, 214, 0.25);
        border-color: rgba(91, 91, 214, 0.4);
      }
      .popular-badge {
        position: absolute; top: 0; right: 0; background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
        color: #fff; font-size: 9px; font-weight: 800; padding: 4px 10px;
        border-bottom-left-radius: 8px; letter-spacing: 0.5px; text-transform: uppercase;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .domain-price { font-size: 22px; font-weight: 800; color: #111827; letter-spacing: -0.5px; }
      .domain-renewal { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
      .delay-1 { animation-delay: 0.1s; } .delay-2 { animation-delay: 0.2s; } .delay-3 { animation-delay: 0.3s; } .delay-4 { animation-delay: 0.4s; }
    </style>

    <div class="modal-header" style="border-bottom: none; padding-bottom: 0;">
      <div>
        <div class="modal-title" style="font-size: 22px; letter-spacing: -0.5px; display: flex; align-items: center; gap: 8px;">
          🌐 <span style="background: linear-gradient(90deg, #111827, #4B5563); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Domains</span>
        </div>
        <div class="text-sm text-muted" style="margin-top:4px;">Get your own professional address.</div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="modal-body" style="padding-top: 16px;">
      <div class="premium-ai-banner" onclick="openAIScannerModal()">
        <div style="display:flex; align-items:center; gap:14px; position: relative; z-index: 2;">
          <div style="background:rgba(255, 255, 255, 0.15); width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:22px; backdrop-filter: blur(4px);">✨</div>
          <div>
            <div style="color:#fff; font-weight:800; font-size:15px; display:flex; align-items:center; gap:8px; letter-spacing: -0.3px;">
              AI Invoice Scanner
              <span style="background:#10B981; color:#022C22; font-size:9px; padding:3px 8px; border-radius:4px; letter-spacing:0.5px; font-weight:800;">AUTO-STOCK</span>
            </div>
            <div style="color:#A7F3D0; font-size:12px; margin-top:3px; font-weight:500;">Automatically scan bills and add stock.</div>
          </div>
        </div>
        <div style="color:#34D399; font-size:20px; position: relative; z-index: 2;">→</div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="premium-domain-card delay-1">
          <div>
            <div style="font-weight:800; font-size:16px; color:var(--text-main); display:flex; align-items:center; gap:6px;">🇮🇳 .in Domain</div>
            <div class="text-sm text-muted" style="margin-top:4px;">yourshop.in</div>
          </div>
          <div style="margin-top:20px;">
            <div class="domain-price">₹1,299</div>
            <div class="domain-renewal">+ ₹999/yr renewal</div>
            <a href="${makeWaLink('.in Domain', '₹1,299 + ₹999/yr')}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="margin-top:16px; width:100%; justify-content:space-between; padding: 0 16px; height: 38px; background: var(--primary); border: none; box-shadow: 0 4px 10px rgba(91, 91, 214, 0.2);">
              Claim Now <span>→</span>
            </a>
          </div>
        </div>

        <div class="premium-domain-card delay-2">
          <div class="popular-badge">Most Popular</div>
          <div>
            <div style="font-weight:800; font-size:16px; color:var(--text-main); display:flex; align-items:center; gap:6px;">🌐 .com Domain</div>
            <div class="text-sm text-muted" style="margin-top:4px;">yourshop.com</div>
          </div>
          <div style="margin-top:20px;">
            <div class="domain-price">₹1,799</div>
            <div class="domain-renewal">+ ₹1,599/yr renewal</div>
            <a href="${makeWaLink('.com Domain', '₹1,799 + ₹1,599/yr')}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="margin-top:16px; width:100%; justify-content:space-between; padding: 0 16px; height: 38px; background: var(--primary); border: none; box-shadow: 0 4px 10px rgba(91, 91, 214, 0.2);">
              Claim Now <span>→</span>
            </a>
          </div>
        </div>

        <div class="premium-domain-card delay-3">
          <div>
            <div style="font-weight:800; font-size:16px; color:var(--text-main); display:flex; align-items:center; gap:6px;">⚡ Subdomain</div>
            <div class="text-sm text-muted" style="margin-top:4px;">yourshop.shopsteward.in</div>
          </div>
          <div style="margin-top:20px;">
            <div class="domain-price">₹699</div>
            <div class="domain-renewal">+ ₹299/yr renewal</div>
            <a href="${makeWaLink('Subdomain', '₹699 + ₹299/yr')}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="margin-top:16px; width:100%; justify-content:space-between; padding: 0 16px; height: 38px; background: transparent; border-color: var(--border);">
              Claim Now <span>→</span>
            </a>
          </div>
        </div>

        <div class="premium-domain-card delay-4">
          <div>
            <div style="font-weight:800; font-size:16px; color:var(--text-main); display:flex; align-items:center; gap:6px;">🚀 Custom TLD</div>
            <div class="text-sm text-muted" style="margin-top:4px;">Any extension (e.g., .store)</div>
          </div>
          <div style="margin-top:20px;">
            <div class="domain-price" style="color: var(--text-muted);">Variable</div>
            <div class="domain-renewal">Based on extension</div>
            <a href="${makeWaLink('Custom TLD', 'Variable (Need Quote)')}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="margin-top:16px; width:100%; justify-content:space-between; padding: 0 16px; height: 38px; background: transparent; border-color: var(--border);">
              Ask for Quote <span>→</span>
            </a>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-footer" style="border-top: none; padding-top: 0;">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
    </div>
  `);
};

/* ─────────────────────────────────────────────
   14.9 AI SCANNER MODAL
   ───────────────────────────────────────────── */
window.openAIScannerModal = function () {
  const supportPhone = window.APP_CONFIG.SUB_SUPPORT_WHATSAPP || '918637560557';

  const waText = encodeURIComponent(
    `Hi, I want a quote for the AI Invoice Scanner.\n\nShop: ${SETTINGS.shop_name || 'PaintBook'}\nPlan: Annual Plan (₹7,999)\n\nPlease guide me on how to activate this.`
  );
  const waLink = `https://wa.me/${supportPhone}?text=${waText}`;

  openModal(`
    <style>
      @keyframes floatBg { 0% { background-position: 0% 0%; } 50% { background-position: 100% 100%; } 100% { background-position: 0% 0%; } }
      .premium-ai-modal {
        background: linear-gradient(135deg, #0B1311 0%, #111C18 50%, #0B1311 100%);
        background-size: 200% 200%; animation: floatBg 10s ease infinite;
        border-radius: var(--radius-lg);
      }
      .ai-modal-btn {
        background: linear-gradient(90deg, #065F46, #059669); border: 1px solid #10B981;
        color: #fff; font-weight: 700; transition: all 0.2s ease;
        box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
      }
      .ai-modal-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(16, 185, 129, 0.5); }
    </style>

    <div class="premium-ai-modal">
      <div class="modal-header" style="border-bottom: 1px solid rgba(255,255,255,0.05); background: transparent;">
        <div>
          <div class="modal-title" style="color:#fff; display:flex; align-items:center; gap:8px;">
            <span style="background:#10B981; color:#000; padding:3px 10px; border-radius:6px; font-size:10px; font-weight:800; letter-spacing:1px; box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);">AI INVOICE SCANNER</span>
          </div>
        </div>
        <button class="modal-close" onclick="closeModal()" style="color:#9CA3AF;">✕</button>
      </div>

      <div class="modal-body" style="padding:0;">
        <div style="display:flex; flex-direction:column;">
          <div style="padding:32px 24px;">
            <h3 style="color:#fff; font-size:18px; font-weight:800; margin-bottom:20px; letter-spacing: -0.5px;">What it extracts:</h3>
            <ul style="list-style:none; padding:0; margin:0; color:#D1D5DB; font-size:13.5px; display:flex; flex-direction:column; gap:14px;">
              <li style="display:flex; gap:10px; align-items:flex-start;"><span style="color:#10B981; font-size:16px;">✓</span> <div><b>Supplier Details:</b> Company name, address, GSTIN.</div></li>
              <li style="display:flex; gap:10px; align-items:flex-start;"><span style="color:#10B981; font-size:16px;">✓</span> <div><b>Invoice Info:</b> Invoice number, date, and totals.</div></li>
              <li style="display:flex; gap:10px; align-items:flex-start;"><span style="color:#10B981; font-size:16px;">✓</span> <div><b>Product Data:</b> Item names, quantities, units, and purchase rates.</div></li>
              <li style="display:flex; gap:10px; align-items:flex-start;"><span style="color:#10B981; font-size:16px;">✓</span> <div><b>Tax Breakdown:</b> Tax amounts and line-item totals.</div></li>
            </ul>
          </div>

          <div style="padding:32px 24px; background:rgba(0,0,0,0.2); border-top:1px solid rgba(255,255,255,0.05); border-bottom:1px solid rgba(255,255,255,0.05);">
            <div style="display:inline-block; background:rgba(16, 185, 129, 0.15); color:#34D399; font-size:10px; font-weight:800; padding:5px 12px; border-radius:999px; margin-bottom:16px; letter-spacing:0.5px; border: 1px solid rgba(16, 185, 129, 0.3);">ANNUAL PLAN</div>

            <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:4px;">
              <span style="font-size:42px; font-weight:800; color:#fff; letter-spacing: -1.5px;">₹7,999</span>
              <span style="color:#9CA3AF; font-size:16px; font-weight:500;">/year</span>
            </div>

            <div style="color:#9CA3AF; font-size:13px; margin-bottom:20px;">+ applicable GST</div>

            <div style="border:1px dashed rgba(16, 185, 129, 0.4); background:rgba(16, 185, 129, 0.1); color:#34D399; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:24px; display:inline-block;">
              That's just <b>₹22 / day</b> to automate your invoices.
            </div>

            <ul style="list-style:none; padding:0; margin:0 0 32px 0; color:#D1D5DB; font-size:13.5px; display:flex; flex-direction:column; gap:12px;">
              <li style="display:flex; gap:10px; align-items:center;"><span style="color:#34D399; font-size:18px;">+</span> Up to 100 invoice scans per month</li>
              <li style="display:flex; gap:10px; align-items:center;"><span style="color:#34D399; font-size:18px;">+</span> Unused scans do not carry forward</li>
            </ul>

            <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn ai-modal-btn" style="width:100%; justify-content:center; height: 48px; font-size: 14px; border-radius: 8px;">
              GET A QUOTE →
            </a>
          </div>
        </div>

        <div style="padding:20px 24px; background:#0B1311;">
          <div style="display:flex; gap:14px; align-items:flex-start;">
            <span style="color:#F59E0B; font-size:18px;">⚠</span>
            <div>
              <div style="color:#F59E0B; font-weight:800; font-size:11px; text-transform:uppercase; margin-bottom:6px; letter-spacing:0.5px;">Invoice Eligibility Note:</div>
              <div style="color:#9CA3AF; font-size:12px; line-height:1.6;">
                AI Invoice Scanner works best with clear, readable images of printed supplier invoices. Handwritten, blurry, damaged, incomplete, or unusually formatted invoices may not be processed accurately and may require manual entry or correction.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer" style="background:#0B1311; border-top:1px solid rgba(255,255,255,0.05);">
        <button class="btn btn-ghost" onclick="openDomainModal('${SETTINGS.shop_name ? SETTINGS.shop_name.toLowerCase().replace(/[^a-z0-9]/g, '') : 'myshop'}.com')" style="color:#9CA3AF; border-color:rgba(255,255,255,0.1);">← Back to Domains</button>
        <button class="btn btn-ghost" onclick="closeModal()" style="color:#9CA3AF; border-color:rgba(255,255,255,0.1);">Close</button>
      </div>
    </div>
  `);
};

/* ─────────────────────────────────────────────
   14.10 CSS FOR SIDEBAR PILL GLOW
   ───────────────────────────────────────────── */
(function injectProPlanCSS() {
  if (document.getElementById('pro-plan-css')) return;
  const style = document.createElement('style');
  style.id = 'pro-plan-css';
  style.textContent = `
    @keyframes proGlow {
      0% { box-shadow: 0 0 0 0 rgba(91, 91, 214, 0.1); border-color: #E0E0F5; }
      50% { box-shadow: 0 0 12px 2px rgba(16, 185, 129, 0.2); border-color: rgba(16, 185, 129, 0.4); }
      100% { box-shadow: 0 0 0 0 rgba(91, 91, 214, 0.1); border-color: #E0E0F5; }
    }
    .pro-plan-card {
      border: 1px solid #E0E0F5;
      position: relative;
      overflow: hidden;
      animation: proGlow 4s infinite ease-in-out;
      transition: transform 0.2s ease;
    }
    .pro-plan-card:hover {
      transform: translateY(-2px);
    }
    [data-theme="dark"] .pro-plan-card {
      background: var(--bg-card) !important;
      border-color: var(--border);
    }
    [data-theme="dark"] .pro-plan-card div[style*="background:#E5E7EB"] {
      background: var(--border) !important;
    }
    [data-theme="dark"] .pro-plan-card span[style*="color:#111827"] {
      color: var(--text-main) !important;
    }
  `;
  document.head.appendChild(style);
})();
