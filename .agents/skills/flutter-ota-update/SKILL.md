---
name: flutter-ota-update
description: >-
  Standard operating procedure for DairyDesk Flutter APK over-the-air (OTA) background auto-updates,
  version bumping, backend release configuration, mandatory upgrade lockout gating, and GitHub Release APK hosting.
  Use whenever modifying, fixing, or deploying Flutter mobile app changes, bumping versions, or diagnosing update issues.
---

# Flutter Mobile OTA Version & Background Auto-Update Protocol

This skill details the architecture and step-by-step workflow for distributing and enforcing mobile APK updates over-the-air (OTA) without relying on Google Play Store.

## Architecture Overview

```
                      +---------------------------------------+
                      |       Flutter App (Client)            |
                      | - AppUpdateService (periodic check)   |
                      | - DashboardController.load() (gate)   |
                      | - AppUpdateScreen (lockout UI)        |
                      +-------------------+-------------------+
                                          |
                      GET /app/version?currentVersion=x&buildNumber=y
                                          |
                                          v
                      +---------------------------------------+
                      |         NestJS Backend API            |
                      | - AppController (/app/version)        |
                      | - AppService (versionConfig)          |
                      | - /app/download-latest (redirect)     |
                      +-------------------+-------------------+
                                          |
                        302 redirect / direct download
                                          |
                                          v
                      +---------------------------------------+
                      |       GitHub Releases CDN / Public    |
                      | - v1.0.x/app-release.apk (Fast CDN)   |
                      +---------------------------------------+
```

### Key Components

1. **Client Version Constants**:
   - `dairy/pubspec.yaml`: `version: X.Y.Z+B` (e.g., `1.0.2+3`)
   - `dairy/lib/services/app_update_service.dart`:
     - `static const String currentVersion = 'X.Y.Z';`
     - `static const int currentBuildNumber = B;`

2. **Background Check & Mandatory Lockout**:
   - `AppUpdateService` polls `GET /app/version` silently on launch and periodically.
   - `DashboardController.load()` checks for updates before fetching any dashboard data.
   - If `hasUpdate == true` or `mustForceUpdate == true`:
     - Loading dashboard is immediately halted.
     - `AppUpdateScreen` is displayed covering the screen.
     - `_DashboardState.build()` renders a blank screen behind the update screen to prevent user interaction with old data.
     - No update icons or nagging bars in the AppBar/Header—the screen transitions directly to the mandatory update page.

3. **Backend Version Configuration**:
   - `backend/src/app.service.ts`:
     - `latestVersion`: semantic version string (e.g. `'1.0.2'`)
     - `buildNumber`: integer build number (e.g. `3`)
     - `minSupportedVersion`: threshold below which app is locked (e.g. `'1.0.2'`)
     - `forceUpdate`: boolean (`true` locks out outdated clients)
     - `downloadUrl`: direct link to APK (GitHub Release or `/app/download-latest`)
     - `releaseNotes`: bulleted description of what's new for the user.

---

## Mandatory Release Checklist

Whenever building a feature, making a bugfix, or releasing an update to DairyDesk:

### Step 1: Bump Mobile App Version
1. Edit `dairy/pubspec.yaml`:
   ```yaml
   version: 1.0.2+3 # Bump semantic version and build number
   ```
2. Edit `dairy/lib/services/app_update_service.dart`:
   ```dart
   static const String currentVersion = '1.0.2';
   static const int currentBuildNumber = 3;
   ```

### Step 2: Update Backend Version Service
1. Edit `backend/src/app.service.ts`:
   - Set `latestVersion`, `buildNumber`, `minSupportedVersion`, and `forceUpdate: true`.
   - Update `releaseNotes` with human-readable summary of changes.
   - Set `downloadUrl` to the target GitHub release or download route.
2. Update unit tests in `backend/src/app.controller.spec.ts` to match the new version and run:
   ```bash
   cd backend && npm.cmd test
   ```

### Step 3: Compile Release APK
```bash
cd dairy
flutter build apk --release
```
The compiled binary will be located at `dairy/build/app/outputs/flutter-apk/app-release.apk`.
Copy it to `dairy/release/app-release.apk`.

### Step 4: Publish Release to GitHub & Backend
1. Create a GitHub Release with the APK attached:
   ```bash
   gh release create v1.0.2 dairy/release/app-release.apk --repo yashpatoliya14/dairy --title "v1.0.2" --notes "Release notes here"
   ```
2. Commit and push backend changes to GitHub (`master`, `main`):
   ```bash
   git add src/app.service.ts src/app.controller.spec.ts
   git commit -m "feat(release): bump app version to 1.0.2+3"
   git push origin master
   git push origin main
   ```
3. Trigger deployment on Render (Dashboard -> Manual Deploy -> Deploy latest commit, or via deploy hook).

---

## Rules to Enforce
- **Zero Silent Data Access**: Never let an outdated APK proceed to dashboard when a mandatory update is pending.
- **Silent Network Failures**: Never show alarming red error popups if the user is offline or the server is momentarily unreachable during an update check. Only show UI when an update is confirmed available.
- **Dynamic Profile Version**: `ProfilePage` in settings must always display `AppUpdateService.currentVersion (Build AppUpdateService.currentBuildNumber)`.
