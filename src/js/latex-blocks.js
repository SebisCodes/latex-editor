/**
 * Block constructs of the LaTeX reader: lists, floats and captions, pictures, verbatim and listings,
 * minipages, the title block, the table of contents and the bibliography.
 */

import { escapeHtml } from './latex-units.js?v=3';
import { createScanner, getPosition, splitTopLevel, getItemLength, getBibitemLength, parseKeyValues, formatRoman, formatAlph } from './latex-scan.js?v=2';
import { highlightListing } from './latex-listing.js?v=3';

/** The renderer methods of this part, mixed into Renderer (latex.js). */
export const BLOCK_METHODS = {
    /**
     * Renders a list (itemize, enumerate, description) with the markers of its depth or of its
     * label option.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner over the body.
     * @param {number} pos - the offset in the code to report.
     * @param {string} kind - itemize, enumerate or description.
     * @returns {void}
     */
    renderList(flow, scan, pos, kind) {
        const doc = this.doc;
        const o = this.readOption(scan);
        const depth = (flow.ctx.listDepth || 0) + 1;
        const kv = parseKeyValues(o ? this.getRawText(scan, o) : '');
        const items = splitTopLevel(scan.s, scan.i, scan.end, getItemLength).slice(1);
        if (!items.length && /\S/.test(scan.s.slice(scan.i, scan.end).replace(/%.*$/gm, ''))) doc.addProblem(pos, `The ${kind} has text but no \\item`, 'warning');
        const enumDepth = kind === 'enumerate' ? (flow.ctx.enumDepth || 0) + 1 : flow.ctx.enumDepth || 0;
        let start = kv.has('start') ? parseInt(kv.get('start'), 10) : 1;
        let label = kv.get('label');
        /**
         * Returns the marker of an item: from the label option, else by the list's kind and depth.
         * @param {number} n - the item's number.
         * @returns {string} the marker as text.
         */
        const formatMarker = n => {
            if (label) {
                return label.replace(/\\arabic\*|\\arabic\{\*\}/g, n).replace(/\\alph\*/g, formatAlph(n)).replace(/\\Alph\*/g, formatAlph(n).toUpperCase())
                    .replace(/\\roman\*/g, formatRoman(n)).replace(/\\Roman\*/g, formatRoman(n).toUpperCase()).replace(/\\textbullet/g, '•').replace(/\$\\bullet\$/g, '•')
                    .replace(/\\textendash/g, '–').replace(/\$-\$/g, '−').replace(/[{}]/g, '').replace(/\\(textbf|textit|bfseries|itshape)\s*/g, '');
            }
            if (kind === 'enumerate') return [`${n}.`, `(${formatAlph(n)})`, `${formatRoman(n)}.`, `${formatAlph(n).toUpperCase()}.`][(enumDepth - 1) % 4];
            return ['•', '–', '∗', '·'][(depth - 1) % 4];
        };
        let n = start - 1;
        const lis = [];
        for (const it of items) {
            const isc = createScanner(scan.s, it.a, it.b, scan.v);
            const lo = this.readOption(isc);
            const ipos = getPosition(scan, it.a - 5);
            const inner = this.renderBlocks(isc, { a: isc.i, b: isc.end }, { listDepth: depth, enumDepth, noindentAll: true, noindent: true });
            const html = inner.map(b => b.html).join('');
            if (kind === 'description') {
                lis.push(`<div class="dl-item" data-p="${ipos}"><dt>${lo ? this.renderInline(isc, lo) : ''}</dt><dd>${html || '<div class="p ni"></div>'}</dd></div>`);
                continue;
            }
            let mark;
            if (lo) mark = this.renderInline(isc, lo);
            else { n++; mark = escapeHtml(formatMarker(n)); if (kind === 'enumerate') this.setTarget(formatMarker(n).replace(/[.()]/g, ''), 'item'); }
            lis.push(`<li data-p="${ipos}"><span class="list-marker">${mark}</span>${html || '<div class="p ni"></div>'}</li>`);
        }
        const tag = kind === 'description' ? 'dl' : kind === 'enumerate' ? 'ol' : 'ul';
        const nosep = kv.has('noitemsep') || kv.has('nosep') ? ' eng' : '';
        flow.addBlock(`<${tag} class="list${nosep}" data-p="${pos}">${lis.join('')}</${tag}>`, pos, 'list', { split: true });
        flow.noindent = true;
    },

    /**
     * Renders a float (figure, table …) where it stands; its placement is read and dropped.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner over the body.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the command or environment name.
     * @returns {void}
     */
    renderFloat(flow, scan, pos, name) {
        const doc = this.doc;
        this.readOption(scan);
        const kind = /^table/.test(name) ? 'table' : /algorithm/i.test(name) ? 'algorithm' : /Programmcode|listing/i.test(name) ? 'lstlisting' : 'figure';
        const inner = this.renderBlocks(scan, { a: scan.i, b: scan.end }, { float: kind, align: null, noindentAll: true });
        const wide = name.endsWith('*') ? ' wide' : '';
        flow.addBlock(`<figure class="float ${kind}${wide}" data-p="${pos}">${inner.map(b => b.html).join('')}</figure>`, pos, 'float');
        flow.noindent = false;
    },

    /**
     * Renders a caption; an unstarred one is numbered and listed for \listoffigures.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner, after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    renderCaption(flow, scan, pos) {
        const doc = this.doc;
        const star = this.readStar(scan);
        this.readOption(scan);
        const r = this.readArgument(scan, 'caption');
        const kind = flow.ctx.float || 'figure';
        let head = '';
        if (!star) {
            doc.counters[kind] = (doc.counters[kind] || 0) + 1;
            const num = doc.getChapterPrefix() + doc.counters[kind];
            this.setTarget(num, kind);
            doc.target.id = 'cap-' + (++doc.anchorId);
            const word = kind === 'lstlisting' ? (doc.meta.ngerman ? 'Programmcode' : doc.getWord('listing')) : doc.getWord(kind);
            head = `<span class="cap-header">${word} ${num}:</span> `;
            doc.captions = doc.captions || [];
            doc.captions.push({ kind, num, html: this.renderInline(createScanner(scan.s, r ? r.a : 0, r ? r.b : 0, scan.v), r), id: doc.target.id });
        }
        const text = this.renderInline(scan, r);
        flow.addBlock(`<div class="caption" id="${doc.target.id}" data-p="${pos}">${head}${text}</div>`, pos, 'caption');
    },

    /**
     * Renders \includegraphics: the picture with width, height, scale and angle, the example
     * pictures, a frame for a PDF picture or a missing one.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner, after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    renderGraphic(flow, scan, pos) {
        const doc = this.doc;
        this.readStar(scan);
        const o = this.readOption(scan);
        this.readOption(scan);
        const r = this.readArgument(scan, 'includegraphics');
        const file = this.getRawText(scan, r).trim();
        const kv = parseKeyValues(o ? this.getRawText(scan, o) : '');
        const st = [];
        const w = kv.has('width') ? this.getLength(kv.get('width')) : null;
        const h = kv.has('height') ? this.getLength(kv.get('height')) : null;
        if (w) st.push(`width:${w}`);
        if (h && h !== 'fill') st.push(`height:${h}`);
        if (w && h && kv.has('keepaspectratio')) { st.length = 0; st.push(`max-width:${w}`, `max-height:${h}`, 'width:auto', 'height:auto', 'object-fit:contain'); }
        else if (w && h) st.push('object-fit:fill');
        if (kv.has('scale')) st.push(`zoom:${parseFloat(kv.get('scale')) || 1}`);
        if (kv.has('angle')) st.push(`transform:rotate(${-parseFloat(kv.get('angle')) || 0}deg)`);
        if (!w && !h && !kv.has('scale')) st.push('max-width:100%');
        const src = doc.getImageSource(file, pos);
        const style = st.length ? ` style="${st.join(';')}"` : '';
        if (src === 'example') {
            const letter = (/-(a|b|c)\b/.exec(file) || [, 'a'])[1].toUpperCase();
            flow.addHtml(`<span class="example-picture"${style || ' style="width:40%"'} data-p="${pos}"><span>Image ${letter}</span></span>`, pos);
            return;
        }
        // A PDF picture (pdflatex takes them) cannot be drawn here: a frame with its name, the file stays with the document.
        if (src && /^data:application\/pdf[;,]/i.test(src)) {
            flow.addHtml(`<span class="picture-missing picture-pdf-page"${style || ' style="width:40%"'} data-p="${pos}" title="PDF pictures are not shown in the preview - pdflatex uses the file"><span>PDF: ${escapeHtml(file)}</span></span>`, pos);
            return;
        }
        if (!src) {
            flow.addHtml(`<span class="picture-missing"${style || ' style="width:40%"'} data-p="${pos}" title="Picture not found"><span>${escapeHtml(file)}</span></span>`, pos);
            return;
        }
        flow.addHtml(`<img class="graphic" src="${escapeHtml(src)}" alt="${escapeHtml(file)}"${style} data-p="${pos}" data-file="${escapeHtml(file)}">`, pos);
    },

    /**
     * Renders a verbatim environment (verbatim, lstlisting, minted …): one span per line, common
     * indentation removed, listings colored, a listing title numbered.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner over the body.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the command or environment name.
     * @returns {void}
     */
    renderVerbatim(flow, scan, pos, name) {
        const s = scan.s;
        let body = s.slice(scan.i, scan.end);
        let lang = '', title = '';
        if (name === 'lstlisting') {
            const m = /^\s*\[([^\]]*)\]/.exec(body);
            if (m) {
                const kv = parseKeyValues(m[1]);
                lang = kv.get('language') || '';
                title = kv.get('caption') || kv.get('title') || '';
                body = body.slice(m[0].length);
            }
            lang = lang || this.doc.lstLang || '';
        } else if (name === 'minted') {
            const m = /^\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(body);
            if (m) { lang = m[1]; body = body.slice(m[0].length); }
        } else if (name === 'Verbatim' || name === 'BVerbatim') {
            const m = /^\s*\[[^\]]*\]/.exec(body);
            if (m) body = body.slice(m[0].length);
        }
        body = body.replace(/^[ \t]*\r?\n/, '').replace(/\r?\n[ \t]*$/, '');
        // Common indentation of every line is removed (code is often indented in the source).
        const lines = body.split('\n');
        const ind = Math.min(...lines.filter(l => l.trim()).map(l => /^[ \t]*/.exec(l)[0].length));
        if (ind > 0 && Number.isFinite(ind)) body = lines.map(l => l.slice(ind)).join('\n');
        if (name === 'comment') return;
        let cap = '';
        if (title) {
            this.doc.counters.lstlisting++;
            cap = `<div class="caption"><span class="cap-header">Listing ${this.doc.counters.lstlisting}:</span> ${escapeHtml(title)}</div>`;
        }
        // One span per line, so long listings can break across pages.
        const code = name === 'alltt' ? this.renderInline(scan, { a: scan.i, b: scan.end })
            : body.split('\n').map(l => `<span class="code-line">${(name === 'verbatim*' ? escapeHtml(l).replace(/ /g, '␣') : highlightListing(l, lang)) || ' '}</span>`).join('');
        flow.addBlock(`${cap}<pre class="code${name === 'lstlisting' || name === 'minted' ? ' lst' : ''}" data-p="${pos}">${code}</pre>`, pos, 'pre', { split: true });
        flow.noindent = true;
    },

    /**
     * Renders a minipage: a box of a width with its vertical alignment.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner over the body.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the command or environment name.
     * @returns {void}
     */
    renderMinipage(flow, scan, pos, name) {
        const doc = this.doc;
        const va = this.readOption(scan);
        this.readOption(scan);
        this.readOption(scan);
        const w = this.readArgument(scan, name);
        const width = this.getLength(this.getRawText(scan, w)) || '100%';
        const inner = this.runAtWidth(width, () => this.renderBlockHtml(scan, { a: scan.i, b: scan.end }, { noindentAll: true }));
        const v = va ? this.getRawText(scan, va).trim() : 'c';
        const vv = v === 't' ? 'top' : v === 'b' ? 'bottom' : 'middle';
        flow.addHtml(`<span class="minipage" style="width:${width};vertical-align:${vv}" data-p="${pos}">${inner}</span>`, pos);
    },

    /**
     * Renders the title block; report and book put it on a page of its own.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    renderTitle(flow, pos) {
        const doc = this.doc, m = doc.meta;
        if (!m.titleSet) doc.addProblem(pos, '\\maketitle without \\title{…} in the preamble', 'warning');
        const date = m.date == null ? escapeHtml(doc.getToday()) : m.date;
        const authors = m.author ? m.author.split(/\s*<span class="and"><\/span>\s*/).map(a => `<span class="author">${a}</span>`).join('') : '';
        const extra = m.extraTitle.map(x => `<div class="t-extra">${x}</div>`).join('');
        const html = `<div class="title" data-p="${pos}">${extra}<div class="t-title">${m.title}</div>${m.subtitle ? `<div class="t-subtitle">${m.subtitle}</div>` : ''}<div class="t-authors">${authors}</div>${date ? `<div class="t-date">${date}</div>` : ''}</div>`;
        const titlepage = /report|book/.test(m.cls) && !m.notitlepage;
        flow.addBlock(html, pos, 'title', { breakAfter: titlepage, nopagenum: titlepage || m.cls === 'article' ? titlepage : false });
        flow.noindent = true;
    },

    /**
     * Renders the table of contents, the list of figures or the list of tables from the first pass.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {number} pos - the offset in the code to report.
     * @param {string} [what='toc'] - "toc", "lof" or "lot".
     * @returns {void}
     */
    renderContents(flow, pos, what = 'toc') {
        const doc = this.doc;
        const isBook = /report|book/.test(doc.meta.cls);
        if (what !== 'toc') {
            const caps = (doc.prev?.captions || []).filter(c => c.kind === (what === 'lof' ? 'figure' : 'table'));
            const rows = caps.map(c => `<a class="toc-line lv2" href="#${c.id}"><span class="num">${c.num}</span><span class="toc-text">${c.html}</span><span class="toc-dots"></span><span class="toc-page" data-target="${c.id}"></span></a>`).join('');
            const head = `<${isBook ? 'h1 class="chapter"' : 'h2 class="lv1"'}><span class="chapter-title">${doc.getWord(what)}</span></${isBook ? 'h1' : 'h2'}>`;
            flow.addBlock(`<div class="toc${isBook ? ' book' : ''}" data-p="${pos}">${head}${rows}</div>`, pos, 'toc', { breakBefore: isBook, split: true });
            return;
        }
        const items = (doc.prev?.outline || doc.outline).filter(o => !o.star && o.level <= doc.meta.tocdepth && o.level >= (isBook ? -1 : 1));
        const rows = items.map(o => `<a class="toc-line lv${o.level}" href="#${o.id}"><span class="num">${o.num}</span><span class="toc-text">${o.html || escapeHtml(o.title)}</span><span class="toc-dots"></span><span class="toc-page" data-target="${o.id}"></span></a>`).join('');
        const head = `<${isBook ? 'h1 class="chapter"' : 'h2 class="lv1"'}><span class="chapter-title">${doc.getWord('contents')}</span></${isBook ? 'h1' : 'h2'}>`;
        flow.addBlock(`<div class="toc${isBook ? ' book' : ''}" data-p="${pos}">${head}${rows || `<div class="p ni muted-p">${doc.meta.ngerman ? 'Noch keine Abschnitte.' : 'No sections yet.'}</div>`}</div>`, pos, 'toc', { breakBefore: isBook, split: true });
        flow.noindent = true;
    },

    /**
     * Renders thebibliography: each \bibitem numbered (or with its label) and recorded for \cite.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner over the body.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    renderBibliography(flow, scan, pos) {
        const doc = this.doc;
        this.readArgument(scan, 'thebibliography');
        const items = splitTopLevel(scan.s, scan.i, scan.end, getBibitemLength).slice(1);
        const isBook = /report|book/.test(doc.meta.cls);
        const lis = [];
        for (const [n, it] of items.entries()) {
            const isc = createScanner(scan.s, it.a, it.b, scan.v);
            const lo = this.readOption(isc);
            const key = this.getRawText(isc, this.readArgument(isc, 'bibitem')).trim();
            const mark = lo ? this.renderInline(isc, lo) : String(n + 1);
            doc.labels['cite:' + key] = { num: mark.replace(/<[^>]+>/g, ''), kind: 'cite', id: 'bib-' + (n + 1), pos: getPosition(scan, it.a) };
            const html = this.renderInline(isc, { a: isc.i, b: isc.end });
            lis.push(`<li id="bib-${n + 1}" data-p="${getPosition(scan, it.a)}"><span class="list-marker">[${mark}]</span><span>${html}</span></li>`);
        }
        const head = isBook ? `<h1 class="chapter"><span class="chapter-title">${doc.getWord('bibliography')}</span></h1>` : `<h2 class="lv1">${doc.getWord('references')}</h2>`;
        flow.addBlock(`<div class="bib" data-p="${pos}">${head}<ol class="bib-list">${lis.join('')}</ol></div>`, pos, 'bib', { breakBefore: isBook, split: true });
    },
};
