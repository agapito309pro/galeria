// Gallery Hot — galerías de fotos adultas (apiVersion 14, screen).
// Fuentes: PornPics, BabeSource, PMateHunter, Poringa.
// UI según contrato real de Kino (mismo patrón que Lectura +18):
//   ListView+items+columns, Card+onTap, Image+aspect, Chips, Skeleton,
//   emptyState, ElevatedButton, Icon name=…
// v1.0.1 — parsers con comillas simples/dobles; widgets correctos;
//   home con esqueletos + every cargarRoot; nunca pantalla en blanco.

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const PER_PAGE = 18;
const PAGES_MAX = 200;
const FAV_KEY = "gh_fav";
const HIST_KEY = "gh_hist";
const PREF_SRC = "gh_src";

const TABS = [
  { value: "inicio", text: "Inicio", textEn: "Home" },
  { value: "biblioteca", text: "Biblioteca", textEn: "Library" },
  { value: "favoritos", text: "Favoritos", textEn: "Favorites" },
  { value: "historial", text: "Historial", textEn: "History" },
];

const SITES = [
  {
    id: "pp",
    name: "PornPics",
    base: "https://www.pornpics.com",
    homePath: "/es/recent/",
    searchPath: (q) => "/es/?q=" + encodeURIComponent(q),
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
    searchPath: (q) => "/search/" + encodeURIComponent(String(q).replace(/\s+/g, "-")) + "/",
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

// ─── storage ───────────────────────────────────────────────────────────
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
    kino.log("storage", e && e.message);
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
    "Accept-Language": "es,en;q=0.8",
    Referer: site.base + "/",
    "User-Agent": UA,
  };
}

async function getHtml(site, path, timeoutMs) {
  const url = path && String(path).indexOf("http") === 0 ? path : site.base + (path || "/");
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

function titleFromSlug(slug) {
  return String(slug || "")
    .replace(/-\d{5,}$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── parsers ───────────────────────────────────────────────────────────

function parsePornPicsList(html, max) {
  const out = [];
  const seen = {};
  // comillas simples o dobles; img lazy-load con src o data-src
  const re =
    /href=["'](https?:\/\/(?:www\.)?pornpics\.com\/es\/galleries\/([^"'/]+)\/?)["'][^>]*>[\s\S]{0,500}?<img[^>]+(?:src|data-src)=["'](https?:\/\/cdni\.pornpics\.com\/[^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < (max || 40)) {
    const slug = m[2];
    if (seen[slug]) continue;
    seen[slug] = true;
    out.push({
      id: "pp:" + slug,
      slug: slug,
      url: "https://www.pornpics.com/es/galleries/" + slug + "/",
      title: titleFromSlug(slug),
      poster: m[3],
      siteId: "pp",
      adult: true,
    });
  }
  if (!out.length) {
    const re2 =
      /href=["'](?:https?:\/\/(?:www\.)?pornpics\.com)?(\/es\/galleries\/([^"'/]+)\/?)["']/gi;
    while ((m = re2.exec(html)) !== null && out.length < (max || 40)) {
      const slug = m[2];
      if (seen[slug]) continue;
      seen[slug] = true;
      const win = html.slice(m.index, m.index + 900);
      const im = win.match(
        /(?:src|data-src)=["'](https?:\/\/cdni\.pornpics\.com\/[^"']+)["']/i
      );
      out.push({
        id: "pp:" + slug,
        slug: slug,
        url: "https://www.pornpics.com/es/galleries/" + slug + "/",
        title: titleFromSlug(slug),
        poster: im ? im[1] : "",
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
  const add = (u) => {
    if (!u || seen[u]) return;
    seen[u] = true;
    pages.push(u);
  };
  let m;
  // full size 1280
  const reFull =
    /(?:href|src|data-src)=["'](https?:\/\/cdni\.pornpics\.com\/1280\/[^"'\s?]+\.(?:jpe?g|webp))["']/gi;
  while ((m = reFull.exec(html)) !== null) add(m[1]);
  // any size → upgrade to 1280
  const reAny =
    /https?:\/\/cdni\.pornpics\.com\/(\d+)\/([^\s"'<>]+\.(?:jpe?g|webp))/gi;
  while ((m = reAny.exec(html)) !== null) {
    const u = "https://cdni.pornpics.com/1280/" + m[2];
    add(u);
  }
  return pages.slice(0, PAGES_MAX);
}

function parseBabeSourceList(html, max) {
  const out = [];
  const seen = {};
  const re =
    /href=["'](https?:\/\/(?:www\.)?babesource\.com\/galleries\/([^"'/]+)\.html)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < (max || 40)) {
    const slug = m[2];
    if (seen[slug]) continue;
    seen[slug] = true;
    const win = html.slice(Math.max(0, m.index - 500), m.index + 900);
    let poster = "";
    const im = win.match(
      /(?:src|data-src|href)=["'](https?:\/\/media\.babesource\.com\/galleries\/[^"']+\.(?:jpe?g|webp)[^"']*)["']/i
    );
    if (im) poster = im[1].replace(/\.webp(\?|$)/i, ".jpg$1").split("?")[0];
    out.push({
      id: "bs:" + slug,
      slug: slug,
      url: m[1],
      title: titleFromSlug(slug),
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
  const re =
    /(?:src|data-src|href)=["'](https?:\/\/media\.babesource\.com\/galleries\/[a-f0-9]+\/(?:thumbs\/)?[^"']+\.(?:jpe?g|webp)[^"']*)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null && pages.length < PAGES_MAX) {
    let u = m[1].replace(/\.webp(\?|$)/i, ".jpg$1").split("?")[0];
    const full = u.replace(/\/thumbs\//, "/");
    if (!seen[full]) {
      seen[full] = true;
      pages.push(full);
    }
  }
  return pages;
}

function parsePmateList(html, max) {
  const out = [];
  const seen = {};
  const skip =
    /^(model|models|sort|tag|category|page|wp-|feed|author|random|pornstars|countries|channels|paysites|discounts|games|search|login|register)/i;
  const re =
    /href=["'](https?:\/\/(?:www\.)?pmatehunter\.com\/([a-z0-9][a-z0-9-]{4,})\/?)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < (max || 40)) {
    const slug = m[2];
    if (seen[slug] || skip.test(slug)) continue;
    seen[slug] = true;
    const win = html.slice(Math.max(0, m.index - 200), m.index + 1400);
    let poster = "";
    const im = win.match(
      /(?:src|data-src|srcset)=["'](https?:\/\/cdn\.pmatehunter\.com\/[^"'\s]+\.(?:jpe?g|webp)[^"']*)["']/i
    );
    if (im) {
      poster = im[1].split(/\s+/)[0].replace(/_w\d+\./, "_w800.");
    }
    out.push({
      id: "pm:" + slug,
      slug: slug,
      url: m[1].replace(/\/$/, "") + "/",
      title: titleFromSlug(slug),
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
  let m;
  const re =
    /(https?:\/\/cdn\.pmatehunter\.com\/content\/[^"'\s,]+?\.(?:jpe?g|webp))/gi;
  while ((m = re.exec(html)) !== null && pages.length < PAGES_MAX) {
    let u = m[1].split(/\s+/)[0].split("?")[0];
    u = u.replace(/_w\d+\./, "_w800.").replace(/_masonry_\d+\./, "_masonry_1200.");
    if (!seen[u]) {
      seen[u] = true;
      pages.push(u);
    }
  }
  return pages;
}

function parsePoringaList(html, max) {
  const out = [];
  const seen = {};
  let m;
  // /posts/categoria/ID/Titulo.html  o absolutas
  const re =
    /href=["']((?:https?:\/\/(?:www\.)?poringa\.net)?\/posts\/([a-z0-9-]+)\/(\d+)\/([^"'?#]+))["']/gi;
  while ((m = re.exec(html)) !== null && out.length < (max || 40)) {
    const id = m[3];
    if (seen[id]) continue;
    seen[id] = true;
    let path = m[1];
    if (path.indexOf("http") !== 0) path = "https://www.poringa.net" + path;
    const slug = id + "-" + String(m[4] || "").replace(/\.html$/i, "");
    const win = html.slice(Math.max(0, m.index - 150), m.index + 1600);
    let poster = "";
    const im = win.match(
      /(?:src|data-src)=["']((?:https?:)?\/\/s\d*\.poringa\.net\/[^"']+\.(?:jpe?g|webp|png|gif)[^"']*)["']/i
    );
    if (im) {
      poster = im[1];
      if (poster.indexOf("//") === 0) poster = "https:" + poster;
    }
    let title = decode(String(m[4] || "").replace(/\.html$/i, "").replace(/-/g, " "));
    const t = win.match(/<(?:h[123]|span|div)[^>]*class=["'][^"']*title[^"']*["'][^>]*>([^<]{3,120})</i);
    if (t) title = decode(t[1]);
    out.push({
      id: "po:" + id,
      slug: slug,
      url: path,
      title: title || slug,
      poster: poster,
      siteId: "po",
      adult: true,
    });
  }
  return out;
}

function parsePoringaPages(html) {
  const pages = [];
  const seen = {};
  const re =
    /(?:src|data-src|href)=["'](https?:\/\/s\d*\.poringa\.net\/[^"']+\.(?:jpe?g|webp|png|gif)[^"']*)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null && pages.length < PAGES_MAX) {
    const u = m[1].split("?")[0];
    if (seen[u] || /avatar|icon|logo|emoji|smiley|badge/i.test(u)) continue;
    seen[u] = true;
    pages.push(u);
  }
  return pages;
}

// ─── data ──────────────────────────────────────────────────────────────
async function fetchCards(site, secOrPath, page, q) {
  let path = site.homePath || "/";
  if (q && site.searchPath) path = site.searchPath(q);
  else if (typeof secOrPath === "string") path = secOrPath;
  else if (secOrPath && secOrPath.path) path = secOrPath.path;

  const p = parseInt(page, 10) || 1;
  if (p > 1) {
    if (site.id === "pp") path = path.replace(/\/?$/, "/") + (path.indexOf("?") >= 0 ? "&" : "?") + "page=" + p;
    else if (site.id === "bs") path = path.replace(/\/?$/, "/") + "page/" + p + "/";
    else if (site.id === "pm") path = path + (path.indexOf("?") >= 0 ? "&" : "?") + "paged=" + p;
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

// ─── fav / hist ────────────────────────────────────────────────────────
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

// ─── UI (API real Kino / Lectura+18) ───────────────────────────────────
const CARDINFO = {};
function rememberCard(it) {
  try {
    if (!it) return;
    const id = String(it.id || ((it.siteId || "") + ":" + (it.slug || "")));
    if (!id || id === ":") return;
    const prev = CARDINFO[id] || {};
    CARDINFO[id] = {
      title: it.title || prev.title || "",
      poster: it.poster || prev.poster || "",
      s: it.siteId || prev.s || "",
      u: it.url || prev.u || "",
      slug: it.slug || prev.slug || "",
    };
    const ks = Object.keys(CARDINFO);
    if (ks.length > 400) delete CARDINFO[ks[0]];
  } catch (e) {}
}

function posterCard(it, prefix) {
  rememberCard(it);
  const id = String(it.id || (it.siteId + ":" + it.slug));
  const keySafe = id.replace(/[^a-z0-9:_-]/gi, "-");
  return {
    type: "Card",
    key: (prefix || "c") + keySafe,
    flush: true,
    onTap: { event: "openDetail", arg: id },
    children: [
      {
        type: "Image",
        url: it.poster || "",
        aspect: "2:3",
        width: 120,
        alt: it.title || "",
        fallback: {
          type: "Column",
          padding: 16,
          crossAxisAlignment: "center",
          children: [{ type: "Icon", name: "image", color: "muted" }],
        },
      },
      {
        type: "Text",
        text: it.title || it.slug || "",
        textEn: it.title || it.slug || "",
        style: "caption",
        padding: 8,
      },
    ],
  };
}

let skelSeq = 0;
function skelCard() {
  return {
    type: "Card",
    key: "sk" + skelSeq++,
    flush: true,
    children: [
      { type: "Skeleton", shape: "block", height: 180 },
      { type: "Skeleton", shape: "line", padding: 8 },
    ],
  };
}
function skelGrid(n) {
  const cards = [];
  for (let i = 0; i < (n || 12); i++) cards.push(skelCard());
  return {
    type: "ListView",
    key: "skel",
    columns: { compact: 3, medium: 4, expanded: 6 },
    items: cards,
  };
}

function titleGridOf(items, emptyNode) {
  if (!items || !items.length) {
    return (
      emptyNode || {
        type: "emptyState",
        icon: "image",
        title: "Sin resultados",
        titleEn: "No results",
      }
    );
  }
  return {
    type: "ListView",
    key: "grid",
    columns: { compact: 3, medium: 4, expanded: 6 },
    items: items.map((it, i) => posterCard(it, "g" + i + "-")),
  };
}

function chipsRow(state) {
  return {
    type: "SingleChildScrollView",
    key: "fuenteScroll",
    direction: "horizontal",
    padding: 8,
    children: [
      {
        type: "Chips",
        key: "fuente",
        options: SITES.map((s) => ({ value: s.id, label: s.name, labelEn: s.name })),
        value: siteDe(state).id,
        onChanged: { event: "fuenteSel" },
      },
    ],
  };
}

function filaError(mensaje, evento) {
  return {
    type: "Card",
    key: "err-" + evento + "-" + skelSeq++,
    padding: 12,
    gap: 8,
    children: [
      {
        type: "Row",
        gap: 8,
        crossAxisAlignment: "center",
        children: [
          { type: "Icon", name: "wifi_off", color: "muted" },
          {
            type: "Text",
            text: mensaje,
            textEn: mensaje,
            color: "muted",
            style: "caption",
            flex: 1,
          },
          {
            type: "TextButton",
            key: "retry-" + evento,
            labelText: "Reintentar",
            labelTextEn: "Retry",
            onPressed: { event: evento },
          },
        ],
      },
    ],
  };
}

function railSection(state, sec) {
  const cats = state.cats || {};
  const cat = cats[sec.key] || null;
  if (!cat) {
    const sk = [];
    for (let i = 0; i < 6; i++) {
      sk.push({
        type: "Card",
        key: sec.key + "sk" + i,
        flush: true,
        children: [{ type: "Skeleton", shape: "block", width: 120, height: 180 }],
      });
    }
    return [
      {
        type: "Text",
        text: sec.label,
        textEn: sec.labelEn || sec.label,
        style: "h3",
        padding: 16,
      },
      {
        type: "SingleChildScrollView",
        key: sec.key + "skr",
        direction: "horizontal",
        padding: 16,
        children: [{ type: "Row", gap: 8, children: sk }],
      },
    ];
  }
  const items = Array.isArray(cat.items) ? cat.items : [];
  if (cat.error && !items.length) {
    return [
      {
        type: "Text",
        text: sec.label,
        textEn: sec.labelEn || sec.label,
        style: "h3",
        padding: 16,
      },
      filaError("No se pudo cargar esta sección.", "reintentarSeccion"),
    ];
  }
  if (!items.length) return [];
  const cards = items.slice(0, 18).map((it, i) => posterCard(it, sec.key + i + "-"));
  return [
    {
      type: "Text",
      text: sec.label,
      textEn: sec.labelEn || sec.label,
      style: "h3",
      padding: 16,
    },
    {
      type: "SingleChildScrollView",
      key: "r-" + sec.key,
      direction: "horizontal",
      padding: 16,
      children: [{ type: "Row", gap: 8, children: cards }],
    },
  ];
}

function tabBody(state) {
  const tab = state.tab || "inicio";
  if (tab === "favoritos") {
    const favs = loadFavs();
    return {
      type: "Column",
      children: [
        chipsRow(state),
        favs.length
          ? titleGridOf(favs)
          : {
              type: "emptyState",
              icon: "heart",
              title: "Marca galerías con el corazón para verlas aquí.",
              titleEn: "Mark galleries with the heart to see them here.",
            },
      ],
    };
  }
  if (tab === "historial") {
    const hist = loadHist();
    return {
      type: "Column",
      children: [
        chipsRow(state),
        hist.length
          ? titleGridOf(hist)
          : {
              type: "emptyState",
              icon: "schedule",
              title: "Todavía no has visto nada.",
              titleEn: "You have not viewed anything yet.",
            },
      ],
    };
  }
  if (tab === "biblioteca") {
    if (state.libError) {
      return {
        type: "Column",
        children: [
          chipsRow(state),
          filaError("No se pudo cargar la biblioteca.", "reintentarLib"),
        ],
      };
    }
    const items = Array.isArray(state.libItems) ? state.libItems : null;
    return {
      type: "Column",
      children: [
        chipsRow(state),
        items ? titleGridOf(items) : skelGrid(12),
      ],
    };
  }
  // inicio
  const site = siteDe(state);
  const secciones = [];
  for (const sec of site.sections) {
    const nodes = railSection(state, sec);
    for (let i = 0; i < nodes.length; i++) secciones.push(nodes[i]);
  }
  const searchBar = {
    type: "Form",
    key: "homeSearch",
    onSubmitted: "searchGo",
    gap: 8,
    padding: 12,
    children: [
      {
        type: "TextField",
        key: "q",
        kind: "search",
        labelText: "Buscar álbum",
        labelTextEn: "Search album",
        hintText: "P. ej. mia khalifa",
        hintEn: "e.g. mia khalifa",
        required: true,
      },
      {
        type: "ElevatedButton",
        icon: "search",
        labelText: "Buscar",
        labelTextEn: "Search",
        submit: true,
      },
    ],
  };
  return {
    type: "SingleChildScrollView",
    key: "homeScroll",
    children: [
      {
        type: "Column",
        children: [searchBar, chipsRow(state)].concat(secciones),
      },
    ],
  };
}

function loadingTree(msg) {
  return {
    type: "Column",
    padding: 32,
    gap: 12,
    crossAxisAlignment: "center",
    children: [
      { type: "CircularProgressIndicator" },
      {
        type: "Text",
        text: msg || "Cargando…",
        textEn: "Loading…",
        color: "muted",
      },
    ],
  };
}

function detailLoadingTree(d) {
  const info = (d && d.id && CARDINFO[d.id]) || {};
  const title = (d && d.meta && d.meta.title) || info.title || "Cargando…";
  const poster = (d && d.meta && d.meta.poster) || info.poster || "";
  return {
    type: "Scaffold",
    every: { ms: 600, event: "cargarDetail" },
    appBar: {
      title: title,
      leading: {
        type: "IconButton",
        key: "backHome",
        icon: "arrow_back",
        labelText: "Atrás",
        labelTextEn: "Back",
        onPressed: { event: "popBack" },
      },
      actions: [],
    },
    body: {
      type: "SingleChildScrollView",
      key: "detailLoading",
      children: [
        {
          type: "Column",
          children: [
            {
              type: "Row",
              gap: 16,
              padding: 16,
              crossAxisAlignment: "start",
              children: [
                poster
                  ? {
                      type: "Image",
                      url: poster,
                      width: { compact: 120, expanded: 160 },
                      aspect: "2:3",
                      alt: title,
                      fallback: { type: "Skeleton", shape: "block" },
                    }
                  : { type: "Skeleton", shape: "block", width: 120, height: 180 },
                {
                  type: "Column",
                  gap: 8,
                  flex: 1,
                  children: [
                    { type: "Skeleton", shape: "line" },
                    { type: "Skeleton", shape: "line" },
                    { type: "Skeleton", shape: "line" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}


function pagesDisponible() {
  try {
    return (
      typeof kino === "object" &&
      kino !== null &&
      typeof kino.screen === "object" &&
      kino.screen !== null &&
      Array.isArray(kino.screen.widgets) &&
      kino.screen.widgets.indexOf("pages") >= 0
    );
  } catch (e) {
    return false;
  }
}

function searchTree(state) {
  const q = typeof state.resultsQ === "string" ? state.resultsQ : "";
  const results = Array.isArray(state.results) ? state.results : null;
  return {
    type: "Scaffold",
    appBar: {
      title: "Buscar álbum",
      titleEn: "Search album",
      leading: {
        type: "IconButton",
        key: "backHome",
        icon: "arrow_back",
        labelText: "Atrás",
        labelTextEn: "Back",
        onPressed: { event: "popBack" },
      },
      actions: [],
    },
    body: {
      type: "SingleChildScrollView",
      key: "searchBody",
      children: [
        {
          type: "Column",
          children: [
            {
              type: "Form",
              key: "search",
              onSubmitted: "search",
              gap: 8,
              padding: 16,
              children: [
                {
                  type: "TextField",
                  key: "q",
                  kind: "search",
                  value: q,
                  labelText: "Nombre",
                  labelTextEn: "Name",
                  hintText: "P. ej. mia khalifa",
                  hintEn: "e.g. mia khalifa",
                  required: true,
                },
                {
                  type: "ElevatedButton",
                  icon: "search",
                  labelText: "Buscar",
                  labelTextEn: "Search",
                  submit: true,
                },
              ],
            },
            chipsRow(state),
            state.searchError
              ? filaError("No se pudo buscar. Comprueba tu conexión.", "retrySearch")
              : results
              ? results.length
                ? titleGridOf(results)
                : {
                    type: "emptyState",
                    icon: "search",
                    title: "Sin resultados para «" + q + "».",
                    titleEn: "No results.",
                  }
              : {
                  type: "Text",
                  text: "Escribe un nombre y pulsa Buscar.",
                  textEn: "Type a name and press Search.",
                  color: "muted",
                  padding: 16,
                },
          ].filter(Boolean),
        },
      ],
    },
  };
}

function readerTree(state) {
  const r = state.reader || {};
  const pages = r.imgs || (state.detail && state.detail.pages) || [];
  const title = r.title || (state.detail && state.detail.meta && state.detail.meta.title) || "Álbum";

  if (!pages.length) {
    return {
      type: "Scaffold",
      appBar: {
        title: title,
        leading: {
          type: "IconButton",
          key: "backDet",
          icon: "arrow_back",
          onPressed: { event: "popBack" },
        },
      },
      body: {
        type: "emptyState",
        icon: "image",
        title: "No hay fotos en este álbum",
        titleEn: "No photos in this album",
      },
    };
  }

  if (pagesDisponible() && pages.length >= 2 && pages.length <= 250) {
    return {
      type: "Scaffold",
      appBar: {
        title: title + " (" + pages.length + ")",
        leading: {
          type: "IconButton",
          key: "backDet",
          icon: "arrow_back",
          onPressed: { event: "popBack" },
        },
      },
      body: {
        type: "pages",
        key: "reader",
        items: pages.map((u, i) => ({
          type: "Image",
          key: "p" + i,
          url: typeof u === "string" ? u : u.url,
          fill: true,
          fit: "width",
          aspect: "2:3",
          alt: "Foto " + (i + 1),
        })),
      },
    };
  }

  const kids = pages.map((u, i) => ({
    type: "Image",
    key: "p" + i,
    url: typeof u === "string" ? u : u.url,
    fill: true,
    fit: "width",
    aspect: "2:3",
    alt: "Foto " + (i + 1),
  }));
  kids.push({
    type: "Column",
    padding: 24,
    gap: 8,
    children: [
      {
        type: "Text",
        text: "Fin del álbum · " + pages.length + " fotos",
        textEn: "End of album · " + pages.length + " photos",
        style: "caption",
        color: "muted",
      },
      {
        type: "ElevatedButton",
        key: "finBack",
        icon: "arrow_back",
        labelText: "Volver",
        labelTextEn: "Back",
        onPressed: { event: "popBack" },
      },
    ],
  });
  return {
    type: "Scaffold",
    appBar: {
      title: title + " (" + pages.length + ")",
      leading: {
        type: "IconButton",
        key: "backDet",
        icon: "arrow_back",
        onPressed: { event: "popBack" },
      },
    },
    body: {
      type: "ListView",
      key: "tira",
      items: kids,
    },
  };
}

function detailTree(state) {
  const d = state.detail;
  if (!d) return detailLoadingTree({});
  if (d.loading) return detailLoadingTree(d);
  const pages = d.pages || [];
  const fav = isFav(d.id);
  const title = (d.meta && d.meta.title) || d.slug || "";
  const poster = (d.meta && d.meta.poster) || "";
  return {
    type: "Scaffold",
    appBar: {
      title: title,
      leading: {
        type: "IconButton",
        key: "backHome",
        icon: "arrow_back",
        labelText: "Atrás",
        labelTextEn: "Back",
        onPressed: { event: "popBack" },
      },
      actions: [],
    },
    body: {
      type: "SingleChildScrollView",
      key: "detailBody",
      children: [
        {
          type: "Row",
          gap: 16,
          padding: 16,
          crossAxisAlignment: "start",
          stackOnNarrow: true,
          children: [
            poster
              ? {
                  type: "Image",
                  url: poster,
                  width: { compact: 120, expanded: 160 },
                  aspect: "2:3",
                  alt: title,
                  fallback: { type: "Skeleton", shape: "block" },
                }
              : {
                  type: "Column",
                  padding: 16,
                  children: [{ type: "Icon", name: "image", color: "muted" }],
                },
            {
              type: "Column",
              gap: 6,
              flex: 2,
              crossAxisAlignment: "start",
              children: [
                { type: "Text", text: title, style: "h2" },
                { type: "Badge", key: "adult", text: "18+" },
                {
                  type: "Text",
                  text:
                    (pages.length || 0) +
                    " fotos" +
                    (d.capped ? " (máx. " + PAGES_MAX + ")" : ""),
                  textEn: (pages.length || 0) + " photos",
                  color: "muted",
                  style: "caption",
                },
                {
                  type: "Row",
                  key: "filaLeer",
                  gap: 8,
                  children: [
                    {
                      type: "ElevatedButton",
                      key: "leer",
                      icon: "photo_library",
                      labelText: pages.length ? "Ver álbum completo" : "Sin fotos",
                      labelTextEn: pages.length ? "View full album" : "No photos",
                      flex: 1,
                      onPressed: pages.length
                        ? { event: "openRead" }
                        : { event: "noop" },
                    },
                    {
                      type: "ElevatedButton",
                      key: "fav",
                      icon: fav ? "favorite" : "favorite_border",
                      labelText: fav ? "Quitar" : "Favorito",
                      labelTextEn: fav ? "Remove" : "Favorite",
                      onPressed: { event: "toggleFav" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

// ─── exports ───────────────────────────────────────────────────────────
let rootEnCarga = false;
let detailEnCarga = null;
let navSeq = 0;

export async function screen({ state, route }) {
  const r = route || { name: "home" };
  try {
    if (r.name === "detail") {
      if (!state.detail || state.detail.loading) {
        return detailLoadingTree(state.detail || {});
      }
      return detailTree(state);
    }
    if (r.name === "read") return readerTree(state);
    if (r.name === "search") return searchTree(state);
  } catch (e) {
    return {
      type: "Scaffold",
      appBar: { title: "Gallery Hot" },
      body: filaError(
        "No se pudo cargar (" + ((e && e.code) || "error") + ").",
        "retry"
      ),
    };
  }
  // Home: barra de búsqueda visible + secciones
  return {
    type: "Scaffold",
    every: { ms: 1200, event: "cargarRoot" },
    appBar: {
      title: "Gallery Hot",
      actions: [
        {
          type: "IconButton",
          key: "goSearch",
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
      if (!state.fuente) return { state: { fuente: prefFuenteId() } };
      return null;
    }
    if (name === "fuenteSel" || name === "fuente") {
      const raw = ev.value != null ? ev.value : ev.arg;
      const id = String(
        typeof raw === "string" ? raw : (raw && (raw.fuente || raw.value)) || ""
      );
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
          results: null,
          resultsQ: "",
        },
        toast: "Fuente: " + siteOfId(id).name,
      };
    }
    if (name === "tab") {
      return { state: { tab: ev.value } };
    }
    if (name === "goSearch") {
      return {
        route: { push: "search" },
        state: {
          results: null,
          searchItems: null,
          searchLoading: false,
          searchError: false,
          resultsQ: "",
        },
      };
    }
    if (name === "popBack" || name === "pop") {
      return { route: { pop: true } };
    }

    // Buscar desde home → empuja pantalla search con resultados
    if (name === "searchGo" || name === "search") {
      const q = String((ev.value && ev.value.q) || (ev.value && typeof ev.value === "string" ? ev.value : "") || "").trim();
      if (!q) return { toast: "Escribe un nombre para buscar." };
      const site = siteDe(state);
      try {
        const results = await fetchCards(site, null, 1, q);
        if (name === "searchGo") {
          return {
            route: { push: "search" },
            state: {
              results: results,
              resultsQ: q,
              searchError: false,
              searchLoading: false,
            },
            toast: results.length
              ? results.length + " álbumes"
              : "Sin resultados para «" + q + "»",
          };
        }
        return {
          state: {
            results: results,
            resultsQ: q,
            searchError: false,
            searchLoading: false,
          },
          toast: results.length
            ? results.length + " álbumes"
            : "Sin resultados para «" + q + "»",
        };
      } catch (e) {
        kino.log("search", e && e.message);
        if (name === "searchGo") {
          return {
            route: { push: "search" },
            state: { searchError: true, resultsQ: q, results: [] },
            toast: "Error de conexión. Inténtalo de nuevo.",
          };
        }
        return {
          state: { searchError: true, resultsQ: q },
          toast: "Error de conexión. Inténtalo de nuevo.",
        };
      }
    }
    if (name === "retrySearch")    if (name === "retrySearch") {
      return {
        state: { searchError: false, results: null },
      };
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
          kino.log("lib", e && e.message);
          return { state: { libError: true } };
        } finally {
          rootEnCarga = false;
        }
      }
      if (tab === "inicio") {
        const cats = state.cats || {};
        for (let i = 0; i < site.sections.length; i++) {
          const sec = site.sections[i];
          if (!cats[sec.key] || cats[sec.key].error) {
            rootEnCarga = true;
            try {
              const items = await fetchCards(site, sec, 1);
              const next = Object.assign({}, cats);
              next[sec.key] = { items: items, loading: false, error: false };
              return { state: { cats: next } };
            } catch (e) {
              kino.log("sec", sec.key + " " + (e && e.message));
              const next = Object.assign({}, cats);
              next[sec.key] = { items: [], loading: false, error: true };
              return { state: { cats: next } };
            } finally {
              rootEnCarga = false;
            }
          }
        }
      }
      return null;
    }
    if (name === "reintentarLib" || name === "retry") {
      return { state: { libItems: null, libError: false, cats: {} } };
    }
    if (name === "reintentarSeccion") {
      return { state: { cats: {} } };
    }

    // Tocar álbum → cargar TODAS las fotos y abrir el lector
    if (name === "openDetail") {
      // arg = id string (pp:slug) — los objetos no viajan bien en onTap
      const id = String(ev.arg || "").trim();
      const info = CARDINFO[id] || {};
      let siteId = info.s || siteDe(state).id;
      let slug = info.slug || "";
      let url = info.u || "";
      let title = info.title || "";
      let poster = info.poster || "";
      if (!slug && id.indexOf(":") > 0) {
        const parts = id.split(":");
        siteId = parts[0];
        slug = parts.slice(1).join(":");
      }
      const site = siteOfId(siteId) || siteDe(state);
      if (!url && slug) {
        if (site.id === "pp") url = "https://www.pornpics.com/es/galleries/" + slug + "/";
        else if (site.id === "bs") url = site.base + "/galleries/" + slug + ".html";
        else if (site.id === "pm") url = site.base + "/" + slug + "/";
        else if (site.id === "po") url = site.base + "/posts/" + slug;
      }
      if (!url) {
        return { toast: "Álbum no encontrado. Vuelve a cargar el listado." };
      }
      const card = {
        id: id || site.id + ":" + slug,
        slug: slug,
        url: url,
        title: title || slug,
        poster: poster,
        siteId: site.id,
        adult: true,
      };
      pushHist(card);
      rememberCard(card);
      // feedback inmediato
      try {
        const pages = await fetchPages(site, card);
        if (!pages.length) {
          return { toast: "No se encontraron fotos en este álbum." };
        }
        const reader = {
          id: card.id,
          slug: card.slug,
          title: card.title,
          poster: card.poster,
          url: card.url,
          siteId: site.id,
          imgs: pages,
          tk: ++navSeq,
        };
        return {
          state: {
            reader: reader,
            detail: {
              id: card.id,
              slug: card.slug,
              url: card.url,
              siteId: site.id,
              loading: false,
              meta: { title: card.title, poster: card.poster },
              pages: pages,
              capped: pages.length >= PAGES_MAX,
            },
          },
          route: { push: "read" },
          toast: pages.length + " fotos",
        };
      } catch (e) {
        kino.log("openDetail", e && e.message);
        return {
          toast: "No se pudo abrir el álbum: " + ((e && e.message) || "error"),
        };
      }
    }

    if (name === "cargarDetail")    if (name === "cargarDetail") {
      const card = state.detail;
      if (!card || !card.loading || !card.url) return null;
      if (detailEnCarga === card.id) return null;
      detailEnCarga = card.id;
      try {
        const site = siteOfId(card.siteId);
        const pages = await fetchPages(site, card);
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
              capped: pages.length >= PAGES_MAX,
            },
          },
        };
      } catch (e) {
        kino.log("detail", e && e.message);
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
      const d = state.detail;
      if (!d) return null;
      let pages = d.pages || [];
      if (!pages.length) {
        try {
          const site = siteOfId(d.siteId);
          pages = await fetchPages(site, d);
        } catch (e) {
          return { toast: "No se pudieron cargar las fotos." };
        }
      }
      if (!pages.length) return { toast: "No hay fotos en este álbum." };
      const reader = {
        id: d.id,
        slug: d.slug,
        title: (d.meta && d.meta.title) || d.slug,
        poster: d.meta && d.meta.poster,
        url: d.url,
        siteId: d.siteId,
        imgs: pages,
        tk: ++navSeq,
      };
      return { state: { reader: reader }, route: { push: "read" } };
    }

    if (name === "toggleFav") {
      const d = state.detail || state.reader;
      if (!d) return null;
      const card = {
        id: d.id,
        slug: d.slug,
        title: (d.meta && d.meta.title) || d.title || d.slug,
        poster: (d.meta && d.meta.poster) || d.poster,
        url: d.url,
        siteId: d.siteId,
      };
      toggleFav(card);
      return {
        toast: isFav(d.id) ? "Añadido a favoritos" : "Quitado de favoritos",
      };
    }
    if (name === "noop") return null;
  } catch (e) {
    kino.log("event", name + " " + ((e && e.message) || e));
    return { toast: "Error: " + ((e && e.message) || "desconocido") };
  }
  return null;
}
