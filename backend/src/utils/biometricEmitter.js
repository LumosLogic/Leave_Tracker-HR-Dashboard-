const EventEmitter = require('events');

class BiometricEmitter extends EventEmitter {}

// Global singleton instance to broadcast logs
const biometricEmitter = new BiometricEmitter();

// Increase max listeners if needed since multiple admins could be watching
biometricEmitter.setMaxListeners(50);

module.exports = biometricEmitter;
