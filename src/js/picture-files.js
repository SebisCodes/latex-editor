/**
 * The pictures of the open document: where the code uses them, adding one (as a new picture,
 * in place of one, or under the name the code asks for) and renaming one with its references
 * in the code (one undo step). A picture is stored with the document it was added to, also
 * when another document was opened meanwhile.
 */

import { store } from './files.js?v=11';
import { assets, getFreeName, readAsDataUrl } from './assets.js?v=6';
import { state, areas, showToast } from './state.js?v=2';
import { setCode } from './history.js?v=3';
import { renderPreview } from './preview.js?v=3';
import { addSnippet } from './code-insert.js?v=3';
import { addPackage } from './preamble-edit.js?v=3';
import { renderInsertPanel } from './insert-panel.js?v=3';
import { renderPicturesTab } from './pictures-tab.js?v=3';

/** The largest picture a document keeps, in bytes. */
const MAX_PICTURE_SIZE = 12 * 1024 * 1024;
/** The kinds of files a document keeps as pictures. */
const PICTURE_TYPES = /^(image\/(png|jpeg|gif|webp|svg\+xml)|application\/pdf)$/;
/** An \includegraphics with its name. */
const GRAPHIC_REFERENCE = /\\includegraphics\s*\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]*)\}/g;

/**
 * A place where the code asks for a picture.
 * @typedef {object} PictureReference
 * @property {string} name - the name in the code, trimmed.
 * @property {number} at - where the \includegraphics starts.
 * @property {number} nameAt - where the name starts.
 */

/**
 * Returns a picture's name without folder and extension, in lower case.
 * @param {string} name - the name.
 * @returns {string} the stem.
 */
export function getNameStem(name) {
    return name.toLowerCase().replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
}

/**
 * Returns the pictures the code asks for (\includegraphics[…]{name}, not in comments), with their places.
 * @returns {PictureReference[]} the references in code order.
 */
export function getPictureReferences() {
    const references = [];
    const pattern = new RegExp(GRAPHIC_REFERENCE.source, 'g');
    const code = state.code.replace(/(^|[^\\])%[^\n]*/g, (comment, before) => before + ' '.repeat(comment.length - before.length));
    let match;
    while ((match = pattern.exec(code))) references.push({ name: match[1].trim(), at: match.index, nameAt: match.index + match[0].length - 1 - match[1].length });
    return references;
}

/**
 * Tells whether a reference in the code means a picture, as the preview finds it: with or
 * without extension, without "./", in any case.
 * @param {string} reference - the name in the code.
 * @param {string} name - the picture's name.
 * @returns {boolean} true when it means the picture.
 */
export function isReferenceTo(reference, name) {
    return reference.replace(/^\.\//, '').toLowerCase() === name.toLowerCase() || getNameStem(reference) === getNameStem(name);
}

/**
 * Returns the name a picture gets when renamed: the wanted name in lower case, with the old
 * extension when the wanted name has none, made free among the other pictures.
 * @param {string} oldName - the picture's name.
 * @param {string} wanted - the name typed.
 * @returns {string} the new name.
 */
function getRenamedName(oldName, wanted) {
    const others = { ...state.assets };
    delete others[oldName];
    const typed = wanted.trim().toLowerCase();
    if (/\.[a-z0-9]+$/i.test(wanted.trim())) return getFreeName(others, typed);
    return getFreeName(others, typed + (/(\.[a-z0-9]+)$/i.exec(oldName) || ['', ''])[1]);
}

/**
 * Renames a picture; the code's references follow as one undo step, and Undo / Redo rename
 * the picture back and forth with the code. When another document was opened meanwhile, only
 * the document the rename started on changes.
 * @param {string} oldName - the picture's name.
 * @param {string} wanted - the name typed.
 * @returns {Promise<void>} settles when the picture is stored under its new name.
 */
export async function renamePicture(oldName, wanted) {
    const name = getRenamedName(oldName, wanted);
    if (name === oldName) { renderPicturesTab(); return; }
    const pictures = {};
    for (const [key, dataUrl] of Object.entries(state.assets)) pictures[key === oldName ? name : key] = dataUrl;
    const id = state.fileId, start = state.code;
    const code = getCodeWithRenamedReferences(start, oldName, name);
    await assets.set(id, pictures);
    if (state.fileId !== id) {
        if (code !== start) try { store.save(id, { code }); } catch (e) { /* storage full: the references keep the old name */ }
        return;
    }
    state.assets = pictures;
    if (code !== state.code) {
        setCode(code);
        state.history[state.history.length - 1].rename = [oldName, name];
    } else renderPreview();
    renderPicturesTab();
    areas.sync?.handleChange();
    showToast(`"${oldName}" is now "${name}"`);
}

/**
 * Returns code with the references to a picture renamed.
 * @param {string} code - the code (the open document's, whose references were found).
 * @param {string} oldName - the picture's name.
 * @param {string} name - its new name.
 * @returns {string} the changed code.
 */
function getCodeWithRenamedReferences(code, oldName, name) {
    let changed = code;
    for (const reference of getPictureReferences().filter(found => isReferenceTo(found.name, oldName)).reverse()) {
        changed = changed.slice(0, reference.nameAt) + name + changed.slice(reference.nameAt + reference.name.length);
    }
    return changed;
}

/**
 * Stores a picture with the document that is open when it is added. A command that adds an
 * item and returns its name: the name it was stored under, null when it was refused.
 * @param {File} file - the picture.
 * @param {boolean} insert - true to add \includegraphics at the cursor.
 * @param {string} [storeAs] - the name to store it under (replacing that picture, or one the code asks for).
 * @returns {Promise<string|null>} the name, null when the file is no picture or too large.
 */
export async function addPicture(file, insert, storeAs) {
    const id = state.fileId;
    if (!PICTURE_TYPES.test(file.type)) { showToast('Pictures can be PNG, JPG, GIF, WebP, SVG or PDF'); return null; }
    if (file.size > MAX_PICTURE_SIZE) { showToast('The picture is larger than 12 MB'); return null; }
    const dataUrl = await readAsDataUrl(file);
    const known = state.fileId === id ? state.assets : assets.getCached(id);
    const name = storeAs || getFreeName(known, (file.name || 'picture.png').toLowerCase());
    const pictures = await assets.add(id, name, dataUrl);
    if (state.fileId !== id) return name;
    state.assets = pictures;
    renderInsertPanel();
    renderPicturesTab();
    if (insert) addGraphic(name);
    renderPreview();
    showToast(storeAs ? `"${name}" now shows the new picture` : `Picture "${name}" added to "${state.name}"`);
    areas.sync?.handleChange();
    return name;
}

/**
 * Adds \includegraphics of a picture at the cursor, with the graphicx package.
 * @param {string} name - the picture's name.
 * @returns {void}
 */
export function addGraphic(name) {
    addSnippet(`\\includegraphics[width=0.5\\textwidth]{${name}}|`, false);
    addPackage('graphicx');
}
