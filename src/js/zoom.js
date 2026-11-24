/**
 * The zoom of the pages and moving between them. The pages fit the width of the view, a whole
 * page fits it, or they have a zoom of their own (buttons, Ctrl/Cmd and the mouse wheel); the
 * label shows the page in sight and the number of pages.
 */

import { state, ui, NARROW_SCREEN, PIXELS_PER_MM, getElement, getNumberInRange } from './state.js?v=2';
import { saveState } from './storage.js?v=9';

/** The paper size before the first rendering: A4 in millimeters. */
const DEFAULT_PAPER_MM = { w: 210, h: 297 };
/** The smallest and largest zoom that fitting the view gives. */
const MIN_FIT_ZOOM = 0.1;
const MAX_FIT_ZOOM = 3;
/** The smallest and largest zoom of its own. */
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
/** Pixels of the view kept free beside the pages, on wide and narrow screens, and below. */
const VIEW_PADDING = 44;
const NARROW_VIEW_PADDING = 16;
/** One step of the zoom buttons and keys. */
export const ZOOM_STEP = 1.2;
/** How strongly the mouse wheel zooms. */
const WHEEL_ZOOM = 0.0022;
/** Pixels above a page when the view moves to it. */
const PAGE_TOP_MARGIN = 14;
/** A page counts as the one in sight when its top is above the view's height divided by this. */
const PAGE_IN_SIGHT_DIVISOR = 3;

/**
 * Returns the paper size of the document.
 * @returns {{w: number, h: number}} width and height in CSS pixels.
 */
export function getPageSize() {
    const meta = state.result?.meta;
    return meta ? { w: meta.paper.w, h: meta.paper.h } : { w: DEFAULT_PAPER_MM.w * PIXELS_PER_MM, h: DEFAULT_PAPER_MM.h * PIXELS_PER_MM };
}

/**
 * Sets the zoom of the pages (fitting the view when a fit is chosen), its label and the fit buttons.
 * @returns {void}
 */
export function showZoom() {
    const { w, h } = getPageSize();
    const availableWidth = ui.scroller.clientWidth - (NARROW_SCREEN.matches ? NARROW_VIEW_PADDING : VIEW_PADDING);
    const availableHeight = ui.scroller.clientHeight - VIEW_PADDING;
    if (availableWidth > 0) {
        if (state.fit === 'width') state.zoom = getNumberInRange(availableWidth / w, MIN_FIT_ZOOM, MAX_FIT_ZOOM);
        else if (state.fit === 'page') state.zoom = getNumberInRange(Math.min(availableWidth / w, availableHeight / h), MIN_FIT_ZOOM, MAX_FIT_ZOOM);
    }
    ui.pages.style.zoom = state.zoom;
    ui.zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
    getElement('#zoom-fit').setAttribute('aria-pressed', String(state.fit === 'width'));
    getElement('#zoom-page').setAttribute('aria-pressed', String(state.fit === 'page'));
}

/**
 * Gives the pages a zoom of their own; the point under the pointer (or the middle of the view)
 * stays in place.
 * @param {number} zoom - the wanted zoom.
 * @param {number} [pointX] - the point's x in the view.
 * @param {number} [pointY] - the point's y in the view.
 * @returns {void}
 */
export function setZoom(zoom, pointX, pointY) {
    const scroller = ui.scroller;
    const box = scroller.getBoundingClientRect();
    const x = pointX ?? box.width / 2, y = pointY ?? box.height / 2;
    const oldZoom = state.zoom;
    const newZoom = getNumberInRange(zoom, MIN_ZOOM, MAX_ZOOM);
    const pageX = (scroller.scrollLeft + x) / oldZoom, pageY = (scroller.scrollTop + y) / oldZoom;
    state.fit = null;
    state.zoom = newZoom;
    showZoom();
    scroller.scrollLeft = pageX * newZoom - x;
    scroller.scrollTop = pageY * newZoom - y;
    saveState();
}

/**
 * Returns the page in sight: the last one whose top is above a third of the view.
 * @returns {number} its index, 0-based.
 */
export function getCurrentPage() {
    const box = ui.scroller.getBoundingClientRect();
    const line = box.top + box.height / PAGE_IN_SIGHT_DIVISOR;
    let current = 0;
    state.pages.forEach((page, index) => { if (page.getBoundingClientRect().top <= line) current = index; });
    return current;
}

/**
 * Shows the page in sight and the number of pages, and enables the page buttons.
 * @returns {void}
 */
export function updatePageLabel() {
    const count = state.pages.length;
    const current = count ? getCurrentPage() + 1 : 0;
    ui.pageLabel.textContent = `${current} / ${count}`;
    getElement('#page-prev').disabled = current <= 1;
    getElement('#page-next').disabled = current >= count;
}

/**
 * Scrolls the view to a page.
 * @param {number} index - the page's index, 0-based; out of range the first or last page.
 * @returns {void}
 */
export function showPage(index) {
    const page = state.pages[getNumberInRange(index, 0, state.pages.length - 1)];
    if (!page) return;
    const scroller = ui.scroller;
    scroller.scrollTop += page.getBoundingClientRect().top - scroller.getBoundingClientRect().top - PAGE_TOP_MARGIN;
    updatePageLabel();
}

/**
 * Zooms with Ctrl/Cmd and the mouse wheel around the pointer (a wheel event handler).
 * @param {WheelEvent} event - the wheel event.
 * @returns {void}
 */
function setZoomOnWheel(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const box = ui.scroller.getBoundingClientRect();
    setZoom(state.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM), event.clientX - box.left, event.clientY - box.top);
}

/**
 * Connects the zoom and page buttons, the wheel, the page label to the scroll, and a fitting
 * zoom to the size of the view.
 * @returns {void}
 */
export function startZoom() {
    ui.scroller.addEventListener('scroll', () => { requestAnimationFrame(updatePageLabel); }, { passive: true });
    ui.scroller.addEventListener('wheel', setZoomOnWheel, { passive: false });
    new ResizeObserver(() => { if (state.fit) showZoom(); }).observe(ui.scroller);
    getElement('#zoom-in').addEventListener('click', () => setZoom(state.zoom * ZOOM_STEP));
    getElement('#zoom-out').addEventListener('click', () => setZoom(state.zoom / ZOOM_STEP));
    getElement('#zoom-100').addEventListener('click', () => setZoom(1));
    getElement('#zoom-fit').addEventListener('click', () => { state.fit = 'width'; showZoom(); saveState(); });
    getElement('#zoom-page').addEventListener('click', () => { const page = getCurrentPage(); state.fit = 'page'; showZoom(); showPage(page); saveState(); });
    getElement('#page-prev').addEventListener('click', () => showPage(getCurrentPage() - 1));
    getElement('#page-next').addEventListener('click', () => showPage(getCurrentPage() + 1));
}
