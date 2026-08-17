const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ─── Helper: get offer with full details ─────────────────────
const getOffer = async (offerId) => {
  const result = await pool.query(
    `SELECT o.*,
            l.title AS listing_title, l.price AS listing_price, l.status AS listing_status,
            l.user_id AS listing_owner_id,
            (SELECT image_url FROM listing_images li WHERE li.listing_id = l.id ORDER BY sort_order ASC LIMIT 1) AS listing_image,
            buyer.id  AS buyer_id,  buyer.username  AS buyer_username,
            seller.id AS seller_id, seller.username AS seller_username
     FROM offers o
     JOIN listings l ON o.listing_id = l.id
     JOIN users buyer  ON o.buyer_id  = buyer.id
     JOIN users seller ON o.seller_id = seller.id
     WHERE o.id = $1`,
    [offerId]
  );
  return result.rows[0] || null;
};

// ─── POST /api/offers ────────────────────────────────────────
// Buyer makes an offer on a listing
router.post('/', async (req, res) => {
  const { listing_id, amount, message } = req.body;

  if (!listing_id || !amount) {
    return res.status(400).json({ error: 'Listing ID and offer amount are required.' });
  }
  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Offer amount must be a positive number.' });
  }

  try {
    // Get listing info
    const listingRes = await pool.query(
      'SELECT id, user_id, title, price, status, allow_offers FROM listings WHERE id = $1',
      [listing_id]
    );

    if (!listingRes.rows.length) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    const listing = listingRes.rows[0];

    if (listing.user_id === req.user.id) {
      return res.status(400).json({ error: 'You cannot make an offer on your own listing.' });
    }
    if (listing.status !== 'active') {
      return res.status(400).json({ error: `This listing is no longer available (${listing.status}).` });
    }
    if (!listing.allow_offers) {
      return res.status(400).json({ error: 'This seller is not accepting offers.' });
    }

    // Check for existing pending offer from this buyer
    const existing = await pool.query(
      `SELECT id FROM offers WHERE listing_id = $1 AND buyer_id = $2 AND status = 'pending'`,
      [listing_id, req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'You already have a pending offer on this listing. Withdraw it first to make a new one.' });
    }

    const result = await pool.query(
      `INSERT INTO offers (listing_id, buyer_id, seller_id, amount, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [listing_id, req.user.id, listing.user_id, parseFloat(amount), message?.trim() || null]
    );

    return res.status(201).json({
      message: 'Offer sent successfully!',
      offer: result.rows[0],
    });
  } catch (err) {
    console.error('Make offer error:', err.message);
    return res.status(500).json({ error: 'Failed to send offer.' });
  }
});

// ─── GET /api/offers/received ────────────────────────────────
// Seller sees offers made on their listings
router.get('/received', async (req, res) => {
  const { status = '', page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [req.user.id];
  const conditions = ['o.seller_id = $1'];

  if (status) {
    params.push(status);
    conditions.push(`o.status = $${params.length}`);
  }

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM offers o WHERE ${conditions.join(' AND ')}`, params
    );
    const total = parseInt(countRes.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT o.*,
              l.title AS listing_title, l.price AS listing_price,
              (SELECT image_url FROM listing_images li WHERE li.listing_id = l.id ORDER BY sort_order ASC LIMIT 1) AS listing_image,
              buyer.username AS buyer_username, buyer.profile_photo AS buyer_photo,
              buyer.location AS buyer_location
       FROM offers o
       JOIN listings l ON o.listing_id = l.id
       JOIN users buyer ON o.buyer_id = buyer.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY o.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      offers: result.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch received offers.' });
  }
});

// ─── GET /api/offers/sent ────────────────────────────────────
// Buyer sees offers they've made
router.get('/sent', async (req, res) => {
  const { status = '', page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [req.user.id];
  const conditions = ['o.buyer_id = $1'];

  if (status) {
    params.push(status);
    conditions.push(`o.status = $${params.length}`);
  }

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM offers o WHERE ${conditions.join(' AND ')}`, params
    );
    const total = parseInt(countRes.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT o.*,
              l.title AS listing_title, l.price AS listing_price, l.status AS listing_status,
              (SELECT image_url FROM listing_images li WHERE li.listing_id = l.id ORDER BY sort_order ASC LIMIT 1) AS listing_image,
              seller.username AS seller_username, seller.profile_photo AS seller_photo
       FROM offers o
       JOIN listings l ON o.listing_id = l.id
       JOIN users seller ON o.seller_id = seller.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY o.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      offers: result.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch sent offers.' });
  }
});

// ─── PUT /api/offers/:id/accept ──────────────────────────────
router.put('/:id/accept', async (req, res) => {
  try {
    const offer = await getOffer(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });

    // Seller accepts original offer, or buyer accepts counter
    const isSeller = offer.seller_id === req.user.id;
    const isBuyer  = offer.buyer_id  === req.user.id;

    if (!isSeller && !isBuyer) return res.status(403).json({ error: 'Not authorized.' });
    if (isSeller && offer.status !== 'pending')   return res.status(400).json({ error: 'Only pending offers can be accepted.' });
    if (isBuyer  && offer.status !== 'countered') return res.status(400).json({ error: 'You can only accept a counter-offer.' });

    await pool.query(
      `UPDATE offers SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
      [offer.id]
    );

    // Mark listing as reserved
    await pool.query(
      `UPDATE listings SET status = 'reserved', updated_at = NOW() WHERE id = $1`,
      [offer.listing_id]
    );

    // Decline all other pending offers on same listing
    await pool.query(
      `UPDATE offers SET status = 'declined', updated_at = NOW()
       WHERE listing_id = $1 AND id != $2 AND status IN ('pending','countered')`,
      [offer.listing_id, offer.id]
    );

    return res.json({ message: 'Offer accepted! The listing has been marked as reserved.' });
  } catch (err) {
    console.error('Accept offer error:', err.message);
    return res.status(500).json({ error: 'Failed to accept offer.' });
  }
});

// ─── PUT /api/offers/:id/decline ─────────────────────────────
router.put('/:id/decline', async (req, res) => {
  try {
    const offer = await getOffer(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });

    if (offer.seller_id !== req.user.id) return res.status(403).json({ error: 'Only the seller can decline an offer.' });
    if (!['pending', 'countered'].includes(offer.status)) {
      return res.status(400).json({ error: `Cannot decline an offer with status: ${offer.status}` });
    }

    await pool.query(
      `UPDATE offers SET status = 'declined', updated_at = NOW() WHERE id = $1`,
      [offer.id]
    );

    return res.json({ message: 'Offer declined.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to decline offer.' });
  }
});

// ─── PUT /api/offers/:id/counter ─────────────────────────────
router.put('/:id/counter', async (req, res) => {
  const { counter_amount, message } = req.body;

  if (!counter_amount || isNaN(parseFloat(counter_amount)) || parseFloat(counter_amount) <= 0) {
    return res.status(400).json({ error: 'A valid counter-offer amount is required.' });
  }

  try {
    const offer = await getOffer(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });
    if (offer.seller_id !== req.user.id) return res.status(403).json({ error: 'Only the seller can counter an offer.' });
    if (offer.status !== 'pending') return res.status(400).json({ error: 'Can only counter a pending offer.' });

    await pool.query(
      `UPDATE offers
       SET status = 'countered', counter_amount = $1, message = COALESCE($2, message), updated_at = NOW()
       WHERE id = $3`,
      [parseFloat(counter_amount), message?.trim() || null, offer.id]
    );

    return res.json({ message: `Counter-offer of ₱${parseFloat(counter_amount).toLocaleString()} sent to buyer.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send counter-offer.' });
  }
});

// ─── PUT /api/offers/:id/withdraw ────────────────────────────
router.put('/:id/withdraw', async (req, res) => {
  try {
    const offer = await getOffer(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });
    if (offer.buyer_id !== req.user.id) return res.status(403).json({ error: 'Only the buyer can withdraw an offer.' });
    if (!['pending', 'countered'].includes(offer.status)) {
      return res.status(400).json({ error: `Cannot withdraw an offer with status: ${offer.status}` });
    }

    await pool.query(
      `UPDATE offers SET status = 'withdrawn', updated_at = NOW() WHERE id = $1`,
      [offer.id]
    );

    return res.json({ message: 'Offer withdrawn.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to withdraw offer.' });
  }
});

// ─── GET /api/offers/pending-count ───────────────────────────
router.get('/pending-count', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) FROM offers WHERE seller_id = $1 AND status = 'pending'`,
      [req.user.id]
    );
    return res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get pending count.' });
  }
});

module.exports = router;
