# SongHistory

A lightweight Spicetify extension that automatically logs your Spotify listening history locally on your device. Never lose track of your music habits with a secure, searchable, and persistent local cache.

## Features

* **Smart Listening Threshold:** Tracks are only logged after actively listening for a customizable duration (default: 12 seconds), preventing skips from cluttering your history.
* **Topbar Integration:** Access your history directly inside Spotify using the dedicated listening history icon injected right into the topbar.
* **In-App Interactive Modal:** A beautifully styled user interface to browse your history, group logs by day, and check exact timestamps.
* **Instant Playback Control:** Hover over any track in your history log to immediately replay it or remove it from your history.
* **Advanced Search:** Real-time filtering lets you query by song name, artist name, or album title instantly.
* **Seamless Navigation:** Clicking on an artist or album inside your history seamlessly redirects you to their official Spotify pages.
* **Push Notifications:** Displays a native Spicetify notification popup every time a track is successfully committed to your history.

## Installation

### Method 1: Spicetify Marketplace (Recommended)
1. Open the **Marketplace** tab in your Spotify client.
2. Search for `SongHistory`.
3. Click **Install** and restart Spotify if prompted.

### Method 2: Manual Installation
1. Navigate to your Spicetify extensions folder:
   * **Windows:** `%userprofile%\.spicetify\Extensions\`
   * **Linux/macOS:** `~/.spicetify/Extensions/`
2. Create a file named `songHistory.js` and paste the extension code inside it.
3. Run the following commands in your terminal:
   ```bash
   spicetify config extensions songHistory.js
   spicetify apply
   ```

## Configuration & Settings

The extension adds a control panel directly at the top of the history view:
* **Save After Slider:** Adjust the required listening threshold anywhere between 1 and 60 seconds.
* **Notifications Toggle:** Turn the "Added to history" popup notifications on or off.
* **Clear History:** A master reset button to wipe your local cache completely (requires confirmation).

## Technical Details

* **Storage Limits:** Your history safely queues up to 5,000 tracks before automatically rotating out old logs.
* **Data Persistence:** All logs and configurations are safely stored in your client's `Spicetify.LocalStorage` layer under custom namespace keys.
* **Developer Tools:** The extension exposes a global `window.SongHistoryDebug` object in the console, allowing you to fetch raw history objects, manually tweak thresholds, or debug playback states.

## License

Proprietary / All Rights Reserved. 
This extension is free for personal use. Modification, redistribution, or commercial use of this code is strictly prohibited.
