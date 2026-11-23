package com.fieldstamp.app;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.exifinterface.media.ExifInterface;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.io.OutputStream;

@CapacitorPlugin(name = "GallerySaver")
public class GallerySaverPlugin extends Plugin {
    private static final int MAX_PHOTO_BYTES = 10 * 1024 * 1024;
    private static final int MAX_BASE64_LENGTH = ((MAX_PHOTO_BYTES + 2) / 3) * 4;

    @PluginMethod
    public void savePhoto(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Saving directly to Gallery requires Android 10 or newer.");
            return;
        }

        String encoded = call.getString("data");
        String requestedName = call.getString("fileName", "FieldStamp-photo.jpg");
        String place = call.getString("place", "");
        Double latitude = call.getDouble("latitude");
        Double longitude = call.getDouble("longitude");
        Double createdAt = call.getDouble("createdAt");
        if (encoded == null || encoded.isEmpty() || encoded.length() > MAX_BASE64_LENGTH) {
            call.reject("The photo data is missing or too large.");
            return;
        }
        if (place.length() > 160 || (createdAt != null && (createdAt < 946684800000d || createdAt > System.currentTimeMillis() + 86400000d))) {
            call.reject("The photo metadata is invalid.");
            return;
        }

        Uri photoUri = null;
        File stampedFile = null;
        try {
            String safeName = requestedName.replaceAll("[^A-Za-z0-9._-]", "_");
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            if (bytes.length == 0 || bytes.length > MAX_PHOTO_BYTES || bytes.length < 3 ||
                    bytes[0] != (byte) 0xff || bytes[1] != (byte) 0xd8 || bytes[2] != (byte) 0xff) {
                throw new IllegalArgumentException("Invalid JPEG photo data.");
            }
            stampedFile = File.createTempFile("fieldstamp-", ".jpg", getContext().getCacheDir());
            try (FileOutputStream tempOutput = new FileOutputStream(stampedFile)) {
                tempOutput.write(bytes);
            }

            ExifInterface exif = new ExifInterface(stampedFile.getAbsolutePath());
            if (latitude != null && longitude != null &&
                    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
                exif.setLatLong(latitude, longitude);
            }
            if (createdAt != null) {
                String exifDate = new SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US)
                        .format(new Date(createdAt.longValue()));
                exif.setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, exifDate);
                exif.setAttribute(ExifInterface.TAG_DATETIME, exifDate);
            }
            if (!place.isEmpty()) exif.setAttribute(ExifInterface.TAG_IMAGE_DESCRIPTION, place);
            exif.saveAttributes();
            bytes = Files.readAllBytes(stampedFile.toPath());

            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, safeName);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            if (createdAt != null) values.put(MediaStore.Images.Media.DATE_TAKEN, createdAt.longValue());
            values.put(MediaStore.Images.Media.RELATIVE_PATH,
                    Environment.DIRECTORY_PICTURES + "/FieldStamp");
            values.put(MediaStore.Images.Media.IS_PENDING, 1);

            photoUri = getContext().getContentResolver().insert(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (photoUri == null) throw new IllegalStateException("Android could not create the gallery photo.");

            try (OutputStream output = getContext().getContentResolver().openOutputStream(photoUri)) {
                if (output == null) throw new IllegalStateException("Android could not open the gallery photo.");
                output.write(bytes);
            }

            ContentValues published = new ContentValues();
            published.put(MediaStore.Images.Media.IS_PENDING, 0);
            getContext().getContentResolver().update(photoUri, published, null, null);

            JSObject result = new JSObject();
            result.put("uri", photoUri.toString());
            result.put("hasGps", latitude != null && longitude != null);
            call.resolve(result);
        } catch (Exception error) {
            if (photoUri != null) getContext().getContentResolver().delete(photoUri, null, null);
            call.reject("Could not save this photo to the phone Gallery.", error);
        } finally {
            if (stampedFile != null) stampedFile.delete();
        }
    }
}
