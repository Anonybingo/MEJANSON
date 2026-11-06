# Open Door Portfolio

A portfolio where every door opens onto something you build. Click a door and the camera pushes through the doorway into a room. The button at the bottom left walks you back out to all the doors.

It is plain HTML, CSS and JavaScript. No build step, nothing to install.

## Open it

Double-click `index.html`. It works offline, straight from the folder.

## Make it yours

Everything on the page is filled in from one file: `js/data.js`.

1. Change `name`, `email` and `github`.
2. Write your own `intro` and `roles`. The roles are the words that flip on the board.
3. Edit the four `doors`. Each door opens into a room. The `see` list holds the ids of the projects that hang in that room.
4. Edit `projects` and `story`.

### Add your photo

Save a photo of yourself as `assets/photo.jpg` and reload the page.

- A head-and-shoulders photo in portrait orientation works best (about 800 x 1100 px). Face the light, keep your head in the top half.
- A PNG with a see-through background also works. Save it as `assets/photo.png` and change `photo: "assets/photo.jpg"` to `photo: "assets/photo.png"` in `js/data.js`.
- No photo yet? The silhouette is a button. Pick a picture from your computer to preview it. It is only a preview until you save the file in `assets/`.

## Put it online

Drag the whole folder onto Netlify Drop (app.netlify.com/drop), or push it to GitHub and turn on GitHub Pages, or use Cloudflare Pages. All three are free for a site like this.

## What is where

| File | What it does |
| --- | --- |
| `index.html` | The page structure |
| `css/style.css` | All the looks, light and dark |
| `js/data.js` | Your words, photo and projects. Edit this one |
| `js/rooms.js` | The walk-through-the-door animation and the back button |
| `js/render.js` | Builds the doors, the project cards and the story |
| `js/lamp.js` | The pull cord and the light and dark switch |
| `js/flap.js` | The flipping roles board |
| `js/art.js` | The door icons and the artwork in the picture frames |
| `js/misc.js` | The doors opening one by one, the lights timeline, the email bell |
| `assets/fonts` | The three fonts, so the site works offline |

## Good to know

- Escape, the browser's Back button and the button at the bottom left all leave a room. A link ending in `#/door/mobile` opens that room directly.
- If a visitor's device is set to reduce motion, the doors fade instead of zooming.
- Your light or dark choice is remembered in the visitor's browser.

## Credits

Fonts are under the SIL Open Font License 1.1: Bricolage Grotesque, Big Shoulders Display and Newsreader. The licenses are in `assets/fonts/LICENSES.txt`.
