const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const pool     = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { moderateListing } = require('../middleware/moderation');

// ─── Multer Setup (Image Uploads) ────────────────────────────
const uploadDir = path.join(__dirname, '../uploads/listings');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname).toLowerCase());
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, png, gif, webp) are allowed.'));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per image
  fileFilter,
});

// ─── GET /api/categories ─────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categories WHERE is_active = TRUE ORDER BY name ASC'
    );
    return res.json({ categories: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch categories.' });
  }
});

// ─── GET /api/listings ───────────────────────────────────────
// Browse listings with search, filter, pagination
router.get('/', async (req, res) => {
  const {
    search      = '',
    category    = '',
    condition   = '',
    min_price   = '',
    max_price   = '',
    community_id = '',
    sort        = 'newest',
    page        = 1,
    limit       = 20,
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const conditions = [`l.status = 'active'`];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(l.title ILIKE $${params.length} OR l.description ILIKE $${params.length})`);
  }
  if (category) {
    params.push(category);
    conditions.push(`c.slug = $${params.length}`);
  }
  if (condition) {
    params.push(condition);
    conditions.push(`l.condition = $${params.length}`);
  }
  if (min_price !== '') {
    params.push(parseFloat(min_price));
    conditions.push(`l.price >= $${params.length}`);
  }
  if (max_price !== '') {
    params.push(parseFloat(max_price));
    conditions.push(`l.price <= $${params.length}`);
  }
  if (community_id) {
    params.push(parseInt(community_id));
    conditions.push(`l.community_id = $${params.length}`);
  }

  const whereClause = conditions.join(' AND ');

  const sortMap = {
    newest:     'l.created_at DESC',
    oldest:     'l.created_at ASC',
    price_asc:  'l.price ASC',
    price_desc: 'l.price DESC',
    popular:    'l.view_count DESC',
  };
  const orderBy = sortMap[sort] || 'l.created_at DESC';

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM listings l
       LEFT JOIN categories c ON l.category_id = c.id
       WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit));
    params.push(offset);

    const result = await pool.query(
      `SELECT
         l.id, l.title, l.price, l.is_negotiable, l.condition, l.location,
         l.status, l.view_count, l.created_at, l.allow_offers,
         c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
         u.id AS seller_id, u.username AS seller_username,
         u.profile_photo AS seller_photo, u.location AS seller_location,
         (SELECT image_url FROM listing_images li WHERE li.listing_id = l.id AND li.is_primary = TRUE LIMIT 1) AS primary_image,
         (SELECT image_url FROM listing_images li WHERE li.listing_id = l.id ORDER BY sort_order ASC LIMIT 1) AS fallback_image
       FROM listings l
       LEFT JOIN categories c ON l.category_id = c.id
       LEFT JOIN users u ON l.user_id = u.id
       WHERE ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      listings: result.rows,
      pagination: {
        total,
        page:       parseInt(page),
        limit:      parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('Browse listings error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch listings.' });
  }
});

// ─── GET /api/listings/saved ─────────────────────────────────
router.get('/saved', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         l.id, l.title, l.price, l.condition, l.location, l.status, l.created_at,
         c.name AS category_name, c.icon AS category_icon,
         u.username AS seller_username,
         (SELECT image_url FROM listing_images li WHERE li.listing_id = l.id ORDER BY sort_order ASC LIMIT 1) AS primary_image,
         sl.created_at AS saved_at
       FROM saved_listings sl
       JOIN listings l ON sl.listing_id = l.id
       LEFT JOIN categories c ON l.category_id = c.id
       LEFT JOIN users u ON l.user_id = u.id
       WHERE sl.user_id = $1
       ORDER BY sl.created_at DESC`,
      [req.user.id]
    );
    return res.json({ listings: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch saved listings.' });
  }
});

// ─── GET /api/listings/mine ──────────────────────────────────
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         l.id, l.title, l.price, l.condition, l.location, l.status,
         l.view_count, l.is_flagged, l.created_at,
         c.name AS category_name, c.icon AS category_icon,
         (SELECT image_url FROM listing_images li WHERE li.listing_id = l.id ORDER BY sort_order ASC LIMIT 1) AS primary_image
       FROM listings l
       LEFT JOIN categories c ON l.category_id = c.id
       WHERE l.user_id = $1
       ORDER BY l.created_at DESC`,
      [req.user.id]
    );
    return res.json({ listings: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch your listings.' });
  }
});

// ─── GET /api/listings/:id ───────────────────────────────────
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT
         l.*,
         c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
         u.id AS seller_id, u.username AS seller_username, u.full_name AS seller_name,
         u.profile_photo AS seller_photo, u.location AS seller_location,
         u.created_at AS seller_since,
         COALESCE(
           (SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE reviewee_id = u.id), 0
         ) AS seller_rating,
         (SELECT COUNT(*) FROM reviews WHERE reviewee_id = u.id) AS seller_review_count,
         (SELECT COUNT(*) FROM listings WHERE user_id = u.id AND status = 'active') AS seller_active_listings
       FROM listings l
       LEFT JOIN categories c ON l.category_id = c.id
       LEFT JOIN users u ON l.user_id = u.id
       WHERE l.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    const listing = result.rows[0];

    // Fetch images
    const images = await pool.query(
      'SELECT * FROM listing_images WHERE listing_id = $1 ORDER BY sort_order ASC',
      [id]
    );
    listing.images = images.rows;

    // Increment view count (fire and forget)
    pool.query('UPDATE listings SET view_count = view_count + 1 WHERE id = $1', [id]).catch(() => {});

    return res.json({ listing });
  } catch (err) {
    console.error('Get listing error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch listing.' });
  }
});

// ─── POST /api/listings ──────────────────────────────────────
router.post('/', requireAuth, upload.array('images', 5), async (req, res) => {
  const {
    title, description, price, is_negotiable,
    condition, location, category_id, community_id, allow_offers,
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Listing title is required.' });
  }

  const parsedPrice = price !== '' && price !== undefined ? parseFloat(price) : null;

  // ── Auto-Moderation ──
  const { flags, blocked } = await moderateListing(
    { user_id: req.user.id, title, description, price: parsedPrice },
    pool
  );

  if (blocked.length > 0) {
    // Delete uploaded files since listing is blocked
    if (req.files) req.files.forEach(f => fs.unlink(f.path, () => {}));
    return res.status(422).json({
      error: blocked[0].reason,
      blocked: true,
      violations: blocked,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert listing
    const listingResult = await client.query(
      `INSERT INTO listings
         (user_id, category_id, community_id, title, description, price,
          is_negotiable, condition, location, allow_offers, is_flagged, flag_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        req.user.id,
        category_id   || null,
        community_id  || null,
        title.trim(),
        description   || null,
        parsedPrice,
        is_negotiable === 'true' || is_negotiable === true,
        condition     || 'good',
        location      || null,
        allow_offers !== 'false' && allow_offers !== false,
        flags.length > 0,
        flags.length > 0 ? flags.map(f => f.reason).join('; ') : null,
      ]
    );

    const listing = listingResult.rows[0];

    // Insert images
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const imageUrl = `/uploads/listings/${file.filename}`;
        await client.query(
          `INSERT INTO listing_images (listing_id, image_url, is_primary, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [listing.id, imageUrl, i === 0, i]
        );
      }
    }

    // Save flag records
    if (flags.length > 0) {
      for (const flag of flags) {
        await client.query(
          `INSERT INTO flagged_listings (listing_id, flag_type, flag_reason)
           VALUES ($1, $2, $3)`,
          [listing.id, flag.type, flag.reason]
        );
      }
    }

    await client.query('COMMIT');

    return res.status(201).json({
      message: flags.length > 0
        ? 'Listing posted but flagged for review. It is visible but our team will review it shortly.'
        : 'Listing posted successfully!',
      listing,
      flagged: flags.length > 0,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (req.files) req.files.forEach(f => fs.unlink(f.path, () => {}));
    console.error('Create listing error:', err.message);
    return res.status(500).json({ error: 'Failed to create listing.' });
  } finally {
    client.release();
  }
});

// ─── PUT /api/listings/:id ───────────────────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { title, description, price, is_negotiable, condition, location, allow_offers } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM listings WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });

    const listing = existing.rows[0];
    if (listing.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only edit your own listings.' });
    }

    const result = await pool.query(
      `UPDATE listings SET
         title         = COALESCE($1, title),
         description   = COALESCE($2, description),
         price         = COALESCE($3, price),
         is_negotiable = COALESCE($4, is_negotiable),
         condition     = COALESCE($5, condition),
         location      = COALESCE($6, location),
         allow_offers  = COALESCE($7, allow_offers),
         updated_at    = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        title       || null,
        description || null,
        price !== undefined ? parseFloat(price) : null,
        is_negotiable !== undefined ? is_negotiable === 'true' || is_negotiable === true : null,
        condition   || null,
        location    || null,
        allow_offers !== undefined ? allow_offers !== 'false' && allow_offers !== false : null,
        id,
      ]
    );

    return res.json({ message: 'Listing updated!', listing: result.rows[0] });
  } catch (err) {
    console.error('Update listing error:', err.message);
    return res.status(500).json({ error: 'Failed to update listing.' });
  }
});

// ─── PUT /api/listings/:id/status ────────────────────────────
router.put('/:id/status', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowed = ['active', 'sold', 'reserved', 'removed'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${allowed.join(', ')}` });
  }

  try {
    const existing = await pool.query('SELECT user_id FROM listings WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    if (existing.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    await pool.query(
      'UPDATE listings SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id]
    );

    return res.json({ message: `Listing marked as ${status}.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update status.' });
  }
});

// ─── DELETE /api/listings/:id ────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await pool.query('SELECT user_id FROM listings WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    if (existing.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own listings.' });
    }

    // Delete images from disk
    const images = await pool.query('SELECT image_url FROM listing_images WHERE listing_id = $1', [id]);
    images.rows.forEach(img => {
      const filePath = path.join(__dirname, '../..', img.image_url);
      fs.unlink(filePath, () => {});
    });

    await pool.query('DELETE FROM listings WHERE id = $1', [id]);
    return res.json({ message: 'Listing deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete listing.' });
  }
});

// ─── POST /api/listings/:id/save ─────────────────────────────
router.post('/:id/save', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await pool.query(
      'SELECT id FROM saved_listings WHERE user_id = $1 AND listing_id = $2',
      [req.user.id, id]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        'DELETE FROM saved_listings WHERE user_id = $1 AND listing_id = $2',
        [req.user.id, id]
      );
      return res.json({ saved: false, message: 'Listing removed from saved.' });
    } else {
      await pool.query(
        'INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2)',
        [req.user.id, id]
      );
      return res.json({ saved: true, message: 'Listing saved!' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save listing.' });
  }
});

module.exports = router;
