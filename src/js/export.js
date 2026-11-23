/**
 * What the editor exports from the open document: pictures of the pages, a PDF of page
 * pictures for a page around the editor (which cannot use the print dialog), printing (PDF
 * with selectable text through the print dialog), the .tex with its pictures as a ZIP, and
 * everything at once as a ZIP.
 */

import { getPlainText } from './latex.js?v=15';
import { drawPageCanvas, getCanvasBlob, getStandaloneHtml, openPrintDialog } from './page-export.js?v=4';
import { createJpegPdf } from './pdf.js?v=3';
import { createZip } from './zip.js?v=4';
import { getDataUrlBytes } from './assets.js?v=6';
import { state } from './state.js?v=2';
import { renderPreview } from './preview.js?v=4';
import { getCurrentPage } from './zoom.js?v=4';

/** The resolution of the PDF of page pictures, in dots per inch, when none is asked for. */
const DEFAULT_PDF_DPI = 200;
/** CSS pixels per inch. */
const CSS_DPI = 96;
/** The JPEG quality of the PDF's page pictures. */
const PDF_JPEG_QUALITY = 0.85;
/** PDF points per CSS pixel. */
const POINTS_PER_PIXEL = 0.75;

/**
 * A file to download or put into a ZIP.
 * @typedef {object} ExportFile
 * @property {string} name - its name.
 * @property {Blob|string|Uint8Array} data - its content.
 */

/**
 * Returns pictures of the pages: all of them, or the page in sight.
 * @param {string} type - the picture type ("image/png", "image/jpeg", "image/webp").
 * @param {string} which - "all" for every page, else the page in sight.
 * @param {number} scale - the size of a page picture relative to the page.
 * @param {string} baseName - the file name without extension.
 * @returns {Promise<ExportFile[]>} the pictures, numbered when there are several.
 */
export async function getPagePictures(type, which, scale, baseName) {
    const extension = type === 'image/jpeg' ? 'jpg' : type.split('/')[1];
    const pages = which === 'all' ? state.pages : [state.pages[getCurrentPage()]];
    const pictures = [];
    for (const page of pages) {
        const canvas = await drawPageCanvas(page, scale);
        const name = which === 'all' && state.pages.length > 1 ? `${baseName}-${String(+page.dataset.page).padStart(2, '0')}.${extension}` : `${baseName}.${extension}`;
        pictures.push({ name, data: await getCanvasBlob(canvas, type) });
    }
    return pictures;
}

/**
 * Creates a PDF of all pages as JPEG pictures, for a page around the editor.
 * @param {number} [dpi] - the resolution of the pictures.
 * @returns {Promise<{pdf: Uint8Array, pages: number}>} the PDF and its number of pages.
 */
export async function createPicturePdf(dpi = DEFAULT_PDF_DPI) {
    renderPreview();
    const pictures = [];
    for (const page of state.pages) {
        const canvas = await drawPageCanvas(page, dpi / CSS_DPI);
        const blob = await getCanvasBlob(canvas, 'image/jpeg', PDF_JPEG_QUALITY);
        pictures.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), px: canvas.width, py: canvas.height,
            w: parseFloat(page.style.width) * POINTS_PER_PIXEL, h: parseFloat(page.style.height) * POINTS_PER_PIXEL });
    }
    return { pdf: createJpegPdf(pictures, { title: state.name }), pages: pictures.length };
}

/**
 * Prints the pages through the browser's print dialog (and so to a PDF with selectable text).
 * @returns {void}
 */
export function runPrint() {
    renderPreview();
    if (state.pages.length) openPrintDialog(state.pages, state.result.meta, state.name);
}

/**
 * Creates a ZIP with the .tex and the document's pictures.
 * @param {string} baseName - the name of the .tex without extension.
 * @returns {Promise<Blob>} the ZIP.
 */
export async function createTexZip(baseName) {
    return createZip([{ name: `${baseName}.tex`, data: state.code }, ...getPictureFiles()]);
}

/**
 * Returns the document's pictures as files.
 * @returns {ExportFile[]} the pictures with their bytes.
 */
function getPictureFiles() {
    return Object.entries(state.assets).map(([name, dataUrl]) => ({ name, data: getDataUrlBytes(dataUrl) }));
}

/**
 * Creates a ZIP with everything: the .tex, its pictures, the HTML file, the text and every page as PNG.
 * @param {string} baseName - the file name without extension.
 * @param {number} scale - the size of a page picture relative to the page.
 * @returns {Promise<{zip: Blob, pages: number}>} the ZIP and the number of page pictures in it.
 */
export async function createAllZip(baseName, scale) {
    const pngs = await getPagePictures('image/png', 'all', scale, baseName);
    const zip = await createZip([
        { name: `${baseName}.tex`, data: state.code },
        ...getPictureFiles(),
        { name: `${baseName}.html`, data: await getStandaloneHtml(state.pages, state.name, state.result.meta) },
        { name: `${baseName}.txt`, data: getPlainText(state.result.blocks) },
        ...pngs.map(png => ({ name: 'pages/' + png.name, data: png.data })),
    ]);
    return { zip, pages: pngs.length };
}
