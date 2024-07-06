// h262 constants

/**
 * Picture Start Code
 */
export const PSC = 0x10;

/**
 * Group of Blocks Start Code
 */
export const GBSC = 1;

// MTYPE.type bits
export const MT_INTER = 1;
export const MT_MC = 2;
export const MT_FILTER = 4;

/**
 * Size (in pixels) of a macroblock.
 */
export const MB_SIZE = 16;
/**
 * Width (in macroblocks) of GOB.
 */
export const GOB_WIDTH = 11;
/**
 * Height (in macroblocks) of GOB.
 */
export const GOB_HEIGHT = 3;
/**
 * Width (in pixels) of the full frame buffer.
 */
export const CIF_WIDTH = 2 * GOB_WIDTH * MB_SIZE;
/**
 * Height (in pixels) of the full frame buffer.
 */
export const CIF_HEIGHT = 6 * GOB_HEIGHT * MB_SIZE;
/**
 * Target frame time
 */
export const FRAME_TIME = 1001 / 30;

/**
 * 3x3 Gausian blur, multiply with 1/16 
 */
export const FILTER = [
    [1, 2, 1],
    [2, 4, 2],
    [1, 2, 1]
]

export enum PredictionType {
    Intra = 0,
    Inter = 1,
    Inter_MC = 3,
    Inter_MC_FIL = 7,
}

export type MType = {
    /**
     * Prediction type
     */
    type: PredictionType
    /**
     * Has per block quantization factor?
     */
    mq: boolean,
    /**
     * Is motion corrected?
     */
    mv: boolean,
    /**
     * Has a Coded Block Pattern? (CBP specifies which blocks are encoded)
     */
    cb: boolean,
    /**
     * Has coefficients aka. block data?
     */
    tc: boolean,
}

const XX = true;
const __ = false;

/**
 * MTYPE LUT: key is ammount of leading zeroes
 */
export const MTYPE: Record<number, MType> = {
    3: { mq: __, mv: __, cb: __, tc: XX, type: PredictionType.Intra, },
    6: { mq: XX, mv: __, cb: __, tc: XX, type: PredictionType.Intra, },

    0: { mq: __, mv: __, cb: XX, tc: XX, type: PredictionType.Inter, },
    4: { mq: XX, mv: __, cb: XX, tc: XX, type: PredictionType.Inter, },

    8: { mq: __, mv: XX, cb: __, tc: __, type: PredictionType.Inter_MC, },
    7: { mq: __, mv: XX, cb: XX, tc: XX, type: PredictionType.Inter_MC, },
    9: { mq: XX, mv: XX, cb: XX, tc: XX, type: PredictionType.Inter_MC, },

    2: { mq: __, mv: XX, cb: __, tc: __, type: PredictionType.Inter_MC_FIL, },
    1: { mq: __, mv: XX, cb: XX, tc: XX, type: PredictionType.Inter_MC_FIL, },
    5: { mq: XX, mv: XX, cb: XX, tc: XX, type: PredictionType.Inter_MC_FIL, },
}

/**
 * Un-zig-zags the coefficients
 */
export const TCOEFF_REORDER = [
    0, 1, 8, 16, 9, 2, 3, 10,
    17, 24, 32, 25, 18, 11, 4, 5,
    12, 19, 26, 33, 40, 48, 41, 34,
    27, 20, 13, 6, 7, 14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36,
    29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46,
    53, 60, 61, 54, 47, 55, 62, 63
]
