from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent / '.deps'))
import pypdfium2 as pdfium

output = Path(__file__).parent / 'pdf-pages'
output.mkdir(exist_ok=True)
for number in (12, 13):
    document = pdfium.PdfDocument(f'C:/Users/Robert/Downloads/fix ({number}).pdf')
    for i in range(len(document)):
        page = document[i]
        bitmap = page.render(scale=1.8)
        bitmap.to_pil().save(output / f'fix{number}-page{i + 1}.png')
        bitmap.close()
        page.close()
    document.close()
print('Rendered both reference PDFs for visual inspection.')
