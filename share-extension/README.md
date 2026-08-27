# Share to Soundoc

Soundoc accepts incoming web links, selected text, and one supported local file
through Expo SDK 57's `expo-sharing` integration. The app config enables the
native Share Extension and Android share intent filters:

- iOS accepts one webpage URL, one web URL, plain text, one document/attachment,
  or one image.
- Android accepts single URL/text shares plus TXT, Markdown, HTML, RTF, PDF,
  EPUB, DOCX, and image MIME types.
- The iOS extension and containing app use `group.com.lecoffeeconfit.soundoc`
  as their App Group.

Local document shares use the same managed-storage and sectioned processing
path as the Files picker. Supported document formats are TXT, Markdown, HTML,
RTF, PDF, EPUB, and DOCX. Shared images go through the existing on-device OCR
review screen. One file is accepted per share; audio/video, unsupported files,
and multi-file shares remain unsupported.

The JavaScript app also accepts these deep links for existing integrations:

```
soundoc://import?url=https%3A%2F%2Fexample.com%2Farticle
soundoc://import?text=Selected%20text
```

Use the URL form for Safari articles and the text form for selected text from
Safari or another application. The app opens the regular import preview rather
than starting playback unexpectedly. Local files are copied into Soundoc's
managed storage before the native share payload is cleared; provider-owned
originals are not deleted.

Google AI and search shares commonly provide only the search URL, not the answer
currently rendered on screen. To listen to that answer, select and share its
text, or copy it and use Soundoc's paste action after the URL-share warning.

## Build requirement

The Share Sheet registration is native, so changes to `app.json` do not affect
an already-installed binary. Build and install a new development, preview, or
production build after changing the share configuration. EAS credentials must
also include the App Group entitlement for the main app and extension.

Background App Refresh or background data access is not required for the Share
Sheet entry. Soundoc keeps its existing `audio` background mode for playback;
the share extension stores the incoming payload and the app processes it when
the app opens or becomes active.
