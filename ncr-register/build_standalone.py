#!/usr/bin/env python3
"""Build NCR_Register.html: index.html with every library embedded, so the
single file runs offline (e.g. double-clicked on a work laptop).

Usage:  python3 build_standalone.py
Downloads pdf.js, mammoth and SheetJS from the npm registry (pinned versions).
"""
import io, pathlib, re, tarfile, urllib.request

HERE = pathlib.Path(__file__).parent
PKGS = {
    "pdf.min.js":             ("pdfjs-dist", "3.11.174", "package/build/pdf.min.js"),
    "pdf.worker.min.js":      ("pdfjs-dist", "3.11.174", "package/build/pdf.worker.min.js"),
    "mammoth.browser.min.js": ("mammoth", "1.6.0", "package/mammoth.browser.min.js"),
    "xlsx.full.min.js":       ("xlsx", "0.18.5", "package/dist/xlsx.full.min.js"),
}
_cache = {}

def fetch(name, ver, member):
    key = (name, ver)
    if key not in _cache:
        url = f"https://registry.npmjs.org/{name}/-/{name.split('/')[-1]}-{ver}.tgz"
        _cache[key] = urllib.request.urlopen(url).read()
    with tarfile.open(fileobj=io.BytesIO(_cache[key])) as t:
        return t.extractfile(member).read().decode("utf-8")

def safe(js):
    return js.replace("</script", "<\\/script")

html = (HERE / "index.html").read_text(encoding="utf-8")
# Embed the worker first: library code itself contains "</head>" strings.
worker = safe(fetch(*PKGS["pdf.worker.min.js"]))
html = html.replace("</head>", f'<script type="text/plain" id="pdfjs-worker">{worker}</script>\n</head>', 1)
for fname, spec in PKGS.items():
    if fname == "pdf.worker.min.js":
        continue
    tag = re.compile(r'<script src="https://cdnjs\.cloudflare\.com/[^"]*/' + re.escape(fname) + r'"></script>')
    code = safe(fetch(*spec))
    html, n = tag.subn(lambda _: f"<script>/* {spec[0]}@{spec[1]} */\n{code}\n</script>", html)
    assert n == 1, fname

out = HERE / "NCR_Register.html"
out.write_text(html, encoding="utf-8")
print(f"Wrote {out} ({out.stat().st_size / 1e6:.1f} MB)")
