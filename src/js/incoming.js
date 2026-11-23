/**
 * Documents that arrive: from AI links and WebMCP tools (ai.js, mcp.js), and from the page
 * around the editor or ?src= (sync.js).
 *
 * A document from an AI goes to the document the link names: "new" makes a new document, a
 * name opens that document (or makes it when there is none), no name means the open one; with
 * mode "add" the text goes before \end{document}. A change of an existing document is one undo
 * step; the link says which document, so there is no question.
 *
 * A document from a page replaces the document of that name that came from the same page
 * before (one undo step), or becomes a new document; the user's own documents are never
 * replaced. A document a page hands over is kept in memory only, never stored.
 */

import { store } from './files.js?v=11';
import { assets } from './assets.js?v=6';
import { VIEWER } from './sync.js?v=24';
import { state, ui, showToast } from './state.js?v=2';
import { setCode } from './history.js?v=6';
import { renderPreview } from './preview.js?v=6';
import { openDocument, openNewDocument, createBlankDocument } from './documents.js?v=6';
import { renderInsertPanel } from './insert-panel.js?v=6';

const AI_DOCUMENT_NAME = 'AI document';
const END_DOCUMENT = '\\end{document}';

/**
 * Which document an AI's document is for.
 * @typedef {object} ReceiveTarget
 * @property {string} [file] - "new", the name of a document, or "" for the open one.
 * @property {string} [name] - the name of a new document.
 */

/**
 * A document from the page around the editor or from ?src= (sync.js's load).
 * @typedef {object} ExternalDocument
 * @property {string} name - its name.
 * @property {string} content - its code.
 * @property {Object<string, string>} [assets] - its pictures: name -> data URI.
 * @property {boolean} [replaceAssets] - true when the pictures are the whole set (what the page removed must not come back).
 * @property {string} [into] - the id of the document to replace (the page's document).
 * @property {boolean} [asNew] - true to always make a new document.
 * @property {string} [page] - the origin of the page.
 * @property {boolean} [temp] - true for a document kept in memory only.
 */

/**
 * Returns code with text added before \end{document} (or at the end when there is none).
 * @param {string} code - the code.
 * @param {string} text - the text to add.
 * @returns {string} the code with the text.
 */
function addBeforeDocumentEnd(code, text) {
    const at = code.lastIndexOf(END_DOCUMENT);
    return at < 0 ? code.replace(/\s*$/, '\n\n') + text.trim() + '\n' : code.slice(0, at).replace(/\s*$/, '\n\n') + text.trim() + '\n\n' + code.slice(at);
}

/**
 * Takes a document from an AI (link, pasted answer or WebMCP tool) into the document the target
 * names, and tells the user (not in the viewer).
 * @param {string} text - the LaTeX.
 * @param {string} mode - "add" to add it before \end{document}, else it replaces the code.
 * @param {ReceiveTarget} [target] - which document it is for.
 * @returns {Promise<void>} settles when the document is shown.
 */
export async function receiveDocument(text, mode, target = {}) {
    const wanted = String(target.file || '').trim();
    const isNew = wanted.toLowerCase() === 'new';
    const entry = isNew ? null : wanted ? store.findByName(wanted) : store.getEntry(state.fileId);
    if (!entry) {
        const name = isNew ? target.name || AI_DOCUMENT_NAME : wanted || AI_DOCUMENT_NAME;
        if (openNewDocument(name, mode === 'add' ? addBeforeDocumentEnd(createBlankDocument(), text) : text)) VIEWER || showToast(`New document "${state.name}" from the AI - your other documents are unchanged`);
        return;
    }
    if (entry.id !== state.fileId) openDocument(entry.id);
    setCode(mode === 'add' ? addBeforeDocumentEnd(state.code, text) : text);
    const errors = state.result.problems.filter(problem => problem.kind === 'error').length;
    VIEWER || showToast(errors ? `Document received - the preview found ${errors} ${errors === 1 ? 'problem' : 'problems'}, see above the code` : `"${state.name}" changed by the AI - "Undo" takes it back`);
}

/**
 * Takes a document from the page around the editor or from ?src= (see the header) and shows it
 * from the top.
 * @param {ExternalDocument} external - the document.
 * @returns {Promise<void>} settles when it is shown.
 */
export async function importExternalDocument({ name, content, assets: pictures, replaceAssets, into, asNew, page, temp }) {
    const entry = asNew ? null : (into && store.getEntry(into)) || store.list().find(stored => stored.name === name && stored.page && stored.page === page && !!stored.temp === !!temp);
    if (entry) await updateExternalDocument(entry, content, pictures, replaceAssets);
    else addExternalDocument(name, content, pictures, page, temp);
    ui.ta.setSelectionRange(0, 0);
    ui.ta.scrollTop = 0;
    ui.scroller.scrollTop = 0;
}

/**
 * Replaces a document that came from the page before with its new version (one undo step).
 * @param {object} entry - the document's entry in "My documents".
 * @param {string} entry.id - its id.
 * @param {string} content - the new code.
 * @param {Object<string, string>} [pictures] - its pictures.
 * @param {boolean} [replaceAssets] - true when the pictures are the whole set.
 * @returns {Promise<void>} settles when it is shown.
 */
async function updateExternalDocument(entry, content, pictures, replaceAssets) {
    if (replaceAssets) await assets.set(entry.id, { ...(pictures || {}) });
    else if (pictures && Object.keys(pictures).length) await assets.set(entry.id, { ...(await assets.get(entry.id)), ...pictures });
    if (entry.id !== state.fileId) openDocument(entry.id);
    state.assets = await assets.get(entry.id);
    renderInsertPanel();
    if (content !== state.code) setCode(content); else renderPreview();
}

/**
 * Makes a new document of a page's document, kept in memory when the page hands it over, and
 * remembers the page it came from.
 * @param {string} name - its name.
 * @param {string} content - its code.
 * @param {Object<string, string>} [pictures] - its pictures.
 * @param {string} [page] - the origin of the page.
 * @param {boolean} [temp] - true to keep it in memory only.
 * @returns {void}
 */
function addExternalDocument(name, content, pictures, page, temp) {
    const id = openNewDocument(name, content, pictures, !!temp);
    if (id && page) try { store.setEntryFields(id, { page }); } catch (e) { /* storage full: it just is not recognized next time */ }
    if (id && pictures) { state.assets = pictures; renderInsertPanel(); renderPreview(); }
}
