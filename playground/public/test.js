#!/usr/bin/env node

const ESC = "\x1b";
const CSI = `${ESC}[`;

function write(text) {
  process.stdout.write(text);
}

function line(text = "") {
  write(`${text}\n`);
}

line(`${CSI}1mrestty capability test (node)${CSI}0m`);
line("---------------------------------");
line();

line(`${CSI}1mStyles${CSI}0m`);
line(`${CSI}1mBold${CSI}0m ${CSI}2mDim${CSI}0m ${CSI}3mItalic${CSI}0m ${CSI}4mUnderline${CSI}0m ${CSI}9mStrike${CSI}0m ${CSI}7mReverse${CSI}0m`);
line(`${CSI}4:1mUnderline single${CSI}0m ${CSI}4:2mUnderline double${CSI}0m`);
line();

line(`${CSI}1mBase 16 colors${CSI}0m`);
for (let i = 0; i < 16; i += 1) {
  write(`${CSI}48;5;${i}m  ${CSI}0m`);
  if ((i + 1) % 8 === 0) line();
}
line();

line(`${CSI}1mUnicode and width${CSI}0m`);
line("你好 世界  日本語  한글  🇺🇸 🇯🇵  👨‍👩‍👧  é ñ ä");
line();

line(`${CSI}1mBox/Braille/Symbols${CSI}0m`);
line("┌──────────────────────────────┐");
line("│  mono renderer box drawing   │");
line("└──────────────────────────────┘");
line("⠀⠁⠂⠄⡀⢀⣀⣿  ░▒▓█  ▁▂▃▄▅▆▇█      ");
line();

line("Try: node colors.js");
line("Try: node ansi-art.js");
line("Try: node animation.js");
line("Try: node kitty.js");
line();
line("Done.");
