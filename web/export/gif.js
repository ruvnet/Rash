/* GIF89a encoder. Fixed RGB332 palette, streaming frames, bounded LZW dictionary. */
const palette = new Uint8Array(768);
for (let i = 0; i < 256; i++) {
  palette[i * 3] = Math.round(((i >> 5) & 7) * 255 / 7);
  palette[i * 3 + 1] = Math.round(((i >> 2) & 7) * 255 / 7);
  palette[i * 3 + 2] = Math.round((i & 3) * 255 / 3);
}
export function quantizeRGBA(rgba) {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) {
    const alpha = rgba[i * 4 + 3] / 255;
    const r = Math.round(rgba[i * 4] * alpha + 255 * (1 - alpha));
    const g = Math.round(rgba[i * 4 + 1] * alpha + 255 * (1 - alpha));
    const b = Math.round(rgba[i * 4 + 2] * alpha + 255 * (1 - alpha));
    out[i] = (r & 224) | ((g & 224) >> 3) | (b >> 6);
  }
  return out;
}
export function lzwEncode(indices) {
  const output = [];
  let bits = 0, bitCount = 0, codeSize = 9, nextCode = 258;
  let dictionary = new Map();
  const emit = code => {
    bits |= code << bitCount; bitCount += codeSize;
    while (bitCount >= 8) { output.push(bits & 255); bits >>>= 8; bitCount -= 8; }
  };
  emit(256);
  if (indices.length) {
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const value = indices[i], key = prefix * 256 + value;
      if (dictionary.has(key)) { prefix = dictionary.get(key); continue; }
      emit(prefix);
      // Decoder adds entries one emitted code later than the encoder.
      if (nextCode >= (1 << codeSize) && codeSize < 12) codeSize++;
      if (nextCode < 4096) dictionary.set(key, nextCode++);
      else { emit(256); dictionary = new Map(); codeSize = 9; nextCode = 258; }
      prefix = value;
    }
    emit(prefix);
    if (nextCode >= (1 << codeSize) && codeSize < 12) codeSize++;
  }
  emit(257);
  if (bitCount) output.push(bits & 255);
  return Uint8Array.from(output);
}
export class GIFEncoder {
  constructor(width, height, { loop = true } = {}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) throw new Error('GIF dimensions must be integers from 1 to 4096.');
    this.width = width; this.height = height; this.closed = false; this.frames = 0;
    this.parts = [new TextEncoder().encode('GIF89a'), Uint8Array.of(width & 255, width >> 8, height & 255, height >> 8, 247, 0, 0), palette];
    if (loop) this.parts.push(Uint8Array.of(33, 255, 11), new TextEncoder().encode('NETSCAPE2.0'), Uint8Array.of(3, 1, 0, 0, 0));
  }
  addFrame(rgba, delay = 10) {
    if (this.closed) throw new Error('GIF is already finalized.');
    if (rgba.length !== this.width * this.height * 4) throw new Error('GIF frame dimensions do not match.');
    const duration = Math.max(1, Math.min(65535, Math.round(delay)));
    const packed = lzwEncode(quantizeRGBA(rgba));
    this.parts.push(Uint8Array.of(33, 249, 4, 4, duration & 255, duration >> 8, 0, 0, 44, 0, 0, 0, 0, this.width & 255, this.width >> 8, this.height & 255, this.height >> 8, 0, 8));
    for (let offset = 0; offset < packed.length; offset += 255) {
      const block = packed.subarray(offset, offset + 255);
      this.parts.push(Uint8Array.of(block.length), block);
    }
    this.parts.push(Uint8Array.of(0)); this.frames++;
  }
  finish() {
    if (!this.frames) throw new Error('GIF must contain a frame.');
    if (!this.closed) { this.parts.push(Uint8Array.of(59)); this.closed = true; }
    return new Blob(this.parts, { type: 'image/gif' });
  }
}
