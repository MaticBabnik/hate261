import { BitReader } from "./BitReader";
import * as h261 from "./h261def"
import * as vlc from "./vlc"

type MVector = [number, number];

interface Block {
    index: number,
    data: Uint8Array,
}

interface Macroblock {
    address: number,
    type: h261.MType,
    mquant: number | undefined,
    mvd: MVector | undefined,
    cbp: number,
    blocks: Block[]
}

interface GroupOfBlocks {
    index: number,
    gquant: number,
    macroblocks: Macroblock[];
}

function clip(x: number, min: number, max: number) {
    return Math.max(min, Math.min(x, max));
}

function reconstruct(level: number, quant: number) {
    if (level == 0) return 0;
    const lp = (level > 0) ? 1 : -1;
    const qe = (quant % 2 == 0) ? -lp : 0;
    return clip(quant * (2 * level + lp) + qe, -2048, 2047);
}

function reconstructDC(level: number): number {
    if (level === 0 || level === 128) {
        throw "Invalid DC: 0 and 128 are not allowed";
    } else if (level === 255) {
        return 1024;
    } else {
        return level * 8;
    }
}

const { SQRT2, PI } = Math;

function idct(block: Uint8Array) {
    const result = new Uint8Array(64);

    // for (let x = 0; x < 8; x++) {
    //     for (let y = 0; y < 8; y++) {
    //         let sum = 0;
    //         for (let u = 0; u < 8; u++) {
    //             for (let v = 0; v < 8; v++) {
    //                 const Cu = u === 0 ? 1 / SQRT2 : 1;
    //                 const Cv = v === 0 ? 1 / SQRT2 : 1;
    //                 const dctCoeff = block[u + v * 8];
    //                 sum += Cu * Cv * dctCoeff *
    //                     Math.cos(((2 * x + 1) * u * PI) / 16) *
    //                     Math.cos(((2 * y + 1) * v * PI) / 16);
    //             }
    //         }
    //         result[x + y * 8] = (1 / 4) * sum;
    //     }
    // }

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            let sum = 0;
            for (let u = 0; u < 8; u++) {
                for (let v = 0; v < 8; v++) {
                    const Cu = u === 0 ? 1 / SQRT2 : 1;
                    const Cv = v === 0 ? 1 / SQRT2 : 1;
                    const index = u * 8 + v;
                    const dctCoeff = block[index];
                    sum += Cu * Cv * dctCoeff *
                        Math.cos(((2 * x + 1) * u * PI) / 16) *
                        Math.cos(((2 * y + 1) * v * PI) / 16);
                }
            }
            const alpha = (x === 0 ? 1 / SQRT2 : 1) * (y === 0 ? 1 / SQRT2 : 1);
            result[x * 8 + y] = (1 / 4) * alpha * sum;
        }
    }
    return result;
}

function writeRgb(dst: Uint8ClampedArray, index: number, y: number, u: number, v: number) {
    // https://en.wikipedia.org/wiki/YCbCr#ITU-R_BT.601_conversion
    dst[index + 0] = (298.082 * y + 408.583 * u) / 256 - 222.921;
    dst[index + 1] = (298.082 * y - 100.291 * v - 208.120 * u) / 256 + 135.576;
    dst[index + 2] = (298.082 * y + 516.412 * v) / 256 - 276.836;
    dst[index + 3] = 255;
}

function getMacroblockImageDataFromYuv(data: Uint8Array[]) {
    const cCb = data[4], cCr = data[5];

    const id = new ImageData(16, 16, { colorSpace: 'srgb' });

    for (let i = 0; i < 4; i++) {
        const cY = data[i];
        const xa = i & 1 ? 8 : 0;
        const ya = i & 2 ? 8 : 0;
        for (let x = xa; x < xa + 8; x++) {
            for (let y = ya; y < ya + 8; y++) {
                const cyi = (x & 7) + 8 * (y & 7);
                const cci = (x >> 1) + 8 * (y >> 1);
                writeRgb(id.data, (x + 16 * y) * 4, cY[cyi], cCb[cci], cCr[cci]);
            }
        }
    }

    return id;
}

function getMacroblockDebug(data: Uint8Array[], select: 'y' | 'u' | 'v') {
    const cCb = data[4], cCr = data[5];

    const id = new ImageData(16, 16, { colorSpace: 'srgb' });

    for (let i = 0; i < 4; i++) {
        const cY = data[i];
        const xa = i & 1 ? 8 : 0;
        const ya = i & 2 ? 8 : 0;
        for (let x = xa; x < xa + 8; x++) {
            for (let y = ya; y < ya + 8; y++) {
                const cci = (x >> 1) + 8 * (y >> 1);
                const index = (x + 16 * y) * 4;
                id.data[index + 0] =
                    id.data[index + 1] =
                    id.data[index + 2] = select == 'y' ? cY[(x & 7) + 8 * (y & 7)] : (select == 'u' ? cCb[cci] : cCr[cci]);
                id.data[index + 3] = 255;
            }
        }
    }

    return id;
}
void getMacroblockDebug; // shut up typescript


export class Frame {
    protected mba = -1;
    protected gobs: Record<number, GroupOfBlocks> = {};

    public constructor(protected br: BitReader, protected previous: Frame | undefined, protected frameNumber: number) {
        this.read();
    }

    protected readMacroblock(previousMv: MVector, gquant: number): Macroblock | null {
        {
            const address = this.br.readVLC(vlc.MBA_TREE);
            if (address == 34) {
                throw "MBA stuffing";
            }

            if (address == 0) {
                // start code, this mb is void
                this.br.move(-vlc.MBA[0].length)
                return null;
            }

            if (this.mba != -1 && address != 1) {
                // we cannot take the previous mv 
                previousMv = [0, 0];
            }
            this.mba = this.mba == -1 ? address : this.mba + address;
        }

        const mtype = h261.MTYPE[this.br.countLeadingZeroes()];
        console.log(this.mba, h261.getMtypeString(mtype));

        const mb: Macroblock = {
            address: this.mba,
            type: mtype,

            mquant: undefined,
            cbp: 0,
            mvd: undefined,

            blocks: []
        };

        if (mtype.mq) {
            mb.mquant = this.br.readInt(5);
        }

        if (mtype.mv) {
            if (this.mba == 1 || this.mba == 12 || this.mba == 23) {
                previousMv = [0, 0];
            }

            const mvd1 = this.br.readVlcOr(vlc.MVD_TREE, -1);
            /*
                TODO(mbabnik): track motion vectors; and if we should do the diff 
                thing, since we then read an extra bit? 
            */
            const mvd2 = this.br.readVlcOr(vlc.MVD_TREE, -1);

            console.log({ previousMv, mvd1, mvd2 })

            mb.mvd = [0, 0];
        }

        if (mtype.tc) {
            let cbp = 0b111111; // intra frames don't set this, but have all coefs.

            if (mtype.cb) {
                cbp = this.br.readVLC(vlc.CBP_TREE);
            } else if ((mtype.prediction & h261.INTER_BIT)) {
                cbp = 0;
            }
            mb.cbp = cbp;

            const tmpBlock = new Uint8Array(64);

            // for each block (in a macroblock)
            block: for (let i = 0; i < 6; i++) {
                tmpBlock.fill(0);

                let j = 0
                const coded = !!(cbp & (1 << (5 - i)));

                if (!(mtype.prediction & h261.INTER_BIT)) { // INTRA
                    const dcCoefLvl = (this.br.readInt(8) << 24) >> 24; // sign extend i8
                    tmpBlock[0] = reconstructDC(dcCoefLvl);
                    j = 1;
                } else if (coded)  {
                    const check = this.br.peekInt(2);
                    if (check & 0x2) {
                        this.br.readInt(2);
                        tmpBlock[0] = check & 1 ? -1 : 1; // TODO(mbabnik): why?
                        j = 1;
                    }
                }

                if (!coded) {
                    mb.blocks[i] = { data: idct(tmpBlock), index: i };
                    continue;
                }

                coef: for (; j < 64; j++) {
                    const tcoeff_s = this.br.readVLC(vlc.TCOEFF_TREE);
                    if (tcoeff_s == vlc.TCOEFF_EOB) break; // end of block
                    let run = 0, level = 0;

                    // ?? this had a check for TCOEFF_FIRST or something but it just caused issues...

                    if (tcoeff_s == vlc.TCOEFF_ESCAPE) {
                        run = this.br.readInt(6);
                        level = (this.br.readInt(8) << 24) >> 24; // sign extend i8
                    } else {
                        [run, level] = vlc.decodeTcoeff(tcoeff_s);
                    }

                    if (level == 0) break coef;

                    j += run;

                    if (j < 64) {
                        //apply transmition order and reconstruction in place
                        tmpBlock[h261.TCOEFF_REORDER[j]] =
                            reconstruct(level, mb.mquant ?? gquant);
                    }
                }

                mb.blocks[i] = { data: idct(tmpBlock), index: i };
            }
        }
        return mb;
    }

    protected readGob(gobIndex: number): GroupOfBlocks {
        if (this.br.readInt(16) != h261.GBSC) {
            throw "Invalid GBSC";
        }

        const groupNumber = this.br.readInt(4);
        if (groupNumber == 0) throw "expected gob, got picture";

        const gquant = this.br.readInt(5);


        while (this.br.readInt(1)) { // PEI - extra info?
            console.log('Discarding extra byte:', this.br.readInt(8))
        }

        console.groupCollapsed(`GOB ${groupNumber}`)

        // console.log({ groupNumber, gquant, at: this.br.at.toString(16) })
        const macroblocks = [];
        //read 33 macroblocks

        let pmv: MVector = [0, 0];
        while (this.mba < 33) {
            const mb = this.readMacroblock(pmv, gquant);
            if (mb === null) break;

            macroblocks[mb.address - 1] = mb;
            pmv = mb.mvd ?? [0, 0];
        }

        this.mba = -1;
        // console.log({ CHECKPOINT: this.br.at }) //2203, 4374

        console.groupEnd();

        return {
            gquant,
            index: gobIndex,
            macroblocks
        }
    }

    protected read() {
        console.groupCollapsed(`frame ${this.frameNumber}`)

        while (this.br.peekInt(20) != h261.PSC) {
            this.br.readInt(1);
        }
        this.br.readInt(20)

        // discard Temporal Reference
        this.br.readInt(5);

        // discard three bits of flags
        this.br.readInt(3);
        // TODO(mbabnik): QCIF
        if (!this.br.readInt(1)) throw "NO QCIF!";
        if (!this.br.readInt(1)) throw "NO HI_RES!";

        // discard "reserved bit"
        this.br.readInt(1);

        while (this.br.readInt(1)) { // PEI - extra info?
            console.warn('Unknown PEI:', this.br.readInt(8))
        }

        // read 12 GOBs
        for (let i = 0; i < 12; i++) {
            this.gobs[i] = this.readGob(i);
        }

        console.groupEnd();
    }


    public paint(g: CanvasRenderingContext2D) {
        for (let gi in this.gobs) {
            const gobX = ((gi as unknown as number) & 1) * 176,
                gobY = ((gi as unknown as number) >> 1) * 48;

            const gob = this.gobs[gi];

            for (let mb of gob.macroblocks) {
                const mbx = ((mb.address - 1) % 11) * 16,
                    mby = Math.floor((mb.address - 1) / 11) * 16;

                g.putImageData(getMacroblockImageDataFromYuv(mb.blocks.map(x => x.data)), gobX + mbx, gobY + mby)
                // g.putImageData(getMacroblockDebug(mb.blocks.map(x => x.data), ''), gobX + mbx, gobY + mby)
            }
        }
    }
}