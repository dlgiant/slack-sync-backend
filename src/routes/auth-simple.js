const express = require('express');
const router = express.Router();
const axios = require('axios');
const { slackConfig } = require('../config/slack');

// Direct OAuth implementation without state verification
router.get('/slack/install', async (req, res) => {
  try {
    const baseUrl = process.env.NGROK_DOMAIN 
      ? `https://${process.env.NGROK_DOMAIN}`
      : 'http://localhost:3001';
    
    // Get the origin from the referrer header to know where to redirect back
    const referer = req.get('referer') || '';
    let state = 'production'; // default to production
    
    if (referer.includes('localhost:3000')) {
      state = 'localhost';
    }
    
    console.log('OAuth install initiated from:', referer, 'State:', state);
    
    // Build Slack OAuth URL directly
    const params = new URLSearchParams({
      client_id: slackConfig.clientId,
      user_scope: 'users:read,users:read.email,team:read',
      redirect_uri: `${baseUrl}/api/auth/slack/callback`,
      state: state // Pass state to remember where to redirect
    });
    
    const authUrl = `https://slack.com/oauth/v2/authorize?${params.toString()}`;
    console.log('Redirecting to Slack OAuth:', authUrl);
    
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error generating install URL:', error);
    res.status(500).json({ error: 'Failed to generate install URL' });
  }
});

router.get('/slack/callback', async (req, res) => {
  try {
    const { code, error: queryError, state } = req.query;
    
    // Determine redirect URL based on state parameter
    let redirectUrl;
    
    if (state === 'localhost') {
      redirectUrl = 'http://localhost:3000';
    } else {
      // Default to production (Vercel)
      redirectUrl = 'https://mandrel-slack.vercel.app';
    }
    
    console.log('OAuth callback - State:', state, 'Redirect URL:', redirectUrl);
    
    if (queryError) {
      console.error('Slack OAuth error:', queryError);
      return res.redirect(`${redirectUrl}?install=failed&error=${queryError}`);
    }
    
    if (!code) {
      console.error('No authorization code received');
      return res.redirect(`${redirectUrl}?install=failed&error=no_code`);
    }
    
    // Exchange code for access token
    const tokenResponse = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: slackConfig.clientId,
        client_secret: slackConfig.clientSecret,
        code: code,
        redirect_uri: `${process.env.NGROK_DOMAIN ? `https://${process.env.NGROK_DOMAIN}` : 'http://localhost:3001'}/api/auth/slack/callback`
      }
    });
    
    const data = tokenResponse.data;
    
    if (!data.ok) {
      console.error('Slack OAuth token exchange failed:', data.error);
      return res.redirect(`${redirectUrl}?install=failed&error=${data.error}`);
    }
    
    // Store the user token
    const userToken = data.authed_user?.access_token;
    if (!userToken) {
      console.error('No user token received');
      return res.redirect(`${redirectUrl}?install=failed&error=no_token`);
    }
    
    // Update environment variables
    process.env.SLACK_USER_TOKEN = userToken;
    process.env.SLACK_BOT_TOKEN = userToken; // Set both for compatibility
    
    console.log('OAuth successful! Team:', data.team?.name);
    console.log('User ID:', data.authed_user?.id);
    
    // Trigger initial sync
    const userSyncService = req.app.get('userSyncService');
    if (userSyncService) {
      try {
        // Update the service's Slack client with new token
        userSyncService.updateSlackClient();
        
        // Restart presence polling with new token
        userSyncService.stopPresencePolling();
        userSyncService.startPresencePolling();
        
        // The service will pick up the new token from environment variables
        await userSyncService.syncAllUsers();
        console.log('Initial user sync completed');
      } catch (syncError) {
        console.error('Initial sync failed:', syncError.message);
      }
    }
    
    // Redirect to frontend with success
    res.redirect(`${redirectUrl}?install=success`);
    
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    // Determine redirect URL for error case using state
    const { state } = req.query;
    let redirectUrl;
    
    if (state === 'localhost') {
      redirectUrl = 'http://localhost:3000';
    } else {
      redirectUrl = 'https://mandrel-slack.vercel.app';
    }
    
    res.redirect(`${redirectUrl}?install=failed&error=callback_error`);
  }
});

router.get('/slack/status', async (req, res) => {
  try {
    const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
    
    if (!token || token === 'xoxb-your-bot-token') {
      return res.json({
        connected: false,
        error: 'No valid token configured'
      });
    }
    
    // Test the token
    const response = await axios.post('https://slack.com/api/auth.test', null, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.data.ok) {
      res.json({
        connected: true,
        team: response.data.team,
        teamId: response.data.team_id,
        userId: response.data.user_id,
        user: response.data.user
      });
    } else {
      res.json({
        connected: false,
        error: response.data.error
      });
    }
  } catch (error) {
    res.json({
      connected: false,
      error: error.message
    });
  }
});

module.exports = router;