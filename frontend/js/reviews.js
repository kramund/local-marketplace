// ─────────────────────────────────────────────────────────────
// REVIEWS.JS — Ratings, Reviews & User Profiles
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
const stars = (rating, size = '1rem') => {
  const full  = Math.round(parseFloat(rating) || 0);
  const empty = 5 - full;
  return `<span style="color:#f59e0b;font-size:${size};">${'★'.repeat(full)}</span><span style="color:#e2e8f0;font-size:${size};">${'★'.repeat(empty)}</span>`;
};

const timeAgo = (dateStr) => {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatPrice = (price) => {
  if (!price) return 'Free';
  return '₱' + parseFloat(price).toLocaleString('en-PH', { minimumFractionDigits: 2 });
};

const initials = (name) => (name || '?').charAt(0).toUpperCase();

const toast = (msg, type = 'success') => {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;
    background:${type === 'success' ? '#10b981' : '#ef4444'};
    color:white;padding:0.75rem 1.25rem;border-radius:10px;
    font-size:0.9rem;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.15);`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
};

// ─────────────────────────────────────────────────────────────
// PROFILE PAGE
// ─────────────────────────────────────────────────────────────
const profilePage = document.getElementById('profile-page');

if (profilePage) {
  const params    = new URLSearchParams(window.location.search);
  const userId    = params.get('id');
  const currentUser = getUser();

  if (!userId) {
    // Redirect to own profile if logged in
    if (currentUser) window.location.href = `/pages/profile.html?id=${currentUser.id}`;
    else window.location.href = '/pages/login.html';
  } else {
    let reviewPage = 1;

    const loadProfile = async () => {
      try {
        const [profileRes, reviewsRes] = await Promise.all([
          fetch(`${API}/reviews/profile/${userId}`),
          fetch(`${API}/reviews/user/${userId}?page=${reviewPage}&limit=5`),
        ]);

        const profileData = await profileRes.json();
        const reviewsData = await reviewsRes.json();

        if (!profileRes.ok) throw new Error(profileData.error);

        const u     = profileData.user;
        const listings = profileData.listings || [];
        const reviews  = reviewsData.reviews  || [];
        const stats    = reviewsData.stats    || {};
        const pag      = reviewsData.pagination;

        document.title = `${u.username} — Local Marketplace`;

        const isOwnProfile = currentUser && currentUser.id === u.id;
        const avgRating    = parseFloat(u.avg_rating) || 0;
        const totalReviews = parseInt(u.review_count) || 0;
        const memberYear   = new Date(u.created_at).getFullYear();

        // ── Profile Header ──────────────────────────────────
        const headerHtml = `
          <div class="profile-header">
            <div class="profile-avatar">
              ${u.profile_photo ? `<img src="${u.profile_photo}" alt="${u.username}"/>` : initials(u.full_name || u.username)}
            </div>
            <div class="profile-info">
              <div class="profile-name">${u.full_name || u.username}</div>
              <div class="profile-username">@${u.username} ${u.is_verified ? '✅' : ''} ${u.role !== 'user' ? `<span style="background:#fee2e2;color:#b91c1c;border-radius:4px;padding:0.1rem 0.4rem;font-size:0.7rem;font-weight:700;">${u.role.toUpperCase()}</span>` : ''}</div>
              <div class="profile-meta">
                ${u.location ? `<span class="profile-meta-item">📍 ${u.location}</span>` : ''}
                <span class="profile-meta-item">📅 Member since ${memberYear}</span>
                <span class="profile-meta-item">📦 ${u.active_listings} active listing${u.active_listings != 1 ? 's' : ''}</span>
              </div>
              ${u.bio ? `<div class="profile-bio">${u.bio}</div>` : ''}
              ${isOwnProfile ? `<div style="margin-top:0.75rem;"><a href="/pages/post-listing.html" class="btn btn-primary" style="background:#2563eb;color:white;padding:0.5rem 1rem;border-radius:8px;font-size:0.88rem;font-weight:600;text-decoration:none;display:inline-block;">+ Post a Listing</a></div>` : ''}
            </div>
            <div class="profile-stats">
              <div class="profile-stat">
                <div class="profile-rating-big">${avgRating > 0 ? avgRating.toFixed(1) : '—'}</div>
                <div style="color:#f59e0b;font-size:0.9rem;margin:0.2rem 0;">${avgRating > 0 ? stars(avgRating) : ''}</div>
                <div class="profile-stat-label">${totalReviews} Review${totalReviews != 1 ? 's' : ''}</div>
              </div>
              <div class="profile-stat">
                <div class="profile-stat-value">${u.total_listings}</div>
                <div class="profile-stat-label">Total Listings</div>
              </div>
            </div>
          </div>`;

        // ── Active Listings ─────────────────────────────────
        const listingsHtml = `
          <div class="profile-section">
            <div class="profile-section-header">
              <h2>📦 Active Listings (${u.active_listings})</h2>
              ${parseInt(u.active_listings) > 6 ? `<a href="/pages/listings.html?seller=${u.id}" style="font-size:0.85rem;color:#2563eb;text-decoration:none;">View all →</a>` : ''}
            </div>
            <div class="profile-section-body">
              ${listings.length > 0 ? `
                <div class="mini-listings-grid">
                  ${listings.map(l => `
                    <a href="/pages/listing.html?id=${l.id}" class="mini-listing-card">
                      <div class="mini-listing-img">
                        ${l.primary_image ? `<img src="${l.primary_image}" alt="${l.title}"/>` : '📦'}
                      </div>
                      <div class="mini-listing-body">
                        <div class="mini-listing-title">${l.title}</div>
                        <div class="mini-listing-price">${formatPrice(l.price)}</div>
                      </div>
                    </a>`).join('')}
                </div>` :
                `<div class="reviews-empty"><div class="e-icon">📦</div><p>No active listings right now.</p></div>`}
            </div>
          </div>`;

        // ── Reviews ─────────────────────────────────────────
        const ratingBreakdownHtml = totalReviews > 0 ? `
          <div class="rating-breakdown">
            <div class="rating-big-score">
              <div class="rating-number">${avgRating.toFixed(1)}</div>
              <div class="rating-stars-big">${stars(avgRating, '1.3rem')}</div>
              <div class="rating-total">${totalReviews} review${totalReviews != 1 ? 's' : ''}</div>
            </div>
            <div class="rating-bars">
              ${[5,4,3,2,1].map(n => {
                const count = parseInt(stats[`${['','one','two','three','four','five'][n]}_star`]) || 0;
                const pct   = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
                return `
                  <div class="rating-bar-row">
                    <span class="rating-bar-label">${n} ★</span>
                    <div class="rating-bar-track"><div class="rating-bar-fill" style="width:${pct}%"></div></div>
                    <span class="rating-bar-count">${count}</span>
                  </div>`;
              }).join('')}
            </div>
          </div>` : '';

        const reviewsHtml = reviews.length > 0
          ? reviews.map(r => `
            <div class="review-card">
              <div class="review-header">
                <div class="review-avatar">
                  ${r.reviewer_photo ? `<img src="${r.reviewer_photo}" alt="${r.reviewer_username}"/>` : initials(r.reviewer_username)}
                </div>
                <div class="review-meta">
                  <div class="review-author">${r.reviewer_username}</div>
                  <div class="review-date">${timeAgo(r.created_at)}</div>
                </div>
                <div class="review-stars">${stars(r.rating)}</div>
              </div>
              ${r.comment ? `<div class="review-comment">${r.comment}</div>` : ''}
              ${r.listing_id ? `<div class="review-listing-ref">re: <a href="/pages/listing.html?id=${r.listing_id}">${r.listing_title}</a></div>` : ''}
            </div>`).join('')
          : `<div class="reviews-empty"><div class="e-icon">⭐</div><p>No reviews yet.</p></div>`;

        const paginationHtml = pag && pag.totalPages > 1 ? `
          <div class="reviews-pagination">
            ${reviewPage > 1 ? `<button class="rpg-btn" onclick="changeReviewPage(${reviewPage-1})">← Prev</button>` : ''}
            ${Array.from({length: pag.totalPages}, (_,i) => i+1).map(p =>
              `<button class="rpg-btn ${p === reviewPage ? 'active' : ''}" onclick="changeReviewPage(${p})">${p}</button>`
            ).join('')}
            ${reviewPage < pag.totalPages ? `<button class="rpg-btn" onclick="changeReviewPage(${reviewPage+1})">Next →</button>` : ''}
          </div>` : '';

        const reviewSectionHtml = `
          <div class="profile-section">
            <div class="profile-section-header">
              <h2>⭐ Reviews (${totalReviews})</h2>
            </div>
            <div class="profile-section-body">
              ${ratingBreakdownHtml}
              <div id="reviews-list">${reviewsHtml}</div>
              ${paginationHtml}
            </div>
          </div>`;

        profilePage.innerHTML = headerHtml + listingsHtml + reviewSectionHtml;

      } catch (err) {
        profilePage.innerHTML = `<p style="color:#ef4444;text-align:center;padding:3rem;">Failed to load profile: ${err.message}</p>`;
      }
    };

    // Paginate reviews without full reload
    window.changeReviewPage = async (page) => {
      reviewPage = page;
      try {
        const res  = await fetch(`${API}/reviews/user/${userId}?page=${page}&limit=5`);
        const data = await res.json();
        const list = document.getElementById('reviews-list');
        if (list) {
          list.innerHTML = data.reviews.length > 0
            ? data.reviews.map(r => `
                <div class="review-card">
                  <div class="review-header">
                    <div class="review-avatar">${r.reviewer_photo ? `<img src="${r.reviewer_photo}"/>` : initials(r.reviewer_username)}</div>
                    <div class="review-meta">
                      <div class="review-author">${r.reviewer_username}</div>
                      <div class="review-date">${timeAgo(r.created_at)}</div>
                    </div>
                    <div class="review-stars">${stars(r.rating)}</div>
                  </div>
                  ${r.comment ? `<div class="review-comment">${r.comment}</div>` : ''}
                  ${r.listing_id ? `<div class="review-listing-ref">re: <a href="/pages/listing.html?id=${r.listing_id}">${r.listing_title}</a></div>` : ''}
                </div>`).join('')
            : `<div class="reviews-empty"><div class="e-icon">⭐</div><p>No reviews yet.</p></div>`;
          window.scrollTo({ top: list.offsetTop - 80, behavior: 'smooth' });
        }
      } catch (_) {}
    };

    loadProfile();
  }
}

// ─────────────────────────────────────────────────────────────
// REVIEW MODAL — triggered from offers page or listing page
// ─────────────────────────────────────────────────────────────
window.openReviewModal = (revieweeId, revieweeUsername, listingId, listingTitle) => {
  if (!isLoggedIn()) { window.location.href = '/pages/login.html'; return; }

  document.getElementById('review-modal')?.remove();

  const modal = document.createElement('div');
  modal.id    = 'review-modal';
  modal.className = 'review-modal-overlay';
  modal.innerHTML = `
    <div class="review-modal">
      <h3>⭐ Leave a Review</h3>
      <p class="modal-sub">for <strong>${revieweeUsername}</strong> · re: ${listingTitle}</p>

      <div class="form-group">
        <label>Your Rating *</label>
        <div class="star-picker">
          ${[5,4,3,2,1].map(n => `
            <input type="radio" name="star-rating" id="star-${n}" value="${n}"/>
            <label for="star-${n}" title="${n} star${n>1?'s':''}">★</label>`).join('')}
        </div>
      </div>

      <div class="form-group">
        <label>Your Review (optional)</label>
        <textarea id="review-comment" placeholder="Share your experience with this transaction..."></textarea>
      </div>

      <div class="review-modal-error" id="review-error"></div>

      <div class="review-modal-actions">
        <button onclick="document.getElementById('review-modal').remove()"
          style="padding:0.6rem 1.1rem;border-radius:8px;border:1px solid #e5e7eb;background:white;cursor:pointer;font-size:0.9rem;">
          Cancel
        </button>
        <button onclick="submitReview(${revieweeId}, ${listingId})"
          style="padding:0.6rem 1.25rem;border-radius:8px;border:none;background:#f59e0b;color:white;font-weight:700;cursor:pointer;font-size:0.9rem;">
          Submit Review
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);
};

window.submitReview = async (revieweeId, listingId) => {
  const ratingInput = document.querySelector('input[name="star-rating"]:checked');
  const comment     = document.getElementById('review-comment').value.trim();
  const errEl       = document.getElementById('review-error');

  if (!ratingInput) {
    errEl.textContent   = 'Please select a star rating.';
    errEl.style.display = 'block';
    return;
  }

  try {
    const res  = await fetch(`${API}/reviews`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify({ reviewee_id: revieweeId, listing_id: listingId, rating: parseInt(ratingInput.value), comment }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    document.getElementById('review-modal').remove();
    toast('⭐ Review submitted! Thank you.');

    // If on profile page, refresh reviews
    if (document.getElementById('profile-page')) {
      window.changeReviewPage(1);
    }
  } catch (err) {
    errEl.textContent   = err.message;
    errEl.style.display = 'block';
  }
};
