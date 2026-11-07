# JANSON's portfolio

A portfolio where every door opens onto something you build. Click a door and the camera pushes through the doorway into a room. The button at the bottom left walks you back out to all the doors.

Your portrait stands in a dark doorway and is made of golden dust. The dust flies in and gathers into your face, the mouse pushes it about, and it blows apart when you scroll down and gathers again when you scroll back up.

It is plain HTML, CSS and JavaScript. No build step, nothing to install.

## Open it

Double-click `index.html`, or open the folder in VS Code and use Live Server. It works offline.

## Make it yours

Everything on the page is filled in from one file: `js/data.js`.

1. Change `email` (it still says `yourname@example.com`) and check `github`. The name is already `JANSON`.
2. Write your own `intro` and `roles`. The roles are the words that flip on the board.
3. Edit the four `doors`. Each door opens into a room. The `see` list holds the ids of the projects that hang in that room.
4. Edit `projects` and `story`.

## Your portrait

The photo is `assets/photo.jpg`. The page cuts you out from the backdrop, lifts the tones so a dark face still shows its eyes, nose and mouth, and turns it into thousands of dots.

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
| `css/style.css` | All the looks, light and dark |
| `js/data.js` | Your words, photo and projects. Edit this one |
| `js/dust.js` | The dust portrait: cuts out your photo, makes the dots, flies them in, scatters them on scroll |
| `js/photo.js` | A built-in copy of your photo, for when the page is opened by double-click |
| `js/rooms.js` | The walk-through-the-door animation and the back button |
| `js/render.js` | Builds the doors, the project cards and the story |
| `js/lamp.js` | The pull cord and the light and dark switch |
| `js/flap.js` | The flipping roles board |
| `js/art.js` | The door icons and the artwork in the picture frames |
| `js/misc.js` | The doors opening one by one, the lights timeline, the email bell |
| `assets/photo.jpg` | Your photo |
| `assets/fonts` | The three fonts, so the site works offline |

## Good to know

- Escape, the browser's Back button and the button at the bottom left all leave a room. A link ending in `#/door/mobile` opens that room directly.
- The dust only runs while the portrait is on screen, and it thins itself out on slow devices.
- Your light or dark choice is remembered in the visitor's browser.

## Credits

The dust idea comes from the hero of your Haki Boutique site (MOUSSA_MARKET). Fonts are under the SIL Open Font License 1.1: Bricolage Grotesque, Big Shoulders Display and Newsreader. The licenses are in `assets/fonts/LICENSES.txt`.
