// src/server.js entry point delegator
const appModule = require('../backend/src/server.js');

if (process.env.NODE_ENV !== 'test' && typeof appModule.initializeApp === 'function') {
  appModule.initializeApp().catch((err) => {
    console.error('Failed to start server from src/server.js:', err);
  });
}

module.exports = appModule;
