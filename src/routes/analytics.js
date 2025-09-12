const express = require('express');
const router = express.Router();
const { User, UserStateDuration } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

router.get('/overview', async (req, res) => {
  try {
    const { 
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), 
      endDate = new Date().toISOString() 
    } = req.query;
    
    const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);
    
    const [
      totalUsers,
      activeUsers,
      currentlyOnline,
      totalActivityTime,
      avgSessionDuration,
      peakActivity
    ] = await Promise.all([
      User.count({ where: { deleted: false } }),
      
      sequelize.query(`
        SELECT COUNT(DISTINCT u.id) as active_users
        FROM slack_users u
        INNER JOIN user_state_durations usd ON u.id = usd.user_id
        WHERE u.deleted = false
          AND usd.start_time BETWEEN :startTime AND :endTime
      `, {
        replacements: { startTime: startTimestamp, endTime: endTimestamp },
        type: sequelize.QueryTypes.SELECT
      }).then(result => result[0].active_users),
      
      User.count({ where: { isOnline: true, deleted: false } }),
      
      UserStateDuration.sum('duration', {
        where: {
          startTime: { [Op.between]: [startTimestamp, endTimestamp] },
          duration: { [Op.not]: null }
        }
      }) || 0,
      
      UserStateDuration.findOne({
        attributes: [[sequelize.fn('AVG', sequelize.col('duration')), 'avgDuration']],
        where: {
          startTime: { [Op.between]: [startTimestamp, endTimestamp] },
          duration: { [Op.not]: null }
        },
        raw: true
      }).then(result => result?.avgDuration || 0),
      
      sequelize.query(`
        SELECT datetime(start_time, 'unixepoch', 'start of hour') as hour,
               COUNT(*) as sessions
        FROM user_state_durations 
        WHERE start_time BETWEEN :startTime AND :endTime
          AND state = 'online'
        GROUP BY hour
        ORDER BY sessions DESC
        LIMIT 1
      `, {
        replacements: { startTime: startTimestamp, endTime: endTimestamp },
        type: sequelize.QueryTypes.SELECT
      }).then(result => result[0] || { hour: null, sessions: 0 })
    ]);

    res.json({
      dateRange: { startDate, endDate },
      overview: {
        totalUsers,
        activeUsers,
        currentlyOnline,
        totalActivityHours: Math.round(totalActivityTime / 3600),
        avgSessionDurationMinutes: Math.round(avgSessionDuration / 60),
        peakActivity: {
          hour: peakActivity.hour,
          sessions: peakActivity.sessions
        }
      }
    });
    
  } catch (error) {
    console.error('Error getting analytics overview:', error);
    res.status(500).json({ error: 'Failed to get analytics overview' });
  }
});

router.get('/activity-heatmap', async (req, res) => {
  try {
    const { 
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), 
      endDate = new Date().toISOString() 
    } = req.query;
    
    const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);
    
    const heatmapData = await sequelize.query(`
      WITH RECURSIVE hours(hour) AS (
        SELECT 0
        UNION ALL
        SELECT hour + 1 FROM hours WHERE hour < 23
      ),
      days(day) AS (
        SELECT 0
        UNION ALL  
        SELECT day + 1 FROM days WHERE day < 6
      ),
      activity_data AS (
        SELECT 
          strftime('%H', datetime(start_time, 'unixepoch')) as hour,
          strftime('%w', datetime(start_time, 'unixepoch')) as day,
          COUNT(*) as activity_count,
          SUM(COALESCE(duration, 0)) as total_duration
        FROM user_state_durations
        WHERE start_time BETWEEN :startTime AND :endTime
          AND state = 'online'
        GROUP BY 
          strftime('%H', datetime(start_time, 'unixepoch')),
          strftime('%w', datetime(start_time, 'unixepoch'))
      )
      SELECT 
        h.hour,
        d.day,
        COALESCE(ad.activity_count, 0) as activity_count,
        COALESCE(ad.total_duration, 0) as total_duration
      FROM hours h
      CROSS JOIN days d
      LEFT JOIN activity_data ad ON h.hour = CAST(ad.hour AS INTEGER) AND d.day = CAST(ad.day AS INTEGER)
      ORDER BY d.day, h.hour
    `, {
      replacements: { startTime: startTimestamp, endTime: endTimestamp },
      type: sequelize.QueryTypes.SELECT
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const formattedData = heatmapData.map(row => ({
      hour: parseInt(row.hour),
      day: parseInt(row.day),
      dayName: dayNames[parseInt(row.day)],
      activityCount: parseInt(row.activity_count),
      totalDurationMinutes: Math.round(parseInt(row.total_duration) / 60)
    }));

    res.json({
      dateRange: { startDate, endDate },
      heatmap: formattedData
    });
    
  } catch (error) {
    console.error('Error getting activity heatmap:', error);
    res.status(500).json({ error: 'Failed to get activity heatmap' });
  }
});

router.get('/top-users', async (req, res) => {
  try {
    const { 
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), 
      endDate = new Date().toISOString(),
      limit = 10
    } = req.query;
    
    const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);
    
    const topUsers = await sequelize.query(`
      SELECT 
        u.id,
        u.name,
        u.real_name,
        u.email,
        u.image_192,
        SUM(COALESCE(usd.duration, 0)) as total_duration,
        COUNT(usd.id) as session_count,
        AVG(COALESCE(usd.duration, 0)) as avg_session_duration
      FROM slack_users u
      LEFT JOIN user_state_durations usd ON u.id = usd.user_id
        AND usd.start_time BETWEEN :startTime AND :endTime
        AND usd.state = 'online'
      WHERE u.deleted = false
      GROUP BY u.id, u.name, u.real_name, u.email, u.image_192
      HAVING SUM(COALESCE(usd.duration, 0)) > 0
      ORDER BY total_duration DESC
      LIMIT :limit
    `, {
      replacements: { 
        startTime: startTimestamp, 
        endTime: endTimestamp, 
        limit: parseInt(limit) 
      },
      type: sequelize.QueryTypes.SELECT
    });

    const formattedUsers = topUsers.map(user => ({
      userId: user.id,
      name: user.name,
      realName: user.real_name,
      email: user.email,
      avatar: user.image_192,
      totalHours: Math.round(parseInt(user.total_duration) / 3600 * 100) / 100,
      sessionCount: parseInt(user.session_count),
      avgSessionMinutes: Math.round(parseInt(user.avg_session_duration) / 60)
    }));

    res.json({
      dateRange: { startDate, endDate },
      topUsers: formattedUsers
    });
    
  } catch (error) {
    console.error('Error getting top users:', error);
    res.status(500).json({ error: 'Failed to get top users' });
  }
});

router.get('/daily-activity', async (req, res) => {
  try {
    const { 
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), 
      endDate = new Date().toISOString() 
    } = req.query;
    
    const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);
    
    const dailyActivity = await sequelize.query(`
      SELECT 
        date(datetime(start_time, 'unixepoch')) as date,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) as total_sessions,
        SUM(COALESCE(duration, 0)) as total_duration,
        AVG(COALESCE(duration, 0)) as avg_session_duration
      FROM user_state_durations
      WHERE start_time BETWEEN :startTime AND :endTime
        AND state = 'online'
      GROUP BY date(datetime(start_time, 'unixepoch'))
      ORDER BY date ASC
    `, {
      replacements: { startTime: startTimestamp, endTime: endTimestamp },
      type: sequelize.QueryTypes.SELECT
    });

    const formattedData = dailyActivity.map(day => ({
      date: day.date,
      uniqueUsers: parseInt(day.unique_users),
      totalSessions: parseInt(day.total_sessions),
      totalHours: Math.round(parseInt(day.total_duration) / 3600 * 100) / 100,
      avgSessionMinutes: Math.round(parseInt(day.avg_session_duration) / 60)
    }));

    res.json({
      dateRange: { startDate, endDate },
      dailyActivity: formattedData
    });
    
  } catch (error) {
    console.error('Error getting daily activity:', error);
    res.status(500).json({ error: 'Failed to get daily activity' });
  }
});

router.get('/user-trends/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), 
      endDate = new Date().toISOString() 
    } = req.query;
    
    const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);
    
    const [userInfo, dailyTrends, hourlyPattern] = await Promise.all([
      User.findByPk(userId, {
        attributes: ['id', 'name', 'realName', 'email', 'image192'],
        where: { deleted: false }
      }),
      
      sequelize.query(`
        SELECT 
          date(datetime(start_time, 'unixepoch')) as date,
          COUNT(*) as sessions,
          SUM(COALESCE(duration, 0)) as total_duration,
          AVG(COALESCE(duration, 0)) as avg_duration
        FROM user_state_durations
        WHERE user_id = :userId
          AND start_time BETWEEN :startTime AND :endTime
          AND state = 'online'
        GROUP BY date(datetime(start_time, 'unixepoch'))
        ORDER BY date ASC
      `, {
        replacements: { userId, startTime: startTimestamp, endTime: endTimestamp },
        type: sequelize.QueryTypes.SELECT
      }),
      
      sequelize.query(`
        SELECT 
          strftime('%H', datetime(start_time, 'unixepoch')) as hour,
          COUNT(*) as sessions,
          SUM(COALESCE(duration, 0)) as total_duration
        FROM user_state_durations
        WHERE user_id = :userId
          AND start_time BETWEEN :startTime AND :endTime
          AND state = 'online'
        GROUP BY strftime('%H', datetime(start_time, 'unixepoch'))
        ORDER BY hour ASC
      `, {
        replacements: { userId, startTime: startTimestamp, endTime: endTimestamp },
        type: sequelize.QueryTypes.SELECT
      })
    ]);

    if (!userInfo) {
      return res.status(404).json({ error: 'User not found' });
    }

    const formattedDailyTrends = dailyTrends.map(day => ({
      date: day.date,
      sessions: parseInt(day.sessions),
      totalHours: Math.round(parseInt(day.total_duration) / 3600 * 100) / 100,
      avgSessionMinutes: Math.round(parseInt(day.avg_duration) / 60)
    }));

    const formattedHourlyPattern = hourlyPattern.map(hour => ({
      hour: parseInt(hour.hour),
      sessions: parseInt(hour.sessions),
      totalHours: Math.round(parseInt(hour.total_duration) / 3600 * 100) / 100
    }));

    res.json({
      dateRange: { startDate, endDate },
      user: {
        userId: userInfo.id,
        name: userInfo.name,
        realName: userInfo.realName,
        email: userInfo.email,
        avatar: userInfo.image192
      },
      dailyTrends: formattedDailyTrends,
      hourlyPattern: formattedHourlyPattern
    });
    
  } catch (error) {
    console.error('Error getting user trends:', error);
    res.status(500).json({ error: 'Failed to get user trends' });
  }
});

module.exports = router;