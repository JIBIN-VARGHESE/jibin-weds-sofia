# Sofia John & Jibin Varghese — Wedding Microsite

A cinematic, scroll-told wedding invitation. Static HTML, CSS and vanilla JavaScript, with no build step, no framework, no backend. It runs on GitHub Pages for free.

```
index.html              page structure (+ link-preview tags)
config.js               ← ALL wedding details live here
assets/
  css/styles.css        design system: colour, type, spacing and motion tokens at the top
  js/main.js            content binding, scroll engine, countdown, lightbox, music
  js/rsvp.js            RSVP validation + swappable delivery providers (isolated)
  images/
    nave/               church interior layers + couple silhouettes
    glass/              stained-glass source renders (not loaded by the page)
    og-image.jpg        WhatsApp / social preview (1200×630)
  icons/favicon.svg
  music/                put wedding.mp3 here
  fonts/                self-hosted Cormorant Garamond + Jost (SIL OFL)
```

---

## 1. Editing wedding details

Open **`config.js`**. It holds the names, dates, times, venues, addresses, map links, the Bible verse, story text, timeline, photo paths, RSVP settings and music.

- If you don't know a value yet, leave it as `""`. The site then shows a quiet line such as *"Church to be announced"* or *"Time to follow"*. It never makes up details.
- Times use 24-hour Kerala time: `"11:00"`, `"16:30"`.
- `wedding.ceremonyTime` also sets the countdown target. Until you set it, the countdown runs to 00:00 IST on 25 April 2027.

**Values still to fill in:** engagement time, venue, address and Maps link (it currently searches for the town). Street addresses for the church and reception (optional; the town is shown instead). RSVP deadline (optional).

**The one exception is the link preview.** WhatsApp and iMessage read the `<meta property="og:…">` tags at the top of `index.html` without running JavaScript, so edit those by hand. After deploying, change `og:image` to the full URL, for example `https://YOUR-USERNAME.github.io/YOUR-REPO/assets/images/og-image.jpg`. Otherwise many apps won't show the image.

## 2. The journey

The page is one continuous scene, run by `assets/js/journey.js`. Scrolling doesn't move content up the page; it moves a camera through a 3D church (`assets/js/nave.js`, WebGL). Everything is placed from **one eased scroll value per frame**, so the church, cards and light never drift apart.

1. **Arrival:** your photo and names, then a fade to black.
2. **The church wakes:** "In the presence of God and our families…", candles light one by one down the aisle, then the windows.
3. **Save the Date** hangs in the air of the aisle; you walk through it.
4. **Stations:** invitation, engagement, ceremony, reception, countdown, RSVP. Each card stands in the aisle. As you reach it, the camera turns to it, it comes to the centre and holds while you read, then you walk on past. The verse appears between the invitation and the engagement, under the brightening rose window.
5. **The light:** at the altar the rose window swells until light fills the screen ("Your presence would make our celebration complete").
6. **Together:** out of the light, the couple photo. It drifts slowly closer, gold dust floats, the names write themselves, the verse and one candle appear.

**Chapters.** The page doesn't scroll. Guests tap **Continue** (or swipe once) to move to the next chapter, and a small **Back** returns; the journey then plays on its own: the camera glides, turns to the next card, the card settles and its words reveal. The opening (photo → church → Save the Date → invitation) and the ending play by themselves; the opening waits until the names, date and place are fully shown. The opening plays by itself: a line at the bottom ("Sit back — your invitation unfolds on its own") says so, and glows if someone scrolls. After it, a tap or swipe while the journey moves hurries it to the next stop. Save the Date and the verse hang in the aisle; each rests a moment and the camera walks through it.

**Changing the pacing.** At the top of `journey.js`: `STOPS` (where each chapter rests), `rate()` (how fast each stretch plays), `GATE_AT` (when the wax seal, "Open the invitation", appears under the names; the guest's tap on it starts the music and the journey), `HURRY` (how much faster a tap during a move plays), `REPEAT_INTRO` (opening speed for returning guests);
- `TOTAL` is the length in screens of scrolling;
- `STATIONS` says where each card stands (`z` along the aisle, `x` left/right) and when it arrives (`a`), holds until (`b`) and is passed (`s1`);
- `CAM` lists the camera's position along the aisle at given scroll points.

Keep the stations and the camera points in step.


**Reduce motion / no JavaScript:** the same scenes stack as a calm page over a still, lit church.

| Layer | File | Notes |
|---|---|---|
| Opening picture | `assets/images/hero/hero-portrait.webp`, `hero-landscape.webp` | the top of your collage, fading into the dark where the names sit; on wide screens it stands over a blurred copy of itself |
| The church | `assets/js/nave.js` | real 3D, built and painted in code on load: fluted columns with leafy capitals, pointed arcades, a rib vault (starry over the sanctuary), stained-glass lancets with saints (halo, robe and cloak, holding a cross, a lily or a book; three designs alternating) and a rose window, panelled pews, four bronze chandeliers, lanterns, marble steps, the altar with its crimson frontal and candles, a reredos with starry niches. Nothing to download |
| Still church (no graphics chip, or "reduce motion") | `assets/images/nave/still-portrait.webp`, `still-landscape.webp` | renders of the same church |
| The couple (finale) | `assets/images/closing/couple-arches.webp` | your AI-generated photo |

**Changing the church.** Its plan is at the top of `nave.js` (`M`: pier spacing, nave width, pews, altar) and in `build()`; the light in `render()` (`amb` for the overall level, `points` for the chandeliers, lanterns and sanctuary); the stone, marble, wood, carpet and glass are painted by the `…Tex()` functions. About 110k triangles and ~20 draw calls for the building, so phones keep up; if a phone struggles, the church is drawn at a lower resolution automatically.

**Credits.** Both photos are your own, so no credit line is needed.

## 2b. Animations (Lottie)

The site plays Lottie animations, configured in `config.js → lottie`. The player is `assets/js/vendor/lottie_light.min.js` (lottie-web, MIT licence). It only downloads when the first animation is about to appear on screen.

| Slot | Where | Current file |
|---|---|---|
| `hero` | above the names, plays once | `assets/lottie/rings.json` (gold rings drawing themselves) |
| `countdown` | above "Counting the days" | *(empty)* |
| `rsvp` | plays when a guest sends a reply | `assets/lottie/heart-burst.json` |

The current animations were made for this site. (The dust in the church light is drawn by `nave.js`, not Lottie.) **To use one from LottieFiles:**
1. Open the animation on lottiefiles.com and choose **Download → Lottie JSON**. Don't pick `.lottie`, because this player reads only `.json`.
2. Save the file in `assets/lottie/`, for example `assets/lottie/confetti.json`.
3. Set the slot's `src` to that path. Use `loop: true` for continuous effects (petals, sparkles) and `loop: false` for one-off moments (rings, a heart).
4. Check the animation's licence on its LottieFiles page.

Keep each JSON under about 300 KB, because big animations make phones stutter. Guests who have "reduce motion" turned on see the one-off animations as a still final frame, and the looping ones are hidden.

## 3. Music

Put an MP3 at `assets/music/wedding.mp3`. The opening ends with a gold wax seal, **Open the invitation**: the guest's tap on it starts the music (fading in) and the journey, so the music plays from the start for everyone (browsers only allow sound after a touch). The button top right pauses it; once paused, it stays paused. Set `music.enabled: false` to turn it off. Only use music you have the right to share.

## 4. Connecting RSVP (all free tiers)

Right now replies are **emailed to jibinv471@gmail.com** through FormSubmit (free, no account):
```js
provider: "formsubmit", endpoint: "jibinv471@gmail.com",
```
**One-time activation:** after the site is live, open it and send one test reply. FormSubmit emails an "Activate Form" link to that address (check spam). Click it; from then on every reply arrives as an email with the name, attending, number of guests and message. Until it is activated, guests see "Something went wrong", so do this before sharing the link. FormSubmit's activation email also offers a random alias you can use instead of the address, so the address isn't visible in the page source.

Other free options, if you'd rather collect replies in a spreadsheet:

**Formspree (easiest).** Sign up at formspree.io, create a form, and copy its endpoint.
```js
provider: "formspree", endpoint: "https://formspree.io/f/abcdwxyz",
```

**Google Sheets via Apps Script (free, replies land in a spreadsheet).**
1. Create a Google Sheet with headers in row 1: `submittedAt | name | attending | guests | message`.
2. Go to Extensions → Apps Script and paste:
   ```js
   function doPost(e) {
     var d = JSON.parse(e.postData.contents);
     SpreadsheetApp.getActiveSheet().appendRow([d.submittedAt, d.name, d.attending, d.guests, d.message]);
     return ContentService.createTextOutput("ok");
   }
   ```
3. Deploy → New deployment → Web app. Set *Execute as: Me* and *Who has access: Anyone*. Copy the URL.
4. In `config.js`: `provider: "appsScript", endpoint: "https://script.google.com/macros/s/…/exec"`.

**Google Forms.** Use `provider: "googleForm"`. The endpoint is the form URL ending in `/formResponse`, and you fill `googleFormFields` with the `entry.NNNN` IDs (find them via the form's "Get pre-filled link"). The browser can't confirm delivery with this method, so test once yourself.

**Supabase / Firebase.** Supported in `assets/js/rsvp.js`. Set `endpoint` (and `key` for Supabase's anon key). Lock the table down with insert-only row-level security.

Every provider is a small function in `assets/js/rsvp.js`. To add a new one, write a function that returns a Promise and reference it by name.

## 5. Deploying to GitHub Pages

1. Push this repository to GitHub. The site files must be at the root of the branch, as they are here.
2. On GitHub, open the repo and go to **Settings → Pages**.
3. Under **Build and deployment**, set *Source* to **Deploy from a branch**, the branch to **`main`** (or whichever branch holds the site), and the folder to **`/ (root)`**. Click **Save**.
4. Wait about 1 minute. The site will be live at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.
5. Update `og:image` in `index.html` to that absolute URL (see section 1), commit, and push. Pages redeploys automatically on every push.
   **On every update, change the `?v=` number** on the files in `index.html` (and the photo paths in `config.js`). Phone browsers keep old copies for a long time; a new number makes them fetch the new files.
6. Test the link by sending it to yourself on WhatsApp. If the preview is stale, add `?v=2` to the URL.

The empty `.nojekyll` file tells Pages to serve files as they are. All paths are relative, so the site works under any repo name. A custom domain can be added later under Settings → Pages → Custom domain.

**Preview locally:** run `python3 -m http.server` in this folder and open http://localhost:8000. Opening `index.html` straight from disk mostly works, but a local server is more faithful.

**Before sending the link,** make sure you have:
- filled in `config.js`
- connected RSVP
- set the absolute `og:image` URL
- tested the site on one Android phone and one iPhone

---

## Design notes

**What was taken from the reference video.** These are interaction ideas only. None of its art, text or branding is used.
- **Opening.** Large tracked capitals for the names float over a sky. On scroll, a monument rises from below, the names recede behind it, and the camera pushes *through* the architecture into the next scene.
- **Architecture as portal.** Every major scene change happens through an arch. The arch frames the invitation copy, and section edges open like doorways.
- **Pacing.** Each scene holds briefly while pinned, then hands over. Long stretches have no motion until the guest scrolls. Scroll position drives most of the motion.
- **Information sections.** Events sit in framed cards with a photograph, title, details and a location button. The countdown uses small tiles on a textured ivory paper. Then comes "Will you join us?" with an RSVP call to action.
- **Closing.** A wide landscape scene is the final, still image.

**Visual system ("walking down the aisle"):**
- **One continuous space.** Every section after the opening film takes place inside the same candle-lit church. Darkness, with light from the windows, candles and stained glass.
- **Story.** The guest walks toward the altar while the couple come together, and the final screen is the two of them hand in hand under the rose window.
- **Type.** Cinzel engraved capitals with Great Vibes script flourishes. Cormorant Garamond for reading, Jost for labels.
- **Colour.** Candle-lit dark, candle gold and cream throughout. No light sections, so the theme never breaks.

**Performance and accessibility.**
- All scroll motion is `transform` and `opacity`, driven by one `requestAnimationFrame` loop. That loop only measures sections currently near the viewport.
- The countdown only ticks while it is on screen.
- Fonts are self-hosted and Latin-subset (about 176 KB total, with the two critical files preloaded). Images lazy-load. There are no libraries.
- `prefers-reduced-motion` collapses the pinned scenes into calm static compositions and removes transitions.
- The lightbox supports Esc, arrow keys, swipe and a focus trap. Form errors are announced with `aria-live`.
