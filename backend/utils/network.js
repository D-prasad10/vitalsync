const os = require('os');

/**
 * Detect local LAN IPv4 address for ESP8266 local network connection.
 */
function getLocalLanIp() {
  const ifaces = os.networkInterfaces();
  for (const dev in ifaces) {
    for (const details of ifaces[dev]) {
      if (details.family === 'IPv4' && !details.internal) {
        return details.address;
      }
    }
  }
  return 'localhost';
}

module.exports = {
  getLocalLanIp
};
