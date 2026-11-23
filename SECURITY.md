# Security and deployment notes

## Current sharing model

FieldStamp is suitable for sharing as a local capture app: camera access, location, stamped photos, and the photo library run on each person's phone. Photos stay on that phone unless the owner shares them. Photo stamps and Gallery metadata can include precise GPS coordinates and capture time, so review a photo before sending it to someone else.

The MongoDB API is for local development only. It has no sign-in or per-person photo ownership. In development it listens on `127.0.0.1` by default for the ADB reverse connection. **Do not expose the development API to the internet or put it behind a public reverse proxy.** Public production mode serves the static app and disables the photo and geocoding API; it does not connect to MongoDB. Adding class-wide cloud sync requires authenticated accounts, per-user authorization, TLS, and a MongoDB account with least-privilege access first.

## CIA review

- **Confidentiality:** local photos and GPS are sensitive. Android app backup is disabled. Public production mode has no photo API. There is no server-side account isolation, so Mongo-backed sharing is not ready.
- **Integrity:** the local API validates capture IDs, timestamps, GPS ranges, JPEG data, and upload size. Anyone who can reach the development API can still change or delete records; keep it loopback-only.
- **Availability:** request and image-size limits protect the local API from oversized uploads. The app stores captures locally, so a server or network outage does not block capture. Public cloud sync is not enabled.

## Hosting the app

Run `npm run build` and publish the contents of `dist/` to an HTTPS static host. Netlify Drop can publish that folder directly. `dist/_headers` applies response security headers on Netlify. The build includes the service worker and PWA icons. To make the Android installer downloadable from the same site, copy the signed release APK into `dist/FieldStamp.apk` after building; then share the site URL ending in `/FieldStamp.apk`. HTTPS is required for browser camera, location, and service-worker support. Set `NODE_ENV=production` if using `npm start`; that mode serves only the static app and returns 404 for API endpoints without connecting to MongoDB. The Android app can also be shared for local capture without hosting a backend.

Do not distribute `android/app/build/outputs/apk/debug/app-debug.apk` as a release. It is a development build. Create a release keystore in the ignored `.local-secrets` folder or another private location, then set `FIELDSTAMP_KEYSTORE`, `FIELDSTAMP_STORE_PASSWORD`, `FIELDSTAMP_KEY_ALIAS`, and `FIELDSTAMP_KEY_PASSWORD` in PowerShell and run `npm.cmd run android:sync`, then `android\gradlew.bat assembleRelease`. Share `android/app/build/outputs/apk/release/app-release.apk` through a trusted channel. Keep the keystore and passwords safe: losing them prevents signing future updates. Never upload `.local-secrets`, commit `.env` files, signing keys, or production service credentials.

## Before enabling remote sync

Add individual user sign-in and enforce ownership on list, create, and delete operations; require HTTPS; limit request rates and photo retention; configure MongoDB network access and a least-privilege database user; and document how classmates can export and delete their data. A shared API key embedded in the app is not sufficient because it can be extracted from the APK.
