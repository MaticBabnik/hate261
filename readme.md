# hate 261

Toy h.261 decoder.
I said this was doable in 1 sitting. I WAS WRONG

## Milestones-ish

**2024-07-02**: I got DCT+Quantization working after ~7 sittings...

**2024-07-05**: Implemented fast DCT, shoutout Nayuki for the 1D impl

## Resources

[H.261](https://www.itu.int/rec/T-REC-H.261) - The actual spec, kinda hard to read for a beginner

[FFMPEG](https://git.ffmpeg.org/ffmpeg.git) - An implementation that actually builds (looking at you maikmerten/p64).  

Configuring with the following command will give you a minimal h261 ffplay build.

```sh
./configure --enable-debug=3 --disable-ffmpeg --disable-ffprobe --disable-doc --disable-everything --enable-decoder=h261 --enable-parser=h261 --enable-demuxer=h261 --enable-protocol=file --enable-filter=scale
```

[YCbCr on Wikipedia](https://en.wikipedia.org/wiki/YCbCr#ITU-R_BT.601_conversion) - The color model

[Discrete cosine transform on Wikipedia](https://en.wikipedia.org/wiki/Discrete_cosine_transform) - Basically the most important part of the codec

[JPEG on wikipedia](https://en.wikipedia.org/wiki/JPEG#Discrete_cosine_transform) - More DCT material

[High level overview of h261](https://cgg.mff.cuni.cz/~pepca/lectures/pdf/2d-12-h261.pdf) - I wish this was the first thing I read

[Techniques and standards for image, video, and audio coding](https://archive.org/details/techniquesstanda0000raok) - Useful book (you have to create an archive.org account to borrow)
