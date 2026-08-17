const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Import DB (connects on startup)
const db = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/listings', require('./routes/listings'));
// app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/offers',   require('./routes/offers'));
app.use('/api/reviews',  require('./routes/reviews'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Local Marketplace API is running 🚀' });
});

// Catch-all: serve frontend
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
