/**
 * The controls of template placeholders (?template=) in the LaTeX editor: the switch between the
 * example view and the template view in the preview's bar, the note when the example view could
 * not be made, and the "Placeholders" box at the bottom of the code (template-controls.js).
 * Without a template syntax none of them is there.
 */

import { state, ui, getElement } from './state.js?v=2';
import { setCodeRange } from './code-insert.js?v=7';
import { addHistoryStep } from './history.js?v=7';
import { renderPreview } from './preview.js?v=7';
import { startViewSwitch, showViewSwitch, showViewNote, createPlaceholderBox } from './template-controls.js?v=1';
import { buildDocumentPlaceholders } from './template-examples.js?v=1';
import { TEMPLATE_SYNTAX, getViewMode, setViewMode, isExampleViewFailed, getTemplateExamples } from './preview-views.js?v=2';

/** The box, once connected. */
let placeholderBox = null;
/** What the box lists: the examples it was drawn for, or the document's tags. */
let listedKey = null;
/** The page's template placeholders the preview and the controls were last drawn with. */
let shownExamples = null;

/**
 * Connects the switch of the views and the box; without a template syntax nothing.
 * @returns {void}
 */
export function startTemplateControls() {
    if (!TEMPLATE_SYNTAX) return;
    startViewSwitch(getElement('#view-switch'), mode => { setViewMode(mode); renderPreview(); });
    placeholderBox = createPlaceholderBox(getElement('#placeholder-box'), {
        syntax: TEMPLATE_SYNTAX, textarea: ui.ta,
        insertText: (start, end, text, selectionStart, selectionEnd) => { setCodeRange(start, end, text, selectionStart, selectionEnd); addHistoryStep(); },
    });
}

/**
 * Shows the view chosen, the note when the example view could not be made, and the
 * placeholders in the box: the page's list, else the tags of the document.
 * @returns {void}
 */
export function renderTemplateControls() {
    const examples = getTemplateExamples();
    shownExamples = examples;
    if (!placeholderBox) return;
    showViewSwitch(getElement('#view-switch'), getViewMode());
    showViewNote(getElement('#view-note'), isExampleViewFailed());
    const placeholders = examples && examples.placeholders.length ? examples.placeholders : buildDocumentPlaceholders(state.code, TEMPLATE_SYNTAX);
    const key = examples && examples.placeholders.length ? examples : placeholders.map(placeholder => placeholder.kind + ':' + placeholder.name).join('\n');
    if (key === listedKey) return;
    listedKey = key;
    placeholderBox.render(placeholders);
}

/**
 * Draws the preview and its controls at once when the page's template placeholders differ from
 * the ones they show: a template that comes with a document (or before it) shows from the first
 * paint, in the preview and in the box.
 * @returns {void}
 */
export function updateTemplateView() {
    if (getTemplateExamples() !== shownExamples) renderPreview();
}
