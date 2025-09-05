const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'slack_users',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  connectionTimeoutMillis: 5000,
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        team_id VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        real_name VARCHAR(255),
        display_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        title VARCHAR(255),
        status_text VARCHAR(255),
        status_emoji VARCHAR(50),
        timezone VARCHAR(100),
        image_24 TEXT,
        image_32 TEXT,
        image_48 TEXT,
        image_72 TEXT,
        image_192 TEXT,
        image_512 TEXT,
        is_admin BOOLEAN DEFAULT false,
        is_owner BOOLEAN DEFAULT false,
        is_bot BOOLEAN DEFAULT false,
        is_deleted BOOLEAN DEFAULT false,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);
      CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at);
    `);
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initDatabase
};