import { useRef } from 'react'

interface Props {
  onPick: (file: File) => void
  disabled?: boolean
}

const TIPS = [
  [
    'Send the file, not a photo of the screen',
    'Export a PNG or JPEG from the viewer where you can. A phone photo of a monitor adds moiré, glare and colour cast that get read as artifacts.',
  ],
  [
    'One image, one region',
    'A single view or slice, cropped to the anatomy in question. A contact sheet of twelve slices gets a shallow answer about all twelve.',
  ],
  [
    'Keep the window settings you would read on',
    'Lung windows hide a pleural effusion; bone windows flatten soft tissue. Whatever you would look at is what to send.',
  ],
  [
    'Crop out the identifiers',
    'Names, MRNs and dates burned into the corners serve no diagnostic purpose here, and cropping them means they never leave the device.',
  ],
]

/**
 * A file input rather than getUserMedia. Most images arrive as exports from a
 * PACS viewer or a phone gallery, and where the camera is used the OS one gives
 * autofocus and full sensor resolution, which no in-page capture matches.
 */
export function Capture({ onPick, disabled }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onPick(file)
    // Reset so picking the same file twice still fires a change event.
    e.target.value = ''
  }

  return (
    <div className="capture">
      <div className="capture__art" aria-hidden="true">
        <svg viewBox="0 0 120 96" role="presentation">
          <rect x="10" y="8" width="100" height="80" rx="7" className="film-body" />
          <g className="film-anat">
            <path d="M60 24 v48" />
            <path d="M60 32 C 46 32 36 38 31 47" />
            <path d="M60 32 C 74 32 84 38 89 47" />
            <path d="M60 46 C 44 46 33 53 28 62" />
            <path d="M60 46 C 76 46 87 53 92 62" />
            <path d="M60 60 C 47 60 38 66 34 73" />
            <path d="M60 60 C 73 60 82 66 86 73" />
          </g>
          <circle cx="79" cy="58" r="10" className="film-mark" />
        </svg>
      </div>

      <h1>What's in this image?</h1>
      <p className="capture__lede">
        Upload a medical image and get two things kept strictly apart: the imaging artifacts —
        what's in the picture but not in the patient — and the pathology. Then ask follow-up
        questions about it.
      </p>

      <div className="capture__actions">
        <button
          className="btn btn--primary"
          onClick={() => libraryRef.current?.click()}
          disabled={disabled}
        >
          Choose an image
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => cameraRef.current?.click()}
          disabled={disabled}
        >
          Take a photo
        </button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handle}
        hidden
      />
      <input ref={libraryRef} type="file" accept="image/*" onChange={handle} hidden />

      <section className="tips">
        <h2>For a usable result</h2>
        <ul>
          {TIPS.map(([title, body]) => (
            <li key={title}>
              <strong>{title}.</strong> {body}
            </li>
          ))}
        </ul>
      </section>

      <p className="capture__legal">
        Educational and quality-assurance tool. Not a medical device, not validated for diagnosis,
        and not a substitute for a qualified clinician reading the study.
      </p>
    </div>
  )
}
