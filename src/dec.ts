import { BitReader } from "./BitReader";
import * as h261 from "./h261def"
import * as vlc from "./vlc"
import { idct2d } from "./fastDct";

const { floor } = Math;


type MVector = [number, number];

interface Block {
    index: number,
    data: Uint8ClampedArray,
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

interface YUV {
    y: Uint8ClampedArray,
    cb: Uint8ClampedArray,
    cr: Uint8ClampedArray,
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

// @ts-ignore
window.reconstruct = reconstruct;

function reconstructDC(level: number): number {
    if (level === 0 || level === 128) {
        throw new Error("Invalid DC: 0 and 128 are not allowed");
    } else if (level === 255) {
        return 1024;
    } else {
        return level * 8;
    }
}

function writeRgb(dst: Uint8ClampedArray, index: number, y: number, u: number, v: number) {
    // https://en.wikipedia.org/wiki/YCbCr#ITU-R_BT.601_conversion
    dst[index * 4 + 0] = (298.082 * y + 408.583 * u) / 256 - 222.921;
    dst[index * 4 + 1] = (298.082 * y - 100.291 * v - 208.120 * u) / 256 + 135.576;
    dst[index * 4 + 2] = (298.082 * y + 516.412 * v) / 256 - 276.836;
    dst[index * 4 + 3] = 255;
}


const MB_SIZE = 16;
const GOB_WIDTH = 11;
const GOB_HEIGHT = 3;
const CIF_WIDTH = 2 * GOB_WIDTH * MB_SIZE;
const CIF_HEIGHT = 6 * GOB_HEIGHT * MB_SIZE;


export class Frame {
    protected mba = -1;
    protected gobs: Record<number, GroupOfBlocks> = {};

    // This holds the actual color data of the frame
    protected data: YUV;
    protected previous: YUV | undefined;
    protected start: number;
    public constructor(protected br: BitReader, protected prevFrame: Frame | undefined, protected frameNumber: number) {
        this.start = br.at;

        this.previous = prevFrame?.data;
        this.data = {
            y: this.previous?.y?.slice() ?? new Uint8ClampedArray(CIF_WIDTH * CIF_HEIGHT),
            cb: this.previous?.cb?.slice() ?? new Uint8ClampedArray(CIF_WIDTH * CIF_HEIGHT / 4),
            cr: this.previous?.cr?.slice() ?? new Uint8ClampedArray(CIF_WIDTH * CIF_HEIGHT / 4)
        }
        this.read();
    }

    protected getMacroBlockCoords(group: number, mba: number): [number, number] {
        group -= 1;
        mba -= 1;
        const gobX = (group & 1) * 176, gobY = (group >> 1) * 48;
        const mbx = (mba % 11) * 16, mby = floor(mba / 11) * 16;

        return [gobX + mbx, gobY + mby,]
    }

    protected putIntraBlock(data: Int16Array, blockIndex: number) {
        let buffer: Uint8ClampedArray;
        let [sx, sy] = this.getMacroBlockCoords(this.currentGroup, this.mba);

        if (blockIndex < 4) { //y
            buffer = this.data.y;
            sx += blockIndex & 1 ? 8 : 0;
            sy += blockIndex & 2 ? 8 : 0;

            for (let y = sy, di = 0; y < sy + 8; y++) {
                for (let x = sx; x < sx + 8; x++, di++) {
                    buffer[y * CIF_WIDTH + x] = data[di];
                }
            }
        } else { //real and true and sane (a bunch of division for 420 subsampling)
            buffer = blockIndex == 4 ? this.data.cr : this.data.cb;
            sx /= 2;
            sy /= 2;
            for (let y = sy, di = 0; y < sy + 8; y++) {
                for (let x = sx; x < sx + 8; x++, di++) {
                    buffer[((y * CIF_WIDTH) >> 1) + x] = data[di];
                }
            }
        }
    }

    protected putInterBlockBasic(data: Int16Array, blockIndex: number) {
        let buffer: Uint8ClampedArray;

        let [sx, sy] = this.getMacroBlockCoords(this.currentGroup, this.mba);

        if (blockIndex < 4) { //y
            buffer = this.data.y;
            sx += blockIndex & 1 ? 8 : 0;
            sy += blockIndex & 2 ? 8 : 0;

            for (let y = sy, di = 0; y < sy + 8; y++) {
                for (let x = sx; x < sx + 8; x++, di++) {
                    buffer[y * CIF_WIDTH + x] += data[di];
                }
            }
        } else { //real and true and sane (a bunch of division for 420 subsampling)
            buffer = blockIndex == 4 ? this.data.cr : this.data.cb;
            sx /= 2;
            sy /= 2;
            for (let y = sy, di = 0; y < sy + 8; y++) {
                for (let x = sx; x < sx + 8; x++, di++) {
                    buffer[((y * CIF_WIDTH) >> 1) + x] += data[di];
                }
            }
        }
    }

    protected readMacroblock(previousMv: MVector, gquant: number): Macroblock | null {
        {
            const address = this.br.readVLC(vlc.MBA_TREE);
            if (address == 34) {
                throw new Error("MBA stuffing");
            }

            if (address == 0 || address == vlc.MBA_INVALID) {
                // start code, this mb is void
                this.br.move(-vlc.MBA[0].length)
                return null;
            }

            if (this.mba != -1 && address != 1) {
                // we cannot take the previous mv 
                previousMv = [0, 0];
            }
            this.mba = this.mba == -1 ? address : this.mba + address;
            // out of data !?
        }
        void previousMv;
        const clz = this.br.countLeadingZeroes();
        const mtype = h261.MTYPE[clz];
        if (mtype == undefined) {
            // TODO(mbabnik): badapple.h261 suicides here
            throw new Error(`Invalid mtype (clz was ${clz})`); 
        }

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
            //TODO(mbabnik): motion vectors
            const mvd2 = this.br.readVlcOr(vlc.MVD_TREE, -1);

            void mvd1;
            void mvd2;

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

            const tmpBlock = new Int16Array(64);

            // for each block (in a macroblock)
            block: for (let i = 0; i < 6; i++) {
                tmpBlock.fill(0);

                let j = 0
                const coded = !!(cbp & (1 << (5 - i)));

                if (!(mtype.prediction & h261.INTER_BIT)) { // INTRA
                    const dcCoefLvl = this.br.readInt(8);
                    tmpBlock[0] = reconstructDC(dcCoefLvl);
                    j = 1;
                } else if (coded) {
                    const check = this.br.peekInt(2);
                    if (check & 0x2) {
                        this.br.readInt(2);
                        tmpBlock[0] = check & 1 ? -1 : 1; // TODO(mbabnik): why?
                        j = 1;
                    }
                }

                if (!coded) {
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
                idct2d(tmpBlock);
                if (mtype.prediction & h261.INTER_BIT)
                    this.putInterBlockBasic(tmpBlock, i)
                else
                    this.putIntraBlock(tmpBlock, i);
            }
        }
        return mb;
    }

    protected currentGroup = 0;
    protected readGob(gobIndex: number): GroupOfBlocks {
        if (this.br.readInt(16) != h261.GBSC) {
            throw new Error("Invalid GBSC");
        }

        const groupNumber = this.br.readInt(4);
        if (groupNumber == 0) throw new Error("expected gob, got picture");
        this.currentGroup = groupNumber;

        const gquant = this.br.readInt(5);

        while (this.br.readInt(1)) { // PEI - extra info?
            console.log('Discarding extra byte:', this.br.readInt(8))
        }

        const macroblocks = [];
        //read 33 macroblocks

        let pmv: MVector = [0, 0];
        while (this.mba < 33) {
            const mb = this.readMacroblock(pmv, gquant);
            if (mb === null) break;

            macroblocks.push(mb);
            pmv = mb.mvd ?? [0, 0];
        }

        this.mba = -1;

        return {
            gquant,
            index: gobIndex,
            macroblocks
        }
    }

    protected read() {
        while (this.br.peekInt(20) != h261.PSC) {
            this.br.readInt(1);
        }
        if (this.br.at != this.start) {
            // console.log('had to skip to get PSC')
            this.start = this.br.at;
        }
        this.br.readInt(20)

        // discard Temporal Reference
        this.br.readInt(5);

        // discard three bits of flags
        this.br.readInt(3);
        // TODO(mbabnik): QCIF
        if (!this.br.readInt(1)) throw new Error("NO QCIF!");
        if (!this.br.readInt(1)) throw new Error("NO HI_RES!");

        // discard "reserved bit"
        this.br.readInt(1);

        while (this.br.readInt(1)) { // PEI - extra info?
            console.warn('Unknown PEI:', this.br.readInt(8))
        }

        // read 12 GOBs
        for (let i = 0; i < 12; i++) {
            this.gobs[i] = this.readGob(i);
        }
    }


    public paint(g: CanvasRenderingContext2D) {
        // for (let gi in this.gobs) {
        //     const gobX = ((gi as unknown as number) & 1) * 176,
        //         gobY = ((gi as unknown as number) >> 1) * 48;
        //     const gob = this.gobs[gi];

        //     for (let mb of gob.macroblocks) {
        //         const mbx = ((mb.address - 1) % 11) * 16,
        //             mby = floor((mb.address - 1) / 11) * 16;
        //         if (mb.type.prediction & h261.INTER_BIT) {
        //             // apply inter
        //         } else {
        //             g.putImageData(getMacroblockImageDataFromYuv(mb), gobX + mbx, gobY + mby)
        //         }
        //     }
        // }

        const d = g.getImageData(0, 0, CIF_WIDTH, CIF_HEIGHT);
        for (let y = 0; y < CIF_HEIGHT; y++) {
            for (let x = 0; x < CIF_WIDTH; x++) {
                const pos = y * CIF_WIDTH + x;  //this.data.cr[pos>>1] //this.data.cb[pos>>1] //
                const cpos = (y >> 1) * (CIF_WIDTH >> 1) + (x >> 1);
                writeRgb(d.data, pos, this.data.y[pos], this.data.cb[cpos], this.data.cr[cpos]);
            }
        }
        g.putImageData(d, 0, 0);
        this.previous = undefined; // allow GC to cook
    }
}