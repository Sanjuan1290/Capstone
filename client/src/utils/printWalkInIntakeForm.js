export function buildWalkInIntakeFormHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Carait Clinic - Walk-in Intake</title><style>
    @page{size:A4 portrait;margin:16mm}*{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#0f172a;margin:24px;max-width:760px}h1{font-size:22px;margin:0 0 6px}h2{font-size:16px;margin:26px 0 14px}p{line-height:1.5}.header{border-bottom:2px solid #0b1a2c;padding-bottom:14px}.muted{color:#475569;font-size:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.full{grid-column:1/-1}.label{display:block;font-size:12px;font-weight:bold;margin-bottom:8px}.line{height:28px;border-bottom:1px solid #94a3b8}.consent{margin-top:28px;border:1px solid #cbd5e1;border-radius:10px;padding:16px;font-size:12px}.signature{margin-top:48px;border-top:1px solid #64748b;padding-top:8px;font-size:12px}@media print{body{margin:0;max-width:none}.consent{break-inside:avoid}}
  </style></head><body><header class="header"><h1>Carait Clinic - Walk-in Patient Intake</h1><p class="muted">Staff: search for an existing patient record before creating a new one.</p></header>
  <h2>Patient information</h2><div class="grid">
    <div class="full"><span class="label">Full name *</span><div class="line"></div></div>
    <div><span class="label">Birthdate * (must be before today)</span><div class="line"></div></div>
    <div><span class="label">Sex</span><div class="line"></div></div>
    <div><span class="label">Mobile number (optional)</span><div class="line"></div></div>
    <div><span class="label">Visit date</span><div class="line"></div></div>
  </div><h2>Visit information</h2><div class="grid">
    <div class="full"><span class="label">Requested service</span><div class="line"></div></div>
    <div class="full"><span class="label">Reason for visit / main concern</span><div class="line"></div></div>
  </div><section class="consent"><strong>Privacy consent</strong><p>I agree that the clinic may collect and use the information on this form for patient registration and care, as described in the clinic Privacy Policy.</p><div class="signature">Patient / parent / guardian signature over printed name</div></section>
  </body></html>`
}
export function printWalkInIntakeForm() {
  const popup=window.open('', '_blank', 'width=960,height=900')
  if(!popup){window.alert('Please allow pop-ups so the intake form can open for printing.');return false}
  popup.onload=()=>{popup.focus();popup.print()}
  popup.document.write(buildWalkInIntakeFormHtml())
  popup.document.close()
  return true
}
