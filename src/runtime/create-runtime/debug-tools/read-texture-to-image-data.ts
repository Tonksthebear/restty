export async function readTextureToImageData(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number,
  origin?: GPUOrigin3D,
) {
  const bytesPerRow = width * 4;
  const alignedBytesPerRow = Math.ceil(bytesPerRow / 256) * 256;
  const buffer = device.createBuffer({
    size: alignedBytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer(
    { texture, origin },
    { buffer, bytesPerRow: alignedBytesPerRow, rowsPerImage: height },
    { width, height, depthOrArrayLayers: 1 },
  );
  device.queue.submit([encoder.finish()]);

  await buffer.mapAsync(GPUMapMode.READ);
  const mapped = new Uint8Array(buffer.getMappedRange());
  const out = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const srcStart = row * alignedBytesPerRow;
    const srcEnd = srcStart + bytesPerRow;
    const dstStart = row * bytesPerRow;
    out.set(mapped.subarray(srcStart, srcEnd), dstStart);
  }
  buffer.unmap();

  return new ImageData(out, width, height);
}
