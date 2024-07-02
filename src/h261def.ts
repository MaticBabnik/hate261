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
    0, 1, 8, 16, 9, 2, 3, 10,
    17, 24, 32, 25, 18, 11, 4, 5,
    12, 19, 26, 33, 40, 48, 41, 34,
    27, 20, 13, 6, 7, 14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36,
    29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46,
    53, 60, 61, 54, 47, 55, 62, 63
]