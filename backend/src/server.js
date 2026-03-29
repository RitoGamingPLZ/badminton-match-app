/**
 * Local development HTTP server — wraps the Express app.
 *
 * Run via docker-compose or `node src/server.js`.
 */

import app from './app.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend listening on http://0.0.0.0:${PORT}`);
  console.log(`DB_DRIVER : ${process.env.DB_DRIVER || 'dynamodb'}`);
});
