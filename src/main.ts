import { BitReader } from "./BitReader";
import { Frame } from "./dec";
import * as h261 from "./h261def"
const canvas = document.getElementById('output') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;

function canvasCheckerboard() {
    const id = new ImageData(canvas.width, canvas.height);
    for (let y = 0; y < id.height; y++)
        for (let x = 0; x < id.width; x++) {
            id.data[(x + y * canvas.width) * 4 + 0] =
                id.data[(x + y * canvas.width) * 4 + 1] =
                id.data[(x + y * canvas.width) * 4 + 2] = ((x & 16) ^ (y & 16)) ? 0xaa : 0xcc;
            id.data[(x + y * canvas.width) * 4 + 3] = 255;
        }

    g.putImageData(id, 0, 0);
}

async function main(file: string) {
    const res = await fetch(file);
    const buf = await res.arrayBuffer();
    const br = new BitReader(buf);

    let previousFrame: Frame | undefined = undefined;
    let i = 0;

    // TODO(mbabnik): proper-ish player?

    // Target frame present time
    let target = performance.now() + h261.FRAME_TIME;

    while (br.available > 100) {
        // parse+render frame to YUV
        const fr: Frame = new Frame(br, previousFrame, i++);

        // wait till present Time
        const nt = performance.now();
        while (performance.now() < target) {
            await new Promise(x => requestAnimationFrame(x))
        }

        // set next target
        target = nt + h261.FRAME_TIME;
        // Convert YUV->RGB and paint
        fr.paint(g);
        // Store reference; without this INTER frames won't work
        previousFrame = fr;
    }

}

canvasCheckerboard();

let file = "badapple.h261";
if (document.location.search.length >= 2) {
    file = document.location.search.slice(1);
}

main(file)
