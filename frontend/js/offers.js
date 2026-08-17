// ─────────────────────────────────────────────────────────────
// OFFERS.JS — Offers & Negotiation
// ─────────────────────────────────────────────────────────────

const API      = '/api';
const getToken = () => localStorage.getItem('lm_token');
const getUser  = () => JSON.parse(localStorage.getItem('lm_user') || 'null');
const isLoggedIn = () => !!getToken();

const authHeaders = () => ({
  'Authorization': `Bearer ${getToken()}`,
  'Content-Type':  'application/json',
});

// ─── Helpers ─────────────────────────────────────────────────
const formatPrice = (price) => {
  if (!price && price !== 0) return '—';
  return '₱' + parseFloat(price).toLocaleString('en-PH', { minimumFractionDigits: 2 });
};

const timeAgo = (dateStr) => {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

const statusBadge = (status) => {
  const map = {
    pending:   { icon: '⏳', label: 'Pending',    cls: 'badge-pending'   },
    accepted:  { icon: '✅', label: 'Accepted',   cls: 'badge-accepted'  },
    declined:  { icon: '❌', label: 'Declined',   cls: 'badge-declined'  },
    countered: { icon: '🔄', label: 'Countered',  cls: 'badge-countered' },
    withdrawn: { icon: '↩️', label: 'Withdrawn',  cls: 'badge-withdrawn' },
  };
  const s = map[status] || { icon: '•', label: status, cls: '' };
  return `<span class="offer-status-badge ${s.cls}">${s.icon} ${s.label}</span>`;
};

// ─────────────────────────────────────────────────────────────
// OFFERS PAGE (offers.html)
// ─────────────────────────────────────────────────────────────
const offersListEl = document.getElementById('offers-list');

if (offersListEl) {
  if (!isLoggedIn()) window.location.href = '/pages/login.html';

  const currentUser = getUser();
  let activeTab     = 'received';
  let currentPage   = 1;

  // ─── Switch Tab ──────────────────────────────────────────
  window.switchTab = (tab) => {
    activeTab   = tab;
    currentPage = 1;
    document.getElementById('tab-received').classList.toggle('active', tab === 'received');
    document.getElementById('tab-sent').classList.toggle('active', tab === 'sent');
    document.getElementById('status-filter').value = '';
    loadOffers();
  };

  // ─── Load Offers ─────────────────────────────────────────
  window.loadOffers = async () => {
    const status = document.getElementById('status-filter').value;
    const qs     = new URLSearchParams({ status, page: currentPage, limit: 10 });
    const url    = `${API}/offers/${activeTab}?${qs}`;

    offersListEl.innerHTML = '<p style="color:#94a3b8;padding:1rem;">Loading...</p>';

    try {
      const res  = await fetch(url, { headers: authHeaders() });
      const data = await res.json();
      const offers = data.offers || [];

      // Update tab counts
      if (activeTab === 'received') {
        const pendingCount = offers.filter(o => o.status === 'pending').length;
        const badge = document.getElementById('received-count');
        badge.textContent    = pendingCount || data.pagination.total;
        badge.style.display  = data.pagination.total > 0 ? 'inline-block' : 'none';
      } else {
        const badge = document.getElementById('sent-count');
        badge.textContent   = data.pagination.total;
        badge.style.display = data.pagination.total > 0 ? 'inline-block' : 'none';
      }

      if (!offers.length) {
        offersListEl.innerHTML = `
          <div class="offers-empty">
            <div class="e-icon">${activeTab === 'received' ? '📥' : '📤'}</div>
            <h3>No ${activeTab} offers</h3>
            <p>${activeTab === 'received'
              ? 'When buyers make offers on your listings, they\'ll appear here.'
              : 'Browse listings and make an offer on items you\'re interested in.'}</p>
          </div>`;
        document.getElementById('offers-pagination').innerHTML = '';
        return;
      }

      offersListEl.innerHTML = offers.map(o => renderOfferCard(o)).join('');
      renderPagination(data.pagination);
    } catch (err) {
      offersListEl.innerHTML = `<p style="color:#ef4444;">Failed to load offers: ${err.message}</p>`;
    }
  };

  // ─── Render Offer Card ───────────────────────────────────
  const renderOfferCard = (o) => {
    const isReceived  = activeTab === 'received';
    const otherUser   = isReceived ? o.buyer_username : o.seller_username;
    const roleLabel   = isReceived ? 'from' : 'to seller';
    const effectiveAmount = o.status === 'countered' && o.counter_amount ? o.counter_amount : o.amount;

    // Action buttons based on role + status
    let actions = '';
    const safeTitle    = o.listing_title.replace(/'/g, "\\'");
    const safeUsername = otherUser.replace(/'/g, "\\'");
    const revieweeId   = isReceived ? o.buyer_id  : o.seller_id;

    if (isReceived) {
      if (o.status === 'pending') {
        actions = `
          <button class="offer-btn offer-btn-accept"  onclick="acceptOffer(${o.id})">✅ Accept</button>
          <button class="offer-btn offer-btn-counter" onclick="openCounterModal(${o.id}, ${o.amount}, '${safeTitle}')">🔄 Counter</button>
          <button class="offer-btn offer-btn-decline" onclick="declineOffer(${o.id})">❌ Decline</button>
          <button class="offer-btn offer-btn-message" onclick="messageUser(${o.listing_id}, '${safeUsername}')">💬 Message</button>`;
      } else if (o.status === 'countered') {
        actions = `
          <button class="offer-btn offer-btn-decline" onclick="declineOffer(${o.id})">❌ Decline</button>
          <button class="offer-btn offer-btn-message" onclick="messageUser(${o.listing_id}, '${safeUsername}')">💬 Message</button>`;
      } else if (o.status === 'accepted') {
        actions = `<button class="offer-btn" style="background:#fef9c3;color:#92400e;border:1px solid #fde68a;" onclick="openReviewModal(${revieweeId}, '${safeUsername}', ${o.listing_id}, '${safeTitle}')">⭐ Leave a Review</button>`;
      }
    } else {
      // Sent offers — buyer actions
      if (o.status === 'pending') {
        actions = `<button class="offer-btn offer-btn-withdraw" onclick="withdrawOffer(${o.id})">↩️ Withdraw</button>`;
      } else if (o.status === 'countered') {
        actions = `
          <button class="offer-btn offer-btn-accept" onclick="acceptCounter(${o.id})">✅ Accept Counter (${formatPrice(o.counter_amount)})</button>
          <button class="offer-btn offer-btn-withdraw" onclick="withdrawOffer(${o.id})">↩️ Decline Counter</button>`;
      } else if (o.status === 'accepted') {
        actions = `<button class="offer-btn" style="background:#fef9c3;color:#92400e;border:1px solid #fde68a;" onclick="openReviewModal(${revieweeId}, '${safeUsername}', ${o.listing_id}, '${safeTitle}')">⭐ Leave a Review</button>`;
      }
    }

    return `
      <div class="offer-card status-${o.status}" id="offer-${o.id}">
        <div class="offer-card-inner">
          <div class="offer-thumb">
            ${o.listing_image ? `<img src="${o.listing_image}" alt="${o.listing_title}"/>` : '📦'}
          </div>
          <div class="offer-body">
            <a href="/pages/listing.html?id=${o.listing_id}" class="offer-listing-title">${o.listing_title}</a>
            <div class="offer-user">${isReceived ? '👤 Offer from' : '🏪 Seller:'} <strong>${otherUser}</strong> · ${timeAgo(o.updated_at)}</div>

            <div class="offer-prices">
              <div class="offer-price-item">
                <span class="offer-price-label">Listed At</span>
                <span class="offer-price-value listing-price">${formatPrice(o.listing_price)}</span>
              </div>
              <div class="price-arrow">→</div>
              <div class="offer-price-item">
                <span class="offer-price-label">Offer</span>
                <span class="offer-price-value offer-amount">${formatPrice(o.amount)}</span>
              </div>
              ${o.counter_amount ? `
              <div class="price-arrow">→</div>
              <div class="offer-price-item">
                <span class="offer-price-label">Counter</span>
                <span class="offer-price-value counter-amount">${formatPrice(o.counter_amount)}</span>
              </div>` : ''}
            </div>

            ${o.message ? `<div class="offer-message">"${o.message}"</div>` : ''}

            <div class="offer-status-row">
              ${statusBadge(o.status)}
              <span class="offer-time">Updated ${timeAgo(o.updated_at)}</span>
            </div>
          </div>
        </div>
        ${actions ? `<div class="offer-actions">${actions}</div>` : ''}
      </div>`;
  };

  // ─── Pagination ──────────────────────────────────────────
  const renderPagination = ({ page, totalPages }) => {
    const el = document.getElementById('offers-pagination');
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    let html = '';
    if (page > 1) html += `<button onclick="goPage(${page-1})" style="padding:0.5rem 0.9rem;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;">← Prev</button>`;
    for (let i = 1; i <= totalPages; i++) {
      html += `<button onclick="goPage(${i})" style="padding:0.5rem 0.9rem;border:1px solid ${i===page?'#2563eb':'#e5e7eb'};background:${i===page?'#2563eb':'white'};color:${i===page?'white':'#374151'};border-radius:8px;cursor:pointer;">${i}</button>`;
    }
    if (page < totalPages) html += `<button onclick="goPage(${page+1})" style="padding:0.5rem 0.9rem;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;">Next →</button>`;
    el.innerHTML = html;
  };

  window.goPage = (p) => { currentPage = p; loadOffers(); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  // ─── Actions ─────────────────────────────────────────────
  window.acceptOffer = async (id) => {
    if (!confirm('Accept this offer? The listing will be marked as Reserved.')) return;
    try {
      const res  = await fetch(`${API}/offers/${id}/accept`, { method: 'PUT', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(data.message);
      loadOffers();
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.acceptCounter = async (id) => {
    if (!confirm('Accept the seller\'s counter-offer?')) return;
    try {
      const res  = await fetch(`${API}/offers/${id}/accept`, { method: 'PUT', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(data.message);
      loadOffers();
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.declineOffer = async (id) => {
    if (!confirm('Decline this offer?')) return;
    try {
      const res  = await fetch(`${API}/offers/${id}/decline`, { method: 'PUT', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(data.message);
      loadOffers();
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.withdrawOffer = async (id) => {
    if (!confirm('Withdraw your offer?')) return;
    try {
      const res  = await fetch(`${API}/offers/${id}/withdraw`, { method: 'PUT', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(data.message);
      loadOffers();
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.messageUser = (listingId, username) => {
    window.location.href = `/pages/listing.html?id=${listingId}`;
  };

  // ─── Counter-offer Modal ─────────────────────────────────
  window.openCounterModal = (offerId, originalAmount, listingTitle) => {
    document.getElementById('counter-modal')?.remove();
    const modal = document.createElement('div');
    modal.id    = 'counter-modal';
    modal.className = 'offer-modal-overlay';
    modal.innerHTML = `
      <div class="offer-modal">
        <h3>🔄 Send Counter-Offer</h3>
        <p class="modal-sub">Respond with a price you'd accept for: <strong>${listingTitle}</strong></p>

        <div class="offer-summary-box">
          <div><div class="osb-label">Buyer's Offer</div><div class="osb-value">${formatPrice(originalAmount)}</div></div>
          <div style="color:#d1d5db;font-size:1.5rem;">→</div>
          <div><div class="osb-label">Your Counter</div><div class="osb-value" id="counter-preview">₱—</div></div>
        </div>

        <div class="form-group">
          <label>Counter-Offer Amount (₱) *</label>
          <input type="number" id="counter-amount" placeholder="e.g. 1500" min="1" step="0.01"
            oninput="document.getElementById('counter-preview').textContent = this.value ? '₱' + parseFloat(this.value).toLocaleString('en-PH', {minimumFractionDigits:2}) : '₱—'"/>
        </div>
        <div class="form-group">
          <label>Message to Buyer (optional)</label>
          <textarea id="counter-message" placeholder="e.g. Best I can do, includes free delivery..."></textarea>
        </div>
        <div class="offer-modal-error" id="counter-error"></div>
        <div class="offer-modal-actions">
          <button onclick="document.getElementById('counter-modal').remove()" style="padding:0.6rem 1.1rem;border-radius:8px;border:1px solid #e5e7eb;background:white;cursor:pointer;font-size:0.9rem;">Cancel</button>
          <button onclick="submitCounter(${offerId})" style="padding:0.6rem 1.25rem;border-radius:8px;border:none;background:#8b5cf6;color:white;font-weight:700;cursor:pointer;font-size:0.9rem;">Send Counter</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('counter-amount').focus();
  };

  window.submitCounter = async (offerId) => {
    const amount  = document.getElementById('counter-amount').value;
    const message = document.getElementById('counter-message').value.trim();
    const errEl   = document.getElementById('counter-error');

    if (!amount || parseFloat(amount) <= 0) {
      errEl.textContent   = 'Please enter a valid counter-offer amount.';
      errEl.style.display = 'block';
      return;
    }

    try {
      const res  = await fetch(`${API}/offers/${offerId}/counter`, {
        method:  'PUT',
        headers: authHeaders(),
        body:    JSON.stringify({ counter_amount: parseFloat(amount), message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      document.getElementById('counter-modal').remove();
      showToast(data.message);
      loadOffers();
    } catch (err) {
      errEl.textContent   = err.message;
      errEl.style.display = 'block';
    }
  };

  // ─── Toast ───────────────────────────────────────────────
  window.showToast = (msg, type = 'success') => {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;
      background:${type === 'success' ? '#10b981' : '#ef4444'};
      color:white;padding:0.75rem 1.25rem;border-radius:10px;
      font-size:0.9rem;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.15);`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  };

  // ─── Init ─────────────────────────────────────────────────
  loadOffers();
}

// ─────────────────────────────────────────────────────────────
// MAKE AN OFFER MODAL (used on listing detail page)
// ─────────────────────────────────────────────────────────────
window.openOfferModal = (listingId, listingPrice, listingTitle) => {
  if (!isLoggedIn()) { window.location.href = '/pages/login.html'; return; }

  document.getElementById('offer-modal')?.remove();

  const modal = document.createElement('div');
  modal.id    = 'offer-modal';
  modal.className = 'offer-modal-overlay';
  modal.innerHTML = `
    <div class="offer-modal">
      <h3>💰 Make an Offer</h3>
      <p class="modal-sub">on: <strong>${listingTitle}</strong></p>

      ${listingPrice ? `
      <div class="offer-summary-box">
        <div><div class="osb-label">Listed Price</div><div class="osb-value">₱${parseFloat(listingPrice).toLocaleString('en-PH', {minimumFractionDigits:2})}</div></div>
        <div style="color:#d1d5db;font-size:1.5rem;">→</div>
        <div><div class="osb-label">Your Offer</div><div class="osb-value" id="offer-preview">₱—</div></div>
      </div>` : ''}

      <div class="form-group">
        <label>Your Offer Amount (₱) *</label>
        <input type="number" id="offer-amount-input" placeholder="Enter your offer" min="1" step="0.01"
          oninput="document.getElementById('offer-preview') && (document.getElementById('offer-preview').textContent = this.value ? '₱' + parseFloat(this.value).toLocaleString('en-PH',{minimumFractionDigits:2}) : '₱—')"/>
      </div>
      <div class="form-group">
        <label>Message to Seller (optional)</label>
        <textarea id="offer-message-input" placeholder="Hi! I'm interested in this item. Is this price negotiable?"></textarea>
      </div>
      <div class="offer-modal-error" id="offer-modal-error"></div>
      <div class="offer-modal-actions">
        <button onclick="document.getElementById('offer-modal').remove()" style="padding:0.6rem 1.1rem;border-radius:8px;border:1px solid #e5e7eb;background:white;cursor:pointer;font-size:0.9rem;">Cancel</button>
        <button onclick="submitOffer(${listingId})" style="padding:0.6rem 1.25rem;border-radius:8px;border:none;background:#2563eb;color:white;font-weight:700;cursor:pointer;font-size:0.9rem;">Send Offer</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  document.getElementById('offer-amount-input').focus();
};

window.submitOffer = async (listingId) => {
  const amount  = document.getElementById('offer-amount-input').value;
  const message = document.getElementById('offer-message-input').value.trim();
  const errEl   = document.getElementById('offer-modal-error');

  if (!amount || parseFloat(amount) <= 0) {
    errEl.textContent   = 'Please enter a valid offer amount.';
    errEl.style.display = 'block';
    return;
  }

  try {
    const res  = await fetch(`${API}/offers`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ listing_id: listingId, amount: parseFloat(amount), message }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById('offer-modal').remove();

    // Show success toast
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;
      background:#10b981;color:white;padding:0.75rem 1.25rem;border-radius:10px;
      font-size:0.9rem;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.15);`;
    toast.innerHTML = `✅ ${data.message} <a href="/pages/offers.html" style="color:white;text-decoration:underline;margin-left:0.5rem;">View Offers →</a>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  } catch (err) {
    errEl.textContent   = err.message;
    errEl.style.display = 'block';
  }
};
