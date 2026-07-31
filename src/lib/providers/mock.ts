import type { Analysis, ChatInput, Provider } from '../types'

/**
 * Lets you exercise the whole upload -> report -> follow-up flow on a phone
 * without a key or a network round trip. Handy for UI work, and for showing
 * someone what the app does without putting a real study through it.
 */
const SAMPLE: Analysis = {
  summary:
    'This is a frontal (PA) chest radiograph of a skeletally mature adult. Two things are going on and they need keeping apart. First, the picture itself: the patient is rotated to the left and there is motion blur along the right hemidiaphragm, which softens exactly the edge you would want crisp. Second, the patient: there is a patchy opacity in the right lower zone that does not efface the right heart border, sitting behind the diaphragm, with a small blunting of the right costophrenic angle. That pattern fits a right lower lobe consolidation with a small effusion. The motion blur overlies part of the same region, so a small amount of the haziness there is photographic rather than pathological — the consolidation is still real, but its exact margin is not readable on this film.',
  study: {
    modality: 'Chest radiograph',
    bodyRegion: 'Chest',
    projection: 'PA erect',
    patientClues: ['Skeletally mature — fused growth plates at the visible clavicles'],
  },
  confidence: 'medium',
  isMedicalImage: true,
  phiVisible: false,
  quality: [
    {
      aspect: 'Exposure',
      verdict: 'acceptable',
      detail:
        'Thoracic vertebral bodies are faintly visible behind the heart, which is about right. Slightly dark, but not enough to lose lung markings.',
    },
    {
      aspect: 'Positioning',
      verdict: 'poor',
      detail:
        'The medial ends of the clavicles are not equidistant from the spinous processes — the patient is rotated to the left. This exaggerates the right lung field and can fabricate an apparent density difference between the two sides.',
    },
    {
      aspect: 'Inspiration',
      verdict: 'acceptable',
      detail:
        'Nine posterior ribs are visible above the diaphragm. Adequate; ten would be ideal.',
    },
    {
      aspect: 'Collimation',
      verdict: 'good',
      detail: 'Both costophrenic angles and both apices are included.',
    },
  ],
  artifacts: [
    {
      name: 'Motion blur',
      source: 'patient',
      where: 'Right hemidiaphragm and the adjacent right lower zone',
      cause:
        'The patient breathed or moved during the exposure. The diaphragm travels furthest of anything in the chest, so it blurs first.',
      impact:
        'The diaphragmatic outline is soft, so the upper margin of the lower-zone opacity cannot be placed precisely, and a very small amount of free subdiaphragmatic air would be unreadable.',
      remedy:
        'Repeat with a clear breath-hold instruction and the shortest exposure time the technique allows.',
      mimics:
        'Basal consolidation or atelectasis — blur alone can produce a hazy lower zone in a patient with clear lungs.',
      severity: 'moderate',
      confidence: 'high',
    },
    {
      name: 'Patient rotation',
      source: 'technique',
      where: 'Whole image — asymmetric clavicles and unequal lung field widths',
      cause: 'The patient was not square to the detector when the exposure was made.',
      impact:
        'Rotation makes one lung appear denser than the other and shifts the mediastinal contours, so both cardiac size and any side-to-side density comparison are unreliable here.',
      remedy: 'Reposition with both shoulders in contact with the detector and repeat.',
      mimics:
        'Unilateral lung opacity, cardiomegaly, or mediastinal shift — all three can be pure rotation.',
      severity: 'moderate',
      confidence: 'high',
    },
    {
      name: 'Overlying necklace chain',
      source: 'external',
      where: 'Draped across the upper mediastinum and left clavicle',
      cause: 'Metal jewellery was not removed before the exposure.',
      impact:
        'A dense linear opacity crosses the upper mediastinum, obscuring a strip of the left apical region.',
      remedy: 'Remove jewellery from the field before repeating.',
      mimics: 'A central venous line, a fractured clavicle fragment, or a calcified structure.',
      severity: 'minor',
      confidence: 'high',
    },
  ],
  findings: [
    {
      name: 'Right lower zone consolidation',
      location: 'Right lower zone, posterior — behind the right hemidiaphragm',
      appearance:
        'A patchy increase in density with indistinct margins and what look like air bronchograms (dark branching airways standing out against the whitened lung). The right heart border stays sharp, which places the opacity posteriorly rather than in the middle lobe.',
      significance:
        'Consolidation means the alveoli have filled with something — most often infection. Preservation of the heart border localises it to the lower lobe.',
      differentials: [
        'Community-acquired pneumonia (most likely given the pattern)',
        'Aspiration, if the clinical picture supports it',
        'Pulmonary oedema, though this would usually be bilateral',
        'Partly artifactual haziness from the overlying motion blur',
      ],
      severity: 'significant',
      evidence: 'visible',
      confidence: 'medium',
    },
    {
      name: 'Blunting of the right costophrenic angle',
      location: 'Right costophrenic angle',
      appearance:
        'The normally sharp acute angle between the diaphragm and the chest wall is filled in with a shallow meniscus.',
      significance:
        'A small pleural effusion. On an erect film roughly 200 ml is needed before the angle blunts, so this indicates a modest volume, commonly a parapneumonic effusion alongside the consolidation above.',
      differentials: ['Small parapneumonic effusion', 'Pleural thickening from old disease'],
      severity: 'moderate',
      evidence: 'visible',
      confidence: 'medium',
    },
    {
      name: 'Cardiac silhouette',
      location: 'Mediastinum',
      appearance:
        'The cardiothoracic ratio measures a little over half, but the patient is rotated, which widens the apparent cardiac shadow.',
      significance:
        'Cannot be called enlarged on this film. Rotation is the more likely explanation for the measurement.',
      differentials: ['Rotation artifact', 'True cardiomegaly'],
      severity: 'incidental',
      evidence: 'measured',
      confidence: 'low',
    },
  ],
  normalStructures: [
    'Left lung field is clear, with no focal opacity',
    'Trachea is central',
    'Both hila are of normal position and density',
    'No pneumothorax at either apex',
    'No free gas visible under either hemidiaphragm, within the limits of the blur',
    'Bony thorax shows no acute fracture',
  ],
  recommendations: [
    'Repeat the PA with a proper breath-hold and square positioning — that single repeat resolves both the blur and the rotation.',
    'A lateral view would confirm the lower lobe location and better assess the effusion.',
    'Compare with any prior chest imaging before deciding whether the cardiac size has changed.',
  ],
  limitations: [
    'A single frontal projection. Anything hidden behind the heart, the diaphragm or the mediastinum is under-assessed.',
    'No prior study for comparison, so nothing here can be called new or old.',
    'The motion blur and the region of interest overlap, so the true extent of the consolidation is not readable on this image.',
  ],
}

const SAMPLE_ANSWER =
  'On this film I would put it at moderate confidence, not high, and the reason is the overlap.\n\n' +
  'The motion blur sits over the right hemidiaphragm, which is exactly where the opacity is. Blur alone whitens a lower zone, so some of the haziness there is photographic. What makes me keep consolidation on the list rather than calling it all artifact is the air bronchograms — dark branching airways standing out against whitened lung. Blur softens edges; it does not create branching dark lines inside an opacity. Those need air in the airways with fluid around them, and that is a patient finding.\n\n' +
  'The blunted right costophrenic angle points the same way, and it sits slightly outside the worst of the blur.\n\n' +
  'What I cannot tell you from this image is how far the consolidation extends. A repeat with a clean breath-hold settles that in one exposure, and a lateral would confirm it is the lower lobe rather than the middle.\n\n' +
  '(This is sample data — no image was actually analyzed.)'

export const mockProvider: Provider = {
  id: 'mock',
  label: 'Demo (sample report, no key)',
  needsKey: false,
  defaultModel: '',

  async analyze(_input, { signal }) {
    await wait(1400, signal)
    return SAMPLE
  },

  async chat(_input: ChatInput, { signal }, onDelta) {
    // Typed out word by word so the streaming UI gets exercised too.
    const words = SAMPLE_ANSWER.split(/(\s+)/)
    for (const word of words) {
      await wait(18, signal)
      onDelta?.(word)
    }
    return SAMPLE_ANSWER
  },
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}
