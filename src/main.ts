import { BitReader } from "./BitReader";
import { CBP_TREE, MBA_TREE, MVD_TREE, TCOEFF_EOB, TCOEFF_ESCAPE, TCOEFF_FIRST, TCOEFF_TREE, decodeTcoeff } from "./vlc"
import * as h261 from "./h262def"
import "./treegen"

const canvas = document.getElementById('output') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;

function dummyCanvasThing() {
    const id = new ImageData(canvas.width, canvas.height, { colorSpace: 'srgb' });
    for (let y = 0; y < id.height; y++)
        for (let x = 0; x < id.width; x++) {
            id.data[(x + y * canvas.width) * 4 + 0] =
                id.data[(x + y * canvas.width) * 4 + 1] =
                id.data[(x + y * canvas.width) * 4 + 2] = ((x & 16) ^ (y & 16)) ? 0xaa : 0xcc;
            id.data[(x + y * canvas.width) * 4 + 3] = 255;
        }

    g.putImageData(id, 0, 0);
}

let mba = -1;

function readMacroBlock(br: BitReader) {
    const mbStart = br.at;
    let address;

    do {
        address = br.readVLC(MBA_TREE);
        if (address == 34) {
            console.log("MBA stuffing")
        }
    } while (false);

    if (mba == -1) {
        mba = address;
    } else {
        mba += address;
    }
    const clz = br.countLeadingZeroes();
    const mtype = h261.MTYPE[clz];

    console.log(clz, mtype);

    if (mtype.mq) {
        const mquant = br.readInt(5);
    }

    if (mtype.mv) {
        const mvd1 = br.readVLC(MVD_TREE);
        /*
            TODO(mbabnik): track motion vectors; and if we should do the diff 
            thing, since we then read an extra bit? 
        */
        const mvd2 = br.readVLC(MVD_TREE);
    }

    // TODO(mbabnik): TCOEFF; EOB
    if (mtype.tc) {
        let cbp = 0b111111; // intra frames don't set this, but have all coefs.

        if (mtype.cb) {
            cbp = br.readVLC(CBP_TREE);
        } else if ((mtype.prediction & h261.INTER_BIT)) {
            cbp = 0;
        }

        const blocks: Record<number, any> = {};

        // for each block (in a macroblock)
        block: for (let i = 0; i < 6; i++) {
            // skip blocks that don't have any data
            if (!(cbp & (1 << (5 - i)))) continue;

            let block = new Uint8Array(64);
            block.fill(0);
            let j = 0

            if (!(mtype.prediction & h261.INTER_BIT)) {
                //intra
                const dcCoefLvl = (br.readInt(8) << 24) >> 24; // sign extend i8
                block[0] = dcCoefLvl;
                j = 1;
            } else if (cbp & 32) {
                const check = br.peekInt(2);
                if (check & 0x2) {
                    br.readInt(2);
                    block[0] = check & 1 ? -1 : 1;
                    j = 1;
                }
            }

            if (!(cbp & 32)) {
                blocks[i] = block;
                return;
            }

            coef: for (; j < 64; j++) {
                const tcoeff_s = br.readVLC(TCOEFF_TREE);
                if (tcoeff_s == TCOEFF_EOB) break; // end of block
                let run = 0, level = 0;

                if (tcoeff_s & TCOEFF_FIRST) {
                    //TODO(mbabnik): what the sigma
                    // throw "errm, what the sigma";
                }

                if (tcoeff_s == TCOEFF_ESCAPE) {
                    run = br.readInt(6);
                    level = (br.readInt(8) << 24) >> 24; // sign extend i8
                } else {
                    [run, level] = decodeTcoeff(tcoeff_s);
                }

                if (level == 0) break coef;

                j += run;

                if (j < 64) {
                    block[j] = level;
                }
            }

            blocks[i] = block;
        }
    }
}

function readH261Gob(br: BitReader) {
    if (br.readInt(16) != h261.GBSC) {
        throw "Invalid GBSC";
    }

    const groupNumber = br.readInt(4);
    if (groupNumber == 0) throw "expected gob, got picture";

    const gquant = br.readInt(5);


    while (br.readInt(1)) { // PEI - extra info?
        console.log('Discarding extra byte:', br.readInt(8))
    }

    console.log({ groupNumber, gquant, at: br.at.toString(16) })

    //read 33 macroblocks
    for (let i = 0; i < 33; i++) {
        readMacroBlock(br);
    }

    mba = -1;

}

function readH261Frame(br: BitReader) {
    while (br.peekInt(20) != h261.PSC) {
        br.readInt(1);
    }
    br.readInt(20)

    const temporalReference = br.readInt(5);


    br.readInt(3);
    if (!br.readInt(1)) throw "NO QCIF!";
    if (!br.readInt(1)) throw "NO HI_RES!";
    br.readInt(1);
    // if (!(ptype & h261.PTYPE_IS_CIF)) throw "CIF only!";
    // if ((ptype & h261.PTYPE_STILL)) throw "No stills!";

    while (br.readInt(1)) { // PEI - extra info?
        console.log('Discarding extra byte:', br.readInt(8))
    }

    // read 12 GOBs

    for (let i = 0; i < 12; i++) {
        readH261Gob(br);
    }

    // br.readInt(4);

}

async function main() {
    console.log("Hello!")
    dummyCanvasThing();

    const res = await fetch("badapple.h261");
    const buf = await res.arrayBuffer();

    const br = new BitReader(buf);
    let frameCount = 1;

    while (true) {
        console.log(['frame', frameCount, br.at.toString(16)])
        readH261Frame(br);
        frameCount++;
    }
}

main();