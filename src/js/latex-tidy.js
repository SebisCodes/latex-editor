/**
 * Tidy of the LaTeX editor ("Tidy up"):
 *   1. \begin, \end, \item, the sectioning commands, \documentclass, \usepackage,
 *      \maketitle and \tableofcontents start lines of their own (splitOwnLines());
 *   2. the content of every environment is indented by two spaces per level, at most one
 *      blank line stays in a row (formatLatex()).
 * A line break there is a space for TeX, the same as the space it replaces; where nothing stood
 * before them, they start a new paragraph or list item anyway, so the space does not show.
 * Environments that can stand inside a line of text are only moved when a space stood before
 * them. Comments, verbatim content and lines with inline verbatim stay as they are, so tidying
 * twice changes nothing.
 */

import { VERBATIM_ENVIRONMENTS } from './latex-names.js?v=2';

/** Commands that start a line of their own when tidying (group 1: the environment name). */
const OWN_LINE_COMMANDS = /\\(?:begin|end)\s*\{([^}]*)\}|\\(?:item|part|chapter|section|subsection|subsubsection|paragraph|subparagraph|documentclass|usepackage|maketitle|tableofcontents)(?![A-Za-z])/g;
/** Environments that can stand inside a line of text. */
const INLINE_ENVIRONMENTS = new Set(['math', 'tabular', 'tabular*', 'tabularx', 'minipage', 'array']);
/** The verbatim environments whose content keeps its indentation when tidying. */
const KEPT_VERBATIM = /\\begin\s*\{(verbatim\*?|lstlisting|minted|Verbatim|comment)\}/;
/** The indentation of one level. */
const INDENT = '  ';

/**
 * Returns the first \begin{…} of a verbatim environment in a line.
 * @param {string} line - the line.
 * @returns {?RegExpMatchArray} the match (group 1: the name), or null.
 */
const findVerbatimStart = line => [...line.matchAll(/\\begin\s*\{([^}]*)\}/g)].find(match => VERBATIM_ENVIRONMENTS.has(match[1].trim())) || null;

/**
 * Tidies LaTeX code: own lines for the structure commands, indented environments.
 * @param {string} code - the LaTeX code.
 * @returns {string} the tidied code; verbatim content stays byte for byte.
 */
export function formatLatex(code) {
    const lines = splitOwnLines(code).split('\n');
    let depth = 0, verbatim = null, blanks = 0;
    const tidied = [];
    for (const raw of lines) {
        const trimmed = raw.trim();
        if (verbatim) {
            tidied.push(raw);
            if (trimmed.startsWith('\\end{' + verbatim + '}')) { verbatim = null; depth = Math.max(0, depth - 1); tidied[tidied.length - 1] = INDENT.repeat(depth) + trimmed; }
            continue;
        }
        blanks = trimmed ? 0 : blanks + 1;
        if (blanks > 1) continue;
        const live = trimmed.replace(/(^|[^\\])((?:\\\\)*)%.*$/, '$1$2');
        const ends = (live.match(/\\end\s*\{(?!document\})[^}]*\}/g) || []).length;
        const begins = (live.match(/\\begin\s*\{(?!document\})[^}]*\}/g) || []).length;
        const leadingEnd = /^\\end\s*\{(?!document\})/.test(trimmed) ? 1 : 0;
        const lineDepth = Math.max(0, depth - leadingEnd);
        tidied.push(trimmed ? INDENT.repeat(lineDepth) + trimmed : '');
        depth = Math.max(0, depth + begins - ends);
        const verbatimMatch = KEPT_VERBATIM.exec(trimmed);
        if (verbatimMatch && !trimmed.includes('\\end{' + verbatimMatch[1] + '}')) verbatim = verbatimMatch[1];
    }
    return tidied.join('\n');
}

/**
 * Puts the structure commands on lines of their own; the line break takes the place of the
 * space in front of the command.
 * @param {string} code - the LaTeX code.
 * @returns {string} the code with the extra line breaks.
 */
function splitOwnLines(code) {
    let verbatim = null;
    const lines = [];
    for (const line of code.split('\n')) {
        if (verbatim) {
            lines.push(line);
            if (line.includes('\\end{' + verbatim + '}')) verbatim = null;
            continue;
        }
        const commentMatch = /(^|[^\\])(\\\\)*%/.exec(line);
        const commentAt = commentMatch ? commentMatch.index + commentMatch[0].length - 1 : line.length;
        const verbatimMatch = findVerbatimStart(line);
        const stop = Math.min(commentAt, verbatimMatch ? verbatimMatch.index + verbatimMatch[0].length : commentAt);
        if (/\\(verb|lstinline|mintinline)(?![A-Za-z])/.test(line.slice(0, stop))) { lines.push(line); continue; }
        lines.push(...splitLine(line, stop).split('\n'));
        if (verbatimMatch && !line.includes('\\end{' + verbatimMatch[1] + '}', verbatimMatch.index)) verbatim = verbatimMatch[1];
    }
    return lines.join('\n');
}

/**
 * Adds a line break in front of each structure command of a line that is not at its start.
 * @param {string} line - the line.
 * @param {number} stop - where a comment or verbatim starts: commands after it stay.
 * @returns {string} the line with line breaks.
 */
function splitLine(line, stop) {
    let split = '', last = 0;
    for (const match of line.slice(0, stop).matchAll(OWN_LINE_COMMANDS)) {
        const at = match.index;
        if (isEscapedCommand(line, at)) continue;
        const before = line.slice(last, at);
        const head = before.replace(/[ \t]+$/, '');
        const spaced = head.length < before.length;
        if (!line.slice(0, at).trim()) continue;
        if (match[1] !== undefined && INLINE_ENVIRONMENTS.has(match[1].trim()) && !spaced) continue;
        split += head + '\n';
        last = at;
    }
    return split + line.slice(last);
}

/**
 * Tells whether the backslash at an index follows an odd number of backslashes: "\\item" is a
 * line break and the word "item", not \item.
 * @param {string} line - the line.
 * @param {number} at - the index of the command's backslash.
 * @returns {boolean} true when the command is escaped.
 */
function isEscapedCommand(line, at) {
    let backslashes = 0;
    for (let index = at - 1; index >= 0 && line[index] === '\\'; index--) backslashes++;
    return backslashes % 2 === 1;
}
