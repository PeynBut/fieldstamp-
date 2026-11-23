import 'dotenv/config';
import { connectDatabase } from './config/database.js';
import { createApp } from './app.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8000);
const production = process.env.NODE_ENV === 'production';

if (production) {
  const app = createApp({ enableApi: false });
  app.listen(port, host, () => {
    console.log(`FieldStamp static app is running at http://${host}:${port}; photo API is disabled in production.`);
  });
} else {
  try {
    const database = await connectDatabase();
    const app = createApp({ enableApi: true });
    app.listen(port, host, () => {
      console.log(`FieldStamp is running at http://${host}:${port}`);
      console.log(`MongoDB connected to database: ${database}`);
    });
  } catch (error) {
    console.error('Could not connect to MongoDB. Check that MongoDB is running and MONGODB_URI is correct.');
    console.error(error.name || 'ConnectionError');
    process.exitCode = 1;
  }
}
