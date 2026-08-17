const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// All message routes require auth
router.use(requireAuth);

// ─── GET /api/messages/conversations ────────────────────────
// Get all conversations for current user
router.get('/conversations', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         c.id, c.created_at, c.updated_at,
         l.id AS listing_id, l.title AS listing_title, l.status AS listing_status,
         (SELECT image_url FROM listing_images li WHERE li.listing_id = l.id ORDER BY sort_order ASC LIMIT 1) AS listing_image,
         buyer.id  AS buyer_id,  buyer.username  AS buyer_username,  buyer.profile_photo  AS buyer_photo,
         seller.id AS seller_id, seller.username AS seller_username, seller.profile_photo AS seller_photo,
         (SELECT content    FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
         (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
         (SELECT COUNT(*)   FROM messages m WHERE m.conversation_id = c.id AND m.is_read = FALSE AND m.sender_id != $1) AS unread_count
       FROM conversations c
       JOIN listings l ON c.listing_id = l.id
       JOIN users buyer  ON c.buyer_id  = buyer.id
       JOIN users seller ON c.seller_id = seller.id
       WHERE c.buyer_id = $1 OR c.seller_id = $1
       ORDER BY COALESCE(
         (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
         c.created_at
       ) DESC`,
      [req.user.id]
    );

    return res.json({ conversations: result.rows });
  } catch (err) {
    console.error('Get conversations error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch conversations.' });
  }
});

// ─── POST /api/messages/conversations ───────────────────────
// Start a new conversation (or return existing one)
router.post('/conversations', async (req, res) => {
  const { listing_id, message } = req.body;

  if (!listing_id || !message?.trim()) {
    return res.status(400).json({ error: 'Listing ID and a message are required.' });
  }

  try {
    // Get listing + seller info
    const listingResult = await pool.query(
      'SELECT id, user_id, status FROM listings WHERE id = $1',
      [listing_id]
    );

    if (!listingResult.rows.length) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    const listing = listingResult.rows[0];

    if (listing.user_id === req.user.id) {
      return res.status(400).json({ error: 'You cannot message yourself about your own listing.' });
    }

    // Check if conversation already exists
    const existing = await pool.query(
      `SELECT id FROM conversations
       WHERE listing_id = $1 AND buyer_id = $2 AND seller_id = $3`,
      [listing_id, req.user.id, listing.user_id]
    );

    let conversationId;

    if (existing.rows.length > 0) {
      conversationId = existing.rows[0].id;
    } else {
      // Create new conversation
      const conv = await pool.query(
        `INSERT INTO conversations (listing_id, buyer_id, seller_id)
         VALUES ($1, $2, $3) RETURNING id`,
        [listing_id, req.user.id, listing.user_id]
      );
      conversationId = conv.rows[0].id;
    }

    // Insert message
    const msgResult = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content)
       VALUES ($1, $2, $3) RETURNING *`,
      [conversationId, req.user.id, message.trim()]
    );

    // Update conversation timestamp
    await pool.query(
      'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
      [conversationId]
    );

    return res.status(201).json({
      conversation_id: conversationId,
      message: msgResult.rows[0],
    });
  } catch (err) {
    console.error('Start conversation error:', err.message);
    return res.status(500).json({ error: 'Failed to start conversation.' });
  }
});

// ─── GET /api/messages/conversations/:id ────────────────────
// Get all messages in a conversation
router.get('/conversations/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Verify user is part of conversation
    const conv = await pool.query(
      `SELECT c.*,
              l.id AS listing_id, l.title AS listing_title, l.price AS listing_price, l.status AS listing_status,
              (SELECT image_url FROM listing_images li WHERE li.listing_id = l.id ORDER BY sort_order ASC LIMIT 1) AS listing_image,
              buyer.id  AS buyer_id,  buyer.username  AS buyer_username,
              seller.id AS seller_id, seller.username AS seller_username
       FROM conversations c
       JOIN listings l ON c.listing_id = l.id
       JOIN users buyer  ON c.buyer_id  = buyer.id
       JOIN users seller ON c.seller_id = seller.id
       WHERE c.id = $1 AND (c.buyer_id = $2 OR c.seller_id = $2)`,
      [id, req.user.id]
    );

    if (!conv.rows.length) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    const conversation = conv.rows[0];

    // Get messages
    const messages = await pool.query(
      `SELECT m.*, u.username AS sender_username, u.profile_photo AS sender_photo
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [id]
    );

    // Mark messages as read
    await pool.query(
      `UPDATE messages SET is_read = TRUE
       WHERE conversation_id = $1 AND sender_id != $2 AND is_read = FALSE`,
      [id, req.user.id]
    );

    return res.json({ conversation, messages: messages.rows });
  } catch (err) {
    console.error('Get messages error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch messages.' });
  }
});

// ─── POST /api/messages/conversations/:id ───────────────────
// Send a message in an existing conversation
router.post('/conversations/:id', async (req, res) => {
  const { id }      = req.params;
  const { message } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }

  try {
    // Verify user is part of this conversation
    const conv = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)',
      [id, req.user.id]
    );

    if (!conv.rows.length) {
      return res.status(403).json({ error: 'Not authorized to send in this conversation.' });
    }

    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content)
       VALUES ($1, $2, $3) RETURNING *`,
      [id, req.user.id, message.trim()]
    );

    await pool.query(
      'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
      [id]
    );

    return res.status(201).json({ message: result.rows[0] });
  } catch (err) {
    console.error('Send message error:', err.message);
    return res.status(500).json({ error: 'Failed to send message.' });
  }
});

// ─── GET /api/messages/unread-count ─────────────────────────
// Get total unread message count for nav badge
router.get('/unread-count', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE (c.buyer_id = $1 OR c.seller_id = $1)
         AND m.sender_id != $1
         AND m.is_read = FALSE`,
      [req.user.id]
    );
    return res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get unread count.' });
  }
});

module.exports = router;
