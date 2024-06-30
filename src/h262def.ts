// h262 constants

export const PSC = 0x10;
export const PTYPE_IS_CIF = (1 << 2);
export const PTYPE_STILL = (1 << 1);
export const GBSC = 1;
export const INTER_BIT = 1;
export const MOTION_COMPENSATION_BIT = 2;
export const MOTION_FILTER_BIT = 4;

export enum Prediction {
    Intra = 0,
    Inter = 1,
    Inter_MC = 3,
    Inter_MC_FIL = 5,
}

export type MType = {
    prediction: Prediction
    mq: boolean, // has MQUANT?
    mv: boolean, // has MVD?
    cb: boolean, // has CBP?
    tc: boolean, // has TCOEFF?
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