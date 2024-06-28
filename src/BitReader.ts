// bit reader class
import { VLCTree } from "./treegen";

export class BitReader {

    private array: Uint8Array;
    private byte = 0;
    private bit = 7;


    public constructor(b: ArrayBuffer) {
        this.array = new Uint8Array(b);
    }

    public readInt(bits: number) {
        if (bits > 31) throw "This isn't safe rn";

        let out = 0;

        while (bits-- > 0) {
            out = (out << 1) | ((this.array[this.byte] >> this.bit) & 1);

            this.bit--;

            if (this.bit == -1) {
                this.bit = 7;
                this.byte++;
            }
        }

        return out;
    }

    public peekInt(bits: number) {
        if (bits > 31) throw "This isn't safe rn";

        let lbit = this.bit, lbyte = this.byte;


        let out = 0;

        while (bits-- > 0) {
            out = (out << 1) | ((this.array[lbyte] >> lbit) & 1);

            lbit--;

            if (lbit == -1) {
                lbit = 7;
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
                    console.warn("VLC trace:", trace.join(''))
                    throw "Invalid VLC lookup";
                case "number":
                    return newAt;
                default:
                    at = newAt;
            }

        }
    }
}
