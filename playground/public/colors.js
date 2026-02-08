#!/usr/bin/env node

const ESC = "\x1b";
const CSI = `${ESC}[`;

function write(text) {
  process.stdout.write(text);
}

function line(text = "") {
  write(`${text}\n`);
}

line(`${CSI}1mrestty colors showcase${CSI}0m`);
line();

line(`${CSI}1mBase 16${CSI}0m`);
for (let i = 0; i < 16; i += 1) {
  write(`${CSI}48;5;${i}m  ${CSI}0m`);
  if ((i + 1) % 8 === 0) line();
}
line();

line(`${CSI}1m256-color cube${CSI}0m`);
for (let r = 0; r < 6; r += 1) {
  for (let g = 0; g < 6; g += 1) {
    for (let b = 0; b < 6; b += 1) {
      const idx = 16 + r * 36 + g * 6 + b;
      write(`${CSI}48;5;${idx}m  ${CSI}0m`);
    }
    write(" ");
  }
  line();
}
line();

line(`${CSI}1mGrayscale ramp${CSI}0m`);
for (let i = 232; i <= 255; i += 1) {
  write(`${CSI}48;5;${i}m  ${CSI}0m`);
}
line();
line();

line(`${CSI}1mTruecolor text${CSI}0m`);
line(`${CSI}38;2;255;100;0mOrange${CSI}0m ${CSI}38;2;120;200;255mSky${CSI}0m ${CSI}38;2;160;255;160mMint${CSI}0m`);
line();
line("Done.");
