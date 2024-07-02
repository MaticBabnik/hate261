// h262 constants

export const PSC = 0x10;
export const PTYPE_IS_CIF = (1 << 2);
export const PTYPE_STILL = (1 << 1);
export const GBSC = 1;
export const INTER_BIT = 1;
export const MOTION_COMPENSATION_BIT = 2;
export const FILTER_BIT = 4;

export enum Prediction {
    Intra = 0,
    Inter = 1,
    Inter_MC = 3,
    Inter_MC_FIL = 7,
}

export type MType = {
    prediction: Prediction
    mq: boolean, // has MQUANT?
    mv: boolean, // has MVD?
    cb: boolean, // has CBP?
    tc: boolean, // has TCOEFF?
}

export function getPredictionTypeString(p: Prediction) {
    if (!p) return "Intra";
    let d = "Inter";
    if (p & MOTION_COMPENSATION_BIT) d += "+MC";
    if (p & FILTER_BIT) d += "+FIL";

    return d;
}

export function getMtypeString(t: MType) {
    const d = [];
    if (t.mq) d.push("MQANT");
    if (t.mv) d.push("MVD");
    if (t.cb) d.push("CBP");
    if (t.tc) d.push("TCOEFF");

    return `${getPredictionTypeString(t.prediction)} (${d.join('+')})`;
}


const XX = true;
const __ = false;
// LUT, key is ammount of leading zeroes
export const MTYPE: Record<number, MType> = {
    3: { mq: __, mv: __, cb: __, tc: XX, prediction: Prediction.Intra, },
    6: { mq: XX, mv: __, cb: __, tc: XX, prediction: Prediction.Intra, },

    0: { mq: __, mv: __, cb: XX, tc: XX, prediction: Prediction.Inter, },
    4: { mq: XX, mv: __, cb: XX, tc: XX, prediction: Prediction.Inter, },

    8: { mq: __, mv: XX, cb: __, tc: __, prediction: Prediction.Inter_MC, },
    7: { mq: __, mv: XX, cb: XX, tc: XX, prediction: Prediction.Inter_MC, },
    9: { mq: XX, mv: XX, cb: XX, tc: XX, prediction: Prediction.Inter_MC, },

    2: { mq: __, mv: XX, cb: __, tc: __, prediction: Prediction.Inter_MC_FIL, },
    1: { mq: __, mv: XX, cb: XX, tc: XX, prediction: Prediction.Inter_MC_FIL, },
    5: { mq: XX, mv: XX, cb: XX, tc: XX, prediction: Prediction.Inter_MC_FIL, },
}

export const TCOEFF_REORDER = [
    0, 1, 5, 6, 14, 15, 27, 28,
    2, 4, 7, 13, 16, 26, 29, 42,
    3, 8, 12, 17, 25, 30, 41, 43,
    9, 11, 18, 24, 31, 40, 44, 53,
    10, 19, 23, 32, 39, 45, 52, 54,
    20, 22, 33, 38, 46, 51, 55, 60,
    21, 34, 37, 47, 50, 56, 59, 61,
    35, 36, 48, 49, 57, 58, 62, 63
];
