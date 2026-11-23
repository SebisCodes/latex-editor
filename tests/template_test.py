"""Template placeholders (?template=mustache, ?template=angle), run in Node.

    python3 tests/template_test.py

  letter    a letter template with {{name}}, {{#name}}, {{^name}} and {{/name}}
            (tests/letter-template.tex) has 0 errors with the syntax "mustache", and the
            LaTeX errors for # and ^ with the option off; the same letter in the syntax
            "angle" (tests/letter-template-angle.tex) has 0 errors with "angle"
  errors    a section left open, a stray end tag, an end tag in the wrong order (one
            error) and a sign outside the syntax are errors at the tag
  view      the code view colors every tag, in comments too, and keeps the text; the
            preview shows a value as a box and the tags of a section as marks
  math      math with tags renders with 0 errors
  address   ?template= takes the values mustache and angle
  tidy      Tidy keeps every tag and is the same when run twice
  off       with the option off or an unknown value the editor gives the plain LaTeX result
Needs Node."""
import html
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(os.path.dirname(HERE), 'src', 'js')
LONE_HASH = 'A lone # - write \\# for the character #'
CARET_OUTSIDE_MATH = '^ only works in math - write $x^2$, or \\textasciicircum for the character'
failed = []


def check_that(ok, text):
    """Prints one result line and notes a failure.

    Args:
        ok (bool): True when the check holds.
        text (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if ok else 'FAIL  ') + text, flush=True)
    if not ok:
        failed.append(text)


def read_fixture(name):
    """Returns the text of a file in tests/.

    Args:
        name (str): the file name.

    Returns:
        str: the file's text.
    """
    with open(os.path.join(HERE, name), encoding='utf-8') as file:
        return file.read()


def run_report(cases, addresses):
    """Runs tests/template/report.mjs in Node on the cases.

    Args:
        cases (list[dict]): each with `code` (str) and `template` (str or None).
        addresses (list[str]): query strings for the address check.

    Returns:
        dict: `cases`, one result per case in order, and `addresses`, the syntax read from each.
    """
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as file:
        json.dump({'cases': cases, 'addresses': addresses}, file)
    try:
        run = subprocess.run(['node', os.path.join(HERE, 'template', 'report.mjs'), SCRIPTS, file.name],
                             capture_output=True, text=True, timeout=120)
    finally:
        os.unlink(file.name)
    if run.returncode:
        print(run.stderr)
        sys.exit('report.mjs failed')
    return json.loads(run.stdout)


def get_errors(result):
    """Returns the messages of the errors of a result.

    Args:
        result (dict): one case result of report.mjs.

    Returns:
        list[str]: the messages of the problems of kind "error".
    """
    return [problem['msg'] for problem in result['problems'] if problem['kind'] == 'error']


def get_plain_text(highlighted):
    """Returns the plain text of highlighted HTML.

    Args:
        highlighted (str): the HTML of the code view.

    Returns:
        str: the text with the tags removed and the entities decoded.
    """
    return html.unescape(re.sub(r'<[^>]+>', '', highlighted))


LETTER = read_fixture('letter-template.tex')
LETTER_ANGLE = read_fixture('letter-template-angle.tex')
MATH = '\\begin{document}\nTotal $x = {{#isNet}}{{net_amount}}{{/isNet}}{{^isNet}}{{gross}}{{/isNet}}$ and $y^{{power}}$.\n\\end{document}\n'
COMMENT = '% the {{greeting}} line\nHello {{name}}.\n'
PARAMETER = '\\newcommand{\\wrap}[1]{{#1}}\n\\wrap{x} {{value}}\n'
ERROR_CASES = {
    'section left open': ('mustache', 'A {{#hasNote}} note\n', [(2, 'The section {{#hasNote}} stays open - add {{/hasNote}}')]),
    'stray end tag': ('mustache', 'A {{/hasNote}} note\n', [(2, '{{/hasNote}} is a stray end tag - remove it or add {{#hasNote}} before it')]),
    'wrong order': ('mustache', '{{#outer}}a {{^inner}}b {{/outer}}c {{/inner}}\n',
                    [(24, '{{/outer}} closes {{#outer}} before the inner section {{^inner}} is closed - add {{/inner}} first')]),
    'unknown sign': ('mustache', 'Hello {{&name}} and {{>partial}}.\n',
                     [(6, 'Unknown placeholder {{&name}} - use {{name}}, {{#name}}, {{^name}}, {{/name}}'),
                      (20, 'Unknown placeholder {{>partial}} - use {{name}}, {{#name}}, {{^name}}, {{/name}}')]),
    'nested in order': ('mustache', '{{#a}}{{#b}}x{{/b}}{{^c}}y{{/c}}{{/a}}\n', []),
    'angle section left open': ('angle', 'A <<?hasNote>> note\n', [(2, 'The section <<?hasNote>> stays open - add <</?hasNote>>')]),
    'angle stray end tag': ('angle', 'A <</?hasNote>> note\n', [(2, '<</?hasNote>> is a stray end tag - remove it or add <<?hasNote>> before it')]),
    'angle unknown sign': ('angle', 'A <</hasNote>> note\n', [(2, 'Unknown placeholder <</hasNote>> - use <<name>>, <<?name>>, <</?name>>')]),
}
ADDRESSES = ['?template=mustache', '?embed=1&template=angle', '?template=Mustache', '?template=toString',
             '?template=__proto__', '?template=', '?embed=1', '']

cases = [
    {'code': LETTER, 'template': 'mustache'},
    {'code': LETTER, 'template': None},
    {'code': LETTER, 'template': 'handlebars'},
    {'code': LETTER_ANGLE, 'template': 'angle'},
    {'code': LETTER_ANGLE, 'template': None},
    {'code': MATH, 'template': 'mustache'},
    {'code': MATH, 'template': None},
    {'code': COMMENT, 'template': 'mustache'},
    {'code': PARAMETER, 'template': 'mustache'},
] + [{'code': code, 'template': syntax} for syntax, code, expected in ERROR_CASES.values()]
report = run_report(cases, ADDRESSES)
(letter, letter_off, letter_unknown, angle, angle_off, math, math_off, comment, parameter), error_results = report['cases'][:9], report['cases'][9:]

print('-- the letter template')
check_that(get_errors(letter) == [], f'mustache: 0 errors (got {get_errors(letter)})')
check_that(len(letter['tags']) == 24, f'mustache: every tag of the template is found ({len(letter["tags"])})')
check_that(LONE_HASH in get_errors(letter_off) and CARET_OUTSIDE_MATH in get_errors(letter_off),
           f'option off: the LaTeX errors for # and ^ ({len(get_errors(letter_off))} errors)')
check_that(len(get_errors(letter_off)) == 3, 'option off: the plain LaTeX checker finds 3 errors')
check_that(letter_unknown['problems'] == letter_off['problems'] and letter_unknown['html'] == letter_off['html']
           and letter_unknown['highlighted'] == letter_off['highlighted'], 'an unknown syntax gives the plain LaTeX result')
check_that(get_errors(angle) == [], f'angle: 0 errors (got {get_errors(angle)})')
check_that('template-tag' not in angle_off['html'] and 'class="tp"' not in angle_off['highlighted'], 'angle, option off: plain LaTeX colors and preview')

print('-- placeholder errors')
for (name, (syntax, code, expected)), result in zip(ERROR_CASES.items(), error_results):
    found = [(problem['pos'], problem['msg']) for problem in result['problems'] if problem['kind'] == 'error']
    check_that(found == expected, f'{syntax} {name}: {found}')

print('-- code view')
for label, result, code in (('mustache', letter, LETTER), ('angle', angle, LETTER_ANGLE), ('off', letter_off, LETTER)):
    check_that(get_plain_text(result['highlighted']) == code, f'{label}: the highlighted text is the code')
check_that(letter['highlighted'].count('<span class="tp">') == 24, 'mustache: every tag is colored as a placeholder')
check_that('<span class="tp">{{#hasNote}}</span>' in letter['highlighted'] and '<span class="tp">{{^hasNote}}</span>' in letter['highlighted'],
           'mustache: section tags are one placeholder each')
check_that('<span class="tp">&lt;&lt;?hasNote&gt;&gt;</span>' in angle['highlighted'] and '<span class="tp">&lt;&lt;/?hasNote&gt;&gt;</span>' in angle['highlighted'],
           'angle: section tags are one placeholder each')
check_that('class="tp"' not in letter_off['highlighted'], 'option off: plain LaTeX colors')
check_that(comment['highlighted'].startswith('<span class="c">% the </span><span class="tp">{{greeting}}</span><span class="c"> line</span>'),
           'a tag in a comment is a placeholder, the comment goes on after it')
check_that('Hello <span class="tp">{{name}}</span>.' in comment['highlighted'], 'the comment ends at the line end')

print('-- preview')
check_that('<span class="template-tag" data-p="' in letter['html'] and '>senderName</span>' in letter['html'], 'a value is a box with its name')
check_that('class="template-tag template-section"' in letter['html'] and '>#hasNote</span>' in letter['html'] and '>^hasNote</span>' in letter['html'],
           'the tags of a section are marks with their sign')
check_that('>?hasNote</span>' in angle['html'] and '>/?hasNote</span>' in angle['html'], 'angle: section marks with their sign')
check_that('template-tag' not in letter_off['html'], 'option off: plain LaTeX preview')
check_that(get_errors(parameter) == [] and parameter['tags'] == ['{{value}}'], 'the LaTeX parameter {{#1}} stays LaTeX')

print('-- math')
check_that(get_errors(math) == [], f'math with tags renders with 0 errors (got {get_errors(math)})')
check_that('\\boxed{\\text{net\\_amount}}' in math['mathEscaped'] and not re.search(r'[#^]', math['mathEscaped'].split('$')[1]),
           'in math a value is a boxed name, section tags are empty groups')
check_that(any(message.startswith('Math:') for message in get_errors(math_off)), 'option off: the same math is a KaTeX error')

print('-- address')
check_that(report['addresses'] == ['mustache', 'angle', None, None, None, None, None, None], f'?template= values: {report["addresses"]}')

print('-- tidy')
for label, result in (('mustache', letter), ('angle', angle)):
    check_that(result['tidiedTags'] == result['tags'], f'{label}: Tidy keeps every tag')
    check_that(result['tidiedTwice'] == result['tidied'], f'{label}: Tidy twice is the same')

print(f'\n{len(failed)} failed' if failed else '\nall passed')
sys.exit(1 if failed else 0)
