const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// ─── Helpers ────────────────────────────────────────────────

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// ─── POST /api/auth/register ────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, email, password, full_name, phone, location, community_id } = req.body;

  // --- Validation ---
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required.' });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }
  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ error: 'Username must be between 3 and 50 characters.' });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    // --- Check if email or username already exists ---
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email or username is already taken.' });
    }

    // --- Hash password ---
    const password_hash = await bcrypt.hash(password, 12);

    // --- Insert user ---
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, full_name, phone, location, community_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, email, full_name, phone, location, role, is_verified, created_at`,
      [
        username.toLowerCase(),
        email.toLowerCase(),
        password_hash,
        full_name || null,
        phone || null,
        location || null,
        community_id || null,
      ]
    );

    const user = result.rows[0];
    const token = generateToken(user);

    return res.status(201).json({
      message: 'Account created successfully!',
      token,
      user,
    });
  } catch (err) {
    console.error('Register error:', err.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─── POST /api/auth/login ───────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // --- Find user ---
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];

    // --- Check if banned ---
    if (user.is_banned) {
      return res.status(403).json({ error: `Your account has been suspended. Reason: ${user.ban_reason || 'Violation of community rules.'}` });
    }

    // --- Verify password ---
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // --- Generate token ---
    const token = generateToken(user);

    return res.json({
      message: 'Login successful!',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        profile_photo: user.profile_photo,
        role: user.role,
        is_verified: user.is_verified,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─── GET /api/auth/me ───────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, full_name, phone, profile_photo, bio,
              location, role, is_verified, is_banned, community_id, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Me error:', err.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─── PUT /api/auth/profile ──────────────────────────────────
router.put('/profile', requireAuth, async (req, res) => {
  const { full_name, phone, bio, location } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           phone     = COALESCE($2, phone),
           bio       = COALESCE($3, bio),
           location  = COALESCE($4, location),
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, username, email, full_name, phone, bio, location, role, is_verified`,
      [full_name || null, phone || null, bio || null, location || null, req.user.id]
    );

    return res.json({ message: 'Profile updated!', user: result.rows[0] });
  } catch (err) {
    console.error('Profile update error:', err.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─── PUT /api/auth/change-password ─────────────────────────
router.put('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }

  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];

    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const new_hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [new_hash, req.user.id]);

    return res.json({ message: 'Password changed successfully!' });
  } catch (err) {
    console.error('Change password error:', err.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;
