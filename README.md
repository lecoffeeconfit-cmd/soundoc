# Soundoc

Soundoc is a local-first Expo iPhone app for turning text, public articles, and simple document files into an immediate listening experience.

## Run it

```sh
npm install
npm run ios
```

The primary path is deliberately short: **Paste Text**, **Paste Link**, or **Upload Document**, then tap **Play**. No account, voice selection, speed choice, or purchase is required before the first listen.

## Feedback

Feedback is optional and account-free. From Settings, users can open their native email app with an editable Soundoc feedback draft addressed to `coldsteelhowie@gmail.com`. The feedback form includes only the message and, when enabled, basic app/device diagnostics; it never includes document contents or imported files.

## Included

- On-device system speech with sentence-level progress and resume position
- SQLite-backed local library and local full-text filtering
- Text and clipboard import, safe public article URL validation/cleanup, and TXT/Markdown/HTML/RTF/DOCX/EPUB/PDF document import
- Files provider support through the iOS Files picker (iCloud Drive, Google Drive, Dropbox, and OneDrive)
- On-device OCR for a selected photo or camera capture
- Dynamic word-count and listening-time estimates
- Continue Listening, persistent mini-player, full reading player, speed and voice controls
- Pitch inside progressive-disclosure Advanced Controls
- A local listening queue with Play next, Add to queue, automatic next-item playback, and a calm Home preview
- A skippable, once-only welcome flow that can be revisited in Settings
- Basic privacy-first settings and accessible labels

## Deliberate current scope

PDF extraction is best-effort by design: password-protected, image-only, and unusually encoded PDFs report a clear next step instead of pretending their text was readable. DOCX and EPUB parsing is local and excludes DRM-protected books.

Photo and camera OCR use a native Expo module backed by device recognition. Test that feature in a development or production build, not Expo Go. Safari and other-app sharing is represented by the app-side deep-link contract in [share-extension/README.md](share-extension/README.md); a final iOS Share Extension target and App Group still need to be configured alongside the real Apple bundle identifier.

PowerPoint, Pages, Excel, DRM-protected ebooks, paywalled/login-only articles, social feeds, YouTube transcripts, RSS/email sources, and imported audio remain deliberately outside the local document-reader scope for this release.
