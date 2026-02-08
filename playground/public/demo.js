#!/usr/bin/env node

const ESC = "\x1b";
const CSI = `${ESC}[`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function write(text) {
  process.stdout.write(text);
}

async function bootProgress() {
  for (let i = 0; i <= 24; i += 1) {
    const pct = Math.round((i * 100) / 24);
    const fill = Math.round((i * 28) / 24);
    const empty = 28 - fill;
    write(`\r${CSI}38;5;81mboot${CSI}0m ${CSI}38;5;46m${"█".repeat(fill)}${CSI}38;5;240m${"░".repeat(empty)}${CSI}0m ${String(pct).padStart(3, " ")}%`);
    await sleep(28);
  }
  write("\n\n");
}

function printPreview() {
  write(`${CSI}1mStyles:${CSI}0m ${CSI}1mBold${CSI}0m ${CSI}3mItalic${CSI}0m ${CSI}4mUnderline${CSI}0m\n`);
  write(`${CSI}1mUnicode:${CSI}0m 你好 世界 日本語 🇺🇸 👨‍👩‍👧\n`);
  write(`${CSI}1mSymbols:${CSI}0m ┌─┬─┐ ░▒▓█ ⠋⠙⠹⠸   \n`);
  write(`${CSI}1mTruecolor:${CSI}0m ${CSI}38;2;255;100;0mOrange${CSI}0m ${CSI}38;2;120;200;255mSky${CSI}0m ${CSI}38;2;160;255;160mMint${CSI}0m\n`);
}

function printCommands() {
  write("\nMore scripts:\n");
  write("  node test.js\n");
  write("  node ansi-art.js\n");
  write("  node animation.js\n");
  write("  node colors.js\n");
  write("  node kitty.js\n");
}

async function main() {
  write(`${CSI}?25l${CSI}2J${CSI}H`);
  write(`${CSI}1;38;5;81mrestty webcontainer demo (node)${CSI}0m\n\n`);
  await bootProgress();
  printPreview();
  printCommands();
  write(`\n${CSI}38;5;46mDone.${CSI}0m\n`);
  write(`${CSI}?25h`);
}

void main().catch((err) => {
  write(`${CSI}?25h`);
  console.error(err);
  process.exitCode = 1;
});
