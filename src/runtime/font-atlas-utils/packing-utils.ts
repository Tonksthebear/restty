export function nextPowerOf2(n: number): number {
  if (n <= 0) return 1;
  let v = n - 1;
  v |= v >> 1;
  v |= v >> 2;
  v |= v >> 4;
  v |= v >> 8;
  v |= v >> 16;
  return v + 1;
}

export function packGlyphs(
  sizes: Array<{ width: number; height: number }>,
  maxWidth: number,
  maxHeight: number,
) {
  const shelves: Array<{ y: number; height: number; width: number }> = [];
  const placements: Array<{ x: number; y: number; placed: boolean }> = [];
  let atlasWidth = 0;
  let atlasHeight = 0;

  for (let i = 0; i < sizes.length; i += 1) {
    const size = sizes[i];
    let placed = false;
    let bestShelf = -1;
    let bestY = maxHeight;

    for (let j = 0; j < shelves.length; j += 1) {
      const shelf = shelves[j];
      if (shelf.width + size.width <= maxWidth && size.height <= shelf.height) {
        if (shelf.y < bestY) {
          bestShelf = j;
          bestY = shelf.y;
        }
      }
    }

    if (bestShelf >= 0) {
      const shelf = shelves[bestShelf];
      placements.push({ x: shelf.width, y: shelf.y, placed: true });
      shelf.width += size.width;
      atlasWidth = Math.max(atlasWidth, shelf.width);
      placed = true;
    } else {
      const newY = atlasHeight;
      if (newY + size.height <= maxHeight && size.width <= maxWidth) {
        shelves.push({ y: newY, height: size.height, width: size.width });
        placements.push({ x: 0, y: newY, placed: true });
        atlasHeight = newY + size.height;
        atlasWidth = Math.max(atlasWidth, size.width);
        placed = true;
      }
    }

    if (!placed) placements.push({ x: 0, y: 0, placed: false });
  }

  const finalWidth = nextPowerOf2(atlasWidth);
  const finalHeight = nextPowerOf2(atlasHeight);
  return {
    width: Math.min(finalWidth, maxWidth),
    height: Math.min(finalHeight, maxHeight),
    placements,
  };
}
