/// <reference types="node" />

/**
 * Minimal zip helpers for the import/export tests: write an uncompressed
 * ("stored") zip from files on disk, and list the entry names of a zip the
 * app produced. Enough for fixtures; not a general zip library.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { crc32 } from 'zlib';

/** Every file under dir, as zip entry names (forward slashes) prefixed with `prefix/`. */
export function filesUnder(dir: string, prefix: string): { name: string; data: Buffer }[] {
	const out: { name: string; data: Buffer }[] = [];
	const walk = (current: string) => {
		for (const entry of readdirSync(current)) {
			const full = join(current, entry);
			if (statSync(full).isDirectory()) {
				walk(full);
			} else {
				const rel = relative(dir, full).split(sep).join('/');
				out.push({ name: `${prefix}/${rel}`, data: readFileSync(full) });
			}
		}
	};
	walk(dir);
	return out;
}

/** A stored (uncompressed) zip of the given entries. */
export function createZip(entries: { name: string; data: Buffer }[]): Buffer {
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;
	for (const { name, data } of entries) {
		const nameBytes = Buffer.from(name, 'utf8');
		const crc = crc32(data);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4); // version needed
		local.writeUInt16LE(0x0800, 6); // UTF-8 names
		local.writeUInt16LE(0, 8); // stored
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBytes.length, 26);
		locals.push(local, nameBytes, data);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4); // version made by
		central.writeUInt16LE(20, 6); // version needed
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(0, 10);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(nameBytes.length, 28);
		central.writeUInt32LE(offset, 42);
		centrals.push(central, nameBytes);

		offset += local.length + nameBytes.length + data.length;
	}

	const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, ...centrals, end]);
}

/** The entry names of a zip, read from its central directory. */
export function listZip(zip: Buffer): string[] {
	const endOffset = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
	if (endOffset < 0) throw new Error('not a zip file');
	const count = zip.readUInt16LE(endOffset + 10);
	let pos = zip.readUInt32LE(endOffset + 16);
	const names: string[] = [];
	for (let i = 0; i < count; i++) {
		if (zip.readUInt32LE(pos) !== 0x02014b50) throw new Error('broken central directory');
		const nameLength = zip.readUInt16LE(pos + 28);
		const extraLength = zip.readUInt16LE(pos + 30);
		const commentLength = zip.readUInt16LE(pos + 32);
		names.push(zip.toString('utf8', pos + 46, pos + 46 + nameLength));
		pos += 46 + nameLength + extraLength + commentLength;
	}
	return names;
}
