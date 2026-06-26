// features/team/lib/sparkline-path.ts — pure, unit-testable, zero React

export function buildSparklinePath(
  values: number[],
  width: number,
  height: number,
  padding = 4
): { path: string; points: { x: number; y: number }[] } {
  if (values.length === 0) {
    return { path: "", points: [] };
  }

  if (values.length === 1) {
    const x = width / 2;
    const y = height / 2;
    return { path: `M ${x} ${y}`, points: [{ x, y }] };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  
  const isFlat = min === max;
  const range = isFlat ? 1 : max - min;

  const points = values.map((v, i) => ({
    x: padding + (i / (values.length - 1)) * (width - padding * 2),
    y: isFlat
      ? height / 2
      : height - padding - ((v - min) / range) * (height - padding * 2),
  }));

  const path = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  return { path, points };
}
