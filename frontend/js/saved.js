// ─────────────────────────────────────────────────────────────
// SAVED.JS — Saved / Bookmarked Listings
// ─────────────────────────────────────────────────────────────

const API      = '/api';
const getToken = () => localStorage.getItem('lm_token');
const isLoggedIn = () => !!getToken();

const authHeaders = () => ({ 'Authorization': `Bearer ${getToken()}` });

// ─── Auth guard ───────────────────────────────────────────────
if (!isLoggedIn()) window.location.href = '/pages/login.html';

// ─── Helpers ─────────────────────────────────────────────────
const formatPrice = (price) => {
  if (price === null || price === undefined || price === '') return 'Price on Ask';
  if (parseFloat(price) === 0) return 'FREE';
  return '₱' + parseFloat(price).toLocaleString('en-PH', { minimumFractionDigits: 2 });
};

const timeAgo = (dateStr) => {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const conditionLabel = { new: 'New', like_new: 'Like New', good: 'Good', fair: 'Fair', poor: 'Poor' };

// ─── State ───────────────────────────────────────────────────
let allSaved = [];

// ─── Load saved listings from API ────────────────────────────
const loadSaved = async () => {
  const grid = document.getElementById('saved-grid');
  grid.innerHTML = '<p style="color:#94a3b8;padding:2rem;grid-column:1/-1;">Loading your saved listings...</p>';

  try {
    const res  = await fetch(`${API}/listings/saved`, { headers: authHeaders() });
    const data = await res.json();
    allSaved = data.listings || [];
    renderSaved();
  } catch {
    document.getElementById('saved-grid').innerHTML =
      '<p style="color:#ef4444;padding:2rem;grid-column:1/-1;">Failed to load saved listings.</p>';
  }
};

// ─── Render (with sort) ──────────────────────────────────────
window.renderSaved = () => {
  const grid    = document.getElementById('saved-grid');
  const toolbar = document.getElementById('saved-toolbar');
  const countEl = document.getElementById('saved-count');
  const sort    = document.getElementById('saved-sort')?.value || 'newest';

  if (!allSaved.length) {
    toolbar.style.display = 'none';
    grid.innerHTML = `
      <div class="saved-empty" style="grid-column:1/-1;">
        <span class="e-icon">🔖</span>
        <h2>No saved listings yet</h2>
        <p>Tap the 🤍 button on any listing to save it here for later.</p>
        <a href="/pages/listings.html" class="btn-browse">Browse Listings</a>
      </div>`;
    return;
  }

  // Sort
  const sorted = [...allSaved].sort((a, b) => {
    if (sort === 'newest')     return new Date(b.saved_at) - new Date(a.saved_at);
    if (sort === 'oldest')     return new Date(a.saved_at) - new Date(b.saved_at);
    if (sort === 'price_asc')  return (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0);
    if (sort === 'price_desc') return (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0);
    return 0;
  });

  toolbar.style.display = 'flex';
  countEl.textContent   = `${allSaved.length} saved listing${allSaved.length !== 1 ? 's' : ''}`;

  grid.innerHTML = sorted.map(l => {
    const isUnavailable = l.status !== 'active';
    const imgHtml = l.primary_image
      ? `<img src="${l.primary_image}" alt="${l.title}" loading="lazy" style="${isUnavailable ? 'filter:grayscale(0.5);opacity:0.8;' : ''}"/>`
      : `<span>📦</span>`;

    return `
      <div class="saved-card-wrap">
        ${isUnavailable ? `<div class="status-ribbon ${l.status}">${l.status}</div>` : ''}
        <button class="unsave-btn" onclick="unsave(${l.id}, this)" title="Remove from saved">❤️</button>
        <a class="listing-card" href="/pages/listing.html?id=${l.id}" style="${isUnavailable ? 'opacity:0.75;' : ''}">
          <div class="card-image">${imgHtml}</div>
          <div class="card-body">
            <div class="card-title">${l.title}</div>
            <div class="card-price ${parseFloat(l.price) === 0 ? 'free' : ''}">${formatPrice(l.price)}</div>
            <div class="card-meta">
              ${l.condition ? `<span class="badge badge-condition">${conditionLabel[l.condition] || l.condition}</span>` : ''}
              ${l.category_icon ? `<span title="${l.category_name}">${l.category_icon}</span>` : ''}
            </div>
            ${l.location ? `<div class="card-location">📍 ${l.location}</div>` : ''}
            <div class="card-location" style="margin-top:0.25rem;">
              🔖 Saved ${timeAgo(l.saved_at)}
            </div>
          </div>
        </a>
      </div>`;
  }).join('');
};

// ─── Unsave a listing ────────────────────────────────────────
window.unsave = async (listingId, btn) => {
  // Optimistic UI — remove card immediately
  const card = btn.closest('.saved-card-wrap');

  btn.textContent  = '🤍';
  btn.disabled     = true;

  try {
    const res  = await fetch(`${API}/listings/${listingId}/save`, {
      method:  'POST',
      headers: authHeaders(),
    });
    const data = await res.json();

    if (data.saved === false) {
      // Remove from local state and re-render
      allSaved = allSaved.filter(l => l.id !== listingId);
      renderSaved();

      // Toast
      const toast = document.createElement('div');
      toast.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;
        background:#374151;color:white;padding:0.65rem 1.1rem;border-radius:10px;
        font-size:0.88rem;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.15);`;
      toast.textContent = '🗑️ Removed from saved.';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
    }
  } catch {
    btn.textContent  = '❤️';
    btn.disabled     = false;
  }
};

// ─── Init ────────────────────────────────────────────────────
loadSaved();
