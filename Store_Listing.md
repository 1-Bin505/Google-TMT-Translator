Chrome Web Store --- Publishing Guide
===================================

This document walks you through publishing TMT Translation to the Chrome Web Store.

* * * * *

📦 Step 1: Prepare the ZIP Package
----------------------------------

Only include the files the extension needs. **Do not include** `README.md`, `STORE_LISTING.md`, `.git/`, or any dev files.

```
# From the project root (one level above tmt-translation/)
zip -r tmt-translation-v1.0.0.zip tmt-translation/\
  --exclude "*.DS_Store"\
  --exclude "*/.git/*"\
  --exclude "*/README.md"\
  --exclude "*/STORE_LISTING.md"

```

Contents of the ZIP should be:

```
tmt-translation/
  manifest.json
  icons/
  src/

```

* * * * *

🖼️ Step 2: Prepare Store Assets
--------------------------------

### Required

| Asset | Size | Notes |
| --- | --- | --- |
| Extension icon | 128×128 px PNG | Already at `icons/icon128.png` |
| Store icon | 128×128 px PNG | Same file |
| At least 1 screenshot | 1280×800 or 640×400 | Capture the popup in action |

### Recommended

| Asset | Size |
| --- | --- |
| Promotional tile (small) | 440×280 px |
| Marquee promo tile | 1400×560 px |

**Capture screenshots:**

1.  Load the extension locally
2.  Open the popup and translate something
3.  Use Chrome's built-in screenshot or Lightshot

* * * * *

🏪 Step 3: Create a Developer Account
-------------------------------------

1.  Go to: https://chrome.google.com/webstore/devconsole
2.  Sign in with a Google account
3.  Pay the **one-time $5 registration fee**
4.  Accept the Developer Agreement

* * * * *

📤 Step 4: Submit the Extension
-------------------------------

1.  In the Developer Dashboard, click **"New Item"**
2.  Upload your `tmt-translation-v1.0.0.zip`
3.  Fill in the **Store listing** fields:

### Suggested Store Listing Copy

**Name:**

```
TMT Translation

```

**Short Description (132 chars max):**

```
Translate between English, Nepali, and Tamang instantly. Fast, private, and powered by the TMT API.

```

**Detailed Description:**

```
TMT Translation lets you translate text between English, Nepali (नेपाली), and Tamang (तामाङ) directly in your browser --- no tab switching, no copying and pasting.

FEATURES
- Clean popup with source and target language selectors
- Supports English, Nepali, and Tamang
- Swap languages with one click
- Copy results to clipboard instantly
- Right-click any selected text to translate it
- Keyboard shortcut: Ctrl+Shift+T (⌘+Shift+T on Mac)
- Auto-fills with text you've already selected on the page
- Dark mode follows your system preference
- In-memory caching for instant repeated translations
- Your API key is stored privately in your browser

PRIVACY
This extension does not collect, store, or share any personal data. Translations are sent directly to the TMT API (tmt.ilprl.ku.edu.np) using your own API key.

SETUP
After installing, click the extension icon → Settings → enter your TMT API key → Save.

```

**Category:** `Productivity`

**Language:** `English`

* * * * *

🔐 Step 5: Privacy & Permissions Justification
----------------------------------------------

You will be asked to justify permissions. Use these explanations:

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's API key and language preferences locally |
| `contextMenus` | Adds "Translate with TMT" to the right-click menu for selected text |
| `activeTab` | Reads selected text from the current tab when the popup opens |
| `scripting` | Injects a toast notification to display context menu results |
| `host_permissions: tmt.ilprl.ku.edu.np` | Required to call the TMT Translation API |

**Privacy Policy URL:** You must host a privacy policy. A minimal one:

```
TMT Translation does not collect, transmit, or store any personal data on external servers.
Your API key is stored locally using Chrome's built-in storage API (chrome.storage.sync).
Translation requests are sent directly from your browser to the TMT API endpoint.
No usage analytics, tracking, or telemetry is employed.

```

Host this as a plain webpage (e.g. GitHub Pages) and paste the URL in the Store listing.

* * * * *

✅ Step 6: Submit for Review
---------------------------

1.  Click **"Submit for Review"**
2.  Google typically reviews within **1--3 business days**
3.  You'll receive an email when approved or if changes are needed

* * * * *

🔄 Publishing Updates
---------------------

1.  Increment the version in `manifest.json` (e.g. `"version": "1.0.1"`)
2.  Re-zip the project
3.  In the Developer Dashboard → your extension → **"Package"** → **"Upload new package"**
4.  Submit for review

* * * * *

📋 Pre-submission Checklist
---------------------------

-   [ ] `manifest.json` version incremented
-   [ ] All icons present (16, 32, 48, 128px)
-   [ ] Extension tested in Chrome with Developer Mode
-   [ ] API key flow tested (add → translate → remove)
-   [ ] Dark mode tested (switch system theme)
-   [ ] Context menu tested on a webpage
-   [ ] Screenshots captured (1280×800)
-   [ ] Privacy policy URL ready
-   [ ] ZIP does not include dev files
