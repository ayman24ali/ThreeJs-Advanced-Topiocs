import {PerlinNoise} from "./perlin-noise";

export class TerrainGenerator {
perlinNoise: PerlinNoise;
    constructor(perlinNoise: PerlinNoise) {
    this.perlinNoise = perlinNoise;
    }

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