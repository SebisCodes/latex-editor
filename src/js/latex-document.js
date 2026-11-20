/**
 * The document state of one pass of the LaTeX reader: page settings (meta), macros,
 * environments, theorems, colors, counters, labels, outline, footnotes and problems, and the
 * page layout (paper and margins) the preamble chooses.
 *
 * The file is longer than the usual guide: it holds the one class that holds the document being
 * read, with the typedefs the reader shares; splitting it further would scatter one topic.
 */

import { POINT_PX, MILLIMETER_PX, DEFAULT_TEXT_WIDTH_PT, PAPERS, SIZE_NAMES, SIZE_POINTS, TEXT_WIDTH_PT, getCssLength, getColorValue } from './latex-units.js?v=3';
import { parseKeyValues } from './latex-scan.js?v=2';

/** At most this many problems are kept per pass. */
const PROBLEM_LIMIT = 200;
/** The width of A4 paper in millimeters, the paper the standard text width is set for. */
const A4_WIDTH_MM = 210;
/** The height of A4 paper in millimeters. */
const A4_HEIGHT_MM = 297;
/** The gap between the columns of a two-column document in points. */
const COLUMN_GAP_PT = 10;
/** The month names of a German date. */
const GERMAN_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
/** The KOMA-Script classes, which have wider margins. */
const KOMA_CLASSES = ['scrartcl', 'scrreprt', 'scrbook', 'scrlttr2'];
/** geometry options that set the margins or the text block. */
const MARGIN_OPTIONS = ['margin', 'total', 'width', 'textwidth', 'hmargin', 'vmargin', 'left', 'lmargin', 'top', 'tmargin', 'scale'];
/** The standard classes: the widest text block as a share of the paper width. */
const MAX_TEXT_WIDTH_SHARE = 0.72;
/** The standard classes: the top margin as a share of the paper height, at most MAX_TOP_MARGIN_PX. */
const TOP_MARGIN_SHARE = 0.12;
const MAX_TOP_MARGIN_PX = 160;
/** The standard classes: the bottom margin as a share of the paper height. */
const BOTTOM_MARGIN_SHARE = 0.14;
/** KOMA-Script divides the paper into this many strips; the margins take one (inner, top) and two (outer, bottom) of them. */
const KOMA_STRIPS = 7;
/** KOMA-Script: how much of its strips the outer, top and bottom margins take on screen. */
const KOMA_OUTER_FACTOR = 0.75;
const KOMA_TOP_FACTOR = 0.8;
const KOMA_BOTTOM_FACTOR = 0.7;

/**
 * A problem found while reading, with its place in the code.
 * @typedef {object} Problem
 * @property {number} pos - the offset in the code.
 * @property {string} msg - the message for the user.
 * @property {string} kind - "error" or "warning".
 */

/**
 * A label and what it refers to.
 * @typedef {object} Label
 * @property {string} num - the number shown by \ref.
 * @property {string} kind - what is numbered (section, equation, figure, cite …).
 * @property {string} id - the id of the anchor on the page.
 * @property {number} pos - the offset of the \label in the code.
 */

/**
 * An entry of the outline (a sectioning command).
 * @typedef {object} OutlineEntry
 * @property {number} level - the level, -1 (part) to 5 (subparagraph).
 * @property {string} num - the number, empty when unnumbered.
 * @property {string} title - the title as plain text.
 * @property {number} pos - the offset in the code.
 * @property {string} id - the id of the heading on the page.
 * @property {boolean} star - true for the starred form.
 * @property {string} html - the title as HTML.
 */

/**
 * The page settings a document chooses: class, font size, paper, margins, title, fonts,
 * language and more (the fields the page layout in viewer.js and the settings panel read).
 * @typedef {object} Meta
 * @property {string} cls - the document class.
 * @property {number} fs - the font size in points.
 * @property {{w: number, h: number, name: string}} paper - the paper in CSS pixels and its name.
 * @property {?{t: number, r: number, b: number, l: number}} margin - the margins in CSS pixels.
 */

/**
 * The options of a reading pass.
 * @typedef {object} RenderOptions
 * @property {?Object<string, string>} [assets] - the pictures of the document, data URIs by name.
 * @property {?PreviousPass} [prev] - the result of the first pass, for the second.
 */

/**
 * A macro of the document (\newcommand, \def …).
 * @typedef {object} Macro
 * @property {number} n - the number of arguments.
 * @property {?string} def - the default of the first argument (optional argument), or null.
 * @property {string} body - the macro's code, #1 … #9 for the arguments.
 */

/**
 * Margins in CSS pixels while they are chosen.
 * @typedef {object} Margins
 * @property {number} left - the left margin.
 * @property {number} right - the right margin.
 * @property {number} top - the top margin.
 * @property {number} bottom - the bottom margin.
 */

/**
 * The labels, outline and captions of the first pass, which the second pass refers to.
 * @typedef {object} PreviousPass
 * @property {Object<string, Label>} labels - the labels by name.
 * @property {OutlineEntry[]} outline - the outline.
 * @property {object[]} captions - the captions of floats (kind, num, html, id).
 */

/**
 * The document state of one reading pass.
 */
export class TexDocument {
    /**
     * Creates the state of a pass over a code.
     * @param {string} source - the whole LaTeX code.
     * @param {RenderOptions} options - the pictures of the document and the result of the
     *     previous pass.
     * @returns {void}
     */
    constructor(source, options) {
        this.src = source;
        this.opts = options;
        this.assets = options.assets || {};
        this.prev = options.prev || null;
        this.macros = new Map();
        this.envs = new Map();
        this.theorems = new Map();
        this.colors = {};
        this.counters = { part: 0, chapter: 0, section: 0, subsection: 0, subsubsection: 0, paragraph: 0, subparagraph: 0,
            equation: 0, figure: 0, table: 0, footnote: 0, page: 1, algorithm: 0, lstlisting: 0, mpfootnote: 0 };
        this.labels = {};
        this.outline = [];
        this.problems = [];
        this.reported = new Set();
        this.notes = [];
        this.secId = 0;
        this.anchorId = 0;
        this.target = { num: '', kind: '', id: '' };
        this.expansions = 0;
        this.bib = [];
        this.meta = {
            cls: 'article', fs: 10, paper: { w: A4_WIDTH_MM * MILLIMETER_PX, h: A4_HEIGHT_MM * MILLIMETER_PX, name: 'a4paper' }, margin: null, twocolumn: false,
            landscape: false, title: '', author: '', date: null, titleSet: false, parskip: false, parindent: null, parskipLen: null,
            spread: 1, sans: false, pagestyle: 'plain', numbering: 'arabic', pagecolor: null, lang: 'en', secnumdepth: 3,
            tocdepth: 3, columns: 1, ngerman: false, hasDocument: false, packages: [], fontColor: null, firstPage: 1,
            raggedright: false, fontScale: 1, fontFamily: null, subtitle: '', extraTitle: [],
        };
    }

    /**
     * Adds a problem (at most PROBLEM_LIMIT per pass).
     * @param {number} position - the offset in the code.
     * @param {string} message - the message for the user.
     * @param {string} [kind='warning'] - "error" or "warning".
     * @param {?string} [onceKey=null] - when set, a problem with the same key is reported once only.
     * @returns {void}
     */
    addProblem(position, message, kind = 'warning', onceKey = null) {
        if (onceKey) { if (this.reported.has(onceKey)) return; this.reported.add(onceKey); }
        if (this.problems.length < PROBLEM_LIMIT) this.problems.push({ pos: position, msg: message, kind });
    }

    /**
     * Returns the size of a size command (\small …) in points for the document's font size.
     * @param {string} name - the size command without backslash.
     * @returns {number} the size in points.
     */
    getSizePoints(name) {
        const index = SIZE_NAMES.indexOf(name);
        return SIZE_POINTS[this.meta.fs] ? SIZE_POINTS[this.meta.fs][index] : SIZE_POINTS[10][index] * this.meta.fs / 10;
    }

    /**
     * Returns a word LaTeX puts on the page (Figure, Contents …) in the document's language.
     * @param {string} key - the word's key (figure, table, contents, lof …).
     * @returns {string} the English or German word, or the key itself when unknown.
     */
    getWord(key) {
        const german = this.meta.ngerman;
        const words = {
            figure: german ? 'Abbildung' : 'Figure', table: german ? 'Tabelle' : 'Table', contents: german ? 'Inhaltsverzeichnis' : 'Contents',
            abstract: german ? 'Zusammenfassung' : 'Abstract', references: german ? 'Literatur' : 'References',
            bibliography: german ? 'Literaturverzeichnis' : 'Bibliography', chapter: german ? 'Kapitel' : 'Chapter', proof: german ? 'Beweis' : 'Proof',
            part: german ? 'Teil' : 'Part', algorithm: german ? 'Algorithmus' : 'Algorithm', listing: 'Listing', page: german ? 'Seite' : 'page',
            section: german ? 'Abschnitt' : 'Section', equation: german ? 'Gleichung' : 'Equation', appendix: german ? 'Anhang' : 'Appendix',
            lof: german ? 'Abbildungsverzeichnis' : 'List of Figures', lot: german ? 'Tabellenverzeichnis' : 'List of Tables',
        };
        return words[key] || key;
    }

    /**
     * Returns today's date as \today writes it in the document's language.
     * @returns {string} the month written out: "<Month> D, YYYY" in English, "D. <Month> YYYY" in German.
     */
    getToday() {
        const date = new Date();
        return this.meta.ngerman
            ? `${date.getDate()}. ${GERMAN_MONTHS[date.getMonth()]} ${date.getFullYear()}`
            : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    /**
     * Returns the width of the text block.
     * @returns {number} the width in CSS pixels.
     */
    getTextWidth() { const meta = this.meta; return meta.margin ? meta.paper.w - meta.margin.l - meta.margin.r : DEFAULT_TEXT_WIDTH_PT * POINT_PX; }

    /**
     * Returns the width of a line: the text block, or one column of a two-column document.
     * @returns {number} the width in CSS pixels.
     */
    getLineWidth() { const width = this.getTextWidth(); return this.meta.twocolumn ? (width - COLUMN_GAP_PT * POINT_PX) / 2 : width; }

    /**
     * Returns the chapter number and a dot in front of numbers of classes with chapters.
     * @returns {string} e.g. "2." in a report or book, else an empty text.
     */
    getChapterPrefix() { return this.meta.cls === 'report' || this.meta.cls === 'book' || this.meta.cls === 'scrreprt' || this.meta.cls === 'scrbook' ? this.counters.chapter + '.' : ''; }

    /**
     * Resolves a color expression with the document's colors; an unknown color is reported
     * once (the reader collects problems as it reads).
     * @param {string} expression - the xcolor expression.
     * @param {number} position - the offset in the code, for the problem.
     * @returns {?string} "#rrggbb", or null when unknown.
     */
    getResolvedColor(expression, position) {
        const color = getColorValue(expression, this.colors);
        if (!color) this.addProblem(position, `Unknown color "${expression}" - define it with \\definecolor{${expression}}{HTML}{RRGGBB}`, 'warning', 'color:' + expression);
        return color;
    }

    /**
     * Resolves the picture of an \includegraphics: a data URI or https address as it is, else a
     * picture of the document by name (with or without extension and folder). A missing
     * picture is reported once (the reader collects problems as it reads).
     * @param {string} name - the file name as written.
     * @param {number} position - the offset in the code, for the problem.
     * @returns {?string} the picture's address, "example" for the example-image pictures of
     *     mwe, or null when missing.
     */
    getImageSource(name, position) {
        const fileName = String(name).trim();
        if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(fileName)) return fileName;
        if (/^https:\/\//i.test(fileName)) return fileName;
        const pictures = this.assets;
        const wanted = fileName.replace(/^\.\//, '');
        if (pictures[wanted]) return pictures[wanted];
        const stem = wanted.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
        for (const key of Object.keys(pictures)) {
            const lowerKey = key.toLowerCase();
            if (lowerKey === wanted.toLowerCase() || lowerKey.replace(/\.[a-z0-9]+$/i, '') === stem || lowerKey.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '') === stem.replace(/^.*\//, '')) return pictures[key];
        }
        if (/^example-image(-[abc])?(\.\w+)?$/.test(wanted) || /^example-image-(a|b|c)$/.test(stem)) return 'example';
        this.addProblem(position, `Image "${fileName}" not found - drag the picture into the editor (or add it in the Pictures tab)`, 'warning', 'img:' + fileName);
        return null;
    }

    /**
     * Returns the macros KaTeX knows in math: the document's macros without optional argument
     * and its \DeclareMathOperator operators. Fills a cache on the first call.
     * @returns {Object<string, string>} the macro bodies by "\name".
     */
    getMathMacros() {
        if (this._mm) return this._mm;
        const macros = {};
        for (const [name, macro] of this.macros) if (macro.def == null) macros['\\' + name] = macro.body;
        Object.assign(macros, Object.fromEntries(Object.entries(this.mathOps || {}).map(([name, body]) => ['\\' + name, body])));
        this._mm = macros;
        return macros;
    }

    /**
     * Sets the paper from geometry options and keeps the margin options for updateLayout().
     * @param {string} options - the options of \usepackage[…]{geometry} or \geometry{…}.
     * @returns {void}
     */
    setGeometry(options) {
        const values = parseKeyValues(options);
        const meta = this.meta;
        /**
         * Returns a length in pixels, or null when it is not absolute.
         * @param {string} value - the TeX length.
         * @returns {?number} the length in CSS pixels.
         */
        const getPixels = value => { const css = getCssLength(value, null); return css && css.endsWith('px') ? parseFloat(css) : null; };
        for (const [key, value] of values) {
            if (PAPERS[key]) { meta.paper = { w: PAPERS[key][0] * MILLIMETER_PX, h: PAPERS[key][1] * MILLIMETER_PX, name: key }; continue; }
            if (key === 'paper' && PAPERS[value]) { meta.paper = { w: PAPERS[value][0] * MILLIMETER_PX, h: PAPERS[value][1] * MILLIMETER_PX, name: value }; continue; }
            if (key === 'landscape') { meta.landscape = true; continue; }
            if (key === 'portrait') { meta.landscape = false; continue; }
            if (key === 'paperwidth' && getPixels(value)) { meta.paper = { ...meta.paper, w: getPixels(value), name: 'custom' }; continue; }
            if (key === 'paperheight' && getPixels(value)) { meta.paper = { ...meta.paper, h: getPixels(value), name: 'custom' }; continue; }
            if (key === 'papersize') { const [width, height] = String(value).replace(/[{}]/g, '').split(',').map(getPixels); if (width && height) meta.paper = { w: width, h: height, name: 'custom' }; continue; }
            meta.geo = meta.geo || {};
            meta.geo[key] = value;
        }
    }

    /**
     * Sets the margins as LaTeX would choose them, or from the geometry options; a landscape
     * paper is turned first.
     * @returns {void}
     */
    updateLayout() {
        const meta = this.meta;
        if (meta.landscape && meta.paper.w < meta.paper.h) meta.paper = { ...meta.paper, w: meta.paper.h, h: meta.paper.w };
        const pageWidth = meta.paper.w, pageHeight = meta.paper.h;
        const geometry = meta.geo || {};
        const standardWidth = (TEXT_WIDTH_PT[meta.fs] || DEFAULT_TEXT_WIDTH_PT) * POINT_PX * (pageWidth / (A4_WIDTH_MM * MILLIMETER_PX)) ** 0.5;
        const margins = {
            left: (pageWidth - Math.min(standardWidth, pageWidth * MAX_TEXT_WIDTH_SHARE)) / 2, right: 0,
            top: Math.min(pageHeight * TOP_MARGIN_SHARE, MAX_TOP_MARGIN_PX), bottom: pageHeight * BOTTOM_MARGIN_SHARE,
        };
        margins.right = margins.left;
        if (KOMA_CLASSES.includes(meta.cls)) {
            margins.left = pageWidth / KOMA_STRIPS;
            margins.right = pageWidth * 2 / KOMA_STRIPS * KOMA_OUTER_FACTOR;
            margins.top = pageHeight / KOMA_STRIPS * KOMA_TOP_FACTOR;
            margins.bottom = pageHeight * 2 / KOMA_STRIPS * KOMA_BOTTOM_FACTOR;
        }
        if (MARGIN_OPTIONS.some(key => geometry[key] != null)) setGeometryMargins(margins, geometry, pageWidth, pageHeight);
        meta.margin = { t: Math.max(0, margins.top), r: Math.max(0, margins.right), b: Math.max(0, margins.bottom), l: Math.max(0, margins.left) };
    }
}

/**
 * Returns a geometry length in pixels, or a fraction for a percentage.
 * @param {string} value - the TeX length.
 * @returns {?number} CSS pixels, a fraction of 1, or null.
 */
function getGeometryLength(value) {
    const css = getCssLength(value, null);
    if (!css) return null;
    if (css.endsWith('px')) return parseFloat(css);
    if (css.endsWith('%')) return parseFloat(css) / 100;
    return null;
}

/** geometry options for one margin each, and the margin they set. */
const SINGLE_MARGINS = [['left', 'left'], ['lmargin', 'left'], ['inner', 'left'], ['right', 'right'], ['rmargin', 'right'], ['outer', 'right'],
    ['top', 'top'], ['tmargin', 'top'], ['bottom', 'bottom'], ['bmargin', 'bottom']];

/**
 * Sets the margins from the geometry options: margin, scale, hmargin, vmargin, the text
 * width and height, then the single margins; a left or top margin alone is used on both sides.
 * @param {Margins} margins - the margins, changed in place.
 * @param {Object<string, (string|boolean)>} geometry - the geometry options.
 * @param {number} pageWidth - the paper width in pixels.
 * @param {number} pageHeight - the paper height in pixels.
 * @returns {void}
 */
function setGeometryMargins(margins, geometry, pageWidth, pageHeight) {
    const margin = geometry.margin != null ? getGeometryLength(geometry.margin) : null;
    if (margin != null) { margins.left = margins.right = margins.top = margins.bottom = margin; }
    if (geometry.scale != null) {
        const scale = parseFloat(geometry.scale) || 0.7;
        margins.left = margins.right = pageWidth * (1 - scale) / 2; margins.top = margins.bottom = pageHeight * (1 - scale) / 2;
    }
    const horizontal = geometry.hmargin != null ? getGeometryLength(geometry.hmargin) : null; if (horizontal != null) margins.left = margins.right = horizontal;
    const vertical = geometry.vmargin != null ? getGeometryLength(geometry.vmargin) : null; if (vertical != null) margins.top = margins.bottom = vertical;
    if (geometry.width != null || geometry.textwidth != null) {
        const width = getGeometryLength(geometry.width ?? geometry.textwidth);
        if (width) { const textWidth = width < 2 ? pageWidth * width : width; margins.left = margins.right = (pageWidth - textWidth) / 2; }
    }
    if (geometry.height != null || geometry.textheight != null) {
        const height = getGeometryLength(geometry.height ?? geometry.textheight);
        if (height) { const textHeight = height < 2 ? pageHeight * height : height; margins.top = margins.bottom = (pageHeight - textHeight) / 2; }
    }
    for (const [key, side] of SINGLE_MARGINS) {
        if (geometry[key] != null) { const value = getGeometryLength(geometry[key]); if (value != null) margins[side] = value; }
    }
    if (geometry.left != null && geometry.right == null && geometry.rmargin == null && margin == null && horizontal == null) margins.right = margins.left;
    if (geometry.top != null && geometry.bottom == null && geometry.bmargin == null && margin == null && vertical == null) margins.bottom = margins.top;
}
