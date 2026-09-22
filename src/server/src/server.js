import { createApp } from './app.js';
import { createDatabase } from './db.js';

const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

const database = createDatabase();

createApp({ database }).listen(port, host, () => {
  console.log(`GeneoApp server listening on http://${host}:${port}`);
});
