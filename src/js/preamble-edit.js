/**
 * Changes of the open document made by the document settings and the snippets: the code is
 * set as one undo step and the cursor stays on its text; packages and preamble lines are added
 * when they are missing.
 */

import { state, ui, showToast } from './state.js?v=2';
import { setCode } from './history.js?v=10';
import { NEVER, PACKAGE_LINES, getDocumentStart, setPreambleLine, hasPackage } from './preamble.js?v=7';

/**
 * Returns where two texts start to differ.
 * @param {string} first - one text.
 * @param {string} second - the other.
 * @returns {number} the index of the first different character (the shorter length when one starts the other).
 */
function getFirstDifference(first, second) {
    let index = 0;
    while (index < first.length && first[index] === second[index]) index++;
    return index;
}

/**
 * Sets changed code as one undo step; the cursor and selection move with the text after the
 * first change.
 * @param {string} code - the new code.
 * @param {string|false} message - a toast to show, false for none.
 * @returns {void}
 */
export function setCodeKeepingCursor(code, message) {
    if (code === state.code) return;
    const textarea = ui.ta, selectionStart = textarea.selectionStart, selectionEnd = textarea.selectionEnd;
    const changeAt = getFirstDifference(state.code, code);
    const delta = code.length - state.code.length;
    setCode(code);
    textarea.setSelectionRange(selectionStart > changeAt ? selectionStart + delta : selectionStart, selectionEnd > changeAt ? selectionEnd + delta : selectionEnd);
    if (message) showToast(message);
}

/**
 * Adds \usepackage{name} to the preamble unless it is loaded or there is no preamble.
 * @param {string} name - the package's name.
 * @returns {void}
 */
export function addPackage(name) {
    if (getDocumentStart(state.code) < 0 || hasPackage(name, state.code)) return;
    setCodeKeepingCursor(setPreambleLine(state.code, NEVER, `\\usepackage{${name}}`, PACKAGE_LINES), false);
}

/**
 * Adds a line to the preamble unless the code has it or there is no preamble.
 * @param {string} line - the line.
 * @returns {void}
 */
export function addPreambleLine(line) {
    if (getDocumentStart(state.code) < 0 || state.code.includes(line)) return;
    setCodeKeepingCursor(setPreambleLine(state.code, NEVER, line, PACKAGE_LINES), false);
}
