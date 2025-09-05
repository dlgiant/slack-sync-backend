const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { Op } = require('sequelize');

router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search = '', 
      includeDeleted = false,
      onlineOnly = false 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    const whereClause = {};
    
    if (!includeDeleted || includeDeleted === 'false') {
      whereClause.deleted = false;
    }
    
    if (onlineOnly === 'true' || onlineOnly === true) {
      whereClause.isOnline = true;
    }
    
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { realName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }
    
    const { count, rows } = await User.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['realName', 'ASC'], ['name', 'ASC']]
    });
    
    res.json({
      users: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const userSyncService = req.app.get('userSyncService');
    
    // Check token before attempting sync
    const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
    if (!token || token === 'xoxb-your-bot-token') {
      return res.status(401).json({
        success: false,
        error: 'No valid Slack authentication. Please connect to Slack first.'
      });
    }
    
    const result = await userSyncService.syncAllUsers();
    res.json({
      success: true,
      message: 'User sync completed',
      ...result
    });
  } catch (error) {
    console.error('Error during manual sync:', error);
    
    // Better error handling
    if (error.message && error.message.includes('invalid_auth')) {
      res.status(401).json({
        success: false,
        error: 'Slack authentication expired. Please reconnect to Slack.'
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to sync users'
      });
    }
  }
});

router.post('/sync/:id', async (req, res) => {
  try {
    const userSyncService = req.app.get('userSyncService');
    
    // Check token before attempting sync
    const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
    if (!token || token === 'xoxb-your-bot-token') {
      return res.status(401).json({
        success: false,
        error: 'No valid Slack authentication. Please connect to Slack first.'
      });
    }
    
    const user = await userSyncService.syncSingleUser(req.params.id);
    res.json({
      success: true,
      message: 'User synced successfully',
      user
    });
  } catch (error) {
    console.error('Error syncing user:', error);
    
    if (error.message && error.message.includes('invalid_auth')) {
      res.status(401).json({
        success: false,
        error: 'Slack authentication expired. Please reconnect to Slack.'
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to sync user'
      });
    }
  }
});

module.exports = router;