/**
 * One-shot generator for effects/test/hex-slot3-test.hex.
 *
 * Assembles a simple pot-controlled volume program and writes it to an Intel
 * HEX file at slot 3 (address 0x0600). The non-zero source slot proves that
 * compileEffect auto-detects where the program lives — the .hex file can then
 * be written to any pedal slot the user chooses.
 *
 * Run with:  node scripts/build-test-hex.mjs
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Resolve the sibling fv1-core's built output directly so this script doesn't
// require adding @audiofab-io/fv1-core to this repo's dependencies.
const __dirname = dirname(fileURLToPath(import.meta.url));
const fv1CoreDist = resolve(__dirname, '..', '..', 'fv1-core', 'dist', 'index.js');
const { FV1Assembler, IntelHexParser } = await import(pathToFileURL(fv1CoreDist).href);

const OUT_PATH = resolve(__dirname, '..', 'effects', 'test', 'hex-slot3-test.hex');

const SPN = `
; HEX Test Effect — simple pot-controlled stereo volume.
; POT0 scales both ADCL and ADCR into DACL and DACR.

rdax ADCL, 1.0
mulx POT0
wrax DACL, 0

rdax ADCR, 1.0
mulx POT0
wrax DACR, 0
`;

const assembler = new FV1Assembler({ fv1AsmMemBug: true });
const result = assembler.assemble(SPN);
const fatals = result.problems.filter(p => p.isfatal);
if (fatals.length) {
    console.error('Assembly failed:');
    for (const p of fatals) console.error(`  line ${p.line}: ${p.message}`);
    process.exit(1);
}

const binary = FV1Assembler.toUint8Array(result.machineCode);
const padded = new Uint8Array(512);
padded.set(binary.subarray(0, Math.min(binary.length, 512)));

// Source-slot 3: program lives at byte offset 3 * 512 = 0x0600.
const SOURCE_SLOT = 3;
const hex = IntelHexParser.generateMultiSegment([
    { data: padded, address: SOURCE_SLOT * 512 },
]);

writeFileSync(OUT_PATH, hex + '\n', 'utf-8');
console.log(`Wrote ${OUT_PATH}`);
console.log(`  ${padded.length} bytes at source slot ${SOURCE_SLOT} (0x${(SOURCE_SLOT*512).toString(16).padStart(4,'0').toUpperCase()})`);
