import sys,json,pathlib,re
root=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(root/'../implementation-2026-11-11/.tools'))
import pymupdf
sys.stdout.reconfigure(encoding='utf-8')
baseline='--baseline' in sys.argv
filename=root/('baseline-print-results.json' if baseline else 'print-results.json')
rows=json.loads(filename.read_text())
for row in rows:
    if 'pdf' not in row: continue
    with pymupdf.open(root/row['pdf']) as doc:
        row['pages']=len(doc)
        row['millimetres']=[round(doc[0].rect.width*25.4/72,2),round(doc[0].rect.height*25.4/72,2)]
        text=' '.join(' '.join(page.get_text() for page in doc).split())
        row['allItemsRetained']=('Synthetic service 39' in text) if row['case']=='many-items' else 'Services & Charges' in text
        row['requiredContentRetained']=all(label.lower() in text.lower() for label in ['Receipt number','Subtotal','Bill Total','Payment Summary','Paid to date','Remaining balance','Thank you for visiting'])
        row['a5Portrait']=abs(row['millimetres'][0]-148)<0.5 and abs(row['millimetres'][1]-210)<0.5
        row['status']='PASS' if (len(doc)>1 if row['expected']=='multiple-pages' else len(doc)==1) and row['allItemsRetained'] and row['requiredContentRetained'] and row['a5Portrait'] else 'FAIL'
        print(row['browser'],row['case'],'headers='+str(row['headers']),row['pages'],row['status'])
filename.write_text(json.dumps(rows,indent=2))
if any(row.get('status')=='FAIL' for row in rows):sys.exit(1)
