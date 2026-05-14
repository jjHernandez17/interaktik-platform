const env = require('./env');

const isDev = env.NODE_ENV === 'development';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function timestamp() {
  return new Date().toISOString();
}

module.exports = {
  info: (msg, data) => {
    console.log(`${colors.blue}[${timestamp()}] INFO${colors.reset}`, msg, data || '');
  },

  success: (msg, data) => {
    console.log(`${colors.green}[${timestamp()}] ✅ ${msg}${colors.reset}`, data || '');
  },

  warn: (msg, data) => {
    console.warn(`${colors.yellow}[${timestamp()}] ⚠️  ${msg}${colors.reset}`, data || '');
  },

  error: (msg, error) => {
    console.error(`${colors.red}[${timestamp()}] ❌ ${msg}${colors.reset}`);
    if (error) {
      console.error('Message:', error.message);
      if (error.code) console.error('Code:', error.code);
      if (error.detail) console.error('Detail:', error.detail);
      if (error.stack) console.error('Stack:', error.stack);
    }
  },

  debug: (msg, data) => {
    console.log(`${colors.cyan}[${timestamp()}] DEBUG${colors.reset}`, msg, data || '');
  },
};
