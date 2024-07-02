import { BitReader } from "./BitReader";
// import "./treegen"
import { Frame } from "./dec";

const canvas = document.getElementById('output') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;

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

async function main() {
    // const res = await fetch("badapple.h261");
    const res = await fetch("rickroll.h261");
    const buf = await res.arrayBuffer();

    const br = new BitReader(buf);
    
    let previousFrame: Frame | undefined = undefined;
    for (let i = 0; i < 100; i++) {
        const fr: Frame = new Frame(br, previousFrame, i);
        fr.paint(g);
        previousFrame = fr;
    }
}

canvasCheckerboard();
main();
