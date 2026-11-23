# FieldStamp architecture

FieldStamp keeps the camera experience local-first and uses MongoDB as its sync target. The frontend uses MVC modules; the Express API uses the same model, view, and controller separation on the server.

## MVC layout

- `public/js/models/PhotoStore.js` owns IndexedDB records and the `/api/photos` sync contract.
- `public/js/views/AppView.js` owns DOM rendering and user interaction events.
- `public/js/controllers/AppController.js` coordinates the capture, sync, camera, and location flows.
- `public/js/services/PhotoStamp.js` turns a live camera frame into a stamped JPEG.
- `public/js/services/GallerySaver.js` calls the Android MediaStore plugin to save stamped JPEGs in `Pictures/FieldStamp`.
- `android/app/src/main/java/com/fieldstamp/app/GallerySaverPlugin.java` writes stamped JPEGs with GPS, capture time, and place-name EXIF metadata into Android's shared photo library.
- `server/models/Photo.js` defines the MongoDB photo document.
- `server/controllers/photoController.js` handles photo API operations.
- `server/routes/photoRoutes.js` maps HTTP routes to those controller actions.
- `server/config/database.js` connects Mongoose to the configured database.
- `server/app.js` creates the Express app and serves the Vite-built app from `dist/`.
- `server/server.js` connects to MongoDB before accepting requests.

MongoDB defaults to `mongodb://127.0.0.1:27017`, database `capturejotoh`, and collection `photos`. Set `MONGODB_URI` and `MONGODB_DB` in an untracked `.env` file to use another MongoDB connection. `.env.example` shows the local defaults.

## Waterfall lifecycle

Work proceeds through ordered stages. Each stage provides the input needed by the next stage.

1. **Requirements:** capture time, GPS coordinates and place name, local access, MongoDB persistence, Android phone access over wireless debugging.
2. **Design:** separate browser MVC from Express MVC; keep IndexedDB as the first durable save; use MongoDB for backup and cross-session sync.
3. **Implementation:** connect to `capturejotoh`, serve the PWA, and implement photo API routes.
4. **Capture flow:** request current GPS → resolve place name → render timestamp and location on the camera frame → save to IndexedDB → upload to MongoDB. If MongoDB is temporarily unavailable, retain the local image and retry during startup or when the browser comes online.
5. **Verification:** start the server, confirm the MongoDB connection, open the app on the phone, capture a photo, confirm it appears locally and in the `photos` collection, then verify offline capture and later sync.
6. **Release and maintenance:** run `npm.cmd install`, then `./run-phone.ps1`; update the service worker cache version when shipping frontend assets.

Photos and metadata are stored in IndexedDB and MongoDB. GPS coordinates are sent to BigDataCloud for the place name; OpenStreetMap is a cached, rate-limited server-side fallback.
