# Lily Abroad — Travel web app

A small single-page web app to showcase travel experiences with a background slideshow and a map showing flight paths.

Quick start

- Open `index.html` in your browser (double-click or `open index.html` on macOS).
- The **Home** tab shows the slideshow and hero layout.
- The **Map** tab shows the flight path (Chicago → Barcelona → Athens → Chicago).
- The **Edit** tab lets you add or remove flights; flights are saved to `localStorage` in your browser.

Notes

- This is a client-side demo using Leaflet (OpenStreetMap tiles). No server required.
- To add more background images, edit the `index.html` slide divs, or change the slideshow in `app.js`.
 - To add images for the home slideshow automatically:
	 1. Put your image files (jpg/png/webp) in `assets/images/`.
	 2. Run the manifest generator to create `assets/images/manifest.json` which the app reads:

```bash
node scripts/generate-manifest.js
```

The app will load images listed in `assets/images/manifest.json`. If the manifest is missing the app falls back to default photos.

 - The Edit page is password-protected. A preset password (`Travelmore10$`) is hashed and stored locally; you'll be prompted to enter the password to access editing. The hash is stored in `localStorage` and the session is kept in `sessionStorage` during your browser session.
