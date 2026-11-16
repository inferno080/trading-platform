/**
 * Small seeded PRNG (mulberry32) so runs are reproducible.
 * The same seed always gives the same sequence, unlike Math.random().
 * Returns next() (0 to 1), int(max) (whole number below max) and gauss() (bell-curve value around 0).
 */
export const createRng = (seed: number) => {
  let a = seed >>> 0;
  /** Scrambles the internal counter `a` into a 0-1 number; the bit math is the mulberry32 algorithm. */
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Whole number from 0 to maxExclusive - 1. */
    int: (maxExclusive: number): number => Math.floor(next() * maxExclusive),
    /**
     * Approx standard normal via sum of uniforms: mostly small values, occasionally large ones.
     * Summing four 0-1 numbers and subtracting 2 centers it on 0; 1.732 scales the spread to about 1.
     * Used for price moves.
     */
    gauss: (): number => (next() + next() + next() + next() - 2) * 1.732,
  };
};
/** The type of the object createRng returns, for declaring parameters elsewhere. */
export type Rng = ReturnType<typeof createRng>;
