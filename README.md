# Qurn Cola

A fictional cola brand and its scroll-driven commercial site, designed, built and tested end to end with **qurn** skills. Made by Panther.

## Pages
| Page | What happens as you scroll |
|---|---|
| `index.html` | A live 3D can turns, spins through 4 flavours while the screen floods with each colour, sweats in the cold, then prints any name you type ("Share a Qurn with ___"). |
| `flavours.html` | The can swaps sides and turns through each flavour. A swatch row at the end re-skins it. |
| `moments.html` | A bottle draws itself and fills with cola across 7 moments, then pops its cap for a "Cheers." finale. |
| `again.html` | The can rides a recycling loop: Drink it, Drop it in, It comes back, Again. |

## Run it
Static files, no build step. Open `index.html` or serve the folder:
```
python -m http.server 8080 --directory .
```

## Tech
Three.js r147 (PBR can: spline-turned body, real 330 ml proportions, rolled double seam, die-necked shoulder, stamped lid and base dome, procedural label, normal-mapped condensation, CC0 Poly Haven studio HDRI), GSAP ScrollTrigger, Lenis, a verlet-rope lanyard badge. Reduced-motion and no-WebGL fallbacks included.

Qurn Cola is fictional. Any resemblance to real drinks brands is a nod, not an affiliation.
