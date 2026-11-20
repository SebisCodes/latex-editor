/**
 * The editor's state and the parts every module shares: the open document's code and what
 * was rendered from it, its pictures, the undo history, the pages of the preview, the zoom, the
 * areas set up at start (line wrap, "My documents", sync …) and a few small helpers.
 *
 * The code is the single source of truth: the pages, the problems, the outline and the
 * document settings are made from it, and every change goes through setCode() (history.js).
 *
 * The field names code, name, fileId and assets are read by the tests through
 * window.latexEditor.state.
 */

/** The prefix of the storage keys and messages. */
export const PREFIX = 'latexeditor';
/** The width below which the editor shows one view at a time. */
export const NARROW_SCREEN = matchMedia('(max-width: 860px)');
/** The height of a line of code in pixels. */
export const LINE_HEIGHT = 20;
/** CSS pixels per millimeter. */
export const PIXELS_PER_MM = 96 / 25.4;
/** The name of a document without one. */
export const DEFAULT_NAME = 'Document';
/** How long a toast stays, in milliseconds. */
const TOAST_TIME = 2600;
let toastTimer = 0;

/**
 * A step of the undo history.
 * @typedef {object} HistoryStep
 * @property {string} code - the code.
 * @property {number} sel - the cursor in the code.
 * @property {string[]} [rename] - [old name, new name] of a picture renamed with this step.
 */

/**
 * A text run of the pages being edited in place (text-edit.js).
 * @typedef {object} TextEdit
 * @property {HTMLElement} span - the run's span (`.t[data-s]`), editable while the edit lasts.
 * @property {number} at - where the run starts in the code.
 * @property {string} before - the run's text when the edit started.
 */

/**
 * The editor's state.
 * @typedef {object} EditorState
 * @property {string} code - the open document's code.
 * @property {string|null} renderedCode - the code the pages were last rendered from.
 * @property {import('./latex.js').RenderResult|null} result - what render() returned for it.
 * @property {HTMLElement[]} pages - the page elements of the preview.
 * @property {Array<[number, Element]>} sourceElements - the preview's elements with their place in the code, sorted by place.
 * @property {number} zoom - the zoom of the pages.
 * @property {string|null} fit - "width" or "page" while the zoom follows the view, null for a zoom of its own.
 * @property {number} split - the share of the width the code takes.
 * @property {string} name - the document's name.
 * @property {string} fileId - the document's id in "My documents", "" for none.
 * @property {Object<string, string>} assets - the document's pictures: name -> data URI.
 * @property {HistoryStep[]} history - the undo steps; the last one is the current code.
 * @property {HistoryStep[]} future - the redo steps.
 * @property {number} historyTimer - the timer that makes an undo step of typing.
 * @property {boolean} showProblems - true when the list of problems is open.
 * @property {Element|null} markedElement - the element of the preview framed for the code cursor.
 * @property {string|null} savedCode - the code as this tab last read or stored it.
 * @property {TextEdit|null} textEdit - the run being edited on the pages, null when none.
 */

/** @type {EditorState} */
export const state = {
    code: '', renderedCode: null, result: null, pages: [], sourceElements: [],
    zoom: 1, fit: 'width',
    split: 0.5,
    name: DEFAULT_NAME, fileId: '', assets: {},
    history: [], future: [], historyTimer: 0,
    showProblems: true, markedElement: null,
    savedCode: null, textEdit: null,
};

/**
 * Returns the first element that matches a selector.
 * @param {string} selector - the CSS selector.
 * @param {ParentNode} [root] - where to search.
 * @returns {Element|null} the element.
 */
export function getElement(selector, root = document) {
    return root.querySelector(selector);
}

/**
 * Returns every element that matches a selector.
 * @param {string} selector - the CSS selector.
 * @param {ParentNode} [root] - where to search.
 * @returns {Element[]} the elements.
 */
export function getElements(selector, root = document) {
    return [...root.querySelectorAll(selector)];
}

/** The elements of the page the modules work with. */
export const ui = {
    ta: getElement('#code'), hl: getElement('#hl'), marks: getElement('#marks'), gutter: getElement('#gutter'),
    status: getElement('#code-status'), error: getElement('#code-error'),
    stage: getElement('#stage'), scroller: getElement('#scroller'), pages: getElement('#pages'), hint: getElement('#hint'),
    zoomLabel: getElement('#zoom-label'), pageLabel: getElement('#page-label'),
    inspector: getElement('#inspector-body'), insert: getElement('#insert-wrap'), tree: getElement('#tree'),
    pictures: getElement('#pics-wrap'), work: getElement('#work'), toast: getElement('#toast'),
};

/**
 * The areas set up at start; each is null until it is.
 * @type {{i18n: object|null, lineWrap: object|null, files: object|null, sync: object|null, ai: object|null, aiStatus: object|null}}
 */
export const areas = { i18n: null, lineWrap: null, files: null, sync: null, ai: null, aiStatus: null };

/**
 * Shows a short message at the bottom of the editor.
 * @param {string} message - the message.
 * @returns {void}
 */
export function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('shown'), TOAST_TIME);
}

/**
 * Returns a number limited to a range.
 * @param {number} value - the number.
 * @param {number} min - the smallest value.
 * @param {number} max - the largest value.
 * @returns {number} the number within [min, max].
 */
export function getNumberInRange(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/**
 * Returns the problems the preview found in the open document.
 * @returns {import('./latex.js').Problem[]} the problems, empty before the first rendering.
 */
export function getProblems() {
    return state.result ? state.result.problems : [];
}
