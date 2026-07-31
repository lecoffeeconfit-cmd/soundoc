/**
 * OCR is an optional native capability. Dynamic loading keeps Expo Go usable:
 * the native implementation is only touched after the user chooses a photo or camera import.
 */
export async function recognizeImageText(uri: string): Promise<string[]> {
  try {
    const { getTextFromFrame } = await import('expo-text-recognition');
    return await getTextFromFrame(uri);
  } catch {
    throw new Error('Text recognition needs a Soundoc development or production build. It is not available in Expo Go.');
  }
}
