interface Props {
  onAccept: () => void
}

/**
 * Shown once, before the first upload. Sending a patient image to a third-party
 * API is a decision with real consequences, and burying it in a footer would be
 * the wrong call — so it is made deliberately, once, and then never nags again.
 */
export function Consent({ onAccept }: Props) {
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Before you start">
      <div className="sheet__inner">
        <header className="sheet__head">
          <h2>Before you start</h2>
        </header>

        <ul className="consent">
          <li>
            <strong>This is not a medical device.</strong> It is an educational and
            quality-assurance aid built on a general-purpose AI model. It is not validated for
            diagnosis, it will be confidently wrong sometimes, and nothing it says should change
            what happens to a patient.
          </li>
          <li>
            <strong>Images leave this device.</strong> Each upload is sent directly from your
            browser to the AI provider you configure, using your own API key. It does not pass
            through the server hosting this app — but it does reach the provider, and their terms
            govern what happens next.
          </li>
          <li>
            <strong>De-identify first.</strong> Crop out names, record numbers and dates before
            uploading. Confirm you have the authority and the consent to share the image at all.
          </li>
          <li>
            <strong>Only reports are stored.</strong> Reports and small thumbnails stay in this
            browser's local storage. The full-resolution image is never saved anywhere.
          </li>
        </ul>

        <div className="sheet__actions">
          <button className="btn btn--primary btn--wide" onClick={onAccept}>
            I understand
          </button>
        </div>
      </div>
    </div>
  )
}
