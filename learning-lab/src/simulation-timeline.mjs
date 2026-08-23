function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

export function buildProcessingTimeline({ totalPixels, groupSize }) {
  requirePositiveInteger(totalPixels, "totalPixels");
  requirePositiveInteger(groupSize, "groupSize");

  const cpu = Array.from({ length: totalPixels }, (_, pixelId) => ({
    phase: "work",
    pixelIds: [pixelId],
  }));
  const gpu = [
    { phase: "prepare", pixelIds: [] },
    { phase: "submit", pixelIds: [] },
  ];

  for (let first = 0; first < totalPixels; first += groupSize) {
    gpu.push({
      phase: "work",
      pixelIds: Array.from(
        { length: Math.min(groupSize, totalPixels - first) },
        (_, offset) => first + offset,
      ),
    });
  }
  gpu.push({ phase: "readback", pixelIds: [] });

  return { cpu, gpu };
}
