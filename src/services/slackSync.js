const { WebClient } = require('@slack/web-api');
const { pool } = require('../db/connection');

let slackClient;
let syncInterval;

function initSlackClient() {
  if (!slackClient && process.env.SLACK_BOT_TOKEN) {
    slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
  }
  return slackClient;
}

async function upsertUser(user, teamId) {
  const query = `
    INSERT INTO users (
      id, team_id, name, real_name, display_name, email, phone,
      title, status_text, status_emoji, timezone,
      image_24, image_32, image_48, image_72, image_192, image_512,
      is_admin, is_owner, is_bot, is_deleted, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      team_id = EXCLUDED.team_id,
      name = EXCLUDED.name,
      real_name = EXCLUDED.real_name,
      display_name = EXCLUDED.display_name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      title = EXCLUDED.title,
      status_text = EXCLUDED.status_text,
      status_emoji = EXCLUDED.status_emoji,
      timezone = EXCLUDED.timezone,
      image_24 = EXCLUDED.image_24,
      image_32 = EXCLUDED.image_32,
      image_48 = EXCLUDED.image_48,
      image_72 = EXCLUDED.image_72,
      image_192 = EXCLUDED.image_192,
      image_512 = EXCLUDED.image_512,
      is_admin = EXCLUDED.is_admin,
      is_owner = EXCLUDED.is_owner,
      is_bot = EXCLUDED.is_bot,
      is_deleted = EXCLUDED.is_deleted,
      updated_at = NOW()
    RETURNING *
  `;

  const values = [
    user.id,
    teamId,
    user.name,
    user.real_name,
    user.profile?.display_name || '',
    user.profile?.email || '',
    user.profile?.phone || '',
    user.profile?.title || '',
    user.profile?.status_text || '',
    user.profile?.status_emoji || '',
    user.tz || '',
    user.profile?.image_24 || '',
    user.profile?.image_32 || '',
    user.profile?.image_48 || '',
    user.profile?.image_72 || '',
    user.profile?.image_192 || '',
    user.profile?.image_512 || '',
    user.is_admin || false,
    user.is_owner || false,
    user.is_bot || false,
    user.deleted || false
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

async function syncAllUsers(io) {
  const client = initSlackClient();
  if (!client) {
    console.error('Slack client not initialized');
    return;
  }

  try {
    const authResult = await client.auth.test();
    const teamId = authResult.team_id;
    
    const result = await client.users.list({
      limit: 200
    });

    if (result.ok && result.members) {
      console.log(`Syncing ${result.members.length} users from Slack`);
      
      for (const user of result.members) {
        const savedUser = await upsertUser(user, teamId);
        
        if (io) {
          io.emit('userUpdate', savedUser);
        }
      }
      
      console.log('User sync completed');
    }
  } catch (error) {
    console.error('Error syncing users:', error);
  }
}

async function handleUserChange(event, io) {
  const client = initSlackClient();
  if (!client) return;

  try {
    const authResult = await client.auth.test();
    const teamId = authResult.team_id;
    
    const userInfo = await client.users.info({
      user: event.user.id || event.user
    });

    if (userInfo.ok && userInfo.user) {
      const savedUser = await upsertUser(userInfo.user, teamId);
      
      if (io) {
        io.emit('userUpdate', savedUser);
      }
    }
  } catch (error) {
    console.error('Error handling user change:', error);
  }
}

async function startUserSync(io) {
  await syncAllUsers(io);
  
  syncInterval = setInterval(() => {
    syncAllUsers(io);
  }, 60000);
}

function stopUserSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

module.exports = {
  initSlackClient,
  syncAllUsers,
  handleUserChange,
  startUserSync,
  stopUserSync
};