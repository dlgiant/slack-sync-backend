const { Sequelize } = require('sequelize');
require('dotenv').config();

// Use SQLite for simpler development
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: process.env.NODE_ENV === 'development' ? console.log : false
});

module.exports = sequelize;