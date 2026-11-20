/**
 * The Insert tab of the side panel and the snippet buttons of the toolbar: structure, text and
 * math snippets, Greek letters and symbols at the code's cursor. A snippet adds the packages
 * it needs to the preamble; a symbol outside math goes into $…$.
 */

import { escapeHtml } from './latex.js?v=14';
import { state, ui, getElement, getElements } from './state.js?v=2';
import { addSnippet, addCommandAroundSelection } from './code-insert.js?v=3';
import { addPackage, addPreambleLine } from './preamble-edit.js?v=3';
import { renderPicturesTab } from './pictures-tab.js?v=3';

/** The snippets by key: [text, block]. "|" marks the cursor, "§" the selected text. */
const SNIPPETS = {
    section: ['\\section{|§}', true], subsection: ['\\subsection{|§}', true], subsubsection: ['\\subsubsection{|§}', true],
    paragraph: ['\\paragraph{|§}', true],
    itemize: ['\\begin{itemize}\n  \\item |§\n  \\item \n\\end{itemize}', true],
    enumerate: ['\\begin{enumerate}\n  \\item |§\n  \\item \n\\end{enumerate}', true],
    description: ['\\begin{description}\n  \\item[|Term] Explanation\n\\end{description}', true],
    table: ['\\begin{table}[h]\n  \\centering\n  \\begin{tabular}{lcr}\n    \\hline\n    |Left & Center & Right \\\\\n    \\hline\n    1 & 2 & 3 \\\\\n    4 & 5 & 6 \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{Caption}\n  \\label{tab:name}\n\\end{table}', true],
    figure: ['\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.6\\textwidth]{|example-image}\n  \\caption{Caption}\n  \\label{fig:name}\n\\end{figure}', true],
    'inline-math': ['$|§$', false],
    display: ['\\[\n  |§\n\\]', true],
    equation: ['\\begin{equation}\n  |§\n  \\label{eq:name}\n\\end{equation}', true],
    align: ['\\begin{align}\n  a &= |b \\\\\n  c &= d\n\\end{align}', true],
    frac: ['\\frac{|§}{}', false], sqrt: ['\\sqrt{|§}', false], sup: ['^{|§}', false], sub: ['_{|§}', false],
    sum: ['\\sum_{i=1}^{n} |', false], int: ['\\int_{a}^{b} | \\, dx', false], lim: ['\\lim_{x \\to \\infty} |', false],
    matrix: ['\\begin{pmatrix}\n  |a & b \\\\\n  c & d\n\\end{pmatrix}', false],
    cases: ['f(x) = \\begin{cases}\n  |1 & x > 0 \\\\\n  0 & \\text{otherwise}\n\\end{cases}', false],
    href: ['\\href{https://|}{§}', false],
    footnote: ['\\footnote{|§}', false], ref: ['\\ref{|}', false], label: ['\\label{|}', false], cite: ['\\cite{|}', false],
    quote: ['\\begin{quote}\n  |§\n\\end{quote}', true], center: ['\\begin{center}\n  |§\n\\end{center}', true],
    verbatim: ['\\begin{verbatim}\n|§\n\\end{verbatim}', true],
    lstlisting: ['\\begin{lstlisting}[language=Python]\n|§\n\\end{lstlisting}', true],
    minipage: ['\\begin{minipage}[t]{0.48\\textwidth}\n  |Left column\n\\end{minipage}\\hfill\n\\begin{minipage}[t]{0.48\\textwidth}\n  Right column\n\\end{minipage}', true],
    newpage: ['\\newpage\n|', true], toc: ['\\tableofcontents\n|', true], maketitle: ['\\maketitle\n|', true],
    abstract: ['\\begin{abstract}\n  |§\n\\end{abstract}', true],
    color: ['\\textcolor{blue}{|§}', false], colorbox: ['\\colorbox{yellow}{|§}', false],
    vspace: ['\\vspace{1cm}\n|', true], hfill: ['\\hfill |', false],
    bibliography: ['\\begin{thebibliography}{9}\n  \\bibitem{key} |Author, \\emph{Title}, Publisher, Year.\n\\end{thebibliography}', true],
    theorem: ['\\begin{theorem}\n  |§\n\\end{theorem}', true], proof: ['\\begin{proof}\n  |§\n\\end{proof}', true],
};
/** The package each snippet needs. */
const SNIPPET_PACKAGES = { lstlisting: 'listings', color: 'xcolor', colorbox: 'xcolor', href: 'hyperref', figure: 'graphicx', align: 'amsmath', cases: 'amsmath', matrix: 'amsmath', equation: 'amsmath', theorem: 'amsthm', proof: 'amsthm' };
const GREEK = 'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega'.split(' ');
const GREEK_CHARACTERS = 'αβγδϵεζηθϑικλμνξπρστυϕφχψωΓΔΘΛΞΠΣΦΨΩ';
const SYMBOLS = [['\\leq', '≤'], ['\\geq', '≥'], ['\\neq', '≠'], ['\\approx', '≈'], ['\\equiv', '≡'], ['\\sim', '∼'], ['\\pm', '±'], ['\\times', '×'], ['\\cdot', '·'], ['\\div', '÷'],
    ['\\infty', '∞'], ['\\partial', '∂'], ['\\nabla', '∇'], ['\\in', '∈'], ['\\notin', '∉'], ['\\subset', '⊂'], ['\\subseteq', '⊆'], ['\\cup', '∪'], ['\\cap', '∩'], ['\\emptyset', '∅'],
    ['\\forall', '∀'], ['\\exists', '∃'], ['\\neg', '¬'], ['\\land', '∧'], ['\\lor', '∨'], ['\\to', '→'], ['\\Rightarrow', '⇒'], ['\\Leftrightarrow', '⇔'], ['\\mapsto', '↦'], ['\\leftarrow', '←'],
    ['\\mathbb{R}', 'ℝ'], ['\\mathbb{N}', 'ℕ'], ['\\mathbb{Z}', 'ℤ'], ['\\mathbb{Q}', 'ℚ'], ['\\mathbb{C}', 'ℂ'], ['\\ldots', '…'], ['\\cdots', '⋯'], ['\\circ', '∘'], ['\\angle', '∠'], ['\\perp', '⊥']];

/**
 * Adds a snippet by its key at the cursor, with the packages it needs; a figure uses the
 * document's first picture when it has one.
 * @param {string} key - the snippet's key.
 * @returns {void}
 */
function addNamedSnippet(key) {
    const [snippet, block] = SNIPPETS[key];
    const pictures = Object.keys(state.assets);
    addSnippet(key === 'figure' && pictures.length ? snippet.replace('|example-image', '|' + pictures[0]) : snippet, block);
    const needed = SNIPPET_PACKAGES[key];
    if (needed) addPackage(needed);
    if (key === 'theorem') addPreambleLine('\\newtheorem{theorem}{Theorem}');
}

/**
 * Returns a snippet button of the Insert tab.
 * @param {string} key - the snippet's key.
 * @param {string} label - the button's text.
 * @param {string} [title] - its tooltip, the label when left out.
 * @returns {string} the button's HTML.
 */
function formatSnippetButton(key, label, title) {
    return `<button type="button" class="button" data-ins="${key}" title="${escapeHtml(title || label)}">${label}</button>`;
}

/**
 * Draws the Insert tab (and the Pictures tab, when it is open).
 * @returns {void}
 */
export function renderInsertPanel() {
    if (!ui.pictures.hidden) renderPicturesTab();
    const button = formatSnippetButton;
    ui.insert.innerHTML = `
        <div class="insert-group"><h3>Structure</h3><div class="insert-grid">
            ${button('section', 'Section')}${button('subsection', 'Subsection')}${button('subsubsection', 'Subsubsection')}${button('paragraph', 'Paragraph heading')}
            ${button('itemize', '• Bulleted list')}${button('enumerate', '1. Numbered list')}${button('description', 'Description list')}${button('table', 'Table')}
            ${button('figure', 'Figure')}${button('minipage', 'Two columns')}${button('quote', 'Quote')}${button('center', 'Centered')}
            ${button('lstlisting', 'Program code')}${button('verbatim', 'Verbatim')}${button('abstract', 'Abstract')}${button('toc', 'Contents')}
            ${button('maketitle', 'Title')}${button('newpage', 'New page')}${button('vspace', 'Vertical space')}${button('bibliography', 'Bibliography')}
        </div></div>
        <div class="insert-group"><h3>Text</h3><div class="insert-grid">
            ${button('footnote', 'Footnote')}${button('href', 'Link')}${button('label', 'Label')}${button('ref', 'Reference')}
            ${button('color', 'Colored text')}${button('colorbox', 'Colored box')}${button('cite', 'Citation')}${button('hfill', 'Push right')}
        </div></div>
        <div class="insert-group"><h3>Math</h3><div class="insert-grid">
            ${button('inline-math', '$x$ in the text')}${button('display', 'Displayed')}${button('equation', 'Numbered equation')}${button('align', 'Aligned lines')}
            ${button('frac', 'Fraction')}${button('sqrt', 'Root')}${button('sup', 'x² Power')}${button('sub', 'x₁ Index')}
            ${button('sum', '∑ Sum')}${button('int', '∫ Integral')}${button('lim', 'lim Limit')}${button('matrix', 'Matrix')}
            ${button('cases', 'Cases')}${button('theorem', 'Theorem')}${button('proof', 'Proof')}
        </div>
        <h3>Greek letters</h3><div class="symbol-grid">${GREEK.map((name, i) => `<button type="button" data-sym="\\${name}" title="\\${name}">${GREEK_CHARACTERS[i]}</button>`).join('')}</div>
        <h3>Symbols</h3><div class="symbol-grid">${SYMBOLS.map(([command, character]) => `<button type="button" data-sym="${escapeHtml(command)}" title="${escapeHtml(command)}">${character}</button>`).join('')}</div></div>
        <div class="insert-group"><h3>Pictures</h3>
            <p class="hint">Pictures have their own tab: <button type="button" class="link-button" data-goto-pics>Pictures</button>.</p>
        </div>`;
}

/**
 * Tells whether the code's cursor is inside math: after an odd number of $, inside \[ … \],
 * or inside an equation, align, gather or multline environment.
 * @returns {boolean} true inside math.
 */
function isCursorInMath() {
    const before = state.code.slice(0, ui.ta.selectionStart).replace(/\\\$/g, '');
    return (before.match(/\$/g) || []).length % 2 === 1
        || before.lastIndexOf('\\[') > before.lastIndexOf('\\]')
        || /\\begin\{(equation|align|gather|multline)\*?\}(?![\s\S]*\\end\{(equation|align|gather|multline)\*?\})[\s\S]*$/.test(before);
}

/**
 * Adds a symbol at the cursor: inside math as it is (a space after a command name), outside
 * math in $…$.
 * @param {string} command - the symbol's command.
 * @returns {void}
 */
function addSymbol(command) {
    addSnippet(isCursorInMath() ? command + (/[a-z]$/i.test(command) ? ' ' : '') : `$${command}$`, false);
}

/**
 * Runs a button of the Insert tab (a click handler).
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function handleInsertClick(event) {
    const snippetButton = event.target.closest('[data-ins]');
    if (snippetButton) { addNamedSnippet(snippetButton.dataset.ins); return; }
    const symbolButton = event.target.closest('[data-sym]');
    if (symbolButton) { addSymbol(symbolButton.dataset.sym); return; }
    if (event.target.closest('[data-goto-pics]')) getElement('[data-itab=pictures]').click();
}

/**
 * Connects the snippet buttons of the toolbar; they keep the cursor in the code (a press would
 * move the focus).
 * @returns {void}
 */
export function startToolbarSnippets() {
    getElements('[data-wrap], [data-snippet]').forEach(button => button.addEventListener('mousedown', event => event.preventDefault()));
    getElements('[data-wrap]').forEach(button => button.addEventListener('click', () => addCommandAroundSelection(button.dataset.wrap)));
    getElements('[data-snippet]').forEach(button => button.addEventListener('click', () => addNamedSnippet(button.dataset.snippet)));
}

/**
 * Connects the Insert tab; its buttons keep the cursor in the code.
 * @returns {void}
 */
export function startInsertPanel() {
    ui.insert.addEventListener('mousedown', event => { if (event.target.closest('[data-ins], [data-sym]')) event.preventDefault(); });
    ui.insert.addEventListener('click', handleInsertClick);
}
