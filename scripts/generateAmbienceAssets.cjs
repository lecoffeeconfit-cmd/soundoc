const fs = require('node:fs');
const path = require('node:path');

const outputDirectory = path.resolve(__dirname, '..', 'assets', 'ambience');
const sampleRate = 16000;
const durationSeconds = 12;
const sampleCount = sampleRate * durationSeconds;

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function clamp(value) {
  return Math.max(-1, Math.min(1, value));
}

function writeWav(fileName, seed, sampleAt) {
  const nextRandom = random(seed);
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) samples[index] = clamp(sampleAt(index, nextRandom));

  // Make the loop boundary quiet and continuous enough that it does not click.
  const blendSamples = Math.floor(sampleRate * 0.12);
  for (let offset = 0; offset < blendSamples; offset += 1) {
    const amount = offset / blendSamples;
    const index = sampleCount - blendSamples + offset;
    samples[index] = samples[index] * (1 - amount) + samples[offset] * amount;
  }

  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < sampleCount; index += 1) buffer.writeInt16LE(Math.round(samples[index] * 32767), 44 + index * 2);
  fs.writeFileSync(path.join(outputDirectory, fileName), buffer);
}

function noise(nextRandom) {
  return nextRandom() * 2 - 1;
}

fs.mkdirSync(outputDirectory, { recursive: true });

writeWav('rain.wav', 11, (index, nextRandom) => {
  const seconds = index / sampleRate;
  const drop = Math.pow(Math.max(0, Math.sin(seconds * 13.7) * 0.5 + 0.5), 18) * noise(nextRandom) * 0.52;
  return noise(nextRandom) * 0.08 + drop + Math.sin(seconds * 2.1) * 0.025;
});

writeWav('cafe.wav', 23, (index, nextRandom) => {
  const seconds = index / sampleRate;
  const room = noise(nextRandom) * 0.11 + Math.sin(seconds * 1.6) * 0.08;
  const clink = Math.pow(Math.max(0, Math.sin(seconds * 0.83) * 0.5 + 0.5), 35) * Math.sin(seconds * 1800) * 0.12;
  return room + clink + noise(nextRandom) * 0.025;
});

let brown = 0;
writeWav('brown-noise.wav', 37, (index, nextRandom) => {
  brown = brown * 0.997 + noise(nextRandom) * 0.06;
  return brown * 0.95;
});

writeWav('white-noise.wav', 41, (_index, nextRandom) => noise(nextRandom) * 0.3);

let fireplaceBrown = 0;
writeWav('fireplace.wav', 53, (index, nextRandom) => {
  const seconds = index / sampleRate;
  fireplaceBrown = fireplaceBrown * 0.996 + noise(nextRandom) * 0.07;
  const crackle = Math.pow(Math.max(0, Math.sin(seconds * 2.3) * 0.5 + 0.5), 32) * noise(nextRandom) * 0.7;
  return fireplaceBrown * 0.6 + crackle + Math.sin(seconds * 42) * 0.018;
});

writeWav('nature.wav', 67, (index, nextRandom) => {
  const seconds = index / sampleRate;
  const breeze = noise(nextRandom) * 0.06 + Math.sin(seconds * 0.7) * 0.1;
  const bird = Math.sin(seconds * 420 + Math.sin(seconds * 4) * 8) * Math.pow(Math.max(0, Math.sin(seconds * 0.37) * 0.5 + 0.5), 24) * 0.16;
  return breeze + bird;
});
