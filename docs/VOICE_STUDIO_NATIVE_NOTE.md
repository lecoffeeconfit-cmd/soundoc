# Voice Studio native audio note

Soundoc intentionally keeps Voice Studio on the built-in `expo-speech` engine. Live bass, treble, equalizer, reverb, echo, compression, panning, stereo width, distortion, noise filtering, and processed export are not exposed in this build and should not be represented as fake controls.

If those capabilities are needed later, iOS could use `AVSpeechSynthesizer.write(_:toBufferCallback:)` with an `AVAudioEngine`, `AVAudioUnitEQ`, `AVAudioUnitReverb`, and `AVAudioUnitDelay`, rendering or buffering speech before playback. Android could use `TextToSpeech.synthesizeToFile` with native playback/effect processing. Any future implementation would need device/engine capability detection and a separate native module; this task does not regenerate native projects.
