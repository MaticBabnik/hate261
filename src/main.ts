import { BitReader } from "./BitReader";
import { Frame } from "./dec";

const canvas = document.getElementById('output') as HTMLCanvasElement;
const g = canvas.getContext('2d', { willReadFrequently: true })!;

function canvasCheckerboard() {
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


const FRAME_TIME = 1001 / 30;

async function main() {
    // const res = await fetch("badapple-2s.h261");
    const res = await fetch("rickroll.h261");
    const buf = await res.arrayBuffer();

    const br = new BitReader(buf);

    let previousFrame: Frame | undefined = undefined;
    let i = 0;

    let target = performance.now() + FRAME_TIME;

    while (br.available > 20) {
        console.log((i * FRAME_TIME / 1000).toFixed(2))
        const fr: Frame = new Frame(br, previousFrame, i++);
        const nt = performance.now();
        await new Promise(x => setTimeout(x, target - nt))
        target = nt + FRAME_TIME;
        fr.paint(g);
        previousFrame = fr;
        await new Promise(x => setTimeout(x, 10));
    }

}

canvasCheckerboard();
main()