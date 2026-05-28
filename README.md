# U.S. Trade Tracker Static

Static HTML/CSS/JavaScript migration of the U.S. Trade Tracker WordPress site.

## Structure

- `index.html` - homepage
- `pages/articles/` - migrated article and tracker pages
- `pages/categories/` - category indexes
- `pages/countries/` - country tracker aliases
- `pages/trackers/` - tracker navigation pages
- `pages/archive/` - publication archive
- `assets/css/` - shared stylesheet
- `assets/js/` - small progressive-enhancement script
- `assets/images/` - downloaded WordPress media
- `data/site.json` - generated metadata for future automation
- `scripts/build-site.mjs` - WordPress API migration and static page generator

## Commands

```bash
npm run build
npm run serve
```

The generator reads from the WordPress.com public API, downloads media, remaps internal links, and rebuilds the static pages.

## Attribution

Content is migrated from `https://ustradetracker.wordpress.com/` and attributed to the U.S. Trade Tracker project by the Takshashila Institution under its published Creative Commons Attribution 4.0 International license.
