"""Offline, read-only MySQL dump analysis. Output metadata and counts only.

Usage: python scripts/audit/backupAudit.py path/to/backup.sql
Never imports the dump into a database or emits row values/identifiers.
"""
from pathlib import Path
from collections import Counter, defaultdict
from decimal import Decimal
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[2]


def split_sql(text, delimiter=','):
    parts, start, depth, quote, i = [], 0, 0, '', 0
    while i < len(text):
        char = text[i]
        if quote:
            if char == '\\':
                i += 2
                continue
            if char == quote:
                if i + 1 < len(text) and text[i + 1] == quote:
                    i += 2
                    continue
                quote = ''
        elif char in "'\"`":
            quote = char
        elif char == '(':
            depth += 1
        elif char == ')':
            depth -= 1
        elif char == delimiter and depth == 0:
            parts.append(text[start:i].strip())
            start = i + 1
        i += 1
    if quote or depth:
        raise ValueError('Unbalanced SQL in dump; aborting without row output')
    if text[start:].strip():
        parts.append(text[start:].strip())
    return parts


def value(raw):
    raw = raw.strip()
    if raw.upper() == 'NULL':
        return None
    if raw.startswith("'") and raw.endswith("'"):
        return re.sub(r'\\(.)', lambda m: {'n': '\n', 'r': '\r', 't': '\t', '0': '\0'}.get(m[1], m[1]), raw[1:-1].replace("''", "'"))
    try:
        return Decimal(raw)
    except Exception:
        raise ValueError('Unsupported dump value; aborting without row output') from None


def audit(backup):
    text = backup.read_text(encoding='utf-8-sig')
    tables, data = {}, defaultdict(list)
    for match in re.finditer(r'CREATE TABLE(?: IF NOT EXISTS)? `([^`]+)`\s*\((.*?)\) ENGINE=', text, re.S):
        name, body = match.groups()
        columns, indexes, fks = {}, [], []
        for entry in split_sql(body):
            col = re.match(r'`([^`]+)`\s+(.*)', entry, re.S)
            fk = re.search(r'CONSTRAINT `([^`]+)` FOREIGN KEY \(([^)]+)\) REFERENCES `([^`]+)` \(([^)]+)\)(.*)', entry, re.S)
            key = re.match(r'(PRIMARY KEY|UNIQUE KEY `([^`]+)`|KEY `([^`]+)`)\s*\((.*)\)', entry, re.S)
            if col:
                columns[col[1]] = col[2].strip()
            elif fk:
                fks.append(dict(name=fk[1], columns=re.findall(r'`([^`]+)`', fk[2]), target=fk[3], targetColumns=re.findall(r'`([^`]+)`', fk[4]), rules=fk[5].strip()))
            elif key:
                indexes.append(dict(name=key[2] or key[3] or 'PRIMARY', unique=key[1] == 'PRIMARY KEY' or key[1].startswith('UNIQUE'), columns=re.findall(r'`([^`]+)`', key[4])))
        tables[name] = dict(columns=columns, indexes=indexes, foreignKeys=fks)
    # Split statements with quote awareness: clinical notes can contain semicolons.
    for statement in split_sql(text, ';'):
        match = re.search(r'(?:^|\n)INSERT INTO `([^`]+)`(?:\s*\(([^)]+)\))?\s+VALUES\s+(.*)\Z', statement, re.S)
        if not match:
            continue
        name = match[1]
        names = re.findall(r'`([^`]+)`', match[2]) if match[2] else list(tables[name]['columns'])
        for row in split_sql(match[3]):
            if not row.startswith('(') or not row.endswith(')'):
                raise ValueError('Unsupported INSERT shape')
            values = [value(raw) for raw in split_sql(row[1:-1])]
            if len(names) != len(values):
                raise ValueError('Column count mismatch in ' + name)
            data[name].append(dict(zip(names, values)))
    checks = []

    def check(name, count, **context):
        checks.append(dict(check=name, violations=count, **context))

    for table, schema in tables.items():
        for fk in schema['foreignKeys']:
            target = {tuple(row.get(c) for c in fk['targetColumns']) for row in data[fk['target']]}
            check('foreign_key_orphans', sum(1 for row in data[table] if all(row.get(c) is not None for c in fk['columns']) and tuple(row.get(c) for c in fk['columns']) not in target), table=table, constraint=fk['name'])
        for key in schema['indexes']:
            if key['unique']:
                counts = Counter(tuple(row.get(c) for c in key['columns']) for row in data[table] if all(row.get(c) is not None for c in key['columns']))
                check('duplicate_unique_key_groups', sum(n > 1 for n in counts.values()), table=table, index=key['name'])
        for col, definition in schema['columns'].items():
            if 'NOT NULL' in definition:
                check('null_in_required_column', sum(row.get(col) is None for row in data[table]), table=table, column=col)
    by_id = {name: {row.get('id'): row for row in rows} for name, rows in data.items()}
    for table, field, target in [
        ('appointments', 'doctor_id', 'doctors'), ('queue', 'doctor_id', 'doctors'),
        ('queue', 'appointment_id', 'appointments'), ('consultations', 'appointment_id', 'appointments'),
        ('consultations', 'doctor_id', 'doctors'), ('billing_records', 'appointment_id', 'appointments'),
        ('billing_records', 'consultation_id', 'consultations'), ('inventory_batches', 'inventory_id', 'inventory'),
        ('payment_gateway_attempts', 'billing_id', 'billing_records'), ('supply_requests', 'doctor_id', 'doctors'),
        ('supply_requests', 'inventory_id', 'inventory'), ('appointments', 'promotion_id', 'clinic_promotions'),
    ]:
        check('cross_branch_relationship', sum(1 for row in data[table] if row.get(field) in by_id.get(target, {}) and row.get('branch_id') != by_id[target][row[field]].get('branch_id')), table=table, relationship=field + ' -> ' + target)
    for table in ['consultations', 'billing_records', 'queue']:
        check('appointment_patient_mismatch', sum(1 for row in data[table] if row.get('appointment_id') in by_id['appointments'] and row.get('patient_id') != by_id['appointments'][row['appointment_id']].get('patient_id')), table=table)
    for table in ['inventory', 'inventory_batches', 'inventory_location_batches', 'inventory_location_stock']:
        for col in ['quantity', 'stock', 'stock_base']:
            if col in tables[table]['columns']:
                check('negative_stock', sum(1 for row in data[table] if row.get(col) is not None and row[col] < 0), table=table, column=col)
    batch_sums, location_sums = defaultdict(Decimal), defaultdict(Decimal)
    for row in data['inventory_batches']:
        if not row.get('archived_at'):
            batch_sums[row['inventory_id']] += row['quantity']
    for row in data['inventory_location_batches']:
        location_sums[(row['location_id'], row['inventory_id'])] += row['quantity']
    check('inventory_stock_vs_unarchived_batches', sum(row.get('stock_base') != batch_sums[row['id']] for row in data['inventory']), table='inventory')
    check('location_stock_vs_location_batches', sum(row['quantity'] != location_sums[(row['location_id'], row['inventory_id'])] for row in data['inventory_location_stock']), table='inventory_location_stock')
    live_location_keys = {(r['location_id'], r['inventory_id']) for r in data['inventory_location_stock']}
    check('missing_location_stock_summary', sum(total != 0 and key not in live_location_keys for key, total in location_sums.items()))
    for table, field in [('consultations', 'appointment_id'), ('billing_records', 'appointment_id')]:
        counts = Counter(r[field] for r in data[table] if r.get(field) is not None)
        check('duplicate_appointment_records', sum(n > 1 for n in counts.values()), table=table)
    registered = re.findall(r"'([^']+\.sql)'", (ROOT / 'server/scripts/branchMigrations.js').read_text())
    registered.append('2026-10-26-batch4-selected-promotion.sql')
    history = {r['filename']: r['content_sha256'] for r in data['schema_migrations']}
    migrations = []
    for file in sorted((ROOT / 'server/db/migrations').glob('*.sql')):
        source = file.read_bytes()
        lf = source.decode().replace('\r\n', '\n').replace('\r', '\n')
        clean = lf.rstrip('\n')
        variants = [lf, clean, clean+'\n', clean+'\n\n']
        hashes = {hashlib.sha256(v.encode()).hexdigest() for v in variants + [v.replace('\n', '\r\n') for v in variants]}
        saved = history.get(file.name)
        migrations.append(dict(filename=file.name, registered=file.name in registered, recorded=saved is not None, checksumMatches=saved in hashes if saved else None, fileSha256=hashlib.sha256(source).hexdigest()))
    # Extract explicit reconciler column contracts, plus CREATE TABLE definitions.
    source = (ROOT / 'server/utils/schema.js').read_text(encoding='utf-8-sig')
    required = defaultdict(set)
    for table, col in re.findall(r"ensureColumn\('([^']+)',\s*'([^']+)'", source):
        required[table].add(col)
    for table, body in re.findall(r'CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\((.*?)\n\s*\)\s*(?:ENGINE=[^`]+)?\s*`', source, re.S):
        for col in re.findall(r'^\s*(\w+)\s+(?:INT|BIGINT|VARCHAR|TEXT|LONGTEXT|MEDIUMTEXT|TINYINT|SMALLINT|DATETIME|TIMESTAMP|DATE|TIME|DECIMAL|CHAR|JSON|ENUM)\b', body, re.M | re.I):
            required[table].add(col)
    missing = [table+'.'+col for table, cols in required.items() for col in sorted(cols) if col not in tables.get(table, {}).get('columns', {})]
    return dict(backupSha256=hashlib.sha256(backup.read_bytes()).hexdigest(), tableCount=len(tables), columnCount=sum(len(s['columns']) for s in tables.values()), rowCounts={t:len(data[t]) for t in tables}, schema=tables, migrations=migrations, requiredReconcilerColumns=sum(map(len,required.values())), missingReconcilerColumns=missing, checks=checks, limitations=['Backup snapshot only; no live database connection.', 'No SQL engine executed: dump parsing cannot validate TiDB DDL or transaction behavior.', 'Unregistered historical migrations have no ledger checksum to compare.'])


if __name__ == '__main__':
    result = audit(Path(sys.argv[1]))
    out = ROOT / 'docs/audit-2026-10-28/evidence'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'backup-audit.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in ['schema','checks','rowCounts','migrations']}))
    print('Migrations:', json.dumps(result['migrations']))
    print('Nonzero checks:', json.dumps([c for c in result['checks'] if c['violations']]))
    print('Integrity checks:',len(result['checks']))
