# Google_TMT_Translator - Browser Extension
A lightweight browser extension for real-time translation between Nepali, English, and Tamang directly from your toolbar.

Overview
--------

TMT Translation is a Chrome/Edge extension that lets users translate text without leaving their current tab. It integrates with the TMT Translation API to provide fast, accurate multilingual translation across three languages as follows:

-   English
-   Nepali (नेपाली)
-   Tamang (तामाङ)

* * * * *

Features
--------

### Popup Translation

-   Clean toolbar popup with source and target language selectors
-   Type or paste any text and translate instantly
-   Copy result to clipboard with one click
-   Character counter (up to 2000 characters)
-   Clear button to reset input and output

### Selection Translation

-   Select text on any webpage and click the extension icon
-   Popup opens with the selected text pre-filled and automatically translated
-   No copy-paste needed

### Right-Click Translation

-   Select text on any webpage
-   Right-click → **"Translate with TMT"**
-   Translation appears as a toast notification on the page

### Language Controls

-   Swap source and target languages with one click
-   Language preference is remembered across sessions
-   Prevents selecting the same language on both sides

### Settings

-   Secure API key management via the built-in Settings panel
-   Key is stored locally in the browser --- never hardcoded
-   Show/hide key toggle for safe entry


* * * * *

API Integration
---------------

### TMT Translation API

-   Used for all translation between English, Nepali, and Tamang
-   Works at sentence-level granularity --- text is split sentence by sentence, translated sequentially, then reassembled
-   A 150ms delay is applied between sentences to respect server rate limits
-   All API calls are routed through the background service worker to avoid CORS issues and protect the API key

* * * * *

### Sentence-Level Translation Constraint

The TMT API translates one sentence at a time.

**Solution:**

-   Text is split on `.` `!` `?` `।` (Devanagari danda)
-   Each sentence is translated sequentially
-   Results are rejoined and displayed as a single output

### In-Memory Caching

Repeated translations of the same text and language pair return instantly from cache without making a new API call.

### API Key Security

-   The API key is never hardcoded in source files
-   Stored using `chrome.storage.sync` --- encrypted by Chrome, never exposed in the codebase
-   Removed from storage entirely (not set to empty string) when cleared, preventing stale state bugs

### Network Error Recovery

-   If the browser goes offline, a clear error message is shown
-   When the browser comes back online, the error is automatically cleared so the user can try again

* * * * *

Limitations
-----------

-   Depends on TMT API availability
-   Sentence-level processing introduces slight latency on longer texts
-   Requires a stable internet connection
-   Maximum 2000 characters per translation request


* * * * *

System Architecture
-------------------

```
┌──────────────────────────────┐
│        User Browser          │  
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│     Content Script Layer     │
│  - Reads selected page text  │
│  - Shows toast notifications │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│    Background Script Layer   │
│  - Handles API calls         │
│  - Context menu integration  │
│  - Message relay (CORS safe) │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│        TMT API               │
│  Translation (sentence-level)│
└──────────────────────────────┘

```

* * * * *


Future Improvements
-------------------

-   Parallel sentence translation for faster performance
-   Offline fallback mode
-   Extended language support
-   Translation history log
-   Auto language detection

* * * * *



📁 Project Structure
--------------------

```
tmt-translation/
├── manifest.json                  # Chrome extension config (Manifest V3)
├── icons/                         # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── shared/
    │   ├── languages.js           # Language code definitions and normalization
    │   └── api.js                 # TMT API client --- caching, storage, error handling
    ├── background/
    │   └── background.js          # Service worker --- context menu, API relay
    ├── content/
    │   └── content.js             # Page-level toast for right-click results
    └── popup/
        ├── popup.html             # Popup UI layout
        ├── popup.css              # Styles --- light and dark mode
        └── popup.js               # All popup interaction logic

```

* * * * *

🚀 Installation
---------------

### Option 1 --- Download ZIP (Recommended)

**[⬇ Download tmt-translation-extension.zip](https://claude.ai/releases/latest/download/tmt-translation-extension.zip)**

1.  Download and unzip the file
2.  Open Chrome and go to `chrome://extensions`
3.  Enable **Developer Mode** (toggle in the top-right corner)
4.  Click **Load unpacked**
5.  Select the `tmt-translation/` folder --- the one containing `manifest.json`
6.  The **TMT Translation** icon appears in your toolbar

> 📌 Pin the extension by clicking the puzzle piece icon → pin TMT Translation.

### Option 2 --- Clone the Repository

```
git clone https://github.com/YOUR_USERNAME/tmt-translation.git

```

Then follow steps 2--6 above, selecting the cloned folder.

* * * * *

🔑 Adding Your API Key
----------------------

1.  Click the **TMT Translation** icon in the toolbar
2.  Click the **⚙** Settings icon in the top-right
3.  Paste your API key into the **"API Key"** field
4.  Click **Save Key**
5.  You will see a **✓ Saved** confirmation

Your key is stored locally and only used to authenticate requests to the TMT API.

* * * * *

🌐 How to Use
-------------

### Translate Text in the Popup

1.  Click the **TMT Translation** toolbar icon
2.  Select source and target languages from the dropdowns
3.  Type or paste text in the input box
4.  Click **Translate**
5.  The translation appears in the output box below
6.  Click **Copy** to copy the result to your clipboard

### Translate Selected Page Text (Auto)

1.  Select any text on a webpage with your mouse
2.  Click the **TMT Translation** toolbar icon
3.  The popup opens with the selected text pre-filled and translation starts automatically

### Translate Selected Page Text (Right-Click)

1.  Select any text on a webpage
2.  Right-click → choose **"Translate with TMT"**
3.  A notification appears on the page with the translation

* * * * *

🌍 Supported Languages
----------------------

| Language | Native Name | API Code |
| --- | --- | --- |
| English | English | `en` |
| Nepali | नेपाली | `ne` |
| Tamang | तामाङ | `tmg` |

Source and target languages must always be different.

* * * * *

🔒 Security and Privacy
-----------------------

-   API key is stored in `chrome.storage.sync` --- encrypted by Chrome, never exposed in source code
-   The extension only communicates with `tmt.ilprl.ku.edu.np`
-   No analytics, no tracking, no third-party services
-   All source code is open and auditable in this repository

* * * * *

🐛 Troubleshooting
------------------

| Problem | Fix |
| --- | --- |
| Blue banner says "API key not set" | Go to ⚙ Settings → paste your key → Save Key |
| "Invalid API key" error | Check your key has no extra spaces at the start or end |
| "Network error" message | Check your internet connection --- the message clears automatically when you reconnect |
| "Source and target must be different" | Change one of the language dropdowns |
| Extension not appearing after loading | Make sure you selected the folder containing `manifest.json`, not the ZIP itself |
| Right-click menu not showing | Go to `chrome://extensions` → find TMT Translation → click the refresh ↺ icon |

* * * * *

📋 API Reference
----------------

**Endpoint:** `POST https://tmt.ilprl.ku.edu.np/lang-translate`

**Headers:**

```
Content-Type: application/json
Authorization: Bearer <your-api-key>

```

**Request body:**

```
{
  "text": "Hello, how are you?",
  "src_lang": "en",
  "tgt_lang": "ne"
}

```

**Success response:**

```
{
  "message_type": "SUCCESS",
  "message": "Translation successful",
  "src_lang": "English",
  "input": "Hello, how are you?",
  "target_lang": "Nepali",
  "output": "नमस्ते, तपाईं कस्तो हुनुहुन्छ?",
  "timestamp": "2026-04-25T10:32:00Z"
}

```

**Error response:**

```
{
  "message": "Invalid API token"
}

```

> Translated text is always in the `output` field. Error responses do not include `message_type` --- only a `message` string.

* * * * *

🏁Built for Google TMT Hackathon 2026 --- Track 1
------------------------------------------------
