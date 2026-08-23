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
hit **Test key & list models**, Save. Your key is always tried first, and no image
leaves the browser except to Google while it is working.

No key handy? The deployed app falls back to a **shared service** — a pool of keys held
by a Cloudflare Worker, rate limited per IP. Or switch the provider to **Demo** for a
full sample report, including a working follow-up conversation, with no network round
trip at all.

A request falls back on three axes, because they fail for unrelated reasons:

| Level | Tries, in order | Fixes |
| --- | --- | --- |
| Vendor | Gemini → Groq | a vendor having an afternoon |
| Credential | your key → your proxy → shared service | a spent daily quota |
| Model | your choice → next best your key can reach | a retired or rate-limited model |

Capped at 7 upstream calls per analysis, so a bad day is an error rather than a long
silence. It never falls back to Demo — a report always comes from a real model, and a
banner names it when it was not the one you picked.

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
    Settings.tsx          provider, key, model, proxy, shared service
    Quota.tsx             what is left of the shared daily allowance
    Consent.tsx           the one-time "before you start"
  lib/
    prompt.ts             ← the actual quality of the app lives here
    types.ts              the report shape
    image.ts              downscale, lossless passthrough, thumbnails
    storage.ts            localStorage: key, history, transcripts
    apikey.ts             catches dirty pasted keys before Google rejects them
    providers/
      gemini.ts           structured output + SSE streaming chat
      groq.ts             second vendor, OpenAI-compatible, proxy-only
      mock.ts             sample report, no key needed
      index.ts            registry + the vendor-level fallback
      rank.ts             model ranking, shared with the fallback chain
      fallback.ts         retry across models, then across credentials
    proxy.ts              credential chain + shared-allowance store
```

## Notes on the implementation

**Images are re-encoded carefully.** JPEG ringing around high-contrast edges is itself
an imaging artifact, and the app would then be reporting on damage it caused. Uploads
are capped at 2048px on the long edge at quality 0.95, and a lossless PNG or WebP small
enough to send is passed through untouched. The preview line tells you which happened.

**Model choice is ranked for a free key that answers.** `scoreModel` in
`providers/rank.ts` puts Flash above Pro and penalises Lite variants heavily. Pro reads
faint low-contrast detail better and would be the right default on a paid key, but on
the free tier it is rate limited hard enough to usually return 429 — and a failed
attempt still costs a request against the shared daily allowance, so leading with Pro
spent two units per report. Pro sits one place down, which is where the fallback chain
looks next, and stays selectable outright. Model IDs get retired without notice, so
Settings lists what *your key* can actually reach rather than trusting a hardcoded
default.

**Nothing in the path is assumed to work.** A retired model, a spent daily quota or a
disabled project used to be a dead end the user could only clear by guessing at
Settings. Now `providers/fallback.ts` walks down that same ranking — up to five models,
then on to the next credential — and the report says which model actually wrote it when
it was not the one you asked for. Only faults another model could plausibly fix are
retried: a bad key or a safety block fails on the first request, because spending four
more to prove it just makes the error slower.

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

**With your own key**, the image goes from your browser straight to Google. It does not
pass through whatever host is serving this app. That's a deliberate consequence of
having no backend, and it is the first thing the app tries.

**Without one**, the shared service serves the request: a Cloudflare Worker holding a
pool of keys the app's owner pays for, rate limited per IP, with every image travelling
through their Cloudflare account on the way to Google. Untick **Use the shared service**
in Settings to remove it from the chain and guarantee nothing leaves the browser except
to Google. See `worker/README.md` to run your own.

Your key is used first and the shared pool only picks up when yours is exhausted, so
adding a key both overrides the shared one and extends it.

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
