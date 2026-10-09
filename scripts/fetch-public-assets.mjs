import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const assets = [
  ['client/public/logo.png', 'https://raw.githubusercontent.com/Sanjuan1290/Capstone/HEAD/client/public/logo.png'],
  ['client/public/homeBG.png', 'https://raw.githubusercontent.com/Sanjuan1290/Capstone/HEAD/client/public/homeBG.png'],
  ['client/public/doctors/paula.png', 'https://raw.githubusercontent.com/Sanjuan1290/Capstone/HEAD/client/public/doctors/paula.png'],
  ['client/public/doctors/tanjol.png', 'https://raw.githubusercontent.com/Sanjuan1290/Capstone/HEAD/client/public/doctors/tanjol.png'],
  ['client/public/about/feedback.png', 'https://raw.githubusercontent.com/Sanjuan1290/Capstone/HEAD/client/public/about/feedback.png'],
  ['client/public/about/aboutClinic.png', 'https://raw.githubusercontent.com/Sanjuan1290/Capstone/HEAD/client/public/about/aboutClinic.png'],
  ['client/public/services/acupuncture.png', 'https://raw.githubusercontent.com/Sanjuan1290/Capstone/HEAD/client/public/services/acupuncture.png'],
  ['client/public/services/vaccination.png', 'https://raw.githubusercontent.com/Sanjuan1290/Capstone/HEAD/client/public/services/vaccination.png'],
  ['client/public/services/medical_consultation.png', 'https://raw.githubusercontent.com/Sanjuan1290/Capstone/HEAD/client/public/services/medical_consultation.png'],
  ['client/public/services/animal_bite_center(ABC).png', 'https://raw.githubusercontent.com/Sanjuan1290/Capstone/HEAD/client/public/services/animal_bite_center(ABC).png'],
  ['client/public/services/dermatologic_consults_procedures.png', 'https://raw.githubusercontent.com/Sanjuan1290/Capstone/HEAD/client/public/services/dermatologic_consults_procedures.png'],
]

for (const [relativePath, url] of assets) {
  const destination = path.join(root, relativePath)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${relativePath}: HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.writeFile(destination, buffer)
  console.log(`Downloaded ${relativePath}`)
}

