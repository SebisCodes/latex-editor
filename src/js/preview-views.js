/**
 * The two views of a template's preview (?template=): the example view, the template filled with
 * the page's examples (the default), and the template view, the tags shown as their text.
 *
 * renderDocument() runs these steps:
 *   1. without a template syntax, read the code as plain LaTeX;
 *   2. read the template as written: its problems are the list of problems in both views, and it
 *      is the template view;
 *   3. in the example view, fill the template (latex-examples.js), read the filled text and lead
 *      its places back to the code; when filling or reading fails, the template view is shown
 *      with a note.
 * Exports of the code and what is made of it (HTML, text, page pictures) use the template view;
 * print and PDF follow the view shown.
 */

import { render } from './latex.js?v=18';
import { state, areas } from './state.js?v=2';
import { getTemplateSyntax, getTemplateNameByAddress } from './template-tags.js?v=2';
import { buildViewTitle } from './template-controls.js?v=2';
import { buildLatexView, convertRenderResult } from './latex-examples.js?v=2';

/** The template syntax of the placeholders the page asked for with ?template= in the address, or null. */
export const TEMPLATE_NAME = getTemplateNameByAddress(location.search);
/** The syntax itself, or null. */
export const TEMPLATE_SYNTAX = getTemplateSyntax(TEMPLATE_NAME);
/** The view that shows the template filled with the examples. */
export const EXAMPLE_VIEW = 'example';
/** The view that shows the tags as their text. */
export const TEMPLATE_VIEW = 'template';

/**
 * The state of the views.
 * @typedef {object} ViewState
 * @property {string} mode - the view chosen: EXAMPLE_VIEW or TEMPLATE_VIEW.
 * @property {boolean} failed - true when the example view could not be made and the template view is shown.
 * @property {?{code: string, assets: object, result: import('./latex.js').RenderResult}} template - the last reading of the template as written.
 */

/** @type {ViewState} */
const views = { mode: EXAMPLE_VIEW, failed: false, template: null };

/**
 * Returns the view chosen.
 * @returns {string} EXAMPLE_VIEW or TEMPLATE_VIEW.
 */
export function getViewMode() {
    return views.mode;
}

/**
 * Sets the view chosen.
 * @param {string} mode - EXAMPLE_VIEW or TEMPLATE_VIEW.
 * @returns {void}
 */
export function setViewMode(mode) {
    views.mode = mode === TEMPLATE_VIEW ? TEMPLATE_VIEW : EXAMPLE_VIEW;
}

/**
 * Tells whether the pages show the example view.
 * @returns {boolean} true with a template syntax, the example view chosen and made.
 */
export function isExampleViewShown() {
    return Boolean(TEMPLATE_SYNTAX) && views.mode === EXAMPLE_VIEW && !views.failed;
}

/**
 * Tells whether the example view was chosen but could not be made.
 * @returns {boolean} true while the template view stands in for it.
 */
export function isExampleViewFailed() {
    return Boolean(TEMPLATE_SYNTAX) && views.mode === EXAMPLE_VIEW && views.failed;
}

/**
 * Returns the page's examples for the open document.
 * @returns {?import('./template-examples.js').TemplateExamples} the examples, null without a page or away from its document.
 */
export function getTemplateExamples() {
    return areas.sync?.getTemplate() || null;
}

/**
 * Reads the code for the pages (the steps in the header).
 * @param {string} code - the code.
 * @param {Object<string, string>} assets - the document's pictures by name.
 * @returns {import('./latex.js').RenderResult} what the pages show; the problems are the template's.
 */
export function renderDocument(code, assets) {
    if (!TEMPLATE_SYNTAX) return render(code, { assets, template: null });
    const templateResult = getTemplateResult(code, assets);
    views.failed = false;
    if (views.mode === TEMPLATE_VIEW) return templateResult;
    try {
        const view = buildLatexView(code, TEMPLATE_SYNTAX, getTemplateExamples());
        const result = convertRenderResult(render(view.text, { assets, provenance: view.provenance }), view.map);
        return { ...result, problems: templateResult.problems };
    } catch (error) {
        console.error(error);
        views.failed = true;
        return templateResult;
    }
}

/**
 * Returns the reading of the template as written, kept while code and pictures stay the same.
 * A query that fills a cache.
 * @param {string} code - the code.
 * @param {Object<string, string>} assets - the document's pictures by name.
 * @returns {import('./latex.js').RenderResult} the result with the tags as their text.
 */
export function getTemplateResult(code, assets) {
    const kept = views.template;
    if (kept && kept.code === code && kept.assets === assets) return kept.result;
    const result = render(code, { assets, template: TEMPLATE_NAME });
    views.template = { code, assets, result };
    return result;
}

/**
 * Returns the title of a print or PDF of the pages shown: the document's name, with a template
 * syntax followed by the view it shows.
 * @param {string} name - the document's name.
 * @returns {string} the title, e.g. "Letter (example view)".
 */
export function getViewTitle(name) {
    if (!TEMPLATE_SYNTAX) return name;
    return buildViewTitle(name, isExampleViewShown() ? EXAMPLE_VIEW : TEMPLATE_VIEW, text => areas.i18n?.translate(text) ?? text);
}

/**
 * Returns the reading of the code as written: the template's while the pages show the example
 * view, else the pages' own (for the AI prompt and the agent, which see the code).
 * @returns {?import('./latex.js').RenderResult} the reading, null before the first one.
 */
export function getCodeResult() {
    return getExportResult() || state.result;
}

/**
 * Returns the reading the exports of the code use: the template as written when the pages show
 * the example view, else what the pages show.
 * @returns {?import('./latex.js').RenderResult} the template's result in the example view, null when it is the shown one.
 */
export function getExportResult() {
    return isExampleViewShown() ? getTemplateResult(state.code, state.assets) : null;
}
