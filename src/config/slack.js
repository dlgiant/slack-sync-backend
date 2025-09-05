const { WebClient } = require('@slack/web-api');
const { createEventAdapter } = require('@slack/events-api');
require('dotenv').config();

// Log environment variables for debugging (without exposing secrets)
console.log('Environment check:', {
  hasClientId: !!process.env.SLACK_CLIENT_ID,
  hasClientSecret: !!process.env.SLACK_CLIENT_SECRET,
  hasSigningSecret: !!process.env.SLACK_SIGNING_SECRET,
  hasBotToken: !!process.env.SLACK_BOT_TOKEN,
  hasUserToken: !!process.env.SLACK_USER_TOKEN,
  signingSecretLength: process.env.SLACK_SIGNING_SECRET?.length || 0
});

// Use user token if available, otherwise fall back to bot token
const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
const slackClient = new WebClient(token);

// Only create event adapter if signing secret is available
// Use a dummy value if not set to prevent crash during initialization
const signingSecret = process.env.SLACK_SIGNING_SECRET || 'dummy-signing-secret';
const slackEvents = createEventAdapter(signingSecret);

const slackConfig = {
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  botToken: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN
};

module.exports = {
  slackClient,
  slackEvents,
  slackConfig
};