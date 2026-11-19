// Letterhead and geometry transcribed from the clinic-supplied med-cert.docx.
// Clinical values and physician details always come from the saved certificate.
export const MEDICAL_CERTIFICATE_PAGE = Object.freeze({width:612,height:792,scale:2})
export const MEDICAL_CERTIFICATE_LOGOS = Object.freeze({
 manilamed:'/medical-certificate/manilamed.jpg',carait:'/medical-certificate/carait.jpg',
})
const FONT='Calibri, Carlito, Arial, sans-serif'
const LEFT=36, RIGHT=542, BOTTOM=720
export function jpegPagesToPdf(pages){
 const encoder=new TextEncoder(),chunks=[],offsets=[0];let size=0
 const append=data=>{const bytes=typeof data==='string'?encoder.encode(data):data;chunks.push(bytes);size+=bytes.length}
 const object=(n,body)=>{offsets[n]=size;append(`${n} 0 obj\n`);append(body);append('\nendobj\n')}
 append('%PDF-1.4\n')
 object(1,'<< /Type /Catalog /Pages 2 0 R >>')
 object(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`)
 pages.forEach((page,i)=>{
  const pageWidth=page.pageWidth??MEDICAL_CERTIFICATE_PAGE.width,pageHeight=page.pageHeight??MEDICAL_CERTIFICATE_PAGE.height
  const n=3+i*3,content=`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`
  object(n,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${n+1} 0 R >> >> /Contents ${n+2} 0 R >>`)
  offsets[n+1]=size;append(`${n+1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`);append(page.bytes);append('\nendstream\nendobj\n')
  object(n+2,`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`)
 })
 const xref=size,count=3+pages.length*3
 append(`xref\n0 ${count}\n0000000000 65535 f \n`)
 for(let i=1;i<count;i++)append(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`)
 append(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
 return new Blob(chunks,{type:'application/pdf'})
}
const dateParts=value=>{
 const text=String(value||'').slice(0,10)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null
 const parts=text.split('-').map(Number),date=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]))
 return date.toISOString().slice(0,10)===text?parts:null
}
const longDate=value=>{
 const parts=dateParts(value)
 return parts?new Intl.DateTimeFormat('en-PH',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric'}).format(new Date(Date.UTC(parts[0],parts[1]-1,parts[2]))):'Not recorded'
}
export function certificateContent(c){
 const birth=dateParts(c.birthdate),visit=dateParts(c.consultation_date)
 let age=null
 if(birth&&visit){
  const years=visit[0]-birth[0]-(visit[1]<birth[1]||visit[1]===birth[1]&&visit[2]<birth[2]?1:0)
  if(years>=0)age=years
 }
 const sex=({male:'M',female:'F',m:'M',f:'F'})[String(c.sex||'').toLowerCase()]||String(c.sex||'').trim()
 const patient=[c.patient_name||'Patient',[age,sex].filter(v=>v!==null&&v!=='').join('/')].filter(Boolean).join(' ')
 return {
  patient,age,sex,
  introduction:`This is to certify that ${patient} was seen on ${longDate(c.consultation_date)} at ${c.branch_name||'Carait Medical and Dermatology Clinic'}.`,
  consultationDate:String(c.consultation_date||'Not recorded'),
  issuanceDate:c.issuance_date||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),
  doctorName:c.doctor_name||'Issuing physician',specialty:c.specialty||'',
  license:`License No. ${c.prc_license||'Not recorded'}`,
  ptr:`PTR No. ${c.ptr_number||'__________________'}`,
 }
}

// Accessible text for the canvas preview and a readable document representation.
export function certificateParagraphs(c){
 const content=certificateContent(c)
 return [
  ['Room 215 Medical Center Manila',10,true],['UN Avenue cor Taft Avenue Manila 1000',8,true],
  ['Carait Medical and Dermatology Clinic',10,true],['Bonifacio Street, Canlalay, Binan Laguna 4024',8,true],
  ['MEDICAL CERTIFICATE',18,true],
  [`Consultation Date: ${content.consultationDate}`,8],[`Date Issued: ${content.issuanceDate}`,8],
  [content.introduction,11],['Diagnosis:',11],[c.diagnosis||'',16,true],
  ['Recommendation:',11],[c.recommendation||'',11],['Remarks:',11],[c.remarks||'—',11],
  [content.doctorName,11],[content.specialty,11],[content.license,11],[content.ptr,11],
 ]
}

const loadImage=url=>new Promise((resolve,reject)=>{
 const img=new Image();img.onload=()=>resolve(img)
 img.onerror=()=>reject(new Error('Certificate letterhead could not be loaded. Please retry.'))
 img.src=url
})

// Word wrapping preserves explicit newlines and splits unusually long words.
function wrapText(ctx,text,width,firstIndent=0){
 const lines=[]
 for(const paragraph of String(text??'').replace(/\r/g,'').split('\n')){
  const tokens=paragraph.match(/\S+\s*/gu)||[''];let line=''
  for(const token of tokens){
   const available=width-(lines.length===0?firstIndent:0)
   if(line&&ctx.measureText((line+token).trimEnd()).width>available){lines.push(line.trimEnd());line=''}
   // Recompute width after the indented first line is committed.
   for(const char of token){
    const limit=width-(lines.length===0?firstIndent:0)
    if(line&&ctx.measureText(line+char).width>limit){lines.push(line.trimEnd());line=''}
    if(line||!/^\s$/u.test(char))line+=char
   }
  }
  lines.push(line.trimEnd())
 }
 return lines
}

// Preview and PDF use these very same rendered pages, including pagination.
export async function renderMedicalCertificatePages(c){
 await document.fonts.ready
 const [manilamed,carait]=await Promise.all(Object.values(MEDICAL_CERTIFICATE_LOGOS).map(loadImage))
 const content=certificateContent(c),pages=[]
 let canvas,ctx,y
 const font=(size=11,bold=false,family=FONT)=>{ctx.font=`${bold?'bold ':''}${size}px ${family}`}
 const text=(value,x,baseline,size=11,bold=false,align='left',family=FONT)=>{
  font(size,bold,family);ctx.textAlign=align;ctx.fillText(String(value??''),x,baseline);ctx.textAlign='left'
 }
 const page=()=>{
  const {width,height,scale}=MEDICAL_CERTIFICATE_PAGE
  canvas=document.createElement('canvas');canvas.width=width*scale;canvas.height=height*scale
  ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#000'
  pages.push(canvas)
  if(pages.length>1){
   text('MEDICAL CERTIFICATE — continued',LEFT,72,13,true)
   text(content.patient,LEFT,91)
   text(`Consultation Date: ${content.consultationDate}`,LEFT,108,8)
   text(`Date Issued: ${content.issuanceDate}`,RIGHT,108,8,false,'right')
   y=137
  }
 }
 const ensureSpace=height=>{if(y+height>BOTTOM)page()}
 const block=(value,{x=70.55,width=RIGHT-x,size=11,bold=false,lineHeight=14.3,firstIndent=0,align='left'}={})=>{
  font(size,bold)
  const lines=wrapText(ctx,value,width,firstIndent)
  for(const [index,line] of lines.entries()){
   ensureSpace(lineHeight)
   text(line,align==='right'?x+width:x+(index===0?firstIndent:0),y,size,bold,align)
   y+=lineHeight
  }
 }
 page()
 // The original Word letterhead places both logos together above two columns.
 ctx.drawImage(manilamed,68.95,82.1,144.3,37.95)
 ctx.drawImage(carait,222.3,82.1,52.4,52.05)
 text('Room 215 Medical Center Manila',68.95,147,10,true)
 text('UN Avenue cor Taft Avenue Manila 1000',71,158,8,true,'left','Arial, sans-serif')
 text('Tel No: 02- 5222275',71,172,6,true,'left','Arial, sans-serif')
 text('Monday: 9-12am',71,180,6,true,'left','Arial, sans-serif')
 text('Thursday 2-6pm',71,187,6,true,'left','Arial, sans-serif')
 text('Carait Medical and Dermatology Clinic',353,147,10,true)
 text('Bonifacio Street, Canlalay, Binan Laguna 4024',353,158,8,true,'left','Arial, sans-serif')
 text('Tel No. 09499986956; 049-5113816',353,172,7,true,'left','Arial, sans-serif')
 text('Monday & Wednesday 2-5pm',353,180,6,true,'left','Arial, sans-serif')
 text('Tuesday: 11-5pm',353,187,6,true,'left','Arial, sans-serif')
 text('Saturdays: 1am-6pm',353,194,6,true,'left','Arial, sans-serif')
 text('MEDICAL CERTIFICATE',287.95,242,18,true,'center')
 const titleWidth=ctx.measureText('MEDICAL CERTIFICATE').width
 ctx.lineWidth=0.9;ctx.beginPath();ctx.moveTo(287.95-titleWidth/2,245.5);ctx.lineTo(287.95+titleWidth/2,245.5);ctx.stroke()
 text(`Consultation Date: ${content.consultationDate}`,70.55,258,8)
 text(`Date Issued: ${content.issuanceDate}`,RIGHT,258,8,false,'right')
 y=274;block(content.introduction,{x:LEFT,width:RIGHT-LEFT,firstIndent:34.55})
 y=Math.max(315,y+18);ensureSpace(48);block('Diagnosis:')
 block(c.diagnosis||'',{size:16,bold:true,lineHeight:19})
 y=Math.max(pages.length===1?390:0,y+34);ensureSpace(48)
 text('R',75.75,y,16,true);const initialWidth=ctx.measureText('R').width
 text('ecommendation:',75.75+initialWidth,y);y+=24
 block(c.recommendation||'',{x:75.75})
 y=Math.max(pages.length===1?452:0,y+25);ensureSpace(34);block('Remarks:')
 block(c.remarks||'—')
 font(11)
 const physicianLines=[content.doctorName,content.specialty,content.license,content.ptr].filter(Boolean)
 const signatureHeight=physicianLines.reduce((height,line)=>height+wrapText(ctx,line,350).length*14.3,0)
 y=Math.max(pages.length===1?524:0,y+48);ensureSpace(signatureHeight)
 // Signature space belongs to the issuing doctor; identity below is record data.
 ctx.lineWidth=0.6;ctx.beginPath();ctx.moveTo(RIGHT-112,y-18);ctx.lineTo(RIGHT,y-18);ctx.stroke()
 block(content.doctorName,{x:RIGHT-350,width:350,align:'right'})
 if(content.specialty)block(content.specialty,{x:RIGHT-350,width:350,align:'right'})
 block(content.license,{x:RIGHT-350,width:350,align:'right'})
 block(content.ptr,{x:RIGHT-350,width:350,align:'right'})
 pages.forEach((sheet,index)=>{
  const footer=sheet.getContext('2d');footer.save();footer.fillStyle='#555';footer.font=`7px ${FONT}`;footer.textAlign='right'
  footer.fillText(`MC-${c.id||'PREVIEW'} · Page ${index+1} of ${pages.length}`,RIGHT,750);footer.restore()
 })
 return pages
}

export async function downloadMedicalCertificate(c){
 const canvases=await renderMedicalCertificatePages(c)
 const pages=canvases.map(canvas=>{
  const raw=atob(canvas.toDataURL('image/jpeg',0.96).split(',')[1])
  return {width:canvas.width,height:canvas.height,bytes:Uint8Array.from(raw,ch=>ch.charCodeAt(0))}
 })
 const url=URL.createObjectURL(jpegPagesToPdf(pages)),a=document.createElement('a')
 a.href=url;a.download=`Medical-Certificate-MC-${c.id}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)
}
