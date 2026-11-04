# Tutorial clips

Short looping clips for the feature guides ("Learn more" on a feature tip, the guides in Help).
Each guide slide can show one clip. A slide whose clip is missing draws a placeholder (the
feature's icon on an office floor pattern with the slide title), so a missing file never shows as
a broken video.

## Naming

| File | What it is |
|---|---|
| `<lesson>-<n>.webm` | The clip for slide `n` (1-based) of the lesson `<lesson>`, e.g. `build-1.webm` |
| `<lesson>-<n>.webp` | A still from it, shown while the clip loads and when motion is reduced |

`<lesson>` is a feature id from `web/src/onboarding/features.ts` (`office`, `status`, `build`,
`hire`, `inbox`…). Not every slide has a clip: `LESSON_MEDIA` in `web/src/onboarding/lessons.ts`
lists the ones that do, with a `capture` note on what each one shows.

## Recording

Every clip is recorded by a script from the real UI, so they can be made again whenever the UI
changes:

```sh
npm run tutorial:capture                           # every clip
npm run tutorial:capture -- --only build-1,hire-2  # just these
npm run tutorial:capture -- --list                 # the clips and what each one shows
```

Needs ffmpeg with VP9 (`brew install ffmpeg`, or point `FFMPEG` at one) and Playwright's
Chromium (`npx playwright install chromium`; Playwright itself is a dev dependency). It uses the
dev server on port 5317 when it is running and otherwise starts its own.

How it works (`scripts/capture-tutorials.ts`, scenes in `scripts/tutorials/`):

- Each clip has a scene in `scripts/tutorials/scenes.ts`, keyed like the file name. A scene sets
  things up off camera, then drives the app in demo mode (`?demo=1`) with a visible pointer at a
  human pace. Positions come from the running app (worker and room boxes, the office layout), so
  the scenes survive layout changes. When the demo doesn't get where a scene needs it in time, the
  clip is recorded again (up to three tries).
- Every clip starts from the same place: a 1280×720 window, intro tour and contextual tips off,
  Night office theme, Pixel font, no holiday, sound off, toasts hidden unless the clip is about one.
- The approval hooks, T3 Code and phone access clips (`attention-3`, `connections-1`, `phone-2`)
  need the live daemon. For those the page runs against a stand-in daemon
  (`scripts/tutorials/live.ts`): the demo office over the WebSocket, and a made-up setup for the
  `/api` routes those panels read. The pairing code is made up and blurred as well.
- The page is recorded with Chromium's screencast, trimmed to the scene, cropped to the part that
  matters (16:9) and encoded to VP9 WebM, 960×540, 30 fps, no audio, with a short fade at both
  ends so the loop restarts softly. Two-pass encoding keeps each clip around 200 KB. The poster
  is a WebP of a frame from the middle of the action.

The script prints the size of every clip and lists failures (and exits with an error if any clip
failed). `--keep` keeps the recorded frames and a screenshot of any failed scene in a temp folder,
and `TUTORIAL_DEBUG=1` prints what each scene is doing.

The guide plays clips muted and looping. With reduced motion on it shows the poster and a play
button instead.
