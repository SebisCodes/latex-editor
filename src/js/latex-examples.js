/**
 * The example view of the LaTeX editor: the template filled with the page's examples
 * (template-expansion.js), each example written for its place in LaTeX, and the result of the
 * reader led back to the code.
 *
 * renderExampleView() runs these steps:
 *   1. find the place of every tag in the code: text, math, verbatim, \verb, a comment, or the
 *      argument of a command that names a file or an address;
 *   2. fill the template: text gets LaTeX's special characters escaped, math a \text group,
 *      verbatim and comments the text itself without what would end them, a file or address
 *      argument a plain name;
 *   3. read the filled text with the provenance of its parts, so a picture or link whose address
 *      holds filled text loads nothing (an example picture comes from memory) and runs of text
 *      stay within one part;
 *   4. lead every place of the result (blocks, runs, outline, labels, notes) back to the code;
 *      a run of filled text loses its source place and stays read-only on the pages.
 */

import { convertTemplateTagsToLetters, getTemplateTags } from './template-tags.js?v=2';
import { expandTemplate, getCodeOffsetByViewOffset, getCopiedCodeRange, findFillAt } from './template-expansion.js?v=2';

/** The characters of text that LaTeX reads as commands, written as text. */
const TEXT_ESCAPES = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&', '#': '\\#', '^': '\\textasciicircum{}', '_': '\\_', '~': '\\textasciitilde{}', '%': '\\%' };
/** The environments whose content LaTeX shows as written. */
const VERBATIM_ENVIRONMENTS = /^(verbatim|Verbatim|lstlisting|minted|comment)\*?$/;
/** The environments whose content is math. */
const MATH_ENVIRONMENTS = /^(equation|align|alignat|flalign|gather|multline|eqnarray|math|displaymath)\*?$/;
/** The commands whose argument names a file or an address, open up to a tag. */
const REFERENCE_BEFORE_TAG = /\\(includegraphics|href|url|nolinkurl|input|include|includepdf|hyperimage)\*?\s*(\[[^\]]*\]\s*)*\{[^{}\n]*$/;
/** What a filled file name or address keeps out: braces, backslash, comment and spaces. */
const REFERENCE_UNSAFE = /[{}\\%#\s]/g;
/** How many characters of the filled text before a fill the expansion hands over. */
const SEEN_LENGTH = 64;
/** The entities of the reader's escapeHtml, with the character each stands for. */
const RUN_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"' };

/**
 * Where a tag stands in the code.
 * @typedef {object} TagPlace
 * @property {string} kind - "text", "math", "verbatim", "verb", "comment", "reference", "command" (right after a
 *     backslash, where letters would make a command name) or "word" (after the letters of a command name,
 *     which letters would continue).
 * @property {string} [delimiter] - verb: the character that ends the \verb.
 */

/**
 * A stretch of the code that is a comment, verbatim, \verb or math.
 * @typedef {object} LatexZone
 * @property {string} kind - "comment", "verbatim", "verb" or "math".
 * @property {number} start - where it starts.
 * @property {number} end - where it ends.
 * @property {string} [delimiter] - verb: the character that ends it.
 */

/**
 * The filled text with its map, and what the reader asks about its parts.
 * @typedef {object} LatexView
 * @property {string} text - the filled text.
 * @property {import('./template-expansion.js').ViewSegment[]} map - its map to the code.
 * @property {ViewProvenance} provenance - what the reader asks about the parts of the text.
 */

/**
 * What the reader asks about the parts of the filled text (RenderOptions.provenance).
 * @typedef {object} ViewProvenance
 * @property {function(number, number): boolean} isCopied - true when a stretch is copied text of one piece.
 * @property {function(number, number): ?string} getExamplePicture - the data address of the example picture
 *     that a stretch is exactly the fill of, else null.
 * @property {Set<number>} partStarts - the places where a part of the text starts.
 */

/**
 * Fills the template with the examples for the LaTeX reader (steps 1 and 2 of the header).
 * @param {string} code - the template.
 * @param {import('./template-tags.js').TemplateSyntax} syntax - the syntax.
 * @param {?import('./template-examples.js').TemplateExamples} examples - the page's examples.
 * @returns {LatexView} the filled text, its map and its provenance.
 * @throws {import('./template-expansion.js').TemplateExpansionError} when the filling goes past its limits.
 */
export function buildLatexView(code, syntax, examples) {
    const places = getTagPlaces(code, syntax);
    const view = expandTemplate(code, syntax, { examples, writeFill: (tag, fill, before) => writeLatexFill(getFillPlace(places.get(tag.start), before), fill) });
    return { ...view, provenance: createProvenance(view) };
}

/**
 * Returns the place of every tag of the code, by the tag's start.
 * @param {string} code - the template.
 * @param {import('./template-tags.js').TemplateSyntax} syntax - the syntax.
 * @returns {Map<number, TagPlace>} the places.
 */
export function getTagPlaces(code, syntax) {
    const tags = getTemplateTags(code, syntax);
    const places = new Map();
    if (!tags.length) return places;
    const text = convertTemplateTagsToLetters(code, syntax);
    const zones = getLatexZones(text);
    let zoneIndex = 0;
    for (const tag of tags) {
        while (zoneIndex < zones.length && zones[zoneIndex].end <= tag.start) zoneIndex++;
        const zone = zones[zoneIndex] && zones[zoneIndex].start <= tag.start ? zones[zoneIndex] : null;
        places.set(tag.start, zone && zone.kind !== 'math' ? zone : getTextPlace(text, tag.start, zone));
    }
    return places;
}

/**
 * Returns the place of a tag outside comments and verbatim: the argument of a file or address
 * command, math, or text.
 * @param {string} text - the code with the tags as letters.
 * @param {number} start - the tag's start.
 * @param {?LatexZone} zone - the math zone around it, or null.
 * @returns {TagPlace} the place.
 */
function getTextPlace(text, start, zone) {
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    if (REFERENCE_BEFORE_TAG.test(text.slice(lineStart, start))) return { kind: 'reference' };
    return { kind: zone ? 'math' : 'text' };
}

/**
 * Returns the stretches of the code that are comments, verbatim, \verb or math, in order.
 * @param {string} text - the code with the tags as letters.
 * @returns {LatexZone[]} the stretches.
 */
function getLatexZones(text) {
    const zones = [];
    const pattern = /%|\\verb\*?(.)|\\begin\s*\{([^}]*)\}|\$\$|\$|\\\(|\\\[|\\./g;
    let match;
    while ((match = pattern.exec(text))) {
        const zone = readZone(text, match);
        if (!zone) continue;
        zones.push(zone);
        pattern.lastIndex = Math.max(pattern.lastIndex, zone.end);
    }
    return zones;
}

/**
 * Reads the stretch that one match of the zone pattern opens.
 * @param {string} text - the code with the tags as letters.
 * @param {RegExpExecArray} match - the match.
 * @returns {?LatexZone} the stretch, or null for an escaped character or another environment.
 */
function readZone(text, match) {
    const start = match.index, token = match[0];
    if (token === '%') return { kind: 'comment', start, end: findEnd(text, '\n', start) };
    if (match[1] !== undefined) return { kind: 'verb', delimiter: match[1], start, end: findEnd(text, match[1], start + token.length) + 1 };
    if (match[2] !== undefined) return readEnvironmentZone(text, match[2].trim(), start);
    if (token === '$$') return { kind: 'math', start, end: findEnd(text, '$$', start + 2) + 2 };
    if (token === '$') return { kind: 'math', start, end: findEnd(text, '$', start + 1) + 1 };
    if (token === '\\(') return { kind: 'math', start, end: findEnd(text, '\\)', start + 2) + 2 };
    if (token === '\\[') return { kind: 'math', start, end: findEnd(text, '\\]', start + 2) + 2 };
    return null;
}

/**
 * Reads a verbatim or math environment up to its \end.
 * @param {string} text - the code with the tags as letters.
 * @param {string} name - the environment's name.
 * @param {number} start - where its \begin starts.
 * @returns {?LatexZone} the stretch, or null for another environment.
 */
function readEnvironmentZone(text, name, start) {
    const kind = VERBATIM_ENVIRONMENTS.test(name) ? 'verbatim' : MATH_ENVIRONMENTS.test(name) ? 'math' : null;
    if (!kind) return null;
    const endPattern = new RegExp(`\\\\end\\s*\\{${name.replace(/\*/g, '\\*')}\\}`, 'g');
    endPattern.lastIndex = start + 1;
    const end = endPattern.exec(text);
    return { kind, start, end: end ? end.index + end[0].length : text.length };
}

/**
 * Returns where a text is found from a place on, the text's end when it is missing.
 * @param {string} text - the text.
 * @param {string} wanted - what is looked for.
 * @param {number} from - where to look from.
 * @returns {number} the place of the find, or the text's length.
 */
function findEnd(text, wanted, from) {
    let index = text.indexOf(wanted, from);
    while (index > 0 && wanted !== '\n' && text[index - 1] === '\\' && wanted.length === 1) index = text.indexOf(wanted, index + 1);
    return index < 0 ? text.length : index;
}

/**
 * Returns the place a fill takes in the filled text: right after an unescaped backslash (also one
 * that only stands there after sections were left out) a command name would start, after the
 * letters of a command name they would go on; else the tag's place in the code. A run of
 * backslashes that fills all of the text seen counts as unescaped.
 * @param {?TagPlace} place - the tag's place in the code.
 * @param {string} before - the filled text just before the fill (at most 64 characters).
 * @returns {?TagPlace} the place to write the fill for.
 */
function getFillPlace(place, before) {
    const isVerbatim = place && (place.kind === 'verbatim' || place.kind === 'verb' || place.kind === 'comment');
    if (isVerbatim) return place;
    const match = /(\\+)([A-Za-z@]*)$/.exec(before);
    const isCut = match && match.index === 0 && before.length >= SEEN_LENGTH;
    if (!match || (match[1].length % 2 === 0 && !isCut)) return place;
    return match[2] ? { kind: 'word' } : { kind: 'command' };
}

/**
 * Writes a tag's fill for its place in LaTeX.
 * @param {TagPlace} place - where the tag stands.
 * @param {import('./template-expansion.js').TagFill} fill - what it is filled with.
 * @returns {string} the LaTeX code of the fill.
 */
export function writeLatexFill(place, fill) {
    const text = fill.text;
    switch (place ? place.kind : 'text') {
        case 'reference': return text.replace(REFERENCE_UNSAFE, '');
        case 'math': return `{\\text{${escapeLatexText(text.replace(/\n/g, ' '))}}}`;
        case 'verbatim': return text.replace(/\\end/g, '\\​end');
        case 'verb': return text.replace(/\n/g, ' ').split(place.delimiter).join('');
        case 'comment': return text.replace(/\n/g, ' ');
        case 'command': return ' ' + escapeLatexText(text);
        case 'word': return '{}' + escapeLatexText(text);
        default: return escapeLatexText(text);
    }
}

/**
 * Escapes a text for LaTeX: each special character as the command that prints it.
 * @param {string} text - the text.
 * @returns {string} the LaTeX code.
 */
export function escapeLatexText(text) {
    return text.replace(/[\\{}$&#^_~%]/g, character => TEXT_ESCAPES[character]);
}

/**
 * Creates what the reader asks about the parts of the filled text.
 * @param {import('./template-expansion.js').TemplateView} view - the filled text and its map.
 * @returns {ViewProvenance} the provenance.
 */
function createProvenance(view) {
    const map = view.map;
    return {
        isCopied: (start, end) => getCopiedCodeRange(map, start, end) !== null,
        getExamplePicture: (start, end) => findExamplePicture(view, start, end),
        partStarts: new Set(map.map(segment => segment.viewStart)),
    };
}

/**
 * Returns the data address of the example picture a stretch of the filled text is exactly the
 * fill of (spaces around it allowed).
 * @param {import('./template-expansion.js').TemplateView} view - the filled text and its map.
 * @param {number} start - where the stretch starts.
 * @param {number} end - where it ends.
 * @returns {?string} the data address, or null.
 */
function findExamplePicture(view, start, end) {
    const raw = view.text.slice(start, end);
    const from = start + (raw.length - raw.trimStart().length), to = end - (raw.length - raw.trimEnd().length);
    const segment = findFillAt(view.map, from, to);
    return segment && segment.picture ? segment.picture.dataUrl : null;
}

/**
 * Leads every place of a reader's result on the filled text back to the code (step 4 of the
 * header): blocks, runs of text, outline, labels, captions and notes.
 * @param {import('./latex.js').RenderResult} result - the result on the filled text.
 * @param {import('./template-expansion.js').ViewSegment[]} map - the map of the filled text.
 * @returns {import('./latex.js').RenderResult} the result with places in the code.
 */
export function convertRenderResult(result, map) {
    /**
     * Leads one item back to the code.
     * @param {object} item - the item with its place.
     * @returns {object} the item with its place in the code.
     */
    const convertItem = item => convertResultItem(item, map);
    const blocks = result.blocks.map(block => ({ ...convertItem(block), ...(block.notes ? { notes: block.notes.map(convertItem) } : {}) }));
    const labels = {};
    for (const name of Object.keys(result.labels)) labels[name] = convertItem(result.labels[name]);
    const captions = (result.captions || []).map(caption => ({ ...caption, html: convertBlockHtml(caption.html, map) }));
    return { ...result, blocks, labels, captions, outline: result.outline.map(convertItem), problems: result.problems.map(convertItem) };
}

/**
 * Leads one item of a result back to the code: its place, and the places in its HTML.
 * @param {object} item - a block, note, label, outline entry or problem with its place (pos).
 * @param {import('./template-expansion.js').ViewSegment[]} map - the map of the filled text.
 * @returns {object} the item with its place in the code.
 */
function convertResultItem(item, map) {
    return { ...item, pos: getCodeOffsetByViewOffset(map, item.pos), ...(typeof item.html === 'string' ? { html: convertBlockHtml(item.html, map) } : {}) };
}

/**
 * Leads the places in a block's HTML back to the code: data-p to the place in the code, a run
 * of copied text to its place in the code, a run with filled text to a read-only span at its tag.
 * @param {string} html - the block's HTML.
 * @param {import('./template-expansion.js').ViewSegment[]} map - the map of the filled text.
 * @returns {string} the HTML with places in the code.
 */
function convertBlockHtml(html, map) {
    return html
        .replace(/ data-p="(\d+)"/g, (whole, place) => ` data-p="${getCodeOffsetByViewOffset(map, +place)}"`)
        .replace(/<span class="t" data-s="(\d+)">([^<]*)<\/span>/g, (whole, start, text) => convertRun(+start, text, map));
}

/**
 * Leads one run of text back to the code.
 * @param {number} start - the run's start in the filled text.
 * @param {string} text - the run's HTML (escaped text).
 * @param {import('./template-expansion.js').ViewSegment[]} map - the map of the filled text.
 * @returns {string} the run with its place in the code, or a read-only span at its tag.
 */
function convertRun(start, text, map) {
    const length = text.replace(/&(amp|lt|gt|quot);/g, entity => RUN_ENTITIES[entity]).length;
    const range = getCopiedCodeRange(map, start, start + length);
    return range ? `<span class="t" data-s="${range.start}">${text}</span>` : `<span data-p="${getCodeOffsetByViewOffset(map, start)}">${text}</span>`;
}
