// bit reader class
import { VLCTree } from "./treegen";

export class BitReader {

    private array: Uint8Array;
    private byte = 0;
    private bit = 0; // encodes bit postition (0x80 >> bit)

    public constructor(b: ArrayBuffer) {
        this.array = new Uint8Array(b);
    }

    public readInt(bits: number) {
        if (bits > 31) throw new Error("This isn't safe rn");

        let out = 0;

        while (bits-- > 0) {
            out |= ((this.array[this.byte]) & (0x80 >> this.bit)) ? (1 << bits) : 0;

            this.bit++;
            if (this.bit == 8) {
                this.bit = 0;
                this.byte++;
            }
        }

        return out;
    }

    public peekInt(bits: number) {
        if (bits > 31) throw new Error("This isn't safe rn");

        let lbit = this.bit, lbyte = this.byte;


        let out = 0;

        while (bits-- > 0) {
            out |= ((this.array[lbyte]) & (0x80 >> lbit)) ? (1 << bits) : 0;

            lbit++;
            if (lbit == 8) {
                lbit = 0;
                lbyte++;
            }
        }

        return out;
    }

    public countLeadingZeroes(): number {
        for (let i = 0; ; i++) {
            if (this.readInt(1)) return i;
        }
    }

    public readVLC(tree: VLCTree) {
        const trace = [];
        let at = tree;
        for (; ;) {
            const bit = this.readInt(1);
            trace.push(bit);
            const newAt = at[bit];

            switch (typeof newAt) {
                case "undefined":
                    console.warn("VLC trace:", trace.join(''), 'at', this.at.toString(16))
                    this.move(-trace.length);
                    console.warn('Context', [...Array(8)].map(_ => this.readInt(8).toString(2).padStart(8, '0')).join())
                    throw new Error("Invalid VLC lookup");
                case "number":
                    return newAt;
                default:
                    at = newAt;
            }

        }
    }

    public readVlcOr<T>(tree: VLCTree, defaultValue: T): number | T {
        const trace = [];
        let at = tree;
        for (; ;) {
            const bit = this.readInt(1);
            trace.push(bit);
            const newAt = at[bit];

            switch (typeof newAt) {
                case "undefined":
                    console.warn("VLC trace:", trace.join(''))
                    return defaultValue;
                case "number":
                    return newAt;
                default:
                    at = newAt;
            }

        }
    }

    public get at() {
        return this.byte * 8 + this.bit;
    }

    public get available() {
        return (this.array.length - this.byte) * 8;
    }

    public move(offset: number) {
        this.bit += offset;

        this.byte += ~~(this.bit / 8); // divide and truncate(round towards zero?)
        this.bit %= 8;

        if (this.bit < 0) {
            //take care of the last byte if negative
            this.bit += 8;
            this.byte -= 1;
        }
    }
}
