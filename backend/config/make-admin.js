/**
 * Usage: node backend/config/make-admin.js <email>
 * Promotes a registered user to admin role.
 */
const pool = require('./db');

const email = process.argv[2];

if (!email) {
  console.error('❌ Usage: node backend/config/make-admin.js <email>');
  process.exit(1);
}

async function makeAdmin() {
  try {
    const result = await pool.query(
      "UPDATE users SET role = 'admin', updated_at = NOW() WHERE email = $1 RETURNING id, username, email, role",
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      console.error(`❌ No user found with email: ${email}`);
    } else {
      const u = result.rows[0];
      console.log(`✅ Success! "${u.username}" (${u.email}) is now an admin.`);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    pool.end();
  }
}

makeAdmin();
