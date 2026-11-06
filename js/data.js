/* Edit this object to make the page yours. Everything on the page is filled in from here. */
const PROFILE = {
  name: "Your Name",
  email: "yourname@example.com",
  github: "https://github.com/Anonybingo",
  // Your portrait. Save your photo as assets/photo.jpg (or point this at another file in assets/).
  // A head-and-shoulders photo in portrait orientation works best. A PNG with a see-through background works too.
  photo: "assets/photo.jpg",
  photoAlt: "", // leave empty and the page says "Portrait of <your name>"
  intro: "I build websites and web apps with plain HTML, CSS and JavaScript, add Firebase when people need accounts, and I am taking my first one to phones now.",
  roles: ["Web developer", "App builder", "Shop builder", "Systems builder"],
  doors: [
    { plate: "WEBSITES", icon: "code", title: "Websites",
      text: "Fast pages in plain HTML, CSS and JavaScript. No build step, nothing to break, and easy to host anywhere.",
      points: ["Layouts that work on small phones first", "Glass, motion and scroll effects without heavy libraries", "Sites for shops, communities and teams"],
      tools: ["HTML", "CSS", "JavaScript", "GitHub"], see: ["matrix", "haki"] },
    { plate: "WEB APPS", icon: "key", title: "Web apps with accounts",
      text: "Sign-in, saved data and admin screens. Firebase does the server work, so there is no server for me to run.",
      points: ["Authentication and Firestore rules", "Separate views for customers, sellers and admins", "Free image hosting when storage costs money"],
      tools: ["Firebase Auth", "Firestore", "imgbb"], see: ["health", "haki"] },
    { plate: "SYSTEMS", icon: "rows", title: "Management systems",
      text: "Software that keeps people and things organised: medicines, books, orders and teams.",
      points: ["Records, search and roles", "Built for testing first, then for more users", "Hosted on my own PC while I test"],
      tools: ["JavaScript", "Firebase", "MongoDB"], see: ["health", "books"] },
    { plate: "MOBILE", icon: "phone", title: "Mobile apps",
      text: "Taking a working web app to phones. I am choosing between Capacitor and React Native for my first one.",
      points: ["Reuse the web code I already have", "Pick the tool by what the app needs", "Keep the same data behind web and phone"],
      tools: ["Capacitor", "React Native", "MongoDB"], see: ["mobile"] }
  ],
  projects: [
    { id: "health", cover: "pharmacy", state: "built", status: "Built", name: "HEALTH Center",
      tag: "An online pharmacy that runs without a server.",
      text: "Browse medicines, sign in and keep your account on plain static pages. Firebase handles sign-in and data, so there is no custom backend to maintain.",
      stack: ["HTML", "CSS", "JavaScript", "Firebase Auth", "Firestore"],
      links: [{ label: "Code on GitHub", href: "https://github.com/Anonybingo/HEALTH" }] },
    { id: "matrix", cover: "thinktank", state: "built", status: "Built", name: "Matrix Solid",
      tag: "The home of our E-Lab thinktank at ALU.",
      text: "Who we are, our team and the six challenges we worked through, each with its video. Plain HTML, CSS and JavaScript with embedded YouTube and no database.",
      stack: ["HTML", "CSS", "JavaScript", "YouTube embeds"],
      links: [{ label: "Code on GitHub", href: "https://github.com/Anonybingo/MatrixSolid" }] },
    { id: "haki", cover: "boutique", state: "built", status: "Built", name: "Haki Boutique",
      tag: "A clothing shop where you negotiate the price.",
      text: "Buyers browse the catalogue and open a conversation instead of checking out. It has accounts, a frosted-glass navbar and support for English, Kinyarwanda, French and Kiswahili.",
      stack: ["HTML", "CSS", "JavaScript", "Firebase"],
      links: [{ label: "Code on GitHub", href: "https://github.com/Anonybingo/MOUSSA_MARKET" }] },
    { id: "books", cover: "library", state: "testing", status: "In testing", name: "Book Management System",
      tag: "Books for students across a country.",
      text: "A system for managing the books students use. It is set up for testing and planned to run on my own PC as the server.",
      stack: ["JavaScript", "Self-hosted"], links: [] },
    { id: "mobile", cover: "mobile", state: "progress", status: "In progress", name: "Web app to phone app",
      tag: "Taking a site built with HTML, CSS, JavaScript and MongoDB to mobile.",
      text: "Choosing between Capacitor and React Native to turn an existing website into an app people can install.",
      stack: ["HTML", "CSS", "JavaScript", "MongoDB", "Capacitor or React Native"], links: [] }
  ],
  story: [
    { title: "Plain HTML, CSS and JavaScript", text: "My sites are static and simple: no build step, quick to load and easy to host anywhere." },
    { title: "Accounts without a server", text: "HEALTH Center uses Firebase sign-in and Firestore, so people keep their data without me running a backend." },
    { title: "Building with a team", text: "Matrix Solid gave our E-Lab thinktank at ALU a home for its six challenges, its team and its videos." },
    { title: "A shop that talks back", text: "Haki Boutique swaps checkout for conversation. Buyers negotiate the price, in four languages." },
    { title: "Now: phones", text: "I am taking a web app to mobile and setting up a book system for students on my own PC." }
  ]
};
