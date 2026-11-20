/**
 * Clicks on the pages and editing text in place.
 *
 * Plain text from the code comes as <span class="t" data-s="offset">, one character on the
 * page per character in the code. A click on other parts of the pages puts the code's cursor
 * at their place. A click on such a run makes it editable:
 *   1. check that the run still matches the code;
 *   2. make it editable, with the cursor where the click was (or the selection made on it);
 *   3. put the code's cursor on the same character, frame the place and show a clear cursor.
 * Enter or a click elsewhere writes the change into the code as one undo step (special
 * characters escaped, line breaks as text-breaks.js writes them), Escape cancels.
 */

import { state, ui, NARROW_SCREEN, showToast } from './state.js?v=2';
import { setCode, addTypingStep } from './history.js?v=3';
import { showCodePosition } from './code-view.js?v=3';
import { showCodeElement } from './preview.js?v=3';
import { showPane } from './layout.js?v=3';
import { getRangeAtPoint, getCaretOffset, findRunAt } from './preview-caret.js?v=2';
import { formatAsTex, isRunInCode, formatBreaks, getBreakRefusal, isInHeading, formatAfterHeading } from './text-breaks.js?v=2';

const EDIT_HINT = 'Editing on the page - Enter: new paragraph, Shift+Enter: new line, Ctrl+Enter or a click elsewhere keeps it, Escape cancels';
/** The cursor drawn for the edited text: the browser's own is a hairline on zoomed out pages. */
let editCaret = null;
let hintShown = false;

/**
 * Makes a run of the pages editable (the steps in the header); nothing happens while another
 * run is edited, and a run that does not match the code is refused with a message.
 * @param {HTMLElement} span - the run.
 * @param {number} x - the pointer's x.
 * @param {number} y - the pointer's y.
 * @returns {void}
 */
export function startTextEdit(span, x, y) {
    if (state.textEdit && state.textEdit.span.isConnected) return;
    state.textEdit = null;
    const at = +span.dataset.s, before = span.textContent;
    if (!isRunInCode(before, at)) { showToast('This text changed in the code - wait for the preview, then try again'); return; }
    const range = getClickRange(span, x, y);
    enableTextEditing(span);
    state.textEdit = { span, at, before };
    span.focus({ preventScroll: true });
    setEditCursor(span, range);
    showCodePosition(at + getCaretOffset(span), false);
    showCodeElement(false, true);
    showEditCaret();
    if (!hintShown) { hintShown = true; showToast(EDIT_HINT); }
}

/**
 * Returns where the cursor goes in the run: the selection made on it, else the place under
 * the pointer.
 * @param {HTMLElement} span - the run.
 * @param {number} x - the pointer's x.
 * @param {number} y - the pointer's y.
 * @returns {Range|null} the range, null when there is no place.
 */
function getClickRange(span, x, y) {
    const selection = getSelection();
    const selected = selection.rangeCount && !selection.isCollapsed && span.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
    return selected || getRangeAtPoint(x, y, span);
}

/**
 * Makes a run editable as plain text, with spell checking; Enter and Shift+Enter show as typed.
 * @param {HTMLElement} span - the run.
 * @returns {void}
 */
function enableTextEditing(span) {
    span.contentEditable = 'plaintext-only';
    if (span.contentEditable !== 'plaintext-only') span.contentEditable = 'true';
    span.spellcheck = true;
    span.classList.add('edit');
    span.style.whiteSpace = 'pre-wrap';
}

/**
 * Puts the cursor (or selection) into the run, at its start when the range is outside it.
 * @param {HTMLElement} span - the run.
 * @param {Range|null} range - the wanted place.
 * @returns {void}
 */
function setEditCursor(span, range) {
    const selection = getSelection();
    let cursor = range;
    if (!range || !span.contains(range.startContainer)) {
        cursor = document.createRange();
        cursor.setStart(span.firstChild || span, 0);
    }
    selection.removeAllRanges();
    selection.addRange(cursor);
}

/**
 * Draws a clearly visible cursor at the place of the collapsed selection in the edited run;
 * hidden for a selection or when there is no box. It stays on while typing and blinks when idle.
 * @returns {void}
 */
function showEditCaret() {
    const selection = getSelection();
    const span = state.textEdit?.span;
    let rect = null;
    if (span && selection.rangeCount && selection.isCollapsed && span.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        rect = range.getClientRects()[0] || range.getBoundingClientRect();
        if (rect && !rect.height) rect = null;
    }
    span?.classList.toggle('custom-cursor', !!rect);
    editCaret.hidden = !rect;
    if (!rect) return;
    editCaret.style.left = (rect.left - 1) + 'px';
    editCaret.style.top = (rect.top - 1) + 'px';
    editCaret.style.height = (rect.height + 2) + 'px';
    editCaret.style.animation = 'none';
    void editCaret.offsetWidth;
    editCaret.style.animation = '';
}

/**
 * Ends the edit of a run: with keep, the changed part goes into the code as one undo step;
 * without, or when nothing changed, the run gets its text back.
 * @param {boolean} keep - true to write the change into the code, false to cancel.
 * @returns {void}
 */
export function stopTextEdit(keep) {
    const edit = state.textEdit;
    if (!edit) return;
    state.textEdit = null;
    const { span, at, before } = edit;
    const edited = span.textContent.replace(/\u00a0/g, ' ');
    disableTextEditing(span);
    if (!keep || edited === before) { span.textContent = before; return; }
    if (!isRunInCode(before, at)) { span.textContent = before; showToast('The code changed meanwhile - the edit was not used'); return; }
    const change = getTextChange(at, before, edited);
    if (isInHeading(span) && change.text.includes('\n')) writeHeadingEdit(span, before, change);
    else writeTextEdit(span, before, edited, change);
}

/**
 * Makes an edited run plain text of the pages again and hides the drawn cursor.
 * @param {HTMLElement} span - the run.
 * @returns {void}
 */
function disableTextEditing(span) {
    span.removeAttribute('contenteditable');
    span.classList.remove('edit', 'custom-cursor');
    span.style.whiteSpace = '';
    editCaret.hidden = true;
}

/**
 * The part of a run that an edit changed.
 * @typedef {object} TextChange
 * @property {number} from - where the changed part starts in the code.
 * @property {number} to - where it ends in the code.
 * @property {string} text - the typed text in its place.
 * @property {boolean} atStart - true when the change starts at the start of the run.
 * @property {string} rest - the run's text after the change.
 */

/**
 * Returns the changed part of a run: the text between the common start and the common end of
 * the old and the new text.
 * @param {number} at - where the run starts in the code.
 * @param {string} before - the run's text before the edit.
 * @param {string} edited - its text after the edit.
 * @returns {TextChange} the change.
 */
function getTextChange(at, before, edited) {
    let start = 0, end = 0;
    while (start < before.length && start < edited.length && before[start] === edited[start]) start++;
    while (end < before.length - start && end < edited.length - start && before[before.length - 1 - end] === edited[edited.length - 1 - end]) end++;
    return { from: at + start, to: at + before.length - end, text: edited.slice(start, edited.length - end), atStart: start === 0, rest: edited.slice(edited.length - end) };
}

/**
 * Writes Enter at the end of a heading: the title as typed, the paragraphs typed after it
 * below the heading's line; text right below the heading stays a paragraph of its own.
 * @param {HTMLElement} span - the run.
 * @param {string} before - the run's text before the edit.
 * @param {TextChange} change - the change.
 * @returns {void}
 */
function writeHeadingEdit(span, before, change) {
    const { from, to, text } = change;
    const breakAt = text.indexOf('\n'), tail = formatAfterHeading(text.slice(breakAt));
    let lineEnd = state.code.indexOf('\n', to);
    if (lineEnd < 0) lineEnd = state.code.length;
    const title = formatAsTex(text.slice(0, breakAt));
    if (!title && !tail && from === to) { span.textContent = before; return; }
    addTypingStep();
    const paragraphs = tail ? '\n\n' + tail + (/^\n[ \t]*\S/.test(state.code.slice(lineEnd)) ? '\n' : '') : '';
    setCode(state.code.slice(0, from) + title + state.code.slice(to, lineEnd) + paragraphs + state.code.slice(lineEnd));
    const cursor = from + title.length + (lineEnd - to) + (tail ? 2 + tail.length : 0);
    ui.ta.setSelectionRange(cursor, cursor);
    showCodePosition(cursor, false);
}

/**
 * Writes the changed part of a run into the code with its line breaks; a new paragraph or line
 * starts without the space that stood at the split. Only empty paragraphs change nothing.
 * @param {HTMLElement} span - the run.
 * @param {string} before - the run's text before the edit.
 * @param {string} edited - its text after the edit.
 * @param {TextChange} change - the change.
 * @returns {void}
 */
function writeTextEdit(span, before, edited, change) {
    const { from, to } = change;
    const inserted = formatBreaks(span, change.text, from, change.atStart, change.rest);
    if (inserted === '' && from === to) { span.textContent = before; return; }
    let end = to;
    if (/\n[ \t]*(?:\\item )?$/.test(inserted)) while (state.code[end] === ' ' || state.code[end] === '\t') end++;
    addTypingStep();
    setCode(state.code.slice(0, from) + inserted + state.code.slice(end));
    ui.ta.setSelectionRange(from + inserted.length, from + inserted.length);
    showCodePosition(from + inserted.length, false);
}

/**
 * Leads a click on the pages to the place in the code; a click on text being edited or
 * editable, and the end of a text selection, are left alone (a click handler).
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function showClickedPlace(event) {
    if (event.target.closest('[contenteditable], .t[data-s]') || state.textEdit?.span.isConnected) return;
    const selection = getSelection();
    if (selection && !selection.isCollapsed && ui.pages.contains(selection.anchorNode)) return;
    const element = event.target.closest('[data-p]');
    if (!element) return;
    if (NARROW_SCREEN.matches) showPane('code');
    showCodePosition(+element.dataset.p);
    showCodeElement(false, true);
}

/**
 * Starts editing the run under the pointer (a pointerup handler: when a click ends the edit of
 * another run, the pages are drawn anew and the run under the pointer is a new element).
 * @param {PointerEvent} event - the release of the pointer.
 * @returns {void}
 */
function startEditAtPointer(event) {
    if (event.button !== 0) return;
    const selection = getSelection();
    if (selection && !selection.isCollapsed && ui.pages.contains(selection.anchorNode) && !state.textEdit) return;
    const span = findRunAt(event.clientX, event.clientY);
    if (span && !span.isContentEditable && ui.pages.contains(span)) startTextEdit(span, event.clientX, event.clientY);
}

/**
 * Handles the keys of an edit: Ctrl/Cmd+Enter keeps it, Enter a new paragraph and Shift+Enter
 * a new line (in the text at once, in the code when the edit ends), Escape cancels (a keydown handler).
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function handleEditKey(event) {
    const edit = state.textEdit;
    if (!edit || event.target !== edit.span) return;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); stopTextEdit(true); }
    else if (event.key === 'Enter') {
        event.preventDefault();
        const refusal = getBreakRefusal(edit.span, !event.shiftKey);
        if (refusal) { showToast(refusal); return; }
        document.execCommand('insertText', false, event.shiftKey ? '\n' : '\n\n');
        showEditCaret();
    }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stopTextEdit(false); }
}

/**
 * Leads clicks on the pages to the code.
 * @returns {void}
 */
export function startPageClicks() {
    ui.pages.addEventListener('click', showClickedPlace);
}

/**
 * Creates the drawn cursor and connects editing on the pages: the cursor follows the
 * selection and the scroll, a release starts an edit, keys and leaving the run end it.
 * @returns {void}
 */
export function startTextEditing() {
    editCaret = document.createElement('div');
    editCaret.className = 'pages-cursor';
    editCaret.hidden = true;
    document.body.append(editCaret);
    document.addEventListener('selectionchange', () => { if (state.textEdit) showEditCaret(); });
    ui.scroller.addEventListener('scroll', () => { if (state.textEdit) showEditCaret(); }, { passive: true });
    ui.pages.addEventListener('pointerup', startEditAtPointer);
    ui.pages.addEventListener('keydown', handleEditKey);
    ui.pages.addEventListener('focusout', event => { if (state.textEdit && event.target === state.textEdit.span) stopTextEdit(true); });
}
