from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent / '.deps'))
from pypdf import PdfReader

output = Path(__file__).parent
for number in (12, 13):
    source = Path(f'C:/Users/Robert/Downloads/fix ({number}).pdf')
    reader = PdfReader(source)
    text = '\n\n'.join(f'--- PAGE {i + 1} ---\n{page.extract_text() or ""}' for i, page in enumerate(reader.pages))
    (output / f'pdf-{number}.txt').write_text(text, encoding='utf-8')
    print(f'fix ({number}).pdf: {len(reader.pages)} pages, {len(text)} extracted characters')
