/**
 * Template placeholders in LaTeX code: tags that a page's server replaces before LaTeX runs,
 * such as {{name}}, {{#name}} … {{/name}} and {{^name}} … {{/name}} (syntax "mustache") or
 * <<name>>, <<?name>> … <</?name>> (syntax "angle"). The page turns them on with ?template= in
 * the editor's address.
 *
 * This module knows the syntaxes, finds the tags, checks that the sections open and close in
 * order, and writes a tag for math. The code view (latex-highlight.js) and the preview (latex.js)
 * use it to read a tag as one placeholder token. It works on strings only, so it runs in Node as
 * well.
 */

/** The characters a placeholder name may hold after its first character (a letter or _). */
const NAME_PATTERN = '[A-Za-z_][A-Za-z0-9_.-]*';

/**
 * One template syntax.
 * @typedef {object} TemplateSyntax
 * @property {string} name - the value of ?template= that selects it.
 * @property {string} firstCharacter - the character every tag starts with.
 * @property {RegExp} pattern - a tag at one position (sticky): group 1 its sign, group 2 its name.
 * @property {Object<string, string>} kinds - the kind of each known sign ("" for a value): value, section, inverted, close.
 * @property {string} openSign - the sign of a section's opening tag.
 * @property {string} closeSign - the sign of a section's end tag.
 * @property {function(string, string): string} formatTag - writes the tag of a sign and a name.
 */

/** The syntaxes by the value of ?template=. */
const TEMPLATE_SYNTAXES = {
    mustache: {
        name: 'mustache',
        firstCharacter: '{',
        pattern: new RegExp(`\\{\\{([#^/&>!=<$]?)(${NAME_PATTERN})\\}\\}`, 'y'),
        kinds: { '': 'value', '#': 'section', '^': 'inverted', '/': 'close' },
        openSign: '#',
        closeSign: '/',
        formatTag: (sign, name) => `{{${sign}${name}}}`,
    },
    angle: {
        name: 'angle',
        firstCharacter: '<',
        pattern: new RegExp(`<<(\\/\\?|[?/!#^&=]?)(${NAME_PATTERN})>>`, 'y'),
        kinds: { '': 'value', '?': 'section', '/?': 'close' },
        openSign: '?',
        closeSign: '/?',
        formatTag: (sign, name) => `<<${sign}${name}>>`,
    },
};

/**
 * One tag found in the code.
 * @typedef {object} TemplateTag
 * @property {number} start - the offset of its first character.
 * @property {number} end - the offset after its last character.
 * @property {string} sign - the sign before the name ("" for a value).
 * @property {string} name - the placeholder's name.
 * @property {string} kind - value, section, inverted, close, or unknown for a sign outside the syntax.
 */

/**
 * A placeholder error, in the shape of the preview's problems.
 * @typedef {object} TemplateProblem
 * @property {number} pos - the offset of the tag in the code.
 * @property {string} msg - the message for the user.
 * @property {string} kind - always "error".
 */

/**
 * Returns the syntax of a ?template= value.
 * @param {?string} name - the value, e.g. "mustache".
 * @returns {?TemplateSyntax} the syntax, or null for any other value.
 */
export function getTemplateSyntax(name) {
    return Object.prototype.hasOwnProperty.call(TEMPLATE_SYNTAXES, name) ? TEMPLATE_SYNTAXES[name] : null;
}

/**
 * Returns the template syntax the editor's address asks for with ?template=.
 * @param {string} search - the query string of the address, e.g. "?embed=1&template=mustache".
 * @returns {?string} the name of a known syntax, or null.
 */
export function getTemplateNameByAddress(search) {
    const syntax = getTemplateSyntax(new URLSearchParams(search).get('template'));
    return syntax ? syntax.name : null;
}

/**
 * Finds the tag that starts at an offset of a text.
 * @param {string} text - the text.
 * @param {number} index - the offset where the tag would start.
 * @param {?TemplateSyntax} syntax - the syntax, or null for plain LaTeX.
 * @returns {?TemplateTag} the tag, or null when the offset holds plain text.
 */
export function findTemplateTagAt(text, index, syntax) {
    if (!syntax || text[index] !== syntax.firstCharacter) return null;
    syntax.pattern.lastIndex = index;
    const match = syntax.pattern.exec(text);
    if (!match) return null;
    const sign = match[1];
    return { start: index, end: index + match[0].length, sign, name: match[2], kind: syntax.kinds[sign] || 'unknown' };
}

/**
 * Returns every tag of a text, in order, comments included.
 * @param {string} text - the text.
 * @param {TemplateSyntax} syntax - the syntax.
 * @returns {TemplateTag[]} the tags.
 */
export function getTemplateTags(text, syntax) {
    const tags = [];
    let index = text.indexOf(syntax.firstCharacter);
    while (index >= 0) {
        const tag = findTemplateTagAt(text, index, syntax);
        if (tag) tags.push(tag);
        index = text.indexOf(syntax.firstCharacter, tag ? tag.end : index + 1);
    }
    return tags;
}

/**
 * Checks that every section of a template closes, in order, and that every tag carries a sign of
 * the syntax. An end tag that closes an outer section while an inner one is open is one error;
 * the inner section counts as closed with it, and its own end tag later counts as matched.
 * @param {string} text - the template.
 * @param {TemplateSyntax} syntax - the syntax.
 * @returns {TemplateProblem[]} the placeholder errors, in the order of the code.
 */
export function checkTemplateSections(text, syntax) {
    const problems = [];
    const openTags = [];
    const closedEarly = [];
    for (const tag of getTemplateTags(text, syntax)) {
        if (tag.kind === 'unknown') problems.push(buildUnknownTagProblem(tag, syntax));
        else if (tag.kind === 'section' || tag.kind === 'inverted') openTags.push(tag);
        else if (tag.kind === 'close') checkEndTag(tag, syntax, openTags, closedEarly, problems);
    }
    for (const tag of openTags) problems.push(buildProblem(tag, `The section ${formatTagText(tag, syntax)} stays open - add ${syntax.formatTag(syntax.closeSign, tag.name)}`));
    return problems.sort((first, second) => first.pos - second.pos);
}

/**
 * Checks one end tag against the open sections and closes what it closes.
 * @param {TemplateTag} tag - the end tag.
 * @param {TemplateSyntax} syntax - the syntax.
 * @param {TemplateTag[]} openTags - the open sections, innermost last; changed in place.
 * @param {string[]} closedEarly - names of sections an outer end tag closed; changed in place.
 * @param {TemplateProblem[]} problems - the errors found so far; changed in place.
 * @returns {void}
 */
function checkEndTag(tag, syntax, openTags, closedEarly, problems) {
    const openIndex = findLastIndex(openTags, open => open.name === tag.name);
    if (openIndex >= 0 && openIndex === openTags.length - 1) { openTags.pop(); return; }
    if (openIndex >= 0) {
        const inner = openTags[openTags.length - 1];
        problems.push(buildProblem(tag, `${formatTagText(tag, syntax)} closes ${formatTagText(openTags[openIndex], syntax)} before the inner section ${formatTagText(inner, syntax)} is closed - add ${syntax.formatTag(syntax.closeSign, inner.name)} first`));
        closedEarly.push(...openTags.splice(openIndex).slice(1).map(open => open.name));
        return;
    }
    const earlyIndex = closedEarly.indexOf(tag.name);
    if (earlyIndex >= 0) { closedEarly.splice(earlyIndex, 1); return; }
    problems.push(buildProblem(tag, `${formatTagText(tag, syntax)} is a stray end tag - remove it or add ${syntax.formatTag(syntax.openSign, tag.name)} before it`));
}

/**
 * Returns the index of the last item of a list that meets a condition.
 * @param {Array<*>} items - the list.
 * @param {function(*): boolean} isMatch - the condition.
 * @returns {number} the index, or -1.
 */
function findLastIndex(items, isMatch) {
    for (let index = items.length - 1; index >= 0; index--) if (isMatch(items[index])) return index;
    return -1;
}

/**
 * Builds the error of a tag whose sign lies outside the syntax.
 * @param {TemplateTag} tag - the tag.
 * @param {TemplateSyntax} syntax - the syntax.
 * @returns {TemplateProblem} the error, naming the tags the syntax knows.
 */
function buildUnknownTagProblem(tag, syntax) {
    const known = Object.keys(syntax.kinds).map(sign => syntax.formatTag(sign, 'name')).join(', ');
    return buildProblem(tag, `Unknown placeholder ${formatTagText(tag, syntax)} - use ${known}`);
}

/**
 * Builds a placeholder error at a tag.
 * @param {TemplateTag} tag - the tag.
 * @param {string} message - the message for the user.
 * @returns {TemplateProblem} the error.
 */
function buildProblem(tag, message) {
    return { pos: tag.start, msg: message, kind: 'error' };
}

/**
 * Formats a tag as it is written.
 * @param {TemplateTag} tag - the tag.
 * @param {TemplateSyntax} syntax - the syntax.
 * @returns {string} the tag's text, e.g. "{{#name}}".
 */
function formatTagText(tag, syntax) {
    return syntax.formatTag(tag.sign, tag.name);
}

/**
 * Formats the label the preview shows for a tag: its sign and name.
 * @param {TemplateTag} tag - the tag.
 * @returns {string} e.g. "name" for a value, "#name" for a section.
 */
export function formatTemplateTagLabel(tag) {
    return tag.sign + tag.name;
}

/**
 * Escapes the tags of a math formula for KaTeX: a value becomes its boxed name in a group (so it
 * can stand after ^ or _ like the value would), the other tags an empty group, so the formula
 * holds plain math.
 * @param {string} tex - the math code.
 * @param {?TemplateSyntax} syntax - the syntax, or null for plain LaTeX.
 * @returns {string} the math code with every tag replaced; the input as it is when syntax is null.
 */
export function escapeTemplateTagsForMath(tex, syntax) {
    if (!syntax) return tex;
    let result = '', last = 0;
    for (const tag of getTemplateTags(tex, syntax)) {
        result += tex.slice(last, tag.start) + (tag.kind === 'value' ? `{\\boxed{\\text{${tag.name.replace(/_/g, '\\_')}}}}` : '{}');
        last = tag.end;
    }
    return result + tex.slice(last);
}
