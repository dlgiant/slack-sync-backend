const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserStateDuration = sequelize.define('UserStateDuration', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'user_id'
  },
  state: {
    type: DataTypes.STRING,
    allowNull: false
  },
  startTime: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'start_time'
  },
  endTime: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'end_time'
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'user_state_durations',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      name: 'idx_user_state_durations_user_id',
      fields: ['user_id']
    },
    {
      name: 'idx_user_state_durations_state',
      fields: ['state']
    },
    {
      name: 'idx_user_state_durations_start_time',
      fields: ['start_time']
    }
  ]
});

module.exports = UserStateDuration;