#!/usr/bin/env bash
# Builds calc30x.apk with the Android SDK command-line tools only (no Gradle).
set -euo pipefail
cd "$(dirname "$0")"
SDK="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"
BT="$SDK/build-tools/36.0.0"
JAR="$SDK/platforms/android-37.0/android.jar"
rm -rf build && mkdir -p build/classes build/dex

node test/engine.test.js
python android/make_icon.py android/res web

"$BT/aapt2" compile --dir android/res -o build/res.zip
"$BT/aapt2" link -o build/unsigned.apk -I "$JAR" --manifest android/AndroidManifest.xml -A web build/res.zip \
  --min-sdk-version 21 --target-sdk-version 34 --version-code 1 --version-name 1.0
javac -nowarn --release 11 -classpath "$JAR" -d build/classes android/src/de/calc30x/MainActivity.java
"$BT/d8.bat" --release --lib "$JAR" --min-api 21 --output build/dex build/classes/de/calc30x/*.class
python -c "import zipfile,sys; z=zipfile.ZipFile('build/unsigned.apk','a'); z.write('build/dex/classes.dex','classes.dex'); z.close()"
"$BT/zipalign" -f -p 4 build/unsigned.apk build/aligned.apk
KEYTOOL="$(java -XshowSettings:properties -version 2>&1 | sed -n "s/.*java.home = //p")/bin/keytool"
[ -f debug.keystore ] || "$KEYTOOL" -genkeypair -keystore debug.keystore -storepass android -keypass android -alias calc \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=calc30x" >/dev/null 2>&1
"$BT/apksigner.bat" sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android --out calc30x.apk build/aligned.apk
"$BT/apksigner.bat" verify calc30x.apk && ls -la calc30x.apk
