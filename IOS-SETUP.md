# Build FieldStamp for iPhone

The iOS target and native photo/settings plugins are included. The iOS app saves the stamped JPEG into Apple Photos with the captured GPS coordinates and capture time.

## Requirements

- A Mac running macOS with Xcode installed.
- Node.js 20 or newer.
- An iPhone for device testing. Xcode can sign a test build with a personal Apple account; sharing broadly or App Store distribution requires Apple’s distribution process.

Windows cannot compile or sign an iOS app. Copy this project to the Mac first.

## Open and run

From the project folder on the Mac:

```sh
npm install
npm run ios:sync
npm run ios:open
```

In Xcode, choose the **App** target, select your Apple development team under **Signing & Capabilities**, connect an iPhone, select it as the run destination, then press **Run**. On first use, allow camera, location, and adding photos when iOS prompts.

The app needs internet for first-time street-name lookup. Captures and their metadata remain saved locally in FieldStamp and Apple Photos.

## Native iOS work included

- `GallerySaverPlugin.swift` writes the JPEG and its capture date/GPS location to Apple Photos.
- `NativeSettingsPlugin.swift` opens FieldStamp’s iOS settings page.
- `FieldStampBridgeViewController.swift` registers those native plugins with Capacitor.
- `Info.plist` contains the camera, location, and Photos permission descriptions.
