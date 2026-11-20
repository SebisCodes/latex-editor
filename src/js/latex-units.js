/**
 * Units of the LaTeX reader: paper sizes, font sizes of the standard classes, TeX lengths as
 * CSS, and xcolor colors as hex values. Also the HTML escaping every part of the reader uses.
 *
 * 1. getCssLength() turns a TeX length ("2cm", "0.5\textwidth") into a CSS length;
 * 2. getModelColor() reads a color given by model and value (\definecolor{x}{HTML}{FF8800});
 * 3. getColorValue() reads a color expression ("red!30!black") with the document's colors.
 */

/** CSS pixels per TeX point. */
export const POINT_PX = 96 / 72.27;
/** CSS pixels per millimeter. */
export const MILLIMETER_PX = 96 / 25.4;
/** CSS pixels per big point (PostScript point). */
const BIG_POINT_PX = 96 / 72;
/** CSS pixels per inch. */
const INCH_PX = 96;
/** Scaled points per point. */
const SCALED_POINTS = 65536;
/** The width of the text block of the standard classes in points, without geometry. */
export const DEFAULT_TEXT_WIDTH_PT = 345;
/** The line spacing factors of setspace's \onehalfspacing and \doublespacing. */
export const ONE_HALF_SPACING = 1.25;
export const DOUBLE_SPACING = 1.667;
/** \baselineskip and \parindent in em, as the pages show them. */
const BASELINE_SKIP_EM = 1.2;
const PARINDENT_EM = 1.5;

/** Characters that HTML text and attribute values must not hold as they are. */
const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/**
 * Returns a text with &, <, > and " written as HTML entities.
 * @param {*} text - the text (anything else is turned into text first).
 * @returns {string} the text safe for HTML content and attribute values.
 */
export const escapeHtml = text => String(text).replace(/[&<>"]/g, character => HTML_ENTITIES[character]);

/** Paper sizes by option name, width and height in millimeters. */
export const PAPERS = {
    a4paper: [210, 297], a5paper: [148, 210], a3paper: [297, 420], b5paper: [176, 250],
    letterpaper: [215.9, 279.4], legalpaper: [215.9, 355.6], executivepaper: [184.15, 266.7],
};

/** The size commands from \tiny to \Huge, in order. */
export const SIZE_NAMES = ['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge'];
/** \tiny … \Huge in points for the 10, 11 and 12 pt classes (same order as SIZE_NAMES). */
export const SIZE_POINTS = {
    10: [5, 7, 8, 9, 10, 12, 14.4, 17.28, 20.74, 24.88],
    11: [6, 8, 9, 10, 10.95, 12, 14.4, 17.28, 20.74, 24.88],
    12: [6, 8, 10, 10.95, 12, 14.4, 17.28, 20.74, 24.88, 24.88],
};
/** Text width of the standard classes on A4 in points, by font size. */
export const TEXT_WIDTH_PT = { 10: 345, 11: 360, 12: 390 };

/** Absolute TeX units in CSS pixels. */
const ABSOLUTE_UNITS = {
    pt: POINT_PX, bp: BIG_POINT_PX, mm: MILLIMETER_PX, cm: 10 * MILLIMETER_PX, in: INCH_PX, px: 1, pc: 12 * POINT_PX,
    dd: 1.07 * POINT_PX, cc: 12.84 * POINT_PX, sp: POINT_PX / SCALED_POINTS,
};

/**
 * Returns a TeX length as CSS: "0.5\textwidth" gives "50%", "2cm" gives "75.59px". Units that
 * depend on the page (\paperwidth, \textheight, \baselineskip …) need the document.
 * @param {string} tex - the TeX length; stretch and shrink (plus, minus) are ignored.
 * @param {?TexDocument} doc - the document for the page units, or null.
 * @returns {?string} the CSS length, "fill" for \fill and \stretch, or null when not readable.
 */
export function getCssLength(tex, doc) {
    const compact = String(tex || '').trim().replace(/\s+/g, '');
    if (!compact) return null;
    const match = /^([-+]?(?:\d*\.\d+|\d+\.?\d*)?)\s*(\\?[A-Za-z]+)?(?:plus.*|minus.*)?$/.exec(compact.replace(/(plus|minus).*$/, ''));
    if (!match) return null;
    const factor = getLengthFactor(match[1]);
    const unit = match[2] || 'pt';
    if (unit in ABSOLUTE_UNITS) return +(factor * ABSOLUTE_UNITS[unit]).toFixed(2) + 'px';
    if (unit === 'em' || unit === 'ex') return +factor.toFixed(3) + unit;
    if (/^\\(textwidth|linewidth|columnwidth|hsize)$/.test(unit)) return +(factor * 100).toFixed(3) + '%';
    return doc ? getPageLength(factor, unit, doc) : null;
}

/**
 * Returns the number in front of a TeX unit: nothing or "+" means 1, "-" means -1.
 * @param {?string} number - the number as written, or undefined.
 * @returns {number} the factor.
 */
function getLengthFactor(number) {
    if (number === '' || number == null) return 1;
    if (number === '-') return -1;
    if (number === '+') return 1;
    return parseFloat(number);
}

/**
 * Returns a length in a unit that depends on the page of the document.
 * @param {number} factor - the number in front of the unit.
 * @param {string} unit - the unit, a command such as "\paperwidth".
 * @param {TexDocument} doc - the document with its page settings.
 * @returns {?string} the CSS length, "fill", or null for an unknown unit.
 */
function getPageLength(factor, unit, doc) {
    const meta = doc.meta;
    if (unit === '\\paperwidth') return +(factor * meta.paper.w).toFixed(2) + 'px';
    if (unit === '\\paperheight') return +(factor * meta.paper.h).toFixed(2) + 'px';
    if (unit === '\\textheight') return +(factor * (meta.paper.h - meta.margin.t - meta.margin.b)).toFixed(2) + 'px';
    if (unit === '\\baselineskip') return +(factor * BASELINE_SKIP_EM).toFixed(3) + 'em';
    if (unit === '\\parindent') return +(factor * PARINDENT_EM).toFixed(3) + 'em';
    if (unit === '\\fill' || unit === '\\stretch') return 'fill';
    return null;
}

/** The colors xcolor knows by name (base colors and a selection of dvipsnames), as hex values. */
const NAMED_COLORS = {
    black: '000000', white: 'ffffff', red: 'ff0000', green: '00ff00', blue: '0000ff', cyan: '00ffff', magenta: 'ff00ff',
    yellow: 'ffff00', gray: '808080', darkgray: '404040', lightgray: 'bfbfbf', brown: 'bf8040', lime: 'bfff00',
    olive: '808000', orange: 'ff8000', pink: 'ffbfbf', purple: 'bf0040', teal: '008080', violet: '800080',
    apricot: 'fbb982', aquamarine: '00b5be', bittersweet: 'c04f17', blueviolet: '473992', brickred: 'b6321c',
    burntorange: 'f7921d', cadetblue: '74729a', cerulean: '00a2e3', cornflowerblue: '41b0e4', darkorchid: 'a4538a',
    emerald: '00a99d', forestgreen: '009b55', fuchsia: '8c368c', goldenrod: 'ffdf42', junglegreen: '00a99a',
    lavender: 'f49ec4', limegreen: '8dc73e', mahogany: 'a9341f', maroon: 'af3235', midnightblue: '006795',
    navyblue: '006eb8', olivegreen: '3c8031', orangered: 'ed135a', orchid: 'af72b0', peach: 'f7965a',
    periwinkle: '7977b8', pinegreen: '008b72', plum: '92268f', processblue: '00b0f0', rawsienna: '974006',
    redorange: 'f26035', redviolet: 'a1246b', rhodamine: 'ef559f', royalblue: '0071bc', royalpurple: '613f99',
    rubinered: 'ed017d', salmon: 'f69289', seagreen: '3fbc9d', sepia: '671800', skyblue: '46c5dd',
    springgreen: 'c6dc67', tan: 'da9d76', tealblue: '00aeb3', thistle: 'd883b7', turquoise: '00b4ce',
    violetred: 'ef58a0', wildstrawberry: 'ee2967', yellowgreen: '98cc70', yelloworange: 'faa21a', dandelion: 'fdbc42',
};

/**
 * Returns a color channel as two hex digits, limited to 0 … 255.
 * @param {number} value - the channel value.
 * @returns {string} two lower-case hex digits.
 */
const formatHexByte = value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');

/**
 * Returns the red, green and blue channels of a hex color.
 * @param {string} hex - six hex digits without "#".
 * @returns {number[]} the three channels, 0 … 255.
 */
const getRgb = hex => [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));

/**
 * Returns a color given by a model and a value, as in \definecolor{x}{HTML}{FF8800}.
 * @param {string} model - HTML, RGB, rgb, gray, cmyk or cmy.
 * @param {string} spec - the value: hex digits, or numbers separated by commas or spaces.
 * @returns {?string} six hex digits without "#", or null for an unknown model or a wrong value.
 */
export function getModelColor(model, spec) {
    const values = String(spec).split(/[\s,]+/).filter(Boolean).map(Number);
    switch (String(model).trim()) {
        case 'HTML': return /^[0-9a-f]{6}$/i.test(spec.trim()) ? spec.trim().toLowerCase() : null;
        case 'RGB': return values.length === 3 ? values.map(formatHexByte).join('') : null;
        case 'rgb': return values.length === 3 ? values.map(value => formatHexByte(value * 255)).join('') : null;
        case 'gray': return values.length === 1 ? formatHexByte(values[0] * 255).repeat(3) : null;
        case 'cmyk': return values.length === 4 ? [0, 1, 2].map(index => formatHexByte(255 * (1 - values[index]) * (1 - values[3]))).join('') : null;
        case 'cmy': return values.length === 3 ? values.map(value => formatHexByte(255 * (1 - value))).join('') : null;
        default: return null;
    }
}

/**
 * Returns the color of an xcolor expression: "red", "red!30", "blue!50!black", "-red" or a name
 * the document defined.
 * @param {string} expression - the color expression.
 * @param {Object<string, string>} definitions - the document's colors, hex values by name.
 * @returns {?string} "#rrggbb", or null when a name is unknown or a percentage is not a number.
 */
export function getColorValue(expression, definitions) {
    let text = String(expression || '').trim().replace(/\s+/g, '');
    if (!text) return null;
    let negative = false;
    if (text[0] === '-') { negative = true; text = text.slice(1); }
    const parts = text.split('!');
    /**
     * Returns the hex value of a color name, the document's own names first.
     * @param {string} name - the color name.
     * @returns {?string} six hex digits, or null.
     */
    const getNamedColor = name => definitions[name] || definitions[name.toLowerCase()] || NAMED_COLORS[name.toLowerCase()] || null;
    let current = getNamedColor(parts[0]);
    if (!current) return null;
    for (let index = 1; index < parts.length; index += 2) {
        const share = Math.max(0, Math.min(100, parseFloat(parts[index]))) / 100;
        if (Number.isNaN(share)) return null;
        const other = parts[index + 1] != null ? getNamedColor(parts[index + 1]) : 'ffffff';
        if (!other) return null;
        const first = getRgb(current), second = getRgb(other);
        current = first.map((channel, channelIndex) => formatHexByte(channel * share + second[channelIndex] * (1 - share))).join('');
    }
    if (negative) current = getRgb(current).map(channel => formatHexByte(255 - channel)).join('');
    return '#' + current;
}
