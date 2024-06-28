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
            id.data[(x + y * canvas.width) * 4] = x;
            id.data[(x + y * canvas.width) * 4 + 1] = y;
            id.data[(x + y * canvas.width) * 4 + 2] = 0;
            id.data[(x + y * canvas.width) * 4 + 3] = 255;
        }

    g.putImageData(id, 0, 0);
}

let mba = -1;

async function readMacroBlock(br: BitReader) {
    const address = br.readVLC(MBA_TREE);

    if (address == 34) {
        console.log("MBA stuffing")
        return;
    }

    if (mba == -1) {
        mba = address;
    } else {
        mba += address;
    }


    console.group('macroblock-' + mba)

    const mtype = h261.MTYPE[br.countLeadingZeroes()];

    console.log(mtype)

    if (mtype.mq) {
        const mquant = br.readInt(5);
        console.log({ mquant })
    }

    if (mtype.mv) {
        const mvd1 = br.readVLC(MVD_TREE);
        const mvd2 = br.readVLC(MVD_TREE);

        console.log({ mvd1, mvd2 });
    }



    // TODO: TCOEFF; EOB
    if (mtype.tc) {
        let cbp = 0b111111; // intra frames don't set this, but have all coefs.

        if (mtype.cb) {
            cbp = br.readVLC(CBP_TREE);
        } else if ((mtype.prediction & h261.INTER_BIT)) {
            cbp = 0;
        }
        console.log({ cbp });

        const blocks: Record<number, any> = {};

        // for each block (in a macroblock)
        for (let i = 0; i < 6; i++) {
            // skip blocks that don't have any data
            if (!(cbp & (1 << (5 - i)))) continue;


            let block = new Uint8Array(64);
            block.fill(0);
            let j = 0

            if (!(mtype.prediction & h261.INTER_BIT)) {
                //intra
                const dcCoefLvl = (br.readInt(8) << 24) >> 24; // sign extend i8
                block[0] = dcCoefLvl;
                j++;
            } else if (cbp & 32) {
                const check = br.peekInt(2);
                if (check & 0x2) {
                    br.readInt(2);
                    block[0] = check & 1 ? -1 : 1;
                    j++;
                }
            }

            for (; j < 64; j++) {

                const tcoeff_s = br.readVLC(TCOEFF_TREE);

                if (tcoeff_s == TCOEFF_EOB) break; // end of block
                let run = 0, level = 0;

                if (tcoeff_s & TCOEFF_FIRST) throw "errm, what the sigma";
                //TODO(mbabnik): what the sigma

                if (tcoeff_s == TCOEFF_ESCAPE) {
                    console.log('escape')
                    run = br.readInt(6);
                    level = (br.readInt(8) << 24) >> 24; // sign extend i8
                } else {
                    [run, level] = decodeTcoeff(tcoeff_s);
                }

                if (j < 64) {
                    block[j] = level;
                }
            }

            console.log("Read block", i + 1, block);
            blocks[i] = block;
        }
    }
    console.groupEnd()
}

async function readH261Gob(br: BitReader) {
    if (br.readInt(16) != h261.GBSC) {
        throw "Invalid GBSC";
    }

    const groupNumber = br.readInt(4);
    if (groupNumber == 0) throw "expected gob, got picture";

    const gquant = br.readInt(5);

    console.log({ groupNumber, gquant })

    while (br.readInt(1)) { // PEI - extra info?
        console.log('Discarding extra byte:', br.readInt(8))
    }

    //read 33 macroblocks
    for (let i = 0; i < 33; i++) {
        console.log(i);
        await readMacroBlock(br);
    }

}

async function readH261Frame(br: BitReader) {

    if (br.readInt(20) != h261.PSC) {
        throw "Invalid PSC";
    }

    const temporalReference = br.readInt(5);


    const ptype = br.readInt(6);

    console.log({ temporalReference, ptype })

    if (!(ptype & h261.PTYPE_IS_CIF)) throw "CIF only!";
    if ((ptype & h261.PTYPE_STILL)) throw "No stills!";

    while (br.readInt(1)) { // PEI - extra info?
        console.log('Discarding extra byte:', br.readInt(8))
    }

    // read 12 GOBs

    readH261Gob(br);

}

async function main() {
    console.log("Hello!")
    dummyCanvasThing();

    const res = await fetch("badapple.h261");
    const buf = await res.arrayBuffer();

    const br = new BitReader(buf);

    await readH261Frame(br);

}

main();