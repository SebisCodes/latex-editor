/**
 * A small PDF writer: one JPEG picture per page, filling the page. The text of such a PDF is
 * part of the pictures: it cannot be selected or searched.
 *
 * createJpegPdf() writes, in this order:
 *   1. the header;
 *   2. object 1 the catalog, 2 the page tree, 3 the document information;
 *   3. per page three objects: the page, its picture and the content that draws the picture;
 *   4. the cross-reference table and the trailer.
 */

const encoder = new TextEncoder();
/** The objects before the first page: catalog, page tree, information. */
const FIRST_PAGE_OBJECT = 4;
/** Each page has three objects: the page, its picture and its content. */
const OBJECTS_PER_PAGE = 3;
const PRODUCER = 'LaTeX Editor - latex.giit.ch';
/** The width of an offset in the cross-reference table. */
const OFFSET_DIGITS = 10;

/**
 * One page of the PDF.
 * @typedef {object} PdfPage
 * @property {Uint8Array} jpeg - the JPEG picture of the page.
 * @property {number} px - the width of the picture in pixels.
 * @property {number} py - the height of the picture in pixels.
 * @property {number} w - the width of the page in points.
 * @property {number} h - the height of the page in points.
 */

/**
 * Returns a text as a PDF string: characters outside printable ASCII as "?", \ ( ) escaped.
 * @param {*} text - the text.
 * @returns {string} the PDF string with its parentheses.
 */
function formatPdfText(text) {
    return '(' + String(text).replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&') + ')';
}

/**
 * Creates a PDF with one JPEG picture per page.
 * @param {PdfPage[]} pages - the pages.
 * @param {object} [options] - more about the document.
 * @param {string} [options.title] - the title in the document information.
 * @returns {Uint8Array} the PDF file.
 */
export function createJpegPdf(pages, { title = '' } = {}) {
    const writer = createPdfWriter();
    const kids = pages.map((_, i) => `${FIRST_PAGE_OBJECT + i * OBJECTS_PER_PAGE} 0 R`).join(' ');
    writer.write('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    writer.writeObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
    writer.writeObject(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
    writer.writeObject(3, `<< /Title ${formatPdfText(title)} /Producer (${PRODUCER}) >>`);
    pages.forEach((page, i) => writePage(writer, page, FIRST_PAGE_OBJECT + i * OBJECTS_PER_PAGE));
    writeTrailer(writer, FIRST_PAGE_OBJECT + pages.length * OBJECTS_PER_PAGE);
    return writer.getBytes();
}

/**
 * The writer that collects the parts of a PDF and the offsets of its objects.
 * @typedef {object} PdfWriter
 * @property {function((string|Uint8Array)): void} write - adds text (as UTF-8) or bytes.
 * @property {function(number, string, Uint8Array=): void} writeObject - adds an object, with a stream when given.
 * @property {function(number): number} getOffset - the offset of an object written.
 * @property {function(): number} getSize - the bytes written so far.
 * @property {function(): Uint8Array} getBytes - all parts joined.
 */

/**
 * Creates the writer of one PDF.
 * @returns {PdfWriter} the writer.
 */
function createPdfWriter() {
    const parts = [];
    const offsets = [];
    let size = 0;
    return {
        /**
         * Adds text (as UTF-8) or bytes.
         * @param {string|Uint8Array} data - the text or bytes.
         * @returns {void}
         */
        write(data) {
            const bytes = typeof data === 'string' ? encoder.encode(data) : data;
            parts.push(bytes);
            size += bytes.length;
        },
        /**
         * Adds an object and notes its offset.
         * @param {number} number - the object's number.
         * @param {string} body - its dictionary.
         * @param {Uint8Array} [stream] - its stream.
         * @returns {void}
         */
        writeObject(number, body, stream) {
            offsets[number] = size;
            this.write(`${number} 0 obj\n${body}\n`);
            if (stream) { this.write('stream\n'); this.write(stream); this.write('\nendstream\n'); }
            this.write('endobj\n');
        },
        /**
         * Returns the offset of an object written.
         * @param {number} number - the object's number.
         * @returns {number} its offset in bytes.
         */
        getOffset(number) {
            return offsets[number];
        },
        /**
         * Returns the bytes written so far.
         * @returns {number} the size in bytes.
         */
        getSize() {
            return size;
        },
        /**
         * Returns all parts joined.
         * @returns {Uint8Array} the bytes.
         */
        getBytes() {
            const out = new Uint8Array(size);
            let at = 0;
            for (const bytes of parts) { out.set(bytes, at); at += bytes.length; }
            return out;
        },
    };
}

/**
 * Writes the three objects of a page: the page, its picture and the content that draws it.
 * @param {PdfWriter} writer - the writer.
 * @param {PdfPage} page - the page.
 * @param {number} number - the number of the page's first object.
 * @returns {void}
 */
function writePage(writer, page, number) {
    const width = page.w.toFixed(2), height = page.h.toFixed(2);
    writer.writeObject(number, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${number + 1} 0 R >> >> /Contents ${number + 2} 0 R >>`);
    writer.writeObject(number + 1, `<< /Type /XObject /Subtype /Image /Width ${page.px} /Height ${page.py} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>`, page.jpeg);
    const draw = encoder.encode(`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`);
    writer.writeObject(number + 2, `<< /Length ${draw.length} >>`, draw);
}

/**
 * Writes the cross-reference table and the trailer.
 * @param {PdfWriter} writer - the writer.
 * @param {number} count - the number of objects plus one (object 0).
 * @returns {void}
 */
function writeTrailer(writer, count) {
    const xref = writer.getSize();
    let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let number = 1; number < count; number++) table += String(writer.getOffset(number)).padStart(OFFSET_DIGITS, '0') + ' 00000 n \n';
    writer.write(table);
    writer.write(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
