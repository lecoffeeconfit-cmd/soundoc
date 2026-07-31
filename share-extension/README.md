# Share-to-Listen handoff

Soundoc’s JavaScript app already accepts these deep links:

```
soundoc://import?url=https%3A%2F%2Fexample.com%2Farticle
soundoc://import?text=Selected%20text
```

Use the URL form for Safari articles and the text form for selected text from Safari or another application. The app opens the regular import preview rather than starting playback unexpectedly.

## Native target still required

An iOS Share Extension is a separate Xcode target and cannot be registered solely from this managed Expo project. Before shipping Share-to-Listen, add a Share Extension target in Xcode, configure its `NSExtensionActivationRule` for `public.url` and `public.plain-text`, and hand the received URL or text to the contract above. Use an App Group for a reliable handoff when the app is not running.

The App Group identifier must be chosen alongside the final bundle identifier; this repository intentionally does not invent either identifier. Test the extension on a physical iPhone after configuring signing and the App Group entitlement.
