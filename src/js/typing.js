/**
 * Typing help in the code: Ctrl/Cmd shortcuts (Undo, Redo, bold, italic, underline, math, show
 * the place on the pages, comment lines), Tab and Shift+Tab indent, Enter keeps the indent and
 * closes environments and continues lists, brackets and $ around a selection, "{" after a
 * command gets its "}", and a typed "}" steps over the one that is there.
 */

import { state, ui } from './state.js?v=2';
import { undo, redo } from './history.js?v=9';
import { showCodeElement } from './preview.js?v=9';
import { setCodeRange, addCommandAroundSelection } from './code-insert.js?v=9';

/** The indent one Tab adds. */
const INDENT = '  ';
/** Commands put around the selection by Ctrl/Cmd and a key. */
const WRAP_KEYS = { b: 'textbf', i: 'textit', u: 'underline' };
/** Brackets and $ put around a selection. */
const PAIRS = { '{': '}', '[': ']', '(': ')', '$': '$' };
/** How far back a command name before "{" is looked for. */
const COMMAND_LOOK_BACK = 40;

/**
 * Returns a text with the characters of a regular expression escaped.
 * @param {string} text - the text.
 * @returns {string} the escaped text.
 */
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Handles a key typed in the code (a keydown handler): the shortcuts first, then Escape, Tab,
 * Enter and the pairs.
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function handleCodeKey(event) {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && runCtrlShortcut(event)) return;
    if (event.key === 'Escape') { ui.ta.blur(); return; }
    if (event.key === 'Tab') { event.preventDefault(); setLineIndent(event.shiftKey); return; }
    if (event.key === 'Enter' && !modifier && !event.isComposing) { event.preventDefault(); addLineBreak(); return; }
    addTypedPair(event);
}

/**
 * Runs a Ctrl/Cmd shortcut of the code. A command that returns whether it took place.
 * @param {KeyboardEvent} event - the key, with Ctrl or Cmd.
 * @returns {boolean} true when the key was a shortcut.
 */
function runCtrlShortcut(event) {
    const key = event.key;
    if (!event.altKey && (key === 'z' || key === 'Z')) { event.preventDefault(); event.shiftKey ? redo() : undo(); return true; }
    if (key === 'y') { event.preventDefault(); redo(); return true; }
    if (Object.hasOwn(WRAP_KEYS, key)) { event.preventDefault(); addCommandAroundSelection(WRAP_KEYS[key]); return true; }
    if (key === 'm') { event.preventDefault(); addInlineMath(); return true; }
    if (key === 'Enter') { event.preventDefault(); showCodeElement(true, true); return true; }
    if (key === '/') { event.preventDefault(); applyLineCommentSwitch(); return true; }
    return false;
}

/**
 * Puts $ around the selection.
 * @returns {void}
 */
function addInlineMath() {
    const start = ui.ta.selectionStart, end = ui.ta.selectionEnd;
    setCodeRange(start, end, '$' + state.code.slice(start, end) + '$', start + 1, end + 1);
}

/**
 * Tab without a selection adds two spaces; with a selection (or Shift) the selected lines are
 * indented or outdented.
 * @param {boolean} outdent - true for Shift+Tab.
 * @returns {void}
 */
function setLineIndent(outdent) {
    const value = ui.ta.value, start = ui.ta.selectionStart, end = ui.ta.selectionEnd;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    if (start === end && !outdent) { setCodeRange(start, end, INDENT); return; }
    const lineEnd = value.indexOf('\n', end - (end > start && value[end - 1] === '\n' ? 1 : 0));
    const blockEnd = lineEnd < 0 ? value.length : lineEnd;
    const lines = value.slice(lineStart, blockEnd).split('\n');
    const changed = lines.map(line => (outdent ? line.replace(/^ {1,2}|^\t/, '') : INDENT + line)).join('\n');
    setCodeRange(lineStart, blockEnd, changed, lineStart, lineStart + changed.length);
}

/**
 * Enter: after \begin{name} the line gets its \end{name} (unless the environment is closed
 * further down) and an indented line, lists start with \item; Enter on an empty \item ends the
 * list line; in a list a new line starts with \item; else the indent goes on.
 * @returns {void}
 */
function addLineBreak() {
    const value = ui.ta.value, start = ui.ta.selectionStart, end = ui.ta.selectionEnd;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const indent = /^[ \t]*/.exec(value.slice(lineStart))[0];
    const before = value.slice(lineStart, start);
    const begin = /\\begin\{([^}]+)\}(\[[^\]]*\])?(\{[^}]*\})*\s*$/.exec(before);
    if (begin && start === end) { addEnvironmentBody(begin[1], indent); return; }
    if (/^\s*\\item\s*$/.test(before) && start === end) { setCodeRange(lineStart, end, ''); return; }
    if (/^\s*\\item\b/.test(before)) { setCodeRange(start, end, '\n' + indent + '\\item '); return; }
    setCodeRange(start, end, '\n' + indent);
}

/**
 * Adds the indented first line of an environment after its \begin, with \item for lists, and
 * its \end unless the environment is closed further down (never for document).
 * @param {string} name - the environment's name.
 * @param {string} indent - the indent of the \begin line.
 * @returns {void}
 */
function addEnvironmentBody(name, indent) {
    const value = ui.ta.value, start = ui.ta.selectionStart, end = ui.ta.selectionEnd;
    const rest = value.slice(start);
    const opens = (rest.match(new RegExp('\\\\begin\\{' + escapeRegExp(name) + '\\}', 'g')) || []).length;
    const closes = (rest.match(new RegExp('\\\\end\\{' + escapeRegExp(name) + '\\}', 'g')) || []).length;
    const inner = indent + INDENT;
    const first = /^(itemize|enumerate|description)$/.test(name) ? '\\item ' : '';
    if (closes <= opens && name !== 'document') {
        setCodeRange(start, end, '\n' + inner + first + '\n' + indent + `\\end{${name}}`, start + 1 + inner.length + first.length);
        return;
    }
    setCodeRange(start, end, '\n' + inner + first);
}

/**
 * Brackets and $ go around a selection; "{" right after a command name gets its "}" at once;
 * a "}" typed before a closing brace that is there already steps over it.
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function addTypedPair(event) {
    const value = ui.ta.value, start = ui.ta.selectionStart, end = ui.ta.selectionEnd;
    if (PAIRS[event.key] && start !== end && !event.isComposing) {
        event.preventDefault();
        setCodeRange(start, end, event.key + value.slice(start, end) + PAIRS[event.key], start + 1, end + 1);
        return;
    }
    if (event.key === '{' && start === end && /\\[A-Za-z]+\*?$/.test(value.slice(Math.max(0, start - COMMAND_LOOK_BACK), start)) && !/^\S/.test(value.slice(start, start + 1))) {
        event.preventDefault();
        setCodeRange(start, end, '{}', start + 1);
        return;
    }
    if (event.key === '}' && start === end && value[start] === '}' && value[start - 1] !== '\\') {
        const before = value.slice(0, start);
        const opened = (before.match(/(?<!\\)\{/g) || []).length, closed = (before.match(/(?<!\\)\}/g) || []).length;
        if (opened > closed) { event.preventDefault(); ui.ta.setSelectionRange(start + 1, start + 1); }
    }
}

/**
 * Comments the selected lines out with "% ", or in again when all of them are comments.
 * @returns {void}
 */
function applyLineCommentSwitch() {
    const value = ui.ta.value, start = ui.ta.selectionStart, end = ui.ta.selectionEnd;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lastLineEnd = value.indexOf('\n', end - (end > start && value[end - 1] === '\n' ? 1 : 0));
    const lineEnd = lastLineEnd < 0 ? value.length : lastLineEnd;
    const lines = value.slice(lineStart, lineEnd).split('\n');
    const allComments = lines.every(line => !line.trim() || /^\s*%/.test(line));
    const changed = lines.map(line => (!line.trim() ? line : allComments ? line.replace(/^(\s*)% ?/, '$1') : line.replace(/^(\s*)/, '$1% '))).join('\n');
    setCodeRange(lineStart, lineEnd, changed, lineStart, lineStart + changed.length);
}

/**
 * Connects the typing help to the code.
 * @returns {void}
 */
export function startTyping() {
    ui.ta.addEventListener('keydown', handleCodeKey);
}
