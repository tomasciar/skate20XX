export type RideTexture = 'roll' | 'wind' | 'grind' | 'skid';

/** Seamless, band-limited textures. No full-spectrum white-noise loops. */
export function synthesizeLoop(kind: RideTexture, sampleRate: number) {
  const duration = 2;
  const data = new Float32Array(sampleRate * duration);
  function partial(frequency: number, amplitude: number, phase = 0) {
    // Quantizing to complete cycles makes the loop boundary continuous.
    const hz = Math.round(frequency * duration) / duration;
    const step = 2 * Math.PI * hz / sampleRate;
    const sinStep = Math.sin(step), cosStep = Math.cos(step);
    let sin = Math.sin(phase), cos = Math.cos(phase);
    for (let i = 0; i < data.length; i++) {
      data[i] += sin * amplitude;
      const next = sin * cosStep + cos * sinStep;
      cos = cos * cosStep - sin * sinStep; sin = next;
    }
  }
  const bands = { roll: [45, 650, 0.17], wind: [80, 900, 0.15], grind: [280, 1600, 0.13], skid: [180, 1100, 0.12] } as const;
  const [low, high, level] = bands[kind];
  let seed = { roll: 147, wind: 811, grind: 373, skid: 991 }[kind];
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
  for (let i = 0; i < 36; i++) {
    partial(low + (high - low) * rng() ** 2, level / 6, rng() * Math.PI * 2);
  }
  if (kind === 'roll') { partial(68, 0.07); partial(113, 0.04); partial(227, 0.025); }
  if (kind === 'grind') { partial(417, 0.085); partial(733, 0.05); partial(1181, 0.025); }
  if (kind === 'skid') { partial(420, 0.035); partial(870, 0.02); }
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    const pulse = kind === 'roll' ? 0.88 + Math.cos(2 * Math.PI * 14 * t) * 0.12
      : kind === 'wind' ? 0.90 + Math.cos(2 * Math.PI * 0.5 * t) * 0.10
      : 0.85 + Math.cos(2 * Math.PI * 23 * t) * 0.15;
    data[i] *= pulse; peak = Math.max(peak, Math.abs(data[i]!));
  }
  if (peak > 0.7) for (let i = 0; i < data.length; i++) data[i] *= 0.7 / peak;
  return data;
}
