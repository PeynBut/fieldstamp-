import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import photoRoutes from './routes/photoRoutes.js';
import geocodeRoutes from './routes/geocodeRoutes.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(currentDirectory, '../dist');

export function createApp({ enableApi = process.env.NODE_ENV !== 'production' } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
    if (request.path.startsWith('/api/')) response.setHeader('Cache-Control', 'no-store');

    if (enableApi) {
      const allowedAppOrigins = new Set(['https://localhost', 'http://localhost', 'capacitor://localhost']);
      const origin = request.headers.origin;
      if (allowedAppOrigins.has(origin)) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      }
      if (request.method === 'OPTIONS') return response.sendStatus(204);
    }
    next();
  });
  app.use(express.json({ limit: '14mb', strict: true }));
  if (enableApi) {
    app.use('/api/photos', photoRoutes);
    app.use('/api/geocode', geocodeRoutes);
  } else {
    app.use('/api', (_request, response) => response.status(404).json({ error: 'API is disabled in public production mode.' }));
  }
  app.use('/api/health', (_request, response) => response.json({ status: 'ok' }));
  app.use(express.static(publicDirectory, { extensions: ['html'] }));

  app.use((error, _request, response, _next) => {
    console.error('Request failed:', error.message);
    const status = error.status || 500;
    response.status(status).json({ error: status === 500 ? 'The request could not be completed.' : error.message });
  });

  return app;
}
