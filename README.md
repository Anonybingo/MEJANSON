# JANSON's portfolio

A portfolio where every door opens onto something you build. Point at a door and it swings open, move away and it closes. Click a door and the camera pushes through the doorway into a room. The button at the bottom left walks you back out to all the doors, and the door you came through closes behind you.

Your portrait has no frame: it is made of dust that sits straight on the page. The dust flies in and gathers into your face, the mouse pushes it about, and it blows apart when you scroll down and gathers again when you scroll back up. On a dark page the dust glows gold. On a light page it turns into dark ink, like a pen stipple. Pull the lamp and the dust gathers again in the other look.

Behind everything is a long hall of lit doorways, drawn live in 3D. As you scroll you walk down the hall, past the colours of your four doors, to a bright door at the end that lights up the contact card. The mouse leans the view a little, and the footer lift flies you back up the hall. Every panel on the page (the top bar, the panel behind an open door, the project cards, the story and the contact card) is frosted glass: it blurs and tints the hall behind it, has a lit edge, and catches a soft light that follows the pointer. Pull the lamp and the whole hall turns between night and day.

It is plain HTML, CSS and JavaScript. No build step, nothing to install.

## Open it

Double-click `index.html`, or open the folder in VS Code and use Live Server. It works offline.

## Make it yours

Everything on the page is filled in from one file: `js/data.js`.

1. Check `email`, `whatsapp` and `github` at the top. The name is already `JANSON`.
   - `whatsapp` is your number with the country code. The page turns it into a `wa.me` link, so a tap opens a WhatsApp chat with you. `whatsappText` is the message that is already typed in when the chat opens. Delete the `whatsapp` line and the WhatsApp button disappears.
2. Write your own `intro` and `roles`. The roles are the words that flip on the board.
3. Edit the four `doors`. Each door opens into a room. The `see` list holds the ids of the projects that hang in that room.
4. Edit `projects` and `story`.
5. Do not want the moving 3D background? Set `background3d: false` and the page uses a calm, still glow behind the same glass panels.

## Your portrait

The photo is `assets/photo.jpg`. The page cuts you out from the backdrop, lifts the tones so a dark face still shows its eyes, nose and mouth, and turns it into thousands of dots. The plain photo is never shown on the page; it stays hidden underneath for screen readers, and appears only if the dust cannot run.

To use another photo, replace `assets/photo.jpg` and reload.

- A head-and-shoulders photo against a plain light backdrop works best. Face the light and keep your head in the top half.
- A PNG with a see-through background works too. Save it as `assets/photo.png` and change `photo: "assets/photo.jpg"` to `photo: "assets/photo.png"` in `js/data.js`.
- Use Live Server, GitHub Pages or any web host to see a new photo. A browser will not let a page read a picture from a file you opened by double-clicking, so in that case the page uses the built-in copy of your photo in `js/photo.js`. You never need to edit that file.

If a visitor's device is set to reduce motion, the portrait is drawn once and stays still.

## Put it online

Push the folder to GitHub and turn on GitHub Pages (Settings, Pages, branch `main`, folder `/ (root)`). Netlify Drop and Cloudflare Pages work too, and all of them are free for a site like this.

## What is where

| File | What it does |
| --- | --- |
| `index.html` | The page structure |
| `css/style.css` | All the looks, light and dark, including the glass |
| `js/data.js` | Your words, photo and projects. Edit this one |
| `js/dust.js` | The dust portrait: cuts out your photo, makes the dots (a glowing set and an ink set), flies them in, scatters them on scroll |
| `js/photo.js` | A built-in copy of your photo, for when the page is opened by double-click |
| `js/rooms.js` | The walk-through-the-door animation and the back button |
| `js/render.js` | Builds the doors, the project cards and the story |
| `js/lamp.js` | The pull cord and the light and dark switch |
| `js/flap.js` | The flipping roles board |
| `js/art.js` | The door icons and the artwork in the picture frames |
| `js/misc.js` | The lights timeline and the email bell |
| `js/reveal.js` | The "Pick a door" reveal when you scroll to it, then the short tour where each door opens once |
| `js/lift.js` | The "Back to the top" lift: floors count down as the page rides up |
| `js/three.min.js` | A trimmed copy of Three.js, the library that draws the 3D hall. You never need to edit it |
| `js/scene.js` | The hall itself: doorways, floor, walls, floating sparkles and glow, and how the camera follows your scroll and your mouse |
| `js/glass.js` | The soft light that follows the pointer across the glass panels |
| `js/THREE-LICENSE.txt` | The Three.js licence (MIT) |
| `assets/photo.jpg` | Your photo |
| `assets/favicon-32.png`, `assets/apple-touch-icon.png` | The tab icon, a gold plate with the letter J. The main copy sits in the first `<link rel="icon">` line of `index.html` |
| `assets/fonts` | The three fonts, so the site works offline |

## Good to know

- Escape, the browser's Back button and the button at the bottom left all leave a room. A link ending in `#/door/mobile` opens that room directly.
- A door opens while you point at it, or while it has keyboard focus, and closes when you stop. On a phone nothing is left hanging open after a tap.
- "Back to the top" in the footer is a lift. Press it and the page rides up with the floor numbers counting down, and the lamp swings when you arrive. Scroll, touch or press a scrolling key to take over at any time. With "reduce motion" turned on it simply jumps. The logo at the top left also goes to the top.
- When the "Pick a door" section scrolls into view, the heading rises word by word and the doors come up one after another, once. With "reduce motion" turned on nothing animates.
- The dust only runs while the portrait is on screen, and it thins itself out on slow devices.
- The hall looks after itself. On a slow phone it lowers its own quality (fewer sparkles, less glow, lighter glass). It stops drawing while a room is open or the tab is hidden. With "reduce motion" turned on it is drawn once and stays still. If a browser has no WebGL, you get a soft gradient and the same glass panels. To try a level yourself, type `localStorage.hallQ = "0"` (lightest), `"1"` or `"2"` (full) in the browser console and reload.
- With "reduce transparency" turned on in the system settings, the glass panels become solid.
- Your light or dark choice is remembered in the visitor's browser.

## Credits

The 3D hall is drawn with [Three.js](https://threejs.org) (MIT licence, in `js/THREE-LICENSE.txt`). The hall, its colours and the glass are made for this portfolio. The dust idea comes from the hero of your Haki Boutique site (MOUSSA_MARKET). Fonts are under the SIL Open Font License 1.1: Bricolage Grotesque, Big Shoulders Display and Newsreader. The licenses are in `assets/fonts/LICENSES.txt`.
