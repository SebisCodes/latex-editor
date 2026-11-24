/**
 * What the AI Assistant (ai.js) and AI agents in the browser (mcp.js) get from the editor: the
 * open document for the prompt, its problems and sections with their lines, the documents of
 * "My documents", and the changes an agent may make. Every change goes through setCode(), so
 * each one is an undo step.
 */

import { store } from './files.js?v=11';
import { state, ui, areas } from './state.js?v=2';
import { setCode } from './history.js?v=9';
import { getLineIndex, getLineStartPlace, showCodePosition } from './code-view.js?v=9';
import { showCodeElement } from './preview.js?v=9';
import { openDocument, openNewDocument, createBlankDocument } from './documents.js?v=9';
import { getCodeResult } from './preview-views.js?v=3';

const AI_DOCUMENT_NAME = 'AI document';
const END_DOCUMENT = '\\end{document}';

/**
 * Returns the open document as the AI prompt and the agent see it.
 * @returns {import('./ai-prompt.js').PromptState} the code, name, documents, pictures, selection, problems and the page's context.
 */
export function getPromptState() {
    return {
        code: state.code, name: state.name, files: store.getSortedEntries().map(entry => entry.name), pictures: Object.keys(state.assets),
        sel: state.code.slice(ui.ta.selectionStart, ui.ta.selectionEnd),
        problems: (state.result?.problems || []).map(problem => `line ${getLineIndex(problem.pos) + 1}: ${problem.msg}`),
        context: areas.sync?.getContext() || null,
    };
}

/**
 * Returns the problems with their line, for an agent.
 * @returns {Array<object>} the problems with their place, kind, message and 1-based line.
 */
export function getProblemList() {
    return (state.result?.problems || []).map(problem => ({ ...problem, line: getLineIndex(problem.pos) + 1 }));
}

/**
 * Returns the sections with their line, for an agent.
 * @returns {Array<object>} the outline entries with their 1-based line.
 */
export function getSectionList() {
    return (getCodeResult()?.outline || []).map(section => ({ ...section, line: getLineIndex(section.pos) + 1 }));
}

/**
 * Returns the documents of "My documents", the most recent first.
 * @returns {Array<{name: string, updated: number, open: boolean}>} name, last change and whether it is open.
 */
export function getFileList() {
    return store.getSortedEntries().map(entry => ({ name: entry.name, updated: entry.updated, open: entry.id === state.fileId }));
}

/**
 * Opens a document of "My documents" by name. A command that returns whether it took place.
 * @param {string} name - the document's name.
 * @returns {boolean} true when there is such a document.
 */
export function openFileByName(name) {
    const entry = store.findByName(name);
    if (entry && entry.id !== state.fileId) openDocument(entry.id);
    return !!entry;
}

/**
 * Makes and opens a new document. A command that creates an item and returns its name, null when it could not.
 * @param {string} [name] - the wanted name.
 * @param {string} [code] - the code; a short empty article without it.
 * @returns {string|null} the document's name, null when the browser storage is full.
 */
export function createFile(name, code) {
    return openNewDocument(name || AI_DOCUMENT_NAME, code || createBlankDocument()) && state.name;
}

/**
 * Returns where an agent's text goes: the cursor, before \end{document} (or the end), or the
 * line after a section's heading.
 * @param {string} where - "cursor", "end" or a section's title.
 * @returns {number} the place, -1 when there is no such section.
 */
function getInsertPlace(where) {
    if (where === 'cursor') return ui.ta.selectionStart;
    if (where === 'end') {
        const documentEnd = state.code.lastIndexOf(END_DOCUMENT);
        return documentEnd < 0 ? state.code.length : documentEnd;
    }
    const section = (getCodeResult()?.outline || []).find(entry => entry.title.trim().toLowerCase() === where.trim().toLowerCase());
    if (!section) return -1;
    const lineEnd = state.code.indexOf('\n', section.pos);
    return lineEnd < 0 ? state.code.length : lineEnd + 1;
}

/**
 * Inserts LaTeX for an agent, ending with a line break. A command that returns whether it took
 * place.
 * @param {string} text - the LaTeX.
 * @param {string} where - "cursor", "end" or a section's title.
 * @returns {boolean} false when there is no such section.
 */
export function addLatex(text, where) {
    const at = getInsertPlace(where);
    if (at < 0) return false;
    setCode(state.code.slice(0, at) + text.replace(/\s*$/, '\n') + state.code.slice(at));
    return true;
}

/**
 * Replaces text in the code for an agent. It does the work of the WebMCP tool replace_text and
 * returns the count the tool's answer reports: the number of replacements, 0
 * when none.
 * @param {string} find - the text to find.
 * @param {string} replacement - the new text.
 * @param {boolean} all - true for every place, else the first.
 * @returns {number} how many places were replaced.
 */
export function updateText(find, replacement, all) {
    if (!find) return 0;
    const count = state.code.split(find).length - 1;
    if (!count) return 0;
    setCode(all ? state.code.split(find).join(replacement) : state.code.replace(find, () => replacement));
    return all ? count : 1;
}

/**
 * Shows a line of the code to the user, framed on the pages.
 * @param {number} line - the line number, 1-based.
 * @returns {void}
 */
export function showLine(line) {
    showCodePosition(getLineStartPlace(line));
    showCodeElement(true, true);
}
