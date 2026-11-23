import Capacitor
import CoreLocation
import Foundation
import Photos

@objc(GallerySaverPlugin)
public class GallerySaverPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GallerySaverPlugin"
    public let jsName = "GallerySaver"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "savePhoto", returnType: CAPPluginReturnPromise)
    ]

    @objc func savePhoto(_ call: CAPPluginCall) {
        guard let encoded = call.getString("data"),
              let data = Data(base64Encoded: encoded),
              data.count >= 3,
              data.count <= 10 * 1024 * 1024,
              data.starts(with: [0xFF, 0xD8, 0xFF]) else {
            call.reject("The photo data is missing, invalid, or too large.")
            return
        }

        let options = PHAssetResourceCreationOptions()
        options.originalFilename = call.getString("fileName") ?? "FieldStamp-photo.jpg"
        options.uniformTypeIdentifier = "public.jpeg"

        let latitude = call.getDouble("latitude")
        let longitude = call.getDouble("longitude")
        let dateMilliseconds = call.getDouble("createdAt")
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                call.reject("Allow FieldStamp to add photos in iPhone Settings > Privacy & Security > Photos.")
                return
            }

            PHPhotoLibrary.shared().performChanges({
                let request = PHAssetCreationRequest.forAsset()
                request.addResource(with: .photo, data: data, options: options)
                if let milliseconds = dateMilliseconds, milliseconds > 0 {
                    request.creationDate = Date(timeIntervalSince1970: milliseconds / 1000)
                }
                if let lat = latitude, let lon = longitude,
                   (-90...90).contains(lat), (-180...180).contains(lon) {
                    request.location = CLLocation(latitude: lat, longitude: lon)
                }
            }, completionHandler: { success, error in
                guard success else {
                    call.reject(error?.localizedDescription ?? "Could not save the photo to Apple Photos.")
                    return
                }
                call.resolve(["saved": true])
            })
        }
    }
}
