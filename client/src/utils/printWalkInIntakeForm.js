export function printWalkInIntakeForm() {
  const popup = window.open('', '_blank', 'width=960,height=900')
  if (!popup) {
    window.alert('Please allow pop-ups so the intake form can open for printing.')
    return
  }

  popup.document.write(`
    <html>
      <head>
        <title>Walk-in Patient Intake Form</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 28px;
            color: #0f172a;
          }
          h1, h2, p {
            margin: 0;
          }
          .header {
            border-bottom: 2px solid #0b1a2c;
            padding-bottom: 12px;
            margin-bottom: 18px;
          }
          .title {
            font-size: 24px;
            font-weight: 700;
          }
          .subtitle {
            margin-top: 6px;
            font-size: 12px;
            color: #475569;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-bottom: 18px;
          }
          .full {
            grid-column: 1 / -1;
          }
          .field-label {
            display: block;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #334155;
            margin-bottom: 8px;
          }
          .line {
            border-bottom: 1px solid #94a3b8;
            height: 22px;
          }
          .section {
            margin-top: 22px;
          }
          .section h2 {
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 10px;
          }
          .check-row {
            display: flex;
            gap: 18px;
            font-size: 13px;
            margin: 10px 0 16px;
          }
          .box {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 1px solid #334155;
            margin-right: 8px;
            vertical-align: middle;
          }
          .consent {
            border: 1px solid #cbd5e1;
            border-radius: 10px;
            padding: 14px;
            font-size: 12px;
            line-height: 1.5;
            margin-top: 10px;
          }
          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            margin-top: 22px;
          }
          .signature-line {
            margin-top: 38px;
            border-top: 1px solid #334155;
            padding-top: 6px;
            font-size: 11px;
            color: #475569;
          }
          .note {
            margin-top: 18px;
            font-size: 11px;
            color: #475569;
          }
          @media print {
            body {
              margin: 20px;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <p class="title">Carait Clinic Walk-in Patient Intake Form</p>
          <p class="subtitle">Staff reminder: Ask first if the patient already has an account before registering a new one.</p>
        </div>

        <div class="grid">
          <div>
            <span class="field-label">Date</span>
            <div class="line"></div>
          </div>
          <div>
            <span class="field-label">Queue / Reference No.</span>
            <div class="line"></div>
          </div>
        </div>

        <div class="section">
          <h2>Account Check</h2>
          <div class="check-row">
            <div><span class="box"></span> Existing patient account</div>
            <div><span class="box"></span> New patient</div>
          </div>
        </div>

        <div class="section">
          <h2>Patient Details</h2>
          <div class="grid">
            <div class="full">
              <span class="field-label">Full Name</span>
              <div class="line"></div>
            </div>
            <div>
              <span class="field-label">Mobile Number</span>
              <div class="line"></div>
            </div>
            <div>
              <span class="field-label">Email Address</span>
              <div class="line"></div>
            </div>
            <div>
              <span class="field-label">Birthdate</span>
              <div class="line"></div>
            </div>
            <div>
              <span class="field-label">Sex</span>
              <div class="line"></div>
            </div>
            <div>
              <span class="field-label">Civil Status</span>
              <div class="line"></div>
            </div>
            <div class="full">
              <span class="field-label">Home Address</span>
              <div class="line"></div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>Visit Details</h2>
          <div class="grid">
            <div>
              <span class="field-label">Clinic Type</span>
              <div class="line"></div>
            </div>
            <div>
              <span class="field-label">Preferred Doctor</span>
              <div class="line"></div>
            </div>
            <div class="full">
              <span class="field-label">Reason for Visit / Main Concern</span>
              <div class="line"></div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>Consent</h2>
          <div class="consent">
            I have read and agree to the Privacy Policy. I consent to the collection and processing of my personal data in accordance with Republic Act 10173 (Data Privacy Act of 2012).
          </div>
          <div class="signatures">
            <div>
              <div class="signature-line">Patient Signature over Printed Name</div>
            </div>
            <div>
              <div class="signature-line">Date Signed</div>
            </div>
          </div>
        </div>

        <p class="note">This form may be printed directly or saved as PDF from the browser print dialog.</p>
      </body>
    </html>
  `)

  popup.document.close()
  popup.focus()
  popup.onload = () => popup.print()
}
