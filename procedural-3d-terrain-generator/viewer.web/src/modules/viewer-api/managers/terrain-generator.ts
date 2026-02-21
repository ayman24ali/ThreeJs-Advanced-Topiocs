import {PerlinNoise} from "./perlin-noise";

/**
 * TerrainGenerator
 * ----------------
 * Converts raw Perlin noise into realistic terrain heights using
 * Fractional Brownian Motion (fBm).
 *
 * Why fBm instead of plain noise?
 *  A single noise sample looks like smooth rolling hills — no fine
 *  detail.  fBm stacks multiple "octaves" (layers) of noise at
 *  progressively higher frequencies and lower amplitudes, mimicking
 *  how real landscapes have both large mountain ranges AND small
 *  surface roughness.
 */
export class TerrainGenerator {
    /** Underlying Perlin noise generator used to sample each octave. */
    perlinNoise: PerlinNoise;

    /**
     * @param perlinNoise - A pre-constructed PerlinNoise instance.
     *   Injected so the same noise object can be shared / seeded externally.
     */
    constructor(perlinNoise: PerlinNoise) {
        this.perlinNoise = perlinNoise;
    }

    /**
     * fbm — Fractional Brownian Motion
     * ----------------------------------
     * Sums `octaves` layers of Perlin noise, each with increasing frequency
     * and decreasing amplitude, then normalises the result to [-1, 1].
     *
     * Formula per octave i:
     *   value     += noise(x * frequency, y * frequency) * amplitude
     *   amplitude *= persistence    (typically 0.5 — each octave is quieter)
     *   frequency *= lacunarity     (typically 2.0 — each octave is finer)
     *
     * @param x           - World-space X coordinate of the vertex.
     * @param y           - World-space Y coordinate of the vertex.
     * @param octaves     - Number of noise layers (more = more detail, slower).
     * @param persistence - Amplitude multiplier per octave (0–1).
     *                      Lower values → smoother terrain.
     * @param lacunarity  - Frequency multiplier per octave (> 1).
     *                      Higher values → more high-frequency detail.
     * @param scale       - Base frequency / zoom level of the noise.
     *                      Small values (e.g. 0.003) zoom out for large features.
     * @returns Normalised height in [-1, 1].  Multiply by a height scale
     *          (e.g. × 200) to get world units.
     */
    fbm(x: number, y: number, {octaves, persistence, lacunarity, scale}: {
        octaves: number,
        persistence: number,
        lacunarity: number,
        scale: number
    }): number {
        {
            let value = 0, amplitude = 1, frequency = scale, maxAmp = 0;
            for (let i = 0; i < octaves; i++) {
                value += this.perlinNoise.noise(x * frequency, y * frequency) * amplitude;
                maxAmp += amplitude;
                amplitude *= persistence;  // each octave contributes less
                frequency *= lacunarity;   // each octave is higher frequency
            }
            return value / maxAmp; // normalize to [-1, 1]
        }
    }
}