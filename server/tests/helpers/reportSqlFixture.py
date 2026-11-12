"""Execute report SELECTs against synthetic data only; no server/network access.
SQLite checks joins/arithmetic. This is not MySQL/TiDB dialect certification.
"""
import datetime, json, math, sqlite3, sys
db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
db.create_function('DATE_FORMAT',2,lambda value,fmt:datetime.datetime.fromisoformat(str(value)).strftime(fmt) if value else None)
db.create_function('IF',3,lambda condition,a,b:a if condition else b)
db.create_function('GREATEST',-1,lambda *values:max(values))
db.create_function('FLOOR',1,math.floor)
db.create_function('CONCAT',-1,lambda *values: None if None in values else ''.join(str(value) for value in values))
db.create_function('CURDATE',0,lambda:'2026-11-13')
schemas={
 'clinic_branches':'id INTEGER,name TEXT,code TEXT,is_active INTEGER,created_at TEXT',
 'patients':'id INTEGER,full_name TEXT,created_at TEXT,is_walk_in INTEGER',
 'doctors':'id INTEGER,full_name TEXT,branch_id INTEGER,clinic_type TEXT,is_active INTEGER',
 'doctor_branch_assignments':'doctor_id INTEGER,branch_id INTEGER,is_active INTEGER',
 'appointments':'id INTEGER,patient_id INTEGER,doctor_id INTEGER,branch_id INTEGER,appointment_date TEXT,appointment_time TEXT,status TEXT,clinic_type TEXT,appointment_source TEXT,promotion_id INTEGER,promotion_title_snapshot TEXT',
 'billing_records':'id INTEGER,appointment_id INTEGER,patient_id INTEGER,doctor_id INTEGER,branch_id INTEGER,status TEXT,subtotal NUMERIC,discount_amount NUMERIC,promotion_discount_amount NUMERIC,total_amount NUMERIC,created_at TEXT,finalized_at TEXT',
 'billing_items':'id INTEGER,billing_id INTEGER,item_type TEXT,source_inventory_id INTEGER,catalog_service_id INTEGER,service_name TEXT,quantity NUMERIC,line_total NUMERIC',
 'billing_payments':'id INTEGER,billing_id INTEGER,amount NUMERIC,refund_amount NUMERIC,status TEXT,payment_method TEXT,paid_at TEXT,voided_at TEXT,received_by_staff_id INTEGER,received_by_admin_id INTEGER',
 'billing_payment_refunds':'id INTEGER,payment_id INTEGER,billing_id INTEGER,amount NUMERIC,payment_method TEXT,refunded_at TEXT',
 'inventory':'id INTEGER,branch_id INTEGER,name TEXT,category TEXT,item_type TEXT,stock NUMERIC,threshold NUMERIC,selling_price NUMERIC,price NUMERIC,uom TEXT,unit TEXT,base_unit TEXT,archived_at TEXT',
 'inventory_batches':'id INTEGER,inventory_id INTEGER,branch_id INTEGER,quantity NUMERIC,unit_cost NUMERIC,expiration_date TEXT,archived_at TEXT',
 'inventory_logs':'id INTEGER,inventory_id INTEGER,branch_id INTEGER,qty NUMERIC,type TEXT,movement_type TEXT,logged_at TEXT,reference_id INTEGER,reference_type TEXT',
 'inventory_locations':'id INTEGER,branch_id INTEGER,name TEXT,location_type TEXT,is_active INTEGER,is_main_stockroom INTEGER',
 'inventory_location_stock':'inventory_id INTEGER,location_id INTEGER,quantity NUMERIC',
 'clinical_inventory_reservations':'id INTEGER,billing_id INTEGER,inventory_id INTEGER,status TEXT,package_quantity NUMERIC',
 'queue':'id INTEGER,branch_id INTEGER,queue_date TEXT,status TEXT',
 'clinic_settings':'id INTEGER,report_footer TEXT',
}
for table,columns in schemas.items():db.execute(f'CREATE TABLE {table} ({columns})')
def add(table,**row):
 db.execute(f'INSERT INTO {table} ({",".join(row)}) VALUES ({",".join("?" for _ in row)})',list(row.values()))
for id in [1,2]:add('clinic_branches',id=id,name=f'Branch {id}',is_active=1)
for id in range(1,5):add('patients',id=id,full_name=f'Patient {id}',created_at='2026-10-01',is_walk_in=int(id==2))
for id in [1,2]:add('doctors',id=id,full_name=f'Doctor {id}',branch_id=id,clinic_type='medical' if id==1 else 'derma')
visits=[(1,3,1,1,'2026-10-01','completed'),(2,1,1,1,'2026-11-02','completed'),(3,2,2,1,'2026-11-03','no_show'),(4,3,1,1,'2026-11-05','confirmed'),(5,4,2,2,'2026-11-06','completed'),(6,1,1,1,'2026-11-07','cancelled')]
for id,p,d,b,date,status in visits:add('appointments',id=id,patient_id=p,doctor_id=d,branch_id=b,appointment_date=date,appointment_time='10:00',status=status,clinic_type='medical' if d==1 else 'derma',appointment_source='guest_online' if p==2 else 'online',promotion_id=10 if id==2 else None,promotion_title_snapshot='Test offer' if id==2 else None)
for id,branch,appt,status,subtotal,discount,date in [(1,1,2,'paid',1000,100,'2026-11-02'),(2,1,4,'partially_paid',300,0,'2026-11-05'),(3,1,3,'pending',9999,0,'2026-11-03'),(4,2,5,'paid',500,0,'2026-11-06'),(5,1,6,'draft',2000,0,'2026-11-07'),(6,1,6,'voided',700,0,'2026-10-30')]:
 add('billing_records',id=id,appointment_id=appt,patient_id=1 if id==1 else 3,doctor_id=1,branch_id=branch,status=status,subtotal=subtotal,discount_amount=discount,promotion_discount_amount=discount,total_amount=subtotal-discount,created_at=date,finalized_at=date if status not in ['pending','draft'] else None)
for id,bill,qty,amount,item_type in [(1,1,1,980,'service'),(2,2,1,300,'service'),(3,3,1,9999,'service'),(4,4,1,500,'service'),(5,1,2,20,'supply')]:add('billing_items',id=id,billing_id=bill,item_type=item_type,source_inventory_id=1 if item_type=='supply' else None,catalog_service_id=77 if item_type=='service' else None,service_name=f'Charge {id}',quantity=qty,line_total=amount)
for id,bill,amount,status,paid,voided,refund in [(1,1,900,'completed','2026-11-02',None,200),(2,2,100,'completed','2026-11-05',None,0),(3,6,700,'voided','2026-10-30','2026-11-04',0),(4,4,500,'completed','2026-11-06',None,0)]:add('billing_payments',id=id,billing_id=bill,amount=amount,status=status,payment_method='cash',paid_at=paid,voided_at=voided,refund_amount=refund)
add('billing_payment_refunds',id=1,payment_id=1,billing_id=1,amount=200,payment_method='cash',refunded_at='2026-11-08')
for id,branch,stock,threshold,archived in [(1,1,10,5,None),(2,1,0,5,None),(3,1,2,5,'2026-10-01'),(4,2,5,1,None),(5,1,4,1,None)]:add('inventory',id=id,branch_id=branch,name=f'Item {id}',category='medical',item_type='medicine',stock=stock,threshold=threshold,selling_price=50,price=50,uom='unit',unit='unit',base_unit='unit',archived_at=archived)
for id,item,branch,qty,expiry in [(1,1,1,10,'2026-12-13'),(2,5,1,4,'2026-11-12'),(3,3,1,2,'2026-12-01'),(4,4,2,5,'2026-12-01')]:add('inventory_batches',id=id,inventory_id=item,branch_id=branch,quantity=qty,unit_cost=0,expiration_date=expiry,archived_at=None)
add('clinical_inventory_reservations',id=1,billing_id=2,inventory_id=1,status='pending',package_quantity=8)
for id,item,branch,qty,kind in [(1,1,1,3,'clinical_use'),(2,1,1,2,'dispensed'),(3,1,1,1,'clinical_return'),(4,4,2,2,'clinical_use')]:add('inventory_logs',id=id,inventory_id=item,branch_id=branch,qty=qty,type='in' if kind.endswith('return') else 'out',movement_type=kind,logged_at='2026-11-08',reference_type='billing_record' if kind=='dispensed' else 'consultation',reference_id=1 if id==2 else id)
for branch,item,qty in [(1,1,10),(2,4,5)]:
 add('inventory_locations',id=branch,branch_id=branch,name='Main stockroom',location_type='stockroom',is_active=1,is_main_stockroom=1)
 add('inventory_location_stock',inventory_id=item,location_id=branch,quantity=qty)
add('inventory_location_stock',inventory_id=5,location_id=1,quantity=4)
add('clinic_settings',id=1,report_footer='Synthetic report')
request=json.load(sys.stdin)
try:
 result=[dict(row) for row in db.execute(request['sql'],request.get('params',[]))]
 print(json.dumps(result))
except Exception as error:
 print(str(error)+'\n'+request['sql'],file=sys.stderr);sys.exit(1)
