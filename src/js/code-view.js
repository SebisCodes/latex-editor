/**
 * The code view: a textarea with the highlighted code, the lines with problems and the band of
 * the cursor's line in layers behind it, and the line numbers beside it (wrap.js draws them for
 * wrapped lines).
 *
 * Typing redraws the code at once; the pages follow a little later, the undo step when typing
 * pauses, and the document is stored shortly after. The element of the pages at the code's
 * cursor is framed while the code has the focus.
 */

import { escapeHtml } from './latex.js?v=17';
import { highlight } from './latex-highlight.js?v=5';
import { state, ui, areas, NARROW_SCREEN, LINE_HEIGHT, getProblems } from './state.js?v=2';
import { updateHistoryButtons, addHistoryStep } from './history.js?v=6';
import { startPreviewTimer, showCodeElement, RENDER_DELAY } from './preview.js?v=6';
import { startSaveTimer } from './storage.js?v=6';

/** Code longer than this is shown without highlighting. */
const MAX_HIGHLIGHT_LENGTH = 600000;
/** Code longer than this waits longer before the pages follow. */
const LONG_CODE = 60000;
/** How long the pages of long code wait after typing, in milliseconds. */
const LONG_RENDER_DELAY = 600;
/** How long typing pauses before it becomes an undo step, in milliseconds. */
const HISTORY_DELAY = 600;
/** The padding above the first line, in pixels. */
const CODE_PADDING_TOP = 10;
const KILOBYTE = 1024;
/** Pixels kept free right of the cursor when the code scrolls sideways to it. */
const SCROLL_MARGIN_RIGHT = 60;
/** Pixels shown left of the cursor after the code scrolled sideways to it. */
const SCROLL_MARGIN_LEFT = 40;
/** How many characters are measured for the character width. */
const MEASURED_CHARACTERS = 100;
let lineBand = null;
let characterWidth = 0;

/**
 * Draws the highlighted code, the problem marks, the line numbers, the status (lines, size and
 * pages) and the state of Undo and Redo.
 * @returns {void}
 */
export function renderCode() {
    const code = state.code;
    ui.hl.innerHTML = code.length < MAX_HIGHLIGHT_LENGTH ? highlight(code) + '\n' : escapeHtml(code) + '\n';
    renderProblemMarks();
    const lines = code.split('\n').length;
    areas.lineWrap.update(code);
    const bytes = new Blob([code]).size;
    const pages = state.pages.length;
    ui.status.textContent = `${lines} lines · ${bytes < KILOBYTE ? bytes + ' B' : (bytes / KILOBYTE).toFixed(1) + ' KB'}${pages ? ` · ${pages} ${pages === 1 ? 'page' : 'pages'}` : ''}`;
    updateHistoryButtons();
}

/**
 * Draws a colored background behind each line with a problem.
 * @returns {void}
 */
function renderProblemMarks() {
    const code = state.code;
    const ranges = [];
    const seen = new Set();
    for (const problem of getProblems()) {
        const lineStart = code.lastIndexOf('\n', problem.pos - 1) + 1;
        if (seen.has(lineStart)) continue;
        seen.add(lineStart);
        let lineEnd = code.indexOf('\n', lineStart);
        if (lineEnd < 0) lineEnd = code.length;
        ranges.push([lineStart, Math.max(lineEnd, lineStart + 1), problem.kind === 'error' ? 'err' : 'warn']);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let html = '', last = 0;
    for (const [start, end, className] of ranges) {
        if (start < last) continue;
        html += escapeHtml(code.slice(last, start)) + `<mark class="${className}">` + escapeHtml(code.slice(start, end) || ' ') + '</mark>';
        last = end;
    }
    ui.marks.innerHTML = html + escapeHtml(code.slice(last)) + '\n';
}

/**
 * Moves the layers and the line numbers with the textarea's scroll.
 * @returns {void}
 */
export function moveCodeLayers() {
    const offset = `translate(${-ui.ta.scrollLeft}px, ${-ui.ta.scrollTop}px)`;
    ui.hl.style.transform = offset;
    ui.marks.style.transform = offset;
    ui.gutter.style.transform = `translateY(${-ui.ta.scrollTop}px)`;
    showCursorLine();
}

/**
 * Puts the band behind the cursor's line, so the cursor is easy to find; hidden while text is
 * selected.
 * @returns {void}
 */
function showCursorLine() {
    const textarea = ui.ta;
    lineBand.hidden = textarea.selectionStart !== textarea.selectionEnd;
    const lineIndex = getLineIndex(textarea.selectionStart);
    lineBand.style.transform = `translateY(${CODE_PADDING_TOP + areas.lineWrap.getLineTop(lineIndex) - textarea.scrollTop}px)`;
    lineBand.style.height = areas.lineWrap.getLineHeight(lineIndex) + 'px';
}

/**
 * Returns the line a place of the code is on.
 * @param {number} place - the place.
 * @returns {number} the line index, 0-based.
 */
export function getLineIndex(place) {
    let count = 0;
    for (let i = state.code.indexOf('\n'); i >= 0 && i < place; i = state.code.indexOf('\n', i + 1)) count++;
    return count;
}

/**
 * Returns where a line starts; past the last line the end of the code (also for a huge or
 * endless number).
 * @param {number} lineNumber - the line number, 1-based.
 * @returns {number} the place of its first character.
 */
export function getLineStartPlace(lineNumber) {
    let place = 0;
    for (let line = 1; line < lineNumber; line++) {
        const lineEnd = state.code.indexOf('\n', place);
        if (lineEnd < 0) return state.code.length;
        place = lineEnd + 1;
    }
    return place;
}

/**
 * Puts the cursor (or a selection) at a place and scrolls the code there.
 * @param {number} place - where the cursor goes.
 * @param {boolean} [focus] - true to focus the code (not on narrow screens).
 * @param {number} [selectionEnd] - the end of the selection.
 * @returns {void}
 */
export function showCodePosition(place, focus = true, selectionEnd = place) {
    const textarea = ui.ta;
    if (focus && !NARROW_SCREEN.matches) textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(place, selectionEnd);
    const top = areas.lineWrap.getLineTop(getLineIndex(place)), height = textarea.clientHeight;
    if (top < textarea.scrollTop + LINE_HEIGHT || top > textarea.scrollTop + height - LINE_HEIGHT * 2) textarea.scrollTop = Math.max(0, top - height / 3);
    const column = place - (state.code.lastIndexOf('\n', place - 1) + 1);
    const x = column * getCharacterWidth();
    if (x < textarea.scrollLeft || x > textarea.scrollLeft + textarea.clientWidth - SCROLL_MARGIN_RIGHT) textarea.scrollLeft = Math.max(0, x - SCROLL_MARGIN_LEFT);
    moveCodeLayers();
}

/**
 * Returns the width of a character of the code's font. A query that fills a cache:
 * it is measured once.
 * @returns {number} the width in pixels.
 */
function getCharacterWidth() {
    if (!characterWidth) {
        const probe = document.createElement('span');
        probe.textContent = 'x'.repeat(MEASURED_CHARACTERS);
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
        probe.style.font = getComputedStyle(ui.ta).font;
        document.body.appendChild(probe);
        characterWidth = probe.getBoundingClientRect().width / MEASURED_CHARACTERS;
        probe.remove();
    }
    return characterWidth;
}

/**
 * Takes what is typed into the code: draws the code at once, the pages a little later, makes
 * an undo step when typing pauses and stores the document shortly after.
 * @returns {void}
 */
function updateTypedCode() {
    state.code = ui.ta.value;
    renderCode();
    startPreviewTimer(state.code.length > LONG_CODE ? LONG_RENDER_DELAY : RENDER_DELAY);
    clearTimeout(state.historyTimer);
    state.historyTimer = setTimeout(addHistoryStep, HISTORY_DELAY);
    startSaveTimer();
    areas.sync?.handleChange();
}

/**
 * Creates the band of the cursor's line and listens for the cursor's moves in the code.
 * @returns {void}
 */
export function startCursorLine() {
    lineBand = document.createElement('div');
    lineBand.className = 'line-band';
    lineBand.setAttribute('aria-hidden', 'true');
    ui.marks.before(lineBand);
    document.addEventListener('selectionchange', () => { if (document.activeElement === ui.ta) showCursorLine(); });
}

/**
 * Connects the textarea: typing, scrolling, the cursor's moves and leaving the code.
 * @returns {void}
 */
export function startCodeView() {
    ui.ta.addEventListener('input', updateTypedCode);
    ui.ta.addEventListener('scroll', moveCodeLayers);
    ui.ta.addEventListener('click', () => showCodeElement());
    ui.ta.addEventListener('keyup', event => { if (/Arrow|Home|End|Page/.test(event.key)) showCodeElement(); });
    ui.ta.addEventListener('blur', () => {
        if (state.markedElement) state.markedElement.classList.remove('source');
        state.markedElement = null;
    });
}
