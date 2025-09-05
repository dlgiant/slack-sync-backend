const express = require('express');
const router = express.Router();
const { slackConfig, slackClient } = require('../config/slack');
const { InstallProvider } = require('@slack/oauth');

// Simple in-memory state store for OAuth
const stateStore = new Map();

const installer = new InstallProvider({
  clientId: slackConfig.clientId,
  clientSecret: slackConfig.clientSecret,
  stateSecret: process.env.STATE_SECRET || 'slack-user-sync-state-secret-2024',
  stateStore: {
    // Simple in-memory implementation
    storeInstallation: async (installation) => {
      // We don't need to store installations for this use case
      return installation;
    },
    fetchInstallation: async (installQuery) => {
      // We don't need to fetch installations for this use case
      return null;
    },
    deleteInstallation: async (installQuery) => {
      // We don't need to delete installations for this use case
    },
    // State management for OAuth flow
    generateStateParam: async (installUrlOptions, date) => {
      const state = Date.now().toString();
      stateStore.set(state, { installUrlOptions, date });
      return state;
    },
    verifyStateParam: async (date, state) => {
      const data = stateStore.get(state);
      stateStore.delete(state);
      return data ? data.installUrlOptions : null;
    }
  },
  scopes: [], // No bot scopes needed
  userScopes: ['users:read', 'users:read.email', 'team:read'] // User scopes instead
});

router.get('/slack/install', async (req, res) => {
  try {
    // Use ngrok URL if available, otherwise fallback to localhost
    const baseUrl = process.env.NGROK_DOMAIN 
      ? `https://${process.env.NGROK_DOMAIN}`
      : (process.env.BACKEND_URL || 'http://localhost:3001');
    
    const installUrl = await installer.generateInstallUrl({
      scopes: [], // No bot scopes
      userScopes: ['users:read', 'users:read.email', 'team:read'], // User scopes
      redirectUri: `${baseUrl}/api/auth/slack/callback`
    });
    
    res.redirect(installUrl);
  } catch (error) {
    console.error('Error generating install URL:', error);
    res.status(500).json({ error: 'Failed to generate install URL' });
  }
});

router.get('/slack/callback', async (req, res) => {
  try {
    const { code, state, error: queryError } = req.query;
    
    // Determine redirect URL based on request origin
    const origin = req.get('origin') || req.get('referer') || '';
    let redirectUrl;
    
    if (origin.includes('localhost:3000')) {
      redirectUrl = 'http://localhost:3000';
    } else if (origin.includes('mandrel-slack.vercel.app')) {
      redirectUrl = 'https://mandrel-slack.vercel.app';
    } else {
      // Fallback: check if request came through ngrok (production) or local
      const host = req.get('host') || '';
      if (host.includes('ngrok')) {
        redirectUrl = 'https://mandrel-slack.vercel.app';
      } else {
        redirectUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      }
    }
    
    console.log('OAuth callback - Origin:', origin, 'Redirect URL:', redirectUrl);
    
    // Check if Slack returned an error
    if (queryError) {
      console.error('Slack OAuth error:', queryError);
      return res.redirect(`${redirectUrl}?install=failed&error=${queryError}`);
    }
    
    const result = await installer.handleCallback(req, res, {
      success: async (installation, options, req, res) => {
        console.log('Installation successful:', installation.team);
        
        // Use user token instead of bot token
        const userToken = installation.user?.token || installation.authedUser?.access_token;
        if (!userToken) {
          console.error('No user token found in installation');
          return res.redirect(`${redirectUrl}?install=failed&error=no_token`);
        }
        
        process.env.SLACK_USER_TOKEN = userToken;
        process.env.SLACK_BOT_TOKEN = userToken; // Set both for compatibility
        
        const userSyncService = req.app.get('userSyncService');
        try {
          await userSyncService.syncAllUsers();
        } catch (syncError) {
          console.error('Initial sync failed:', syncError.message);
        }
        
        res.redirect(`${redirectUrl}?install=success`);
      },
      failure: (error, options, req, res) => {
        console.error('Installation failed:', error);
        res.redirect(`${redirectUrl}?install=failed&error=${error.message || 'unknown'}`);
      }
    });
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    // Redirect instead of sending JSON
    const origin = req.get('origin') || req.get('referer') || '';
    let redirectUrl;
    
    if (origin.includes('localhost:3000')) {
      redirectUrl = 'http://localhost:3000';
    } else if (origin.includes('mandrel-slack.vercel.app')) {
      redirectUrl = 'https://mandrel-slack.vercel.app';
    } else {
      const host = req.get('host') || '';
      if (host.includes('ngrok')) {
        redirectUrl = 'https://mandrel-slack.vercel.app';
      } else {
        redirectUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      }
    }
    res.redirect(`${redirectUrl}?install=failed&error=callback_error`);
  }
});

router.get('/slack/status', async (req, res) => {
  try {
    const result = await slackClient.auth.test();
    res.json({
      connected: result.ok,
      team: result.team,
      teamId: result.team_id,
      userId: result.user_id,
      user: result.user
    });
  } catch (error) {
    res.json({
      connected: false,
      error: error.message
    });
  }
});

module.exports = router;