# Playback platform notes

Soundoc currently uses `expo-speech` for live, on-device text-to-speech. This is reliable while Soundoc is in the foreground and preserves the current sentence when the voice, pitch, speed, or mode changes.

Live `expo-speech` does not expose a durable audio stream or a lock-screen/Control Center remote-command session. As a result, Soundoc does not claim guaranteed background playback, lock-screen play/pause, headphone-button control, Bluetooth transport control, or uninterrupted playback through a phone call. iOS may pause speech when the app is backgrounded, the route changes, or an interruption occurs; the player keeps its last committed sentence and resumes from there when opened again.

Reliable system transport controls require a future audio-rendering architecture: pre-render speech into audio files, configure an iOS `AVAudioSession`/Now Playing session and Android media session, then expose remote commands and interruption/route callbacks. That native work must be added deliberately; adding visual controls without that audio pipeline would be misleading.

