/**
 * The names the LaTeX reader knows: symbol commands and what they show, accents, spaces, font
 * commands and declarations, sectioning levels, math and verbatim environments and the packages
 * the preview understands. Plain tables, read by latex.js and its parts.
 */

/** Commands that stand for a character or a logo, and the HTML they show; null: handled elsewhere. */
export const SYMBOLS = {
    LaTeX: '<span class="tex-logo">L<sup>a</sup>T<sub>e</sub>X</span>', LaTeXe: '<span class="tex-logo">L<sup>a</sup>T<sub>e</sub>X&#8239;2<sub>ε</sub></span>',
    TeX: '<span class="tex-logo">T<sub>e</sub>X</span>', BibTeX: 'B<span class="sc">ib</span><span class="tex-logo">T<sub>e</sub>X</span>',
    ldots: '…', dots: '…', textellipsis: '…', S: '§', P: '¶', dag: '†', ddag: '‡', copyright: '©', textcopyright: '©',
    textregistered: '®', texttrademark: '™', pounds: '£', textsterling: '£', euro: '€', texteuro: '€', EUR: '€',
    textbackslash: '\\', textasciitilde: '~', textasciicircum: '^', textbar: '|', textless: '&lt;', textgreater: '&gt;',
    textbullet: '•', textendash: '–', textemdash: '—', textquoteleft: '‘', textquoteright: '’', textquotedblleft: '“',
    textquotedblright: '”', quotedblbase: '„', quotesinglbase: '‚', guillemotleft: '«', guillemotright: '»',
    guilsinglleft: '‹', guilsinglright: '›', flqq: '«', frqq: '»', flq: '‹', frq: '›', glqq: '„', grqq: '“', glq: '‚', grq: '‘',
    ss: 'ß', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', o: 'ø', O: 'Ø', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı', j: 'ȷ',
    textperiodcentered: '·', textdegree: '°', degree: '°', textmu: 'µ', textperthousand: '‰', textsection: '§', textparagraph: '¶',
    textdagger: '†', textdaggerdbl: '‡', checkmark: '✓', textunderscore: '_', textdollar: '$', slash: '/',
    textminus: '−', texttimes: '×', textdiv: '÷', textpm: '±', textonehalf: '½', textonequarter: '¼', textthreequarters: '¾',
    textleftarrow: '←', textrightarrow: '→', ensuremath: '', today: null, textvisiblespace: '␣', textordfeminine: 'ª',
    textordmasculine: 'º', textexclamdown: '¡', textquestiondown: '¿', cent: '¢', textcent: '¢', yen: '¥', textyen: '¥',
    Square: '☐', XBox: '☒', CheckedBox: '☑', ding: null, smiley: '☺', Letter: '✉', phone: '☎', Mobilefone: '📱',
};

/** Accents (\"a, \'{e}, \c{c} …) as combining characters. */
export const ACCENTS = {
    '"': '\u0308', "'": '\u0301', '`': '\u0300', '^': '\u0302', '~': '\u0303', '=': '\u0304', '.': '\u0307',
    u: '\u0306', v: '\u030c', H: '\u030b', c: '\u0327', k: '\u0328', r: '\u030a', d: '\u0323', b: '\u0331', t: '\u0361',
};

/** Space commands and the characters they show; null: handled elsewhere. */
export const SPACES = { ',': '\u2009', ';': '\u2005', ':': '\u2005', '>': '\u2005', '!': '', ' ': ' ', '/': '', '@': '', '-': '\u00ad',
    quad: '\u2003', qquad: '\u2003\u2003', enspace: '\u2002', thinspace: '\u2009', negthinspace: '', enskip: '\u2002',
    hskip: null, nobreakspace: '\u00a0', space: ' ', medskip: null };

/** Escaped special characters (\&, \% …) and the HTML they show. */
export const ESCAPED = { '&': '&amp;', '%': '%', '$': '$', '#': '#', '_': '_', '{': '{', '}': '}' };

/** Font commands with an argument (\textbf{…}) and the class suffix of their style. */
export const FONT_COMMANDS = {
    textbf: 'bf', textit: 'it', textsl: 'sl', emph: 'em', texttt: 'tt', textsf: 'sf', textrm: 'rm', textsc: 'sc',
    textmd: 'md', textup: 'up', textnormal: 'nf', underline: 'ul', uline: 'ul', sout: 'so', st: 'so', textsuperscript: 'sup',
    textsubscript: 'sub', textlf: 'up', uuline: 'ul2', uwave: 'wave', mbox: 'nobr', hbox: 'nobr',
};

/** Font declarations (\bfseries, \itshape …) and the class suffix of their style. */
export const FONT_DECLARATIONS = {
    bfseries: 'bf', itshape: 'it', slshape: 'sl', ttfamily: 'tt', sffamily: 'sf', rmfamily: 'rm', scshape: 'sc',
    mdseries: 'md', upshape: 'up', normalfont: 'nf', bf: 'bf', it: 'it', tt: 'tt', sf: 'sf', rm: 'rm', sc: 'sc', sl: 'sl', em: 'em',
};

/** Sectioning commands and their level (\part -1 … \subparagraph 5). */
export const SECTION_LEVELS = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 };

/** The sectioning commands from the highest level down, the order of their counters. */
export const SECTION_ORDER = ['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];

/** Environments whose content is math. */
export const MATH_ENVIRONMENTS = new Set(['equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*',
    'flalign', 'flalign*', 'alignat', 'alignat*', 'eqnarray', 'eqnarray*', 'displaymath', 'math', 'dmath', 'dmath*']);

/** Environments whose content is taken as it is, character by character. */
export const VERBATIM_ENVIRONMENTS = new Set(['verbatim', 'verbatim*', 'Verbatim', 'lstlisting', 'minted', 'comment', 'filecontents', 'BVerbatim', 'alltt']);

/** Packages the preview knows; any other is reported once. */
export const KNOWN_PACKAGES = new Set(('inputenc fontenc babel ngerman german polyglossia lmodern amsmath amssymb amsthm amsfonts mathtools ' +
    'graphicx graphics xcolor color geometry hyperref url tabularx array booktabs multirow multicol enumitem ' +
    'listings minted verbatim fancyvrb float caption subcaption subfig wrapfig parskip setspace microtype csquotes ' +
    'ulem soul textcomp eurosym siunitx algorithm2e algorithm algorithmic algpseudocode xspace lipsum blindtext ' +
    'helvet times mathptmx palatino mathpazo libertine fourier titlesec fancyhdr lastpage calc ifthen etoolbox ' +
    'framed mdframed tcolorbox longtable tabu ragged2e changepage pdfpages marvosym pifont wasysym fontawesome ' +
    'fontawesome5 bm upgreek cancel xparse kpfonts sectsty footmisc nameref cleveref varioref ae datetime scrextend ' +
    'dsfont bbm stmaryrd physics dcolumn colortbl xltabular threeparttable makecell hhline fp tikz pgf').split(' '));

/** Packages whose drawings or fonts the preview cannot show. */
export const NOT_SHOWN_PACKAGES = new Set(['tikz', 'pgf', 'pgfplots', 'circuitikz', 'pstricks', 'fontspec', 'unicode-math']);
