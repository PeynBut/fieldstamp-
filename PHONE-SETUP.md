# Run FieldStamp on an Android phone over Wi-Fi

This uses Android Wireless debugging and ADB port forwarding to install and update the app. After installation, FieldStamp runs from files bundled in the app and does not need Wi-Fi or the backend for camera capture and local photos.

## One-time setup

1. Install **Android SDK Platform-Tools** and **Node.js 20 or later** on your computer. Make sure `adb` and `npm` are on your Windows `PATH`.
2. MongoDB is optional. Start it only when you want to sync photos to the `capturejotoh` database.
3. On your phone, open **Settings → About phone** and tap **Build number** seven times. This enables Developer options. The menu names can vary by phone maker.
4. Open **Settings → System → Developer options → Wireless debugging** and turn it on. Keep the phone unlocked.
5. On the phone, tap **Pair device with pairing code**. Keep that screen open.
6. On the computer, open PowerShell and run `adb pair PHONE_IP:PAIRING_PORT`. Enter the Wi-Fi pairing code shown on the phone. Use the IP address and pairing port shown in that pairing dialog.
7. Back in Wireless debugging, note the phone's IP address and **debugging** port (the port on the main Wireless debugging screen can differ from the pairing port), then run `adb connect PHONE_IP:DEBUGGING_PORT` in PowerShell.
8. Check that `adb devices` lists the phone with the status `device`.

## Start and use the app

Install dependencies once with `npm.cmd install`. Build and install FieldStamp with `./install-phone.ps1` while the phone is connected over Wireless debugging. The installed app loads its bundled files, so after installation you can open it from the phone's app icon without starting `run-phone.ps1` or connecting to Wi-Fi.

Camera capture, GPS coordinates, stamped photos, and the local photo library work on the phone. New place-name lookups need internet; the app keeps the last resolved place for offline use. Photos are saved locally first and to the Android Gallery under **Pictures/FieldStamp**.

MongoDB sync is optional. To sync with the `capturejotoh` database, start MongoDB and the backend with `./run-phone.ps1` while Wireless debugging is connected. That script sets up ADB reverse forwarding for the app's local API. Sync retries when the backend is reachable again.

For code changes, run `./run-phone.ps1` in one PowerShell window and `./install-phone.ps1` in another to rebuild and reinstall. The debug APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

If Windows blocks a script because of the current PowerShell execution policy, allow scripts for this PowerShell window only:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
./install-phone.ps1
```

To stop the backend, press **Ctrl+C** in its PowerShell window. The installed app continues working without it.
## Troubleshooting

- **`adb` is not recognized:** install Platform-Tools, add its `platform-tools` directory to `PATH`, and reopen PowerShell.
- **No authorized phone:** ensure Wireless debugging is on, run `adb connect` with the current debugging port, and accept any authorization prompt on the phone.
- **Camera or GPS is unavailable:** open the installed FieldStamp app and allow its permissions in Android settings. Camera and GPS do not need the backend.
- **MongoDB will not sync:** connect the phone over Wireless debugging, start the backend with `./run-phone.ps1`, and confirm `adb devices` shows the phone as `device`.
- **MongoDB connection fails:** start the MongoDB service, or set `MONGODB_URI` and `MONGODB_DB` in a `.env` file. The default database is `capturejotoh`.

This setup is for Android phones. iPhone browsers do not support Android ADB Wireless debugging or `adb reverse`.
