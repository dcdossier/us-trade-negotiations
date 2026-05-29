import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const API_BASE = "https://public-api.wordpress.com/wp/v2/sites/ustradetracker.wordpress.com";
const SOURCE_SITE = "https://ustradetracker.wordpress.com";

const site = {
  title: "US Trade Negotiation Observatory",
  tagline: "Tracking US Trade negotiations under the second Trump administration.",
  projectBy: "A project by the Takshashila Institution",
  source: SOURCE_SITE,
  license: "Creative Commons Attribution 4.0 International",
};

const categoryRoutes = {
  "understanding-data-and-law": "/pages/categories/understanding-data-and-law/",
  "understanding-politics": "/pages/categories/understanding-politics/",
};

const hubRoutes = {
  about: "/pages/understanding-data-and-law/",
  "understanding-the-politics": "/pages/understanding-the-politics/",
};

const homeIntro = [
  "The United States has historically occupied a central position in the global trading system, supported by robust international agreements, a large domestic market, and the international predominance of the US dollar. The policy disruptions introduced by the Trump administration, particularly with regard to bilateral trade arrangements, thus, generated significant ripple effects across global markets.",
  "These developments have heightened the economic and geopolitical weight attached to individual trade agreements and tariff measures. This platform systematically tracks US trade data and negotiations following these disruptions in real time, offering comprehensive updates, rigorous analysis, and data-driven insights.",
];

const tradeWars = {
  title: "Trump’s trade wars",
  intro: "Donald Trump uses trade- tariff policies as both an economic weapon and a political statement. This approach was partially implemented in his first term and gained a renewed prominence in his second term.",
  sections: [
    {
      heading: "What",
      body: "Trump announced sweeping tariffs on imports across multiple sectors, with a renewed emphasis on punishing countries seen as unfair competitors. His initial plan included a universal baseline tariff on all foreign goods followed by series of reciprocal tariffs and industry specific regulations. Today, these rates are determined broadly by negotiated outcomes and other geo-economic factors for specific items or sectors.",
    },
    {
      heading: "Why",
      body: "The ideological backbone of Trump’s tariff policy is economic nationalism. It frames tariffs as a tool to bring back American manufacturing jobs, reduce dependency on foreign supply chains, rebalance trade deficits, and use economic pressure to achieve broader foreign policy goals.",
    },
    {
      heading: "How",
      body: "Tariffs are positioned not just as economic tools but as negotiating leverage. The Trump administration has used unilateral tariff actions, tied tariff reductions to concessions in trade talks, used tariffs to accelerate reshoring, and treated tariff policy as leverage for strategic goals.",
    },
  ],
  issues: [
    "Market Access",
    "Trade Deficit",
    "Fentanyl",
    "Steel & Aluminium",
    "Semiconductors & Tech Components",
    "Energy",
    "Agriculture",
    "Automotive",
  ],
  note: "The core motivation behind these tariffs is Trump’s agenda to bring back manufacturing to the US. Owing to this agenda, Trump tariffs have largely focused on goods rather than services, although services-related issues such as digital services and intellectual property also appear during negotiations.",
  references: ["CNBC, 2025", "BBC, 2025", "Reed Smith, 2025", "USITC, 2025", "Atlantic Council, 2025", "Hudson Institute, 2025"],
};

async function main() {
  await ensureDirs();
  const [postsRaw, pagesRaw, categoriesRaw] = await Promise.all([
    fetchJson(`${API_BASE}/posts?per_page=100&_embed`),
    fetchJson(`${API_BASE}/pages?per_page=100&_embed`),
    fetchJson(`${API_BASE}/categories?per_page=100`),
  ]);

  const categories = categoriesRaw
    .filter((category) => category.count > 0)
    .map((category) => ({
      id: category.id,
      slug: category.slug,
      name: decodeHtml(stripTags(category.name)),
      count: category.count,
      route: categoryRoutes[category.slug] ?? `/pages/categories/${category.slug}/`,
    }));

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const posts = postsRaw.map((post) => normalizePost(post, categoryById));
  const pages = pagesRaw.map(normalizePage);
  const imageMap = await downloadImages([...posts, ...pages]);

  for (const post of posts) {
    post.content = localizeContent(post.content, posts, pages, categories, imageMap);
    post.excerpt = localizeContent(post.excerpt, posts, pages, categories, imageMap);
    post.featuredImage = localImage(post.featuredImage, imageMap);
  }

  for (const page of pages) {
    page.content = localizeContent(page.content, posts, pages, categories, imageMap);
    page.featuredImage = localImage(page.featuredImage, imageMap);
  }

  const latestPosts = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
  const dataPosts = latestPosts.filter((post) => post.categorySlug === "understanding-data-and-law");
  const politicsPosts = latestPosts.filter((post) => post.categorySlug === "understanding-politics");
  const countryPosts = politicsPosts.filter((post) => post.countrySlug);

  await writeJson("data/site.json", {
    site,
    generatedAt: new Date().toISOString(),
    sourceApi: API_BASE,
    categories,
    posts: latestPosts.map(withoutContent),
    pages: pages.map(withoutContent),
  });

  await writePage("index.html", renderHome({ latestPosts, dataPosts, politicsPosts }));

  for (const page of pages) {
    const route = page.slug === "about" ? "pages/understanding-data-and-law/index.html" : `pages/${page.slug}/index.html`;
    await writePage(route, renderHubPage(page, {
      cards: page.slug === "about" ? dataPosts : politicsPosts,
      kind: page.slug === "about" ? "data" : "politics",
    }));
  }

  for (const post of latestPosts) {
    await writePage(`pages/articles/${post.slug}/index.html`, renderPost(post, latestPosts));
  }

  for (const countryPost of countryPosts) {
    await writePage(`pages/countries/${countryPost.countrySlug}/index.html`, renderCountryPage(countryPost, countryPosts));
  }

  for (const category of categories) {
    const categoryPosts = latestPosts.filter((post) => post.categorySlug === category.slug);
    await writePage(`pages/categories/${category.slug}/index.html`, renderListing({
      title: category.name,
      eyebrow: "Category",
      description: category.slug === "understanding-politics"
        ? "Country-specific negotiation timelines and political analysis."
        : "Explainers on trade data, tariff law, instruments, and regulatory barriers.",
      posts: categoryPosts,
      route: category.route,
    }));
  }

  await writePage("pages/archive/index.html", renderArchive(latestPosts));
  await writePage("pages/trackers/index.html", renderTrackers({ dataPosts, politicsPosts }));
  await writePage("pages/trackers/data-law/index.html", renderListing({
    title: "Understanding the Data and Law",
    eyebrow: "Tracker",
    description: "Static index of data, tariff law, and regulatory explainers.",
    posts: dataPosts,
  }));
  await writePage("pages/trackers/trade-negotiations/index.html", renderListing({
    title: "Trade Negotiation Trackers",
    eyebrow: "Tracker",
    description: "Country negotiation pages tracking key tariff events and political priorities.",
    posts: politicsPosts,
  }));

  await writePage("404.html", renderLayout({
    title: "Page Not Found",
    description: site.tagline,
    current: "archive",
    body: `<section class="page-block narrow"><p class="eyebrow">404</p><h1>Page not found</h1><p>The requested page is not available in this static archive.</p><p><a class="text-link" href="/">Return to the tracker homepage</a></p></section>`,
  }));
}

function normalizePost(post, categoryById) {
  const category = categoryById.get(post.categories?.[0]);
  const title = decodeHtml(stripTags(post.title?.rendered ?? ""));
  const featured = post._embedded?.["wp:featuredmedia"]?.[0];
  const countrySlug = getCountrySlug(title);
  return {
    id: post.id,
    type: "post",
    slug: post.slug,
    title,
    date: post.date,
    modified: post.modified,
    categoryId: category?.id,
    categoryName: category?.name ?? "",
    categorySlug: category?.slug ?? "",
    route: `/pages/articles/${post.slug}/`,
    legacyUrl: post.link,
    countrySlug,
    countryName: countrySlug ? countryLabel(countrySlug) : "",
    excerpt: post.excerpt?.rendered ?? "",
    content: post.content?.rendered ?? "",
    featuredImage: featured?.source_url ?? "",
    imageAlt: decodeHtml(featured?.alt_text || title),
  };
}

function normalizePage(page) {
  const title = decodeHtml(stripTags(page.title?.rendered ?? ""));
  const featured = page._embedded?.["wp:featuredmedia"]?.[0];
  return {
    id: page.id,
    type: "page",
    slug: page.slug,
    title,
    date: page.date,
    modified: page.modified,
    route: hubRoutes[page.slug] ?? `/pages/${page.slug}/`,
    legacyUrl: page.link,
    excerpt: page.excerpt?.rendered ?? "",
    content: page.content?.rendered ?? "",
    featuredImage: featured?.source_url ?? "",
    imageAlt: decodeHtml(featured?.alt_text || title),
  };
}

async function downloadImages(items) {
  const imageUrls = new Set([
    `${SOURCE_SITE}/wp-content/uploads/2025/08/tlogo-1.png`,
    `${SOURCE_SITE}/wp-content/uploads/2025/08/image-17.png`,
  ]);

  for (const item of items) {
    if (item.featuredImage) imageUrls.add(item.featuredImage);
    for (const url of collectUploadUrls(item.content)) imageUrls.add(url);
  }

  const imageMap = new Map();
  for (const url of imageUrls) {
    const clean = stripQuery(url);
    const fileName = uniqueImageName(clean, imageMap);
    const target = path.join(ROOT, "assets/images", fileName);
    imageMap.set(clean, `/assets/images/${fileName}`);
    if (existsSync(target)) continue;
    const response = await fetch(clean);
    if (!response.ok) {
      console.warn(`Skipping image ${clean}: ${response.status}`);
      continue;
    }
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
  }
  return imageMap;
}

function collectUploadUrls(html = "") {
  const urls = new Set();
  const matches = html.matchAll(/https:\/\/ustradetracker\.wordpress\.com\/wp-content\/uploads\/[^"' <>)]+/g);
  for (const match of matches) urls.add(stripQuery(match[0].replace(/&amp;/g, "&")));
  return [...urls];
}

function localizeContent(html, posts, pages, categories, imageMap) {
  let output = html ?? "";
  for (const post of posts) {
    output = output.replaceAll(post.legacyUrl, post.route);
  }
  for (const page of pages) {
    output = output.replaceAll(page.legacyUrl, page.route);
  }
  for (const category of categories) {
    output = output.replaceAll(`${SOURCE_SITE}/category/${category.slug}/`, category.route);
  }
  for (const [remote, local] of imageMap.entries()) {
    output = output.replaceAll(remote, local);
  }
  output = output.replace(/(\/assets\/images\/[^"'?\s<>]+)\?[^"'\s<>]*/g, "$1");
  output = output.replace(/(\/pages\/articles\/[^/]+)\/embed\/#[^"']*/g, "$1/");
  output = output.replace(/<iframe\b(?=[^>]*class="wp-embedded-content")(?=[^>]*src="\/pages\/articles\/[^"]+")[\s\S]*?<\/iframe>/g, "");
  output = output.replace(/\s+srcset="[^"]*"/g, "");
  output = output.replace(/\s+sizes="[^"]*"/g, "");
  output = output.replace(/\s+style="[^"]*"/g, "");
  output = output.replace(/\s+data-[a-zA-Z0-9_-]+="[^"]*"/g, "");
  output = output.replace(/\s+loading="lazy"/g, "");
  output = output.replace(/<img /g, '<img loading="lazy" ');
  output = output.replace(/<iframe /g, '<iframe loading="lazy" ');
  return output;
}

function renderHome({ latestPosts, dataPosts, politicsPosts }) {
  const body = `
    <section class="page-block intro-block">
      ${homeIntro.map((paragraph) => `<p>${paragraph}</p>`).join("")}
    </section>
    <section class="page-block">
      <div class="section-heading">
        <h2>Latest publications</h2>
        <a href="/pages/archive/" class="text-link">View archive</a>
      </div>
      ${renderCards(latestPosts)}
    </section>
    <section class="page-block">
      <h2>${tradeWars.title}</h2>
      <p>${tradeWars.intro}</p>
      <div class="brief-grid">
        ${tradeWars.sections.map((section) => `
          <article class="brief-card">
            <h3>${section.heading}</h3>
            <p>${section.body}</p>
          </article>
        `).join("")}
      </div>
      <h3>Key focus issues</h3>
      <ul class="tag-list">
        ${tradeWars.issues.map((issue) => `<li>${issue}</li>`).join("")}
      </ul>
      <p>${tradeWars.note}</p>
    </section>
    <section class="page-block hub-links">
      <article>
        <h2><a href="/pages/understanding-data-and-law/">Understanding the data and law</a></h2>
        <p>Monitors US trade statistics, employment, inflation figures, and the legal frameworks behind the tariff negotiations.</p>
        ${renderMiniList(dataPosts)}
      </article>
      <article>
        <h2><a href="/pages/understanding-the-politics/">Understanding the Politics</a></h2>
        <p>Tracks the political motives, country-specific timelines, and tentative deal positions shaping tariff negotiations.</p>
        ${renderMiniList(politicsPosts)}
      </article>
    </section>
    <section class="page-block references-block">
      <h2>References</h2>
      <ul class="reference-list">
        ${tradeWars.references.map((ref) => `<li>${ref}</li>`).join("")}
      </ul>
    </section>
  `;

  return renderLayout({
    title: site.title,
    description: site.tagline,
    current: "home",
    body,
    isHome: true,
  });
}

function renderHubPage(page, { cards, kind }) {
  const body = `
    <article class="page-block article">
      <p class="eyebrow">${kind === "data" ? "Hub" : "Hub"}</p>
      <h1>${page.title}</h1>
      <div class="article-body">${page.content}</div>
    </article>
    <section class="page-block">
      <div class="section-heading">
        <h2>${kind === "data" ? "Latest data and law explainers" : "Country negotiation trackers"}</h2>
        <a href="${kind === "data" ? "/pages/trackers/data-law/" : "/pages/trackers/trade-negotiations/"}" class="text-link">Open tracker</a>
      </div>
      ${renderCards(cards)}
    </section>
  `;
  return renderLayout({
    title: page.title,
    description: stripTags(page.excerpt) || site.tagline,
    current: kind === "data" ? "data" : "politics",
    body,
  });
}

function renderPost(post, allPosts) {
  const index = allPosts.findIndex((candidate) => candidate.slug === post.slug);
  const previous = allPosts[index + 1];
  const next = allPosts[index - 1];
  const body = `
    <article class="page-block article">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a>
        <span>/</span>
        <a href="/pages/categories/${post.categorySlug}/">${post.categoryName}</a>
      </nav>
      <p class="eyebrow">${post.categoryName}</p>
      <h1>${post.title}</h1>
      <div class="meta-row">
        <span>Published ${formatDate(post.date)}</span>
        <span>Updated ${formatDate(post.modified)}</span>
      </div>
      ${post.featuredImage ? `<figure class="hero-media"><img src="${post.featuredImage}" alt="${escapeHtml(post.imageAlt)}" loading="lazy"></figure>` : ""}
      <div class="article-body">${post.content}</div>
      <footer class="article-footer">
        <a class="pill" href="/pages/categories/${post.categorySlug}/">${post.categoryName}</a>
        ${post.countrySlug ? `<a class="pill" href="/pages/countries/${post.countrySlug}/">${post.countryName}</a>` : ""}
      </footer>
      <nav class="post-nav" aria-label="Post navigation">
        ${previous ? `<a href="${previous.route}"><span>Previous</span>${previous.title}</a>` : "<span></span>"}
        ${next ? `<a href="${next.route}"><span>Next</span>${next.title}</a>` : "<span></span>"}
      </nav>
    </article>
  `;
  return renderLayout({
    title: post.title,
    description: decodeHtml(stripTags(post.excerpt)).slice(0, 160) || site.tagline,
    current: post.categorySlug === "understanding-politics" ? "politics" : "data",
    body,
  });
}

function renderCountryPage(post, countryPosts) {
  const otherCountries = countryPosts.filter((item) => item.slug !== post.slug);
  const body = `
    <article class="page-block article">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a>
        <span>/</span>
        <a href="/pages/trackers/trade-negotiations/">Trade Negotiation Trackers</a>
      </nav>
      <p class="eyebrow">Country tracker</p>
      <h1>${post.title}</h1>
      <div class="meta-row">
        <span>Published ${formatDate(post.date)}</span>
        <span>Updated ${formatDate(post.modified)}</span>
      </div>
      ${post.featuredImage ? `<figure class="hero-media"><img src="${post.featuredImage}" alt="${escapeHtml(post.imageAlt)}" loading="lazy"></figure>` : ""}
      <div class="article-body">${post.content}</div>
    </article>
    <section class="page-block">
      <h2>Other country trackers</h2>
      ${renderCards(otherCountries)}
    </section>
  `;
  return renderLayout({
    title: `${post.countryName} Tracker`,
    description: `${post.title} timeline and priorities.`,
    current: "politics",
    body,
  });
}

function renderListing({ title, eyebrow, description, posts }) {
  const body = `
    <section class="page-block">
      <p class="eyebrow">${eyebrow}</p>
      <h1>${title}</h1>
      <p class="lede">${description}</p>
      ${renderCards(posts)}
    </section>
  `;
  return renderLayout({
    title,
    description,
    current: title.includes("Politics") || title.includes("Negotiation") ? "politics" : "data",
    body,
  });
}

function renderArchive(posts) {
  const grouped = posts.reduce((acc, post) => {
    const year = new Date(post.date).getFullYear();
    acc[year] ??= [];
    acc[year].push(post);
    return acc;
  }, {});

  const body = `
    <section class="page-block">
      <p class="eyebrow">Archive</p>
      <h1>Publication archive</h1>
      <p class="lede">A static navigation index of all migrated tracker entries and explainers.</p>
      ${Object.entries(grouped).sort(([a], [b]) => b - a).map(([year, items]) => `
        <section class="archive-year">
          <h2>${year}</h2>
          <ol class="archive-list">
            ${items.map((post) => `
              <li>
                <time datetime="${post.date}">${formatDate(post.date)}</time>
                <a href="${post.route}">${post.title}</a>
                <span>${post.categoryName}</span>
              </li>
            `).join("")}
          </ol>
        </section>
      `).join("")}
    </section>
  `;
  return renderLayout({ title: "Publication Archive", description: site.tagline, current: "archive", body });
}

function renderTrackers({ dataPosts, politicsPosts }) {
  const body = `
    <section class="page-block">
      <p class="eyebrow">Trackers</p>
      <h1>Static tracker indexes</h1>
      <p class="lede">Structured indexes for future automation and data integration phases.</p>
      <div class="hub-links compact">
        <article>
          <h2><a href="/pages/trackers/data-law/">Data and law tracker</a></h2>
          <p>Explainers covering tariff formulas, SPS measures, legal instruments, digital barriers, and policy exclusions.</p>
          ${renderMiniList(dataPosts)}
        </article>
        <article>
          <h2><a href="/pages/trackers/trade-negotiations/">Trade negotiation tracker</a></h2>
          <p>Country timelines and priorities for India, China, the EU, Canada, the UK, and Japan.</p>
          ${renderMiniList(politicsPosts)}
        </article>
      </div>
    </section>
  `;
  return renderLayout({ title: "Trackers", description: site.tagline, current: "trackers", body });
}

function renderLayout({ title, description, current, body, isHome = false }) {
  const fullTitle = isHome ? site.title : `${title} – ${site.title}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="generator" content="Static HTML migration from WordPress.com">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <link rel="icon" href="/assets/images/tlogo-1.png">
  <link rel="stylesheet" href="/assets/css/styles.css">
</head>
<body>
  <a class="skip-link" href="#content">Skip to content</a>
  <div class="site-shell">
    ${renderSidebar(current)}
    <main id="content" class="site-main">
      <div class="mobile-brand">
        <a href="/" aria-label="${site.title} home">
          <img src="/assets/images/tlogo-1.png" alt="" width="48" height="48">
          <span>${site.title}</span>
        </a>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
      </div>
      ${body}
      ${renderFooter()}
    </main>
  </div>
  <script src="/assets/js/main.js" defer></script>
</body>
</html>`;
}

function renderSidebar(current) {
  const navItems = [
    ["home", "/", "Home"],
    ["data", "/pages/understanding-data-and-law/", "Understanding the Data and Law"],
    ["politics", "/pages/understanding-the-politics/", "Understanding the Politics"],
    ["trackers", "/pages/trackers/", "Trackers"],
    ["archive", "/pages/archive/", "Archive"],
  ];
  return `
    <aside class="site-sidebar">
      <div class="sidebar-inner">
        <p class="project-by">A project by the <a href="https://takshashila.org.in/">Takshashila Institution</a></p>
        <a class="brand" href="/">
          <span>${site.title}</span>
        </a>
        <p class="tagline">${site.tagline}</p>
        <img class="site-logo" src="/assets/images/tlogo-1.png" alt="" width="68" height="68">
        <form class="subscribe-form" data-static-form>
          <label class="screen-reader-text" for="subscribe-email">Email address</label>
          <input id="subscribe-email" type="email" placeholder="Type your email..." autocomplete="email">
          <button type="submit">Subscribe</button>
        </form>
        <nav id="site-nav" class="site-nav" aria-label="Main navigation">
          ${navItems.map(([key, href, label]) => `<a href="${href}" ${current === key ? 'aria-current="page"' : ""}>${label}</a>`).join("")}
        </nav>
      </div>
    </aside>
  `;
}

function renderFooter() {
  return `
    <footer class="site-footer">
      <section>
        <h2>Navigation</h2>
        <a href="/pages/understanding-data-and-law/">Understanding the Data and Law</a>
        <a href="/pages/understanding-the-politics/">Understanding the Politics</a>
        <a href="/pages/archive/">Archive</a>
      </section>
      <section>
        <h2>About</h2>
        <p>${site.title} is a project by the Indo-Pacific Studies Program of the Takshashila Institution.</p>
        <p>The project is managed by Abhishek Kadiyala, a Research Analyst with the Indo-Pacific Studies Program specialising in the US.</p>
        <p>Content is migrated from WordPress.com and attributed to the original project under a Creative Commons Attribution 4.0 International license.</p>
      </section>
    </footer>
  `;
}

function renderCards(posts) {
  return `<div class="card-grid">${posts.map((post) => `
    <article class="post-card">
      <a href="${post.route}" class="card-media" aria-label="${escapeHtml(post.title)}">
        ${post.featuredImage ? `<img src="${post.featuredImage}" alt="${escapeHtml(post.imageAlt)}" loading="lazy">` : ""}
      </a>
      <div class="card-body">
        <p class="card-category">${post.categoryName || "Tracker"}</p>
        <h3><a href="${post.route}">${post.title}</a></h3>
        <p>${decodeHtml(stripTags(post.excerpt)).slice(0, 138)}${decodeHtml(stripTags(post.excerpt)).length > 138 ? "..." : ""}</p>
      </div>
    </article>
  `).join("")}</div>`;
}

function renderMiniList(posts) {
  return `<ul class="mini-list">${posts.slice(0, 6).map((post) => `<li><a href="${post.route}">${post.title}</a></li>`).join("")}</ul>`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.json();
}

async function ensureDirs() {
  await Promise.all([
    mkdir(path.join(ROOT, "assets/images"), { recursive: true }),
    mkdir(path.join(ROOT, "data"), { recursive: true }),
    mkdir(path.join(ROOT, "pages"), { recursive: true }),
  ]);
}

async function writePage(relativePath, html) {
  const target = path.join(ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, relativizeRootLinks(html, relativePath));
}

async function writeJson(relativePath, data) {
  const target = path.join(ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(data, null, 2)}\n`);
}

function withoutContent(item) {
  const { content, ...rest } = item;
  return rest;
}

function localImage(url, imageMap) {
  if (!url) return "";
  return imageMap.get(stripQuery(url)) ?? url;
}

function uniqueImageName(url, imageMap) {
  const cleanName = path.basename(new URL(url).pathname).toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const existing = new Set([...imageMap.values()].map((value) => path.basename(value)));
  if (!existing.has(cleanName)) return cleanName;
  const parsed = path.parse(cleanName);
  let index = 2;
  while (existing.has(`${parsed.name}-${index}${parsed.ext}`)) index += 1;
  return `${parsed.name}-${index}${parsed.ext}`;
}

function getCountrySlug(title) {
  const match = title.match(/^US-(.+?) Trade Negotiations$/);
  if (!match) return "";
  return match[1].toLowerCase().replace(/\s+/g, "-");
}

function countryLabel(slug) {
  const labels = { uk: "UK", eu: "EU" };
  return labels[slug] ?? slug.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(dateString));
}

function stripTags(html = "") {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(value = "") {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripQuery(url) {
  const parsed = new URL(url);
  parsed.search = "";
  return parsed.toString();
}

function relativizeRootLinks(html, relativePath) {
  const depth = path.dirname(relativePath) === "." ? 0 : path.dirname(relativePath).split(path.sep).length;
  const prefix = depth === 0 ? "./" : "../".repeat(depth);
  return html
    .replaceAll('href="/"', `href="${prefix}"`)
    .replaceAll('href="/', `href="${prefix}`)
    .replaceAll('src="/', `src="${prefix}`)
    .replaceAll('content="/', `content="${prefix}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
