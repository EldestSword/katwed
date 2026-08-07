# Preparing Katwed! background artwork

Large original or generated artwork belongs in `artwork/backgrounds-source/`. These source images stay local and are ignored by Git. Finished WebP files are written to `public/backgrounds/`, where they are version-controlled and will eventually ship as ordinary static assets.

## Workflow

1. Generate or obtain an approved background image.
2. Give it a lowercase kebab-case filename, such as `arcade-grid.png`.
3. Put it in `artwork/backgrounds-source/`.
4. Run:

   ```powershell
   npm run prepare:backgrounds
   ```

5. Review the dimensions and before/after file sizes in the command output. Investigate any warning about a finished file over 500 KB.
6. Find the optimised file at `public/backgrounds/arcade-grid.webp`.
7. Commit the finished `.webp`, not the large source image.

PNG, JPEG and WebP sources are accepted. The filename stem becomes the permanent built-in background ID, so it must contain only lowercase letters, numbers and single hyphens between words. Different source formats may not reuse the same stem.

## Artwork guidance

- Compose for a 16:9 canvas.
- Do not include text or bake the Katwed! logo into the image.
- Do not include people or fake interface controls.
- Keep important detail away from the centre.
- Leave quiet space for question and answer UI.
- Favour visual interest around the edges and corners.
- Keep the background decorative so it never competes with quiz content.

The preparation command applies orientation metadata, centre-crops without distortion, limits output to 1920x1080 without upscaling, converts to sRGB and writes metadata-free WebP at quality 82. It replaces only an output with the same approved ID and never deletes other backgrounds.
