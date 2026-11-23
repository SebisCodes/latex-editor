/**
 * Reads a JSON list of cases (argv[3]) and runs each through the LaTeX editor's modules in
 * src/js (argv[2]): the preview's render() with the template syntax of the case, the code view's
 * highlighting, Tidy and the template helpers. Prints one JSON result per case for
 * template_test.py to check. KaTeX from src/vendor is loaded as the page loads it, so math is
 * checked as in the browser.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const scriptFolder = process.argv[2];
const cases = JSON.parse(readFileSync(process.argv[3], 'utf8'));
globalThis.window = { katex: createRequire(import.meta.url)(join(scriptFolder, '..', 'vendor', 'katex', 'katex.min.js')) };

const { render } = await importModule('latex.js');
const { highlight } = await importModule('latex-highlight.js');
const { formatLatex } = await importModule('latex-tidy.js');
const template = await importModule('latex-template.js');

/**
 * Imports a module of the editor by its file name.
 * @param {string} fileName - the file in src/js, e.g. "latex.js".
 * @returns {Promise<object>} the module's exports.
 */
function importModule(fileName) {
    return import(pathToFileURL(join(scriptFolder, fileName)).href);
}

/**
 * One case of template_test.py.
 * @typedef {object} TemplateCase
 * @property {string} code - the LaTeX code.
 * @property {?string} template - the template syntax, or null for plain LaTeX.
 */

/**
 * Builds the result of one case: what the editor makes of its code with its template syntax.
 * @param {TemplateCase} testCase - the code and the template syntax.
 * @returns {object} the problems, the preview's HTML, the highlighted HTML, the tidied code and the tags.
 */
function buildCaseResult(testCase) {
    const rendered = render(testCase.code, { template: testCase.template });
    const syntax = template.getTemplateSyntax(testCase.template);
    const tidied = formatLatex(testCase.code);
    return {
        problems: rendered.problems,
        html: rendered.blocks.map(block => block.html).join('\n'),
        highlighted: highlight(testCase.code, testCase.template),
        tidied,
        tidiedTwice: formatLatex(tidied),
        tags: syntax ? template.getTemplateTags(testCase.code, syntax).map(tag => testCase.code.slice(tag.start, tag.end)) : [],
        tidiedTags: syntax ? template.getTemplateTags(tidied, syntax).map(tag => tidied.slice(tag.start, tag.end)) : [],
        mathEscaped: template.escapeTemplateTagsForMath(testCase.code, syntax),
    };
}

/**
 * Builds the template syntax names the editor reads from addresses.
 * @param {string[]} addresses - query strings such as "?template=mustache".
 * @returns {Array<?string>} the syntax name of each, or null.
 */
function buildAddressResults(addresses) {
    return addresses.map(address => template.getTemplateNameByAddress(address));
}

console.log(JSON.stringify({ cases: cases.cases.map(buildCaseResult), addresses: buildAddressResults(cases.addresses) }));
