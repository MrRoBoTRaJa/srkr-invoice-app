package com.srkr.invoice;

import android.annotation.SuppressLint;
import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

import org.json.JSONObject;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    private static final String UPDATE_URL =
            "https://raw.githubusercontent.com/MrRoBoTRaJa/srkr-invoice-app/main/update.json";

    private WebView webView;
    private WebViewAssetLoader assetLoader;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestStoragePermissionIfNeeded();

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        webView.addJavascriptInterface(new FileBridge(), "AndroidFile");
        webView.addJavascriptInterface(new UpdateBridge(), "AndroidUpdater");

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(
                    WebView view,
                    android.webkit.WebResourceRequest request
            ) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });
        webView.setWebChromeClient(new WebChromeClient());
        webView.loadUrl("https://appassets.androidplatform.net/assets/app/index.html");
    }

    public class FileBridge {
        @JavascriptInterface
        public void saveFile(String filename, String mimeType, String base64Data) {
            runOnUiThread(() -> {
                try {
                    byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        saveToDownloads(filename, mimeType, bytes);
                    } else {
                        saveToLegacyDownloads(filename, bytes);
                    }
                    Toast.makeText(MainActivity.this, "Saved: " + filename, Toast.LENGTH_LONG).show();
                } catch (Exception error) {
                    Toast.makeText(MainActivity.this, "Save failed: " + error.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    public class UpdateBridge {
        @JavascriptInterface
        public void checkUpdate(boolean userRequested) {
            checkForUpdate(userRequested);
        }
    }

    private void checkForUpdate(boolean userRequested) {
        new Thread(() -> {
            try {
                String json = readUrl(UPDATE_URL);
                JSONObject info = new JSONObject(json);
                int latestCode = info.optInt("versionCode", 0);
                String versionName = info.optString("versionName", "");
                String apkUrl = info.optString("apkUrl", "");
                String notes = info.optString("notes", "");
                if (latestCode > BuildConfig.VERSION_CODE && !apkUrl.isEmpty()) {
                    runOnUiThread(() -> showUpdateDialog(versionName, notes, apkUrl));
                } else if (userRequested) {
                    runOnUiThread(() -> Toast.makeText(
                            MainActivity.this,
                            "App is already up to date",
                            Toast.LENGTH_LONG
                    ).show());
                }
            } catch (Exception error) {
                if (userRequested) {
                    runOnUiThread(() -> Toast.makeText(
                            MainActivity.this,
                            "Update check failed: " + error.getMessage(),
                            Toast.LENGTH_LONG
                    ).show());
                }
            }
        }).start();
    }

    private void showUpdateDialog(String versionName, String notes, String apkUrl) {
        String message = "New version available";
        if (!versionName.isEmpty()) {
            message += ": " + versionName;
        }
        if (!notes.isEmpty()) {
            message += "\n\n" + notes;
        }
        new AlertDialog.Builder(this)
                .setTitle("Update Available")
                .setMessage(message)
                .setPositiveButton("Download", (dialog, which) -> downloadAndInstallUpdate(apkUrl))
                .setNegativeButton("Later", null)
                .show();
    }

    private void downloadAndInstallUpdate(String apkUrl) {
        Toast.makeText(this, "Downloading update...", Toast.LENGTH_LONG).show();
        new Thread(() -> {
            try {
                File apkFile = downloadApk(apkUrl);
                runOnUiThread(() -> installApk(apkFile));
            } catch (Exception error) {
                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this,
                        "Update download failed: " + error.getMessage(),
                        Toast.LENGTH_LONG
                ).show());
            }
        }).start();
    }

    private File downloadApk(String apkUrl) throws Exception {
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) {
            dir = getCacheDir();
        }
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException("Could not create update folder");
        }
        File outFile = new File(dir, "SRKR-Invoice-update.apk");
        HttpURLConnection connection = (HttpURLConnection) new URL(apkUrl).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);
        connection.setRequestProperty("Accept", "application/vnd.android.package-archive,*/*");
        try (InputStream input = connection.getInputStream();
             FileOutputStream output = new FileOutputStream(outFile)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
        } finally {
            connection.disconnect();
        }
        return outFile;
    }

    private void installApk(File apkFile) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(this, "Allow Install unknown apps, then tap Update again", Toast.LENGTH_LONG).show();
            Intent settingsIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName())
            );
            startActivity(settingsIntent);
            return;
        }
        Uri apkUri = FileProvider.getUriForFile(
                this,
                getPackageName() + ".provider",
                apkFile
        );
        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(installIntent);
    }

    private String readUrl(String urlString) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlString).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(20000);
        try (InputStream input = connection.getInputStream()) {
            byte[] buffer = new byte[4096];
            StringBuilder builder = new StringBuilder();
            int read;
            while ((read = input.read(buffer)) != -1) {
                builder.append(new String(buffer, 0, read, java.nio.charset.StandardCharsets.UTF_8));
            }
            return builder.toString();
        } finally {
            connection.disconnect();
        }
    }

    private void saveToDownloads(String filename, String mimeType, byte[] bytes) throws Exception {
        ContentResolver resolver = getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
        values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        android.net.Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new IllegalStateException("Could not open Downloads");
        }
        try (OutputStream stream = resolver.openOutputStream(uri)) {
            if (stream == null) {
                throw new IllegalStateException("Could not write file");
            }
            stream.write(bytes);
        }
    }

    private void saveToAppDocuments(String filename, byte[] bytes) throws Exception {
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
        if (dir == null) {
            dir = getFilesDir();
        }
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException("Could not create folder");
        }
        File outFile = new File(dir, filename);
        try (FileOutputStream stream = new FileOutputStream(outFile)) {
            stream.write(bytes);
        }
    }

    private void saveToLegacyDownloads(String filename, byte[] bytes) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            saveToAppDocuments(filename, bytes);
            return;
        }
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException("Could not create Downloads folder");
        }
        File outFile = new File(dir, filename);
        try (FileOutputStream stream = new FileOutputStream(outFile)) {
            stream.write(bytes);
        }
    }

    private void requestStoragePermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, 1001);
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }
}
