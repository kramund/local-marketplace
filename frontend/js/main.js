// ─── Session Helpers ─────────────────────────────────────────
const getToken = () => localStorage.getItem('lm_token');
const getUser  = () => JSON.parse(localStorage.getItem('lm_user') || 'null');
const isLoggedIn = () => !!getToken();

const logout = () => {
  localStorage.removeItem('lm_token');
  localStorage.removeItem('lm_user');
  window.location.href = '/';
};

// ─── Render Nav ──────────────────────────────────────────────
const nav = document.getElementById('main-nav');
const heroActions = document.getElementById('hero-actions');

if (isLoggedIn()) {
  const user = getUser();

  // Fetch unread message count + pending offer count for badges
  Promise.allSettled([
    fetch('/api/messages/unread-count', { headers: { 'Authorization': `Bearer ${getToken()}` } }).then(r => r.json()),
    fetch('/api/offers/pending-count',  { headers: { 'Authorization': `Bearer ${getToken()}` } }).then(r => r.json()),
  ]).then(([msgResult, offerResult]) => {
    const msgCount   = msgResult.status   === 'fulfilled' ? msgResult.value.count   : 0;
    const offerCount = offerResult.status === 'fulfilled' ? offerResult.value.count : 0;
    const msgBadge   = msgCount   > 0 ? `<span class="nav-unread">${msgCount}</span>`   : '';
    const offerBadge = offerCount > 0 ? `<span class="nav-unread">${offerCount}</span>` : '';
    if (nav) {
      nav.innerHTML = `
        <span class="nav-greeting">Hi, <strong>${user.username}</strong>!</span>
        <a href="/pages/messages.html" class="btn btn-outline" style="position:relative;">💬 Messages${msgBadge}</a>
        <a href="/pages/offers.html"   class="btn btn-outline" style="position:relative;">💰 Offers${offerBadge}</a>
        <a href="/pages/saved.html"    class="btn btn-outline">🔖 Saved</a>
        <a href="/pages/profile.html?id=${user.id}" class="btn btn-outline">👤 Profile</a>
        <a href="/pages/post-listing.html" class="btn btn-primary">+ Post Item</a>
        <button onclick="logout()" class="btn btn-outline">Log Out</button>
      `;
    }
  });

  if (heroActions) {
    heroActions.innerHTML = `
      <a href="/pages/listings.html" class="btn btn-primary">Browse Listings</a>
      <a href="/pages/post-listing.html" class="btn btn-outline">+ Post an Item</a>
    `;
  }
} else {
  if (nav) {
    nav.innerHTML = `
      <a href="/pages/login.html" class="btn btn-outline">Log In</a>
      <a href="/pages/register.html" class="btn btn-primary">Sign Up</a>
    `;
  }
  if (heroActions) {
    heroActions.innerHTML = `
      <a href="/pages/register.html" class="btn btn-primary">Get Started — It's Free</a>
      <a href="/pages/login.html" class="btn btn-outline">Log In</a>
    `;
  }
}
