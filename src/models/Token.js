const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Token = sequelize.define('Token', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  teamId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  teamName: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'tokens',
  timestamps: true,
  underscored: true
});

module.exports = Token;