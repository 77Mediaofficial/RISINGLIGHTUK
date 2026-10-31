# Rising Light UK — website

Written 28 October 2026 from Joe Chapman's answers (one interview round, AskUserQuestion, four questions). It exists so
the design gate (`/impeccable`) can run; it states nothing Joe did not say.

## What it is

The public website of Rising Light UK, a volunteer-run community initiative founded in London (not a registered
charity). Nine static pages built from `_src/` by `py _src/build.py`, served by GitHub Pages. It carries the mission
("Compassion has no borders"), where the work happens (London, plus past work in Guatemala and Arizona), the events, Quiet Battles (mental
health and suicide prevention), how to get involved, and the policy pages (privacy, safeguarding, accessibility).

## Who it is for

**Followers and the public first**: people who found Rising Light on Instagram (@risinglightuk) and come to the site for
the full story. Volunteers, partner organisations and people who need help also arrive here, but the primary reader is
someone deciding whether this group is real and worth following.

## What they should feel in the first five seconds

**Trusted and steady.** Calm, clear, grown-up: the site of a group that does what it says. Not hype, not pity.

## The one thing a visitor should do

**Get in touch to volunteer or partner.** The Get Involved forms are the main call to action; Instagram is the
secondary route.

## What it must never resemble

Joe stated no preference. The standing house rules still apply: no indigo/violet glow, no decorative gradients, no heavy
shadows, no stock imagery; pure monochrome (ink `#15140F` light / `#FAF9F6` dark), Cinzel (owner-locked) + Inter +
JetBrains Mono, Web Content Accessibility Guidelines (WCAG) AA contrast or better.

## Register

`editorial` with restraint: a public site, so expressive-but-smooth motion is allowed (scroll reveals, a page fade,
count-ups), all of it off under `prefers-reduced-motion`. Borders over shadows. Every claim on the site is sourced or
Joe's own.

## Constraints

Static HTML, vanilla CSS and JS (no framework at runtime). The design pack `..\design-pack\design-pack.md` is the strict
token baseline. Never call Rising Light a charity or registered. Never draw or show the people an event is for.
