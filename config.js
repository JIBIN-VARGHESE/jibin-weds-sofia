/* =============================================================================
   SOFIA & JIBIN — WEDDING CONFIGURATION
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
    // Shown in this order everywhere: the bride first, then the groom.
    bride: "Sofia",                 // short names: opening screen & closing
    groom: "Jibin",
    brideFull: "Sofia John",        // full names: invitation card
    groomFull: "Jibin Varghese",
    // Parents, under each name on the invitation card as "D/o …" and "S/o …" ("" to leave out).
    brideParents: "Mr. Saji & Mrs. Mini",
    groomParents: "Mr. Varghese K. V. & Mrs. Aswathy Varghese",
    // Small monogram letters shown in the corner and on the opening curtain.
    monogram: ["S", "J"],
  },

  /* ---------------------------------------------------------------- INVITE */
  invitation: {
    eyebrow: "With God's blessing",
    welcome: "In the presence of God and our families…",   // first words as the church wakes
    // Each array item is rendered as its own line (the names follow).
    lines: [
      "Together with our families,",
      "we joyfully invite you",
      "to the wedding of",
    ],

  },

  /* ----------------------------------------------------------- BIBLE VERSE */
  // Shown under the rose window. (The closing uses Mark 10:9.)
  // Other options: "Love never fails." (1 Corinthians 13:8)
  //                "Above all, love each other deeply." (1 Peter 4:8)
  verse: {
    text: "Love is patient, love is kind. Love never fails.",
    reference: "1 Corinthians 13:4, 8",
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
      "An evening of prayer and blessing as we exchange rings, " +
      "with the family and friends who shaped us.",
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
  // The church behind the whole page is built and painted in code by
  // assets/js/nave.js (no pictures to download). Devices without a graphics
  // chip see a still picture of it: assets/images/nave/still-*.webp.
  art: {
    heroPortrait:  "assets/images/hero/hero-portrait.webp?v=20261024l",   // opening picture on phones
    heroLandscape: "assets/images/hero/hero-landscape.webp?v=20261024l",  // opening picture on wide screens
    closingPhoto: "assets/images/closing/couple-arches.webp?v=20261024l", // the couple at the end; fades in over the church
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
    enabled: true,                 // shows the music button (assets/music/wedding.mp3 must exist)
    src: "assets/music/wedding.mp3",
    volume: 0.5,
  },

  /* ---------------------------------------------------------------- CLOSING */
  closing: {
    line: "Your presence and prayers would make our day complete.",
    signoff: "\u201CWhat God has joined together, let no one separate.\u201D",
    signoffRef: "Mark 10:9",
  },
};
