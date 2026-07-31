/** How we came to believe a claim. Drives the badge shown next to it. */
export type Evidence = 'visible' | 'measured' | 'inferred' | 'guess'
export type Confidence = 'high' | 'medium' | 'low'

/** Shared scale for both artifacts and findings, so one glance ranks the page. */
export type Severity = 'incidental' | 'minor' | 'moderate' | 'significant' | 'critical'

/**
 * Where an artifact came from. This is the axis a technologist actually acts
 * on: patient-caused ones need coaching, equipment ones need service.
 */
export type ArtifactSource = 'patient' | 'equipment' | 'technique' | 'processing' | 'external'

export interface Study {
  /** e.g. "Chest radiograph", "Axial CT", "T2-weighted MRI", "B-mode ultrasound". */
  modality: string
  /** e.g. "Chest", "Right knee", "Abdomen/pelvis". */
  bodyRegion: string
  /** e.g. "PA erect", "Lateral", "Axial", "Coronal STIR". */
  projection?: string
  /** "left" / "right" / "bilateral" — only when the image itself shows it. */
  laterality?: string
  /** Demographic cues legible in the image, e.g. "skeletally mature". Never a
   *  claim about who the patient is. */
  patientClues?: string[]
}

/**
 * A technical quality axis — exposure, positioning, collimation, inspiration.
 * Separate from artifacts: a rotated film isn't an artifact, it's poor
 * positioning, and the corrective action differs.
 */
export interface QualityCheck {
  aspect: string
  verdict: 'good' | 'acceptable' | 'poor'
  detail: string
}

/**
 * Something in the image that is NOT in the patient. The whole point of the app
 * is keeping these strictly out of the findings list.
 */
export interface ImagingArtifact {
  name: string
  source: ArtifactSource
  /** Where it sits in the image, in plain terms. */
  where: string
  /** The physics or the workflow slip that produced it. */
  cause: string
  /** What it stops you reading, or how it degrades interpretation. */
  impact: string
  /** What to change on a repeat, or how to correct it. */
  remedy: string
  /** The pathology this could be mistaken for — the dangerous part. */
  mimics?: string
  severity: Severity
  confidence: Confidence
}

/** Something in the patient. Anatomy, disease, hardware, post-surgical change. */
export interface Finding {
  name: string
  /** Anatomical location, as specific as the image supports. */
  location: string
  /** What is actually visible — the descriptive layer. */
  appearance: string
  /** Why it matters clinically — the interpretive layer. */
  significance: string
  /** Other things that look like this. Empty when genuinely unambiguous. */
  differentials: string[]
  severity: Severity
  evidence: Evidence
  confidence: Confidence
}

export interface Analysis {
  /** Plain-English answer to "what am I looking at and what's wrong". */
  summary: string
  study: Study
  confidence: Confidence
  /** False when the upload isn't a medical image at all; everything else is
   *  then near-empty and the UI says so rather than inventing a report. */
  isMedicalImage: boolean
  quality: QualityCheck[]
  artifacts: ImagingArtifact[]
  findings: Finding[]
  /** Structures reviewed and unremarkable — the negatives that make a report
   *  trustworthy. */
  normalStructures: string[]
  /** What would resolve the ambiguity: a repeat view, a prior, another modality. */
  recommendations: string[]
  /** Caveats and things this image genuinely cannot answer. */
  limitations: string[]
  /** True when patient identifiers are burned into the pixels. */
  phiVisible: boolean
}

export interface AnalyzeInput {
  /** Base64 image data, no data: prefix. */
  imageBase64: string
  mimeType: string
  /** Optional clinical context, e.g. "58M, pleuritic chest pain". */
  hint?: string
}

export interface AnalyzeOptions {
  apiKey?: string
  /** Overrides the adapter's default. Model IDs get retired, so this is chosen
   *  from what the key can actually reach rather than hardcoded. */
  model?: string
  signal?: AbortSignal
}

export interface ChatMessage {
  role: 'user' | 'model'
  text: string
}

export interface ChatInput {
  imageBase64: string
  mimeType: string
  /** The report under discussion, so follow-ups stay anchored to it. */
  analysis: Analysis
  hint?: string
  /** Full transcript, ending with the question just asked. */
  messages: ChatMessage[]
}

export interface Provider {
  id: string
  label: string
  /** Whether this provider needs a key before it can run. */
  needsKey: boolean
  /** Fallback when the user hasn't picked one. May be retired at any time. */
  defaultModel: string
  analyze(input: AnalyzeInput, opts: AnalyzeOptions): Promise<Analysis>
  /**
   * Answers a follow-up about an image already analyzed. Streams: onDelta fires
   * with each fragment, and the resolved value is the complete answer.
   */
  chat(input: ChatInput, opts: AnalyzeOptions, onDelta?: (text: string) => void): Promise<string>
}
