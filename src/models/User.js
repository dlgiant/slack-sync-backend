const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false
  },
  teamId: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'team_id'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  realName: {
    type: DataTypes.STRING,
    field: 'real_name'
  },
  tz: {
    type: DataTypes.STRING
  },
  tzLabel: {
    type: DataTypes.STRING,
    field: 'tz_label'
  },
  tzOffset: {
    type: DataTypes.INTEGER,
    field: 'tz_offset'
  },
  email: {
    type: DataTypes.STRING
  },
  phone: {
    type: DataTypes.STRING
  },
  skype: {
    type: DataTypes.STRING
  },
  title: {
    type: DataTypes.STRING
  },
  statusText: {
    type: DataTypes.STRING,
    field: 'status_text'
  },
  statusEmoji: {
    type: DataTypes.STRING,
    field: 'status_emoji'
  },
  statusExpiration: {
    type: DataTypes.INTEGER,
    field: 'status_expiration'
  },
  avatarHash: {
    type: DataTypes.STRING,
    field: 'avatar_hash'
  },
  image24: {
    type: DataTypes.STRING,
    field: 'image_24'
  },
  image32: {
    type: DataTypes.STRING,
    field: 'image_32'
  },
  image48: {
    type: DataTypes.STRING,
    field: 'image_48'
  },
  image72: {
    type: DataTypes.STRING,
    field: 'image_72'
  },
  image192: {
    type: DataTypes.STRING,
    field: 'image_192'
  },
  image512: {
    type: DataTypes.STRING,
    field: 'image_512'
  },
  isAdmin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_admin'
  },
  isOwner: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_owner'
  },
  isPrimaryOwner: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_primary_owner'
  },
  isRestricted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_restricted'
  },
  isUltraRestricted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_ultra_restricted'
  },
  isBot: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_bot'
  },
  isAppUser: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_app_user'
  },
  updated: {
    type: DataTypes.BIGINT
  },
  lastSyncedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'last_synced_at'
  },
  presence: {
    type: DataTypes.STRING,
    defaultValue: 'away',
    field: 'presence_status'
  },
  isOnline: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_online'
  }
}, {
  tableName: 'slack_users',
  timestamps: true,
  underscored: true
});

module.exports = User;