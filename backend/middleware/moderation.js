// ─────────────────────────────────────────────────────────────
// AUTO-MODERATION ENGINE — Rule-based listing checker
// ─────────────────────────────────────────────────────────────

const PROHIBITED_KEYWORDS = [
  // Illegal drugs
  'shabu', 'droga', 'marijuana', 'cannabis', 'meth', 'cocaine',
  'heroin', 'ecstasy', 'rugby', 'solvent', 'inhalant',
  // Illegal weapons
  'paltic', 'sumpak', 'homemade gun', 'improvised explosive',
  'illegal firearm', 'unlicensed gun',
  // Scams / fraud
  'double your money', 'guaranteed profit', 'investment scheme',
  'ponzi', 'pyramiding', 'money game', 'easy money',
  // Stolen goods signals
  'no receipt', 'walang resibo', 'hot item', 'stolen',
  // Adult / explicit
  'pornography', 'porn', 'escort', 'sexual service',
];

const SUSPICIOUS_PRICE_THRESHOLD = 1; // Flag if price is below ₱1 (but not free)
const MAX_TITLE_REPEAT_HOURS     = 24; // Flag duplicate title from same user within N hours

// ─── Main Moderation Function ────────────────────────────────
const moderateListing = async ({ user_id, title, description, price }, pool) => {
  const flags   = [];
  const blocked = [];
  const text    = `${title || ''} ${description || ''}`.toLowerCase();

  // 1. Prohibited keyword check
  for (const keyword of PROHIBITED_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      blocked.push({
        type: 'keyword',
        reason: `Your listing contains a prohibited term: "${keyword}". Please review our community guidelines.`,
      });
    }
  }

  // 2. Price sanity check
  if (price !== null && price !== undefined) {
    if (price < 0) {
      blocked.push({ type: 'price', reason: 'Price cannot be negative.' });
    }
    if (price > 0 && price < SUSPICIOUS_PRICE_THRESHOLD) {
      flags.push({ type: 'price', reason: `Suspiciously low price (₱${price}). Flagged for review.` });
    }
  }

  // 3. Empty / very short title check
  if (!title || title.trim().length < 5) {
    blocked.push({ type: 'content', reason: 'Listing title is too short. Please be more descriptive.' });
  }

  // 4. Duplicate listing detection (same user, same title within 24h)
  if (pool && user_id && title) {
    try {
      const result = await pool.query(
        `SELECT id FROM listings
         WHERE user_id = $1
           AND LOWER(title) = LOWER($2)
           AND created_at > NOW() - INTERVAL '${MAX_TITLE_REPEAT_HOURS} hours'
           AND status != 'removed'`,
        [user_id, title.trim()]
      );
      if (result.rows.length > 0) {
        flags.push({
          type: 'duplicate',
          reason: 'A similar listing was posted recently. Flagged for review.',
        });
      }
    } catch (_) {
      // Non-critical, skip
    }
  }

  return { flags, blocked };
};

module.exports = { moderateListing };
