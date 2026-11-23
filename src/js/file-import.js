/**
 * Opening files: with the Open button, by dropping them anywhere on the editor, or by pasting.
 * .tex files become new documents; a ZIP with a .tex and pictures becomes one document with its
 * pictures (main.tex, else the .tex with \begin{document}, else the first; pictures in folders
 * keep their last name part); pictures go into the open document. A picture dropped onto the
 * code goes where it was dropped. Pasting a whole LaTeX document outside the code replaces the
 * open one; a pasted picture becomes a picture of the document.
 */

import { readAsDataUrl } from './assets.js?v=6';
import { state, ui, DEFAULT_NAME, getElement, showToast } from './state.js?v=2';
import { setCode } from './history.js?v=5';
import { renderPreview } from './preview.js?v=5';
import { openNewDocument } from './documents.js?v=5';
import { addPicture } from './picture-files.js?v=5';
import { renderInsertPanel } from './insert-panel.js?v=5';
import { TYPING_FIELDS } from './keyboard.js?v=5';
import { readZipEntries, readEntryData } from './zip-read.js?v=2';

const MEGABYTE = 1024 * 1024;
/** The largest .tex file that is opened. */
const MAX_TEX_SIZE = 8 * MEGABYTE;
/** The largest ZIP that is opened, and what all of its entries may unpack to. */
const MAX_ZIP_SIZE = 100 * MEGABYTE;
/** Entries of a ZIP that are left out: hidden files and the folders macOS adds. */
const HIDDEN_ENTRY = /(^|\/)(\.|__MACOSX)/;
/** The kinds of the pictures a ZIP may hold, by extension (PDF figures included: a ZIP from Export opens complete). */
const PICTURE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf' };
/** A pasted text that starts like a whole LaTeX document (comments before it allowed). */
const WHOLE_DOCUMENT = /^\s*(%[^\n]*\n\s*)*\\documentclass\b/;
let dragDepth = 0;

/**
 * Asks for files to open (the Open button and "Open a file" of "My documents").
 * @returns {void}
 */
export function showFilePicker() {
    getElement('#file').click();
}

/**
 * Connects the Open button, dropping files on the editor and pasting.
 * @returns {void}
 */
export function startFileImport() {
    const picker = getElement('#file');
    getElement('#btn-open').addEventListener('click', showFilePicker);
    picker.addEventListener('change', async () => { await openFiles([...picker.files]); picker.value = ''; });
    window.addEventListener('dragenter', showDropZone);
    window.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
    window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('drop'); } });
    window.addEventListener('drop', openDroppedFiles);
    window.addEventListener('paste', importPastedContent);
}

/**
 * Marks the page as a drop target while files are dragged over it.
 * @param {DragEvent} event - the drag entering an element.
 * @returns {void}
 */
function showDropZone(event) {
    if (!event.dataTransfer.types.includes('Files')) return;
    dragDepth++;
    document.body.classList.add('drop');
    event.preventDefault();
}

/**
 * Opens files: .tex files as new documents, ZIPs as documents with their pictures, pictures
 * into the open document (a single one is also inserted at the cursor when no .tex comes along).
 * @param {File[]} files - the files.
 * @returns {Promise<void>} settles when all are opened.
 */
export async function openFiles(files) {
    const pictures = files.filter(file => /^image\//.test(file.type));
    const zips = files.filter(file => /\.zip$/i.test(file.name));
    const texts = files.filter(file => !pictures.includes(file) && !zips.includes(file));
    for (const text of texts) await openTexFile(text);
    for (const zip of zips) await openZip(zip);
    for (const picture of pictures) await addPicture(picture, pictures.length === 1 && !texts.length);
}

/**
 * Opens a .tex file as a new document; other files are refused with a message.
 * @param {File} file - the file.
 * @returns {Promise<void>} settles when it is open.
 */
async function openTexFile(file) {
    if (!/\.(tex|ltx|latex|txt)$/i.test(file.name) && !/text/.test(file.type)) { showToast(`"${file.name}" is not a .tex file`); return; }
    if (file.size > MAX_TEX_SIZE) { showToast('The file is larger than 8 MB'); return; }
    const text = await file.text();
    if (openNewDocument(file.name.replace(/\.[^.]+$/, '') || DEFAULT_NAME, text)) showToast(`Opened "${file.name}" - it is now in "My documents"`);
}

/**
 * Opens a ZIP with a .tex file and pictures (stored or deflated) as one document; what goes
 * wrong is told to the user.
 * @param {File} file - the ZIP.
 * @returns {Promise<void>} settles when it is open or refused.
 */
async function openZip(file) {
    try {
        if (file.size > MAX_ZIP_SIZE) throw new Error('it is larger than 100 MB');
        const entries = readZipEntries(new Uint8Array(await file.arrayBuffer()));
        const budget = { left: MAX_ZIP_SIZE };
        const main = findMainTex(entries);
        const code = new TextDecoder().decode(await readEntryData(main, budget));
        const pictures = await readZipPictures(entries, budget);
        const count = Object.keys(pictures).length;
        if (!openNewDocument(main.name.replace(/^.*\//, '').replace(/\.tex$/i, '') || file.name.replace(/\.zip$/i, ''), code, pictures)) return;
        state.assets = pictures;
        renderInsertPanel();
        renderPreview();
        showToast(`Opened "${file.name}" with ${count} ${count === 1 ? 'picture' : 'pictures'}`);
    } catch (error) { showToast(`"${file.name}" could not be opened: ${error.message}`); }
}

/**
 * Finds the main .tex file of a ZIP: main.tex, else a stored .tex with \begin{document}, else the first.
 * @param {import('./zip-read.js').ZipEntry[]} entries - the entries.
 * @returns {import('./zip-read.js').ZipEntry} the entry.
 * @throws {Error} when the ZIP holds no .tex file.
 */
function findMainTex(entries) {
    const texFiles = entries.filter(entry => /\.tex$/i.test(entry.name) && !HIDDEN_ENTRY.test(entry.name));
    if (!texFiles.length) throw new Error('there is no .tex file in it');
    return texFiles.find(entry => /(^|\/)main\.tex$/i.test(entry.name))
        || texFiles.find(entry => /\\begin\{document\}/.test(new TextDecoder().decode(entry.method === 0 ? entry.data : new Uint8Array())))
        || texFiles[0];
}

/**
 * Reads the pictures of a ZIP, each under its last name part.
 * @param {import('./zip-read.js').ZipEntry[]} entries - the entries.
 * @param {object} budget - what the ZIP may still unpack to; reduced.
 * @param {number} budget.left - the bytes left.
 * @returns {Promise<Object<string, string>>} the pictures: name -> data URI.
 */
async function readZipPictures(entries, budget) {
    const pictures = {};
    for (const entry of entries) {
        const extension = (/\.(png|jpe?g|gif|webp|svg|pdf)$/i.exec(entry.name) || [])[1];
        if (!extension || HIDDEN_ENTRY.test(entry.name)) continue;
        pictures[entry.name.replace(/^.*\//, '')] = await readAsDataUrl(new Blob([await readEntryData(entry, budget)], { type: PICTURE_TYPES[extension.toLowerCase()] }));
    }
    return pictures;
}

/**
 * Opens dropped files (a drop handler); a picture dropped onto the code goes where it was dropped.
 * @param {DragEvent} event - the drop.
 * @returns {void}
 */
function openDroppedFiles(event) {
    dragDepth = 0;
    document.body.classList.remove('drop');
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    event.preventDefault();
    if (event.target === ui.ta && document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(event.clientX, event.clientY);
        if (position && position.offsetNode === ui.ta) ui.ta.setSelectionRange(position.offset, position.offset);
        ui.ta.focus({ preventScroll: true });
    }
    openFiles(files);
}

/**
 * Takes what is pasted outside the fields (a paste handler): a picture becomes a picture of
 * the document (inserted when pasted into the code); a whole LaTeX document replaces the open
 * one ("Undo" brings the old text back).
 * @param {ClipboardEvent} event - the paste.
 * @returns {void}
 */
function importPastedContent(event) {
    const active = document.activeElement;
    const picture = [...(event.clipboardData?.files || [])].find(file => /^image\//.test(file.type));
    if (picture && (active === ui.ta || !(active && active.matches(TYPING_FIELDS)))) {
        event.preventDefault();
        const extension = picture.type.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
        addPicture(new File([picture], picture.name && picture.name !== 'image.png' ? picture.name : `picture.${extension}`, { type: picture.type }), active === ui.ta);
        return;
    }
    if (active && active.matches(TYPING_FIELDS)) return;
    const text = event.clipboardData.getData('text');
    if (WHOLE_DOCUMENT.test(text)) {
        event.preventDefault();
        setCode(text);
        showToast('LaTeX pasted from the clipboard - "Undo" brings the old text back');
    }
}
