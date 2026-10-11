/* =============================================================================
   JIBIN & SOFI — WEDDING CONFIGURATION
   -----------------------------------------------------------------------------
   This is the ONLY file you need to edit to change wedding information.

   • Leave a value as "" (empty) when you don't know it yet. The site will
     show a graceful "to be announced" line instead — nothing is invented.
   • Dates use ISO format: "YYYY-MM-DD".  Times use 24h "HH:MM" (Kerala time).
   • Image paths are relative to the site root. To replace an image, either
     overwrite the file with the same name, or change the path here.
   • The only things NOT controlled from here are the link-preview tags
     (WhatsApp / iMessage preview) at the top of index.html — see README.
   ========================================================================== */

window.WEDDING = {

  /* ---------------------------------------------------------------- COUPLE */
  couple: {
    groom: "Jibin",                 // short names: opening screen & closing
    bride: "Sofi",
    groomFull: "Jibin Varghese",    // full names: invitation card
    brideFull: "Sofia John",
    // Small monogram letters shown in the corner and on the closing screen.
    monogram: ["J", "S"],
  },

  /* ---------------------------------------------------------------- INVITE */
  invitation: {
    eyebrow: "You are invited",
    welcome: "In the presence of God and our families…",   // first words as the church wakes
    // Each array item is rendered as its own line.
    lines: [
      "By the grace of God,",
      "together with our families,",
      "we joyfully invite you",
      "to celebrate our marriage.",
    ],

  },

  /* ----------------------------------------------------------- BIBLE VERSE */
  // Shown under the rose window. (The closing uses Mark 10:9.)
  // Other options: "Love is patient, love is kind." (1 Corinthians 13:4)
  //                "Two are better than one." (Ecclesiastes 4:9)
  verse: {
    text: "A cord of three strands is not quickly broken.",
    reference: "Ecclesiastes 4:12",
  },

  /* ------------------------------------------------------------- ENGAGEMENT */
  engagement: {
    date: "2027-04-17",            // Saturday
    time: "",                      // e.g. "16:00"  (leave "" until confirmed)
    venueName: "",                 // e.g. church or hall name
    town: "Pandalam",
    region: "Kerala",
    address: "",                   // full street address
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Pandalam%2C+Kerala", // ← PLACEHOLDER: paste the venue's Google Maps link
    description:
      "A gathering of prayer and blessing, and the exchanging of rings, " +
      "shared with the families and friends who have shaped us.",
  },

  /* ---------------------------------------------------------------- WEDDING */
  wedding: {
    date: "2027-04-25",            // Sunday
    town: "Kozhikode",
    region: "Kerala",

    // Holy Matrimony
    ceremonyTime: "14:30",         // also sets the countdown target
    churchName: "St. George Orthodox Cathedral",
    churchAddress: "",             // street address (optional); the town is shown when empty
    churchMapsUrl: "https://share.google/KuEEy4EvyO7lj9OsD",

    // Reception
    receptionTime: "18:30",
    receptionVenue: "Opulent Convention Centre",
    receptionAddress: "",
    receptionMapsUrl: "https://www.google.com/search?kgmid=%2Fg%2F11z8g451zb&q=Opulent+Convention+Centre",

  },

  /* ---------------------------------------------------- WEDDING DAY TIMELINE */
  // Times are optional — empty entries show "Time to follow".
  // (not shown on the page at present: the Wedding card lists both events)
  timeline: [
    { time: "14:30", title: "Holy Matrimony", note: "St. George Orthodox Cathedral" },
    { time: "18:30", title: "Reception",      note: "Opulent Convention Centre" },
  ],

  /* ------------------------------------------------------------------- RSVP */
  rsvp: {
    deadline: "",                  // e.g. "2027-04-01" — shown as "Kindly reply by …"
    maxGuests: 6,                  // upper limit in the "number of guests" field

    // Where responses are sent. See assets/js/rsvp.js for details.
    //   "formsubmit"  – endpoint: an email address; each reply is emailed there
    //   "demo"        – no backend; the response is only kept in this browser
    //   "formspree"   – endpoint: "https://formspree.io/f/XXXXXXX"
    //   "googleForm"  – endpoint: the form's ".../formResponse" URL + fields map
    //   "appsScript"  – endpoint: Google Apps Script web-app URL (writes to Sheets)
    //   "supabase"    – endpoint: "https://PROJECT.supabase.co/rest/v1/rsvps", key: anon key
    //   "firebase"    – endpoint: "https://PROJECT.firebaseio.com/rsvps.json"
    provider: "formsubmit",
    endpoint: "jibinv471@gmail.com",
    // After the site is live, send one test reply: FormSubmit emails an
    // "Activate form" link to this address. Click it once; replies then arrive.
    key: "",
    // Only for provider "googleForm": map our fields to your form's entry IDs.
    googleFormFields: { name: "entry.000000", guests: "entry.000001", attending: "entry.000002", message: "entry.000003" },
  },

  /* --------------------------------------------------------------- ARTWORK */
  // The church interior behind the whole page is drawn in 3D by
  // assets/js/nave.js from these textures (all in assets/images/nave/).
  // Replace a file to change a surface; keep the pixel size (powers of two).
  art: {
    heroPortrait:  "assets/images/hero/hero-portrait.webp?v=20261013",   // opening picture on phones
    heroLandscape: "assets/images/hero/hero-landscape.webp?v=20261013",  // opening picture on wide screens
    floor:  "assets/images/nave/floor.webp",    // polished stone tiles (repeats)
    carpet: "assets/images/nave/carpet.webp",   // aisle runner (repeats)
    wall:   "assets/images/nave/wall.webp",     // nave wall: arcade, triforium, clerestory (one bay, repeats)
    aisle:  "assets/images/nave/aisle.webp",    // side-aisle wall with a stained-glass window (one bay)
    pier:   "assets/images/nave/pier.webp",     // clustered stone column
    arch:   "assets/images/nave/arch.webp",     // pointed arch across the nave
    pew:    "assets/images/nave/pew.webp",      // pew back
    pewend: "assets/images/nave/pewend.webp",   // carved pew end
    altar:  "assets/images/nave/altar.webp",    // far wall: rose window, altar, candles
    closingPhoto: "assets/images/closing/couple-arches.webp?v=20261013", // the couple at the end; fades in over the church
    // The opening picture is the top of the couple's collage, fading into the
    // dark where the names sit (the bottom panels are left out). Both photos
    // must be ones you own or have permission to use.
  },

  /* ------------------------------------------------------------- ANIMATIONS */
  // Lottie animations (.json). Each slot is optional — leave src "" to hide it.
  // To use one from LottieFiles: open the animation → Download → "Lottie JSON",
  // save it in assets/lottie/ and put its path here.
  //   loop: true  = plays continuously while on screen
  //   loop: false = plays once when it first comes into view, then holds
  lottie: {
    hero:        { src: "",                               loop: false }, // (the rings above the names are now drawn in index.html)
    countdown:   { src: "",                               loop: true  }, // small, above "Counting the days"
    rsvp:        { src: "assets/lottie/heart-burst.json", loop: false }, // plays when a reply is sent
  },

  /* ------------------------------------------------------------------ MUSIC */
  music: {
    enabled: false,                // true once assets/music/wedding.mp3 exists (shows the music button)
    src: "assets/music/wedding.mp3",
    volume: 0.5,
  },

  /* ---------------------------------------------------------------- CLOSING */
  closing: {
    line: "Your presence would make our celebration complete.",
    signoff: "\u201CWhat God has joined together, let no one separate.\u201D",
    signoffRef: "Mark 10:9",
  },
};
