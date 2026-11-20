/**
 * Reading and changing the preamble of LaTeX code: lines, packages, the document class with
 * its options, the geometry options, the paper, the font and values such as \title{…}. Every
 * function takes the code and returns a value read from it or the changed code; nothing else
 * changes.
 */

import { PAPERS } from './latex.js?v=14';

const BEGIN_DOCUMENT = '\\begin{document}';
/** A pattern that never matches: the line is always added. */
export const NEVER = /(?!)/;
/** The lines after which a new \usepackage goes. */
export const PACKAGE_LINES = /^\\(usepackage|documentclass)\b.*$/gm;
/** The paper formats for social media: width and height in millimeters. */
export const SOCIAL_PAPERS = { sq: [120, 120], p45: [120, 150], story: [90, 160], wide: [160, 90] };
/** How far (in millimeters) a paper size may be off to count as a social media format. */
const SOCIAL_TOLERANCE = 0.6;
/** The margin a social media format gets when it has none. */
const SOCIAL_MARGIN = '8mm';
const SANS_DEFAULT = /\\renewcommand\s*\{?\\familydefault\}?\s*\{\\sfdefault\}/;
/** The preamble lines each font needs. */
const FONT_LINES = { lmss: ['\\renewcommand{\\familydefault}{\\sfdefault}'], helvet: ['\\usepackage[scaled]{helvet}', '\\renewcommand{\\familydefault}{\\sfdefault}'], times: ['\\usepackage{mathptmx}'], palatino: ['\\usepackage{mathpazo}'] };
/** The lines after which \title, \author and \date go. */
const VALUE_ORDER = { title: /^\\(usepackage|documentclass|definecolor|newcommand|title)\b.*$/gm, author: /^\\(usepackage|documentclass|title|author)\b.*$/gm, date: /^\\(usepackage|documentclass|title|author|date)\b.*$/gm };

/**
 * The document class of the code.
 * @typedef {object} ClassInfo
 * @property {string[]} opts - the class options.
 * @property {string} cls - the class name.
 * @property {RegExpExecArray} m - the match of the \documentclass line.
 */

/**
 * Returns the place of \begin{document}.
 * @param {string} code - the code.
 * @returns {number} the place, -1 when there is none.
 */
export function getDocumentStart(code) {
    return code.indexOf(BEGIN_DOCUMENT);
}

/**
 * Returns the code with a line in place of the first match of a pattern in the preamble (or
 * the match removed when the line is null); without a match the line goes after the last line that
 * matches "after", or before \begin{document}.
 * @param {string} code - the code.
 * @param {RegExp} pattern - what to replace.
 * @param {string|null} line - the new line, null to remove the match.
 * @param {RegExp|null} [after] - a global pattern of the lines the new line follows.
 * @returns {string} the changed code (unchanged without a preamble).
 */
export function setPreambleLine(code, pattern, line, after = null) {
    const end = getDocumentStart(code);
    const preamble = end < 0 ? code : code.slice(0, end);
    const match = pattern.exec(preamble);
    if (match) {
        if (line == null) {
            const start = match.index;
            let stop = match.index + match[0].length;
            if (code[stop] === '\n' && (start === 0 || code[start - 1] === '\n')) stop++;
            return code.slice(0, start) + code.slice(stop);
        }
        return code.slice(0, match.index) + line + code.slice(match.index + match[0].length);
    }
    if (line == null || end < 0) return code;
    let at = end;
    if (after) {
        const all = [...preamble.matchAll(after)];
        if (all.length) { const last = all[all.length - 1]; const lineEnd = preamble.indexOf('\n', last.index); at = lineEnd < 0 ? end : lineEnd + 1; }
    }
    const separator = at > 0 && code[at - 1] !== '\n' ? '\n' : '';
    return code.slice(0, at) + separator + line + '\n' + code.slice(at);
}

/**
 * Tells whether the preamble loads a package (comments left out).
 * @param {string} name - the package's name.
 * @param {string} code - the code.
 * @returns {boolean} true when a \usepackage names it.
 */
export function hasPackage(name, code) {
    const end = getDocumentStart(code);
    const preamble = end < 0 ? '' : code.slice(0, end);
    return new RegExp(`\\\\usepackage\\s*(\\[[^\\]]*\\])?\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(preamble.replace(/%.*$/gm, ''));
}

/**
 * Returns the options of \usepackage[…]{geometry}.
 * @param {string} code - the code.
 * @returns {Map<string, string|true>|null} the options (true for one without value), an empty map for geometry without options, null without geometry.
 */
export function getGeometryOptions(code) {
    const end = getDocumentStart(code);
    const match = /\\usepackage\s*\[([^\]]*)\]\s*\{geometry\}/.exec(code.slice(0, Math.max(0, end)));
    if (!match) return hasPackage('geometry', code) ? new Map() : null;
    const options = new Map();
    for (const option of match[1].split(',')) { const [key, value] = option.split('='); if (key.trim()) options.set(key.trim(), value == null ? true : value.trim()); }
    return options;
}

/**
 * Returns the code with the geometry options set; without options the geometry line goes.
 * @param {string} code - the code.
 * @param {Map<string, string|true>} options - the options.
 * @returns {string} the changed code.
 */
export function setGeometry(code, options) {
    const text = [...options].map(([key, value]) => (value === true ? key : `${key}=${value}`)).join(',');
    return setPreambleLine(code, /\\usepackage\s*(\[[^\]]*\])?\s*\{geometry\}/, options.size ? `\\usepackage[${text}]{geometry}` : null, PACKAGE_LINES);
}

/**
 * Returns the document class and its options.
 * @param {string} code - the code.
 * @returns {ClassInfo|null} the class, null without \documentclass.
 */
export function getClassInfo(code) {
    const match = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/.exec(code);
    return match ? { opts: match[1] ? match[1].split(',').map(option => option.trim()).filter(Boolean) : [], cls: match[2].trim(), m: match } : null;
}

/**
 * Returns the code with another document class or options.
 * @param {string} code - the code.
 * @param {string} name - the class name.
 * @param {string[]} options - the class options.
 * @returns {string} the changed code (unchanged without \documentclass).
 */
export function setClass(code, name, options) {
    const info = getClassInfo(code);
    const line = `\\documentclass${options.length ? `[${options.join(',')}]` : ''}{${name}}`;
    return info ? code.slice(0, info.m.index) + line + code.slice(info.m.index + info.m[0].length) : code;
}

/**
 * Returns the paper of the document: a social media format or "custom" for a size set with
 * geometry, else a paper option of geometry or the class, else A4.
 * @param {string} code - the code.
 * @returns {string} the paper's key.
 */
export function getPaper(code) {
    const geometry = getGeometryOptions(code);
    if (geometry && geometry.has('paperwidth') && geometry.has('paperheight')) {
        const width = parseFloat(geometry.get('paperwidth')), height = parseFloat(geometry.get('paperheight'));
        for (const [key, [socialWidth, socialHeight]] of Object.entries(SOCIAL_PAPERS)) {
            if (Math.abs(socialWidth - width) < SOCIAL_TOLERANCE && Math.abs(socialHeight - height) < SOCIAL_TOLERANCE && /mm/.test(geometry.get('paperwidth'))) return key;
        }
        return 'custom';
    }
    const info = getClassInfo(code);
    for (const key of Object.keys(PAPERS)) if ((geometry && geometry.has(key)) || (info && info.opts.includes(key))) return key;
    return 'a4paper';
}

/**
 * Returns the code with another paper: a social media format as paperwidth and paperheight of
 * geometry (with a margin when it has none), a standard paper as a class option.
 * @param {string} code - the code.
 * @param {string} key - the paper's key.
 * @returns {string} the changed code.
 */
export function setPaper(code, key) {
    const geometry = getGeometryOptions(code) || new Map();
    const info = getClassInfo(code);
    for (const paper of Object.keys(PAPERS)) geometry.delete(paper);
    geometry.delete('paperwidth'); geometry.delete('paperheight'); geometry.delete('paper');
    let options = info ? info.opts.filter(option => !PAPERS[option]) : [];
    if (SOCIAL_PAPERS[key]) {
        geometry.set('paperwidth', SOCIAL_PAPERS[key][0] + 'mm');
        geometry.set('paperheight', SOCIAL_PAPERS[key][1] + 'mm');
        if (!geometry.has('margin')) geometry.set('margin', SOCIAL_MARGIN);
    } else if (key !== 'custom') options = [...options, key];
    let changed = code;
    if (info) changed = setClass(changed, info.cls, options);
    if (geometry.size || getGeometryOptions(changed)) changed = setGeometry(changed, geometry);
    return changed;
}

/**
 * Returns the font of the document.
 * @param {string} code - the code.
 * @returns {string} "lm", "lmss", "helvet", "times" or "palatino".
 */
export function getFont(code) {
    const sans = SANS_DEFAULT.test(code);
    if (hasPackage('helvet', code) && sans) return 'helvet';
    if (sans) return 'lmss';
    if (hasPackage('mathptmx', code) || hasPackage('times', code) || hasPackage('newtxtext', code)) return 'times';
    if (hasPackage('mathpazo', code) || hasPackage('palatino', code)) return 'palatino';
    return 'lm';
}

/**
 * Returns the code with another font: the lines of the other fonts go, the font's lines come.
 * @param {string} code - the code.
 * @param {string} font - the font's key.
 * @returns {string} the changed code.
 */
export function setFont(code, font) {
    const end = getDocumentStart(code);
    const preamble = code.slice(0, end)
        .replace(/^\\usepackage\s*(\[[^\]]*\])?\s*\{(helvet|mathptmx|times|newtxtext|mathpazo|palatino)\}[ \t]*\n?/gm, '')
        .replace(/^\\renewcommand\s*\{?\\familydefault\}?\s*\{\\sfdefault\}[ \t]*\n?/gm, '');
    let changed = preamble + code.slice(end);
    for (const line of FONT_LINES[font] || []) changed = setPreambleLine(changed, NEVER, line, /^\\(usepackage|documentclass|renewcommand\{\\familydefault\})\b.*$/gm);
    return changed;
}

/**
 * The value of a command in the preamble.
 * @typedef {object} PreambleValue
 * @property {string} value - the text between the braces.
 * @property {number} a - where the value starts.
 * @property {number} b - where it ends (the closing brace).
 * @property {number} start - where the command starts.
 */

/**
 * Returns the value of \command{…} in the preamble (comments left out).
 * @param {string} code - the code.
 * @param {string} command - the command's name without the backslash.
 * @returns {PreambleValue|null} the value with its place, null when the preamble has none.
 */
export function getPreambleValue(code, command) {
    const end = getDocumentStart(code);
    const preamble = end < 0 ? '' : code.slice(0, end);
    const pattern = new RegExp(`\\\\${command}\\s*(?:\\[[^\\]]*\\])?\\s*\\{`);
    const match = pattern.exec(preamble.replace(/%.*$/gm, line => ' '.repeat(line.length)));
    if (!match) return null;
    const start = match.index + match[0].length;
    let depth = 1, at = start;
    for (; at < preamble.length && depth; at++) { if (preamble[at] === '\\') { at++; continue; } if (preamble[at] === '{') depth++; if (preamble[at] === '}') depth--; }
    return { value: preamble.slice(start, at - 1), a: start, b: at - 1, start: match.index };
}

/**
 * Returns the code with the value of \command{…} set (or the command removed when the value is
 * null); a new \title, \author or \date goes after the lines it follows.
 * @param {string} code - the code.
 * @param {string} command - the command's name without the backslash.
 * @param {string|null} value - the new value, null to remove the command.
 * @returns {string} the changed code.
 */
export function setPreambleValue(code, command, value) {
    const current = getPreambleValue(code, command);
    if (current) {
        if (value == null) return code.slice(0, current.start) + code.slice(current.b + 1).replace(/^[ \t]*\n/, '');
        return code.slice(0, current.a) + value + code.slice(current.b);
    }
    if (value == null) return code;
    return setPreambleLine(code, NEVER, `\\${command}{${value}}`, VALUE_ORDER[command]);
}
