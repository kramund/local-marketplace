// ─────────────────────────────────────────────────────────────
// LISTINGS.JS — Browse, Detail, Post
// ─────────────────────────────────────────────────────────────

const API = '/api';
const getToken = () => localStorage.getItem('lm_token');
const getUser  = () => JSON.parse(localStorage.getItem('lm_user') || 'null');
const isLoggedIn = () => !!getToken();

const authHeaders = () => ({
  'Authorization': `Bearer ${getToken()}`,
});

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

const conditionLabel = {
  new: 'New', like_new: 'Like New', good: 'Good', fair: 'Fair', poor: 'Poor'
};

// ─────────────────────────────────────────────────────────────
// BROWSE PAGE (listings.html)
// ─────────────────────────────────────────────────────────────
const listingsGrid = document.getElementById('listings-grid');
if (listingsGrid) {
  let currentPage = 1;

  // Load categories into filter dropdown
  const loadCategories = async () => {
    try {
      const res  = await fetch(`${API}/listings/categories`);
      const data = await res.json();
      const sel  = document.getElementById('filter-category');
      data.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.slug;
        opt.textContent = `${cat.icon} ${cat.name}`;
        sel.appendChild(opt);
      });
    } catch (_) {}
  };

  // Read URL params (for shared links / back navigation)
  const getParams = () => {
    const p = new URLSearchParams(window.location.search);
    return {
      search:    p.get('search')    || '',
      category:  p.get('category')  || '',
      condition: p.get('condition') || '',
      min_price: p.get('min_price') || '',
      max_price: p.get('max_price') || '',
      sort:      p.get('sort')      || 'newest',
      page:      parseInt(p.get('page')) || 1,
    };
  };

  const loadListings = async (params) => {
    const qs = new URLSearchParams(params).toString();
    listingsGrid.innerHTML = '<p style="color:#9ca3af;padding:2rem;">Loading...</p>';

    try {
      const res  = await fetch(`${API}/listings?${qs}`);
      const data = await res.json();

      const { listings, pagination } = data;

      document.getElementById('listings-count').textContent =
        `${pagination.total} listing${pagination.total !== 1 ? 's' : ''} found`;

      if (!listings || listings.length === 0) {
        listingsGrid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1">
            <div class="empty-icon">🔍</div>
            <h3>No listings found</h3>
            <p>Try adjusting your filters or search terms.</p>
          </div>`;
        document.getElementById('pagination').innerHTML = '';
        return;
      }

      listingsGrid.innerHTML = listings.map(l => {
        const img = l.primary_image || l.fallback_image;
        const imgHtml = img
          ? `<img src="${img}" alt="${l.title}" loading="lazy"/>`
          : `<span>📦</span>`;

        return `
          <a class="listing-card" href="/pages/listing.html?id=${l.id}">
            <div class="card-image">${imgHtml}</div>
            <div class="card-body">
              <div class="card-title">${l.title}</div>
              <div class="card-price ${parseFloat(l.price) === 0 ? 'free' : ''}">${formatPrice(l.price)}</div>
              <div class="card-meta">
                ${l.condition ? `<span class="badge badge-condition">${conditionLabel[l.condition] || l.condition}</span>` : ''}
                ${l.is_negotiable ? `<span class="badge badge-negotiable">Nego</span>` : ''}
                ${l.category_icon ? `<span title="${l.category_name}">${l.category_icon}</span>` : ''}
              </div>
              ${l.location ? `<div class="card-location">📍 ${l.location}</div>` : ''}
              <div class="card-location" style="margin-top:0.25rem;">🕐 ${timeAgo(l.created_at)}</div>
            </div>
          </a>`;
      }).join('');

      // Pagination
      renderPagination(pagination);
    } catch (err) {
      listingsGrid.innerHTML = '<p style="color:#ef4444;padding:2rem;">Failed to load listings. Please try again.</p>';
    }
  };

  const renderPagination = ({ page, totalPages }) => {
    const el = document.getElementById('pagination');
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    let html = '';
    if (page > 1) html += `<button class="page-btn" onclick="goToPage(${page - 1})">← Prev</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
        html += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
      } else if (i === page - 3 || i === page + 3) {
        html += `<span style="padding:0.5rem;">…</span>`;
      }
    }
    if (page < totalPages) html += `<button class="page-btn" onclick="goToPage(${page + 1})">Next →</button>`;
    el.innerHTML = html;
  };

  window.goToPage = (page) => {
    currentPage = page;
    applyFilters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.applyFilters = () => {
    const params = {
      search:    document.getElementById('search-input').value.trim(),
      category:  document.getElementById('filter-category').value,
      condition: document.getElementById('filter-condition').value,
      min_price: document.getElementById('filter-min-price').value,
      max_price: document.getElementById('filter-max-price').value,
      sort:      document.getElementById('sort-select').value,
      page:      currentPage,
    };
    // Remove empty
    Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
    history.replaceState(null, '', '?' + new URLSearchParams(params).toString());
    loadListings(params);
  };

  window.resetFilters = () => {
    document.getElementById('search-input').value    = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-condition').value = '';
    document.getElementById('filter-min-price').value = '';
    document.getElementById('filter-max-price').value = '';
    document.getElementById('sort-select').value = 'newest';
    currentPage = 1;
    applyFilters();
  };

  // Allow Enter key on search
  document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyFilters();
  });

  // Init
  const initParams = getParams();
  document.getElementById('search-input').value     = initParams.search;
  document.getElementById('filter-condition').value = initParams.condition;
  document.getElementById('filter-min-price').value = initParams.min_price;
  document.getElementById('filter-max-price').value = initParams.max_price;
  document.getElementById('sort-select').value      = initParams.sort;
  currentPage = initParams.page;

  loadCategories().then(() => {
    if (initParams.category) document.getElementById('filter-category').value = initParams.category;
    loadListings(initParams);
  });
}

// ─────────────────────────────────────────────────────────────
// LISTING DETAIL PAGE (listing.html)
// ─────────────────────────────────────────────────────────────
const listingDetail = document.getElementById('listing-detail');
if (listingDetail) {
  const params = new URLSearchParams(window.location.search);
  const id     = params.get('id');

  if (!id) {
    listingDetail.innerHTML = '<p style="color:#ef4444;padding:2rem;grid-column:1/-1">Listing not found.</p>';
  } else {
    let savedState = false;

    const loadListing = async () => {
      try {
        const res  = await fetch(`${API}/listings/${id}`);
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        const l    = data.listing;

        document.title = `${l.title} — Local Marketplace`;

        // Check if saved
        if (isLoggedIn()) {
          try {
            const savedRes  = await fetch(`${API}/listings/saved`, { headers: authHeaders() });
            const savedData = await savedRes.json();
            savedState = savedData.listings.some(s => s.id === l.id);
          } catch (_) {}
        }

        // Images
        const images = l.images || [];
        let galleryHtml = '';
        if (images.length > 0) {
          galleryHtml = `
            <div class="gallery-main" id="gallery-main">
              <img src="${images[0].image_url}" alt="${l.title}" id="gallery-main-img"/>
            </div>
            ${images.length > 1 ? `
            <div class="gallery-thumbs">
              ${images.map((img, i) => `
                <div class="gallery-thumb ${i === 0 ? 'active' : ''}" onclick="setGalleryImage('${img.image_url}', this)">
                  <img src="${img.image_url}" alt="Photo ${i+1}"/>
                </div>`).join('')}
            </div>` : ''}`;
        } else {
          galleryHtml = `<div class="gallery-main">📦</div>`;
        }

        // Seller initials
        const initials = (l.seller_name || l.seller_username || '?').charAt(0).toUpperCase();
        const avatarHtml = l.seller_photo
          ? `<img src="${l.seller_photo}" alt="${l.seller_username}"/>`
          : initials;

        // Stars
        const rating   = parseFloat(l.seller_rating) || 0;
        const stars    = '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
        const ratingTxt = rating > 0
          ? `${stars} ${rating} (${l.seller_review_count} review${l.seller_review_count !== '1' ? 's' : ''})`
          : 'No reviews yet';

        const currentUser = getUser();
        const isOwner     = currentUser && currentUser.id === l.seller_id;

        listingDetail.innerHTML = `
          <!-- Left: Gallery + Info -->
          <div>
            ${galleryHtml}
            <div class="listing-info">
              <div class="listing-title-row">
                <h1 class="listing-title">${l.title}</h1>
              </div>
              <div class="listing-price-row">
                <div class="listing-price">${formatPrice(l.price)}</div>
                <div class="listing-badges">
                  ${l.condition ? `<span class="badge badge-condition">${conditionLabel[l.condition] || l.condition}</span>` : ''}
                  ${l.is_negotiable ? `<span class="badge badge-negotiable">Negotiable</span>` : ''}
                  ${l.status !== 'active' ? `<span class="badge" style="background:#fee2e2;color:#b91c1c">${l.status.toUpperCase()}</span>` : ''}
                </div>
              </div>

              <div class="listing-meta-grid">
                ${l.category_name ? `<div class="meta-item"><label>Category</label><span>${l.category_icon || ''} ${l.category_name}</span></div>` : ''}
                ${l.location ? `<div class="meta-item"><label>Location</label><span>📍 ${l.location}</span></div>` : ''}
                <div class="meta-item"><label>Posted</label><span>${timeAgo(l.created_at)}</span></div>
                <div class="meta-item"><label>Views</label><span>👁 ${l.view_count}</span></div>
              </div>

              ${l.description ? `<div class="listing-description">${l.description.replace(/\n/g, '<br/>')}</div>` : ''}
            </div>
          </div>

          <!-- Right: Seller Card -->
          <div>
            <div class="seller-card">
              <h3>Seller</h3>
              <div class="seller-info">
                <div class="seller-avatar">${avatarHtml}</div>
                <div>
                  <div class="seller-name">${l.seller_name || l.seller_username}</div>
                  ${l.seller_location ? `<div class="seller-location">📍 ${l.seller_location}</div>` : ''}
                  <div class="seller-rating">${ratingTxt}</div>
                </div>
              </div>

              <div class="seller-stats">
                <div class="stat-item">
                  <div class="stat-value">${l.seller_active_listings}</div>
                  <div class="stat-label">Active Listings</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value">${new Date(l.seller_since).getFullYear()}</div>
                  <div class="stat-label">Member Since</div>
                </div>
              </div>

              <div class="seller-actions">
                ${isOwner ? `
                  <button class="btn-action btn-action-secondary" onclick="window.location='/pages/post-listing.html?edit=${l.id}'">✏️ Edit Listing</button>
                  <button class="btn-action btn-action-secondary" onclick="markSold(${l.id})">✅ Mark as Sold</button>
                  <button class="btn-action" style="background:#fef2f2;color:#b91c1c;" onclick="deleteListing(${l.id})">🗑️ Delete Listing</button>
                ` : `
                  ${isLoggedIn() ? `
                    <button class="btn-action btn-action-primary" onclick="openMessageModal(${l.id}, '${l.seller_username}')">💬 Message Seller</button>
                    ${l.allow_offers ? `<button class="btn-action btn-action-secondary" onclick="alert('💰 Offers coming soon!')">💰 Make an Offer</button>` : ''}
                    <button class="btn-action btn-action-save ${savedState ? 'saved' : ''}" id="save-btn" onclick="toggleSave(${l.id})">
                      ${savedState ? '❤️ Saved' : '🤍 Save Listing'}
                    </button>
                  ` : `
                    <a href="/pages/login.html" class="btn-action btn-action-primary" style="text-align:center;display:block;">Log In to Contact Seller</a>
                  `}
                `}
              </div>
            </div>
          </div>`;
      } catch (err) {
        listingDetail.innerHTML = `<p style="color:#ef4444;padding:2rem;grid-column:1/-1">Listing not found or has been removed.</p>`;
      }
    };

    window.setGalleryImage = (src, el) => {
      document.getElementById('gallery-main-img').src = src;
      document.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
      el.classList.add('active');
    };

    window.toggleSave = async (id) => {
      if (!isLoggedIn()) { window.location.href = '/pages/login.html'; return; }
      try {
        const res  = await fetch(`${API}/listings/${id}/save`, { method: 'POST', headers: authHeaders() });
        const data = await res.json();
        savedState = data.saved;
        const btn  = document.getElementById('save-btn');
        btn.textContent = savedState ? '❤️ Saved' : '🤍 Save Listing';
        btn.classList.toggle('saved', savedState);
      } catch (_) {}
    };

    window.markSold = async (id) => {
      if (!confirm('Mark this listing as sold?')) return;
      try {
        await fetch(`${API}/listings/${id}/status`, {
          method: 'PUT',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'sold' }),
        });
        alert('Listing marked as sold!');
        window.location.href = '/pages/listings.html';
      } catch (_) { alert('Something went wrong.'); }
    };

    window.deleteListing = async (id) => {
      if (!confirm('Are you sure you want to delete this listing? This cannot be undone.')) return;
      try {
        await fetch(`${API}/listings/${id}`, { method: 'DELETE', headers: authHeaders() });
        alert('Listing deleted.');
        window.location.href = '/pages/listings.html';
      } catch (_) { alert('Something went wrong.'); }
    };

    loadListing();
  }
}

// ─────────────────────────────────────────────────────────────
// POST LISTING PAGE (post-listing.html)
// ─────────────────────────────────────────────────────────────
const postForm = document.getElementById('post-form');
if (postForm) {
  // Redirect if not logged in
  if (!isLoggedIn()) window.location.href = '/pages/login.html';

  // Load categories
  fetch(`${API}/listings/categories`)
    .then(r => r.json())
    .then(data => {
      const sel = document.getElementById('category_id');
      data.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = `${cat.icon} ${cat.name}`;
        sel.appendChild(opt);
      });
    }).catch(() => {});

  // Image previews
  const imagesInput = document.getElementById('images');
  const previews    = document.getElementById('image-previews');
  let selectedFiles = [];

  imagesInput.addEventListener('change', () => {
    const files = Array.from(imagesInput.files);
    if (selectedFiles.length + files.length > 5) {
      alert('You can upload a maximum of 5 photos.');
      return;
    }
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      selectedFiles.push(file);
      const reader  = new FileReader();
      reader.onload = (e) => {
        const div = document.createElement('div');
        div.className = 'preview-thumb';
        div.innerHTML = `
          <img src="${e.target.result}" alt="Preview"/>
          <button type="button" class="remove-img" onclick="removeImage(this, '${file.name}')">✕</button>`;
        previews.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
    imagesInput.value = '';
  });

  window.removeImage = (btn, name) => {
    selectedFiles = selectedFiles.filter(f => f.name !== name);
    btn.closest('.preview-thumb').remove();
  };

  // Submit
  postForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const errEl     = document.getElementById('post-error');
    const successEl = document.getElementById('post-success');
    const submitBtn = document.getElementById('post-submit');

    errEl.style.display     = 'none';
    successEl.style.display = 'none';
    submitBtn.disabled      = true;
    submitBtn.textContent   = 'Posting...';

    const formData = new FormData();
    formData.append('title',          document.getElementById('title').value.trim());
    formData.append('description',    document.getElementById('description').value.trim());
    formData.append('price',          document.getElementById('price').value);
    formData.append('category_id',    document.getElementById('category_id').value);
    formData.append('condition',      document.getElementById('condition').value);
    formData.append('location',       document.getElementById('location').value.trim());
    formData.append('is_negotiable',  document.getElementById('is_negotiable').checked);
    formData.append('allow_offers',   document.getElementById('allow_offers').checked);

    selectedFiles.forEach(file => formData.append('images', file));

    try {
      const res  = await fetch(`${API}/listings`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        errEl.textContent   = data.error || 'Failed to post listing.';
        errEl.style.display = 'block';
        return;
      }

      successEl.textContent   = `✅ ${data.message}`;
      successEl.style.display = 'block';
      postForm.reset();
      selectedFiles = [];
      previews.innerHTML = '';

      setTimeout(() => window.location.href = `/pages/listing.html?id=${data.listing.id}`, 1500);
    } catch {
      errEl.textContent   = 'Something went wrong. Please try again.';
      errEl.style.display = 'block';
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Post Listing';
    }
  });
}
