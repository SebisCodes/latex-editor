/**
 * The Pictures tab of the side panel: the pictures of the open document with their size and
 * where the code uses them ("used 2×" leads there), the pictures the code asks for but that are
 * missing ("Add file…" stores one under that name), and per picture: insert, insert as figure,
 * rename (the references follow), replace (same name), download and remove.
 */

import { escapeHtml } from './latex.js?v=18';
import { assets, getDataUrlBytes } from './assets.js?v=6';
import { saveFile } from './util.js?v=3';
import { openConfirmation } from './dialogs.js?v=5';
import { state, ui, areas, NARROW_SCREEN } from './state.js?v=2';
import { renderPreview } from './preview.js?v=8';
import { showCodePosition } from './code-view.js?v=8';
import { addSnippet } from './code-insert.js?v=8';
import { addPackage } from './preamble-edit.js?v=8';
import { showPane } from './layout.js?v=8';
import { getNameStem, getPictureReferences, isReferenceTo, renamePicture, addPicture, addGraphic } from './picture-files.js?v=8';

const KILOBYTE = 1024;
const MEGABYTE = 1024 * 1024;
/** The files the picture chooser offers. */
const PICTURE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,application/pdf';
/** The size of each picture in pixels once it has loaded, by "name|length". */
const pictureSizes = {};
/** The hidden file input of the tab. */
let pictureInput = null;

/**
 * Tells whether a data URI holds a PDF.
 * @param {string} dataUrl - the data URI.
 * @returns {boolean} true for a PDF.
 */
function isPdf(dataUrl) {
    return /^data:application\/pdf[;,]/i.test(dataUrl);
}

/**
 * Tells whether a reference names something outside the document's pictures: an address, a
 * data URI or one of the example pictures.
 * @param {string} reference - the name in the code.
 * @returns {boolean} true for such a reference.
 */
function isOutsideReference(reference) {
    return /^(https:|data:)/i.test(reference) || /^example-image/.test(reference);
}

/**
 * Returns a size in KB (at least 1) or MB.
 * @param {number} bytes - the size in bytes.
 * @returns {string} the size for the user.
 */
function formatSize(bytes) {
    return bytes < MEGABYTE ? `${Math.max(1, Math.round(bytes / KILOBYTE))} KB` : `${(bytes / KILOBYTE / KILOBYTE).toFixed(1)} MB`;
}

/**
 * Draws the Pictures tab: the header with the count and size, the missing pictures and a card
 * per picture; the pixel sizes follow once the pictures have loaded.
 * @returns {void}
 */
export function renderPicturesTab() {
    const box = ui.pictures;
    const pictures = Object.entries(state.assets);
    const references = getPictureReferences();
    const missing = [...new Set(references.filter(reference => reference.name && !isOutsideReference(reference.name) && !pictures.some(([name]) => isReferenceTo(reference.name, name))).map(reference => reference.name))];
    const total = pictures.reduce((sum, [, dataUrl]) => sum + getDataUrlBytes(dataUrl).length, 0);
    box.innerHTML = `
        <div class="picture-header"><button type="button" class="button primary" id="pic-add">Add pictures…</button>
            <span class="muted">${pictures.length ? `${pictures.length} ${pictures.length === 1 ? 'picture' : 'pictures'} · ${formatSize(total)}` : 'No pictures yet'}</span></div>
        <p class="hint">Pictures belong to “${escapeHtml(state.name)}” and stay in your browser. Drop or paste them anywhere in the editor, or add them here; <code>\\includegraphics{name}</code> uses them.</p>
        ${missing.length ? `<div class="missing-pictures"><h3>Missing in this document</h3><ul>${missing.map(name => `<li><code>${escapeHtml(name)}</code><button type="button" class="button small" data-pic-fill="${escapeHtml(name)}" title="Choose the file for ${escapeHtml(name)}">Add file…</button></li>`).join('')}</ul></div>` : ''}
        <ul class="picture-gallery">${pictures.map(([name, dataUrl]) => formatPictureCard(name, dataUrl, references)).join('')}</ul>`;
    box.querySelectorAll('img[data-dim]').forEach(showPictureSizeOnLoad);
}

/**
 * Returns the card of a picture: its preview, name, size, uses and buttons.
 * @param {string} name - the picture's name.
 * @param {string} dataUrl - its data URI.
 * @param {import('./picture-files.js').PictureReference[]} references - the code's picture references.
 * @returns {string} the card's HTML.
 */
function formatPictureCard(name, dataUrl, references) {
    const used = references.filter(reference => isReferenceTo(reference.name, name)).length;
    const pixels = pictureSizes[name + '|' + dataUrl.length];
    return `<li class="picture-card" data-name="${escapeHtml(name)}">
                <button type="button" class="picture-preview" data-pic="${escapeHtml(name)}" title="Insert \\includegraphics{${escapeHtml(name)}} at the cursor">${isPdf(dataUrl) ? '<span class="picture-pdf">PDF</span>' : `<img alt="" src="${escapeHtml(dataUrl)}" data-dim="${escapeHtml(name + '|' + dataUrl.length)}">`}</button>
                <div class="picture-info"><code class="picture-title" title="${escapeHtml(name)}" data-no-i18n>${escapeHtml(name)}</code>
                    <small>${pixels ? pixels + ' · ' : ''}${formatSize(getDataUrlBytes(dataUrl).length)} · ${used ? `<button type="button" class="link-button" data-pic-show="${escapeHtml(name)}" title="Show where it is used">used ${used}×</button>` : 'not used yet'}</small></div>
                <div class="picture-actions">
                    <button type="button" class="button small" data-pic="${escapeHtml(name)}" title="\\includegraphics at the cursor">Insert</button>
                    <button type="button" class="button small" data-pic-fig="${escapeHtml(name)}" title="A figure with caption and label at the cursor">As figure</button>
                    <button type="button" class="button small" data-pic-ren="${escapeHtml(name)}" title="Rename - the code is changed along">Rename</button>
                    <button type="button" class="button small" data-pic-rep="${escapeHtml(name)}" title="Choose another file, keep the name">Replace</button>
                    <button type="button" class="button small" data-pic-dl="${escapeHtml(name)}" title="Download the picture">Download</button>
                    <button type="button" class="button small danger" data-pic-del="${escapeHtml(name)}" title="Remove the picture from this document">Remove</button>
                </div></li>`;
}

/**
 * Shows a picture's size in pixels on its card once it has loaded, and remembers it.
 * @param {HTMLImageElement} image - the picture's preview.
 * @returns {void}
 */
function showPictureSizeOnLoad(image) {
    const key = image.dataset.dim;
    if (pictureSizes[key]) return;
    image.addEventListener('load', () => {
        pictureSizes[key] = `${image.naturalWidth} × ${image.naturalHeight} px`;
        const small = image.closest('.picture-card')?.querySelector('small');
        if (small && !small.textContent.includes(' px')) small.insertAdjacentText('afterbegin', pictureSizes[key] + ' · ');
    }, { once: true });
}

/**
 * Runs a button of the Pictures tab (a click handler).
 * @param {MouseEvent} event - the click.
 * @returns {Promise<void>} settles when the action is done.
 */
async function handlePicturesClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const data = button.dataset;
    if (button.id === 'pic-add') { pictureInput.click(); return; }
    if (data.pic) { addGraphic(data.pic); return; }
    if (data.picFig) { addFigure(data.picFig); return; }
    if (data.picShow) { showPictureUse(data.picShow); return; }
    if (data.picRen) { startRename(button, data.picRen); return; }
    if (data.picRep || data.picFill) { openPictureChooserFor(data.picRep || data.picFill); return; }
    if (data.picDl) { saveFile(new Blob([getDataUrlBytes(state.assets[data.picDl])]), data.picDl); return; }
    if (data.picDel) await removePictureOnConfirm(data.picDel);
}

/**
 * Adds a figure with the picture, a caption and a label at the cursor, with the graphicx package.
 * @param {string} name - the picture's name.
 * @returns {void}
 */
function addFigure(name) {
    addSnippet(`\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.7\\textwidth]{${name}}\n  \\caption{|}\n  \\label{fig:${getNameStem(name).replace(/[^a-z0-9]+/g, '-')}}\n\\end{figure}\n`, true);
    addPackage('graphicx');
}

/**
 * Selects the first place where the code uses a picture.
 * @param {string} name - the picture's name.
 * @returns {void}
 */
function showPictureUse(name) {
    const reference = getPictureReferences().find(found => isReferenceTo(found.name, name));
    if (!reference) return;
    if (NARROW_SCREEN.matches) showPane('code');
    showCodePosition(reference.nameAt, true, reference.nameAt + reference.name.length);
}

/**
 * Puts a field for the new name in place of the picture's name; Enter or leaving it renames,
 * Escape cancels.
 * @param {HTMLElement} button - the Rename button of the card.
 * @param {string} name - the picture's name.
 * @returns {void}
 */
function startRename(button, name) {
    const title = button.closest('.picture-card').querySelector('.picture-title');
    const input = Object.assign(document.createElement('input'), { value: name, className: 'picture-rename', spellcheck: false });
    input.setAttribute('aria-label', 'New name');
    title.replaceWith(input);
    input.focus();
    input.setSelectionRange(0, name.replace(/\.[a-z0-9]+$/i, '').length);
    let done = false;
    /**
     * Ends the rename once: with keep and a name, the picture is renamed, else the tab is drawn again.
     * @param {boolean} keep - true to rename.
     * @returns {void}
     */
    const stopRename = keep => {
        if (done) return;
        done = true;
        if (keep && input.value.trim()) renamePicture(name, input.value); else renderPicturesTab();
    };
    input.addEventListener('keydown', keyEvent => {
        if (keyEvent.key === 'Enter') { keyEvent.preventDefault(); stopRename(true); }
        if (keyEvent.key === 'Escape') { keyEvent.preventDefault(); keyEvent.stopPropagation(); stopRename(false); }
    });
    input.addEventListener('blur', () => stopRename(true));
}

/**
 * Asks for one file to store under a picture's name (a replacement, or a missing picture).
 * @param {string} name - the name to store it under.
 * @returns {void}
 */
function openPictureChooserFor(name) {
    pictureInput.dataset.into = name;
    pictureInput.multiple = false;
    pictureInput.click();
}

/**
 * Removes a picture from the document after asking; places that use it show an empty frame.
 * @param {string} name - the picture's name.
 * @returns {Promise<void>} settles when it is removed or cancelled.
 */
async function removePictureOnConfirm(name) {
    if (!await openConfirmation({ title: `Remove "${name}"?`, text: 'The picture is removed from this document. Places that use it show an empty frame. "Undo" does not bring it back.', ok: 'Remove' })) return;
    const id = state.fileId;
    const left = await assets.remove(id, name);
    if (state.fileId !== id) return;
    state.assets = left;
    renderPicturesTab();
    renderPreview();
    areas.sync?.handleChange();
}

/**
 * Stores the chosen files: one under the name asked for, else each as a new picture (one alone
 * is inserted at the cursor) (a change handler).
 * @returns {Promise<void>} settles when they are stored.
 */
async function addChosenPictures() {
    const into = pictureInput.dataset.into;
    delete pictureInput.dataset.into;
    pictureInput.multiple = true;
    if (into && pictureInput.files[0]) await addPicture(pictureInput.files[0], false, into);
    else for (const file of pictureInput.files) await addPicture(file, pictureInput.files.length === 1);
    pictureInput.value = '';
}

/**
 * Connects the Pictures tab (its buttons keep the code's cursor) and creates its file input.
 * @returns {void}
 */
export function startPicturesTab() {
    ui.pictures.addEventListener('mousedown', event => { if (event.target.closest('[data-pic], [data-pic-fig]')) event.preventDefault(); });
    ui.pictures.addEventListener('click', handlePicturesClick);
    pictureInput = document.createElement('input');
    pictureInput.type = 'file';
    pictureInput.accept = PICTURE_ACCEPT;
    pictureInput.multiple = true;
    pictureInput.addEventListener('change', addChosenPictures);
}
