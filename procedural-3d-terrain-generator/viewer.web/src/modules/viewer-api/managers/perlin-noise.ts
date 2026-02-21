
/**
 * PerlinNoise
 * -----------
 * Implements Ken Perlin's classic 2D gradient-noise algorithm.
 *
 * How it works (high-level):
 *  1. The input point (x, y) is placed into a unit-square grid cell.
 *  2. The four corners of that cell each get a pseudo-random gradient
 *     vector derived from a permutation table.
 *  3. A dot product between each gradient and the offset from that
 *     corner to (x, y) produces an "influence" value per corner.
 *  4. The four influences are smoothly blended with a quintic (fade)
 *     curve, yielding a continuous value in roughly [-1, 1].
 *
 * Result: smooth, tileable, infinite noise with no visible grid artefacts.
 */
export class PerlinNoise {
    /**
     * Reference permutation table — the original 256-entry shuffle
     * used by Ken Perlin.  Kept read-only; the doubled working copy
     * lives in `perm`.
     */
    private p = [
        151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30,
        69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94,
        252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136,
        171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229,
        122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25,
        63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116,
        188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202,
        38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42,
        223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43,
        172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218,
        246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145,
        235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115,
        121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141,
        128, 195, 78, 66, 215, 61, 156, 180
    ];

    /**
     * Builds the doubled permutation table (indices 0-511) so that
     * hash lookups never need a modulo operation.
     */
    constructor() {
        // Fill permutation table — copy p[] into both halves of perm[]
        for (let i = 0; i < 256; i++) this.perm[i] = this.perm[i + 256] = this.p[i];
    }

    /**
     * Working permutation table (512 entries = p[] duplicated).
     * Doubling avoids index-overflow when hashing grid corners like perm[X+1].
     */
    private perm = new Uint8Array(512);

    /**
     * Quintic fade / ease curve: f(t) = 6t⁵ − 15t⁴ + 10t³
     * Ken Perlin's "improved" version (2002).  Produces zero first AND
     * second derivatives at t=0 and t=1, removing grid-aligned artefacts.
     */
    private fade(t: number) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    /**
     * Standard linear interpolation between `a` and `b` by factor `t`.
     * t=0 → a, t=1 → b.
     */
    private lerp(a: number, b: number, t: number) {
        return a + t * (b - a);
    }

    /**
     * Maps a hash value to one of 4 gradient directions in 2-D.
     * Uses the lowest 2 bits of `hash` to select (±x, ±y) pairs,
     * giving a cheap dot-product with a pseudo-random unit vector.
     *
     * @param hash  - corner hash value from the permutation table
     * @param x     - x-offset from the grid corner
     * @param y     - y-offset from the grid corner
     */
    private grad(hash: number, x: number, y: number) {
        // Take last 2 bits of hash to pick a gradient vector
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }

    /**
     * Evaluates 2-D Perlin noise at world-space coordinates (x, y).
     *
     * Steps:
     *  1. Identify the integer grid cell that contains (x, y).
     *  2. Compute fractional offsets within that cell.
     *  3. Apply fade curves to smooth the blend weights.
     *  4. Hash all four corners via the permutation table.
     *  5. Bilinearly interpolate the gradient dot-products.
     *
     * @returns A value in roughly [-1, 1].
     */
    noise(x: number, y: number) {
        // Grid cell coordinates
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;

        // Position within cell (0 to 1)
        x -= Math.floor(x);
        y -= Math.floor(y);

        // Fade curves
        const u = this.fade(x);
        const v = this.fade(y);

        // Hash the 4 corners of the grid cell
        const a = this.perm[X] + Y;
        const aa = this.perm[a];
        const ab = this.perm[a + 1];
        const b = this.perm[X + 1] + Y;
        const ba = this.perm[b];
        const bb = this.perm[b + 1];

        // Interpolate gradients from all 4 corners
        return this.lerp(
            this.lerp(this.grad(this.perm[aa], x, y),
                this.grad(this.perm[ba], x - 1, y), u),
            this.lerp(this.grad(this.perm[ab], x, y - 1),
                this.grad(this.perm[bb], x - 1, y - 1), u),
            v
        );
    }

}