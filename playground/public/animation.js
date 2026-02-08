#!/usr/bin/env node

const ESC = "\x1b";
const CSI = `${ESC}[`;
const FRAMES = ["|", "/", "-", "\\\\"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function write(text) {
  process.stdout.write(text);
}

async function spinner(label, loops, delayMs) {
  for (let i = 0; i < loops; i += 1) {
    const f = FRAMES[i % FRAMES.length];
    write(`\r${CSI}38;5;81m[${f}]${CSI}0m ${label}`);
    await sleep(delayMs);
  }
  write("\r");
}

async function progressBar(label, steps, delayMs) {
  for (let i = 0; i <= steps; i += 1) {
    const pct = Math.round((i * 100) / steps);
    const fill = Math.round((i * 30) / steps);
    const empty = 30 - fill;
    write(`\r${label} ${CSI}38;5;46m${"█".repeat(fill)}${CSI}38;5;240m${"░".repeat(empty)}${CSI}0m ${String(pct).padStart(3, " ")}%`);
    await sleep(delayMs);
  }
  write("\n");
}

async function colorWave(rows, width, delayMs) {
  for (let frame = 0; frame < rows; frame += 1) {
    let row = "";
    for (let col = 0; col < width; col += 1) {
      const idx = 16 + ((col + frame) % 216);
      row += `${CSI}48;5;${idx}m ${CSI}0m`;
    }
    write(`${row}\n`);
    await sleep(delayMs);
  }
}

async function main() {
  write(`${CSI}?25l`);
  write(`${CSI}1mrestty animation showcase${CSI}0m\n\n`);
  await spinner("warming render pipeline", 32, 35);
  write("\n");
  await progressBar("atlas update", 40, 18);
  write("\n");
  await colorWave(12, 40, 28);
  write(`\n${CSI}38;5;46mDone.${CSI}0m\n`);
  write(`${CSI}?25h`);
}

void main().catch((err) => {
  write(`${CSI}?25h`);
  console.error(err);
  process.exitCode = 1;
});
