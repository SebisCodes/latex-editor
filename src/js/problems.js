/**
 * The problems above the code: errors and notes the preview found, with their line, the first
 * 60 listed. A problem leads to its place in the code; the list can be hidden. Its text can be
 * selected to copy it without leaving the place.
 */

import { escapeHtml } from './latex.js?v=17';
import { state, ui, NARROW_SCREEN, getProblems } from './state.js?v=2';
import { getLineIndex, showCodePosition } from './code-view.js?v=6';
import { showCodeElement } from './preview.js?v=6';
import { showPane } from './layout.js?v=6';

/** The most problems listed. */
const MAX_LISTED = 60;

/**
 * Draws the problems box: the counts, a Hide/Show button and the list.
 * @returns {void}
 */
export function renderProblems() {
    const problems = getProblems();
    const box = ui.error;
    if (!problems.length) { box.hidden = true; return; }
    const errors = problems.filter(problem => problem.kind === 'error').length, notes = problems.length - errors;
    const counts = [];
    if (errors) counts.push(`<b>${errors} ${errors === 1 ? 'error' : 'errors'}</b>`);
    if (notes) counts.push(`${notes} ${notes === 1 ? 'note' : 'notes'}`);
    const items = problems.slice(0, MAX_LISTED).map(formatProblem).join('');
    box.innerHTML = `<div class="pr-header"><span>${counts.join(' · ')}</span><button type="button" class="button small" data-toggle-probs>${state.showProblems ? 'Hide' : 'Show'}</button></div>${state.showProblems ? `<ul>${items}</ul>` : ''}`;
    box.classList.toggle('only-warnings', !errors);
    box.hidden = false;
}

/**
 * Returns the list item of a problem.
 * @param {import('./latex.js').Problem} problem - the problem.
 * @param {number} index - its index in the list.
 * @returns {string} the item's HTML.
 */
function formatProblem(problem, index) {
    const isError = problem.kind === 'error';
    return `<li class="${isError ? 'err' : 'warn'}"><div class="pr-row" role="button" tabindex="0" data-prob="${index}"><span class="kind">${isError ? '✕' : '!'}</span><span class="line-number">Line ${getLineIndex(problem.pos) + 1}</span><span>${escapeHtml(problem.msg)}</span></div></li>`;
}

/**
 * Connects the problems box: Enter and Space work as a click on a problem.
 * @returns {void}
 */
export function startProblems() {
    ui.error.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-prob]')) { event.preventDefault(); event.target.click(); }
    });
    ui.error.addEventListener('click', handleProblemClick);
}

/**
 * Hides or shows the list, or leads to a problem's place in the code (a click handler); a
 * click that ends selecting a problem's text does nothing.
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function handleProblemClick(event) {
    if (event.target.closest('[data-prob]') && String(getSelection())) return;
    if (event.target.closest('[data-toggle-probs]')) { state.showProblems = !state.showProblems; renderProblems(); return; }
    const row = event.target.closest('[data-prob]');
    if (!row) return;
    const problem = state.result.problems[+row.dataset.prob];
    if (NARROW_SCREEN.matches) showPane('code');
    showCodePosition(problem.pos);
    showCodeElement();
}
