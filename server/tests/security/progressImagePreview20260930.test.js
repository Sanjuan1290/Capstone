const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..', '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

describe('September 30 progress-image preview regression', () => {
  it('renders the image preview through document.body so layout overflow cannot hide it', () => {
    const consultation = read('client', 'src', 'pages', 'doctorPage', 'Doctor_Consultation.jsx')
    expect(consultation).toContain("import { createPortal } from 'react-dom'")
    expect(consultation).toContain('const ProgressImagePreviewModal')
    expect(consultation).toContain('return createPortal(')
    expect(consultation).toContain('document.body,')
    expect(consultation).toContain('z-[9999]')
  })

  it('opens preview from both the image card and Preview button', () => {
    const consultation = read('client', 'src', 'pages', 'doctorPage', 'Doctor_Consultation.jsx')
    expect(consultation).toContain('openProgressImagePreview(progressImages, image.image_url)')
    expect(consultation).toContain('<MdVisibility className="text-[12px]" /> Preview')
    expect(consultation).toContain('onClose={closeProgressImagePreview}')
    expect(consultation).toContain('onMove={moveProgressImagePreview}')
  })

  it('supports Escape and arrow-key navigation', () => {
    const consultation = read('client', 'src', 'pages', 'doctorPage', 'Doctor_Consultation.jsx')
    expect(consultation).toContain("if (event.key === 'Escape') onClose?.()")
    expect(consultation).toContain("if (event.key === 'ArrowLeft') moveProgressImagePreview(-1)")
    expect(consultation).toContain("if (event.key === 'ArrowRight') moveProgressImagePreview(1)")
  })
})

