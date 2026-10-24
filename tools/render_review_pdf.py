"""Render contact sheets and inspect manuscript text/layout geometry."""
import json
import re
import sys
from pathlib import Path
import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "paper/matrixlang.pdf"
out = ROOT / "results/review-revision/render" / path.stem
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(path)
texts = [p.get_text() for p in doc]
issues = []
for i, page in enumerate(doc):
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                r = fitz.Rect(span["bbox"])
                if r.x0 < -1 or r.y0 < -1 or r.x1 > page.rect.width + 1 or r.y1 > page.rect.height + 1:
                    issues.append({"page": i+1, "text": span["text"], "bbox": list(r)})
    page.get_pixmap(matrix=fitz.Matrix(1.1, 1.1)).save(out / f"page-{i+1:02}.png")
# PyMuPDF-only contact sheets; preserve the full page proportions.
for start in range(0, len(doc), 6):
    sheet = fitz.open()
    canvas = sheet.new_page(width=1000, height=1400)
    for off in range(min(6, len(doc)-start)):
        col, row = off % 2, off // 2
        rect = fitz.Rect(col*500, row*466+16, (col+1)*500, (row+1)*466)
        canvas.show_pdf_page(rect, doc, start+off)
        canvas.insert_text((col*500+12, row*466+12), f"Page {start+off+1}", fontsize=10)
    canvas.get_pixmap(matrix=fitz.Matrix(1.2, 1.2)).save(out / f"contact-{start//6+1}.png")
full = "\n".join(texts)
report = {"pdf": str(path), "pages": len(doc), "geometry_issues": issues,
          "uppercase_name_present": "RANJITHKUMAR" in full,
          "placeholder_footer_present": bool(re.search(r"Vol\.\s*(?:0|1|XX)|Publication date:", full)),
          "unresolved_reference_present": "??" in full,
          "author_names_present": any(n in full for n in ["Aswanth", "Ranjithkumar"]),
          "headers": [t[:160] for t in texts]}
(out / "inspection.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
(out / "extracted.txt").write_text(full, encoding="utf-8")
print(json.dumps({k:v for k,v in report.items() if k != "headers"}, indent=2))
