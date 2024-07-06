import { BitReader } from "./BitReader";
import * as h261 from "./h261def"
import * as vlc from "./vlc"
import { idct2d } from "./fastDct";

const { floor, abs, max, min } = Math;

type MVector = [number, number];

interface Macroblock {
    mquant: number | undefined,
    mvd: MVector | undefined,
}

interface YUV {
    y: Uint8ClampedArray,
    cb: Uint8ClampedArray,
    cr: Uint8ClampedArray,
}

function clip(x: number, nmin: number, nmax: number) {
    return max(nmin, min(x, nmax));
}

function reconstruct(level: number, quant: number) {
    if (level == 0) return 0;
    const lp = (level > 0) ? 1 : -1;
    const qe = (quant % 2 == 0) ? -lp : 0;
    return clip(quant * (2 * level + lp) + qe, -2048, 2047);
}

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

export class Frame {
    /**
     * This holds the actual color data of the frame
     */
    protected data: YUV;

    /**
     * Previous frame's data; used by inter blocks
     */
    protected previous: YUV | undefined;

    /**
     * bit index of PSC - useful for debuging the parser
     */
    protected start: number;

    public constructor(protected br: BitReader, protected prevFrame: Frame | undefined, protected frameNumber: number) {
        this.start = br.at;

        this.previous = prevFrame?.data;
        this.data = {
            y: this.previous?.y?.slice() ?? new Uint8ClampedArray(h261.CIF_WIDTH * h261.CIF_HEIGHT),
            cb: this.previous?.cb?.slice() ?? new Uint8ClampedArray(h261.CIF_WIDTH * h261.CIF_HEIGHT / 4),
            cr: this.previous?.cr?.slice() ?? new Uint8ClampedArray(h261.CIF_WIDTH * h261.CIF_HEIGHT / 4)
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

    protected putIntra(data: Int16Array, blockIndex: number) {
        let buffer: Uint8ClampedArray;
        let [sx, sy] = this.getMacroBlockCoords(this.currentGroup, this.mba);

        if (blockIndex < 4) { //y
            buffer = this.data.y;
            sx += blockIndex & 1 ? 8 : 0;
            sy += blockIndex & 2 ? 8 : 0;

            for (let y = sy, di = 0; y < sy + 8; y++) {
                for (let x = sx; x < sx + 8; x++, di++) {
                    buffer[y * h261.CIF_WIDTH + x] = data[di];
                }
            }
        } else { //real and true and sane (a bunch of division for 420 subsampling)
            buffer = blockIndex == 4 ? this.data.cr : this.data.cb;
            sx /= 2;
            sy /= 2;
            for (let y = sy, di = 0; y < sy + 8; y++) {
                for (let x = sx; x < sx + 8; x++, di++) {
                    buffer[((y * h261.CIF_WIDTH) >> 1) + x] = data[di];
                }
            }
        }
    }

    protected putInter(data: Int16Array, blockIndex: number) {
        if (!this.previous) throw new Error("CBA");
        let src: Uint8ClampedArray;
        let dest: Uint8ClampedArray;

        let [sx, sy] = this.getMacroBlockCoords(this.currentGroup, this.mba);

        if (blockIndex < 4) { //y
            dest = this.data.y;
            src = this.previous.y;
            sx += blockIndex & 1 ? 8 : 0;
            sy += blockIndex & 2 ? 8 : 0;

            for (let y = sy, di = 0; y < sy + 8; y++) {
                for (let x = sx; x < sx + 8; x++, di++) {
                    dest[y * h261.CIF_WIDTH + x] = src[y * h261.CIF_WIDTH + x] + data[di];
                }
            }
        } else { //real and true and sane (a bunch of division for 420 subsampling)
            dest = blockIndex == 4 ? this.data.cr : this.data.cb;
            src = blockIndex == 4 ? this.previous.cr : this.previous.cb;
            sx /= 2;
            sy /= 2;
            for (let y = sy, di = 0; y < sy + 8; y++) {
                for (let x = sx; x < sx + 8; x++, di++) {
                    dest[((y * h261.CIF_WIDTH) >> 1) + x] = src[((y * h261.CIF_WIDTH) >> 1) + x] + data[di];
                }
            }
        }
    }

    protected putInterMc(data: Int16Array, blockIndex: number, [mvx, mvy]: MVector) {
        if (!this.previous) throw new Error("CBA to handle this!"); //TODO(mbabnik): handle this.

        let src: Uint8ClampedArray;
        let dest: Uint8ClampedArray;

        let [sx, sy] = this.getMacroBlockCoords(this.currentGroup, this.mba);

        // mvx = mvy = 0;

        if (blockIndex < 4) { //y
            dest = this.data.y;
            src = this.previous.y;
            sx += blockIndex & 1 ? 8 : 0;
            sy += blockIndex & 2 ? 8 : 0;

            for (let y = sy, di = 0; y < sy + 8; y++) {
                for (let x = sx; x < sx + 8; x++, di++) {
                    dest[y * h261.CIF_WIDTH + x] = src[(y + mvy) * h261.CIF_WIDTH + x + mvx] + data[di];
                }
            }
        } else {
            dest = blockIndex == 4 ? this.data.cr : this.data.cb;
            src = blockIndex == 4 ? this.previous.cr : this.previous.cb
            sx /= 2;
            sy /= 2;

            // half the MV since UV is subsampled
            mvx = ~~(mvx / 2);
            mvy = ~~(mvy / 2);

            for (let y = sy, di = 0; y < sy + 8; y++) {
                for (let x = sx; x < sx + 8; x++, di++) {
                    dest[((y * h261.CIF_WIDTH) >> 1) + x] = src[(((y + mvy) * h261.CIF_WIDTH) >> 1) + (x + mvx)] + data[di];
                }
            }
        }
    }

    protected putInterMcFil(data: Int16Array, blockIndex: number, [mvx, mvy]: MVector) {
        if (!this.previous) throw new Error("CBA to handle this!"); //TODO(mbabnik): handle this.

        let src: Uint8ClampedArray;
        let dest: Uint8ClampedArray;

        let [sx, sy] = this.getMacroBlockCoords(this.currentGroup, this.mba);

        if (blockIndex < 4) { //y
            dest = this.data.y;
            src = this.previous.y;
            sx += blockIndex & 1 ? 8 : 0;
            sy += blockIndex & 2 ? 8 : 0;

            for (let y = sy, di = 0; y < sy + 8; y++) {
                for (let x = sx; x < sx + 8; x++, di++) {
                    if ((y == sy) || (y == sy + 7) || (x == sx) || (x == sx + 7))
                        dest[y * h261.CIF_WIDTH + x] = src[(y + mvy) * h261.CIF_WIDTH + x + mvx] + data[di];
                    else {
                        let sum = 0;
                        for (let j = 0; j < 3; j++)
                            for (let i = 0; i < 3; i++)
                                sum += h261.FILTER[j][i] *
                                    src[(y + j + mvy - 1) * h261.CIF_WIDTH + x + mvx + i - 1];

                        dest[y * h261.CIF_WIDTH + x] = ~~((1 / 16) * sum) + data[di];
                    }
                }
            }
        } else {
            dest = blockIndex == 4 ? this.data.cr : this.data.cb;
            src = blockIndex == 4 ? this.previous.cr : this.previous.cb
            sx /= 2;
            sy /= 2;

            // half the MV since UV is subsampled
            mvx = ~~(mvx / 2);
            mvy = ~~(mvy / 2);

            for (let y = sy, di = 0; y < sy + 8; y++) {
                for (let x = sx; x < sx + 8; x++, di++) {
                    if ((y == sy) || (y == sy + 7) || (x == sx) || (x == sx + 7))
                        dest[((y * h261.CIF_WIDTH) >> 1) + x] = src[(y + mvy) * h261.CIF_WIDTH + x + mvx] + data[di];
                    else {
                        let sum = 0;
                        for (let j = 0; j < 3; j++)
                            for (let i = 0; i < 3; i++)
                                sum += h261.FILTER[j][i] *
                                    src[(((y + mvy + j - 1) * h261.CIF_WIDTH) >> 1) + (x + mvx + i - 1)];

                        dest[((y * h261.CIF_WIDTH) >> 1) + x] = ~~((1 / 16) * sum) + data[di];
                    }
                    dest[((y * h261.CIF_WIDTH) >> 1) + x] = src[(((y + mvy) * h261.CIF_WIDTH) >> 1) + (x + mvx)] + data[di];
                }
            }
        }
    }

    protected isMvcValid(x: number) {
        return (x >= -16 && x <= 15);
    }

    protected readMvComponent(previous: number): number {
        const n = this.br.readVLC(vlc.MVD_TREE)
        let a = abs(n);

        if (a > 1) {
            let b = a - 32
            if (n < 0) {
                b *= -1;
            }

            const mva = previous + n;
            const mvb = previous + b;
            if (this.isMvcValid(mva)) return mva;
            if (this.isMvcValid(mvb)) return mvb;
            throw new Error(`Invalid MV component (prev=${previous} a=${mva} b=${mvb})`);
        }

        return previous + n;
    }

    protected mba = -1;

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
        }

        const clz = this.br.countLeadingZeroes();
        const mtype = h261.MTYPE[clz];

        if (mtype == undefined) {
            throw new Error(`Invalid mtype (clz was ${clz})`);
        }

        const mb: Macroblock = {
            mquant: undefined,
            mvd: undefined,
        };

        if (mtype.mq) {
            mb.mquant = this.br.readInt(5);
        }

        if (mtype.mv) {
            if (this.mba == 1 || this.mba == 12 || this.mba == 23) {
                previousMv = [0, 0];
            }

            mb.mvd = [
                this.readMvComponent(previousMv[0]),
                this.readMvComponent(previousMv[1])
            ];

            previousMv = mb.mvd;
        }

        const tmpBlock = new Int16Array(64);

        if (mtype.tc) {
            let cbp = 0b111111; // intra frames don't set this, but have all coefs.

            if (mtype.cb) {
                cbp = this.br.readVLC(vlc.CBP_TREE);
            } else if ((mtype.type & h261.MT_INTER)) {
                cbp = 0;
            }


            // for each block (in a macroblock)
            block: for (let i = 0; i < 6; i++) {
                tmpBlock.fill(0);

                let j = 0
                const coded = !!(cbp & (1 << (5 - i)));

                if (!(mtype.type & h261.MT_INTER)) { // INTRA
                    const dcCoefLvl = this.br.readInt(8);
                    tmpBlock[0] = reconstructDC(dcCoefLvl);
                    j = 1;
                } else if (coded) {
                    const check = this.br.peekInt(2);
                    if (check & 0x2) {
                        this.br.readInt(2);
                        tmpBlock[0] = check & 1 ? -1 : 1;
                        j = 1;
                    }
                }

                if (!coded) {
                    if (mtype.type & h261.MT_MC) {
                        if (mtype.type & h261.MT_FILTER)
                            this.putInterMcFil(tmpBlock, i, mb.mvd!)
                        else
                            this.putInterMc(tmpBlock, i, mb.mvd!)
                    }
                    continue
                }

                coef: for (; ; j++) {
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

                    if (j > 63) {
                        throw new Error("TCOEFF overflow")
                    }
                    //apply transmition order and reconstruction in place
                    tmpBlock[h261.TCOEFF_REORDER[j]] = reconstruct(level, mb.mquant ?? gquant);
                }

                idct2d(tmpBlock);
                if (mtype.type & h261.MT_INTER) {
                    if (mtype.type & h261.MT_MC) {
                        if (mtype.type & h261.MT_FILTER)
                            this.putInterMcFil(tmpBlock, i, mb.mvd!)
                        else
                            this.putInterMc(tmpBlock, i, mb.mvd!)
                    } else {
                        this.putInter(tmpBlock, i)
                    }

                } else {
                    this.putIntra(tmpBlock, i);
                }
            }
        } else if (mtype.mv) {
            tmpBlock.fill(0);

            for (let i = 0; i < 6; i++) {
                if (mtype.type & h261.MT_FILTER)
                    this.putInterMcFil(tmpBlock, i, mb.mvd!);
                else
                    this.putInterMc(tmpBlock, i, mb.mvd!);
            }
        }
        return mb;
    }

    protected currentGroup = 0;

    protected readGob() {
        if (this.br.readInt(16) != h261.GBSC) {
            throw new Error("Invalid GBSC");
        }

        const groupNumber = this.br.readInt(4);
        if (groupNumber == 0) throw new Error("expected gob, got picture");
        this.currentGroup = groupNumber;

        const gquant = this.br.readInt(5);

        while (this.br.readInt(1)) {
            this.br.move(8); // throw PEI away 
        }

        let pmv: MVector = [0, 0];
        while (this.mba < 33) {
            const mb = this.readMacroblock(pmv, gquant);
            if (mb === null) break;
            pmv = mb.mvd ?? [0, 0];
        }

        this.mba = -1;
    }

    protected read() {
        while (this.br.peekInt(20) != h261.PSC) {
            this.br.readInt(1);
        }
        if (this.br.at != this.start) {
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

        while (this.br.readInt(1)) {
            this.br.move(8); // throw PEI away
        }

        // read 12 GOBs
        for (let i = 0; i < 12; i++) {
            this.readGob();
        }
    }

    public paint(g: CanvasRenderingContext2D) {
        const d = new ImageData(h261.CIF_WIDTH, h261.CIF_HEIGHT);

        for (let y = 0; y < h261.CIF_HEIGHT; y++) {
            for (let x = 0; x < h261.CIF_WIDTH; x++) {
                const pos = y * h261.CIF_WIDTH + x;
                const cpos = (y >> 1) * (h261.CIF_WIDTH >> 1) + (x >> 1);
                writeRgb(d.data, pos, this.data.y[pos], this.data.cb[cpos], this.data.cr[cpos]);
            }
        }

        g.putImageData(d, 0, 0);
        this.previous = undefined; // allow GC to cook
    }
}
