const express = require('express');
const router = express.Router();
const User = require('../models/User');
const UserStateDuration = require('../models/UserStateDuration');
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

router.get('/durations/aggregate', async (req, res) => {
  try {
    const { startDate, endDate, userId, state } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Both startDate and endDate are required (ISO format or Unix timestamp)'
      });
    }
    
    // Convert dates to Unix timestamps
    const startTimestamp = isNaN(startDate) ? Math.floor(new Date(startDate).getTime() / 1000) : parseInt(startDate);
    const endTimestamp = isNaN(endDate) ? Math.floor(new Date(endDate).getTime() / 1000) : parseInt(endDate);
    
    if (isNaN(startTimestamp) || isNaN(endTimestamp)) {
      return res.status(400).json({
        error: 'Invalid date format. Use ISO date string or Unix timestamp'
      });
    }
    
    // Build where clause
    const whereClause = {
      [Op.and]: [
        {
          [Op.or]: [
            { startTime: { [Op.between]: [startTimestamp, endTimestamp] } },
            { endTime: { [Op.between]: [startTimestamp, endTimestamp] } },
            {
              [Op.and]: [
                { startTime: { [Op.lte]: startTimestamp } },
                {
                  [Op.or]: [
                    { endTime: { [Op.gte]: endTimestamp } },
                    { endTime: { [Op.is]: null } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    
    if (userId) {
      whereClause.userId = userId;
    }
    
    if (state) {
      whereClause.state = state;
    }
    
    // Get all relevant duration records
    const durations = await UserStateDuration.findAll({
      where: whereClause,
      order: [['startTime', 'ASC']]
    });
    
    // Helper function to calculate actual duration within the date range
    const calculateActualDuration = (record) => {
      const recordStart = Math.max(record.startTime, startTimestamp);
      const recordEnd = record.endTime ? Math.min(record.endTime, endTimestamp) : endTimestamp;
      return Math.max(0, recordEnd - recordStart);
    };
    
    // Helper function to get time bucket
    const getTimeBucket = (timestamp, bucketSize) => {
      const date = new Date(timestamp * 1000);
      const bucketSizeMs = bucketSize * 60 * 1000; // Convert minutes to milliseconds
      
      if (bucketSize >= 1440) { // Day bucket (1440 minutes)
        return Math.floor(date.getTime() / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
      } else {
        return Math.floor(date.getTime() / bucketSizeMs) * bucketSizeMs;
      }
    };
    
    // Calculate aggregations
    let totalSeconds = 0;
    const bucketSizes = {
      '15min': 15,
      '30min': 30, 
      '1hour': 60,
      '4hours': 240,
      'day': 1440
    };
    
    const buckets = {};
    Object.keys(bucketSizes).forEach(key => {
      buckets[key] = {};
    });
    
    // Process each duration record
    durations.forEach(record => {
      const actualDuration = calculateActualDuration(record);
      totalSeconds += actualDuration;
      
      // Add to each bucket type
      Object.entries(bucketSizes).forEach(([bucketName, bucketSize]) => {
        const bucketKey = getTimeBucket(Math.max(record.startTime, startTimestamp), bucketSize);
        const bucketDate = new Date(bucketKey);
        
        if (!buckets[bucketName][bucketKey]) {
          buckets[bucketName][bucketKey] = {
            timestamp: bucketKey / 1000, // Unix timestamp
            date: bucketDate.toISOString(),
            totalSeconds: 0,
            totalHours: 0,
            records: 0
          };
        }
        
        buckets[bucketName][bucketKey].totalSeconds += actualDuration;
        buckets[bucketName][bucketKey].totalHours = buckets[bucketName][bucketKey].totalSeconds / 3600;
        buckets[bucketName][bucketKey].records += 1;
      });
    });
    
    // Convert bucket objects to arrays and sort by timestamp
    const result = {
      summary: {
        totalSeconds,
        totalHours: totalSeconds / 3600,
        dateRange: {
          startDate: new Date(startTimestamp * 1000).toISOString(),
          endDate: new Date(endTimestamp * 1000).toISOString()
        },
        filters: {
          userId: userId || null,
          state: state || null
        },
        recordCount: durations.length
      },
      buckets: {}
    };
    
    Object.entries(buckets).forEach(([bucketName, bucketData]) => {
      result.buckets[bucketName] = Object.values(bucketData)
        .sort((a, b) => a.timestamp - b.timestamp);
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Error calculating duration aggregates:', error);
    res.status(500).json({ error: 'Failed to calculate duration aggregates' });
  }
});

router.get('/durations/by-user', async (req, res) => {
  try {
    const { startDate, endDate, state } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Both startDate and endDate are required (ISO format or Unix timestamp)'
      });
    }
    
    // Convert dates to Unix timestamps
    const startTimestamp = isNaN(startDate) ? Math.floor(new Date(startDate).getTime() / 1000) : parseInt(startDate);
    const endTimestamp = isNaN(endDate) ? Math.floor(new Date(endDate).getTime() / 1000) : parseInt(endDate);
    
    if (isNaN(startTimestamp) || isNaN(endTimestamp)) {
      return res.status(400).json({
        error: 'Invalid date format. Use ISO date string or Unix timestamp'
      });
    }
    
    // Build where clause for durations
    const durationWhereClause = {
      [Op.and]: [
        {
          [Op.or]: [
            { startTime: { [Op.between]: [startTimestamp, endTimestamp] } },
            { endTime: { [Op.between]: [startTimestamp, endTimestamp] } },
            {
              [Op.and]: [
                { startTime: { [Op.lte]: startTimestamp } },
                {
                  [Op.or]: [
                    { endTime: { [Op.gte]: endTimestamp } },
                    { endTime: { [Op.is]: null } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    
    if (state) {
      durationWhereClause.state = state;
    }
    
    // Get all relevant duration records
    const durations = await UserStateDuration.findAll({
      where: durationWhereClause,
      order: [['userId', 'ASC'], ['startTime', 'ASC']]
    });
    
    // Helper function to calculate actual duration within the date range
    const calculateActualDuration = (record) => {
      const recordStart = Math.max(record.startTime, startTimestamp);
      const recordEnd = record.endTime ? Math.min(record.endTime, endTimestamp) : endTimestamp;
      return Math.max(0, recordEnd - recordStart);
    };
    
    // Helper function to get time bucket
    const getTimeBucket = (timestamp, bucketSize) => {
      const date = new Date(timestamp * 1000);
      const bucketSizeMs = bucketSize * 60 * 1000; // Convert minutes to milliseconds
      
      if (bucketSize >= 1440) { // Day bucket (1440 minutes)
        return Math.floor(date.getTime() / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
      } else {
        return Math.floor(date.getTime() / bucketSizeMs) * bucketSizeMs;
      }
    };
    
    // Group durations by user
    const userDurations = {};
    const bucketSizes = {
      '15min': 15,
      '30min': 30, 
      '1hour': 60,
      '4hours': 240,
      'day': 1440
    };
    
    durations.forEach(record => {
      const userId = record.userId;
      const actualDuration = calculateActualDuration(record);
      
      if (!userDurations[userId]) {
        userDurations[userId] = {
          userId,
          totalSeconds: 0,
          totalHours: 0,
          recordCount: 0,
          buckets: {}
        };
        
        // Initialize buckets for this user
        Object.keys(bucketSizes).forEach(key => {
          userDurations[userId].buckets[key] = {};
        });
      }
      
      // Update user totals
      userDurations[userId].totalSeconds += actualDuration;
      userDurations[userId].totalHours = userDurations[userId].totalSeconds / 3600;
      userDurations[userId].recordCount += 1;
      
      // Add to each bucket type for this user
      Object.entries(bucketSizes).forEach(([bucketName, bucketSize]) => {
        const bucketKey = getTimeBucket(Math.max(record.startTime, startTimestamp), bucketSize);
        const bucketDate = new Date(bucketKey);
        
        if (!userDurations[userId].buckets[bucketName][bucketKey]) {
          userDurations[userId].buckets[bucketName][bucketKey] = {
            timestamp: bucketKey / 1000, // Unix timestamp
            date: bucketDate.toISOString(),
            totalSeconds: 0,
            totalHours: 0,
            records: 0
          };
        }
        
        userDurations[userId].buckets[bucketName][bucketKey].totalSeconds += actualDuration;
        userDurations[userId].buckets[bucketName][bucketKey].totalHours = userDurations[userId].buckets[bucketName][bucketKey].totalSeconds / 3600;
        userDurations[userId].buckets[bucketName][bucketKey].records += 1;
      });
    });
    
    // Get user details for each userId
    const userIds = Object.keys(userDurations);
    const users = await User.findAll({
      where: { id: { [Op.in]: userIds } },
      attributes: ['id', 'name', 'realName', 'email', 'image192']
    });
    
    // Create user lookup map
    const userMap = {};
    users.forEach(user => {
      userMap[user.id] = {
        name: user.name,
        realName: user.realName,
        email: user.email,
        image192: user.image192
      };
    });
    
    // Convert to array and add user details
    const result = {
      summary: {
        dateRange: {
          startDate: new Date(startTimestamp * 1000).toISOString(),
          endDate: new Date(endTimestamp * 1000).toISOString()
        },
        filters: {
          state: state || null
        },
        totalUsers: userIds.length,
        totalRecords: durations.length,
        grandTotalSeconds: Object.values(userDurations).reduce((sum, user) => sum + user.totalSeconds, 0),
        grandTotalHours: Object.values(userDurations).reduce((sum, user) => sum + user.totalHours, 0)
      },
      users: userIds.map(userId => {
        const userData = userDurations[userId];
        const userInfo = userMap[userId] || { name: userId, realName: null, email: null, image192: null };
        
        // Convert bucket objects to arrays and sort by timestamp
        const buckets = {};
        Object.entries(userData.buckets).forEach(([bucketName, bucketData]) => {
          buckets[bucketName] = Object.values(bucketData)
            .sort((a, b) => a.timestamp - b.timestamp);
        });
        
        return {
          userId,
          userInfo,
          totalSeconds: userData.totalSeconds,
          totalHours: userData.totalHours,
          recordCount: userData.recordCount,
          buckets
        };
      }).sort((a, b) => b.totalHours - a.totalHours) // Sort by total hours descending
    };
    
    res.json(result);
    
  } catch (error) {
    console.error('Error calculating user duration aggregates:', error);
    res.status(500).json({ error: 'Failed to calculate user duration aggregates' });
  }
});

module.exports = router;