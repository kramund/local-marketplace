const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// ─── GET /api/reviews/user/:userId ──────────────────────────
// Public — get all reviews for a user
router.get('/user/:userId', async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const countRes = await pool.query(
      'SELECT COUNT(*) FROM reviews WHERE reviewee_id = $1',
      [req.params.userId]
    );
    const total = parseInt(countRes.rows[0].count);

    const result = await pool.query(
      `SELECT r.*,
              reviewer.username     AS reviewer_username,
              reviewer.profile_photo AS reviewer_photo,
              l.id    AS listing_id,
              l.title AS listing_title
       FROM reviews r
       JOIN users reviewer ON r.reviewer_id = reviewer.id
       LEFT JOIN listings l ON r.listing_id = l.id
       WHERE r.reviewee_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.userId, parseInt(limit), offset]
    );

    const statsRes = await pool.query(
      `SELECT
         COUNT(*) AS total,
         ROUND(AVG(rating)::numeric, 1) AS average,
         COUNT(*) FILTER (WHERE rating = 5) AS five_star,
         COUNT(*) FILTER (WHERE rating = 4) AS four_star,
         COUNT(*) FILTER (WHERE rating = 3) AS three_star,
         COUNT(*) FILTER (WHERE rating = 2) AS two_star,
         COUNT(*) FILTER (WHERE rating = 1) AS one_star
       FROM reviews WHERE reviewee_id = $1`,
      [req.params.userId]
    );

    return res.json({
      reviews:    result.rows,
      stats:      statsRes.rows[0],
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    console.error('Get reviews error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch reviews.' });
  }
});

// ─── GET /api/reviews/profile/:userId ───────────────────────
// Public — get full user profile (info + listings + review stats)
router.get('/profile/:userId', async (req, res) => {
  try {
    const userRes = await pool.query(
      `SELECT
         u.id, u.username, u.full_name, u.profile_photo, u.bio,
         u.location, u.role, u.is_verified, u.created_at,
         COALESCE((SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE reviewee_id = u.id), 0) AS avg_rating,
         (SELECT COUNT(*) FROM reviews  WHERE reviewee_id = u.id)                  AS review_count,
         (SELECT COUNT(*) FROM listings WHERE user_id = u.id AND status = 'active') AS active_listings,
         (SELECT COUNT(*) FROM listings WHERE user_id = u.id)                      AS total_listings
       FROM users u
       WHERE u.id = $1 AND u.is_banned = FALSE`,
      [req.params.userId]
    );

    if (!userRes.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Active listings (preview)
    const listingsRes = await pool.query(
      `SELECT l.id, l.title, l.price, l.condition, l.location, l.created_at,
              c.name AS category_name, c.icon AS category_icon,
              (SELECT image_url FROM listing_images li WHERE li.listing_id = l.id ORDER BY sort_order ASC LIMIT 1) AS primary_image
       FROM listings l
       LEFT JOIN categories c ON l.category_id = c.id
       WHERE l.user_id = $1 AND l.status = 'active'
       ORDER BY l.created_at DESC LIMIT 6`,
      [req.params.userId]
    );

    return res.json({
      user:     userRes.rows[0],
      listings: listingsRes.rows,
    });
  } catch (err) {
    console.error('Get profile error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

// ─── GET /api/reviews/eligibility ───────────────────────────
// Auth — check if current user can review someone for a listing
router.get('/eligibility', requireAuth, async (req, res) => {
  const { reviewee_id, listing_id } = req.query;

  if (!reviewee_id || !listing_id) {
    return res.status(400).json({ error: 'reviewee_id and listing_id are required.' });
  }

  try {
    // Check for accepted offer between the two users on this listing
    const offerRes = await pool.query(
      `SELECT id FROM offers
       WHERE listing_id = $1
         AND status = 'accepted'
         AND (
           (buyer_id = $2 AND seller_id = $3) OR
           (buyer_id = $3 AND seller_id = $2)
         )`,
      [listing_id, req.user.id, reviewee_id]
    );

    if (!offerRes.rows.length) {
      return res.json({ can_review: false, reason: 'No completed transaction found.' });
    }

    // Check if already reviewed
    const existingRes = await pool.query(
      'SELECT id FROM reviews WHERE reviewer_id = $1 AND reviewee_id = $2 AND listing_id = $3',
      [req.user.id, reviewee_id, listing_id]
    );

    if (existingRes.rows.length > 0) {
      return res.json({ can_review: false, reason: 'You have already reviewed this user for this listing.' });
    }

    return res.json({ can_review: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to check eligibility.' });
  }
});

// ─── POST /api/reviews ───────────────────────────────────────
// Auth — submit a review
router.post('/', requireAuth, async (req, res) => {
  const { reviewee_id, listing_id, rating, comment } = req.body;

  if (!reviewee_id || !listing_id || !rating) {
    return res.status(400).json({ error: 'Reviewee, listing, and rating are required.' });
  }

  const parsedRating = parseInt(rating);
  if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
  }

  if (parseInt(reviewee_id) === req.user.id) {
    return res.status(400).json({ error: 'You cannot review yourself.' });
  }

  try {
    // Verify completed transaction
    const offerRes = await pool.query(
      `SELECT id FROM offers
       WHERE listing_id = $1
         AND status = 'accepted'
         AND (
           (buyer_id = $2 AND seller_id = $3) OR
           (buyer_id = $3 AND seller_id = $2)
         )`,
      [listing_id, req.user.id, reviewee_id]
    );

    if (!offerRes.rows.length) {
      return res.status(403).json({ error: 'You can only review users you\'ve completed a transaction with.' });
    }

    // Check for duplicate
    const dupRes = await pool.query(
      'SELECT id FROM reviews WHERE reviewer_id = $1 AND reviewee_id = $2 AND listing_id = $3',
      [req.user.id, reviewee_id, listing_id]
    );

    if (dupRes.rows.length > 0) {
      return res.status(409).json({ error: 'You have already reviewed this user for this transaction.' });
    }

    const result = await pool.query(
      `INSERT INTO reviews (reviewer_id, reviewee_id, listing_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, parseInt(reviewee_id), parseInt(listing_id), parsedRating, comment?.trim() || null]
    );

    return res.status(201).json({
      message: 'Review submitted successfully!',
      review:  result.rows[0],
    });
  } catch (err) {
    console.error('Submit review error:', err.message);
    return res.status(500).json({ error: 'Failed to submit review.' });
  }
});

// ─── GET /api/reviews/me ─────────────────────────────────────
// Auth — get my received reviews
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*,
              reviewer.username AS reviewer_username,
              reviewer.profile_photo AS reviewer_photo,
              l.id AS listing_id, l.title AS listing_title
       FROM reviews r
       JOIN users reviewer ON r.reviewer_id = reviewer.id
       LEFT JOIN listings l ON r.listing_id = l.id
       WHERE r.reviewee_id = $1
       ORDER BY r.created_at DESC LIMIT 20`,
      [req.user.id]
    );
    return res.json({ reviews: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch your reviews.' });
  }
});

module.exports = router;
