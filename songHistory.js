// START METADATA
// NAME: SongHistory
// VERSION: 0.7.1
// AUTHOR: Zurieexd
// DESCRIPTION: Local Spotify listening history tracker.
// END METADATA

(function songHistory() {
    if (
        !Spicetify?.Player ||
        !Spicetify?.LocalStorage ||
        !Spicetify?.PopupModal ||
        !Spicetify?.Platform ||
        !Spicetify?.Topbar
    ) {
        setTimeout(songHistory, 100);
        return;
    }

    // CONFIG

    const STORAGE_KEY = "songHistory:history";
    const SETTINGS_KEY = "songHistory:settings";
    const MAX_HISTORY = 5000;

    const DEFAULT_LISTEN_SECONDS = 12;
    const MIN_LISTEN_SECONDS = 1;
    const MAX_LISTEN_SECONDS = 60;

    const DEFAULT_SHOW_NOTIFICATIONS = true;

    // SETTINGS

    // SETTINGS

    function getSettings() {
        try {
            const raw = Spicetify.LocalStorage.get(SETTINGS_KEY);

            if (!raw) {
                return {
                    listenSeconds: DEFAULT_LISTEN_SECONDS,
                    showNotifications: DEFAULT_SHOW_NOTIFICATIONS,
                };
            }

            const parsed = JSON.parse(raw);

            return {
                listenSeconds: Number.isFinite(Number(parsed.listenSeconds))
                    ? Math.min(
                          MAX_LISTEN_SECONDS,
                          Math.max(MIN_LISTEN_SECONDS, Number(parsed.listenSeconds))
                      )
                    : DEFAULT_LISTEN_SECONDS,

                showNotifications:
                    typeof parsed.showNotifications === "boolean"
                        ? parsed.showNotifications
                        : DEFAULT_SHOW_NOTIFICATIONS,
            };
        } catch (error) {
            console.error("SongHistory: failed to load settings", error);

            return {
                listenSeconds: DEFAULT_LISTEN_SECONDS,
                showNotifications: DEFAULT_SHOW_NOTIFICATIONS,
            };
        }
    }

    function saveSettings(settings) {
        try {
            Spicetify.LocalStorage.set(SETTINGS_KEY, JSON.stringify(settings));
        } catch (error) {
            console.error("SongHistory: failed to save settings", error);
        }
    }

    function getListenThresholdMs() {
        return getSettings().listenSeconds * 1000;
    }

    // CURRENT SESSH

    let currentTrack = null;
    let currentUri = null;
    let currentStartedAt = null;

    let listenedMs = 0;

    let lastTick = null;
    let lastPosition = 0;

    let savedCurrentPlay = false;

    const ICON_HISTORY = `
        <svg
            role="img"
            height="24"
            width="48"
            viewBox="0 0 16 16"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path d="M8 1.25a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z"/>
            <path d="M8.5 8.25V4.5a.75.75 0 0 0-1.5 0v4.25c0 .2.08.39.22.53l2.5 2.5a.75.75 0 1 0 1.06-1.06L8.5 8.25z"/>
        </svg>
    `;

    const ICON_SEARCH = `
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <circle
                cx="11"
                cy="11"
                r="6.5"
                stroke="currentColor"
                stroke-width="1.8"
            />
            <path
                d="M16 16L21 21"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
            />
        </svg>
    `;

    const ICON_PLAY = `
        <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path d="M8 5v14l11-7L8 5z"/>
        </svg>
    `;

    const ICON_DELETE = `
        <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path
                d="M7 7l10 10M17 7L7 17"
                stroke="currentColor"
                stroke-width="2.3"
                stroke-linecap="round"
            />
        </svg>
    `;

    const ICON_CLOSE = `
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path
                d="M7 7l10 10M17 7L7 17"
                stroke="currentColor"
                stroke-width="2.6"
                stroke-linecap="round"
            />
        </svg>
    `;

    // STORAGE

    function getHistory() {
        try {
            const raw = Spicetify.LocalStorage.get(STORAGE_KEY);

            if (!raw) {
                return [];
            }

            const parsed = JSON.parse(raw);

            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error("SongHistory: failed to load history", error);

            return [];
        }
    }

    function saveHistory(history) {
        try {
            Spicetify.LocalStorage.set(STORAGE_KEY, JSON.stringify(history));
        } catch (error) {
            console.error("SongHistory: failed to save history", error);
        }
    }

    function clearHistory() {
        saveHistory([]);
    }

    function deleteHistoryItem(id) {
        const history = getHistory();

        saveHistory(history.filter((item) => item.id !== id));
    }

    // PLAYER DATA

    function getPlayerState() {
        return Spicetify.Player.data || null;
    }

    function getCurrentTrack() {
        const state = getPlayerState();

        return state?.item || state?.track || null;
    }

    function getTrackUri(track) {
        return track?.uri || track?.metadata?.uri || null;
    }

    function getTrackName(track) {
        return track?.name || track?.metadata?.title || "Unknown Track";
    }

    function getArtists(track) {
        if (Array.isArray(track?.artists)) {
            return track.artists
                .map((artist) => {
                    if (typeof artist === "string") {
                        return artist;
                    }

                    return artist?.name;
                })
                .filter(Boolean);
        }

        if (track?.artist?.name) {
            return [track.artist.name];
        }

        if (track?.metadata?.artist_name) {
            if (Array.isArray(track.metadata.artist_name)) {
                return track.metadata.artist_name;
            }

            return [track.metadata.artist_name];
        }

        return [];
    }

    function getArtistUris(track) {
        if (Array.isArray(track?.artists)) {
            return track.artists.map((artist) => {
                if (typeof artist === "object") {
                    return artist?.uri || artist?.metadata?.uri || null;
                }

                return null;
            });
        }

        if (track?.artist?.uri) {
            return [track.artist.uri];
        }

        if (track?.metadata?.artist_uri) {
            if (Array.isArray(track.metadata.artist_uri)) {
                return track.metadata.artist_uri;
            }

            return [track.metadata.artist_uri];
        }

        return [];
    }

    function getAlbumName(track) {
        return track?.album?.name || track?.metadata?.album_title || "Unknown Album";
    }

    function getAlbumUri(track) {
        return track?.album?.uri || track?.metadata?.album_uri || null;
    }

    function getImage(track) {
        return (
            track?.metadata?.image_xlarge_url ||
            track?.metadata?.image_large_url ||
            track?.metadata?.image_url ||
            track?.album?.images?.[0]?.url ||
            null
        );
    }

    function getDuration() {
        const state = getPlayerState();

        try {
            if (typeof Spicetify.Player.getDuration === "function") {
                const value = Number(Spicetify.Player.getDuration());

                if (Number.isFinite(value) && value > 0) {
                    return value;
                }
            }
        } catch {
            // Fallback
        }

        return Number(state?.duration) || 0;
    }

    function getProgress() {
        try {
            if (typeof Spicetify.Player.getProgress === "function") {
                return Number(Spicetify.Player.getProgress()) || 0;
            }

            return Number(getPlayerState()?.position_as_of_timestamp) || 0;
        } catch {
            return 0;
        }
    }

    function isPlaying() {
        try {
            if (typeof Spicetify.Player.isPlaying === "function") {
                return Spicetify.Player.isPlaying();
            }
        } catch {
            // Fallback
        }

        const state = getPlayerState();

        return !!(state?.is_playing && !state?.is_paused && !state?.is_buffering);
    }

    // SESSION TRACKING

    function startTrackSession() {
        const track = getCurrentTrack();

        const uri = getTrackUri(track);

        if (!track || !uri) {
            currentTrack = null;
            currentUri = null;
            currentStartedAt = null;

            listenedMs = 0;

            lastTick = null;
            lastPosition = 0;

            savedCurrentPlay = false;

            return;
        }

        currentTrack = track;

        currentUri = uri;

        currentStartedAt = Date.now();

        listenedMs = 0;

        lastTick = Date.now();

        lastPosition = getProgress();

        savedCurrentPlay = false;

        console.log("SongHistory: started", {
            name: getTrackName(track),
            uri,
            progress: lastPosition,
        });
    }

    function updateListeningTime() {
        if (!currentTrack || !currentUri) {
            return;
        }

        const now = Date.now();

        if (lastTick === null) {
            lastTick = now;
            lastPosition = getProgress();
            return;
        }

        const delta = now - lastTick;
        const position = getProgress();
        const playing = isPlaying();

        const expectedPosition = lastPosition + delta;
        const difference = Math.abs(position - expectedPosition);

        const SEEK_THRESHOLD = 1500;

        if (playing && delta > 0 && delta < 2000 && difference < SEEK_THRESHOLD) {
            listenedMs += delta;
        }

        lastPosition = position;
        lastTick = now;

        if (listenedMs >= getListenThresholdMs() && !savedCurrentPlay) {
            saveCurrentTrack();
            savedCurrentPlay = true;
        }
    }

    function finalizeCurrentTrack() {
        if (!currentTrack || !currentUri) {
            return;
        }

        updateListeningTime();

        if (listenedMs >= getListenThresholdMs() && !savedCurrentPlay) {
            saveCurrentTrack();
            savedCurrentPlay = true;
        }
    }

    function saveCurrentTrack() {
        if (!currentTrack || !currentUri || !currentStartedAt) {
            return;
        }

        const history = getHistory();

        const entry = {
            id: `${currentUri}:${currentStartedAt}`,

            uri: currentUri,

            name: getTrackName(currentTrack),

            artists: getArtists(currentTrack),

            artistUris: getArtistUris(currentTrack),

            album: getAlbumName(currentTrack),

            albumUri: getAlbumUri(currentTrack),

            image: getImage(currentTrack),

            duration: getDuration(),

            listenedMs: listenedMs,

            playedAt: currentStartedAt,

            savedAt: Date.now(),
        };

        history.unshift(entry);

        if (history.length > MAX_HISTORY) {
            history.length = MAX_HISTORY;
        }

        saveHistory(history);

        console.log("SongHistory: SAVED", entry);

        if (getSettings().showNotifications) {
            Spicetify.showNotification(`Added to history: ${entry.name}`);
        }
    }

    // PLAYER EVENTS

    // PLAYER EVENTS

    function handleSongChange() {
        finalizeCurrentTrack();
        startTrackSession();
    }

    function handlePlayPause() {
        updateListeningTime();
    }

    function handleProgress() {
        updateListeningTime();
    }

    Spicetify.Player.addEventListener("songchange", handleSongChange);
    Spicetify.Player.addEventListener("onplaypause", handlePlayPause);
    Spicetify.Player.addEventListener("onprogress", handleProgress);

    setInterval(updateListeningTime, 500);

    startTrackSession();

    window.addEventListener("beforeunload", () => {
        finalizeCurrentTrack();
    });

    // CSS

    const CSS = `

        body:has(.song-history-shell) [role="dialog"] > button[aria-label="Close"],
        body:has(.song-history-shell) [role="dialog"] > button[title="Close"],
        body:has(.song-history-shell) [role="dialog"] > div > button[aria-label="Close"],
        body:has(.song-history-shell) div[class*="Modal"] > button {
            display: none !important;
        }

        /* PANEL */

        .song-history-shell {
            position: relative;
            width: min(920px, calc(100vw - 48px));
            height: min(730px, calc(100vh - 48px));
            min-width: 0;
            min-height: 0;
            max-width: calc(100vw - 48px);
            max-height: calc(100vh - 48px);

            display: flex;
            flex-direction: column;
            box-sizing: border-box;

            padding: 24px;

            background: rgba(17, 17, 17, 0.985);

            border: 1px solid rgba(255,255,255,0.085);
            border-radius: 18px;

            box-shadow:
                0 24px 70px rgba(0,0,0,0.52),
                inset 0 1px 0 rgba(255,255,255,0.025);

            overflow: hidden;
        }


        /* HEADER */


        .song-history-column-header {
            display: grid;
            grid-template-columns:
                52px
                minmax(250px, 1fr)
                minmax(150px, 0.55fr)
                106px;
            align-items: center;
            column-gap: 15px;

            padding: 0 10px 8px;

            color: rgba(255,255,255,0.48);
            font-size: 11px;
            line-height: 1;
            font-weight: 700;
            letter-spacing: 0.10em;
            text-transform: uppercase;
        }

        .song-history-column-header-day {
            text-align: left;
        }

        .song-history-column-header-song {
            text-align: left;
        }

        .song-history-column-header-album {
            padding-left: 4px;
            text-align: left;
        }

        .song-history-column-header-time {
            text-align: left;
        }

        .song-history-header {
        display: flex;
        align-items: center;
        width: 100%;
        margin-bottom: 20px;
        flex-shrink: 0;
        }
        
        .song-history-heading {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
            flex-shrink: 0;
        }
        
        .song-history-heading-title {
            color: rgba(255,255,255,0.97);
            font-size: 22px;
            line-height: 1.2;
            font-weight: 700;
            letter-spacing: -0.025em;
        }

        /* CLOSE BUTTON */

        .song-history-close {
            display:
                inline-flex;

            align-items:
                center;

            justify-content:
                center;

            width:
                36px;

                center;

            width:
                36px;

            height:
                36px;

            padding:
                0;

            border:
                none;

            border-radius:
                9px;

            background:
                rgba(255,255,255,0.025);

            color:
                rgba(255,255,255,0.62);

            cursor:
                pointer;

            flex-shrink:
                0;

            transition:
                background
                100ms
                ease,

                color
                100ms
                ease,

                transform
                100ms
                ease;
        }

        .song-history-close:hover {
            background:
                rgba(255,55,55,0.12);

            color:
            #ff4d4d;
        }

        .song-history-close:active {
            transform:
                scale(0.93);
        }


        /* SETTINGS */


        .song-history-settings {
            flex: 1;
            min-width: 0;
            margin: 0 24px;
            padding: 0;
            border: none;
            border-radius: 0;
            background: transparent;
        }

        .song-history-settings-header {
            display: none;
        }

        .song-history-settings-grid {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 28px;
        }

        .song-history-setting {
            min-width: 0;
        }

        .song-history-setting-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 7px;
        }

        .song-history-setting-label {
            color: rgba(255,255,255,0.58);
            font-size: 11px;
            font-weight: 600;
        }

        .song-history-setting-value {
            color: rgba(255,255,255,0.58);

            font-size: 13px;
            line-height: 1;
            font-weight: 700;

            font-variant-numeric: tabular-nums;

            white-space: nowrap;
        }

        .song-history-setting:first-child {
            width: 190px;
        }

        .song-history-setting:last-child {
            width: 170px;
        }
        
        /* SLIDER */
        
        .song-history-slider {
            appearance: none;
            -webkit-appearance: none;
            width: 100%;
            height: 4px;
            margin: 0;
            padding: 0;
            border-radius: 999px;
            outline: none;
            background: rgba(255,255,255,0.12);
            cursor: pointer;
        }
        
        .song-history-slider::-webkit-slider-runnable-track {
            height: 4px;
            border-radius: 999px;
            background: rgba(255,255,255,0.12);
        }
        
        .song-history-slider::-webkit-slider-thumb {
            appearance: none;
            -webkit-appearance: none;
            width: 14px;
            height: 14px;
            margin-top: -5px;
            border: none;
            border-radius: 50%;
            background: rgba(255,255,255,0.94);
            box-shadow: 0 1px 5px rgba(0,0,0,0.35);
            cursor: pointer;
            transition:
                transform 100ms ease,
                box-shadow 100ms ease;
        }
        
        .song-history-slider::-webkit-slider-thumb:hover {
            transform: scale(1.12);
            box-shadow: 0 2px 8px rgba(0,0,0,0.45);
        }
        
        .song-history-slider::-moz-range-track {
            height: 4px;
            border: none;
            border-radius: 999px;
            background: rgba(255,255,255,0.12);
        }
        
        .song-history-slider::-moz-range-thumb {
            width: 14px;
            height: 14px;
            border: none;
            border-radius: 50%;
            background: rgba(255,255,255,0.94);
            cursor: pointer;
        }
        
        /* NOTIFICATION CONTROL */ 
        .song-history-notification-control { 
        display: flex; 
        align-items: center; 
        gap: 9px; 
        } 
        /* ON / OFF TEXT */ 
        .song-history-notification-value {
        min-width: 24px; 
        color: rgba(255,255,255,0.72); 
        font-size: 13px; 
        line-height: 1; 
        font-weight: 700; 
        user-select: none; 
        }


        /* SWITCH */ 
        
        
        .song-history-switch {
        position: relative; 
        display: flex; 
        align-items: center; 
        width: 42px; 
        height: 24px; 
        padding: 3px; 
        border: none; 
        border-radius: 999px; 
        background: rgba(255,255,255,0.16); 
        cursor: pointer; 
        transition: background 140ms ease, box-shadow 140ms ease; 
        } 
        
        /* OFF */ 
        
        .song-history-switch:not(.active) { 
        background: rgba(255,255,255,0.16); 
        } 
        
        /* ON */ 

        .song-history-switch.active { 
        background: #1ed760; 
        box-shadow: 0 0 0 1px rgba(30,215,96,0.15), 0 2px 8px rgba(30,215,96,0.20); 
        } 
        
        /* KNOB */ 
        .song-history-switch-knob { 
        display: block; 
        width: 18px; 
        height: 18px; 
        flex-shrink: 0; 
        border-radius: 50%; 
        background: rgba(255,255,255,0.90); 
        box-shadow: 0 1px 4px rgba(0,0,0,0.35); 
        transform: translateX(0); 
        transition: transform 140ms ease, background 140ms ease; 
        } 
        .song-history-switch.active .song-history-switch-knob { 
        background: #ffffff; 
        transform: translateX(18px); 
        } 
        .song-history-switch:hover { 
        filter: brightness(1.08); 
        } 
        .song-history-switch:active { 
        transform: scale(0.95); 
        }


        /* TOOLBAR */


        .song-history-toolbar {
            display:
                flex;

            align-items:
                center;

            gap:
                11px;

            margin-bottom:
                16px;

            flex-shrink:
                0;
        }

        .song-history-search-wrap {
            position:
                relative;

            flex:
                1;
        }

        .song-history-search-icon {
            position:
                absolute;

            left:
                14px;

            top:
                50%;

            transform:
                translateY(-50%);

            display:
                flex;

            width:
                16px;

            height:
                16px;

            color:
                rgba(255,255,255,0.45);

            pointer-events:
                none;
        }

        .song-history-search {
            width:
                100%;

            height:
                42px;

            box-sizing:
                border-box;

            padding:
                0
                14px
                0
                40px;

            border:
                1px solid
                rgba(255,255,255,0.075);

            border-radius:
                10px;

            outline:
                none;

            background:
                rgba(255,255,255,0.042);

            color:
                rgba(255,255,255,0.95);

            font-family:
                inherit;

            font-size:
                13px;

            transition:
                background
                120ms
                ease,

                border-color
                120ms
                ease;
        }

        .song-history-search::placeholder {
            color:
                rgba(255,255,255,0.37);
        }

        .song-history-search:hover {
            background:
                rgba(255,255,255,0.052);
        }

        .song-history-search:focus {
            background:
                rgba(255,255,255,0.068);

            border-color:
                rgba(255,255,255,0.15);
        }

        .song-history-clear {
            height:
                42px;

            padding:
                0 15px;

            border:
                1px solid
                rgba(255,255,255,0.075);

            border-radius:
                10px;

            background:
                rgba(255,255,255,0.035);

            color:
                rgba(255,255,255,0.60);

            font-family:
                inherit;

            font-size:
                12px;

            font-weight:
                600;

            cursor:
                pointer;

            white-space:
                nowrap;

            transition:
                background
                100ms
                ease,

                color
                100ms
                ease,

                border-color
                100ms
                ease;
        }

        .song-history-clear:hover {
            background:
                rgba(255,255,255,0.07);

            border-color:
                rgba(255,255,255,0.13);

            color:
                rgba(255,255,255,0.94);
        }


        /* LIST */

        .song-history-list {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            box-sizing: border-box;
            overflow-x: hidden;
        }

        .song-history-list-area {

            min-width: 0;
            
            max-width: 100%;

            flex:
                1 1 0;

            min-height:
                0;

            overflow-y:
                auto;

            overflow-x:
                hidden;

            padding:
                0
                4px
                16px
                0;

            scrollbar-width:
                medium;

            scrollbar-color:
                rgba(255,255,255,0.11)
                transparent;
        }

        .song-history-list::-webkit-scrollbar {
            width:
                7px;
        }

        .song-history-list::-webkit-scrollbar-track {
            background:
                transparent;
        }

        .song-history-list::-webkit-scrollbar-thumb {
            background:
                rgba(255,255,255,0.085);

            border-radius:
                999px;
        }

        .song-history-list::-webkit-scrollbar-thumb:hover {
            background:
                rgba(255,255,255,0.15);
        }


        /* DAY */ 


        .song-history-day { 
            padding: 18px 10px 7px; 
            color: rgba(255,255,255,0.58); 
            font-size: 11px; 
            line-height: 1.2; 
            font-weight: 800; 
            letter-spacing: 0.13em; 
            text-transform: uppercase; 
        } 
        .song-history-day:first-child { 
        padding-top: 2px; 
        
        } 


        /* COLUMN HEADERS */ 


        .song-history-column-header { 
        display: grid; 
        grid-template-columns: 52px minmax(250px, 1fr) minmax(150px, 0.55fr) 106px; 
        align-items: center; 
        column-gap: 15px; 
        min-height: 22px; 
        padding: 0 10px 5px; 
        box-sizing: border-box; 
        color: rgba(255,255,255,0.62); 
        font-size: 11px; 
        line-height: 1.2; 
        font-weight: 800; 
        letter-spacing: 0.10em; 
        text-transform: uppercase; 
        user-select: none; 
        } 
        .song-history-column-song { 
        grid-column: 2; 
        text-align: left; 
        } 
        .song-history-column-album { 
        grid-column: 3; 
        padding-left: 4px; 
        text-align: left; 
        } 
        .song-history-column-time { 
        grid-column: 4; 
        min-width: 106px; 
        text-align: right; 
        } 


        /* CLEAR CONFIRMATION */

        .song-history-confirm-overlay {
            position: absolute;
            inset: 0;
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            box-sizing: border-box;
            background: rgba(0, 0, 0, 0.58);
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
            animation: song-history-confirm-fade-in 120ms ease;
        }

        .song-history-confirm {
            width: min(390px, 100%);
            padding: 22px;
            box-sizing: border-box;
            border: 1px solid rgba(255,255,255,0.09);
            border-radius: 14px;
            background: rgba(25, 25, 25, 0.985);
            box-shadow:
                0 24px 70px rgba(0,0,0,0.55),
                inset 0 1px 0 rgba(255,255,255,0.025);
            animation: song-history-confirm-scale-in 140ms ease;
        }

        .song-history-confirm-title {
            margin-bottom: 8px;
            color: rgba(255,255,255,0.96);
            font-size: 17px;
            line-height: 1.3;
            font-weight: 700;
            letter-spacing: -0.015em;
        }

        .song-history-confirm-text {
            margin-bottom: 20px;
            color: rgba(255,255,255,0.52);
            font-size: 13px;
            line-height: 1.5;
        }

        .song-history-confirm-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }

        .song-history-confirm-button {
            height: 36px;
            padding: 0 14px;
            border: 1px solid rgba(255,255,255,0.075);
            border-radius: 9px;
            font-family: inherit;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            transition:
                background 100ms ease,
                border-color 100ms ease,
                color 100ms ease,
                transform 100ms ease;
        }

        .song-history-confirm-button:active {
            transform: scale(0.96);
        }

        .song-history-confirm-cancel {
            background: rgba(255,255,255,0.035);
            color: rgba(255,255,255,0.62);
        }

        .song-history-confirm-cancel:hover {
            background: rgba(255,255,255,0.07);
            border-color: rgba(255,255,255,0.13);
            color: rgba(255,255,255,0.94);
        }

        .song-history-confirm-clear {
            border-color: rgba(255,65,65,0.18);
            background: rgba(255,55,55,0.10);
            color: #ff6b6b;
        }

        .song-history-confirm-clear:hover {
            border-color: rgba(255,65,65,0.30);
            background: rgba(255,55,55,0.16);
            color: #ff8585;
        }

        @keyframes song-history-confirm-fade-in {
            from {
                opacity: 0;
            }

            to {
                opacity: 1;
            }
        }

        @keyframes song-history-confirm-scale-in {
            from {
                opacity: 0;
                transform: scale(0.97) translateY(3px);
            }

            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }


        /* ROW */ 


        .song-history-row { display: grid; 
        grid-template-columns: 52px minmax(250px, 1fr) minmax(150px, 0.55fr) 106px;
        align-items: center; 
        column-gap: 15px; 
        min-height: 72px; 
        padding: 8px 10px; 
        border-radius: 10px; 
        box-sizing: border-box; 
        transition: background 100ms ease; 
        } 
        .song-history-row:hover { 
        background: rgba(255,255,255,0.045); 
        }


        /* COVER */


        .song-history-shell .song-history-row .song-history-image {
            display: block !important;
            width: 52px !important;
            height: 52px !important;
            min-width: 52px !important;
            min-height: 52px !important;
            max-width: 52px !important;
            max-height: 52px !important;
            aspect-ratio: 1 / 1 !important;
            flex: 0 0 52px !important;
            object-fit: cover !important;
            object-position: center !important;
            border-radius: 8px !important;
            padding: 0 !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            background: rgba(255,255,255,0.04);
            box-shadow: 0 2px 8px rgba(0,0,0,0.20);
        }


        /* SONG INFO */


        .song-history-info {
            min-width:
                0;

            display:
                flex;

            flex-direction:
                column;

            gap:
                3px;
        }

        .song-history-title {
            overflow:
                hidden;

            white-space:
                nowrap;

            text-overflow:
                ellipsis;

            color:
                rgba(255,255,255,0.94);

            font-size:
                14px;

            line-height:
                1.35;

            font-weight:
                600;
        }

        .song-history-meta {
            display:
                flex;

            align-items:
                center;

            min-width:
                0;

            overflow:
                hidden;

            color:
                rgba(255,255,255,0.48);

            font-size:
                12px;

            line-height:
                1.4;
        }

        .song-history-meta-separator {
            flex-shrink:
                0;

            margin:
                0 6px;

            color:
                rgba(255,255,255,0.22);
        }

        .song-history-link {
            min-width:
                0;

            max-width:
                100%;

            overflow:
                hidden;

            white-space:
                nowrap;

            text-overflow:
                ellipsis;

            border:
                none;

            padding:
                0;

            margin:
                0;

            background:
                transparent;

            color:
                inherit;

            font:
                inherit;

            cursor:
                pointer;

            text-align:
                left;

            transition:
                color
                100ms
                ease;
        }

        .song-history-link:hover {
            color:
                rgba(255,255,255,0.90);

            text-decoration:
                underline;

            text-underline-offset:
                2px;
        }


        /* ALBUM */


        .song-history-album {
            display:
                flex;

            align-items:
                center;

            min-width:
                0;

            padding-left:
                4px;
        }

        .song-history-album
        .song-history-link {
            width:
                100%;

            color:
                rgba(255,255,255,0.52);

            font-size:
                12px;
        }

        .song-history-album
        .song-history-link:hover {
            color:
                rgba(255,255,255,0.88);
        }


        /* TIME + ACTIONS */


        .song-history-right {
            display:
                flex;

            align-items:
                center;

            justify-content:
                flex-end;

            gap:
                4px;

            min-width:
                106px;
        }

        .song-history-time {
            min-width:
                42px;

            text-align:
                right;

            color:
                rgba(255,255,255,0.42);

            font-size:
                11px;

            font-variant-numeric:
                tabular-nums;
        }

        .song-history-action {
            display:
                inline-flex;

            align-items:
                center;

            justify-content:
                center;

            width:
                31px;

            height:
                31px;

            padding:
                0;

            border:
                none;

            border-radius:
                50%;

            background:
                transparent;

            color:
                rgba(255,255,255,0.54);

            cursor:
                pointer;

            opacity:
                0;

            transform:
                scale(0.93);

            transition:
                opacity
                90ms
                ease,

                transform
                90ms
                ease,

                background
                90ms
                ease,

                color
                90ms
                ease;
        }

        .song-history-row:hover
        .song-history-action {
            opacity:
                1;

            transform:
                scale(1);
        }

        .song-history-action:hover {
            background:
                rgba(255,255,255,0.075);

            color:
                rgba(255,255,255,0.97);
        }

        .song-history-action:active {
            transform:
                scale(0.90);
        }


        /* RESPONSIVE */


        @media (max-width: 900px) {
            .song-history-shell {
                width: calc(100vw - 32px);
                height: calc(100vh - 32px);
                max-width: calc(100vw - 32px);
                max-height: calc(100vh - 32px);
                min-width: 0;
                min-height: 0;
                padding: 20px;
            }

            .song-history-row {
                grid-template-columns:
                    52px
                    minmax(0, 1fr)
                    auto;
            }

            .song-history-column-header {
                display: grid;
                grid-template-columns:
                    52px
                    minmax(0, 1fr)
                    auto;
                align-items: center;
                column-gap: 15px;
                min-height: 22px;
                padding: 0 10px 4px;
                box-sizing: border-box;
                color: rgba(255,255,255,0.62);
                font-size: 11px;
                line-height: 1.2;
                font-weight: 800;
                letter-spacing: 0.10em;
                text-transform: uppercase;
            }

            .song-history-column-song {
                grid-column: 2;
            }

            .song-history-column-album {
                display: none;
            }

            .song-history-column-time {
                grid-column: 3;
                min-width: 106px;
                text-align: right;
            }

            .song-history-album {
                display: none;
            }

        `;

    // INJECT CSS

    function injectCSS() {
        const existing = document.getElementById("song-history-css");

        if (existing) {
            existing.remove();
        }

        const style = document.createElement("style");

        style.id = "song-history-css";

        style.textContent = CSS;

        document.head.appendChild(style);
    }

    injectCSS();

    // NAVIGATION

    function navigateToSpotifyURI(uri) {
        if (!uri) {
            return;
        }

        try {
            const history = Spicetify.Platform?.History;

            if (!history || typeof history.push !== "function") {
                return;
            }

            let parsed = null;

            if (typeof Spicetify.URI?.from === "function") {
                parsed = Spicetify.URI.from(uri);
            }

            if (!parsed && typeof Spicetify.URI?.fromString === "function") {
                parsed = Spicetify.URI.fromString(uri);
            }

            if (parsed && typeof parsed.toURLPath === "function") {
                history.push(parsed.toURLPath());
            }
        } catch (error) {
            console.error("SongHistory: navigation failed", error);
        }
    }

    // FORMATTER

    function formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function formatDay(timestamp) {
        const date = new Date(timestamp);

        const today = new Date();

        const yesterday = new Date();

        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return "Today";
        }

        if (date.toDateString() === yesterday.toDateString()) {
            return "Yesterday";
        }

        return date.toLocaleDateString([], {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
        });
    }

    // UI BUILD

    function buildHistoryUI() {
        const shell = document.createElement("div");

        shell.className = "song-history-shell";

        // SETTINGS PANEL

        const settings = getSettings();

        const settingsPanel = document.createElement("div");
        settingsPanel.className = "song-history-settings";

        const settingsHeader = document.createElement("div");
        settingsHeader.className = "song-history-settings-header";

        const settingsTitle = document.createElement("div");
        settingsTitle.className = "song-history-settings-title";
        settingsTitle.textContent = "History Settings";

        settingsHeader.appendChild(settingsTitle);

        const settingsGrid = document.createElement("div");
        settingsGrid.className = "song-history-settings-grid";

        // LISTEN THRESHOLD

        const thresholdSetting = document.createElement("div");
        thresholdSetting.className = "song-history-setting";

        const thresholdTop = document.createElement("div");
        thresholdTop.className = "song-history-setting-top";

        const thresholdLabel = document.createElement("div");
        thresholdLabel.className = "song-history-setting-label";
        thresholdLabel.textContent = "Save after";

        const thresholdValue = document.createElement("div");
        thresholdValue.className = "song-history-setting-value";

        function formatThreshold(seconds) {
            if (seconds === 0) {
                return "Immediately";
            }

            return `${seconds} sec`;
        }

        thresholdValue.textContent = formatThreshold(settings.listenSeconds);

        thresholdTop.appendChild(thresholdLabel);
        thresholdTop.appendChild(thresholdValue);

        const thresholdSlider = document.createElement("input");
        thresholdSlider.className = "song-history-slider";
        thresholdSlider.type = "range";
        thresholdSlider.min = String(MIN_LISTEN_SECONDS);
        thresholdSlider.max = String(MAX_LISTEN_SECONDS);
        thresholdSlider.step = "1";
        thresholdSlider.value = String(settings.listenSeconds);

        thresholdSlider.addEventListener("input", () => {
            const seconds = Number(thresholdSlider.value);

            thresholdValue.textContent = formatThreshold(seconds);

            const currentSettings = getSettings();

            saveSettings({
                ...currentSettings,
                listenSeconds: seconds,
            });
        });

        thresholdSetting.appendChild(thresholdTop);
        thresholdSetting.appendChild(thresholdSlider);

        /* NOTIFICATIONS */
        const notificationSetting = document.createElement("div");
        notificationSetting.className = "song-history-setting";
        const notificationTop = document.createElement("div");
        notificationTop.className = "song-history-setting-top";
        const notificationLabel = document.createElement("div");
        notificationLabel.className = "song-history-setting-label";
        notificationLabel.textContent = "Notifications";
        const notificationControl = document.createElement("div");
        notificationControl.className = "song-history-notification-control";
        const notificationSwitch = document.createElement("button");
        notificationSwitch.type = "button";
        notificationSwitch.className =
            "song-history-switch" + (settings.showNotifications ? " active" : "");
        notificationSwitch.setAttribute("aria-label", "Toggle history notifications");
        const notificationSwitchKnob = document.createElement("span");
        notificationSwitchKnob.className = "song-history-switch-knob";
        notificationSwitch.appendChild(notificationSwitchKnob);
        const notificationValue = document.createElement("span");
        notificationValue.className = "song-history-notification-value";
        notificationValue.textContent = settings.showNotifications ? "On" : "Off";
        notificationControl.appendChild(notificationSwitch);
        notificationControl.appendChild(notificationValue);
        notificationTop.appendChild(notificationLabel);
        notificationTop.appendChild(notificationControl);
        notificationSetting.appendChild(notificationTop);
        notificationSwitch.addEventListener("click", () => {
            const currentSettings = getSettings();
            const newValue = !currentSettings.showNotifications;
            saveSettings({ ...currentSettings, showNotifications: newValue });
            notificationValue.textContent = newValue ? "On" : "Off";
            notificationSwitch.classList.toggle("active", newValue);
        });
        settingsGrid.appendChild(thresholdSetting);
        settingsGrid.appendChild(notificationSetting);
        settingsPanel.appendChild(settingsHeader);
        settingsPanel.appendChild(settingsGrid);
        shell.appendChild(settingsPanel);

        // HEADER

        const header = document.createElement("div");

        header.className = "song-history-header";

        const heading = document.createElement("div");

        heading.className = "song-history-heading";

        const title = document.createElement("div");

        title.className = "song-history-heading-title";

        title.textContent = "Listening History";

        heading.appendChild(title);

        const closeButton = document.createElement("button");

        closeButton.className = "song-history-close";

        closeButton.type = "button";

        closeButton.title = "Close";

        closeButton.setAttribute("aria-label", "Close");

        closeButton.innerHTML = ICON_CLOSE;

        closeButton.addEventListener("click", () => {
            Spicetify.PopupModal.hide();
        });

        header.appendChild(heading);
        header.appendChild(settingsPanel);
        header.appendChild(closeButton);

        shell.appendChild(header);

        // TOOLBAR

        const toolbar = document.createElement("div");

        toolbar.className = "song-history-toolbar";

        const searchWrap = document.createElement("div");

        searchWrap.className = "song-history-search-wrap";

        const searchIcon = document.createElement("div");

        searchIcon.className = "song-history-search-icon";

        searchIcon.innerHTML = ICON_SEARCH;

        const search = document.createElement("input");

        search.className = "song-history-search";

        search.type = "text";

        search.placeholder = "Search songs, artists or albums...";

        searchWrap.appendChild(searchIcon);

        searchWrap.appendChild(search);

        const clearButton = document.createElement("button");

        clearButton.className = "song-history-clear";

        clearButton.type = "button";

        clearButton.textContent = "Clear history";

        toolbar.appendChild(searchWrap);

        toolbar.appendChild(clearButton);

        shell.appendChild(toolbar);

        // LIST

        const listArea = document.createElement("div");
        listArea.className = "song-history-list-area";

        const dayHeader = document.createElement("div");
        dayHeader.className = "song-history-column-day";
        dayHeader.textContent = "DAY";

        const songHeader = document.createElement("div");
        songHeader.className = "song-history-column-song";
        songHeader.textContent = "SONG";

        const albumHeader = document.createElement("div");
        albumHeader.className = "song-history-column-album";
        albumHeader.textContent = "ALBUM";

        const timeHeader = document.createElement("div");
        timeHeader.className = "song-history-column-time";
        timeHeader.textContent = "TIME";

        const list = document.createElement("div");
        list.className = "song-history-list";

        listArea.appendChild(list);

        shell.appendChild(listArea);

        // RENDER

        function render() {
            list.innerHTML = "";

            const history = getHistory();
            const query = search.value.trim().toLowerCase();

            const filtered = query
                ? history.filter((item) => {
                      const text = [item.name, item.album, ...(item.artists || [])]
                          .join(" ")
                          .toLowerCase();

                      return text.includes(query);
                  })
                : history;

            /* EMPTY */

            if (filtered.length === 0) {
                const empty = document.createElement("div");
                empty.className = "song-history-empty";

                const icon = document.createElement("div");
                icon.className = "song-history-empty-icon";
                icon.textContent = "♫";

                const emptyTitle = document.createElement("div");
                emptyTitle.className = "song-history-empty-title";
                emptyTitle.textContent = query ? "No results found" : "No listening history yet";

                const emptySubtitle = document.createElement("div");
                emptySubtitle.className = "song-history-empty-subtitle";
                emptySubtitle.textContent = query
                    ? "Try another song, artist or album."
                    : "Keep listening and your plays will appear here.";

                empty.appendChild(icon);
                empty.appendChild(emptyTitle);
                empty.appendChild(emptySubtitle);

                list.appendChild(empty);
                return;
            }

            /* COLUMN HEADER */

            const columnHeader = document.createElement("div");
            columnHeader.className = "song-history-column-header";

            const dayHeader = document.createElement("div");
            dayHeader.className = "song-history-column-header-day";
            dayHeader.textContent = "DAY";

            const songHeader = document.createElement("div");
            songHeader.className = "song-history-column-header-song";
            songHeader.textContent = "SONG";

            const albumHeader = document.createElement("div");
            albumHeader.className = "song-history-column-header-album";
            albumHeader.textContent = "ALBUM";

            const timeHeader = document.createElement("div");
            timeHeader.className = "song-history-column-header-time";
            timeHeader.textContent = "TIME";

            columnHeader.appendChild(dayHeader);
            columnHeader.appendChild(songHeader);
            columnHeader.appendChild(albumHeader);
            columnHeader.appendChild(timeHeader);

            list.appendChild(columnHeader);

            /* GROUP BY DATE */

            const groups = {};

            filtered.forEach((item) => {
                const key = new Date(item.playedAt).toDateString();

                if (!groups[key]) {
                    groups[key] = [];
                }

                groups[key].push(item);
            });

            Object.values(groups).forEach((items) => {
                /* DAY */

                const day = document.createElement("div");
                day.className = "song-history-day";
                day.textContent = formatDay(items[0].playedAt);

                list.appendChild(day);

                /* SONGS */

                items.forEach((item) => {
                    const row = document.createElement("div");
                    row.className = "song-history-row";

                    /* COVER */

                    const image = document.createElement("img");
                    image.className = "song-history-image";
                    image.src = item.image || "";
                    image.alt = item.name || "";

                    row.appendChild(image);

                    /* SONG INFO I GUESS XD */

                    const info = document.createElement("div");
                    info.className = "song-history-info";

                    const songTitle = document.createElement("div");
                    songTitle.className = "song-history-title";
                    songTitle.textContent = item.name || "Unknown Track";

                    info.appendChild(songTitle);

                    const meta = document.createElement("div");
                    meta.className = "song-history-meta";

                    const artists = item.artists || [];
                    const artistUris = item.artistUris || [];

                    if (artists.length === 0) {
                        const artistText = document.createElement("span");
                        artistText.textContent = "Unknown Artist";
                        meta.appendChild(artistText);
                    } else {
                        artists.forEach((artistName, index) => {
                            if (index > 0) {
                                const separator = document.createElement("span");
                                separator.className = "song-history-meta-separator";
                                separator.textContent = "•";
                                meta.appendChild(separator);
                            }

                            const artistUri = artistUris[index];

                            if (artistUri) {
                                const artistButton = document.createElement("button");

                                artistButton.className = "song-history-link";
                                artistButton.textContent = artistName;
                                artistButton.title = `Open ${artistName}`;

                                artistButton.addEventListener("click", (event) => {
                                    event.stopPropagation();
                                    navigateToSpotifyURI(artistUri);
                                });

                                meta.appendChild(artistButton);
                            } else {
                                const artistText = document.createElement("span");

                                artistText.textContent = artistName;
                                meta.appendChild(artistText);
                            }
                        });
                    }

                    info.appendChild(meta);
                    row.appendChild(info);

                    /* ALBUM */

                    const albumColumn = document.createElement("div");
                    albumColumn.className = "song-history-album";

                    if (item.albumUri) {
                        const albumButton = document.createElement("button");

                        albumButton.className = "song-history-link";
                        albumButton.textContent = item.album || "Unknown Album";
                        albumButton.title = `Open ${item.album || "album"}`;

                        albumButton.addEventListener("click", (event) => {
                            event.stopPropagation();
                            navigateToSpotifyURI(item.albumUri);
                        });

                        albumColumn.appendChild(albumButton);
                    } else {
                        const albumText = document.createElement("span");

                        albumText.className = "song-history-link";
                        albumText.textContent = item.album || "Unknown Album";

                        albumColumn.appendChild(albumText);
                    }

                    row.appendChild(albumColumn);

                    /* TIME + ACTION */

                    const right = document.createElement("div");
                    right.className = "song-history-right";

                    const time = document.createElement("span");
                    time.className = "song-history-time";
                    time.textContent = formatTime(item.playedAt);

                    right.appendChild(time);

                    /* PLAY */

                    const playButton = document.createElement("button");

                    playButton.className = "song-history-action";
                    playButton.type = "button";
                    playButton.title = "Play";
                    playButton.setAttribute("aria-label", "Play");
                    playButton.innerHTML = ICON_PLAY;

                    playButton.addEventListener("click", (event) => {
                        event.stopPropagation();

                        try {
                            Spicetify.Player.playUri(item.uri);
                        } catch (error) {
                            console.error("SongHistory: failed to play track", error);
                        }
                    });

                    right.appendChild(playButton);

                    /* DELETE */

                    const deleteButton = document.createElement("button");

                    deleteButton.className = "song-history-action";
                    deleteButton.type = "button";
                    deleteButton.title = "Remove from history";
                    deleteButton.setAttribute("aria-label", "Remove from history");
                    deleteButton.innerHTML = ICON_DELETE;

                    deleteButton.addEventListener("click", (event) => {
                        event.stopPropagation();

                        deleteHistoryItem(item.id);
                        render();
                    });

                    right.appendChild(deleteButton);

                    row.appendChild(right);

                    list.appendChild(row);
                });
            });
        }

        // SEARCH

        search.addEventListener("input", render);

        // CLEAR

        clearButton.addEventListener("click", () => {
            const history = getHistory();

            if (history.length === 0) {
                return;
            }

            const overlay = document.createElement("div");
            overlay.className = "song-history-confirm-overlay";

            const confirmBox = document.createElement("div");
            confirmBox.className = "song-history-confirm";
            confirmBox.setAttribute("role", "dialog");
            confirmBox.setAttribute("aria-modal", "true");
            confirmBox.setAttribute("aria-label", "Clear listening history");

            const confirmTitle = document.createElement("div");
            confirmTitle.className = "song-history-confirm-title";
            confirmTitle.textContent = "Clear listening history?";

            const confirmText = document.createElement("div");
            confirmText.className = "song-history-confirm-text";
            confirmText.textContent =
                "This will permanently remove all songs from your listening history.";

            const actions = document.createElement("div");
            actions.className = "song-history-confirm-actions";

            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.className = "song-history-confirm-button song-history-confirm-cancel";
            cancelButton.textContent = "Cancel";

            const confirmButton = document.createElement("button");
            confirmButton.type = "button";
            confirmButton.className = "song-history-confirm-button song-history-confirm-clear";
            confirmButton.textContent = "Clear history";

            actions.appendChild(cancelButton);
            actions.appendChild(confirmButton);

            confirmBox.appendChild(confirmTitle);
            confirmBox.appendChild(confirmText);
            confirmBox.appendChild(actions);

            overlay.appendChild(confirmBox);

            const closeConfirmation = () => {
                overlay.remove();
                document.removeEventListener("keydown", handleKeyDown);
            };

            const handleKeyDown = (event) => {
                if (event.key === "Escape") {
                    closeConfirmation();
                }
            };

            cancelButton.addEventListener("click", closeConfirmation);

            confirmButton.addEventListener("click", () => {
                clearHistory();
                render();
                closeConfirmation();
            });

            overlay.addEventListener("click", (event) => {
                if (event.target === overlay) {
                    closeConfirmation();
                }
            });

            document.addEventListener("keydown", handleKeyDown);

            shell.appendChild(overlay);

            requestAnimationFrame(() => {
                cancelButton.focus();
            });
        });

        render();

        return shell;
    }

    // OPEN MODAL

    function openHistory() {
        console.log("SongHistory: opening history UI");

        try {
            const content = buildHistoryUI();

            Spicetify.PopupModal.display({
                title: "",
                content,
            });
        } catch (error) {
            console.error("SongHistory: failed to open UI", error);

            Spicetify.showNotification("Failed to open Song History", true);
        }
    }

    // TOPBAR BUTTON

    const historyButton = new Spicetify.Topbar.Button(
        "Listening History",
        ICON_HISTORY,
        openHistory,
        false,
        false
    );

    historyButton.disabled = false;

    console.log("SongHistory: left topbar button created", historyButton);

    // DEBUG

    window.SongHistoryDebug = {
        getHistory() {
            return getHistory();
        },

        clearHistory() {
            clearHistory();

            console.log("SongHistory: history cleared");
        },

        getCurrentTrack() {
            return currentTrack;
        },

        getProgress() {
            return getProgress();
        },

        getListeningMs() {
            return listenedMs;
        },

        getPlayerState() {
            return getPlayerState();
        },

        getTopbarButton() {
            return historyButton;
        },

        getSettings() {
            return getSettings();
        },

        setListenSeconds(seconds) {
            const value = Math.min(
                MAX_LISTEN_SECONDS,
                Math.max(MIN_LISTEN_SECONDS, Number(seconds) || 0)
            );

            const settings = getSettings();

            saveSettings({
                ...settings,
                listenSeconds: value,
            });

            return getSettings();
        },

        setNotifications(enabled) {
            const settings = getSettings();

            saveSettings({
                ...settings,
                showNotifications: Boolean(enabled),
            });

            return getSettings();
        },
    };

    console.log("SongHistory: loaded successfully");
})();
