# Liquid glass compact preview

A static, separate concept for a more minimal compact mode. It is not wired into the app and it does not replace the current compact window.

## Open it

- Double-click `preview/liquid-glass.html`, or
- Run `npm run dev` and open `http://localhost:1420/preview/liquid-glass.html`.

## What the concept changes

- The compact card becomes a single frosted glass surface.
- The mascot is a small, static face in the top left. There is no grab, drag or boop.
- The top right has only three actions: pin, practice and full mode.
- The conversation is two glass bubbles, with the composer as a glass pill at the bottom.
- The liquid glass look comes from a translucent card, backdrop blur, a bright top edge, inner highlights and soft colored blobs behind the card.

If the concept is approved, the next step is porting the layout into `App.tsx` and `Composer.tsx`, using the real compact state and disabling mascot interaction in compact mode.
