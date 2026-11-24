/**
 * Changes made at the code's cursor by the toolbar, the Insert tab and the keyboard: a range
 * replaced the way typing does it (the browser's own undo keeps it), a command around the
 * selection, and snippets at the cursor.
 */

import { state, ui } from './state.js?v=2';
import { addHistoryStep } from './history.js?v=8';
import { showCodeElement } from './preview.js?v=8';

const END_DOCUMENT = '\\end{document}';

/**
 * Replaces a range of the code as if it were typed, and selects a range after it.
 * execCommand keeps the edit in the browser's own undo and for assistive technology; where it
 * is missing the text is set directly and an input event follows.
 * @param {number} start - where the range starts.
 * @param {number} end - where it ends.
 * @param {string} text - the new text.
 * @param {number} [selectionStart] - where the cursor or selection starts afterwards.
 * @param {number} [selectionEnd] - where the selection ends afterwards.
 * @returns {void}
 */
export function setCodeRange(start, end, text, selectionStart, selectionEnd) {
    const textarea = ui.ta;
    if (document.activeElement !== textarea) textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(start, end);
    if (!document.execCommand || !document.execCommand('insertText', false, text)) {
        textarea.setRangeText(text, start, end, 'end');
        textarea.dispatchEvent(new Event('input'));
    }
    if (selectionStart != null) textarea.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
}

/**
 * Puts a command around the selection (\textbf{selection}); without a selection the cursor
 * lands between the braces. One undo step.
 * @param {string} command - the command's name without the backslash.
 * @returns {void}
 */
export function addCommandAroundSelection(command) {
    const start = ui.ta.selectionStart, end = ui.ta.selectionEnd;
    const selected = state.code.slice(start, end);
    const open = `\\${command}{`;
    setCodeRange(start, end, open + selected + '}', start + open.length, start + open.length + selected.length);
    addHistoryStep();
}

/**
 * Adds a snippet at the cursor; without a cursor in the code, before \end{document}. "|" marks
 * where the cursor goes, "§" stands for the selected text. A block snippet starts and ends
 * on a line of its own, indented as the line it goes into. One undo step.
 * @param {string} snippet - the snippet.
 * @param {boolean} [block] - true for a block snippet.
 * @returns {void}
 */
export function addSnippet(snippet, block = false) {
    const textarea = ui.ta;
    let start = textarea.selectionStart, end = textarea.selectionEnd;
    if (document.activeElement !== textarea && start === 0 && end === 0) {
        const documentEnd = state.code.lastIndexOf(END_DOCUMENT);
        if (documentEnd >= 0) start = end = documentEnd;
    }
    let text = snippet.replace('§', state.code.slice(start, end) || '');
    if (block) text = formatOwnLines(text, start, end);
    let cursor = text.indexOf('|');
    text = text.replace('|', '');
    if (cursor < 0) cursor = text.length;
    setCodeRange(start, end, text, start + cursor);
    addHistoryStep();
    showCodeElement();
}

/**
 * Returns a block snippet indented as the line it goes into, on a new line when text stands
 * before it and with a line break when text follows it.
 * @param {string} text - the snippet.
 * @param {number} start - where it goes.
 * @param {number} end - the end of the range it replaces.
 * @returns {string} the snippet to add.
 */
function formatOwnLines(text, start, end) {
    const lineStart = state.code.lastIndexOf('\n', start - 1) + 1;
    const indent = /^[ \t]*/.exec(state.code.slice(lineStart))[0];
    let placed = text.split('\n').map((line, i) => (i ? indent + line : line)).join('\n');
    if (state.code.slice(lineStart, start).trim()) placed = '\n' + indent + placed;
    const lineEnd = state.code.indexOf('\n', end);
    if (state.code.slice(end, lineEnd < 0 ? state.code.length : lineEnd).trim()) placed += '\n' + indent;
    return placed;
}
