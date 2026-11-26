// Gallery Hot — galerías de fotos adultas (apiVersion 14, screen).
// Fuentes: PornPics, BabeSource, PMateHunter, Poringa.
// Arquitectura inspirada en Lectura +18 / Yuri Online (Hotaru Yume):
//   - Pantalla propia con Inicio, Biblioteca, Favoritos, Historial
//   - Fuentes conmutables por chips
//   - Detalle + lector vertical a pantalla completa
//   - Páginas en kino.storage; estado de pantalla mínimo
//
// Solo recolecta galerías de fotos (no vídeo). Marca adult: true.

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const PER_PAGE = 18;
const PAGES_MAX = 200;
const LIB_MAX = 120;
const FAV_KEY = "gh_fav";
const HIST_KEY = "gh_hist";
const PREF_SRC = "gh_src";

const TABS = [
  { value: "inicio", text: "Inicio", textEn: "Home" },
  { value: "biblioteca", text: "Biblioteca", textEn: "Library" },
  { value: "favoritos", text: "Favoritos", textEn: "Favorites" },
  { value: "historial", text: "Historial", textEn: "History" },
];

// ─── fuentes ───────────────────────────────────────────────────────────
const SITES = [
  {
    id: "pp",
    name: "PornPics",
    base: "https://www.pornpics.com",
    lang: "es",
    homePath: "/es/recent/",
    searchPath: (q) => "/es/?q=" + encodeURIComponent(q),
    catPath: (slug) => "/es/" + slug + "/",
    sections: [
      { key: "recent", label: "Recientes", labelEn: "Recent", path: "/es/recent/" },
      { key: "popular", label: "Populares", labelEn: "Popular", path: "/es/popular/" },
      { key: "milf", label: "MILF", labelEn: "MILF", path: "/es/milf/" },
      { key: "big-tits", label: "Grandes tetas", labelEn: "Big Tits", path: "/es/big-tits/" },
      { key: "amateur", label: "Amateur", labelEn: "Amateur", path: "/es/amateur/" },
      { key: "latina", label: "Latina", labelEn: "Latina", path: "/es/latina/" },
      { key: "asian", label: "Asiática", labelEn: "Asian", path: "/es/asian/" },
      { key: "blonde", label: "Rubia", labelEn: "Blonde", path: "/es/blonde/" },
    ],
  },
  {
    id: "bs",
    name: "BabeSource",
    base: "https://babesource.com",
    homePath: "/newest/",
    searchPath: (q) => "/search/" + encodeURIComponent(q.replace(/\s+/g, "-")) + "/",
    sections: [
      { key: "newest", label: "Nuevas", labelEn: "Newest", path: "/newest/" },
      { key: "top", label: "Mejor valoradas", labelEn: "Top rated", path: "/top-rated/" },
      { key: "viewed", label: "Más vistas", labelEn: "Most viewed", path: "/most-viewed/" },
    ],
  },
  {
    id: "pm",
    name: "PMateHunter",
    base: "https://pmatehunter.com",
    homePath: "/sort/filter/ord/0/content/pix/quality/0/tags/0",
    searchPath: (q) => "/?s=" + encodeURIComponent(q),
    sections: [
      {
        key: "pix",
        label: "Fotos",
        labelEn: "Photos",
        path: "/sort/filter/ord/0/content/pix/quality/0/tags/0",
      },
      { key: "home", label: "Inicio", labelEn: "Home", path: "/" },
    ],
  },
  {
    id: "po",
    name: "Poringa",
    base: "https://www.poringa.net",
    homePath: "/",
    searchPath: (q) => "/buscar/?q=" + encodeURIComponent(q),
    sections: [
      { key: "home", label: "Recientes", labelEn: "Recent", path: "/" },
    ],
  },
];

// ─── storage helpers ───────────────────────────────────────────────────
function getJson(key, def) {
  try {
    const s = kino.storage.get(key);
    if (s == null || s === "") return def;
    return JSON.parse(s);
  } catch (e) {
    return def;
  }
}
function setJson(key, val) {
  try {
    kino.storage.set(key, JSON.stringify(val));
  } catch (e) {
    kino.log("storage", e.message);
  }
}

function prefFuenteId() {
  const id = getJson(PREF_SRC, null);
  if (id && SITES.some((s) => s.id === id)) return id;
  return SITES[0].id;
}
function siteDe(state) {
  const id = (state && state.fuente) || prefFuenteId();
  return SITES.find((s) => s.id === id) || SITES[0];
}
function siteOfId(id) {
  return SITES.find((s) => s.id === id) || SITES[0];
}

// ─── HTTP ──────────────────────────────────────────────────────────────
function headersDe(site) {
  return {
    Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": site.lang === "es" ? "es,en;q=0.8" : "en,es;q=0.8",
    Referer: site.base + "/",
    "User-Agent": UA,
  };
}

async function getHtml(site, path, timeoutMs) {
  const url = path.startsWith("http") ? path : site.base + path;
  const r = await kino.fetch(url, {
    headers: headersDe(site),
    timeoutMs: timeoutMs || 20000,
  });
  if (!r.ok) {
    throw kino.error("network", "HTTP " + r.status, {
      userMessage: "No se pudo conectar con el sitio. Inténtalo de nuevo.",
    });
  }
  return r.text();
}

function decode(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (m, n) => {
      const c = parseInt(n, 10);
      return c > 0 && c < 65536 ? String.fromCharCode(c) : "";
    })
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function absUrl(base, u) {
  if (!u) return "";
  u = String(u).trim().replace(/&amp;/g, "&");
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("http")) return u;
  if (u.startsWith("/")) return base.replace(/\/$/, "") + u;
  return base.replace(/\/$/, "") + "/" + u;
}

// ─── parsers por fuente ────────────────────────────────────────────────

function parsePornPicsList(html, max) {
  const out = [];
  const seen = {};
  const re =
    /href="(https?:\/\/www\.pornpics\.com\/es\/galleries\/([^"/]+)\/?)"[^>]*>[\s\S]{0,800}?<img[^>]+(?:src|data-src)="(https?:\/\/cdni\.pornpics\.com\/[^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < (max || 40)) {
    const url = m[1];
    const slug = m[2];
    if (seen[slug]) continue;
    seen[slug] = true;
    let poster = m[3];
    // prefer 460 thumb already; keep as is
    const title = slug
      .replace(/-\d+$/, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    out.push({
      id: "pp:" + slug,
      slug: slug,
      url: url,
      title: title,
      poster: poster,
      siteId: "pp",
      adult: true,
    });
  }
  // fallback looser
  if (!out.length) {
    const re2 =
      /href="(\/es\/galleries\/([^"/]+)\/?)"[\s\S]{0,600}?src="(https?:\/\/cdni\.pornpics\.com\/[^"]+)"/gi;
    while ((m = re2.exec(html)) !== null && out.length < (max || 40)) {
      const slug = m[2];
      if (seen[slug]) continue;
      seen[slug] = true;
      out.push({
        id: "pp:" + slug,
        slug: slug,
        url: "https://www.pornpics.com/es/galleries/" + slug + "/",
        title: slug.replace(/-\d+$/, "").replace(/-/g, " "),
        poster: m[3],
        siteId: "pp",
        adult: true,
      });
    }
  }
  return out;
}

function parsePornPicsPages(html) {
  const pages = [];
  const seen = {};
  // full size links
  const re = /href="(https?:\/\/cdni\.pornpics\.com\/1280\/[^"]+\.(?:jpe?g|webp))"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const u = m[1];
    if (seen[u]) continue;
    seen[u] = true;
    pages.push(u);
  }
  if (pages.length < 3) {
    // thumbs → upgrade 460 → 1280
    const re2 =
      /(?:src|data-src)="(https?:\/\/cdni\.pornpics\.com\/)(460)(\/[^"]+\.(?:jpe?g|webp))"/gi;
    while ((m = re2.exec(html)) !== null) {
      const u = m[1] + "1280" + m[3];
      if (seen[u]) continue;
      seen[u] = true;
      pages.push(u);
    }
  }
  return pages.slice(0, PAGES_MAX);
}

function parseBabeSourceList(html, max) {
  const out = [];
  const seen = {};
  const re =
    /href="(https?:\/\/babesource\.com\/galleries\/([^"/]+)\.html)"/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < (max || 40)) {
    const url = m[1];
    const slug = m[2];
    if (seen[slug]) continue;
    seen[slug] = true;
    // look nearby for thumb
    const win = html.slice(Math.max(0, m.index - 400), m.index + 800);
    let poster = "";
    const im = win.match(
      /(?:src|data-src)="(https?:\/\/media\.babesource\.com\/galleries\/[^"]+\.(?:jpe?g|webp)[^"]*)"/i
    );
    if (im) poster = im[1].replace(/\.webp(\?|$)/, ".jpg$1");
    const title = slug
      .replace(/-\d+$/, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    out.push({
      id: "bs:" + slug,
      slug: slug,
      url: url,
      title: title,
      poster: poster,
      siteId: "bs",
      adult: true,
    });
  }
  return out;
}

function parseBabeSourcePages(html) {
  const pages = [];
  const seen = {};
  // thumbs path → try without /thumbs/ for full
  const re =
    /(?:src|data-src|href)="(https?:\/\/media\.babesource\.com\/galleries\/[a-f0-9]+\/(?:thumbs\/)?[^"]+\.(?:jpe?g|webp)[^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null && pages.length < PAGES_MAX) {
    let u = m[1].replace(/\.webp(\?|$)/i, ".jpg$1").split("?")[0];
    // prefer non-thumb if possible
    const full = u.replace(/\/thumbs\//, "/");
    if (!seen[full] && !seen[u]) {
      seen[full] = true;
      pages.push(full);
    }
  }
  return pages;
}

function parsePmateList(html, max) {
  const out = [];
  const seen = {};
  // post links that look like galleries (not /model/)
  const re =
    /href="(https?:\/\/(?:www\.)?pmatehunter\.com\/([a-z0-9][a-z0-9-]{4,})\/?)"/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < (max || 40)) {
    const url = m[1];
    const slug = m[2];
    if (
      seen[slug] ||
      /^(model|models|sort|tag|category|page|wp-|feed|author)/i.test(slug)
    )
      continue;
    seen[slug] = true;
    const win = html.slice(Math.max(0, m.index - 200), m.index + 1200);
    let poster = "";
    const im = win.match(
      /(?:src|data-src|srcset)="(https?:\/\/cdn\.pmatehunter\.com\/[^"\s]+\.(?:jpe?g|webp)[^"]*)"/i
    );
    if (im) {
      poster = im[1].split(/\s+/)[0].replace(/_w\d+\./, "_w800.");
    }
    const title = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    out.push({
      id: "pm:" + slug,
      slug: slug,
      url: url.replace(/\/$/, "") + "/",
      title: title,
      poster: poster,
      siteId: "pm",
      adult: true,
    });
  }
  return out;
}

function parsePmatePages(html) {
  const pages = [];
  const seen = {};
  // content images, prefer larger sizes
  const re =
    /(https?:\/\/cdn\.pmatehunter\.com\/content\/[^"'\s]+?(?:_w800|_masonry_1200|_w1200)?\.(?:jpe?g|webp))/gi;
  let m;
  while ((m = re.exec(html)) !== null && pages.length < PAGES_MAX) {
    let u = m[1].split(/\s+/)[0].split("?")[0];
    // normalize to larger
    u = u
      .replace(/_w\d+\./, "_w800.")
      .replace(/_masonry_\d+\./, "_masonry_1200.");
    if (seen[u]) continue;
    seen[u] = true;
    pages.push(u);
  }
  // also srcset
  const re2 =
    /srcset="([^"]+cdn\.pmatehunter\.com\/content\/[^"]+)"/gi;
  while ((m = re2.exec(html)) !== null && pages.length < PAGES_MAX) {
    const parts = m[1].split(",");
    let best = "";
    let bestW = 0;
    for (const p of parts) {
      const mm = p.trim().match(/(\S+)\s+(\d+)w/);
      if (mm) {
        const w = parseInt(mm[2], 10);
        if (w > bestW) {
          bestW = w;
          best = mm[1];
        }
      }
    }
    if (best && !seen[best]) {
      seen[best] = true;
      pages.push(best);
    }
  }
  return pages;
}

function parsePoringaList(html, max) {
  const out = [];
  const seen = {};
  // posts with images
  const re =
    /href="(https?:\/\/(?:www\.)?poringa\.net\/posts\/([^"/]+)\/?)"/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < (max || 40)) {
    const url = m[1];
    const slug = m[2];
    if (seen[slug]) continue;
    seen[slug] = true;
    const win = html.slice(Math.max(0, m.index - 100), m.index + 1500);
    let poster = "";
    const im = win.match(
      /(?:src|data-src)="(https?:\/\/s\d*\.poringa\.net\/[^"]+\.(?:jpe?g|webp|png|gif)[^"]*)"/i
    );
    if (im) poster = im[1];
    // title nearby
    let title = slug.replace(/-/g, " ");
    const t = win.match(/<h[123][^>]*>([^<]{3,120})</);
    if (t) title = decode(t[1]);
    out.push({
      id: "po:" + slug,
      slug: slug,
      url: url,
      title: title,
      poster: poster,
      siteId: "po",
      adult: true,
    });
  }
  // alternative: post boxes
  if (!out.length) {
    const re2 =
      /href="(\/posts\/([^"/]+)\/?)"[^>]*>[\s\S]{0,400}?src="([^"]+\.(?:jpe?g|webp|png))"/gi;
    while ((m = re2.exec(html)) !== null && out.length < (max || 40)) {
      const slug = m[2];
      if (seen[slug]) continue;
      seen[slug] = true;
      out.push({
        id: "po:" + slug,
        slug: slug,
        url: "https://www.poringa.net/posts/" + slug + "/",
        title: slug.replace(/-/g, " "),
        poster: absUrl("https://s2.poringa.net", m[3]),
        siteId: "po",
        adult: true,
      });
    }
  }
  return out;
}

function parsePoringaPages(html) {
  const pages = [];
  const seen = {};
  const re =
    /(?:src|data-src|href)="(https?:\/\/s\d*\.poringa\.net\/[^"]+\.(?:jpe?g|webp|png|gif)[^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null && pages.length < PAGES_MAX) {
    const u = m[1].split("?")[0];
    if (seen[u] || /avatar|icon|logo|emoji|smiley/i.test(u)) continue;
    seen[u] = true;
    pages.push(u);
  }
  return pages;
}

// ─── data layer ────────────────────────────────────────────────────────

async function fetchCards(site, pathOrSec, page, q) {
  let path = "/";
  if (q && site.searchPath) {
    path = site.searchPath(q);
  } else if (typeof pathOrSec === "string") {
    path = pathOrSec;
  } else if (pathOrSec && pathOrSec.path) {
    path = pathOrSec.path;
  } else {
    path = site.homePath || "/";
  }
  // pagination hints
  if (page && page > 1) {
    if (site.id === "pp") {
      path = path.replace(/\/?$/, "/") + "?page=" + page;
    } else if (site.id === "bs") {
      path = path.replace(/\/?$/, "/") + "page/" + page + "/";
    } else if (site.id === "pm") {
      path = path + (path.indexOf("?") >= 0 ? "&" : "?") + "paged=" + page;
    }
  }
  const html = await getHtml(site, path, 22000);
  if (site.id === "pp") return parsePornPicsList(html, 36);
  if (site.id === "bs") return parseBabeSourceList(html, 36);
  if (site.id === "pm") return parsePmateList(html, 36);
  if (site.id === "po") return parsePoringaList(html, 36);
  return [];
}

async function fetchPages(site, card) {
  const html = await getHtml(site, card.url, 25000);
  let pages = [];
  if (site.id === "pp") pages = parsePornPicsPages(html);
  else if (site.id === "bs") pages = parseBabeSourcePages(html);
  else if (site.id === "pm") pages = parsePmatePages(html);
  else if (site.id === "po") pages = parsePoringaPages(html);
  return pages.slice(0, PAGES_MAX);
}

// ─── favoritos / historial ─────────────────────────────────────────────
function loadFavs() {
  return getJson(FAV_KEY, []) || [];
}
function saveFavs(list) {
  setJson(FAV_KEY, (list || []).slice(0, 200));
}
function isFav(id) {
  return loadFavs().some((x) => x.id === id);
}
function toggleFav(card) {
  let list = loadFavs();
  const i = list.findIndex((x) => x.id === card.id);
  if (i >= 0) list.splice(i, 1);
  else
    list.unshift({
      id: card.id,
      slug: card.slug,
      title: card.title,
      poster: card.poster,
      url: card.url,
      siteId: card.siteId,
      adult: true,
    });
  saveFavs(list);
  return list;
}

function loadHist() {
  return getJson(HIST_KEY, []) || [];
}
function pushHist(card) {
  let list = loadHist().filter((x) => x.id !== card.id);
  list.unshift({
    id: card.id,
    slug: card.slug,
    title: card.title,
    poster: card.poster,
    url: card.url,
    siteId: card.siteId,
    adult: true,
    at: Date.now(),
  });
  setJson(HIST_KEY, list.slice(0, 80));
}

// ─── UI helpers ────────────────────────────────────────────────────────
function cardTile(c, keyPrefix) {
  return {
    type: "InkWell",
    key: (keyPrefix || "c") + ":" + c.id,
    onPressed: {
      event: "openDetail",
      arg: { id: c.id, slug: c.slug, siteId: c.siteId, url: c.url, title: c.title, poster: c.poster },
    },
    child: {
      type: "Column",
      crossAxisAlignment: "start",
      children: [
        {
          type: "AspectRatio",
          aspectRatio: 0.7,
          child: {
            type: "ClipRRect",
            borderRadius: 8,
            child: c.poster
              ? { type: "Image", url: c.poster, fit: "cover", adult: true }
              : {
                  type: "Container",
                  color: "#2a2a2a",
                  child: {
                    type: "Center",
                    child: { type: "Icon", icon: "image", size: 36, color: "#666" },
                  },
                },
          },
        },
        {
          type: "Padding",
          padding: { top: 6, left: 2, right: 2 },
          child: {
            type: "Text",
            text: c.title || c.slug,
            maxLines: 2,
            overflow: "ellipsis",
            style: { fontSize: 12 },
          },
        },
      ],
    },
  };
}

function gridOf(cards, keyPrefix) {
  if (!cards || !cards.length) {
    return {
      type: "Padding",
      padding: 24,
      child: {
        type: "Text",
        text: "Sin resultados",
        textEn: "No results",
        style: { color: "#888" },
      },
    };
  }
  return {
    type: "GridView",
    crossAxisCount: 3,
    mainAxisSpacing: 10,
    crossAxisSpacing: 10,
    childAspectRatio: 0.55,
    padding: { left: 10, right: 10, top: 8, bottom: 24 },
    children: cards.map((c, i) => cardTile(c, (keyPrefix || "g") + i)),
  };
}

function skeletonGrid(n) {
  const cells = [];
  for (let i = 0; i < (n || 9); i++) {
    cells.push({
      type: "Column",
      children: [
        {
          type: "AspectRatio",
          aspectRatio: 0.7,
          child: {
            type: "Container",
            color: "#2a2a2a",
            borderRadius: 8,
          },
        },
        {
          type: "Container",
          margin: { top: 6 },
          height: 12,
          color: "#333",
          borderRadius: 4,
        },
      ],
    });
  }
  return {
    type: "GridView",
    crossAxisCount: 3,
    mainAxisSpacing: 10,
    crossAxisSpacing: 10,
    childAspectRatio: 0.55,
    padding: { left: 10, right: 10, top: 8, bottom: 24 },
    children: cells,
  };
}

function fuenteChips(state) {
  const cur = siteDe(state).id;
  return {
    type: "SingleChildScrollView",
    scrollDirection: "horizontal",
    padding: { left: 10, right: 10, top: 8, bottom: 4 },
    child: {
      type: "Row",
      children: SITES.map((s) => ({
        type: "Padding",
        padding: { right: 8 },
        child: {
          type: "ActionChip",
          key: "src:" + s.id,
          label: s.name,
          selected: cur === s.id,
          onPressed: { event: "fuente", arg: s.id },
        },
      })),
    },
  };
}

function sectionBlock(label, cards, key, loading) {
  return {
    type: "Column",
    crossAxisAlignment: "start",
    children: [
      {
        type: "Padding",
        padding: { left: 12, right: 12, top: 12, bottom: 4 },
        child: {
          type: "Text",
          text: label,
          style: { fontSize: 16, fontWeight: "w600" },
        },
      },
      loading && (!cards || !cards.length)
        ? skeletonGrid(6)
        : {
            type: "SizedBox",
            height: 220,
            child: {
              type: "ListView",
              scrollDirection: "horizontal",
              padding: { left: 10, right: 10 },
              children: (cards || []).slice(0, 12).map((c, i) => ({
                type: "SizedBox",
                width: 110,
                child: cardTile(c, key + i),
              })),
            },
          },
    ],
  };
}

function errorTree(msg, retryEvent) {
  return {
    type: "Center",
    child: {
      type: "Column",
      mainAxisSize: "min",
      children: [
        { type: "Icon", icon: "error_outline", size: 48, color: "#c44" },
        {
          type: "Padding",
          padding: 12,
          child: { type: "Text", text: msg, textAlign: "center" },
        },
        retryEvent
          ? {
              type: "FilledButton",
              child: { type: "Text", text: "Reintentar", textEn: "Retry" },
              onPressed: { event: retryEvent },
            }
          : { type: "SizedBox", height: 1 },
      ],
    },
  };
}

// ─── tab bodies ────────────────────────────────────────────────────────
function tabBody(state) {
  const tab = state.tab || "inicio";
  if (tab === "favoritos") {
    const favs = loadFavs();
    return {
      type: "Column",
      children: [
        fuenteChips(state),
        {
          type: "Expanded",
          child: favs.length
            ? gridOf(favs, "fav")
            : {
                type: "Center",
                child: {
                  type: "Text",
                  text: "Sin favoritos aún",
                  textEn: "No favorites yet",
                  style: { color: "#888" },
                },
              },
        },
      ],
    };
  }
  if (tab === "historial") {
    const hist = loadHist();
    return {
      type: "Column",
      children: [
        fuenteChips(state),
        {
          type: "Expanded",
          child: hist.length
            ? gridOf(hist, "hist")
            : {
                type: "Center",
                child: {
                  type: "Text",
                  text: "Historial vacío",
                  textEn: "Empty history",
                  style: { color: "#888" },
                },
              },
        },
      ],
    };
  }
  if (tab === "biblioteca") {
    const items = state.libItems;
    return {
      type: "Column",
      children: [
        fuenteChips(state),
        {
          type: "Expanded",
          child: items
            ? gridOf(items, "lib")
            : state.libError
            ? errorTree("Error al cargar la biblioteca", "reloadLib")
            : skeletonGrid(12),
        },
      ],
    };
  }
  // inicio
  const site = siteDe(state);
  const cats = state.cats || {};
  const children = [fuenteChips(state)];
  for (const sec of site.sections) {
    const block = cats[sec.key];
    children.push(
      sectionBlock(
        sec.label,
        block && block.items,
        sec.key,
        !block || block.loading
      )
    );
  }
  return {
    type: "SingleChildScrollView",
    child: { type: "Column", crossAxisAlignment: "start", children: children },
  };
}

// ─── detail / reader ───────────────────────────────────────────────────
function detailLoadingTree(d) {
  return {
    type: "Scaffold",
    appBar: {
      title: d.meta && d.meta.title ? d.meta.title : "Cargando…",
      leading: {
        type: "IconButton",
        icon: "arrow_back",
        onPressed: { event: "back" },
      },
    },
    body: {
      type: "Center",
      child: { type: "CircularProgressIndicator" },
    },
  };
}

async function detailTree(state) {
  const d = state.detail;
  if (!d) return detailLoadingTree({ meta: {} });
  if (d.loading) return detailLoadingTree(d);
  const pages = d.pages || [];
  const fav = isFav(d.id || d.slug);
  return {
    type: "Scaffold",
    appBar: {
      title: d.meta && d.meta.title ? d.meta.title : d.slug,
      leading: {
        type: "IconButton",
        icon: "arrow_back",
        onPressed: { event: "back" },
      },
      actions: [
        {
          type: "IconButton",
          icon: fav ? "favorite" : "favorite_border",
          onPressed: { event: "toggleFav" },
        },
      ],
    },
    body: {
      type: "SingleChildScrollView",
      padding: 16,
      child: {
        type: "Column",
        crossAxisAlignment: "start",
        children: [
          d.meta && d.meta.poster
            ? {
                type: "Center",
                child: {
                  type: "ClipRRect",
                  borderRadius: 10,
                  child: {
                    type: "Image",
                    url: d.meta.poster,
                    width: 220,
                    fit: "cover",
                    adult: true,
                  },
                },
              }
            : { type: "SizedBox", height: 1 },
          {
            type: "Padding",
            padding: { top: 16, bottom: 8 },
            child: {
              type: "Text",
              text: d.meta && d.meta.title ? d.meta.title : d.slug,
              style: { fontSize: 18, fontWeight: "w600" },
            },
          },
          {
            type: "Text",
            text:
              pages.length +
              " fotos" +
              (d.capped ? " (máx. " + PAGES_MAX + ")" : ""),
            style: { color: "#aaa", fontSize: 13 },
          },
          {
            type: "Padding",
            padding: { top: 20 },
            child: {
              type: "FilledButton",
              child: {
                type: "Text",
                text: pages.length ? "Ver galería" : "Sin imágenes",
                textEn: pages.length ? "View gallery" : "No images",
              },
              onPressed: pages.length
                ? { event: "openRead" }
                : { event: "noop" },
            },
          },
          pages.length
            ? {
                type: "Padding",
                padding: { top: 24 },
                child: {
                  type: "Wrap",
                  spacing: 6,
                  runSpacing: 6,
                  children: pages.slice(0, 12).map((u, i) => ({
                    type: "ClipRRect",
                    borderRadius: 6,
                    child: {
                      type: "Image",
                      url: u,
                      width: 72,
                      height: 96,
                      fit: "cover",
                      adult: true,
                    },
                  })),
                },
              }
            : { type: "SizedBox", height: 1 },
        ],
      },
    },
  };
}

async function readerTree(state) {
  const d = state.detail;
  const pages = (d && d.pages) || [];
  if (!pages.length) {
    return {
      type: "Scaffold",
      appBar: {
        title: "Galería",
        leading: {
          type: "IconButton",
          icon: "arrow_back",
          onPressed: { event: "backDetail" },
        },
      },
      body: errorTree("No hay imágenes en esta galería", null),
    };
  }
  // use pages widget if available (apiVersion 14+)
  const hasPages =
    typeof kino.screen === "object" &&
    kino.screen !== null &&
    Array.isArray(kino.screen.widgets) &&
    kino.screen.widgets.indexOf("pages") >= 0;

  if (hasPages) {
    return {
      type: "Scaffold",
      body: {
        type: "Pages",
        key: "reader",
        urls: pages,
        adult: true,
        onClose: { event: "backDetail" },
      },
    };
  }
  // fallback vertical list
  return {
    type: "Scaffold",
    appBar: {
      title: (d.meta && d.meta.title) || "Galería",
      leading: {
        type: "IconButton",
        icon: "arrow_back",
        onPressed: { event: "backDetail" },
      },
    },
    body: {
      type: "ListView",
      children: pages.map((u, i) => ({
        type: "Padding",
        padding: { bottom: 4 },
        child: {
          type: "Image",
          url: u,
          fit: "contain",
          adult: true,
        },
      })).concat([
        {
          type: "Padding",
          padding: 24,
          child: {
            type: "FilledButton",
            child: { type: "Text", text: "Volver al detalle", textEn: "Back to detail" },
            onPressed: { event: "backDetail" },
          },
        },
      ]),
    },
  };
}

function searchTree(state) {
  return {
    type: "Scaffold",
    appBar: {
      title: "Buscar",
      titleEn: "Search",
      leading: {
        type: "IconButton",
        icon: "arrow_back",
        onPressed: { event: "back" },
      },
    },
    body: {
      type: "Column",
      children: [
        {
          type: "Padding",
          padding: 12,
          child: {
            type: "TextField",
            key: "q",
            decoration: {
              hintText: "Buscar galerías…",
              hintTextEn: "Search galleries…",
            },
            onSubmitted: { event: "doSearch" },
          },
        },
        {
          type: "Expanded",
          child: state.searchLoading
            ? skeletonGrid(9)
            : state.searchError
            ? errorTree("Error en la búsqueda", "doSearch")
            : gridOf(state.searchItems || [], "s"),
        },
      ],
    },
  };
}

// ─── exports ───────────────────────────────────────────────────────────
let rootEnCarga = false;
let detailEnCarga = null;

export async function screen({ state, route }) {
  const r = route || { name: "home" };
  try {
    if (r.name === "detail") {
      if (!state.detail || state.detail.loading) {
        return {
          type: "Scaffold",
          every: { ms: 400, event: "cargarDetail" },
          appBar: {
            title:
              (state.detail && state.detail.meta && state.detail.meta.title) ||
              "Cargando…",
            leading: {
              type: "IconButton",
              icon: "arrow_back",
              onPressed: { event: "back" },
            },
          },
          body: {
            type: "Center",
            child: { type: "CircularProgressIndicator" },
          },
        };
      }
      return await detailTree(state);
    }
    if (r.name === "read") return await readerTree(state);
    if (r.name === "search") return searchTree(state);
  } catch (e) {
    return errorTree("No se pudo cargar (" + (e.code || "error") + ").", "retry");
  }
  return {
    type: "Scaffold",
    every: { ms: 1600, event: "cargarRoot" },
    appBar: {
      title: siteDe(state).name,
      actions: [
        {
          type: "IconButton",
          icon: "search",
          labelText: "Buscar",
          labelTextEn: "Search",
          onPressed: { event: "goSearch" },
        },
      ],
      bottom: {
        type: "TabBar",
        key: "tabs",
        tabs: TABS,
        value: state.tab || "inicio",
        onChanged: { event: "tab" },
      },
    },
    body: tabBody(state),
  };
}

export async function screenEvent(ev) {
  const name = ev.name;
  const state = ev.state || {};
  try {
    if (name === "open") {
      if (!state.fuente) {
        return { state: { fuente: prefFuenteId() } };
      }
      return null;
    }
    if (name === "fuente") {
      const id = String(ev.arg || ev.value || "");
      if (!SITES.some((s) => s.id === id)) return null;
      setJson(PREF_SRC, id);
      return {
        state: {
          fuente: id,
          cats: {},
          libItems: null,
          libPage: 1,
          libError: false,
          libDone: false,
        },
        toast: "Fuente: " + siteOfId(id).name,
      };
    }
    if (name === "tab") {
      return { state: { tab: ev.value } };
    }
    if (name === "goSearch") {
      return { route: { name: "search" }, state: { searchItems: null, searchLoading: false } };
    }
    if (name === "back") {
      return { route: { name: "home" } };
    }
    if (name === "backDetail") {
      return { route: { name: "detail" } };
    }
    if (name === "cargarRoot") {
      if (rootEnCarga) return null;
      const tab = state.tab || "inicio";
      const site = siteDe(state);
      if (tab === "biblioteca") {
        if (Array.isArray(state.libItems)) return null;
        rootEnCarga = true;
        try {
          const items = await fetchCards(site, site.homePath, 1);
          return {
            state: {
              libItems: items,
              libPage: 1,
              libError: false,
              libDone: items.length < PER_PAGE,
            },
          };
        } catch (e) {
          return { state: { libError: true } };
        } finally {
          rootEnCarga = false;
        }
      }
      if (tab === "inicio") {
        const cats = state.cats || {};
        for (const sec of site.sections) {
          if (!cats[sec.key] || cats[sec.key].error) {
            rootEnCarga = true;
            try {
              const items = await fetchCards(site, sec, 1);
              const next = Object.assign({}, cats, {
                [sec.key]: { items: items, loading: false, error: false },
              });
              return { state: { cats: next } };
            } catch (e) {
              const next = Object.assign({}, cats, {
                [sec.key]: { items: [], loading: false, error: true },
              });
              return { state: { cats: next } };
            } finally {
              rootEnCarga = false;
            }
          }
        }
      }
      return null;
    }
    if (name === "reloadLib") {
      return { state: { libItems: null, libError: false } };
    }
    if (name === "openDetail") {
      const arg = ev.arg || {};
      const site = siteOfId(arg.siteId) || siteDe(state);
      const card = {
        id: arg.id || site.id + ":" + arg.slug,
        slug: arg.slug,
        url: arg.url,
        title: arg.title,
        poster: arg.poster,
        siteId: site.id,
        adult: true,
      };
      pushHist(card);
      detailEnCarga = null;
      return {
        route: { name: "detail", params: { slug: card.slug, id: card.id } },
        state: {
          detail: {
            id: card.id,
            slug: card.slug,
            url: card.url,
            siteId: site.id,
            loading: true,
            meta: { title: card.title, poster: card.poster },
            pages: [],
          },
        },
      };
    }
    if (name === "cargarDetail") {
      const card = state.detail;
      if (!card || !card.loading || !card.url) return null;
      if (detailEnCarga === card.id) return null;
      detailEnCarga = card.id;
      try {
        const site = siteOfId(card.siteId);
        const pages = await fetchPages(site, {
          url: card.url,
          slug: card.slug,
        });
        const capped = pages.length >= PAGES_MAX;
        return {
          state: {
            detail: {
              id: card.id,
              slug: card.slug,
              url: card.url,
              siteId: card.siteId,
              loading: false,
              meta: card.meta,
              pages: pages,
              capped: capped,
            },
          },
        };
      } catch (e) {
        kino.log("detail", e.message || e);
        return {
          state: {
            detail: Object.assign({}, card, {
              loading: false,
              pages: [],
              error: true,
            }),
          },
        };
      } finally {
        detailEnCarga = null;
      }
    }
    if (name === "openRead") {
      return { route: { name: "read" } };
    }
    if (name === "toggleFav") {
      const d = state.detail;
      if (!d) return null;
      toggleFav({
        id: d.id,
        slug: d.slug,
        title: (d.meta && d.meta.title) || d.slug,
        poster: d.meta && d.meta.poster,
        url: d.url,
        siteId: d.siteId,
      });
      return { toast: isFav(d.id) ? "Añadido a favoritos" : "Quitado de favoritos" };
    }
    if (name === "doSearch") {
      const q =
        (ev.value && String(ev.value).trim()) ||
        (state.q && String(state.q).trim()) ||
        "";
      if (!q) return null;
      const site = siteDe(state);
      try {
        const items = await fetchCards(site, null, 1, q);
        return {
          state: { searchItems: items, searchLoading: false, searchError: false, q: q },
        };
      } catch (e) {
        return { state: { searchError: true, searchLoading: false } };
      }
    }
    if (name === "retry") {
      return { state: { cats: {}, libItems: null, libError: false } };
    }
  } catch (e) {
    kino.log("event", name + " " + (e.message || e));
    return { toast: "Error: " + (e.message || "desconocido") };
  }
  return null;
}
