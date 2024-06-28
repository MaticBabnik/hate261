// use this file to generate VLC trees from tables

export interface VLCTree {
    [index: number]: VLCTree | number
}

export function buildTree(arr: Record<number, number[]>): VLCTree {
    const tree: VLCTree = {};

    for (let key in arr) {
        const val = arr[key];
        if (!val.length) continue;

        let at = tree;

        for (let step of val.slice(0, -1)) {
            if (!(step in at)) {
                at = at[step] = {};
            } else {
                const nextAt = at[step];
                if (typeof nextAt == "number") throw "ohno";
                at = nextAt;
            }
        }

        at[val.at(-1)!] = ~~key;
    }

    return tree;
}

// console.log(
//     buildTree(TCOEFF)
// )