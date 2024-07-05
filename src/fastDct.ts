/* 
 * Fast discrete cosine transform algorithms (TypeScript)
 * 
 * Copyright (c) 2022 Project Nayuki. (MIT License)
 * https://www.nayuki.io/page/fast-discrete-cosine-transform-algorithms
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability,
 *   fitness for a particular purpose and noninfringement. In no event shall the
 *   authors or copyright holders be liable for any claim, damages or other
 *   liability, whether in an action of contract, tort or otherwise, arising from,
 *   out of or in connection with the Software or the use or other dealings in the
 *   Software.
 */

// I removed all but the fastDct, shoutout Nayuki

let S = new Float32Array(8);
let C = new Float32Array(8);
for (let i = 0; i < 8; i++) {
    C[i] = Math.cos(Math.PI / 16 * i);
    S[i] = 1 / (4 * C[i]);
}

S[0] = 1 / (2 * Math.sqrt(2));

let A = new Float32Array([NaN, C[4], C[2] - C[6], C[4], C[6] + C[2], C[6]]);



// DCT type II, scaled. Algorithm by Arai, Agui, Nakajima, 1988.
// See: https://web.stanford.edu/class/ee398a/handouts/lectures/07-TransformCoding.pdf#page=30
export function transform(vector: Int16Array): void {
    const v0 = vector[0] + vector[7];
    const v1 = vector[1] + vector[6];
    const v2 = vector[2] + vector[5];
    const v3 = vector[3] + vector[4];
    const v4 = vector[3] - vector[4];
    const v5 = vector[2] - vector[5];
    const v6 = vector[1] - vector[6];
    const v7 = vector[0] - vector[7];

    const v8 = v0 + v3;
    const v9 = v1 + v2;
    const v10 = v1 - v2;
    const v11 = v0 - v3;
    const v12 = -v4 - v5;
    const v13 = (v5 + v6) * A[3];
    const v14 = v6 + v7;

    const v15 = v8 + v9;
    const v16 = v8 - v9;
    const v17 = (v10 + v11) * A[1];
    const v18 = (v12 + v14) * A[5];

    const v19 = -v12 * A[2] - v18;
    const v20 = v14 * A[4] - v18;

    const v21 = v17 + v11;
    const v22 = v11 - v17;
    const v23 = v13 + v7;
    const v24 = v7 - v13;

    const v25 = v19 + v24;
    const v26 = v23 + v20;
    const v27 = v23 - v20;
    const v28 = v24 - v19;

    vector[0] = S[0] * v15;
    vector[1] = S[1] * v26;
    vector[2] = S[2] * v21;
    vector[3] = S[3] * v28;
    vector[4] = S[4] * v16;
    vector[5] = S[5] * v25;
    vector[6] = S[6] * v22;
    vector[7] = S[7] * v27;
}


// DCT type III, scaled. A straightforward inverse of the forward algorithm.
export function inverseTransform(vector: Int16Array): void {
    const v15 = vector[0] / S[0];
    const v26 = vector[1] / S[1];
    const v21 = vector[2] / S[2];
    const v28 = vector[3] / S[3];
    const v16 = vector[4] / S[4];
    const v25 = vector[5] / S[5];
    const v22 = vector[6] / S[6];
    const v27 = vector[7] / S[7];

    const v19 = (v25 - v28) / 2;
    const v20 = (v26 - v27) / 2;
    const v23 = (v26 + v27) / 2;
    const v24 = (v25 + v28) / 2;

    const v7 = (v23 + v24) / 2;
    const v11 = (v21 + v22) / 2;
    const v13 = (v23 - v24) / 2;
    const v17 = (v21 - v22) / 2;

    const v8 = (v15 + v16) / 2;
    const v9 = (v15 - v16) / 2;

    const v18 = (v19 - v20) * A[5];  // Different from original
    const v12 = (v19 * A[4] - v18) / (A[2] * A[5] - A[2] * A[4] - A[4] * A[5]);
    const v14 = (v18 - v20 * A[2]) / (A[2] * A[5] - A[2] * A[4] - A[4] * A[5]);

    const v6 = v14 - v7;
    const v5 = v13 / A[3] - v6;
    const v4 = -v5 - v12;
    const v10 = v17 / A[1] - v11;

    const v0 = (v8 + v11) / 2;
    const v1 = (v9 + v10) / 2;
    const v2 = (v9 - v10) / 2;
    const v3 = (v8 - v11) / 2;

    vector[0] = (v0 + v7) / 2;
    vector[1] = (v1 + v6) / 2;
    vector[2] = (v2 + v5) / 2;
    vector[3] = (v3 + v4) / 2;
    vector[4] = (v3 - v4) / 2;
    vector[5] = (v2 - v5) / 2;
    vector[6] = (v1 - v6) / 2;
    vector[7] = (v0 - v7) / 2;
}

// ---- Extra code by me :3
const { SQRT2, PI, cos } = Math;
const ISQ2 = (1 / SQRT2);

function alpha(x: number) {
    return x === 0 ? ISQ2 : 1
}

export function slow_idct(block: Int16Array) {
    const result = new Uint8ClampedArray(64);

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            let sum = 0;

            for (let v = 0; v < 8; v++) {
                for (let u = 0; u < 8; u++) {
                    const coeff = block[u + v * 8];
                    if (coeff == 0) continue;
                    sum += coeff *
                        (u === 0 ? ISQ2 : 1) * // alpha(u)
                        (v === 0 ? ISQ2 : 1) * // alpha(v)
                        cos((PI * (2 * x + 1) * u) / 16) *
                        cos((PI * (2 * y + 1) * v) / 16);
                }
            }
            result[y * 8 + x] = (sum / 4);
        }
    }
    return result;
}

export function slow_dct(block: Uint8Array) {
    const result = new Int16Array(64);
    for (let v = 0; v < 8; v++) {
        for (let u = 0; u < 8; u++) {
            let sum = 0;

            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    sum += block[x + y * 8]
                        * cos((PI * (2 * x + 1) * u) / 16)
                        * cos((PI * (2 * y + 1) * v) / 16);
                }
            }

            result[u + v * 8] = (sum / 4) * alpha(u) * alpha(v);
        }
    }

    return result;
}

function transpose8(matrix: Int16Array): void {
    for (let i = 0; i < 8; i++) {
        for (let j = i + 1; j < 8; j++) {
            const temp = matrix[i * 8 + j];
            matrix[i * 8 + j] = matrix[j * 8 + i];
            matrix[j * 8 + i] = temp;
        }
    }
}

export function idct2d(buffer: Int16Array): void {
    for (let i = 0; i < 8; i++) {
        const row = buffer.subarray(i * 8, (i + 1) * 8);
        inverseTransform(row);
    }
    transpose8(buffer);

    for (let i = 0; i < 8; i++) {
        const row = buffer.subarray(i * 8, (i + 1) * 8);
        inverseTransform(row);
    }

    transpose8(buffer);
}