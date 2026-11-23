/**
 * The pages: the rendered blocks (latex.js render()) are laid out on pages of the document's
 * paper size, measured in a hidden copy at 100 %; the editor then shows them at the chosen
 * zoom. Printing, page pictures and the HTML file are in page-export.js.
 *
 * renderPages() runs these steps:
 *   1. start the first page;
 *   2. place each block: a page break starts a new page; a block that does not fit is split
 *      between pages (lists, tables, listings, the table of contents) or moves to the next
 *      page, taking a heading above it along;
 *   3. drop an empty last page;
 *   4. write the page numbers, then the page numbers of the table of contents and \pageref.
 *
 * The file is longer than the usual guide: the steps share the page being filled and the
 * measuring, and splitting them into modules would scatter one layout over several files.
 */

import { escapeHtml } from './latex.js?v=15';

/** CSS pixels per TeX point. */
const PX_PER_PT = 96 / 72.27;
/** The line height of the standard classes, times \linespread. */
const BASE_LINE_HEIGHT = 1.2;
/** The smallest size of the type area in pixels. */
const MIN_TYPE_AREA = 20;
/** The page number sits this part of the bottom margin above the page's edge, within these limits. */
const PAGE_NUMBER_MARGIN_PART = 0.45;
const PAGE_NUMBER_MIN_BOTTOM = 4;
const PAGE_NUMBER_MAX_BOTTOM = 60;
/** How far the content may stand over the type area before it counts as too much, in pixels. */
const OVERFLOW_TOLERANCE = 0.5;
const TWO_COLUMN_TOLERANCE = 2;
/** After this many pages a split block goes on one more page as it is: nothing is dropped. */
const MAX_CONTINUED_PAGES = 5000;
const ROMAN_NUMERALS = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const CHAR_CODE_BEFORE_A = 96;
const CHAR_CODE_BEFORE_UPPER_A = 64;
/** Elements whose children can go to different pages. */
const SPLITTABLE = 'ul.list, ol.list, dl.list, ol.bib-list';

/**
 * A footnote of a block.
 * @typedef {object} Footnote
 * @property {number} pos - its offset in the code.
 * @property {string} mark - its mark (a number or a symbol).
 * @property {string} html - its text as HTML.
 */

/**
 * A block of the rendered document (latex.js render()).
 * @typedef {object} Block
 * @property {string} html - its HTML.
 * @property {number} pos - its offset in the code.
 * @property {Footnote[]} [notes] - its footnotes.
 * @property {boolean} [pageBreak] - a page break.
 * @property {boolean} [breakBefore] - starts a new page.
 * @property {boolean} [breakAfter] - the next block starts a new page.
 * @property {boolean} [keep] - goes to the next page together with the block after it (a heading).
 * @property {boolean} [nopagenum] - its page has no number.
 */

/**
 * What latex.js render() returns, as far as the layout reads it.
 * @typedef {object} RenderResult
 * @property {object} meta - the page settings of the document.
 * @property {Block[]} blocks - the blocks of the body.
 */

/**
 * A block placed on a page, with its elements.
 * @typedef {object} PlacedItem
 * @property {Block} b - the block.
 * @property {Element[]} els - its elements on the page.
 * @property {Element[]} notes - its footnote elements.
 */

/**
 * A page being filled.
 * @typedef {object} Page
 * @property {HTMLElement} el - the sheet.
 * @property {HTMLElement} typeArea - the type area.
 * @property {HTMLElement} body - the content inside the type area.
 * @property {HTMLElement} notes - the footnotes inside the type area.
 * @property {number} n - the page's number, 1-based.
 * @property {PlacedItem[]} items - the blocks on it.
 * @property {boolean} nopagenum - true when the page shows no number.
 */

/**
 * The state of one layout run.
 * @typedef {object} Layout
 * @property {object} meta - the page settings of the document.
 * @property {HTMLElement} host - the element at 100 % that holds the pages while they are measured.
 * @property {string} vars - the CSS variables of the document.
 * @property {Page[]} pages - the pages so far.
 * @property {Page|null} page - the page being filled.
 */

/**
 * Returns a number in upper-case Roman numerals.
 * @param {number} number - the number.
 * @returns {string} the numeral, "" for 0.
 */
function formatRoman(number) {
    let roman = '';
    for (const [value, numeral] of ROMAN_NUMERALS) {
        while (number >= value) { roman += numeral; number -= value; }
    }
    return roman;
}

/**
 * Returns the font family, size and spacing of the whole document as CSS variables.
 * @param {object} meta - the page settings of the document.
 * @returns {string} the declarations, separated by ";".
 */
export function getPageVariables(meta) {
    const fontSize = meta.fs * PX_PER_PT;
    const family = meta.sans
        ? (meta.sansFont === 'helvet' ? 'var(--helvet)' : 'var(--sans)')
        : meta.fontFamily === 'times' ? 'var(--times)' : meta.fontFamily === 'palatino' ? 'var(--palatino)' : 'var(--serif)';
    const variables = [`--fs:${fontSize.toFixed(3)}px`, `--lh:${(BASE_LINE_HEIGHT * (meta.spread || 1)).toFixed(3)}`, `--font:${family}`];
    if (meta.parskipLen) variables.push(`--parskip:${meta.parskipLen}`);
    if (meta.parindent) variables.push(`--parindent:${meta.parindent}`);
    if (meta.arraystretch) variables.push(`--arraystretch:${meta.arraystretch}`);
    return variables.join(';');
}

/**
 * Returns a page number in the style of \pagenumbering.
 * @param {number} number - the page number.
 * @param {string} style - "arabic", "roman", "Roman", "alph", "Alph" or "gobble".
 * @returns {string} the page number as shown.
 */
function formatPageNumber(number, style) {
    if (style === 'roman') return formatRoman(number).toLowerCase();
    if (style === 'Roman') return formatRoman(number);
    if (style === 'alph') return String.fromCharCode(CHAR_CODE_BEFORE_A + number);
    if (style === 'Alph') return String.fromCharCode(CHAR_CODE_BEFORE_UPPER_A + number);
    if (style === 'gobble') return '';
    return String(number);
}

/**
 * Lays the blocks out on pages inside host.
 * @param {RenderResult} result - what latex.js render() returned.
 * @param {HTMLElement} host - an element at 100 % that holds the pages while they are measured.
 * @returns {{pages: HTMLElement[], labelsPage: Object<string, string>}} the sheets, and the page number of each element id.
 */
export function renderPages(result, host) {
    const { meta, blocks } = result;
    host.replaceChildren();
    const layout = { meta, host, vars: getPageVariables(meta), pages: [], page: null };
    addPage(layout);
    for (const block of blocks) addBlockToPage(layout, block);
    const { pages } = layout;
    if (pages.length > 1 && !pages[pages.length - 1].items.length) { pages.pop().el.remove(); }
    const labelsPage = setPageNumbers(pages, meta);
    setPageReferences(pages, labelsPage);
    return { pages: pages.map(page => page.el), labelsPage };
}

/**
 * Adds an empty page and makes it the page being filled.
 * @param {Layout} layout - the layout run.
 * @returns {void}
 */
function addPage(layout) {
    const { meta, vars } = layout;
    const width = meta.paper.w, height = meta.paper.h, margin = meta.margin;
    const el = document.createElement('div');
    el.className = 'sheet' + (meta.parskip ? ' parskip' : '') + (meta.twocolumn ? ' two-column' : '') + (meta.sans ? ' sans' : '');
    el.lang = meta.hyphLang || 'en';
    el.style.cssText = `width:${width}px;height:${height}px;${vars}${meta.pagecolor ? `;background:${meta.pagecolor}` : ''}`;
    el.innerHTML = `<div class="type-area" style="left:${margin.l}px;top:${margin.t}px;width:${Math.max(MIN_TYPE_AREA, width - margin.l - margin.r)}px;height:${Math.max(MIN_TYPE_AREA, height - margin.t - margin.b)}px"><div class="content"></div><div class="footnotes" hidden></div></div><div class="page-number" style="bottom:${Math.max(PAGE_NUMBER_MIN_BOTTOM, Math.min(margin.b * PAGE_NUMBER_MARGIN_PART, PAGE_NUMBER_MAX_BOTTOM))}px"></div>`;
    layout.host.append(el);
    layout.page = { el, typeArea: el.firstChild, body: el.firstChild.firstChild, notes: el.firstChild.lastChild, n: layout.pages.length + 1, items: [], nopagenum: false };
    layout.pages.push(layout.page);
}

/**
 * Tells whether a page holds more than its type area takes (in two columns: more than two columns).
 * @param {Layout} layout - the layout run.
 * @param {Page} page - the page.
 * @returns {boolean} true when the content does not fit.
 */
function isOverfull(layout, page) {
    const available = page.typeArea.clientHeight;
    if (layout.meta.twocolumn) return page.body.scrollWidth > page.body.clientWidth + TWO_COLUMN_TOLERANCE;
    const used = page.body.scrollHeight + (page.notes.hidden ? 0 : page.notes.offsetHeight);
    return used > available + OVERFLOW_TOLERANCE;
}

/**
 * Places one block: a page break starts a new page; a block that does not fit is split or
 * moves to the next page.
 * @param {Layout} layout - the layout run.
 * @param {Block} block - the block.
 * @returns {void}
 */
function addBlockToPage(layout, block) {
    if (block.pageBreak) { if (layout.page.items.length) addPage(layout); return; }
    if (block.nopagenum) layout.page.nopagenum = true;
    if (!block.html) return;
    if (block.breakBefore && layout.page.items.length) addPage(layout);
    const item = addItem(layout.page, block);
    if (isOverfull(layout, layout.page)) splitOverfullBlock(layout, block, item);
    if (block.breakAfter) addPage(layout);
}

/**
 * Handles a block that made its page overfull: its rest continues on the next pages, or the
 * block moves to the next page with the heading above it.
 * @param {Layout} layout - the layout run.
 * @param {Block} block - the block.
 * @param {PlacedItem} item - the block as placed on the page.
 * @returns {void}
 */
function splitOverfullBlock(layout, block, item) {
    const rest = splitItem(layout, layout.page, item);
    if (rest) { addContinuedPages(layout, block, rest); return; }
    if (layout.page.items.length <= 1) return;
    removeItem(layout.page, item);
    const moved = removeKeptBlocks(layout.page);
    addPage(layout);
    for (const movedBlock of moved) addItem(layout.page, movedBlock);
    const movedItem = addItem(layout.page, block);
    if (isOverfull(layout, layout.page)) addContinuedPages(layout, block, splitItem(layout, layout.page, movedItem));
}

/**
 * Takes the blocks that go along with what follows them (headings) off the end of a page,
 * keeping the first block on it.
 * @param {Page} page - the page.
 * @returns {Block[]} the blocks taken off, in their order.
 */
function removeKeptBlocks(page) {
    const moved = [];
    while (page.items.length > 1 && page.items[page.items.length - 1].b.keep) {
        const last = page.items[page.items.length - 1];
        moved.unshift(last.b);
        removeItem(page, last);
    }
    return moved;
}

/**
 * Adds footnotes to the bottom of a page.
 * @param {Page} page - the page.
 * @param {Footnote[]} [notes] - the footnotes.
 * @returns {Element[]} the footnote elements added.
 */
function addNotes(page, notes) {
    const elements = [];
    for (const note of notes || []) {
        const element = document.createElement('div');
        element.className = 'footnote';
        element.dataset.p = note.pos;
        element.innerHTML = `<sup>${escapeHtml(note.mark)}</sup>${note.html}`;
        page.notes.append(element);
        elements.push(element);
    }
    page.notes.hidden = !page.notes.childElementCount;
    return elements;
}

/**
 * Puts a block's elements and footnotes on a page.
 * @param {Page} page - the page.
 * @param {Block} block - the block.
 * @returns {PlacedItem} the block as placed.
 */
function addItem(page, block) {
    const template = document.createElement('template');
    template.innerHTML = block.html;
    const elements = [...template.content.childNodes].filter(node => node.nodeType === 1 || node.textContent.trim());
    for (const element of elements) page.body.append(element);
    const notes = addNotes(page, block.notes);
    const item = { b: block, els: elements, notes };
    page.items.push(item);
    return item;
}

/**
 * Takes a placed block off its page.
 * @param {Page} page - the page.
 * @param {PlacedItem} item - the block as placed.
 * @returns {void}
 */
function removeItem(page, item) {
    for (const element of item.els) element.remove();
    for (const note of item.notes) note.remove();
    page.notes.hidden = !page.notes.childElementCount;
    page.items.splice(page.items.indexOf(item), 1);
}

/**
 * Returns the element whose children can go to different pages: a list, a listing, the table
 * of contents, the bibliography, or the rows of a table alone in a paragraph.
 * @param {Element|null} element - the element on the page.
 * @returns {Element|null} the element with the parts, null when it cannot be split.
 */
function getSplitBox(element) {
    if (!element || element.nodeType !== 1) return null;
    if (element.matches(SPLITTABLE)) return element;
    if (element.matches('pre.code')) return element;
    if (element.matches('.toc')) return element;
    if (element.matches('.bib')) return element.querySelector('ol');
    if (element.matches('div.p') || element.matches('[class^="al-"]')) {
        const children = [...element.children];
        if (children.length === 1 && children[0].matches('table.tab')) return children[0].tBodies[0];
        if (children.length === 1) return getSplitBox(children[0]);
    }
    return null;
}

/**
 * Splits an overflowing block: its tail moves to a copy of the element.
 * @param {Layout} layout - the layout run.
 * @param {Page} page - the page.
 * @param {PlacedItem} item - the block as placed.
 * @returns {Element|null} the copy with the rest, null when the block cannot be split.
 */
function splitItem(layout, page, item) {
    if (item.els.length !== 1) return null;
    const element = item.els[0];
    const box = getSplitBox(element);
    if (!box) return null;
    const count = box.children.length;
    if (count < 2) return null;
    const keepHead = box.matches('.toc') ? 1 : 0;
    let kept = count;
    while (kept > 1 + keepHead && isOverfull(layout, page)) { kept--; box.children[kept].style.display = 'none'; }
    if (isOverfull(layout, page) && kept <= 1 + keepHead) {
        for (const child of box.children) child.style.display = '';
        return null;
    }
    const rest = element.cloneNode(true);
    const restBox = getSplitBox(rest);
    for (let i = count - 1; i >= kept; i--) box.children[i].remove();
    for (let i = kept - 1; i >= keepHead; i--) restBox.children[i].remove();
    if (keepHead) restBox.children[0]?.remove();
    for (const child of restBox.children) child.style.display = '';
    rest.classList.add('continued');
    return rest;
}

/**
 * Puts the rest of a split block on the next pages; each split takes at least one row off, so
 * this ends. Past MAX_CONTINUED_PAGES pages the rest goes on one more page as it is.
 * @param {Layout} layout - the layout run.
 * @param {Block} block - the block.
 * @param {Element|null} rest - the rest of the block.
 * @returns {void}
 */
function addContinuedPages(layout, block, rest) {
    let remaining = rest;
    for (let guard = 0; remaining && guard < MAX_CONTINUED_PAGES; guard++) {
        addPage(layout);
        const item = { b: { ...block, html: '', notes: [] }, els: [remaining], notes: [] };
        layout.page.body.append(remaining);
        layout.page.items.push(item);
        remaining = isOverfull(layout, layout.page) ? splitItem(layout, layout.page, item) : null;
    }
    if (remaining) {
        addPage(layout);
        layout.page.body.append(remaining);
        layout.page.items.push({ b: { ...block, html: '', notes: [] }, els: [remaining], notes: [] });
    }
}

/**
 * Writes the page numbers and marks every page as done.
 * @param {Page[]} pages - the pages.
 * @param {object} meta - the page settings of the document.
 * @returns {Object<string, string>} the page number of each element id on the pages.
 */
function setPageNumbers(pages, meta) {
    const first = meta.firstPage || 1;
    const labelsPage = {};
    for (const [i, page] of pages.entries()) {
        const number = formatPageNumber(first + i, meta.numbering);
        page.el.dataset.page = i + 1;
        const numberElement = page.el.querySelector('.page-number');
        numberElement.textContent = meta.pagestyle === 'empty' || page.nopagenum ? '' : number;
        page.el.querySelectorAll('[id]').forEach(element => { labelsPage[element.id] = number; });
        page.el.querySelector('.content').classList.add('done');
    }
    return labelsPage;
}

/**
 * Writes the page numbers into the table of contents and \pageref ("??" for a \pageref whose
 * label is on no page).
 * @param {Page[]} pages - the pages.
 * @param {Object<string, string>} labelsPage - the page number of each element id.
 * @returns {void}
 */
function setPageReferences(pages, labelsPage) {
    for (const page of pages) {
        page.el.querySelectorAll('[data-target]').forEach(element => { element.textContent = labelsPage[element.dataset.target] ?? (element.classList.contains('pageref') ? '??' : ''); });
    }
}
