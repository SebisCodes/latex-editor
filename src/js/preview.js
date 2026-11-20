/**
 * The pages of the preview, rendered from the code.
 *
 * renderPreview() runs these steps:
 *   1. render the code to blocks (latex.js); an unexpected error becomes a page with the message;
 *   2. lay the blocks out on pages (viewer.js) in a hidden copy at 100 % and show them at the
 *      current zoom, the scroll position kept;
 *   3. collect the elements that carry their place in the code (data-p), sorted by place;
 *   4. draw the page label, the problems, the code view, the Pictures tab (when it is open),
 *      the outline and the document settings again, and frame the element at the cursor.
 */

import { render, escapeHtml } from './latex.js?v=14';
import { renderPages } from './viewer.js?v=12';
import { state, ui, getElements } from './state.js?v=2';
import { renderCode } from './code-view.js?v=3';
import { showZoom, updatePageLabel } from './zoom.js?v=3';
import { renderProblems } from './problems.js?v=3';
import { renderPicturesTab } from './pictures-tab.js?v=3';
import { renderOutline } from './outline.js?v=3';
import { renderSettingsPanel } from './settings-panel.js?v=3';

/** How long the pages wait after typing before they are rendered, in milliseconds. */
export const RENDER_DELAY = 280;
/** How long the pages wait for more fonts before they are laid out again, in milliseconds. */
const FONTS_DELAY = 150;
/** The elements of the pages that lead to their place in the code. */
const SOURCE_ELEMENTS = '.content > [data-p], li[data-p], td[data-p], .dl-item[data-p], .dm[data-p], .footnote[data-p], .caption[data-p], h2[data-p], h3[data-p], h4[data-p], pre[data-p]';
/** Margin in pixels above the framed element when the pages scroll to it. */
const MARK_TOP_MARGIN = 20;
/** Margin in pixels below the view within which the framed element counts as out of sight. */
const MARK_BOTTOM_MARGIN = 40;
/** The hidden copy of the pages at 100 %, where the blocks are measured. */
let measureBox = null;
let renderTimer = 0;
let fontsTimer = 0;

/**
 * Renders the pages a little later; until then the preview shows that it is computing.
 * @param {number} [delay] - how long to wait, in milliseconds.
 * @returns {void}
 */
export function startPreviewTimer(delay = RENDER_DELAY) {
    clearTimeout(renderTimer);
    ui.stage.classList.add('computing');
    renderTimer = setTimeout(renderPreview, delay);
}

/**
 * Renders the code to pages and draws everything that depends on them (the steps in the header).
 * @returns {void}
 */
export function renderPreview() {
    clearTimeout(renderTimer);
    ui.stage.classList.remove('computing');
    state.result = getRenderResult();
    state.renderedCode = state.code;
    showPages(renderPages(state.result, measureBox).pages);
    state.sourceElements = getElements(SOURCE_ELEMENTS, ui.pages)
        .map(element => [+element.dataset.p, element]).sort((a, b) => a[0] - b[0]);
    updatePageLabel();
    renderProblems();
    renderCode();
    if (!ui.pictures.hidden) renderPicturesTab();
    renderOutline();
    renderSettingsPanel();
    showCodeElement(false);
}

/**
 * Returns what render() makes of the code; an unexpected error becomes one block with the
 * message and one problem.
 * @returns {import('./latex.js').RenderResult} the blocks, page settings, outline, labels and problems.
 */
function getRenderResult() {
    try {
        return render(state.code, { assets: state.assets });
    } catch (error) {
        console.error(error);
        const meta = render('').meta;
        return { blocks: [{ html: `<div class="p ni">The preview stopped at an unexpected problem: ${escapeHtml(error.message)}</div>`, pos: 0 }], meta, outline: [], labels: {}, problems: [{ pos: 0, kind: 'error', msg: 'The preview failed: ' + error.message }] };
    }
}

/**
 * Shows the laid out pages in place of the old ones at the current zoom; the scroll position stays.
 * @param {HTMLElement[]} pages - the page elements.
 * @returns {void}
 */
function showPages(pages) {
    const scrollTop = ui.scroller.scrollTop, scrollLeft = ui.scroller.scrollLeft;
    ui.pages.replaceChildren(...pages);
    state.pages = pages;
    showZoom();
    ui.scroller.scrollTop = scrollTop;
    ui.scroller.scrollLeft = scrollLeft;
}

/**
 * Frames the element of the pages at the code's cursor: the last one that starts at or before
 * it. Only while the code has the focus, unless always is set.
 * @param {boolean} [scroll] - true to scroll the pages to it when it is out of sight.
 * @param {boolean} [always] - true to frame it also when the code has no focus.
 * @returns {void}
 */
export function showCodeElement(scroll = true, always = false) {
    if (state.markedElement) state.markedElement.classList.remove('source');
    state.markedElement = null;
    const list = state.sourceElements;
    if (!list.length || (document.activeElement !== ui.ta && !always)) return;
    const index = findLastAtOrBefore(list, ui.ta.selectionStart);
    if (index < 0) return;
    const element = list[index][1];
    element.classList.add('source');
    state.markedElement = element;
    if (scroll) showElementInView(element);
}

/**
 * Finds by binary search the last entry whose place is at or before a place.
 * @param {Array<[number, Element]>} list - places with their elements, sorted by place.
 * @param {number} place - the place in the code.
 * @returns {number} the entry's index, -1 when every entry starts after it.
 */
function findLastAtOrBefore(list, place) {
    let low = 0, high = list.length - 1, best = -1;
    while (low <= high) {
        const middle = (low + high) >> 1;
        if (list[middle][0] <= place) { best = middle; low = middle + 1; } else high = middle - 1;
    }
    return best;
}

/**
 * Scrolls the pages so an element out of sight is a third down the view, and updates the page label.
 * @param {Element} element - the element.
 * @returns {void}
 */
function showElementInView(element) {
    const box = element.getBoundingClientRect(), view = ui.scroller.getBoundingClientRect();
    if (box.bottom < view.top + MARK_TOP_MARGIN || box.top > view.bottom - MARK_BOTTOM_MARGIN) ui.scroller.scrollTop += box.top - view.top - view.height / 3;
    updatePageLabel();
}

/**
 * Creates the hidden copy of the pages where the blocks are measured.
 * @returns {void}
 */
export function startPreview() {
    measureBox = document.createElement('div');
    measureBox.className = 'measure';
    measureBox.setAttribute('aria-hidden', 'true');
    document.body.append(measureBox);
}

/**
 * Lays the pages out again once fonts that arrive later (KaTeX's) are there.
 * @returns {void}
 */
export function startFontsWatch() {
    document.fonts.addEventListener?.('loadingdone', () => { clearTimeout(fontsTimer); fontsTimer = setTimeout(renderPreview, FONTS_DELAY); });
}
