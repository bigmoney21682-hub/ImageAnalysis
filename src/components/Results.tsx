import { useRef, useState } from 'react'
import type {
  Analysis,
  ArtifactSource,
  Confidence,
  Evidence,
  Severity,
} from '../lib/types'

const EVIDENCE_LABEL: Record<Evidence, string> = {
  visible: 'seen',
  measured: 'measured',
  inferred: 'inferred',
  guess: 'guess',
}

const EVIDENCE_TITLE: Record<Evidence, string> = {
  visible: 'Directly visible in the image',
  measured: 'Derived from a proportion assessed within the image',
  inferred: 'Deduced from the pattern, not seen outright',
  guess: 'A plausible possibility — treat with suspicion',
}

const SOURCE_TITLE: Record<ArtifactSource, string> = {
  patient: 'Caused by the patient — movement, breathing, positioning',
  equipment: 'Caused by the hardware — detector, coil, grid, tube',
  technique: 'Caused by how the exposure was set up or acquired',
  processing: 'Introduced after acquisition — reconstruction or compression',
  external: 'Caused by something on or around the patient',
}

const SEVERITY_ORDER: Severity[] = ['critical', 'significant', 'moderate', 'minor', 'incidental']

function bySeverity<T extends { severity: Severity }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  )
}

function Badge({ evidence, confidence }: { evidence: Evidence; confidence: Confidence }) {
  return (
    <span className={`badge badge--${evidence}`} title={EVIDENCE_TITLE[evidence]}>
      {EVIDENCE_LABEL[evidence]}
      <span className={`dot dot--${confidence}`} title={`${confidence} confidence`} />
    </span>
  )
}

function SeverityTag({ severity }: { severity: Severity }) {
  return <span className={`sev sev--${severity}`}>{severity}</span>
}

/** Copies to the clipboard, or falls back to selecting the text where the
 *  Clipboard API is missing (it needs a secure context). */
function RawResponse({ analysis }: { analysis: Analysis }) {
  const [copied, setCopied] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)
  const json = JSON.stringify(analysis, null, 2)

  async function copy() {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // No Clipboard API (it needs a secure context) — select it so the user
      // can copy by hand rather than leaving a dead button.
      if (!preRef.current) return
      const range = document.createRange()
      range.selectNodeContents(preRef.current)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }

  return (
    <details className="raw">
      <summary>
        <span>Full model response</span>
      </summary>
      <div className="raw__body">
        <button className="btn btn--ghost raw__copy" onClick={copy}>
          {copied ? 'Copied' : 'Copy JSON'}
        </button>
        <pre ref={preRef}>{json}</pre>
      </div>
    </details>
  )
}

interface Props {
  analysis: Analysis
  imageUrl?: string
  onReset: () => void
  /** Overrides the footer button's label — history views say "Back" instead. */
  resetLabel?: string
  /** Provenance line for a saved report: when it ran, on what model. */
  meta?: string
  /** Rendered between the report and the footer button — the chat panel. */
  children?: React.ReactNode
}

export function Results({ analysis, imageUrl, onReset, resetLabel, meta, children }: Props) {
  const { study } = analysis
  const artifacts = bySeverity(analysis.artifacts)
  const findings = bySeverity(analysis.findings)
  const critical = findings.filter((f) => f.severity === 'critical')

  const studyLine = [study?.projection, study?.laterality, study?.bodyRegion]
    .filter(Boolean)
    .join(' · ')

  if (analysis.isMedicalImage === false) {
    return (
      <div className="results">
        {imageUrl && <img className="results__photo" src={imageUrl} alt="The image you uploaded" />}
        <section className="panel panel--warn">
          <h2>Not a medical image</h2>
          <p className="results__summary">{analysis.summary}</p>
        </section>
        <button className="btn btn--primary btn--wide" onClick={onReset}>
          {resetLabel ?? 'Try another image'}
        </button>
      </div>
    )
  }

  return (
    <div className="results">
      {imageUrl && <img className="results__photo" src={imageUrl} alt="The image you uploaded" />}

      <header className="results__head">
        <p className="results__type">{study?.modality ?? 'Image'}</p>
        <span className={`chip chip--${analysis.confidence}`}>
          {analysis.confidence} confidence overall
        </span>
      </header>

      {studyLine && <p className="results__study">{studyLine}</p>}
      {meta && <p className="results__meta">{meta}</p>}

      {critical.length > 0 && (
        <div className="critical" role="alert">
          <strong>Time-critical finding flagged.</strong>{' '}
          {critical.map((f) => f.name).join('; ')}. Escalate to the responsible clinician rather
          than acting on this app.
        </div>
      )}

      <p className="results__summary">{analysis.summary}</p>

      {analysis.phiVisible && (
        <div className="panel panel--warn">
          <h2>Patient identifiers visible</h2>
          <ul>
            <li>
              This image has identifiers burned into the pixels, and they were sent to the API
              along with it. Crop them out before uploading anything further.
            </li>
          </ul>
        </div>
      )}

      {artifacts.length > 0 && (
        <section className="panel">
          <h2>
            Imaging artifacts
            <span className="panel__note">in the picture, not in the patient</span>
          </h2>
          <ul className="cards">
            {artifacts.map((a, i) => (
              <li className="card card--artifact" key={i}>
                <div className="card__top">
                  <span className="card__name">{a.name}</span>
                  <SeverityTag severity={a.severity} />
                  <span className="badge" title={SOURCE_TITLE[a.source]}>
                    {a.source}
                    <span className={`dot dot--${a.confidence}`} title={`${a.confidence} confidence`} />
                  </span>
                </div>
                <div className="card__where">{a.where}</div>
                <dl className="kv">
                  <dt>Cause</dt>
                  <dd>{a.cause}</dd>
                  <dt>Effect</dt>
                  <dd>{a.impact}</dd>
                  {a.mimics && (
                    <>
                      <dt className="kv__alarm">Mistakable for</dt>
                      <dd className="kv__alarm">{a.mimics}</dd>
                    </>
                  )}
                  <dt>Fix</dt>
                  <dd>{a.remedy}</dd>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      )}

      {findings.length > 0 && (
        <section className="panel">
          <h2>
            Findings
            <span className="panel__note">in the patient</span>
          </h2>
          <ul className="cards">
            {findings.map((f, i) => (
              <li className={`card card--finding card--sev-${f.severity}`} key={i}>
                <div className="card__top">
                  <span className="card__name">{f.name}</span>
                  <SeverityTag severity={f.severity} />
                  <Badge evidence={f.evidence} confidence={f.confidence} />
                </div>
                <div className="card__where">{f.location}</div>
                <dl className="kv">
                  <dt>Appearance</dt>
                  <dd>{f.appearance}</dd>
                  <dt>Significance</dt>
                  <dd>{f.significance}</dd>
                </dl>
                {f.differentials?.length > 0 && (
                  <div className="diffs">
                    <span className="diffs__label">Differential</span>
                    <ul>
                      {f.differentials.map((d, j) => (
                        <li key={j}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.quality.length > 0 && (
        <section className="panel">
          <h2>Technical quality</h2>
          <ul className="quality">
            {analysis.quality.map((q, i) => (
              <li key={i}>
                <div className="quality__top">
                  <span className="quality__aspect">{q.aspect}</span>
                  <span className={`verdict verdict--${q.verdict}`}>{q.verdict}</span>
                </div>
                <div className="quality__detail">{q.detail}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.normalStructures.length > 0 && (
        <section className="panel">
          <h2>
            Reviewed and unremarkable
            <span className="panel__note">the negatives</span>
          </h2>
          <ul className="normals">
            {analysis.normalStructures.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      {analysis.recommendations.length > 0 && (
        <section className="panel panel--action">
          <h2>What would settle it</h2>
          <ul>
            {analysis.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      {analysis.limitations.length > 0 && (
        <section className="panel panel--muted">
          <h2>What this image cannot answer</h2>
          <ul>
            {analysis.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="results__legal">
        Generated by a general-purpose AI model. Not a medical device and not validated for
        diagnosis — treat every line above as a prompt to look again, not as a report.
      </p>

      {children}

      <RawResponse analysis={analysis} />

      <button className="btn btn--primary btn--wide" onClick={onReset}>
        {resetLabel ?? 'Analyze another image'}
      </button>
    </div>
  )
}
