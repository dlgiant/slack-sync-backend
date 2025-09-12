const User = require('./User');
const UserStateDuration = require('./UserStateDuration');
const Token = require('./Token');

User.hasMany(UserStateDuration, {
  foreignKey: 'userId',
  as: 'stateDurations'
});

UserStateDuration.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

module.exports = {
  User,
  UserStateDuration,
  Token
};