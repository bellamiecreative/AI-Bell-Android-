# AI Bell Android APK

This project packages the AI Bell web app into a simple Android APK using an Android WebView.

## Build
Push this folder to GitHub. GitHub Actions will build `app-debug.apk` automatically. Open Actions -> Build AI Bell APK -> latest successful run -> Artifacts -> AI-Bell-debug-apk.

The app requires internet access because the AI Bell web app loads Transformers.js and model files from the web. The model itself runs locally on the device once loaded.
