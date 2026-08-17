-- ============================================================
-- LOCAL MARKETPLACE — DATABASE SCHEMA
-- ============================================================

-- ============================================================
-- 1. COMMUNITIES
-- ============================================================
CREATE TABLE IF NOT EXISTS communities (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  description TEXT,
  city        VARCHAR(100),
  province    VARCHAR(100),
  region      VARCHAR(100),
  country     VARCHAR(100) DEFAULT 'Philippines',
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 2. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  community_id   INTEGER REFERENCES communities(id) ON DELETE SET NULL,
  username       VARCHAR(50) UNIQUE NOT NULL,
  email          VARCHAR(150) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  full_name      VARCHAR(150),
  phone          VARCHAR(20),
  profile_photo  VARCHAR(255),
  bio            TEXT,
  location       VARCHAR(150),
  role           VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  is_verified    BOOLEAN DEFAULT FALSE,
  is_banned      BOOLEAN DEFAULT FALSE,
  ban_reason     TEXT,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 3. CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  icon        VARCHAR(10),
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 4. LISTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS listings (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  community_id   INTEGER REFERENCES communities(id) ON DELETE SET NULL,
  title          VARCHAR(200) NOT NULL,
  description    TEXT,
  price          NUMERIC(12, 2),
  is_negotiable  BOOLEAN DEFAULT FALSE,
  condition      VARCHAR(20) DEFAULT 'good' CHECK (condition IN ('new', 'like_new', 'good', 'fair', 'poor')),
  status         VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'sold', 'reserved', 'removed', 'flagged')),
  allow_offers   BOOLEAN DEFAULT TRUE,
  location       VARCHAR(150),
  is_flagged     BOOLEAN DEFAULT FALSE,
  flag_reason    TEXT,
  view_count     INTEGER DEFAULT 0,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 5. LISTING IMAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS listing_images (
  id          SERIAL PRIMARY KEY,
  listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  image_url   VARCHAR(255) NOT NULL,
  is_primary  BOOLEAN DEFAULT FALSE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 6. SAVED LISTINGS (Watchlist)
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_listings (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, listing_id)
);

-- ============================================================
-- 7. CONVERSATIONS & MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id          SERIAL PRIMARY KEY,
  listing_id  INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  buyer_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE (listing_id, buyer_id, seller_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id               SERIAL PRIMARY KEY,
  conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content          TEXT NOT NULL,
  is_read          BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 8. OFFERS / NEGOTIATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS offers (
  id              SERIAL PRIMARY KEY,
  listing_id      INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount          NUMERIC(12, 2) NOT NULL,
  counter_amount  NUMERIC(12, 2),
  status          VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'countered', 'withdrawn')),
  message         TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 9. REVIEWS & RATINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id           SERIAL PRIMARY KEY,
  reviewer_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id   INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMP DEFAULT NOW(),
  UNIQUE (reviewer_id, listing_id)
);

-- ============================================================
-- 10. PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id              SERIAL PRIMARY KEY,
  listing_id      INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  buyer_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount          NUMERIC(12, 2) NOT NULL,
  payment_method  VARCHAR(30) DEFAULT 'in_person' CHECK (payment_method IN ('gcash', 'maya', 'bank_transfer', 'card', 'qr_ph', 'in_person')),
  payment_status  VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
  paymongo_id     VARCHAR(255),
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 11. USER REPORTS (Manual)
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id           SERIAL PRIMARY KEY,
  reporter_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id   INTEGER REFERENCES listings(id) ON DELETE CASCADE,
  reported_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  reason       VARCHAR(100) NOT NULL,
  description  TEXT,
  status       VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 12. FLAGGED LISTINGS (Auto-Moderation)
-- ============================================================
CREATE TABLE IF NOT EXISTS flagged_listings (
  id           SERIAL PRIMARY KEY,
  listing_id   INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  flag_type    VARCHAR(30) NOT NULL CHECK (flag_type IN ('keyword', 'price', 'duplicate', 'category', 'image', 'other')),
  flag_reason  TEXT,
  is_resolved  BOOLEAN DEFAULT FALSE,
  resolved_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 13. ADMIN ACTION LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_logs (
  id           SERIAL PRIMARY KEY,
  admin_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action       VARCHAR(100) NOT NULL,
  target_type  VARCHAR(50),
  target_id    INTEGER,
  notes        TEXT,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES (for performance)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_listings_user_id     ON listings(user_id);
CREATE INDEX IF NOT EXISTS idx_listings_category_id ON listings(category_id);
CREATE INDEX IF NOT EXISTS idx_listings_community_id ON listings(community_id);
CREATE INDEX IF NOT EXISTS idx_listings_status       ON listings(status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_offers_listing        ON offers(listing_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee      ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reports_status        ON reports(status);
CREATE INDEX IF NOT EXISTS idx_flagged_resolved      ON flagged_listings(is_resolved);
