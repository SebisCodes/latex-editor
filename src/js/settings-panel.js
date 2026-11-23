/**
 * The document settings of the side panel. They are read from the preamble and change it:
 * class, font size, paper, margins, orientation, font, line spacing, language, paragraph
 * spacing, two columns, page numbers, title, author and date. Every change is one undo step.
 * A text without a preamble gets a button that makes it a complete document.
 */

import { escapeHtml } from './latex.js?v=15';
import { state, ui, PIXELS_PER_MM, showToast } from './state.js?v=2';
import {
    PACKAGE_LINES, getDocumentStart, setPreambleLine, hasPackage, getGeometryOptions, setGeometry, getClassInfo, setClass,
    getPaper, setPaper, getFont, setFont, getPreambleValue, setPreambleValue,
} from './preamble.js?v=4';
import { setCodeKeepingCursor } from './preamble-edit.js?v=4';

const PAPER_CHOICES = [
    ['a4paper', 'A4 (210 × 297 mm)'], ['a5paper', 'A5 (148 × 210 mm)'], ['letterpaper', 'US Letter'], ['legalpaper', 'US Legal'],
    ['sq', 'Square 120 × 120 mm (1:1)'], ['p45', 'Portrait 4:5 (120 × 150 mm)'], ['story', 'Story 9:16 (90 × 160 mm)'], ['wide', 'Slide 16:9 (160 × 90 mm)'], ['custom', 'Other size'],
];
const MARGINS = [['', 'As the class sets it'], ['2.5cm', 'Normal (2.5 cm)'], ['2cm', 'Narrow (2 cm)'], ['1.5cm', 'Very narrow (1.5 cm)'], ['3.5cm', 'Wide (3.5 cm)'], ['0mm', 'None'], ['other', 'Other']];
const FONTS = [['lm', 'Latin Modern (the LaTeX font)'], ['lmss', 'Latin Modern Sans'], ['helvet', 'Helvetica / Arial'], ['times', 'Times'], ['palatino', 'Palatino']];
const CLASSES = [['article', 'Article'], ['report', 'Report (chapters)'], ['book', 'Book'], ['letter', 'Letter class']];
const SPREADS = [['1', 'Single'], ['1.1', '1.1'], ['1.25', '1½ lines'], ['1.667', 'Double']];
const FONT_SIZE = /^1[012]pt$/;
const MARGIN_KEYS = /^(left|right|top|bottom|hmargin|vmargin|lmargin|rmargin)$/;
/** The geometry options removed when the margins change. */
const ALL_MARGIN_KEYS = ['margin', 'left', 'right', 'top', 'bottom', 'hmargin', 'vmargin', 'lmargin', 'rmargin', 'tmargin', 'bmargin'];
/** The margins set for "Other". */
const OTHER_MARGINS = [['left', '3cm'], ['right', '2cm'], ['top', '2.5cm'], ['bottom', '2.5cm']];
/** The size set for "Other size". */
const CUSTOM_PAPER = [['paperwidth', '150mm'], ['paperheight', '100mm']];
/** What the user is told after choosing "Other size". */
const CUSTOM_PAPER_HINT = 'Change paperwidth and paperheight in the \\usepackage[…]{geometry} line';
const BABEL = /\\usepackage\s*(\[[^\]]*\])?\s*\{babel\}/;
/** How long typing in the title or author waits before it changes the code, in milliseconds. */
const TYPING_DELAY = 350;
/** The preamble of a text made a complete document; the text goes between. */
const FULL_DOCUMENT_HEAD = '\\documentclass[11pt,a4paper]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amsmath}\n\\usepackage{graphicx}\n\n\\begin{document}\n\n';
const FULL_DOCUMENT_TAIL = '\n\n\\end{document}\n';
/** The timer of each title or author field while typing waits. */
const typingTimers = new WeakMap();

/**
 * Returns the options of a select.
 * @param {Array<[string, string]>} list - the values with their labels.
 * @param {string} current - the selected value.
 * @returns {string} the options' HTML.
 */
function formatOptions(list, current) {
    return list.map(([value, label]) => `<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

/**
 * Returns the line about the document below the settings: pages, words, paper size, language.
 * @returns {string} its HTML, empty before the first rendering.
 */
function formatDocumentInfo() {
    const meta = state.result?.meta;
    if (!meta) return '';
    const words = state.pages.reduce((count, page) => count + (page.querySelector('.content').textContent.match(/[\p{L}\p{N}]+/gu) || []).length, 0);
    return `<div class="doc-info"><b>${state.pages.length}</b> ${state.pages.length === 1 ? 'page' : 'pages'} · about <b>${words.toLocaleString('en')}</b> words · ${Math.round(meta.paper.w / PIXELS_PER_MM)} × ${Math.round(meta.paper.h / PIXELS_PER_MM)} mm${meta.ngerman ? ' · German' : ''}</div>`;
}

/**
 * Draws the document settings from the code; a field being typed into keeps what is typed.
 * @returns {void}
 */
export function renderSettingsPanel() {
    if (ui.inspector.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return;
    const code = state.code;
    const info = getClassInfo(code);
    const documentInfo = formatDocumentInfo();
    if (!info || getDocumentStart(state.code) < 0) {
        ui.inspector.innerHTML = `<p class="hint">This text has no preamble (no <code>\\documentclass</code> and <code>\\begin{document}</code>), so it is shown as a plain A4 article.</p><div class="button-row"><button type="button" class="button primary" id="make-full">Make it a complete document</button></div>${documentInfo}`;
        return;
    }
    ui.inspector.innerHTML = formatSettingsForm(code, info) + documentInfo;
}

/**
 * Returns the margin choice of the code: the geometry margin, "other" for margins set side by
 * side or a margin not in the list, "" for none.
 * @param {Map<string, string|true>|null} geometry - the geometry options.
 * @returns {string} the margin's value in MARGINS.
 */
function getMarginChoice(geometry) {
    const margin = geometry && geometry.has('margin') ? geometry.get('margin') : geometry && [...geometry.keys()].some(key => MARGIN_KEYS.test(key)) ? 'other' : '';
    return MARGINS.some(([value]) => value === margin) ? margin : 'other';
}

/**
 * Returns the line spacing of the code: \linespread, \onehalfspacing or \doublespacing.
 * @param {string} code - the code.
 * @returns {string} the factor.
 */
function getLineSpread(code) {
    return (/\\linespread\{([\d.]+)\}/.exec(code) || [])[1] || (/\\onehalfspacing/.test(code) ? '1.25' : /\\doublespacing/.test(code) ? '1.667' : '1');
}

/**
 * Returns the language of the code: German babel, another babel, or English without babel.
 * @param {string} code - the code.
 * @returns {string} "de", "other" or "en".
 */
function getLanguage(code) {
    return /\\usepackage\s*\[[^\]]*\b(ngerman|german)\b[^\]]*\]\s*\{babel\}/.test(code) ? 'de' : /\\usepackage\s*\[[^\]]*\]\s*\{babel\}/.test(code) ? 'other' : 'en';
}

/**
 * Returns a list of choices with the current value added when it is not in it.
 * @param {Array<[string, string]>} list - the choices.
 * @param {string} current - the current value.
 * @returns {Array<[string, string]>} the choices.
 */
function getChoicesWith(list, current) {
    return list.some(([value]) => value === current) ? list : [...list, [current, current]];
}

/**
 * Returns the settings form for a document with a preamble.
 * @param {string} code - the code.
 * @param {import('./preamble.js').ClassInfo} info - its document class.
 * @returns {string} the form's HTML.
 */
function formatSettingsForm(code, info) {
    const fontSize = info.opts.find(option => FONT_SIZE.test(option)) || '10pt';
    const geometry = getGeometryOptions(code);
    const spread = getLineSpread(code);
    const title = getPreambleValue(code, 'title'), author = getPreambleValue(code, 'author'), date = getPreambleValue(code, 'date');
    const landscape = (geometry && geometry.has('landscape')) || info.opts.includes('landscape');
    return `
        <div class="doc-form">
            <div class="row2">
                <label class="field"><span>Kind</span><select id="d-cls">${formatOptions(getChoicesWith(CLASSES, info.cls), info.cls)}</select></label>
                <label class="field"><span>Font size</span><select id="d-fs">${formatOptions([['10pt', '10 pt'], ['11pt', '11 pt'], ['12pt', '12 pt']], fontSize)}</select></label>
            </div>
            <label class="field"><span>Paper</span><select id="d-paper">${formatOptions(PAPER_CHOICES, getPaper(code))}</select></label>
            <div class="row2">
                <label class="field"><span>Margins</span><select id="d-margin">${formatOptions(MARGINS, getMarginChoice(geometry))}</select></label>
                <label class="field"><span>Orientation</span><select id="d-orient">${formatOptions([['portrait', 'Portrait'], ['landscape', 'Landscape']], landscape ? 'landscape' : 'portrait')}</select></label>
            </div>
            <label class="field"><span>Font</span><select id="d-font">${formatOptions(FONTS, getFont(code))}</select></label>
            <div class="row2">
                <label class="field"><span>Line spacing</span><select id="d-spread">${formatOptions(getChoicesWith(SPREADS, spread), spread)}</select></label>
                <label class="field"><span>Language</span><select id="d-lang">${formatOptions([['en', 'English (no babel)'], ['de', 'German (babel ngerman)'], ['other', 'Other (babel)']], getLanguage(code))}</select></label>
            </div>
            <label class="box"><input type="checkbox" id="d-parskip"${hasPackage('parskip', state.code) ? ' checked' : ''}> Space between paragraphs instead of indenting</label>
            <label class="box"><input type="checkbox" id="d-twocol"${info.opts.includes('twocolumn') ? ' checked' : ''}> Two columns</label>
            <label class="box"><input type="checkbox" id="d-nums"${/\\pagestyle\{empty\}/.test(code) ? '' : ' checked'}> Page numbers</label>
            <p class="subhead">Title</p>
            <label class="field"><span>Title</span><textarea id="d-title" rows="1" spellcheck="true">${escapeHtml(title ? title.value : '')}</textarea></label>
            <label class="field"><span>Author <small>(several: separate with \\and)</small></span><textarea id="d-author" rows="1" spellcheck="false">${escapeHtml(author ? author.value : '')}</textarea></label>
            <label class="field"><span>Date <small>(\\today = the current date)</small></span><input id="d-date" value="${escapeHtml(date ? date.value : '')}" spellcheck="false" placeholder="\\today"></label>
            <div class="button-row"><button type="button" class="button" id="d-maketitle"${/\\maketitle/.test(code) ? ' disabled' : ''}>Show the title (\\maketitle)</button></div>
        </div>`;
}

/**
 * Returns the code with the paper of a select; "Other size" sets a size to change by hand
 * (writeSettingChange() says where).
 * @param {string} code - the code.
 * @param {string} paper - the paper's key.
 * @returns {string} the changed code.
 */
function getCodeWithPaper(code, paper) {
    const changed = setPaper(code, paper);
    if (paper !== 'custom') return changed;
    const geometry = getGeometryOptions(changed) || new Map();
    for (const [key, value] of CUSTOM_PAPER) geometry.set(key, value);
    return setGeometry(changed, geometry);
}

/**
 * Returns the code with the margins of a select.
 * @param {string} code - the code.
 * @param {string} margin - the margin's value in MARGINS.
 * @returns {string} the changed code.
 */
function getCodeWithMargins(code, margin) {
    const geometry = getGeometryOptions(code) || new Map();
    for (const key of ALL_MARGIN_KEYS) geometry.delete(key);
    if (margin === 'other') for (const [key, value] of OTHER_MARGINS) geometry.set(key, value);
    else if (margin) geometry.set('margin', margin);
    return setGeometry(code, geometry);
}

/**
 * Returns the code with the orientation of a select: a geometry option when geometry is
 * loaded, else a class option.
 * @param {string} code - the code.
 * @param {import('./preamble.js').ClassInfo} info - its document class.
 * @param {string} orientation - "portrait" or "landscape".
 * @returns {string} the changed code.
 */
function getCodeWithOrientation(code, info, orientation) {
    const geometry = getGeometryOptions(code);
    const options = info.opts.filter(option => option !== 'landscape');
    if (!geometry) return setClass(code, info.cls, orientation === 'landscape' ? [...options, 'landscape'] : options);
    geometry.delete('landscape');
    geometry.delete('portrait');
    if (orientation === 'landscape') geometry.set('landscape', true);
    return setClass(setGeometry(code, geometry), info.cls, options);
}

/**
 * Returns the code with the line spacing of a select.
 * @param {string} code - the code.
 * @param {string} spread - the factor.
 * @returns {string} the changed code.
 */
function getCodeWithSpread(code, spread) {
    const changed = code.replace(/^\\(onehalfspacing|doublespacing|singlespacing)[ \t]*\n/m, '');
    return setPreambleLine(changed, /\\linespread\{[\d.]+\}/, spread === '1' ? null : `\\linespread{${spread}}`, PACKAGE_LINES);
}

/**
 * Returns the code with the language of a select; "other" leaves it as it is.
 * @param {string} code - the code.
 * @param {string} language - "de", "en" or "other".
 * @returns {string} the changed code.
 */
function getCodeWithLanguage(code, language) {
    if (language === 'de') return setPreambleLine(code, BABEL, '\\usepackage[ngerman]{babel}', PACKAGE_LINES);
    if (language === 'en') return setPreambleLine(code, BABEL, null);
    return code;
}

/**
 * Returns the code changed by a field of the settings.
 * @param {HTMLInputElement|HTMLSelectElement} field - the changed field.
 * @param {string} code - the code.
 * @param {import('./preamble.js').ClassInfo} info - its document class.
 * @returns {string|null} the changed code, null for a field that changes nothing here.
 */
function getChangedCode(field, code, info) {
    const value = field.value;
    switch (field.id) {
        case 'd-cls': return setClass(code, value, info.opts);
        case 'd-fs': return setClass(code, info.cls, [...info.opts.filter(option => !FONT_SIZE.test(option)), ...(value === '10pt' ? [] : [value])]);
        case 'd-paper': return getCodeWithPaper(code, value);
        case 'd-margin': return getCodeWithMargins(code, value);
        case 'd-orient': return getCodeWithOrientation(code, info, value);
        case 'd-font': return setFont(code, value);
        case 'd-spread': return getCodeWithSpread(code, value);
        case 'd-lang': return getCodeWithLanguage(code, value);
        case 'd-parskip': return setPreambleLine(code, /\\usepackage\s*(\[[^\]]*\])?\s*\{parskip\}/, field.checked ? '\\usepackage{parskip}' : null, PACKAGE_LINES);
        case 'd-twocol': return setClass(code, info.cls, field.checked ? [...info.opts, 'twocolumn'] : info.opts.filter(option => option !== 'twocolumn'));
        case 'd-nums': return setPreambleLine(code, /\\pagestyle\{empty\}/, field.checked ? null : '\\pagestyle{empty}', PACKAGE_LINES);
        case 'd-date': return setPreambleValue(code, 'date', value.trim() ? value : null);
        default: return null;
    }
}

/**
 * Writes a changed setting into the code (a change handler).
 * @param {Event} event - the change.
 * @returns {void}
 */
function writeSettingChange(event) {
    const info = getClassInfo(state.code);
    if (!info) return;
    const changed = getChangedCode(event.target, state.code, info);
    if (changed == null) return;
    setCodeKeepingCursor(changed, false);
    if (event.target.id === 'd-paper' && event.target.value === 'custom') showToast(CUSTOM_PAPER_HINT);
}

/**
 * Writes the title or author a little after typing stops (an input handler).
 * @param {InputEvent} event - the input.
 * @returns {void}
 */
function writeTypedValue(event) {
    const field = event.target;
    if (field.id !== 'd-title' && field.id !== 'd-author') return;
    clearTimeout(typingTimers.get(field));
    typingTimers.set(field, setTimeout(() => setCodeKeepingCursor(setPreambleValue(state.code, field.id === 'd-title' ? 'title' : 'author', field.value), false), TYPING_DELAY));
}

/**
 * Runs the buttons of the settings: \maketitle after \begin{document}, and making a text a
 * complete document (a click handler).
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function handleSettingsClick(event) {
    if (event.target.id === 'd-maketitle') {
        const documentStart = getDocumentStart(state.code);
        const bodyStart = documentStart + '\\begin{document}'.length;
        if (documentStart >= 0) setCodeKeepingCursor(state.code.slice(0, bodyStart) + '\n\\maketitle' + state.code.slice(bodyStart), 'Title added');
    }
    if (event.target.id === 'make-full') {
        setCodeKeepingCursor(FULL_DOCUMENT_HEAD + state.code.trim() + FULL_DOCUMENT_TAIL, 'The text is now a complete document');
    }
}

/**
 * Connects the document settings; leaving them draws them again from the code.
 * @returns {void}
 */
export function startSettingsPanel() {
    ui.inspector.addEventListener('change', writeSettingChange);
    ui.inspector.addEventListener('input', writeTypedValue);
    ui.inspector.addEventListener('focusout', () => setTimeout(() => { if (!ui.inspector.contains(document.activeElement)) renderSettingsPanel(); }, 0));
    ui.inspector.addEventListener('click', handleSettingsClick);
}
