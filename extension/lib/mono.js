// Black and white for a thermal label printer: every dot is black or white, so a picture is cut down to one bit per pixel.
// rgba: the pixels as canvas ImageData gives them (4 bytes per pixel, straight alpha). Returns one byte per pixel,
// 1 = black, 0 = white. A see-through pixel counts as white paper.
//   threshold: 0-100. A pixel darker than this share of the way from black to white turns black. 50 is the middle.
//   dither: Floyd-Steinberg. Grey areas become a pattern of dots instead of all black or all white.
export function toMono(rgba, w, h, { threshold = 50, dither = false } = {}) {
  const cut = Math.min(100, Math.max(0, +threshold)) * 2.55;
  const grey = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3] / 255;
    const luma = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    grey[i] = 255 * (1 - a) + luma * a;
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, old = grey[i], black = old < cut;
      out[i] = black ? 1 : 0;
      if (!dither) continue;
      const err = old - (black ? 0 : 255);
      if (x + 1 < w) grey[i + 1] += err * 7 / 16;
      if (y + 1 < h) {
        if (x > 0) grey[i + w - 1] += err * 3 / 16;
        grey[i + w] += err * 5 / 16;
        if (x + 1 < w) grey[i + w + 1] += err * 1 / 16;
      }
    }
  }
  return out;
}

// The bits as RGBA pixels for a canvas: black or white, fully opaque.
export function monoToRgba(bits, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = bits[i] ? 0 : 255;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}
