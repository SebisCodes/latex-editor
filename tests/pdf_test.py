"""PDF of the page's document for the page (latexeditor:pdf).

    php -S 127.0.0.1:8094 -t src src/php/router.php          (in the project folder)
    python tests/pdf_test.py

A host page embeds the editor with ?embed=1&save=0, loads a two-page A4
document with a picture and asks for a PDF. Checks: the answer is a PDF
data URI with one JPEG picture per page at the asked resolution and A4 page
size, the id is that of the loaded document, and before a load there is
an error instead of a PDF."""

import base64
import json
import os
import re
import subprocess
import tempfile
import time

from playwright.sync_api import sync_playwright

EDITOR = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8094/')
HERE = os.path.dirname(os.path.abspath(__file__))
TEX = ('\\documentclass[a4paper]{article}\n\\usepackage{graphicx}\n\\begin{document}\nErste Seite.\n\n'
       '\\includegraphics[width=4cm]{title-picture.jpg}\n\\newpage\nZweite Seite.\n\\end{document}\n')
failures = []


def check_that(cond, what):
    """Prints one result line and notes a failure.

    Args:
        cond (bool): True when the check holds.
        what (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if cond else 'FAIL  ') + what)
    if not cond:
        failures.append(what)


HOST = """<!doctype html><meta charset="utf-8"><title>host</title>
<iframe id="f" src="EDITOR?embed=1&save=0" style="width:1300px;height:820px;border:0"></iframe>
<script>
const P = 'latexeditor', ORIGIN = new URL('EDITOR').origin, frame = document.getElementById('f');
window.log = [];
window.send = m => frame.contentWindow.postMessage(m, ORIGIN);
window.load = async () => {
  const b = await (await fetch('title-picture.jpg')).blob();
  const jpg = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
  send({ type: P + ':load', name: 'Dossier PDF', content: TEX, assets: { 'title-picture.jpg': jpg } });
};
addEventListener('message', e => { if (e.source === frame.contentWindow) log.push(e.data); });
</script>"""

with tempfile.TemporaryDirectory() as d:
    with open(os.path.join(d, 'host.html'), 'w') as f:
        f.write(HOST.replace('EDITOR', EDITOR).replace('TEX', json.dumps(TEX)))
    with open(os.path.join(HERE, 'title-picture.jpg'), 'rb') as a, open(os.path.join(d, 'title-picture.jpg'), 'wb') as b:
        b.write(a.read())
    server = subprocess.Popen(['php', '-S', '127.0.0.1:8097', '-t', d], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(viewport={'width': 1360, 'height': 860})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto('http://127.0.0.1:8097/host.html', wait_until='load')
            page.wait_for_timeout(2500)

            def get_log():
                """Returns the messages the host page received.

                Returns:
                    list[dict]: the messages in order.
                """
                return page.evaluate('log')

            def get_pdf_answers():
                """Returns the latexeditor:pdf answers the host page received.

                Returns:
                    list[dict]: the answers in order.
                """
                return [m for m in get_log() if m.get('type') == 'latexeditor:pdf']


            page.evaluate("send({ type: 'latexeditor:pdf' })")
            page.wait_for_timeout(800)
            a = get_pdf_answers()
            check_that(len(a) == 1 and a[0].get('error') and 'pdf' not in a[0], 'before a load: an error, no PDF')

            page.evaluate('load()')
            page.wait_for_timeout(1500)
            loaded = next((m for m in reversed(get_log()) if m['type'] == 'latexeditor:loaded'), None)
            check_that(loaded is not None, 'the document is loaded')

            page.evaluate("send({ type: 'latexeditor:pdf', dpi: 100 })")
            page.wait_for_function("log.filter(m => m.type === 'latexeditor:pdf').length >= 2", timeout=30000)
            a = get_pdf_answers()[-1]
            check_that(a.get('id') == loaded['id'] and a.get('name') == 'Dossier PDF', 'the answer is about the loaded document')
            check_that(a.get('pages') == 2, 'two pages')
            uri = a.get('pdf') or ''
            check_that(uri.startswith('data:application/pdf;base64,'), 'a PDF data URI')
            pdf = base64.b64decode(uri.split(',', 1)[1]) if uri else b''
            check_that(pdf.startswith(b'%PDF-1.4') and pdf.rstrip().endswith(b'%%EOF'), 'starts with %PDF-1.4 and ends with %%EOF')
            check_that(pdf.count(b'/Type /Page ') == 2 and pdf.count(b'/Filter /DCTDecode') == 2, 'one JPEG picture per page')
            boxes = re.findall(rb'/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]', pdf)
            check_that(len(boxes) == 2 and all(abs(float(w) - 595.3) < 2 and abs(float(h) - 841.9) < 2 for w, h in boxes), 'A4 pages (595 x 842 pt)')
            widths = [int(x) for x in re.findall(rb'/Subtype /Image /Width (\d+)', pdf)]
            check_that(widths and all(abs(w - 827) <= 2 for w in widths), '100 dpi: pictures 827 pixels wide')
            m = re.search(rb'startxref\n(\d+)', pdf)
            check_that(m is not None and pdf[int(m.group(1)):].startswith(b'xref'), 'startxref points at the xref table')
            offs = [int(x) for x in re.findall(rb'(\d{10}) 00000 n', pdf)]
            check_that(offs and all(re.match(rb'\d+ 0 obj', pdf[o:o + 12]) for o in offs), 'every xref offset points at an object')

            if os.environ.get('PDF_OUT'):
                open(os.environ['PDF_OUT'], 'wb').write(pdf)
            check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
            browser.close()
    finally:
        server.terminate()

print('\n' + ('All checks passed.' if not failures else f'{len(failures)} failed.'))
raise SystemExit(1 if failures else 0)
