# Symbol model benchmark

Measured on October 13, 2026 UTC with Node v24.19.0, Linux x64, AMD EPYC 9V74. This is a model microbenchmark of one deliberately repetitive composition. It does not measure browser rendering or frame rate.

## Reproduce

```sh
npm run bench:symbols
```

The command creates `test-results/symbol-benchmark.json`. The committed [receipt](symbol-benchmark.json) records source and fixture SHA256 hashes, environment, sample counts and exact measurements. Current timings can differ with CPU load, Node version and source changes.

## Fixture and method

Both documents describe a 1280 × 720 composition, 30 frames per second, lasting 240 frames. A 10 × 10 grid contains five rectangles at each placement. Each rectangle has four linear keyframes at frames 0, 60, 120 and 239, animating position, opacity and rotation. There are no meshes, effects, masks, scripts or animated cameras in this fixture.

The version 1 document stores 500 independent rectangles and 2,000 keys. The version 2 document stores one definition containing five rectangles and 20 keys, plus 100 instances. It stores 105 nodes and evaluates 600 nodes, including instance containers. Definition dimensions are 110 × 50; instances use the same dimensions, identity transforms and loop playback with zero start and first frame.

Before measurement, all 500 leaf position, width, height, opacity, rotation and scale values are compared individually across all 240 frames, with absolute tolerance 1e-9. Traversal checksums also agree within 1e-7. This checks the fixture's numerical equivalence, not rendered pixels.

Each operation receives 100 warmup calls and 500 measured calls. Version 1 and version 2 ordering alternates on each iteration. Validation calls `validateProject` on complete normalized documents. Traversal calls `evaluateNode` for every expanded node, including nested clocks and accumulated translation. Definition lookup uses a Map created before timing. Traversal frames advance by seven modulo 240. Results report the midpoint median and nearest rank 95th percentile. No explicit garbage collection, CPU isolation or statistical confidence interval is used.

## Observed results

| Measurement | Version 1 flat scene | Version 2 shared symbols |
| :--- | ---: | ---: |
| Validation median | 1.573 ms | 0.183 ms |
| Validation p95 | 2.149 ms | 0.235 ms |
| Traversal median | 0.897 ms | 0.935 ms |
| Traversal p95 | 1.145 ms | 1.150 ms |
| Serialized JSON | 593,343 bytes | 89,341 bytes |
| Compact JSON | 320,762 bytes | 54,598 bytes |
| Serialized JSON with gzip level 9 | 12,931 bytes | 1,890 bytes |

In this fixture, shared definitions reduce serialized source by 84.94% and validation median by 88.37%. Traversal median increases by 4.27% while evaluating 20% more nodes. Reuse saves stored source and repeated normalization; descendants still require evaluation for every instance.

## Limits and acceptance

The workload intentionally repeats identical graphics. A library of unique definitions offers less reuse. This result does not establish SVG size savings, export latency, browser FPS, GPU cost, deep nesting performance, filter performance or full Flash compatibility. Browser rendering and exports have separate integration tests.

Acceptance: run the command successfully, confirm the 240 frame equivalence assertions pass, and compare fixture hashes and byte sizes with the receipt before comparing timing results.
