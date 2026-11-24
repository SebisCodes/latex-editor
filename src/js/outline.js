/**
 * The Structure tab of the side panel: the sections of the document as an outline. A click
 * puts the code's cursor at the section and scrolls the pages to its heading (on narrow
 * screens the pages pane is shown).
 */

import { escapeHtml } from './latex.js?v=17';
import { state, ui, NARROW_SCREEN } from './state.js?v=2';
import { showCodePosition } from './code-view.js?v=7';
import { updatePageLabel } from './zoom.js?v=7';
import { showPane } from './layout.js?v=7';

/** Pixels above a heading when the pages scroll to it. */
const HEADING_TOP_MARGIN = 20;

/**
 * Draws the outline of the sections, indented by their level.
 * @returns {void}
 */
export function renderOutline() {
    const outline = state.result ? state.result.outline : [];
    if (!outline.length) { ui.tree.innerHTML = '<li class="muted" style="padding:8px">No sections yet - add one with \\section{…}.</li>'; return; }
    ui.tree.innerHTML = outline.map(section => `<li class="lv${section.level}"><button type="button" class="choice" style="--t:${Math.max(0, section.level - 1)}" data-pos="${section.pos}" data-id="${section.id}" data-no-i18n><span class="num">${escapeHtml(section.num)}</span><span>${escapeHtml(section.title)}</span></button></li>`).join('');
}

/**
 * Connects the outline's buttons.
 * @returns {void}
 */
export function startOutline() {
    ui.tree.addEventListener('click', showClickedSection);
}

/**
 * Shows a section of the outline in the code and on the pages (a click handler).
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function showClickedSection(event) {
    const button = event.target.closest('[data-pos]');
    if (!button) return;
    const heading = ui.pages.querySelector('#' + CSS.escape(button.dataset.id));
    if (NARROW_SCREEN.matches) showPane('draw');
    showCodePosition(+button.dataset.pos, !NARROW_SCREEN.matches);
    if (heading) requestAnimationFrame(() => showHeadingAtTop(heading));
}

/**
 * Scrolls the pages so a heading is near the top of the view, and updates the page label.
 * @param {Element} heading - the heading on the pages.
 * @returns {void}
 */
function showHeadingAtTop(heading) {
    const view = ui.scroller.getBoundingClientRect();
    ui.scroller.scrollTop += heading.getBoundingClientRect().top - view.top - HEADING_TOP_MARGIN;
    updatePageLabel();
}
