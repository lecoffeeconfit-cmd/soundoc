# OCR and sharing notes

Camera captures and photo-library images are recognized locally through the installed platform text-recognition module. Soundoc presents the OCR result for correction before saving and retains the original image URI separately from the cleaned spoken text. Multiple photo-library images are combined in selection order.

Image-only PDF OCR is not silently treated as an empty document. It still requires a PDF-page rasterizer/OCR pipeline that is not present in the current Expo-only build; users are directed to scan pages or choose a text-based PDF instead.

The current share handoff supports Soundoc URL links (`soundoc://import?...`) and the Files picker. A true iOS Share Extension for arbitrary URLs, selected text, PDFs, images, and documents requires a native extension target and app-group configuration. Those native targets are intentionally not generated or modified in this build.

