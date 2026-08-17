const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(requireAuth, requireAdmin);

// ─── Helper: Log Admin Action ────────────────────────────────
const logAction = (admin_id, action, target_type, target_id, notes) => {
  pool.query(
    `INSERT INTO admin_logs (admin_id, action, target_type, target_id, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [admin_id, action, target_type || null, target_id || null, notes || null]
  ).catch(() => {});
};

// ════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const [
      usersResult,
      listingsResult,
      activeListingsResult,
      flaggedResult,
      reportsResult,
      newUsersResult,
      newListingsResult,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM listings'),
      pool.query("SELECT COUNT(*) FROM listings WHERE status = 'active'"),
      pool.query('SELECT COUNT(*) FROM flagged_listings WHERE is_resolved = FALSE'),
      pool.query("SELECT COUNT(*) FROM reports WHERE status = 'pending'"),
      pool.query("SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '24 hours'"),
      pool.query("SELECT COUNT(*) FROM listings WHERE created_at >= NOW() - INTERVAL '24 hours'"),
    ]);

    // Recent activity
    const recentListings = await pool.query(
      `SELECT l.id, l.title, l.status, l.is_flagged, l.created_at,
              u.username AS seller
       FROM listings l
       JOIN users u ON l.user_id = u.id
       ORDER BY l.created_at DESC LIMIT 5`
    );

    const recentUsers = await pool.query(
      `SELECT id, username, email, role, created_at
       FROM users ORDER BY created_at DESC LIMIT 5`
    );

    return res.json({
      stats: {
        total_users:       parseInt(usersResult.rows[0].count),
        total_listings:    parseInt(listingsResult.rows[0].count),
        active_listings:   parseInt(activeListingsResult.rows[0].count),
        flagged_pending:   parseInt(flaggedResult.rows[0].count),
        reports_pending:   parseInt(reportsResult.rows[0].count),
        new_users_today:   parseInt(newUsersResult.rows[0].count),
        new_listings_today:parseInt(newListingsResult.rows[0].count),
      },
      recent_listings: recentListings.rows,
      recent_users:    recentUsers.rows,
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    return res.status(500).json({ error: 'Failed to load dashboard.' });
  }
});

// ════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ════════════════════════════════════════════════════════════

// GET /api/admin/users
router.get('/users', async (req, res) => {
  const { search = '', role = '', is_banned = '', page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const conditions = ['1=1'];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(username ILIKE $${params.length} OR email ILIKE $${params.length} OR full_name ILIKE $${params.length})`);
  }
  if (role) {
    params.push(role);
    conditions.push(`role = $${params.length}`);
  }
  if (is_banned !== '') {
    params.push(is_banned === 'true');
    conditions.push(`is_banned = $${params.length}`);
  }

  const where = conditions.join(' AND ');

  try {
    const countResult = await pool.query(`SELECT COUNT(*) FROM users WHERE ${where}`, params);
    const total       = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT id, username, email, full_name, phone, location, role,
              is_verified, is_banned, ban_reason, created_at,
              (SELECT COUNT(*) FROM listings WHERE user_id = users.id) AS listing_count
       FROM users WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      users: result.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// GET /api/admin/users/:id
router.get('/users/:id', async (req, res) => {
  try {
    const user = await pool.query(
      `SELECT u.*, 
              (SELECT COUNT(*) FROM listings WHERE user_id = u.id) AS listing_count,
              (SELECT COUNT(*) FROM reviews WHERE reviewee_id = u.id) AS review_count,
              (SELECT ROUND(AVG(rating)::numeric,1) FROM reviews WHERE reviewee_id = u.id) AS avg_rating
       FROM users u WHERE u.id = $1`,
      [req.params.id]
    );
    if (!user.rows.length) return res.status(404).json({ error: 'User not found.' });

    const listings = await pool.query(
      `SELECT id, title, status, price, is_flagged, created_at
       FROM listings WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [req.params.id]
    );

    return res.json({ user: user.rows[0], listings: listings.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// PUT /api/admin/users/:id/ban
router.put('/users/:id/ban', async (req, res) => {
  const { id }       = req.params;
  const { ban, reason } = req.body;

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'You cannot ban yourself.' });
  }

  try {
    await pool.query(
      `UPDATE users SET is_banned = $1, ban_reason = $2, updated_at = NOW() WHERE id = $3`,
      [!!ban, ban ? (reason || 'Violation of community guidelines.') : null, id]
    );

    const action = ban ? 'BAN_USER' : 'UNBAN_USER';
    logAction(req.user.id, action, 'user', id, reason || null);

    return res.json({ message: ban ? `User banned.` : `User unbanned.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update user.' });
  }
});

// PUT /api/admin/users/:id/role
router.put('/users/:id/role', async (req, res) => {
  const { id }   = req.params;
  const { role } = req.body;

  const allowed = ['user', 'moderator', 'admin'];
  if (!allowed.includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if (parseInt(id) === req.user.id) return res.status(400).json({ error: 'Cannot change your own role.' });

  try {
    await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, id]);
    logAction(req.user.id, 'CHANGE_ROLE', 'user', id, `Role set to ${role}`);
    return res.json({ message: `User role updated to ${role}.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update role.' });
  }
});

// ════════════════════════════════════════════════════════════
// LISTINGS MANAGEMENT
// ════════════════════════════════════════════════════════════

// GET /api/admin/listings
router.get('/listings', async (req, res) => {
  const { search = '', status = '', is_flagged = '', page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const conditions = ['1=1'];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(l.title ILIKE $${params.length} OR u.username ILIKE $${params.length})`);
  }
  if (status) {
    params.push(status);
    conditions.push(`l.status = $${params.length}`);
  }
  if (is_flagged !== '') {
    params.push(is_flagged === 'true');
    conditions.push(`l.is_flagged = $${params.length}`);
  }

  const where = conditions.join(' AND ');

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM listings l JOIN users u ON l.user_id = u.id WHERE ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT l.id, l.title, l.price, l.status, l.is_flagged, l.flag_reason,
              l.view_count, l.created_at,
              u.id AS user_id, u.username AS seller,
              c.name AS category
       FROM listings l
       JOIN users u ON l.user_id = u.id
       LEFT JOIN categories c ON l.category_id = c.id
       WHERE ${where}
       ORDER BY l.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      listings: result.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch listings.' });
  }
});

// PUT /api/admin/listings/:id/status
router.put('/listings/:id/status', async (req, res) => {
  const { id }     = req.params;
  const { status, notes } = req.body;
  const allowed = ['active', 'removed', 'sold', 'reserved', 'flagged'];

  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  try {
    await pool.query(
      'UPDATE listings SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id]
    );
    logAction(req.user.id, 'UPDATE_LISTING_STATUS', 'listing', id, notes || `Status → ${status}`);
    return res.json({ message: `Listing status updated to ${status}.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update listing.' });
  }
});

// DELETE /api/admin/listings/:id
router.delete('/listings/:id', async (req, res) => {
  const { id }   = req.params;
  const { notes } = req.body || {};
  try {
    await pool.query('DELETE FROM listings WHERE id = $1', [id]);
    logAction(req.user.id, 'DELETE_LISTING', 'listing', id, notes || 'Admin deleted listing');
    return res.json({ message: 'Listing permanently deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete listing.' });
  }
});

// ════════════════════════════════════════════════════════════
// FLAGGED LISTINGS QUEUE
// ════════════════════════════════════════════════════════════

// GET /api/admin/flagged
router.get('/flagged', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const countResult = await pool.query('SELECT COUNT(*) FROM flagged_listings WHERE is_resolved = FALSE');
    const total       = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT fl.id AS flag_id, fl.flag_type, fl.flag_reason, fl.created_at AS flagged_at,
              l.id AS listing_id, l.title, l.status, l.price, l.description,
              u.id AS user_id, u.username AS seller, u.email AS seller_email
       FROM flagged_listings fl
       JOIN listings l ON fl.listing_id = l.id
       JOIN users u ON l.user_id = u.id
       WHERE fl.is_resolved = FALSE
       ORDER BY fl.created_at ASC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), offset]
    );

    return res.json({
      flagged: result.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch flagged listings.' });
  }
});

// PUT /api/admin/flagged/:flagId/resolve
router.put('/flagged/:flagId/resolve', async (req, res) => {
  const { flagId }  = req.params;
  const { action, notes } = req.body; // action: 'approve' | 'remove'

  if (!['approve', 'remove'].includes(action)) {
    return res.status(400).json({ error: 'Action must be "approve" or "remove".' });
  }

  try {
    // Get listing ID from flag
    const flagResult = await pool.query('SELECT listing_id FROM flagged_listings WHERE id = $1', [flagId]);
    if (!flagResult.rows.length) return res.status(404).json({ error: 'Flag not found.' });

    const listingId = flagResult.rows[0].listing_id;

    // Resolve the flag
    await pool.query(
      `UPDATE flagged_listings
       SET is_resolved = TRUE, resolved_by = $1, resolved_at = NOW()
       WHERE id = $2`,
      [req.user.id, flagId]
    );

    // If removing, update listing status
    if (action === 'remove') {
      await pool.query(
        "UPDATE listings SET status = 'removed', is_flagged = TRUE, updated_at = NOW() WHERE id = $1",
        [listingId]
      );
    } else {
      // Approve: clear flag on listing
      await pool.query(
        "UPDATE listings SET is_flagged = FALSE, flag_reason = NULL, updated_at = NOW() WHERE id = $1",
        [listingId]
      );
    }

    logAction(req.user.id, action === 'approve' ? 'APPROVE_FLAGGED' : 'REMOVE_FLAGGED', 'listing', listingId, notes || null);

    return res.json({ message: action === 'approve' ? 'Listing approved and flag cleared.' : 'Listing removed.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resolve flag.' });
  }
});

// ════════════════════════════════════════════════════════════
// REPORTS
// ════════════════════════════════════════════════════════════

// GET /api/admin/reports
router.get('/reports', async (req, res) => {
  const { status = '', page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const conditions = ['1=1'];

  if (status) {
    params.push(status);
    conditions.push(`r.status = $${params.length}`);
  }

  const where = conditions.join(' AND ');

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM reports r WHERE ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT r.id, r.reason, r.description, r.status, r.created_at,
              reporter.username AS reporter,
              l.id AS listing_id, l.title AS listing_title, l.status AS listing_status,
              ru.username AS reported_user
       FROM reports r
       JOIN users reporter ON r.reporter_id = reporter.id
       LEFT JOIN listings l ON r.listing_id = l.id
       LEFT JOIN users ru ON r.reported_user_id = ru.id
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      reports: result.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch reports.' });
  }
});

// PUT /api/admin/reports/:id
router.put('/reports/:id', async (req, res) => {
  const { id }     = req.params;
  const { status } = req.body;
  const allowed    = ['reviewed', 'resolved', 'dismissed'];

  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  try {
    await pool.query('UPDATE reports SET status = $1 WHERE id = $2', [status, id]);
    logAction(req.user.id, 'UPDATE_REPORT', 'report', id, `Status → ${status}`);
    return res.json({ message: `Report marked as ${status}.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update report.' });
  }
});

// ════════════════════════════════════════════════════════════
// ACTIVITY LOG
// ════════════════════════════════════════════════════════════

// GET /api/admin/logs
router.get('/logs', async (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const countResult = await pool.query('SELECT COUNT(*) FROM admin_logs');
    const total       = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT al.*, u.username AS admin_username
       FROM admin_logs al
       JOIN users u ON al.admin_id = u.id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), offset]
    );

    return res.json({
      logs: result.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch logs.' });
  }
});

// ════════════════════════════════════════════════════════════
// CATEGORIES MANAGEMENT
// ════════════════════════════════════════════════════════════

// POST /api/admin/categories
router.post('/categories', async (req, res) => {
  const { name, slug, icon, description } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Name and slug are required.' });

  try {
    const result = await pool.query(
      'INSERT INTO categories (name, slug, icon, description) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, slug, icon || null, description || null]
    );
    logAction(req.user.id, 'ADD_CATEGORY', 'category', result.rows[0].id, name);
    return res.status(201).json({ category: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Slug already exists.' });
    return res.status(500).json({ error: 'Failed to add category.' });
  }
});

// PUT /api/admin/categories/:id
router.put('/categories/:id', async (req, res) => {
  const { name, icon, description, is_active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE categories SET
         name        = COALESCE($1, name),
         icon        = COALESCE($2, icon),
         description = COALESCE($3, description),
         is_active   = COALESCE($4, is_active)
       WHERE id = $5 RETURNING *`,
      [name || null, icon || null, description || null, is_active !== undefined ? is_active : null, req.params.id]
    );
    logAction(req.user.id, 'EDIT_CATEGORY', 'category', req.params.id, name || '');
    return res.json({ category: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update category.' });
  }
});

module.exports = router;
