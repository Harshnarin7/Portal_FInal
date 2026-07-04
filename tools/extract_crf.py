from pathlib import Path
from docx import Document


def iter_block_items(parent):
    from docx.table import Table
    from docx.text.paragraph import Paragraph
    from docx.oxml.table import CT_Tbl
    from docx.oxml.text.paragraph import CT_P

    for child in parent.element.body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)


source = Path(__file__).parents[1] / "CRF_accepted.docx"
output = Path(__file__).parents[1] / "crf_accepted_text.txt"
doc = Document(source)
lines = []
for block in iter_block_items(doc):
    if hasattr(block, "rows"):
        for row in block.rows:
            cells = [" ".join(cell.text.split()) for cell in row.cells]
            lines.append(" | ".join(cells))
    else:
        text = " ".join(block.text.split())
        if text:
            lines.append(text)
output.write_text("\n".join(lines), encoding="utf-8")
print(f"wrote {output} ({len(lines)} lines)")
