# OCR and sharing notes

Camera captures and photo-library images are recognized locally through the installed platform text-recognition module. Soundoc presents the OCR result for correction before saving and retains the original image URI separately from the cleaned spoken text. Multiple photo-library images are combined in selection order.

Image-only PDF OCR is not silently treated as an empty document. It still requires a PDF-page rasterizer/OCR pipeline that is not present in the current Expo-only build; users are directed to scan pages or choose a text-based PDF instead.

The current share handoff supports Soundoc URL links (`soundoc://import?...`),
webpage/web URL shares, selected plain text, and one local TXT, Markdown, HTML,
RTF, PDF, EPUB, DOCX, or image share. Documents use the same managed-storage
and sectioned importer as the Files picker. Images use on-device OCR and open
the existing editable review screen before saving. The `expo-sharing` plugin
generates the native iOS Share Extension and Android share intent registration.
Unsupported file types, audio/video, and multi-file shares remain outside the
first local-file share release.

Share Sheet registration requires a new native build after configuration
changes. Background App Refresh/data access is not required; the app's existing
audio background mode is for playback only.
