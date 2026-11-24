/**
 * The layout of the editor: the splitter between code and pages (dragged or moved with the
 * arrow keys, remembered), the side panel (a drawer on the desktop, closed at the start) and its
 * tabs, the views of narrow screens, and the closing of dialogs.
 */

import { openDialog } from './dialogs.js?v=5';
import { state, ui, getElement, getElements, getNumberInRange } from './state.js?v=2';
import { saveState } from './storage.js?v=8';
import { moveCodeLayers } from './code-view.js?v=8';
import { showZoom } from './zoom.js?v=8';
import { renderPicturesTab } from './pictures-tab.js?v=8';

/** The smallest and largest share of the width the code takes. */
const MIN_SPLIT = 0.15;
const MAX_SPLIT = 0.85;
/** How far an arrow key moves the splitter. */
const SPLIT_STEP = 0.03;

/**
 * Sets the columns of the code and the pages from the split.
 * @returns {void}
 */
export function showSplit() {
    ui.work.style.setProperty('--code-fr', state.split.toFixed(4) + 'fr');
    ui.work.style.setProperty('--view-fr', (1 - state.split).toFixed(4) + 'fr');
}

/**
 * Shows one view on narrow screens: the code, the pages or the panel.
 * @param {string} pane - "code", "draw" or "panel".
 * @returns {void}
 */
export function showPane(pane) {
    ui.work.dataset.show = pane;
    getElements('[data-pane]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.pane === pane)));
    requestAnimationFrame(() => { if (pane === 'draw') showZoom(); if (pane === 'code') moveCodeLayers(); });
}

/**
 * Shows a tab of the side panel: the document settings, Insert, Pictures or Structure.
 * @param {HTMLElement} tab - the tab's button.
 * @returns {void}
 */
function showPanelTab(tab) {
    getElements('[data-itab]').forEach(button => button.setAttribute('aria-selected', String(button === tab)));
    ui.inspector.hidden = tab.dataset.itab !== 'properties';
    ui.insert.hidden = tab.dataset.itab !== 'insert';
    ui.pictures.hidden = tab.dataset.itab !== 'pictures';
    if (!ui.pictures.hidden) renderPicturesTab();
    getElement('#tree-wrap').hidden = tab.dataset.itab !== 'structure';
}

/**
 * Opens or closes the side panel's drawer.
 * @param {boolean} isOpen - true to open it.
 * @returns {void}
 */
export function showSidePanel(isOpen) {
    ui.work.dataset.panel = isOpen ? 'open' : 'closed';
    getElement('#btn-panel').setAttribute('aria-expanded', String(isOpen));
}

/**
 * Closes the side panel's drawer with Escape inside it and puts the focus on its button.
 * @param {KeyboardEvent} event - the key in the side panel.
 * @returns {void}
 */
function closeSidePanelOnEscape(event) {
    if (event.key !== 'Escape' || ui.work.dataset.panel !== 'open' || event.target.closest('dialog')) return;
    showSidePanel(false);
    getElement('#btn-panel').focus();
}

/**
 * Connects the splitter, the view buttons of narrow screens, the side panel's button, the
 * panel tabs and the drawer's place below the preview's bar.
 * @returns {void}
 */
export function startLayout() {
    const splitter = getElement('#splitter');
    splitter.addEventListener('pointerdown', event => moveSplitterWithPointer(splitter, event));
    splitter.addEventListener('keydown', moveSplitOnKey);
    getElements('[data-pane]').forEach(button => button.addEventListener('click', () => showPane(button.dataset.pane)));
    getElements('[data-itab]').forEach(button => button.addEventListener('click', () => showPanelTab(button)));
    showSidePanel(false);
    getElement('#btn-panel').addEventListener('click', () => showSidePanel(ui.work.dataset.panel !== 'open'));
    getElement('#side-panel').addEventListener('keydown', closeSidePanelOnEscape);
    watchPreviewBarHeight();
}

/**
 * Keeps the height of the preview's bar as --preview-bar on the work area: the side panel's
 * drawer starts below the bar, so the bar's controls stay in view and usable while it is open.
 * The bar is taller when its controls wrap (narrow work area, long labels of a language).
 * @returns {void}
 */
function watchPreviewBarHeight() {
    const bar = getElement('.draw-pane > .pane-header');
    const observer = new ResizeObserver(() => ui.work.style.setProperty('--preview-bar', bar.offsetHeight + 'px'));
    observer.observe(bar);
}

/**
 * Moves the splitter one step with the left or right arrow key and stores the split.
 * @param {KeyboardEvent} event - the key on the splitter.
 * @returns {void}
 */
function moveSplitOnKey(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    state.split = getNumberInRange(state.split + (event.key === 'ArrowLeft' ? -SPLIT_STEP : SPLIT_STEP), MIN_SPLIT, MAX_SPLIT);
    showSplit();
    saveState();
}

/**
 * Moves the splitter with the pointer until it is released; the split is stored at the end.
 * @param {HTMLElement} splitter - the splitter.
 * @param {PointerEvent} event - the pointerdown.
 * @returns {void}
 */
function moveSplitterWithPointer(splitter, event) {
    splitter.setPointerCapture(event.pointerId);
    const area = ui.work.getBoundingClientRect();
    const available = area.width - splitter.offsetWidth;
    /**
     * Sets the split to the pointer's place.
     * @param {PointerEvent} moveEvent - the pointermove.
     * @returns {void}
     */
    const moveSplitter = moveEvent => { state.split = getNumberInRange((moveEvent.clientX - area.left) / available, MIN_SPLIT, MAX_SPLIT); showSplit(); };
    /**
     * Ends the drag and stores the split.
     * @returns {void}
     */
    const stopSplitterMove = () => {
        splitter.removeEventListener('pointermove', moveSplitter);
        splitter.removeEventListener('pointerup', stopSplitterMove);
        saveState();
    };
    splitter.addEventListener('pointermove', moveSplitter);
    splitter.addEventListener('pointerup', stopSplitterMove);
}

/**
 * Connects the close buttons of the dialogs, closing a dialog by a click on its backdrop, and
 * the help button.
 * @returns {void}
 */
export function startDialogs() {
    getElements('dialog [data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
    getElements('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
    getElement('#btn-help').addEventListener('click', () => openDialog(getElement('#help')));
}
