import Capacitor

final class FieldStampBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GallerySaverPlugin())
        bridge?.registerPluginInstance(NativeSettingsPlugin())
    }
}
