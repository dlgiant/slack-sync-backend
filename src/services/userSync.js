const { WebClient } = require('@slack/web-api');
const User = require('../models/User');
const Token = require('../models/Token');

class UserSyncService {
  constructor(io) {
    this.io = io;
    this.updateSlackClient();
    this.presencePollingInterval = null;
    this.presenceCache = new Map(); // Cache to track presence changes
    this.startPresencePolling();
  }

  async updateSlackClient() {
    let token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
    
    // If no valid token in env, try to load from database
    if (!token || token === 'xoxb-your-bot-token') {
      try {
        const storedToken = await Token.findOne({ where: { type: 'user_token' } });
        if (storedToken) {
          token = storedToken.value;
          // Update environment variables
          process.env.SLACK_USER_TOKEN = token;
          process.env.SLACK_BOT_TOKEN = token;
        }
      } catch (err) {
        console.log('Could not load token from database:', err.message);
      }
    }
    
    this.slackClient = new WebClient(token || 'xoxb-your-bot-token');
  }

  async syncAllUsers() {
    try {
      console.log('Starting user sync with presence...');
      // Ensure we have the latest token
      await this.updateSlackClient();
      
      // Check if we have a valid token
      const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
      if (!token || token === 'xoxb-your-bot-token') {
        console.log('No valid Slack token available for sync');
        return { created: 0, updated: 0, errors: 0 };
      }
      
      const result = await this.slackClient.users.list({
        include_locale: true
      });

      if (!result.ok) {
        throw new Error('Failed to fetch users from Slack');
      }

      const users = result.members.filter(member => !member.deleted);
      const syncResults = {
        created: 0,
        updated: 0,
        errors: 0
      };

      for (const slackUser of users) {
        try {
          // Get presence for this user
          let presence = 'away';
          let isOnline = false;
          
          try {
            const presenceResult = await this.slackClient.users.getPresence({
              user: slackUser.id
            });
            
            if (presenceResult.ok) {
              presence = presenceResult.presence;
              isOnline = presence === 'active';
            }
          } catch (presenceError) {
            console.log(`Could not fetch presence for ${slackUser.id}:`, presenceError.message);
          }
          
          const userData = {
            ...this.mapSlackUserToDb(slackUser),
            presence,
            isOnline
          };
          
          const [user, created] = await User.upsert(userData, {
            returning: true
          });

          if (created) {
            syncResults.created++;
            this.io.emit('userCreated', user.toJSON());
          } else {
            syncResults.updated++;
            this.io.emit('userUpdated', user.toJSON());
          }
        } catch (error) {
          console.error(`Error syncing user ${slackUser.id}:`, error);
          syncResults.errors++;
        }
      }

      console.log('User sync completed:', syncResults);
      return syncResults;
    } catch (error) {
      console.error('Error during user sync:', error);
      throw error;
    }
  }

  async syncSingleUser(userId) {
    try {
      // Ensure we have the latest token
      await this.updateSlackClient();
      
      // Check if we have a valid token
      const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
      if (!token || token === 'xoxb-your-bot-token') {
        console.log('No valid Slack token available for single user sync');
        return null;
      }
      
      const result = await this.slackClient.users.info({
        user: userId,
        include_locale: true
      });

      if (!result.ok) {
        throw new Error(`Failed to fetch user ${userId} from Slack`);
      }

      // Get presence for this user
      let presence = 'away';
      let isOnline = false;
      
      try {
        const presenceResult = await this.slackClient.users.getPresence({
          user: userId
        });
        
        if (presenceResult.ok) {
          presence = presenceResult.presence;
          isOnline = presence === 'active';
        }
      } catch (presenceError) {
        console.log(`Could not fetch presence for ${userId}:`, presenceError.message);
      }

      const userData = {
        ...this.mapSlackUserToDb(result.user),
        presence,
        isOnline
      };
      const [user, created] = await User.upsert(userData, {
        returning: true
      });

      if (created) {
        this.io.emit('userCreated', user.toJSON());
      } else {
        this.io.emit('userUpdated', user.toJSON());
      }

      return user;
    } catch (error) {
      console.error(`Error syncing user ${userId}:`, error);
      throw error;
    }
  }

  mapSlackUserToDb(slackUser) {
    const profile = slackUser.profile || {};
    
    return {
      id: slackUser.id,
      teamId: slackUser.team_id,
      name: slackUser.name,
      deleted: slackUser.deleted || false,
      realName: slackUser.real_name || profile.real_name,
      tz: slackUser.tz,
      tzLabel: slackUser.tz_label,
      tzOffset: slackUser.tz_offset,
      email: profile.email,
      phone: profile.phone,
      skype: profile.skype,
      title: profile.title,
      statusText: profile.status_text,
      statusEmoji: profile.status_emoji,
      statusExpiration: profile.status_expiration,
      avatarHash: profile.avatar_hash,
      image24: profile.image_24,
      image32: profile.image_32,
      image48: profile.image_48,
      image72: profile.image_72,
      image192: profile.image_192,
      image512: profile.image_512,
      isAdmin: slackUser.is_admin || false,
      isOwner: slackUser.is_owner || false,
      isPrimaryOwner: slackUser.is_primary_owner || false,
      isRestricted: slackUser.is_restricted || false,
      isUltraRestricted: slackUser.is_ultra_restricted || false,
      isBot: slackUser.is_bot || false,
      isAppUser: slackUser.is_app_user || false,
      updated: slackUser.updated,
      lastSyncedAt: new Date()
    };
  }

  async handleUserChange(event) {
    try {
      const userData = this.mapSlackUserToDb(event.user);
      
      if (event.user.deleted) {
        await User.update(
          { deleted: true, lastSyncedAt: new Date() },
          { where: { id: event.user.id } }
        );
        this.io.emit('userDeleted', event.user.id);
      } else {
        const [user] = await User.upsert(userData, {
          returning: true
        });
        this.io.emit('userUpdated', user.toJSON());
      }
      
      console.log(`User ${event.user.id} updated via event`);
    } catch (error) {
      console.error('Error handling user change event:', error);
    }
  }

  async handlePresenceChange(event) {
    try {
      const userId = event.user;
      const presence = event.presence;
      const isOnline = presence === 'active';
      
      console.log(`Updating presence for user ${userId}: ${presence}`);
      
      // Update user presence in database
      const [updatedRows, users] = await User.update(
        { 
          presence,
          isOnline,
          lastSyncedAt: new Date()
        },
        { 
          where: { id: userId },
          returning: true
        }
      );
      
      if (updatedRows > 0 && users && users[0]) {
        const user = users[0];
        // Emit real-time update via WebSocket
        this.io.emit('userPresenceChanged', {
          userId: user.id,
          presence: user.presence,
          isOnline: user.isOnline,
          name: user.realName || user.name,
          email: user.email,
          image192: user.image192
        });
        console.log(`Emitted presence change for ${user.realName || user.name}: ${presence}`);
      } else {
        console.log(`User ${userId} not found in database, syncing...`);
        // If user not in database, sync them
        await this.syncSingleUser(userId);
      }
    } catch (error) {
      console.error('Error handling presence change event:', error);
    }
  }

  async pollUserPresence() {
    try {
      // Ensure we have the latest token
      await this.updateSlackClient();
      
      // Check if we have a valid token
      const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
      if (!token || token === 'xoxb-your-bot-token') {
        // Silently skip polling if no valid token
        return;
      }
      
      // Get all users from database
      const dbUsers = await User.findAll({
        where: { deleted: false },
        attributes: ['id', 'name', 'realName', 'presence', 'isOnline']
      });

      if (!dbUsers || dbUsers.length === 0) {
        return;
      }

      console.log(`Checking presence for ${dbUsers.length} users with single API call...`);
      let changedCount = 0;

      try {
        // Get all users with presence in a single API call
        const result = await this.slackClient.users.list({
          include_locale: false,
          presence: true
        });

        if (result.ok && result.members) {
          const slackUsers = result.members.filter(member => !member.deleted);
          
          // Create a map for quick lookup
          const dbUserMap = new Map(dbUsers.map(user => [user.id, user]));
          
          for (const slackUser of slackUsers) {
            const dbUser = dbUserMap.get(slackUser.id);
            if (!dbUser) continue; // Skip users not in our database
            
            const newPresence = slackUser.presence || 'away';
            const newIsOnline = newPresence === 'active';
            
            // Check if presence changed
            const cachedPresence = this.presenceCache.get(slackUser.id);
            if (cachedPresence !== newPresence || dbUser.presence !== newPresence) {
              // Record state duration BEFORE updating and emitting
              await this.recordStateDuration(slackUser.id, newPresence);
              
              // Update cache
              this.presenceCache.set(slackUser.id, newPresence);
              
              // Update database
              await User.update(
                { 
                  presence: newPresence,
                  isOnline: newIsOnline,
                  lastSyncedAt: new Date()
                },
                { 
                  where: { id: slackUser.id }
                }
              );
              
              // Emit real-time update
              const eventData = {
                userId: slackUser.id,
                presence: newPresence,
                isOnline: newIsOnline,
                name: dbUser.realName || dbUser.name
              };
              
              console.log(`Emitting presence change for ${dbUser.realName || dbUser.name}: ${dbUser.presence} -> ${newPresence}`);
              this.io.emit('userPresenceChanged', eventData);
              changedCount++;
            }
          }
        }
      } catch (error) {
        if (error.message && error.message.includes('invalid_auth')) {
          console.log('Authentication expired. Please reconnect to Slack.');
          this.stopPresencePolling();
          return;
        }
        console.error('Error fetching users with presence:', error.message);
      }

      if (changedCount > 0) {
        console.log(`Updated presence for ${changedCount} users`);
      }
    } catch (error) {
      console.error('Error polling user presence:', error);
    }
  }

  startPresencePolling() {
    // Poll every 10 seconds for more real-time updates
    // Safe for up to 20 users (20 users * 6 req/min = 120 req/min, under Slack's limits)
    const POLLING_INTERVAL = 10000; // 10 seconds
    
    // Clear any existing interval
    if (this.presencePollingInterval) {
      clearInterval(this.presencePollingInterval);
    }
    
    // Start polling
    this.presencePollingInterval = setInterval(() => {
      this.pollUserPresence();
    }, POLLING_INTERVAL);
    
    // Do an initial poll after a short delay
    setTimeout(() => {
      this.pollUserPresence();
    }, 3000);
    
    console.log('Started presence polling (every 10 seconds)');
  }

  stopPresencePolling() {
    if (this.presencePollingInterval) {
      clearInterval(this.presencePollingInterval);
      this.presencePollingInterval = null;
      console.log('Stopped presence polling');
    }
  }
}

module.exports = UserSyncService;