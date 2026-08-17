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
  if (nav) {
    nav.innerHTML = `
      <span class="nav-greeting">Hi, <strong>${user.username}</strong>!</span>
      <a href="/pages/post-listing.html" class="btn btn-primary">+ Post Item</a>
      <button onclick="logout()" class="btn btn-outline">Log Out</button>
    `;
  }
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
