# Running on Physical Device - Developer Guide

Since this app uses native modules (BLE, NFC), you need a **custom development build** (not Expo Go).

## Prerequisites

### For iOS:
- Mac computer
- Xcode installed
- Apple Developer account (free for development)
- iPhone connected via USB or on same WiFi

### For Android:
- Android Studio installed
- Android device with USB debugging enabled
- OR Android emulator

---

## Method 1: EAS Build (Cloud Build) - Recommended

### Step 1: Install EAS CLI
```bash
npm install -g eas-cli
```

### Step 2: Login to EAS
```bash
eas login
```

### Step 3: Build Development Client

**For iOS:**
```bash
eas build --profile development --platform ios
```
- This will create a build in the cloud
- You'll get a link to download the `.ipa` file
- Install via TestFlight or direct download

**For Android:**
```bash
eas build --profile development --platform android
```
- You'll get a download link for the `.apk` file
- Install directly on your Android device

### Step 4: Start Development Server
```bash
npx expo start --dev-client
```

### Step 5: Connect Your Device
- Open the development build app on your phone
- Scan the QR code or enter the URL shown in terminal
- The app will load your code

---

## Method 2: Local Build (Faster for Development)

### For iOS:

1. **Connect your iPhone via USB** (or ensure same WiFi)

2. **Build and install:**
```bash
npx expo run:ios --device
```

3. **Select your device** when prompted

4. **The app will build and install automatically**

5. **Start dev server:**
```bash
npx expo start --dev-client
```

**Note:** First build may take 10-15 minutes. Subsequent builds are faster.

### For Android:

1. **Enable USB Debugging** on your Android device:
   - Settings → About Phone → Tap "Build Number" 7 times
   - Settings → Developer Options → Enable "USB Debugging"

2. **Connect device via USB** (or use WiFi debugging)

3. **Build and install:**
```bash
npx expo run:android --device
```

4. **The app will build and install automatically**

5. **Start dev server:**
```bash
npx expo start --dev-client
```

---

## Troubleshooting

### iOS Issues:

**"No devices found":**
- Ensure device is unlocked and trusted
- Check Xcode → Window → Devices and Simulators
- Try: `xcrun xctrace list devices`

**Code signing errors:**
- Open project in Xcode: `open ios/movuapp.xcworkspace`
- Select your team in Signing & Capabilities
- Free Apple Developer account works for development

**Build fails:**
- Clean build: `cd ios && xcodebuild clean && cd ..`
- Rebuild: `npx expo run:ios --device --clean`

### Android Issues:

**"No devices found":**
- Check: `adb devices`
- Ensure USB debugging is enabled
- Try: `adb kill-server && adb start-server`

**Build fails:**
- Clean: `cd android && ./gradlew clean && cd ..`
- Rebuild: `npx expo run:android --device --clean`

### General:

**App won't connect to dev server:**
- Ensure phone and computer are on same WiFi network
- Check firewall settings
- Try: `npx expo start --dev-client --tunnel` (slower but more reliable)

**BLE/NFC not working:**
- ✅ **Must use physical device** (not simulator/emulator)
- ✅ Ensure Bluetooth/NFC is enabled on device
- ✅ Grant app permissions when prompted

---

## Quick Commands Reference

```bash
# Start dev server
npx expo start --dev-client

# Build and run on iOS device
npx expo run:ios --device

# Build and run on Android device
npx expo run:android --device

# EAS cloud build (iOS)
eas build --profile development --platform ios

# EAS cloud build (Android)
eas build --profile development --platform android
```

---

## First Time Setup Tips

1. **iOS:** First build requires Xcode to compile native code (~10-15 min)
2. **Android:** First build downloads Gradle dependencies (~5-10 min)
3. **Subsequent builds:** Much faster (only changed code recompiles)
4. **Hot reload:** Works after initial build - just save files and app updates!

---

## Need Help?

- Check Expo docs: https://docs.expo.dev/development/introduction/
- EAS Build docs: https://docs.expo.dev/build/introduction/
- React Native BLE: https://github.com/dotintent/react-native-ble-plx
