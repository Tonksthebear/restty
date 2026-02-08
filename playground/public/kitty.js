#!/usr/bin/env node

const ESC = "\x1b";
const CSI = `${ESC}[`;
const APC = `${ESC}_G`;
const ST = `${ESC}\\`;

const DEFAULT_COLS = 48;
const DEFAULT_ROWS = 16;

function write(text) {
  process.stdout.write(text);
}

function sendKitty(params, payload = "") {
  const body = payload ? `${params};${payload}` : params;
  write(`${APC}${body}${ST}`);
}

function makeCatImage(width, height) {
  const size = width * height * 3;
  const bytes = Buffer.allocUnsafe(size);

  const setPixel = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    bytes[i] = r;
    bytes[i + 1] = g;
    bytes[i + 2] = b;
  };

  const fillRect = (x0, y0, w, h, r, g, b) => {
    const x1 = x0 + w;
    const y1 = y0 + h;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        setPixel(x, y, r, g, b);
      }
    }
  };

  const fillCircle = (cx, cy, radius, r, g, b) => {
    const rr = radius * radius;
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= rr) setPixel(x, y, r, g, b);
      }
    }
  };

  // Background gradient.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = y / Math.max(1, height - 1);
      const r = Math.round(20 + 30 * t + 10 * Math.sin((x / width) * Math.PI));
      const g = Math.round(30 + 90 * t);
      const b = Math.round(70 + 120 * t);
      setPixel(x, y, r, g, b);
    }
  }

  // Ground strip.
  fillRect(0, Math.floor(height * 0.8), width, Math.ceil(height * 0.2), 45, 55, 50);

  const cx = Math.floor(width * 0.5);
  const cy = Math.floor(height * 0.52);
  const headR = Math.floor(Math.min(width, height) * 0.24);

  // Ears (outer).
  for (let i = 0; i < headR; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      setPixel(cx - headR + j, cy - headR - i + headR / 3, 185, 140, 95);
      setPixel(cx + headR - j, cy - headR - i + headR / 3, 185, 140, 95);
    }
  }

  // Head.
  fillCircle(cx, cy, headR, 190, 145, 100);
  fillCircle(cx, cy + Math.floor(headR * 0.25), Math.floor(headR * 0.95), 190, 145, 100);

  // Ear inner.
  for (let i = 0; i < Math.floor(headR * 0.6); i += 1) {
    for (let j = 0; j <= i; j += 1) {
      setPixel(cx - headR + j + 3, cy - headR - i + Math.floor(headR * 0.45), 230, 175, 165);
      setPixel(cx + headR - j - 3, cy - headR - i + Math.floor(headR * 0.45), 230, 175, 165);
    }
  }

  // Eyes.
  const eyeY = cy - Math.floor(headR * 0.1);
  fillCircle(cx - Math.floor(headR * 0.45), eyeY, Math.max(2, Math.floor(headR * 0.12)), 25, 35, 25);
  fillCircle(cx + Math.floor(headR * 0.45), eyeY, Math.max(2, Math.floor(headR * 0.12)), 25, 35, 25);
  setPixel(cx - Math.floor(headR * 0.48), eyeY - 1, 245, 245, 235);
  setPixel(cx + Math.floor(headR * 0.48), eyeY - 1, 245, 245, 235);

  // Nose + mouth.
  fillCircle(cx, cy + Math.floor(headR * 0.18), Math.max(2, Math.floor(headR * 0.09)), 235, 145, 145);
  setPixel(cx, cy + Math.floor(headR * 0.33), 70, 50, 45);
  setPixel(cx - 1, cy + Math.floor(headR * 0.36), 70, 50, 45);
  setPixel(cx + 1, cy + Math.floor(headR * 0.36), 70, 50, 45);

  // Whiskers.
  for (let d = 1; d <= Math.floor(headR * 0.75); d += 1) {
    setPixel(cx - d - 4, cy + Math.floor(headR * 0.22) - Math.floor(d * 0.15), 245, 245, 230);
    setPixel(cx - d - 4, cy + Math.floor(headR * 0.28) + Math.floor(d * 0.1), 245, 245, 230);
    setPixel(cx + d + 4, cy + Math.floor(headR * 0.22) - Math.floor(d * 0.15), 245, 245, 230);
    setPixel(cx + d + 4, cy + Math.floor(headR * 0.28) + Math.floor(d * 0.1), 245, 245, 230);
  }

  // Paws.
  fillCircle(cx - Math.floor(headR * 0.45), cy + Math.floor(headR * 1.05), Math.max(3, Math.floor(headR * 0.23)), 175, 130, 90);
  fillCircle(cx + Math.floor(headR * 0.45), cy + Math.floor(headR * 1.05), Math.max(3, Math.floor(headR * 0.23)), 175, 130, 90);

  return bytes;
}

function isPngBuffer(bytes) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!bytes || bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i += 1) {
    if (bytes[i] !== sig[i]) return false;
  }
  return true;
}

async function tryDownloadPng(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!isPngBuffer(bytes)) {
    throw new Error("Downloaded file is not PNG");
  }
  return bytes;
}

async function main() {
  const imageUrl = process.argv[2] || "";
  const imageId = Math.floor((Date.now() % 900000) + 100000);

  write(`${CSI}1mrestty kitty graphics probe${CSI}0m\n\n`);
  write(`Image id: ${imageId}\n`);
  if (imageUrl) write(`Image URL: ${imageUrl}\n`);
  write("\n");

  // Use q=2 (quiet) to avoid protocol ACKs polluting shell output.
  if (imageUrl) {
    try {
      write("Downloading PNG...\n");
      const png = await tryDownloadPng(imageUrl);
      write(`Downloaded ${png.length} bytes. Transmitting...\n`);
      sendKitty(`a=T,f=100,t=d,i=${imageId},c=${DEFAULT_COLS},r=${DEFAULT_ROWS},q=2`, png.toString("base64"));
      write("Done.\n");
      write("If supported, the PNG image should be visible above.\n");
      return;
    } catch (error) {
      write(`Download failed: ${error instanceof Error ? error.message : String(error)}\n`);
      write("Falling back to built-in RGB gradient.\n\n");
    }
  }

  const width = 96;
  const height = 64;
  const rgb = makeCatImage(width, height);
  write("Transmitting built-in cat pixel art image...\n");
  sendKitty(
    `a=T,f=24,t=d,s=${width},v=${height},i=${imageId},c=56,r=22,q=2`,
    rgb.toString("base64"),
  );
  write("Done.\n");
  write("If supported, a cat image should be visible above.\n");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
