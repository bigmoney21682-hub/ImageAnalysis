# Image Analysis

Upload a medical image and get back two things, kept strictly apart:

- **Imaging artifacts** — what's in the picture but not in the patient, with what each
  one could be mistaken for.
- **Findings** — what's in the patient, described before it's interpreted, with a
  differential.

Then ask follow-up questions about the same image, with the report already in context.

A static React PWA. Runs entirely in the browser against your own Gemini API key —
no backend, no server that ever sees your images.

> **Not a medical device.** An educational and quality-assurance aid built on a
> general-purpose AI model. Not validated for diagnosis. Nothing it says should
> change what happens to a patient.

## Why the artifact/pathology split

It's the distinction that actually costs people something when it's got wrong. Motion
blur reads as basal consolidation. A beam-hardening streak reads as a bleed. A hair
braid reads as a lung opacity. Patient rotation manufactures cardiomegaly and a
unilateral density difference at the same time.

So the model is pushed hard, in `src/lib/prompt.ts`, to sort every observation into
one bucket or the other, and to name the pathology each artifact mimics. Where it
genuinely can't tell, it's told to file it as a finding with low confidence and say
that artifact is on the differential — the honest answer, not the tidy one.

## Running it

```sh
npm install
npm run dev
```

Open Settings, paste a Gemini key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey),
hit **Test key & list models**, Save.

No key handy? Switch the provider to **Demo** — a full sample report, including a
working follow-up conversation, with no network round trip.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on localhost |
| `npm run dev:lan` | Same over HTTPS on the LAN, so a phone gets a secure context (service worker, install prompt) |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Types only |

## Where things live

```
src/
  App.tsx                 stage machine: idle → preview → analyzing → done
  components/
    Capture.tsx           file picker + what makes a usable upload
    Results.tsx           the report; artifacts and findings rendered apart
    Chat.tsx              streaming follow-up questions
    History.tsx           saved reports, each with its conversation
    Settings.tsx          provider, key, model
    Consent.tsx           the one-time "before you start"
  lib/
    prompt.ts             ← the actual quality of the app lives here
    types.ts              the report shape
    image.ts              downscale, lossless passthrough, thumbnails
    storage.ts            localStorage: key, history, transcripts
    apikey.ts             catches dirty pasted keys before Google rejects them
    providers/
      gemini.ts           structured output + SSE streaming chat
      mock.ts             sample report, no key needed
      index.ts            registry + model ranking
```

## Notes on the implementation

**Images are re-encoded carefully.** JPEG ringing around high-contrast edges is itself
an imaging artifact, and the app would then be reporting on damage it caused. Uploads
are capped at 2048px on the long edge at quality 0.95, and a lossless PNG or WebP small
enough to send is passed through untouched. The preview line tells you which happened.

**Model choice is ranked for acuity, not throughput.** `scoreModel` in
`providers/index.ts` puts Pro above Flash and penalises Lite variants heavily — subtle
low-contrast findings are exactly what a smaller model drops. Model IDs get retired
without notice, so Settings lists what *your key* can actually reach rather than
trusting a hardcoded default.

**Safety thresholds are set to `BLOCK_ONLY_HIGH`.** Clinical images — wounds, exposed
anatomy, anything dermatological — trip a general-purpose filter constantly. If one is
still blocked, the error says so and suggests a tighter crop rather than failing
opaquely.

**Follow-ups re-send the image.** Every chat turn carries the original image plus the
structured report, so answers stay anchored to what was actually seen instead of
drifting into textbook recall off the transcript.

**History stores thumbnails, never the original.** Follow-ups from the history view run
against the 512px thumbnail, and the UI says so — fine detail may not survive it.

## Privacy

By default the image goes from your browser straight to Google, using your key. It does
not pass through whatever host is serving this app. That's a deliberate consequence of
having no backend.

Configuring a proxy (see below) knowingly gives that up: the proxy holds the key, and
every image travels through whoever runs it. Leave the Proxy URL blank and nothing
changes.

Two things worth knowing before uploading anything real:

- **A free-tier AI Studio key lets Google use your prompts and images to improve their
  models.** A paid key does not. Read the terms.
- **Crop the identifiers first.** Names, MRNs and dates burned into the corners serve
  no diagnostic purpose here. The report flags it when it spots them, but by then
  they've already been sent.

Reports and thumbnails live in this browser's localStorage and nowhere else.

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. Enable Pages with source **GitHub Actions** in the repo
settings first.

`BASE_PATH` defaults to `/ImageAnalysis/` for a project site. Serving from a custom
domain or a user site? Build with `BASE_PATH=/`.

The API key is never in the build — it's typed in at runtime and stored locally. But
because this is a static site, anything running in the browser can read it. Restrict
the key by HTTP referrer in the Google console, and rotate it if you share the device.

**Do not try to bake a key into the build.** A `.env` file keeps the key out of git, but
Vite substitutes `import.meta.env.VITE_*` values into the JavaScript at build time, so
the key ships inside `dist/assets/*.js` for anyone to read. There is no build-time
mechanism that avoids this, because a static site has no server to keep a secret on.
Google's secret scanning will likely revoke such a key on its own.

### Sharing a link without handing out keys

`worker/` is an optional Cloudflare Worker that holds one key server-side and gates
access with a passphrase. Deploy it, then set **Settings → Proxy URL**. See
[worker/README.md](worker/README.md) — including what it costs you in privacy.
