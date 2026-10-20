const verifyHandler = require('./verify/[sessionId].js');

module.exports = async (req, res) => {
  return verifyHandler(req, res);
};
