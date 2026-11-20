/**
 * Reading a ZIP the user opens: its directory and the data of its entries, stored or deflated.
 * A small ZIP can unpack to gigabytes and stop the tab, so all entries of one ZIP together
 * unpack to at most a budget of bytes; reading stops with an error past it.
 */

/** The signature of the end of the central directory. */
const DIRECTORY_END_SIGNATURE = 0x06054b50;
/** The size of the end record without its comment. */
const DIRECTORY_END_SIZE = 22;
/** The longest comment of a ZIP. */
const MAX_COMMENT = 65535;
/** The most entries a ZIP may hold. */
const MAX_ENTRIES = 2000;
/** The size of a central directory record before its name. */
const DIRECTORY_RECORD_SIZE = 46;
/** The size of a local header before its name. */
const LOCAL_HEADER_SIZE = 30;

/**
 * An entry of a ZIP.
 * @typedef {object} ZipEntry
 * @property {string} name - its path in the ZIP.
 * @property {number} method - 0 stored, 8 deflated.
 * @property {Uint8Array} data - its compressed data.
 */

/**
 * Returns the entries of a ZIP from its central directory.
 * @param {Uint8Array} bytes - the ZIP.
 * @returns {ZipEntry[]} the entries.
 * @throws {Error} when it is no ZIP or holds more than 2000 entries (the message completes "… could not be opened: ").
 */
export function readZipEntries(bytes) {
    const view = new DataView(bytes.buffer);
    const directoryEnd = findDirectoryEnd(bytes, view);
    if (directoryEnd < 0) throw new Error('it is not a ZIP file');
    const count = view.getUint16(directoryEnd + 10, true);
    if (count > MAX_ENTRIES) throw new Error('it holds more than 2000 files');
    let position = view.getUint32(directoryEnd + 16, true);
    const entries = [];
    for (let k = 0; k < count; k++) {
        const nameLength = view.getUint16(position + 28, true), extraLength = view.getUint16(position + 30, true), commentLength = view.getUint16(position + 32, true);
        entries.push(readDirectoryRecord(bytes, view, position, nameLength));
        position += DIRECTORY_RECORD_SIZE + nameLength + extraLength + commentLength;
    }
    return entries;
}

/**
 * Returns where the end record of the central directory starts, searched from the end.
 * @param {Uint8Array} bytes - the ZIP.
 * @param {DataView} view - a view of its bytes.
 * @returns {number} the place, -1 when there is none.
 */
function findDirectoryEnd(bytes, view) {
    for (let i = bytes.length - DIRECTORY_END_SIZE; i >= Math.max(0, bytes.length - DIRECTORY_END_SIZE - MAX_COMMENT); i--) {
        if (view.getUint32(i, true) === DIRECTORY_END_SIGNATURE) return i;
    }
    return -1;
}

/**
 * Reads one record of the central directory and finds the entry's data after its local header.
 * @param {Uint8Array} bytes - the ZIP.
 * @param {DataView} view - a view of its bytes.
 * @param {number} position - where the record starts.
 * @param {number} nameLength - the length of the entry's name.
 * @returns {ZipEntry} the entry.
 */
function readDirectoryRecord(bytes, view, position, nameLength) {
    const method = view.getUint16(position + 10, true), compressedSize = view.getUint32(position + 20, true), offset = view.getUint32(position + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(position + DIRECTORY_RECORD_SIZE, position + DIRECTORY_RECORD_SIZE + nameLength));
    const start = offset + LOCAL_HEADER_SIZE + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    return { name, method, data: bytes.subarray(start, start + compressedSize) };
}

/**
 * Returns the unpacked data of an entry and takes its size from the budget (a reader that
 * consumes its input: the budget is shared by the entries of one ZIP).
 * @param {ZipEntry} entry - the entry.
 * @param {object} budget - what the ZIP may still unpack to; reduced.
 * @param {number} budget.left - the bytes left.
 * @returns {Promise<Uint8Array>} the data.
 * @throws {Error} when the budget is used up (the Promise rejects).
 */
export async function readEntryData(entry, budget) {
    if (entry.method === 0) {
        budget.left -= entry.data.length;
        if (budget.left < 0) throw createTooBigError();
        return entry.data;
    }
    const reader = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const parts = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        budget.left -= value.length;
        if (budget.left < 0) { reader.cancel(); throw createTooBigError(); }
        parts.push(value);
    }
    return joinParts(parts, size);
}

/**
 * Creates the error of a ZIP that unpacks to more than its budget.
 * @returns {Error} the error.
 */
function createTooBigError() {
    return new Error('it unpacks to more than 100 MB');
}

/**
 * Returns parts of data joined.
 * @param {Uint8Array[]} parts - the parts.
 * @param {number} size - their total length.
 * @returns {Uint8Array} the data.
 */
function joinParts(parts, size) {
    const joined = new Uint8Array(size);
    let at = 0;
    for (const part of parts) { joined.set(part, at); at += part.length; }
    return joined;
}
