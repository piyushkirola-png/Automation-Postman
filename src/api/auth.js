const axios = require('axios');
const config = require('../config');
const { logger, logSuccess, logError, logInfo } = require('../utils/logger');

/**
 * Login user and get access token + client secret
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<{accessToken: string, clientSecret: string, user: object}>}
 */
async function loginUser(email, password) {
  try {
    const url = `${config.BASE_URL}${config.API_PATHS.LOGIN}`;
    const payload = { email, password };
    
    logInfo(`Logging in: ${email}`);
    
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data.success) {
      const { accessToken, user } = response.data.data;
      const clientSecret = user.clientSecret;
      
      logSuccess(`Login successful for ${email}`);
      logInfo(`Merchant ID: ${user.merchantId}`);
      
      return {
        accessToken,
        clientSecret,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          merchantId: user.merchantId
        }
      };
    } else {
      throw new Error(response.data.message || 'Login failed');
    }
  } catch (error) {
    logError(`Login failed for ${email}: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Response: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

module.exports = { loginUser };