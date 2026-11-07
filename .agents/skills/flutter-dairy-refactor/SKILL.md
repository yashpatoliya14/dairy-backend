---
name: flutter-dairy-refactor
description: >-
  Architectural patterns, GetX state management, offline-first sync, and modular refactoring guide
  for the DairyDesk Flutter mobile app. Use when editing or refactoring Flutter code in dairy/,
  splitting large widget files, managing local storage, or handling offline milk entry collection.
---

# DairyDesk Flutter App Architecture & Refactoring Skill

This skill guides development, state management, offline caching, and refactoring for the DairyDesk Flutter application (`d:\Recap_Milk_MAnagement\dairy`).

## Architecture & State Management (GetX)

The app utilizes **GetX** (`get: ^4.7.3`) for state management, dependency injection, and navigation.

### Clean Project Directory Structure
```text
lib/
├── controllers/          # GetxControllers (Auth, Customer, MilkEntry, Billing)
├── models/               # Data classes & JSON serialization
├── services/             # Http API clients, Local Storage, WhatsApp Launcher
├── views/                # Screen widgets (Dashboard, EntryScreen, CustomerList)
├── widgets/              # Reusable UI components (MetricCard, ShiftSelector)
├── routes/               # AppRoutes and GetPages
└── main.dart             # App initialization and runApp() only
```

---

## Refactoring Guidelines: De-monolithing `main.dart`

> [!IMPORTANT]
> Keep `main.dart` lean (< 100 lines). It should only initialize bindings, setup themes, and launch `GetMaterialApp`.

1. **Extract Screens into Views**:
   - Move collection screens, customer registers, and settings into `lib/views/<feature>/`.
2. **Extract Business Logic into Controllers**:
   - Any `setState()` or API calling logic in stateful widgets belongs in a `GetxController`.
   - Use reactive variables (`.obs`) for reactive updates:
     ```dart
     class MilkEntryController extends GetxController {
       var liters = 0.0.obs;
       var rate = 60.0.obs;
       double get total => (liters.value * rate.value);
     }
     ```

---

## Offline-First Milk Collection Pattern

In rural collection centers, internet connectivity fluctuates:
1. **Cache Locally First**:
   - Save entries to `shared_preferences` (or local SQLite/Hive queue) with status `'pending_sync'`.
2. **Background Sync**:
   - When network connectivity is restored, iterate through pending entries and dispatch them to the NestJS backend batch endpoint.
3. **Safe Numeric Parsing**:
   - Farmers or collectors may enter numbers with commas or trailing dots. Always sanitize before `double.tryParse()`:
   ```dart
   double parseInput(String input) {
     final clean = input.replaceAll(',', '.').trim();
     return double.tryParse(clean) ?? 0.0;
   }
   ```

---

## WhatsApp Receipt Launching via `url_launcher`

Direct WhatsApp delivery slip sharing from the mobile app:
```dart
import 'package:url_launcher/url_launcher.dart';

Future<void> sendWhatsAppSlip({required String phone, required String message}) async {
  final cleanPhone = phone.replaceAll(RegExp(r'\D'), '');
  final encodedMsg = Uri.encodeComponent(message);
  final uri = Uri.parse('whatsapp://send?phone=$cleanPhone&text=$encodedMsg');
  
  if (await canLaunchUrl(uri)) {
    await launchUrl(uri);
  } else {
    // Fallback to web WhatsApp URL
    final webUri = Uri.parse('https://wa.me/$cleanPhone?text=$encodedMsg');
    await launchUrl(webUri, mode: LaunchMode.externalApplication);
  }
}
```

---

## Build & Release Verification
- Build APK:
  ```bash
  flutter build apk --release
  ```
- Build smaller per-architecture APKs:
  ```bash
  flutter build apk --split-per-abi
  ```
