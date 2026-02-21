
export class PerlinNoise {
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

    constructor() {
// Fill permutation table
        for (let i = 0; i < 256; i++) this.perm[i] = this.perm[i + 256] = this.p[i];
    }

// Permutation table - shuffled array of 0-255, doubled to avoid overflow
    private perm = new Uint8Array(512);

// Fade function - smooths interpolation (6t^5 - 15t^4 + 10t^3)
    private fade(t:number) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

// Linear interpolation
    private lerp(a:number, b:number, t:number) {
        return a + t * (b - a);
    }

// Gradient function - maps hash to one of 8 gradient directions
    private grad(hash:number, x:number, y:number) {
        // Take last 3 bits of hash to pick a gradient vector
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }

// 2D Perlin noise - returns value in roughly [-1, 1]
    noise(x:number, y:number) {
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