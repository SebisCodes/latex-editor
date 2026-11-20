/**
 * Simple code coloring for program listings on the page (lstlisting, minted): comments,
 * strings, keywords and numbers of a few common languages. A language it does not know is
 * shown as plain text.
 */

import { escapeHtml } from './latex-units.js?v=3';

/** The keywords of each language, separated by spaces. */
const LANGUAGE_KEYWORDS = {
    python: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield print self',
    java: 'abstract boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long new null package private protected public return short static super switch this throw throws try void while true false var String',
    c: 'auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while include define NULL',
    'c++': 'auto bool break case catch char class const continue default delete do double else enum explicit false float for friend if int long namespace new nullptr operator private protected public return short static struct switch template this throw true try typedef typename using virtual void while include std',
    javascript: 'async await break case catch class const continue default delete do else export extends false finally for function if import in instanceof let new null return super switch this throw true try typeof undefined var void while yield of',
    sql: 'select from where and or not insert into values update set delete create table drop alter index join left right inner outer on group by order having limit as distinct desc asc null is like in between count sum avg min max primary key foreign references union all exists case when then else end',
    bash: 'if then else elif fi for while do done case esac function in return export local echo exit cd',
    html: 'html head body div span a p script style link meta title',
    haskell: 'case class data deriving do else if import in infix instance let module newtype of then type where',
    r: 'if else repeat while function for in next break TRUE FALSE NULL Inf NaN NA return library',
    matlab: 'break case catch continue else elseif end for function global if otherwise persistent return switch try while',
};
LANGUAGE_KEYWORDS.cpp = LANGUAGE_KEYWORDS['c++']; LANGUAGE_KEYWORDS.js = LANGUAGE_KEYWORDS.javascript;
LANGUAGE_KEYWORDS.sh = LANGUAGE_KEYWORDS.bash; LANGUAGE_KEYWORDS.py = LANGUAGE_KEYWORDS.python;
LANGUAGE_KEYWORDS.typescript = LANGUAGE_KEYWORDS.javascript;

/**
 * Returns the line comment marker of a language.
 * @param {string} language - the language name.
 * @returns {string} "#", "--", "%" or "//".
 */
function getCommentMarker(language) {
    if (/python|bash|sh|r$/i.test(language)) return '#';
    if (/sql|haskell/i.test(language)) return '--';
    if (/matlab/i.test(language)) return '%';
    return '//';
}

/**
 * Highlights one line of a listing: comments, strings, keywords and numbers get a class.
 * @param {string} code - the line.
 * @param {string} language - the language of the listing (lstlisting language= or the minted argument).
 * @returns {string} the line as HTML.
 */
export function highlightListing(code, language) {
    const keywordList = LANGUAGE_KEYWORDS[String(language || '').toLowerCase().replace(/^\[.*?\]/, '')];
    if (!keywordList) return escapeHtml(code);
    const keywords = new Set(keywordList.split(' '));
    const ignoreCase = /sql/i.test(language);
    const comment = getCommentMarker(language);
    const pattern = new RegExp(`(${comment.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}.*$)|("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')|(\\b[A-Za-z_][\\w]*\\b)|(\\b\\d+(?:\\.\\d+)?\\b)`, 'gm');
    let html = '', last = 0, match;
    while ((match = pattern.exec(code))) {
        html += escapeHtml(code.slice(last, match.index));
        if (match[1]) html += `<span class="lc">${escapeHtml(match[1])}</span>`;
        else if (match[2]) html += `<span class="ls">${escapeHtml(match[2])}</span>`;
        else if (match[3]) html += keywords.has(ignoreCase ? match[3].toLowerCase() : match[3]) ? `<span class="lk">${escapeHtml(match[3])}</span>` : escapeHtml(match[3]);
        else html += `<span class="ln">${escapeHtml(match[4])}</span>`;
        last = pattern.lastIndex;
    }
    return html + escapeHtml(code.slice(last));
}
