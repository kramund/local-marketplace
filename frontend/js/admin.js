// ─────────────────────────────────────────────────────────────
// ADMIN.JS — Shared admin panel logic
// ─────────────────────────────────────────────────────────────

const API       = '/api/admin';
const getToken  = () => localStorage.getItem('lm_token');
const getUser   = () => JSON.parse(localStorage.getItem('lm_user') || 'null');

// ─── Auth Guard ──────────────────────────────────────────────
const user = getUser();
if (!user || user.role !== 'admin') {
  window.location.href = '/pages/login.html';
}

const authHeaders = () => ({
  'Authorization': `Bearer ${getToken()}`,
  'Content-Type':  'application/json',
});

// ─── Fetch Helper ────────────────────────────────────────────
const adminFetch = async (url, options = {}) => {
  const res  = await fetch(url, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

// ─── Format Helpers ──────────────────────────────────────────
const timeAgo = (dateStr) => {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800)return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatPrice = (price) => {
  if (!price && price !== 0) return '—';
  return '₱' + parseFloat(price).toLocaleString('en-PH', { minimumFractionDigits: 2 });
};

// ─── Render Sidebar ──────────────────────────────────────────
const renderSidebar = (activePage, badges = {}) => {
  const el = document.getElementById('admin-sidebar');
  if (!el) return;

  const links = [
    { href: '/pages/admin/index.html',    icon: '📊', label: 'Dashboard',        key: 'dashboard' },
    { href: '/pages/admin/listings.html', icon: '📦', label: 'Listings',         key: 'listings'  },
    { href: '/pages/admin/flagged.html',  icon: '🚩', label: 'Flagged Queue',    key: 'flagged',  badge: badges.flagged  },
    { href: '/pages/admin/reports.html',  icon: '📋', label: 'Reports',          key: 'reports',  badge: badges.reports  },
    { href: '/pages/admin/users.html',    icon: '👥', label: 'Users',            key: 'users'     },
    { href: '/pages/admin/logs.html',     icon: '🗂️', label: 'Activity Log',     key: 'logs'      },
  ];

  el.innerHTML = `
    <div class="sidebar-logo">
      <a href="/pages/admin/index.html">🛒 Local Marketplace</a>
      <small>Admin Panel</small>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section">Main</div>
      ${links.map(l => `
        <a href="${l.href}" class="nav-link ${activePage === l.key ? 'active' : ''}">
          <span class="nav-icon">${l.icon}</span>
          ${l.label}
          ${l.badge ? `<span class="nav-badge">${l.badge}</span>` : ''}
        </a>`).join('')}
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-user">Logged in as <strong>${user.username}</strong></div>
      <a href="/" class="sidebar-back">← Back to Marketplace</a>
    </div>`;
};

// ─── Pagination Renderer ─────────────────────────────────────
const renderPagination = (containerId, pagination, onPageChange) => {
  const el = document.getElementById(containerId);
  if (!el) return;
  const { page, totalPages } = pagination;
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  let html = '';
  if (page > 1) html += `<button class="pg-btn" onclick="(${onPageChange})(${page - 1})">←</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      html += `<button class="pg-btn ${i === page ? 'active' : ''}" onclick="(${onPageChange})(${i})">${i}</button>`;
    } else if (i === page - 3 || i === page + 3) {
      html += `<span style="padding:0.4rem;">…</span>`;
    }
  }
  if (page < totalPages) html += `<button class="pg-btn" onclick="(${onPageChange})(${page + 1})">→</button>`;
  el.innerHTML = html;
};

// ─── Modal Helper ────────────────────────────────────────────
const showModal = ({ title, placeholder = 'Add a note (optional)', onConfirm, confirmLabel = 'Confirm', confirmClass = 'btn-sm-primary' }) => {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <h3>${title}</h3>
      <textarea id="modal-note" placeholder="${placeholder}"></textarea>
      <div class="modal-actions">
        <button class="btn-sm btn-sm-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn-sm ${confirmClass}" id="modal-confirm">${confirmLabel}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#modal-confirm').onclick = () => {
    const note = overlay.querySelector('#modal-note').value.trim();
    overlay.remove();
    onConfirm(note);
  };
};

// ─── Toast Notification ──────────────────────────────────────
const toast = (message, type = 'success') => {
  const el  = document.createElement('div');
  el.style.cssText = `
    position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;
    background:${type === 'success' ? '#10b981' : '#ef4444'};
    color:white;padding:0.75rem 1.25rem;border-radius:10px;
    font-size:0.9rem;font-weight:600;
    box-shadow:0 4px 12px rgba(0,0,0,0.15);
    animation:fadeIn 0.2s ease;`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
};

// ─────────────────────────────────────────────────────────────
// PAGE: DASHBOARD (index.html)
// ─────────────────────────────────────────────────────────────
const dashboardEl = document.getElementById('dashboard-stats');
if (dashboardEl) {
  renderSidebar('dashboard');

  adminFetch(`${API}/dashboard`).then(data => {
    const { stats, recent_listings, recent_users } = data;

    // Update sidebar badges
    renderSidebar('dashboard', { flagged: stats.flagged_pending || 0, reports: stats.reports_pending || 0 });

    dashboardEl.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon blue">👥</div>
          <div class="stat-body">
            <div class="stat-value">${stats.total_users.toLocaleString()}</div>
            <div class="stat-label">Total Users</div>
            <div class="stat-sub">+${stats.new_users_today} today</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">📦</div>
          <div class="stat-body">
            <div class="stat-value">${stats.active_listings.toLocaleString()}</div>
            <div class="stat-label">Active Listings</div>
            <div class="stat-sub">+${stats.new_listings_today} today</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon yellow">🚩</div>
          <div class="stat-body">
            <div class="stat-value">${stats.flagged_pending}</div>
            <div class="stat-label">Flagged Pending</div>
            ${stats.flagged_pending > 0 ? `<div class="stat-sub" style="color:#ef4444;">Needs review</div>` : '<div class="stat-sub">All clear ✅</div>'}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon red">📋</div>
          <div class="stat-body">
            <div class="stat-value">${stats.reports_pending}</div>
            <div class="stat-label">Pending Reports</div>
            ${stats.reports_pending > 0 ? `<div class="stat-sub" style="color:#ef4444;">Needs review</div>` : '<div class="stat-sub">All clear ✅</div>'}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon purple">📊</div>
          <div class="stat-body">
            <div class="stat-value">${stats.total_listings.toLocaleString()}</div>
            <div class="stat-label">Total Listings</div>
          </div>
        </div>
      </div>

      <div class="recent-grid">
        <div class="admin-card">
          <div class="admin-card-header"><h2>🕐 Recent Listings</h2></div>
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead><tr><th>Title</th><th>Seller</th><th>Status</th><th>Posted</th></tr></thead>
              <tbody>
                ${recent_listings.map(l => `
                  <tr>
                    <td><a href="/pages/listing.html?id=${l.id}" target="_blank" style="color:#3b82f6;text-decoration:none;">${l.title}</a></td>
                    <td>${l.seller}</td>
                    <td><span class="tag tag-${l.status}">${l.status}</span>${l.is_flagged ? ' <span class="tag tag-flagged">flagged</span>' : ''}</td>
                    <td>${timeAgo(l.created_at)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="admin-card">
          <div class="admin-card-header"><h2>👥 Recent Users</h2></div>
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead><tr><th>Username</th><th>Role</th><th>Joined</th></tr></thead>
              <tbody>
                ${recent_users.map(u => `
                  <tr>
                    <td><strong>${u.username}</strong><br/><small style="color:#94a3b8;">${u.email}</small></td>
                    <td><span class="tag tag-${u.role}">${u.role}</span></td>
                    <td>${timeAgo(u.created_at)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }).catch(err => {
    dashboardEl.innerHTML = `<p style="color:#ef4444">Failed to load dashboard: ${err.message}</p>`;
  });
}

// ─────────────────────────────────────────────────────────────
// PAGE: LISTINGS (listings.html)
// ─────────────────────────────────────────────────────────────
const adminListingsEl = document.getElementById('admin-listings-table');
if (adminListingsEl) {
  renderSidebar('listings');
  let currentPage = 1;

  const load = async () => {
    const search    = document.getElementById('al-search').value.trim();
    const status    = document.getElementById('al-status').value;
    const flagged   = document.getElementById('al-flagged').value;
    const qs        = new URLSearchParams({ search, status, is_flagged: flagged, page: currentPage, limit: 25 });

    try {
      const data = await adminFetch(`${API}/listings?${qs}`);

      document.getElementById('al-count').textContent = `${data.pagination.total} listings`;

      if (!data.listings.length) {
        adminListingsEl.innerHTML = `<tr><td colspan="7"><div class="admin-empty"><div class="e-icon">📦</div><p>No listings found.</p></div></td></tr>`;
        document.getElementById('al-pagination').innerHTML = '';
        return;
      }

      adminListingsEl.innerHTML = data.listings.map(l => `
        <tr>
          <td><a href="/pages/listing.html?id=${l.id}" target="_blank" style="color:#3b82f6;text-decoration:none;font-weight:600;">${l.title}</a>
            ${l.is_flagged ? '<br/><span class="tag tag-flagged" style="font-size:0.68rem;">⚠ flagged</span>' : ''}
          </td>
          <td>${l.seller}</td>
          <td>${l.category || '—'}</td>
          <td>${l.price ? formatPrice(l.price) : '—'}</td>
          <td><span class="tag tag-${l.status}">${l.status}</span></td>
          <td>${timeAgo(l.created_at)}</td>
          <td>
            <div class="action-btns">
              ${l.status !== 'active' ? `<button class="btn-sm btn-sm-success" onclick="adminSetListingStatus(${l.id},'active')">Activate</button>` : ''}
              ${l.status !== 'removed' ? `<button class="btn-sm btn-sm-danger" onclick="adminRemoveListing(${l.id})">Remove</button>` : ''}
              <button class="btn-sm btn-sm-danger" style="background:#7f1d1d;" onclick="adminDeleteListing(${l.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('');

      renderPagination('al-pagination', data.pagination, (p) => { currentPage = p; load(); });
    } catch (err) {
      adminListingsEl.innerHTML = `<tr><td colspan="7" style="color:#ef4444;padding:1rem;">Error: ${err.message}</td></tr>`;
    }
  };

  window.adminSetListingStatus = (id, status) => {
    adminFetch(`${API}/listings/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) })
      .then(() => { toast(`Listing set to ${status}`); load(); })
      .catch(err => toast(err.message, 'error'));
  };

  window.adminRemoveListing = (id) => {
    showModal({
      title: 'Remove this listing?',
      placeholder: 'Reason for removal (optional)',
      confirmLabel: 'Remove',
      confirmClass: 'btn-sm-danger',
      onConfirm: (note) => {
        adminFetch(`${API}/listings/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'removed', notes: note }) })
          .then(() => { toast('Listing removed.'); load(); })
          .catch(err => toast(err.message, 'error'));
      },
    });
  };

  window.adminDeleteListing = (id) => {
    if (!confirm('Permanently delete this listing? This cannot be undone.')) return;
    adminFetch(`${API}/listings/${id}`, { method: 'DELETE' })
      .then(() => { toast('Listing permanently deleted.'); load(); })
      .catch(err => toast(err.message, 'error'));
  };

  document.getElementById('al-search-btn').onclick = () => { currentPage = 1; load(); };
  document.getElementById('al-search').addEventListener('keydown', e => { if (e.key === 'Enter') { currentPage = 1; load(); }});
  document.getElementById('al-status').onchange  = () => { currentPage = 1; load(); };
  document.getElementById('al-flagged').onchange = () => { currentPage = 1; load(); };
  load();
}

// ─────────────────────────────────────────────────────────────
// PAGE: FLAGGED QUEUE (flagged.html)
// ─────────────────────────────────────────────────────────────
const flaggedGridEl = document.getElementById('flagged-grid');
if (flaggedGridEl) {
  renderSidebar('flagged');
  let currentPage = 1;

  const load = async () => {
    try {
      const data = await adminFetch(`${API}/flagged?page=${currentPage}&limit=12`);
      document.getElementById('flagged-count').textContent = `${data.pagination.total} pending`;

      if (!data.flagged.length) {
        flaggedGridEl.innerHTML = `<div class="admin-empty" style="grid-column:1/-1"><div class="e-icon">✅</div><p>No flagged listings pending review. All clear!</p></div>`;
        document.getElementById('flagged-pagination').innerHTML = '';
        return;
      }

      flaggedGridEl.innerHTML = data.flagged.map(f => `
        <div class="flagged-card" id="flag-${f.flag_id}">
          <div class="tag tag-flagged" style="margin-bottom:0.5rem;">${f.flag_type.toUpperCase()}</div>
          <h4><a href="/pages/listing.html?id=${f.listing_id}" target="_blank" style="color:#0f172a;text-decoration:none;">${f.title}</a></h4>
          <div class="fc-meta">by <strong>${f.seller}</strong> · ${timeAgo(f.flagged_at)} · ${f.price ? formatPrice(f.price) : 'No price'}</div>
          <div class="fc-reason">⚠ ${f.flag_reason}</div>
          <div class="fc-actions">
            <button class="btn-sm btn-sm-success" onclick="resolveFlag(${f.flag_id}, 'approve')">✅ Approve</button>
            <button class="btn-sm btn-sm-danger" onclick="resolveFlag(${f.flag_id}, 'remove')">🗑 Remove</button>
          </div>
        </div>`).join('');

      renderPagination('flagged-pagination', data.pagination, (p) => { currentPage = p; load(); });
    } catch (err) {
      flaggedGridEl.innerHTML = `<p style="color:#ef4444;padding:1rem;">Error: ${err.message}</p>`;
    }
  };

  window.resolveFlag = (flagId, action) => {
    const label = action === 'approve' ? 'Approve & clear flag' : 'Remove listing';
    showModal({
      title: `${label}?`,
      placeholder: 'Admin note (optional)',
      confirmLabel: label,
      confirmClass: action === 'approve' ? 'btn-sm-success' : 'btn-sm-danger',
      onConfirm: (note) => {
        adminFetch(`${API}/flagged/${flagId}/resolve`, { method: 'PUT', body: JSON.stringify({ action, notes: note }) })
          .then(() => { toast(action === 'approve' ? 'Listing approved!' : 'Listing removed.'); document.getElementById(`flag-${flagId}`)?.remove(); })
          .catch(err => toast(err.message, 'error'));
      },
    });
  };

  load();
}

// ─────────────────────────────────────────────────────────────
// PAGE: USERS (users.html)
// ─────────────────────────────────────────────────────────────
const adminUsersEl = document.getElementById('admin-users-table');
if (adminUsersEl) {
  renderSidebar('users');
  let currentPage = 1;

  const load = async () => {
    const search   = document.getElementById('au-search').value.trim();
    const role     = document.getElementById('au-role').value;
    const is_banned = document.getElementById('au-banned').value;
    const qs       = new URLSearchParams({ search, role, is_banned, page: currentPage, limit: 25 });

    try {
      const data = await adminFetch(`${API}/users?${qs}`);
      document.getElementById('au-count').textContent = `${data.pagination.total} users`;

      if (!data.users.length) {
        adminUsersEl.innerHTML = `<tr><td colspan="7"><div class="admin-empty"><div class="e-icon">👥</div><p>No users found.</p></div></td></tr>`;
        return;
      }

      adminUsersEl.innerHTML = data.users.map(u => `
        <tr>
          <td>
            <strong>${u.username}</strong>
            ${u.is_banned ? '<span class="tag tag-banned" style="margin-left:0.4rem;font-size:0.65rem;">BANNED</span>' : ''}
            <br/><small style="color:#94a3b8;">${u.email}</small>
          </td>
          <td>${u.full_name || '—'}</td>
          <td><span class="tag tag-${u.role}">${u.role}</span></td>
          <td>${u.listing_count}</td>
          <td>${u.location || '—'}</td>
          <td>${timeAgo(u.created_at)}</td>
          <td>
            <div class="action-btns">
              ${!u.is_banned
                ? `<button class="btn-sm btn-sm-danger" onclick="banUser(${u.id})">Ban</button>`
                : `<button class="btn-sm btn-sm-success" onclick="unbanUser(${u.id})">Unban</button>`}
              <select class="btn-sm btn-sm-secondary" onchange="changeRole(${u.id}, this.value)" style="cursor:pointer;">
                <option value="">Role…</option>
                <option value="user" ${u.role==='user'?'selected':''}>User</option>
                <option value="moderator" ${u.role==='moderator'?'selected':''}>Moderator</option>
                <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
              </select>
            </div>
          </td>
        </tr>`).join('');

      renderPagination('au-pagination', data.pagination, (p) => { currentPage = p; load(); });
    } catch (err) {
      adminUsersEl.innerHTML = `<tr><td colspan="7" style="color:#ef4444;padding:1rem;">Error: ${err.message}</td></tr>`;
    }
  };

  window.banUser = (id) => {
    showModal({
      title: 'Ban this user?',
      placeholder: 'Reason for ban (required)',
      confirmLabel: 'Ban User',
      confirmClass: 'btn-sm-danger',
      onConfirm: (note) => {
        adminFetch(`${API}/users/${id}/ban`, { method: 'PUT', body: JSON.stringify({ ban: true, reason: note }) })
          .then(() => { toast('User banned.'); load(); })
          .catch(err => toast(err.message, 'error'));
      },
    });
  };

  window.unbanUser = (id) => {
    if (!confirm('Unban this user?')) return;
    adminFetch(`${API}/users/${id}/ban`, { method: 'PUT', body: JSON.stringify({ ban: false }) })
      .then(() => { toast('User unbanned.'); load(); })
      .catch(err => toast(err.message, 'error'));
  };

  window.changeRole = (id, role) => {
    if (!role) return;
    if (!confirm(`Change this user's role to "${role}"?`)) return;
    adminFetch(`${API}/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) })
      .then(() => { toast(`Role updated to ${role}`); load(); })
      .catch(err => toast(err.message, 'error'));
  };

  document.getElementById('au-search-btn').onclick = () => { currentPage = 1; load(); };
  document.getElementById('au-search').addEventListener('keydown', e => { if (e.key === 'Enter') { currentPage = 1; load(); }});
  document.getElementById('au-role').onchange   = () => { currentPage = 1; load(); };
  document.getElementById('au-banned').onchange = () => { currentPage = 1; load(); };
  load();
}

// ─────────────────────────────────────────────────────────────
// PAGE: REPORTS (reports.html)
// ─────────────────────────────────────────────────────────────
const adminReportsEl = document.getElementById('admin-reports-table');
if (adminReportsEl) {
  renderSidebar('reports');
  let currentPage = 1;

  const load = async () => {
    const status = document.getElementById('ar-status').value;
    const qs     = new URLSearchParams({ status, page: currentPage, limit: 25 });

    try {
      const data = await adminFetch(`${API}/reports?${qs}`);
      document.getElementById('ar-count').textContent = `${data.pagination.total} reports`;

      if (!data.reports.length) {
        adminReportsEl.innerHTML = `<tr><td colspan="6"><div class="admin-empty"><div class="e-icon">📋</div><p>No reports found.</p></div></td></tr>`;
        return;
      }

      adminReportsEl.innerHTML = data.reports.map(r => `
        <tr>
          <td><strong>${r.reason}</strong>${r.description ? `<br/><small style="color:#64748b;">${r.description.slice(0,80)}…</small>` : ''}</td>
          <td>${r.reporter}</td>
          <td>${r.listing_title ? `<a href="/pages/listing.html?id=${r.listing_id}" target="_blank" style="color:#3b82f6;">${r.listing_title}</a>` : r.reported_user || '—'}</td>
          <td><span class="tag tag-${r.status}">${r.status}</span></td>
          <td>${timeAgo(r.created_at)}</td>
          <td>
            <div class="action-btns">
              ${r.status === 'pending' ? `
                <button class="btn-sm btn-sm-primary" onclick="updateReport(${r.id},'reviewed')">Mark Reviewed</button>
                <button class="btn-sm btn-sm-success" onclick="updateReport(${r.id},'resolved')">Resolve</button>
                <button class="btn-sm btn-sm-secondary" onclick="updateReport(${r.id},'dismissed')">Dismiss</button>
              ` : `<span style="color:#94a3b8;font-size:0.8rem;">${r.status}</span>`}
            </div>
          </td>
        </tr>`).join('');

      renderPagination('ar-pagination', data.pagination, (p) => { currentPage = p; load(); });
    } catch (err) {
      adminReportsEl.innerHTML = `<tr><td colspan="6" style="color:#ef4444;padding:1rem;">Error: ${err.message}</td></tr>`;
    }
  };

  window.updateReport = (id, status) => {
    adminFetch(`${API}/reports/${id}`, { method: 'PUT', body: JSON.stringify({ status }) })
      .then(() => { toast(`Report marked as ${status}.`); load(); })
      .catch(err => toast(err.message, 'error'));
  };

  document.getElementById('ar-status').onchange = () => { currentPage = 1; load(); };
  load();
}
