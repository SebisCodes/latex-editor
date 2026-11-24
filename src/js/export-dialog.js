/**
 * The Export dialog and the quick ways out of the editor: PDF (print dialog), page pictures
 * (PNG, JPEG, WebP; one page or all, as a ZIP), one HTML file, plain text, the .tex, the .tex
 * with its pictures as a ZIP, or everything at once; copying the code or a format; downloading
 * the .tex (with its pictures as a ZIP); and Ctrl+S, which saves to the server or the page
 * around the editor when one is set up, else downloads. With template placeholders, every format
 * made of the code shows the template as written; PDF follows the view the preview shows.
 */

import { getPlainText } from './latex.js?v=18';
import { drawPageCanvas, getCanvasBlob, getStandaloneHtml } from './page-export.js?v=7';
import { createZip } from './zip.js?v=4';
import { openDialog } from './dialogs.js?v=5';
import { saveFile, getSafeName } from './util.js?v=3';
import { state, ui, areas, getElement, showToast } from './state.js?v=2';
import { renderPreview, getExportPages } from './preview.js?v=9';
import { getPageSize, getCurrentPage } from './zoom.js?v=9';
import { stopTextEdit } from './text-edit.js?v=9';
import { getPagePictures, runPrint, createTexZip, createAllZip } from './export.js?v=9';

/** The formats exported as page pictures. */
const PICTURE_FORMATS = /^(png|jpeg|webp)$/;
let dialog = null;
/** The fields of the dialog. */
const fields = { name: null, format: null, pages: null, scale: null, text: null, info: null };

/**
 * Returns "1 page" or "n pages" and the like.
 * @param {number} count - the number.
 * @param {string} one - the word for one.
 * @param {string} many - the word for several.
 * @returns {string} the count with its word.
 */
function formatCount(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
}

/**
 * Returns the file name of the export without extension: the name typed, else the document's.
 * @returns {string} a name safe for files.
 */
function getExportName() {
    return getSafeName(fields.name.value || state.name);
}

/**
 * Opens the Export dialog with the current pages and the document's name.
 * @returns {void}
 */
export function openExportDialog() {
    renderPreview();
    fields.name.value = state.name;
    updateExportDialog();
    openDialog(dialog);
}

/**
 * Shows what the chosen format gives: the picture size and pages, the number of pages for PDF,
 * the files of the ZIP, or the text with its size (the HTML file is made in the background).
 * @returns {void}
 */
function updateExportDialog() {
    const format = fields.format.value;
    if (format === 'convert') return;
    const picture = PICTURE_FORMATS.test(format);
    dialog.dataset.raster = format === 'pdf' ? 'pdf' : String(picture);
    getElement('#ex-download').textContent = format === 'pdf' ? 'Print / Save as PDF' : 'Download';
    getElement('#ex-copy').hidden = format === 'pdf' || format === 'texzip';
    const pageCount = format === 'pdf' ? state.pages.length : getExportPages().pages.length;
    if (picture) { showPictureSize(pageCount); return; }
    if (format === 'pdf') { fields.info.textContent = formatCount(pageCount, 'page', 'pages'); return; }
    if (format === 'texzip') { showZipFiles(); return; }
    if (format === 'html') { showHtmlFile(); return; }
    const text = format === 'tex' ? state.code : getPlainText(getExportPages().result.blocks);
    fields.text.value = text;
    fields.info.textContent = `${new Blob([text]).size.toLocaleString('en')} bytes`;
}

/**
 * Shows the size of a page picture and the number of pages.
 * @param {number} pageCount - the number of pages.
 * @returns {void}
 */
function showPictureSize(pageCount) {
    const scale = +fields.scale.value;
    const { w, h } = getPageSize();
    getElement('#ex-size').textContent = `${Math.round(w * scale)} × ${Math.round(h * scale)} pixels per page · ${formatCount(pageCount, 'page', 'pages')}`;
    fields.info.textContent = '';
}

/**
 * Lists the files of the ZIP of the .tex with its pictures.
 * @returns {void}
 */
function showZipFiles() {
    const pictureCount = Object.keys(state.assets).length;
    fields.text.value = [`${getExportName()}.tex`, ...Object.keys(state.assets)].join('\n');
    fields.info.textContent = `.tex and ${formatCount(pictureCount, 'picture', 'pictures')}`;
}

/**
 * Shows the HTML file once it is made, if HTML is still the chosen format then.
 * @returns {void}
 */
function showHtmlFile() {
    fields.text.value = '';
    fields.info.textContent = '';
    getStandaloneHtml(getExportPages().pages, state.name, getExportPages().result.meta).then(html => {
        if (fields.format.value !== 'html') return;
        fields.text.value = html;
        fields.info.textContent = `${new Blob([html]).size.toLocaleString('en')} bytes`;
    });
}

/**
 * Downloads the chosen format, or prints for PDF (a click handler).
 * @returns {Promise<void>} settles when the download is made.
 */
async function saveOrPrintChosenFormat() {
    const format = fields.format.value;
    const button = getElement('#ex-download');
    button.disabled = true;
    try {
        if (format === 'pdf') { dialog.close(); runPrint(); return; }
        await saveChosenFormat(format);
        showToast('Downloaded');
    } catch (error) { console.error(error); showToast(error.message); } finally { button.disabled = false; }
}

/**
 * Saves the chosen format as a file.
 * @param {string} format - the format of the select.
 * @returns {Promise<void>} settles when the file is handed to the browser.
 */
async function saveChosenFormat(format) {
    const baseName = getExportName();
    if (PICTURE_FORMATS.test(format)) {
        const pictures = await getPagePictures('image/' + format, fields.pages.value, +fields.scale.value, baseName);
        if (pictures.length === 1) saveFile(pictures[0].data, pictures[0].name);
        else saveFile(await createZip(pictures), `${getExportName()}-pages.zip`);
    } else if (format === 'html') saveFile(await getStandaloneHtml(getExportPages().pages, state.name, getExportPages().result.meta), `${getExportName()}.html`, 'text/html');
    else if (format === 'txt') saveFile(fields.text.value, `${baseName}.txt`, 'text/plain');
    else if (format === 'texzip') saveFile(await createTexZip(baseName), `${getExportName()}.zip`);
    else saveFile(state.code, `${baseName}.tex`, 'application/x-tex');
}

/**
 * Downloads everything at once as a ZIP (a click handler).
 * @returns {Promise<void>} settles when the download is made.
 */
async function saveAllFiles() {
    const button = getElement('#ex-zip');
    button.disabled = true;
    try {
        const baseName = getExportName();
        const { zip, pages } = await createAllZip(baseName, +fields.scale.value);
        saveFile(zip, `${baseName}-all.zip`);
        showToast(`ZIP downloaded: .tex, pictures, HTML, text and ${formatCount(pages, 'page', 'pages')} as PNG`);
    } catch (error) { console.error(error); showToast(error.message); } finally { button.disabled = false; }
}

/**
 * Copies the chosen format to the clipboard: the page in sight as PNG, the HTML file or the
 * text; where the clipboard API fails, text is copied with the copy command (a click handler).
 * @returns {Promise<void>} settles when it is copied.
 */
async function copyChosenFormat() {
    const format = fields.format.value;
    try {
        if (PICTURE_FORMATS.test(format)) {
            const pages = getExportPages().pages;
            const canvas = await drawPageCanvas(pages[Math.min(getCurrentPage(), pages.length - 1)], +fields.scale.value);
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': await getCanvasBlob(canvas, 'image/png') })]);
        } else if (format === 'html') await navigator.clipboard.writeText(await getStandaloneHtml(getExportPages().pages, state.name, getExportPages().result.meta));
        else await navigator.clipboard.writeText(fields.text.value);
        showToast('Copied to the clipboard');
    } catch (error) {
        if (!/^(png|jpeg|webp|html)$/.test(format)) { fields.text.select(); document.execCommand('copy'); showToast('Copied to the clipboard'); }
        else showToast('This browser does not allow copying this');
    }
}

/**
 * Downloads the .tex, as a ZIP with its pictures when it has some.
 * @returns {void}
 */
function saveTex() {
    fields.name.value = state.name;
    if (Object.keys(state.assets).length) createTexZip(getExportName()).then(zip => { saveFile(zip, `${getSafeName(state.name)}.zip`); showToast('.tex with its pictures downloaded (ZIP)'); });
    else { saveFile(state.code, `${getSafeName(state.name)}.tex`, 'application/x-tex'); showToast('.tex downloaded'); }
}

/**
 * Ctrl+S: text being edited on the page goes into the code first; then to the server or the
 * page around the editor if set up, otherwise a download.
 * @returns {void}
 */
export function saveQuickly() {
    if (state.textEdit) stopTextEdit(true);
    if (areas.sync && areas.sync.isActive()) { areas.sync.save(); return; }
    saveTex();
}

/**
 * Copies the code to the clipboard, with the copy command where the clipboard API fails.
 * @returns {Promise<void>} settles when it is copied.
 */
async function copyCode() {
    try { await navigator.clipboard.writeText(state.code); } catch (error) { ui.ta.select(); document.execCommand('copy'); }
    showToast('Code copied');
}

/**
 * Connects the Export dialog and the buttons Export, Copy and Download of the top bar.
 * @returns {void}
 */
export function startExportDialog() {
    dialog = getElement('#export');
    Object.assign(fields, { name: getElement('#ex-name'), format: getElement('#ex-format'), pages: getElement('#ex-pages'), scale: getElement('#ex-scale'), text: getElement('#ex-text'), info: getElement('#ex-info') });
    fields.format.addEventListener('change', updateExportDialog);
    fields.scale.addEventListener('change', updateExportDialog);
    fields.pages.addEventListener('change', updateExportDialog);
    fields.name.addEventListener('input', updateExportDialog);
    getElement('#ex-download').addEventListener('click', saveOrPrintChosenFormat);
    getElement('#ex-zip').addEventListener('click', saveAllFiles);
    getElement('#ex-copy').addEventListener('click', copyChosenFormat);
    getElement('#btn-export').addEventListener('click', openExportDialog);
    getElement('#btn-copy').addEventListener('click', copyCode);
    getElement('#btn-download').addEventListener('click', () => saveTex());
}
