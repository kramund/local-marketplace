const pool = require('./db');

const categories = [
  { name: 'Electronics',        slug: 'electronics',        icon: '📱' },
  { name: 'Vehicles',           slug: 'vehicles',           icon: '🚗' },
  { name: 'Fashion & Apparel',  slug: 'fashion',            icon: '👗' },
  { name: 'Home & Garden',      slug: 'home-garden',        icon: '🏡' },
  { name: 'Furniture',          slug: 'furniture',          icon: '🛋️' },
  { name: 'Food & Beverages',   slug: 'food-beverages',     icon: '🍱' },
  { name: 'Health & Beauty',    slug: 'health-beauty',      icon: '💊' },
  { name: 'Sports & Outdoors',  slug: 'sports-outdoors',    icon: '⚽' },
  { name: 'Toys & Games',       slug: 'toys-games',         icon: '🧸' },
  { name: 'Books & Education',  slug: 'books-education',    icon: '📚' },
  { name: 'Music & Hobbies',    slug: 'music-hobbies',      icon: '🎸' },
  { name: 'Pets & Animals',     slug: 'pets-animals',       icon: '🐾' },
  { name: 'Tools & Equipment',  slug: 'tools-equipment',    icon: '🔧' },
  { name: 'Jobs & Services',    slug: 'jobs-services',      icon: '💼' },
  { name: 'Real Estate',        slug: 'real-estate',        icon: '🏠' },
  { name: 'Others',             slug: 'others',             icon: '📦' },
];

const sampleCommunity = {
  name: 'Sample Community',
  description: 'Default community for Local Marketplace',
  city: 'Your City',
  province: 'Your Province',
  region: 'Your Region',
  country: 'Philippines',
};

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    // Insert sample community
    await pool.query(`
      INSERT INTO communities (name, description, city, province, region, country)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING
    `, [
      sampleCommunity.name,
      sampleCommunity.description,
      sampleCommunity.city,
      sampleCommunity.province,
      sampleCommunity.region,
      sampleCommunity.country,
    ]);
    console.log('✅ Community seeded');

    // Insert categories
    for (const cat of categories) {
      await pool.query(`
        INSERT INTO categories (name, slug, icon)
        VALUES ($1, $2, $3)
        ON CONFLICT (slug) DO NOTHING
      `, [cat.name, cat.slug, cat.icon]);
    }
    console.log(`✅ ${categories.length} categories seeded`);

    console.log('🎉 Seeding complete!');
  } catch (err) {
    console.error('❌ Seeding error:', err.message);
  } finally {
    pool.end();
  }
}

seed();
