/**
 * The pages outside the editor: as pictures (a canvas through an SVG foreignObject), as one
 * HTML file, and printed (the browser's "Save as PDF" makes a PDF with selectable text). The
 * pictures and the HTML file carry page.css and the KaTeX styles with every font inside, so
 * they look the same without the editor.
 */

import { escapeHtml } from './latex.js?v=14';

/** The stylesheets with their folders, relative to src/. */
const STYLESHEETS = [['css/page.css', 'css/'], ['vendor/katex/katex.min.css', 'vendor/katex/']];
/** The cache key of the stylesheets with their fonts inside. */
const CSS_CACHE_KEY = 'css';
/** The browser needs a moment to use the fonts inside the SVG, in milliseconds. */
const FONT_WAIT = 60;
const DEFAULT_SCALE = 2;
const DEFAULT_QUALITY = 0.92;
const GENERATOR = 'LaTeX Editor - latex.giit.ch';
/** The element and style that hold the pages while they are printed. */
const PRINT_ROOT_ID = 'print';
const PRINT_STYLE_ID = 'print-format';

/** Files read as data URIs, and the stylesheets with their fonts inside, by address. */
const cache = new Map();

/**
 * Returns a file as a data URI, read once per address.
 * @param {string|URL} url - the file's address.
 * @returns {Promise<string>} the data URI.
 */
function getDataUrl(url) {
    if (cache.has(url)) return cache.get(url);
    const promise = fetch(url).then(response => response.blob()).then(blob => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); }));
    cache.set(url, promise);
    return promise;
}

/**
 * Returns page.css and the KaTeX styles with every font inside (for pictures and HTML files),
 * read once.
 * @returns {Promise<string>} the CSS.
 */
export function getSelfContainedCss() {
    if (cache.has(CSS_CACHE_KEY)) return cache.get(CSS_CACHE_KEY);
    const promise = readSelfContainedCss();
    cache.set(CSS_CACHE_KEY, promise);
    return promise;
}

/**
 * Reads the stylesheets and puts their fonts inside as data URIs.
 * @returns {Promise<string>} the CSS of all stylesheets.
 */
async function readSelfContainedCss() {
    const base = new URL('../', import.meta.url);
    let out = '';
    for (const [file, folder] of STYLESHEETS) {
        // Checked with the server each time: the address has no ?v=, and page.css changes with latex.js.
        let css = await (await fetch(new URL(file, base), { cache: 'no-cache' })).text();
        const fontUrls = [...new Set([...css.matchAll(/url\(([^)'"]+\.woff2)\)/g)].map(match => match[1]))];
        for (const fontUrl of fontUrls) {
            css = css.split(`url(${fontUrl})`).join(`url(${await getDataUrl(new URL(fontUrl, new URL(folder, base)))})`);
        }
        out += css + '\n';
    }
    return out;
}

/**
 * Returns a copy of a page without the editor's marks (the active page, the frame of the
 * cursor's place).
 * @param {HTMLElement} pageElement - the page.
 * @returns {HTMLElement} the copy.
 */
function getCleanCopy(pageElement) {
    const copy = pageElement.cloneNode(true);
    copy.classList.remove('active');
    copy.querySelectorAll('.source').forEach(element => element.classList.remove('source'));
    return copy;
}

/**
 * Draws one page on a canvas, through an SVG foreignObject with the styles and fonts inside.
 * @param {HTMLElement} pageElement - the page.
 * @param {number} [scale] - canvas pixels per CSS pixel.
 * @returns {Promise<HTMLCanvasElement>} the canvas.
 * @throws {Error} when the page cannot be turned into a picture (the Promise rejects).
 */
export async function drawPageCanvas(pageElement, scale = DEFAULT_SCALE) {
    const css = await getSelfContainedCss();
    const width = parseFloat(pageElement.style.width), height = parseFloat(pageElement.style.height);
    const copy = getCleanCopy(pageElement);
    copy.style.margin = '0';
    copy.style.boxShadow = 'none';
    await setPicturesInside(copy);
    const image = await getSvgImage(createSvg(copy, css, width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(scale, scale);
    await new Promise(resolve => setTimeout(resolve, FONT_WAIT));
    context.drawImage(image, 0, 0, width, height);
    return canvas;
}

/**
 * Puts the pictures of a page inside as data URIs; a picture that cannot be read is left out,
 * as a picture from another server would make the canvas unreadable.
 * @param {HTMLElement} copy - the copy of the page.
 * @returns {Promise<void>} settles when every picture is inside or left out.
 */
async function setPicturesInside(copy) {
    for (const image of copy.querySelectorAll('img')) {
        if (!/^data:/.test(image.getAttribute('src') || '')) {
            try { image.src = await getDataUrl(image.src); } catch (e) { image.removeAttribute('src'); }
        }
    }
}

/**
 * Returns an SVG with the page and its styles in a foreignObject.
 * @param {HTMLElement} copy - the copy of the page.
 * @param {string} css - the styles with their fonts inside.
 * @param {number} width - the page's width in CSS pixels.
 * @param {number} height - the page's height in CSS pixels.
 * @returns {string} the SVG.
 */
function createSvg(copy, css, width, height) {
    const wrap = document.createElement('div');
    wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    wrap.className = 'export-root';
    const style = document.createElement('style');
    style.textContent = css;
    wrap.append(style, copy);
    const xml = new XMLSerializer().serializeToString(wrap);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${xml}</foreignObject></svg>`;
}

/**
 * Loads an SVG as a picture.
 * @param {string} svg - the SVG.
 * @returns {Promise<HTMLImageElement>} the loaded picture.
 * @throws {Error} when the browser cannot load it (the Promise rejects).
 */
async function getSvgImage(svg) {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise((resolve, reject) => {
        image.onload = resolve;
        /**
         * Rejects when the browser cannot load the SVG.
         * @returns {void}
         */
        image.onerror = () => reject(new Error('This page could not be turned into a picture'));
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
    return image;
}

/**
 * Returns the picture on a canvas as a file.
 * @param {HTMLCanvasElement} canvas - the canvas.
 * @param {string} type - the media type ("image/png", "image/jpeg", "image/webp").
 * @param {number} [quality] - the quality of JPEG and WebP, 0 to 1.
 * @returns {Promise<Blob>} the picture.
 * @throws {Error} when the browser cannot create the picture (the Promise rejects).
 */
export function getCanvasBlob(canvas, type, quality = DEFAULT_QUALITY) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('The browser could not create this picture'))), type, quality));
}

/**
 * Returns one complete HTML file with all pages, the styles and fonts inside.
 * @param {HTMLElement[]} pages - the pages.
 * @param {string} title - the document's title.
 * @param {object} meta - the page settings of the document (paper size, language).
 * @returns {Promise<string>} the HTML file.
 */
export async function getStandaloneHtml(pages, title, meta) {
    const css = await getSelfContainedCss();
    const body = pages.map(page => {
        const copy = getCleanCopy(page);
        copy.querySelectorAll('[data-p]').forEach(element => element.removeAttribute('data-p'));
        return copy.outerHTML;
    }).join('\n');
    const width = meta.paper.w, height = meta.paper.h;
    return `<!DOCTYPE html>
<html lang="${meta.ngerman ? 'de' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${GENERATOR}">
<title>${escapeHtml(title)}</title>
<style>
${css}
body{margin:0;background:#e8eaef;padding:24px 0}
.sheet{margin:0 auto 24px;box-shadow:0 2px 14px rgba(0,0,0,.18)}
@page{size:${width}px ${height}px;margin:0}
@media print{body{background:none;padding:0}.sheet{margin:0;box-shadow:none;break-after:page}}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/**
 * Opens the browser's print dialog with the pages at the paper size of the document (its
 * "Save as PDF" makes a PDF with selectable text); the document title names the file. After
 * printing the pages and the title are taken away again.
 * @param {HTMLElement[]} pages - the pages.
 * @param {object} meta - the page settings of the document (paper size).
 * @param {string} title - the document's title.
 * @returns {void}
 */
export function openPrintDialog(pages, meta, title) {
    const root = getPrintElement(PRINT_ROOT_ID, 'div', document.body);
    root.replaceChildren(...pages.map(getCleanCopy));
    const style = getPrintElement(PRINT_STYLE_ID, 'style', document.head);
    style.textContent = `@page{size:${meta.paper.w.toFixed(2)}px ${meta.paper.h.toFixed(2)}px;margin:0}`;
    const pageTitle = document.title;
    document.title = title;
    /**
     * Takes the pages and the title away after printing.
     * @returns {void}
     */
    const resetAfterPrint = () => { document.title = pageTitle; root.replaceChildren(); removeEventListener('afterprint', resetAfterPrint); };
    addEventListener('afterprint', resetAfterPrint);
    requestAnimationFrame(() => window.print());
}

/**
 * Returns an element used for printing by its id, added to a parent the first time (a query
 * that fills a cache).
 * @param {string} id - the element's id.
 * @param {string} tag - its tag name.
 * @param {HTMLElement} parent - where it is added.
 * @returns {HTMLElement} the element.
 */
function getPrintElement(id, tag, parent) {
    let element = document.getElementById(id);
    if (!element) {
        element = document.createElement(tag);
        element.id = id;
        parent.append(element);
    }
    return element;
}
