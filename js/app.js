(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const euro = (n) => "€\u00a0" + Number(n).toLocaleString("nl-NL");
  const t = () => window.I18N[state.lang];

  let lastDeckWheel = 0;
  let deckSwiping = false;
  let lastActiveTrigger = null;

  const state = {
    lang: localStorage.getItem("vouw-lang") || "nl",
    bikes: [],
    route: "home",
    ref: null,
    q: "",
    brand: "",
    cond: "",
    power: "",
    sort: "feat",
    view: "grid",
    cfIndex: 0,
    deckIndex: 0,
    compare: [],
    favorites: JSON.parse(localStorage.getItem("vouw-favorites") || "[]"),
    onlyFavorites: false,
    flipped: false,
  };

  const bidStore = {
    key: "vouwloods-bids-v1",
    load() {
      try { return JSON.parse(localStorage.getItem(this.key) || "{}"); }
      catch { return {}; }
    },
    save(data) { localStorage.setItem(this.key, JSON.stringify(data)); },
    merge(bikes, sourceData) {
      const stored = sourceData || this.load();
      bikes.forEach((b) => {
        const s = stored[b.ref];
        if (!s) return;
        if (s.currentBid > b.currentBid) {
          b.currentBid = s.currentBid;
          b.bidCount = Math.max(b.bidCount, s.bidCount || 0);
        }
        if (s.history && s.history.length) {
          b.localHistory = s.history;
        }
      });
    },
    getEndpoint(ref) {
      const cfg = window.VOUW && window.VOUW.bidSync;
      if (!cfg || !cfg.enabled || !cfg.endpoint) return null;
      const base = cfg.endpoint.replace(/\/+$/, "");
      if (cfg.provider === "firebase") {
        return ref ? `${base}/${encodeURIComponent(ref)}.json` : `${base}.json`;
      }
      return `${base}?ref=${encodeURIComponent(ref || "")}`;
    },
    async fetchRemote() {
      const url = this.getEndpoint();
      if (!url) return;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!data || typeof data !== "object") return;
        this.merge(state.bikes, data);
        const activeInput = document.activeElement;
        const isBiddingForm = activeInput && activeInput.closest && activeInput.closest("#bid-form");
        if (!isBiddingForm) {
          render();
        }
      } catch (e) {
        console.warn("Vouwloods bid fetch failed, using local storage:", e.message);
      }
    },
    async pushRemote(ref, bidRecord) {
      const url = this.getEndpoint(ref);
      if (!url) return;
      try {
        const cfg = window.VOUW.bidSync;
        const method = cfg.provider === "firebase" ? "PATCH" : "POST";
        const body = JSON.stringify({
          currentBid: bidRecord.currentBid,
          bidCount: bidRecord.bidCount,
          history: bidRecord.history,
          updatedAt: Date.now(),
        });
        await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch (e) {
        console.warn("Vouwloods remote bid push failed:", e.message);
      }
    },
    add(ref, amount, name) {
      const data = this.load();
      const cur = data[ref] || { currentBid: 0, bidCount: 0, history: [] };
      cur.currentBid = Math.max(cur.currentBid, amount);
      cur.bidCount = (cur.bidCount || 0) + 1;
      cur.history = cur.history || [];
      cur.history.unshift({ amount, name: name || (state.lang === "nl" ? "Anoniem" : "Anonymous"), time: Date.now() });
      if (cur.history.length > 20) cur.history.pop();
      data[ref] = cur;
      this.save(data);
      this.pushRemote(ref, cur);
      return cur;
    },
  };

  const interestStore = {
    key: "vouwloods-interest-v1",
    get(ref) {
      try {
        const store = JSON.parse(localStorage.getItem(this.key) || "{}");
        const entry = store[ref] || { saves: 0, views: 0 };
        return {
          saves: entry.saves || 0,
          views: entry.views || 0,
        };
      } catch {
        return { saves: 0, views: 0 };
      }
    },
    recordView(ref) {
      if (!ref) return;
      try {
        const store = JSON.parse(localStorage.getItem(this.key) || "{}");
        if (!store[ref]) store[ref] = { saves: 0, views: 0 };
        store[ref].views = (store[ref].views || 0) + 1;
        localStorage.setItem(this.key, JSON.stringify(store));
        this.syncRemote(ref, store[ref]);
      } catch {}
    },
    toggleSave(ref, isSaved) {
      if (!ref) return;
      try {
        const store = JSON.parse(localStorage.getItem(this.key) || "{}");
        if (!store[ref]) store[ref] = { saves: 0, views: 0 };
        store[ref].saves = Math.max(0, (store[ref].saves || 0) + (isSaved ? 1 : -1));
        localStorage.setItem(this.key, JSON.stringify(store));
        this.syncRemote(ref, store[ref]);
      } catch {}
    },
    async syncRemote(ref, entry) {
      const cfg = window.VOUW && window.VOUW.bidSync;
      if (!cfg || !cfg.enabled || !cfg.endpoint || cfg.provider !== "firebase") return;
      try {
        const base = cfg.endpoint.replace(/\/+$/, "");
        const url = `${base}/interest/${encodeURIComponent(ref)}.json`;
        await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        });
      } catch {}
    },
  };

  function trackEvent(name, data = {}) {
    try {
      if (typeof window.va === "function") {
        window.va("event", { name, data });
      }
      if (typeof window.gtag === "function") {
        window.gtag("event", name, data);
      }
    } catch {}
  }

  function heartSvg(active) {
    return active
      ? `<svg viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="1.8"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
  }

  function waLink(bike, extra = "") {
    const num = (window.VOUW.whatsapp || "").replace(/[^\d]/g, "");
    const pairNote = (bike.qty || 1) > 1 ? (state.lang === "nl" ? ", 2 stuks" : ", pair") : "";
    let msg = "";
    if (extra) {
      msg = state.lang === "nl"
        ? `Hoi, ik heb interesse in de ${bike.brand} ${bike.model} (${bike.ref}${pairNote}) via Vouwloods. ${extra} Wanneer kan ik eventueel langskomen voor een bezichtiging en proefrit in Delft?`
        : `Hi, I'm interested in the ${bike.brand} ${bike.model} (${bike.ref}${pairNote}) via Vouwloods. ${extra} Can I arrange a viewing and test ride in Delft?`;
    } else {
      msg = state.lang === "nl"
        ? `Hoi, ik heb interesse in de ${bike.brand} ${bike.model} (${bike.ref}${pairNote}) via Vouwloods (vraagprijs ${euro(bike.price)}). Is deze nog beschikbaar en kan ik langskomen voor een proefrit in Delft?`
        : `Hi, I'm interested in the ${bike.brand} ${bike.model} (${bike.ref}${pairNote}) via Vouwloods (asking ${euro(bike.price)}). Is this still available and can I arrange a test ride in Delft?`;
    }
    return `https://wa.me/${num}?text=${encodeURIComponent(msg.trim())}`;
  }

  function formatPhone(num) {
    let clean = String(num || "").replace(/[^\d]/g, "");
    if (clean.startsWith("06") && clean.length === 10) {
      clean = "316" + clean.slice(2);
    }
    if (clean.startsWith("316") && clean.length === 11) {
      return `+31 6 ${clean.slice(3, 5)} ${clean.slice(5, 7)} ${clean.slice(7, 9)} ${clean.slice(9)}`;
    }
    if (clean.startsWith("31") && clean.length > 9) {
      return `+31 ${clean.slice(2)}`;
    }
    return num ? `+${clean}` : "";
  }

  function emailLink(bike, extra = "") {
    const to = window.VOUW.email || "";
    const subject = state.lang === "nl"
      ? `Interesse in ${bike.brand} ${bike.model} (${bike.ref})`
      : `Inquiry: ${bike.brand} ${bike.model} (${bike.ref})`;
    const pairNote = (bike.qty || 1) > 1 ? (state.lang === "nl" ? ", 2 stuks" : ", pair") : "";
    const body = state.lang === "nl"
      ? `Hallo,\n\nIk heb interesse in de ${bike.brand} ${bike.model} (${bike.ref}${pairNote}) via Vouwloods.\nVraagprijs: ${euro(bike.price)}.\n${extra ? extra + "\n\n" : "\n"}Ik wil graag een afspraak maken voor bezichtiging / proefrit in Delft.\n\nMet vriendelijke groet,`
      : `Hello,\n\nI am interested in the ${bike.brand} ${bike.model} (${bike.ref}${pairNote}) via Vouwloods.\nAsking price: ${euro(bike.price)}.\n${extra ? extra + "\n\n" : "\n"}I would like to arrange a viewing / test ride in Delft.\n\nBest regards,`;
    return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function mpText(bike) {
    const yr = bike.year ? ` (${bike.year})` : "";
    return state.lang === "nl"
      ? `Hoi, ik reageer op Vouwloods ref ${bike.ref} (${bike.brand} ${bike.model}${yr}). Ik wil hem graag komen bekijken en proefrijden in Delft.`
      : `Hi, I'm reaching out regarding Vouwloods ref ${bike.ref} (${bike.brand} ${bike.model}${yr}). I would like to arrange a viewing and test ride in Delft.`;
  }

  function listingText(bike) {
    const L = t();
    const loc = window.VOUW.city;
    const siteUrl = (location.origin && location.origin !== "null" && location.protocol.startsWith("http"))
      ? `${location.origin}${location.pathname.replace(/\/+$/, "")}/#/bike/${bike.ref}`
      : `https://knarayanareddy.github.io/vouwfiets/#/bike/${bike.ref}`;
    const trAcc = window.I18N.accessories || {};
    const inc = (bike.included || []).map((i) => trAcc[i]?.[state.lang] || i).join(", ") || "—";
    if (state.lang === "nl") {
      return `⭐ ${bike.brand} ${bike.model} vouwfiets (${bike.year ? `bouwjaar ${bike.year}` : "ZGAN"}) — ${bike.color.nl}\nRef: ${bike.ref}\nVraagprijs: ${euro(bike.price)} | bieden vanaf ${euro(bike.minBid)}\nStaat: ${L.cond[bike.condition]}\n${bike.gears} versnellingen · ${bike.wheel}" · ${bike.weightKg} kg${bike.electric ? " · elektrisch" : ""}\n\n100% SPITSVRIJ IN DE TREIN:\nDeze vouwfiets reist volgens officiële NS-voorwaarden gratis mee als handbagage, ook tijdens de ochtend- en avondspits!\n\n${bike.notes.nl}\n\nGebreken: ${bike.defects.nl}\nInbegrepen: ${inc}\n\n✅ StopHeling gecheckt (100% eerlijke herkomst)\n✅ Vrijblijvende proefrit in Delft (7 dagen op afspraak)\n✅ Betaling bij afhalen via Tikkie of contant\n\nBekijk alle foto's & de complete voorraad:\n${siteUrl}`;
    }
    return `⭐ ${bike.brand} ${bike.model} folding bike (${bike.year ? `year ${bike.year}` : "like new"}) — ${bike.color.en}\nRef: ${bike.ref}\nAsking: ${euro(bike.price)} | bids from ${euro(bike.minBid)}\nCondition: ${L.cond[bike.condition]}\n${bike.gears} gears · ${bike.wheel}" · ${bike.weightKg} kg${bike.electric ? " · electric" : ""}\n\n100% FREE ON NS TRAINS:\nTravels 100% free as hand luggage on Dutch trains, even during peak rush hours!\n\n${bike.notes.en}\n\nDefects: ${bike.defects.en}\nIncluded: ${inc}\n\n✅ Checked in StopHeling theft registry\n✅ Test ride in Delft by appointment (7 days)\n✅ Payment upon pickup via Tikkie, cash or Revolut\n\nView all photos & full warehouse stock:\n${siteUrl}`;
  }

  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {}
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.left = "-9999px";
    ta.style.fontSize = "16px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (_) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function parseRoute() {
    const h = (location.hash || "#/").replace(/^#/, "");
    const parts = h.split("/").filter(Boolean);
    if (parts[0] === "bike" && parts[1]) {
      state.route = "bike";
      state.ref = parts[1];
    } else if (parts[0] === "how") {
      state.route = "how";
      state.ref = null;
    } else {
      state.route = "home";
      state.ref = null;
    }
  }

  function go(path) {
    location.hash = path;
  }

  function filtered() {
    const L = t();
    let list = state.bikes.slice();
    const q = state.q.trim().toLowerCase();
    if (q) {
      list = list.filter((b) =>
        [b.ref, b.brand, b.model, b.color.nl, b.color.en, b.notes.nl, b.notes.en]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    if (state.brand) list = list.filter((b) => b.brand === state.brand);
    if (state.cond) list = list.filter((b) => b.condition === state.cond);
    if (state.power === "e") list = list.filter((b) => b.electric);
    if (state.power === "pedal") list = list.filter((b) => !b.electric);
    if (state.onlyFavorites) list = list.filter((b) => state.favorites.includes(b.ref));

    const sorts = {
      feat: (a, b) => Number(b.featured) - Number(a.featured) || a.price - b.price,
      "price-asc": (a, b) => a.price - b.price,
      "price-desc": (a, b) => b.price - a.price,
      bids: (a, b) => b.bidCount - a.bidCount,
      year: (a, b) => b.year - a.year,
    };
    list.sort(sorts[state.sort] || sorts.feat);
    return list;
  }

  function brands() {
    return [...new Set(state.bikes.map((b) => b.brand))].sort();
  }

  function img(path) {
    return "images/" + path;
  }

  /* ---------- render ---------- */
  let didBoot = false;
  function render() {
    const apply = () => {
      parseRoute();
      if (typeof window.scrollTo === "function") {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      }
      document.documentElement.lang = state.lang;
      renderChrome();
      if (state.route === "bike") renderProduct();
      else {
        renderHome();
        if (state.route === "how") {
          setTimeout(() => $("#how")?.scrollIntoView({ behavior: "smooth" }), 60);
        }
      }
      renderCompare();
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (didBoot && !reduce && document.startViewTransition) {
      try { document.startViewTransition(apply); return; } catch (_) {}
    }
    didBoot = true;
    apply();
  }

  function renderChrome() {
    const L = t();
    $("#lang-nl").classList.toggle("on", state.lang === "nl");
    $("#lang-en").classList.toggle("on", state.lang === "en");
    $("#lang-nl").setAttribute("aria-pressed", state.lang === "nl");
    $("#lang-en").setAttribute("aria-pressed", state.lang === "en");
    $("#nav-inv").textContent = L.navInventory;
    $("#nav-how").textContent = L.navHow;
    $("#nav-faq").textContent = L.navFaq;
    $("#nav-wa").innerHTML = L.wa;
    $("#nav-wa").href = `https://wa.me/${window.VOUW.whatsapp.replace(/[^\d]/g, "")}`;
    if (state.route !== "bike") {
      document.title = state.lang === "nl"
        ? "Vouwloods · Delft — Vouwfietsen Showroom"
        : "Vouwloods · Delft — Folding Bikes Showroom";
    }
    const banner = $("#demo-banner");
    if (window.VOUW.demoInventory) {
      banner.hidden = false;
      banner.textContent = L.demoBanner;
    } else banner.hidden = true;
  }

  function renderHome() {
    const L = t();
    $("#page-home").hidden = false;
    $("#page-product").hidden = true;

    $("#hero-kicker").textContent = L.heroKicker;
    $("#hero-title").textContent = L.heroTitle;
    $("#hero-lead").textContent = L.heroLead;
    $("#hero-cta").textContent = L.heroCta;
    $("#hero-sec").textContent = L.heroSecondary;
    $("#stage-hint").textContent = L.stageHint;

    const live = state.bikes.filter((b) => b.status === "available");
    const nBikes = live.reduce((s, b) => s + (b.qty || 1), 0);
    const minP = Math.min(...live.map((b) => b.price));
    const bids = live.reduce((s, b) => s + (b.bidCount || 0), 0);
    $("#stat-bikes").innerHTML = `<b>${nBikes}</b><span>${L.statBikes}</span>`;
    $("#stat-from").innerHTML = `<b>${euro(minP)}</b><span>${L.statFrom}</span>`;
    $("#stat-pick").innerHTML = `<b>${window.VOUW.city}</b><span>${L.statPickup}</span>`;
    $("#stat-bids").innerHTML = `<b>${bids}</b><span>${L.statBids}</span>`;

    const trust = [
      [L.trust1t, L.trust1d],
      [L.trust2t, L.trust2d],
      [L.trust3t, L.trust3d],
      [L.trust4t, L.trust4d],
    ];
    $("#trust").innerHTML = trust
      .map(([h, p]) => `<article><h3>${h}</h3><p>${p}</p></article>`)
      .join("");

    renderCoverflow();
    renderFilters();
    renderGrid();
    renderHowFaq();
  }

  function featured() {
    const f = state.bikes.filter((b) => b.featured && b.status === "available");
    return f.length ? f : state.bikes.slice(0, 10);
  }

  function renderCoverflow() {
    const root = $("#coverflow");
    if (!root) return;
    const items = featured();
    root.dataset.n = String(items.length);
    const L = t();
    root.innerHTML = items.map((b) => {
      const src = img(b.studio || b.photos[0]);
      const tag = b.studio ? `<span class="badge pair">${L.atmosphere}</span>` : "";
      const pairText = (b.qty || 1) > 1 ? ` · ${L.pair}` : "";
      return `<a class="cf-card" href="#/bike/${b.ref}">
        <img src="${src}" alt="${b.brand} ${b.model}">
        ${tag}
        <div class="meta"><small>${b.ref}${pairText}</small><strong>${b.brand} ${b.model}</strong>${euro(b.price)}</div>
      </a>`;
    }).join("");
    startCoverflowAuto();
  }

  let cfTimer = null;
  function startCoverflowAuto() {
    clearInterval(cfTimer);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = $("#coverflow");
    if (!el) return;
    cfTimer = setInterval(() => {
      if (state.route !== "home") return;
      if (el.matches(":hover") || el.matches(":focus-within")) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 8) return;
      if (el.scrollLeft >= max - 12) el.scrollTo({ left: 0, behavior: "smooth" });
      else el.scrollBy({ left: 276, behavior: "smooth" });
    }, 3400);
  }

  function renderFilters() {
    const L = t();
    $("#inv-title").textContent = L.navInventory;
    const conds = ["like-new", "excellent", "good", "fair", "project"];
    const favActive = state.onlyFavorites;
    $("#filters").innerHTML = `
      <input id="f-q" value="${escapeAttr(state.q)}" placeholder="${L.searchPh}" aria-label="${L.searchPh}">
      <select id="f-brand" aria-label="${L.allBrands}">
        <option value="">${L.allBrands}</option>
        ${brands().map((b) => `<option ${b === state.brand ? "selected" : ""}>${b}</option>`).join("")}
      </select>
      <select id="f-cond" aria-label="${L.allCond}">
        <option value="">${L.allCond}</option>
        ${conds.map((c) => `<option value="${c}" ${c === state.cond ? "selected" : ""}>${L.cond[c]}</option>`).join("")}
      </select>
      <select id="f-power" aria-label="${L.allPower}">
        <option value="">${L.allPower}</option>
        <option value="e" ${state.power === "e" ? "selected" : ""}>${L.onlyE}</option>
        <option value="pedal" ${state.power === "pedal" ? "selected" : ""}>${L.onlyPedal}</option>
      </select>
      <select id="f-sort" aria-label="${L.sortLabel || "Sorteren"}">
        <option value="feat" ${state.sort === "feat" ? "selected" : ""}>${L.sortFeat}</option>
        <option value="price-asc" ${state.sort === "price-asc" ? "selected" : ""}>${L.sortPriceAsc}</option>
        <option value="price-desc" ${state.sort === "price-desc" ? "selected" : ""}>${L.sortPriceDesc}</option>
        <option value="bids" ${state.sort === "bids" ? "selected" : ""}>${L.sortBids}</option>
        <option value="year" ${state.sort === "year" ? "selected" : ""}>${L.sortYear}</option>
      </select>
      <button id="f-favs" class="btn-fav-filter ${favActive ? "active" : ""}" aria-pressed="${favActive}" title="${favActive ? L.favFilterOn : L.favs}">
        ${heartSvg(favActive)}
        <span>${L.favs} (${state.favorites.length})</span>
      </button>
      <div class="view-toggle" role="group" aria-label="Weergave modus">
        <button data-view="grid" class="${state.view === "grid" ? "on" : ""}" aria-pressed="${state.view === "grid"}">${L.viewGrid}</button>
        <button data-view="deck" class="${state.view === "deck" ? "on" : ""}" aria-pressed="${state.view === "deck"}">${L.viewDeck}</button>
      </div>`;
  }

  function cardHTML(b) {
    const L = t();
    const inC = state.compare.includes(b.ref);
    const isFav = state.favorites.includes(b.ref);
    const interest = interestStore.get(b.ref);
    const highest = b.currentBid || 0;
    const priceDisplay = (b.qty || 1) > 1 && b.unitPrice
      ? `<div class="price">${euro(b.unitPrice)} <small style="font-size:0.55em;font-weight:400;color:var(--muted)">${L.each} · ${euro(b.price)} ${L.together}</small></div>`
      : `<div class="price">${euro(b.price)}</div>`;
    return `<article class="card tilt" data-open="${b.ref}">
      <div class="shot"><img src="${img(b.photos[0])}" alt="${b.brand} ${b.model} (${b.ref})">
        <button class="btn-card-fav ${isFav ? "active" : ""}" data-fav="${b.ref}" aria-label="${isFav ? L.favRemove : L.favAdd}" title="${isFav ? L.favRemove : L.favAdd}">
          ${heartSvg(isFav)}
        </button>
        <span class="badge">${b.ref}</span>
        ${b.electric ? `<span class="badge e">${L.electric}</span>` : ""}
        ${(b.qty || 1) > 1 ? `<span class="badge pair">${L.pair}</span>` : ""}
        ${b.status !== "available" ? `<span class="badge ${b.status === "sold" ? "sold" : "res"}">${L.status[b.status]}</span>` : ""}
      </div>
      <div class="card-body">
        <div class="sp-interest-pill" style="${interest.saves === 0 && interest.views === 0 ? "display:none" : ""}">
          <span>🔥</span> <strong>${interest.saves}</strong> ${L.peopleSavedShort} &middot; ${interest.views} ${L.viewsShort}
        </div>
        <div class="refcode">${b.year ? b.year + " · " : ""}${b.color[state.lang]}</div>
        <h3>${b.brand} ${b.model}</h3>
        <div class="meta-row">
          <span class="pill cond-${b.condition}">${L.cond[b.condition] || b.condition}</span>
          <span class="pill">${b.gears} ${L.gears}</span>
          <span class="pill">${b.wheel}${L.inch}</span>
          <span class="pill">${b.weightKg} ${L.kg}</span>
        </div>
        <div class="price-row">
          ${priceDisplay}
          <div class="bidlet">${highest ? `${L.highest} ${euro(highest)}<br>${b.bidCount} ${L.bids}` : L.noBids}</div>
        </div>
        <div class="card-actions">
          <button class="btn btn-brass" data-open="${b.ref}">${L.view}</button>
          <button class="btn btn-ghost" data-compare="${b.ref}" aria-pressed="${inC}">${inC ? L.compared : L.compare}</button>
        </div>
      </div>
    </article>`;
  }

  function renderGrid() {
    const L = t();
    const list = filtered();
    $("#countline").textContent = `${L.showing} ${list.length} ${L.of} ${state.bikes.length}`;
    const root = $("#grid");
    if (!list.length) {
      root.className = "grid";
      root.innerHTML = `<div class="empty">${L.empty}</div>`;
      return;
    }
    if (state.view === "deck") {
      root.className = "deck-wrapper";
      const total = list.length;
      state.deckIndex = Math.max(0, Math.min(total - 1, state.deckIndex || 0));
      const cur = list[state.deckIndex] || list[0];
      const winW = typeof window !== "undefined" ? window.innerWidth : 1024;
      const stepX = winW < 600 ? 60 : (winW < 980 ? 110 : 155);

      const cardsHtml = list
        .map((b, i) => {
          const off = i - state.deckIndex;
          if (Math.abs(off) > 4) {
            return `<div class="deck-item" data-deck-index="${i}" aria-hidden="true" inert style="display:none">${cardHTML(b)}</div>`;
          }
          const x = off * stepX;
          const z = -Math.abs(off) * 90;
          const rotY = off * -16;
          const scale = off === 0 ? 1 : Math.max(0.74, 1 - Math.abs(off) * 0.07);
          const opacity = off === 0 ? 1 : Math.max(0.2, 1 - Math.abs(off) * 0.2);
          const isCenter = off === 0;
          return `<div class="deck-item ${isCenter ? "active" : "side"}" data-deck-index="${i}" ${isCenter ? 'aria-hidden="false"' : 'aria-hidden="true" inert'} style="transform: translateX(${x}px) translateZ(${z}px) rotateY(${rotY}deg) scale(${scale}); z-index:${30 - Math.abs(off)}; opacity:${opacity};">${cardHTML(b)}</div>`;
        })
        .join("");

      const isSingle = total <= 1;
      root.innerHTML = `
        <div class="deck" id="deck-track" tabindex="0" aria-label="3D Deck Showroom">
          ${cardsHtml}
        </div>
        <div class="deck-toolbar">
          <button class="btn btn-ghost deck-nav" id="deck-prev" aria-label="${L.prev || "Vorige"}" ${isSingle ? "disabled" : ""}>‹ ${L.prev || "Vorige"}</button>
          <div class="deck-status" id="deck-status">
            <strong>${cur.brand} ${cur.model}</strong>
            <span>${state.deckIndex + 1} / ${total} · ${cur.ref}</span>
          </div>
          <button class="btn btn-ghost deck-next" id="deck-next" aria-label="${L.next || "Volgende"}" ${isSingle ? "disabled" : ""}>${L.next || "Volgende"} ›</button>
        </div>
        <p class="deck-tip">${L.deckHint || "Klik op een fiets om te bekijken · Blader met ‹ ›, muiswiel of pijltjestoetsen"}</p>`;

      $("#deck-prev").onclick = (e) => {
        e.stopPropagation();
        if (total <= 1) return;
        state.deckIndex = (state.deckIndex - 1 + total) % total;
        renderGrid();
      };
      $("#deck-next").onclick = (e) => {
        e.stopPropagation();
        if (total <= 1) return;
        state.deckIndex = (state.deckIndex + 1) % total;
        renderGrid();
      };

      bindDeckGestures();
    } else {
      root.className = "grid";
      root.innerHTML = list.map(cardHTML).join("");
    }
    bindTilt();
  }

  function bindDeckGestures() {
    const track = $("#deck-track");
    if (!track || track._gesturesBound) return;
    track._gesturesBound = true;
    let startX = 0;
    let startY = 0;
    let isTracking = false;

    track.addEventListener("pointerdown", (e) => {
      startX = e.clientX;
      startY = e.clientY;
      isTracking = true;
      deckSwiping = false;
      try { track.setPointerCapture(e.pointerId); } catch (_) {}
    }, { passive: true });

    track.addEventListener("pointerup", (e) => {
      if (!isTracking) return;
      isTracking = false;
      try { track.releasePointerCapture(e.pointerId); } catch (_) {}
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        deckSwiping = true;
        setTimeout(() => { deckSwiping = false; }, 120);
        const list = filtered();
        if (list.length <= 1) return;
        if (dx < 0) {
          state.deckIndex = (state.deckIndex + 1) % list.length;
        } else {
          state.deckIndex = (state.deckIndex - 1 + list.length) % list.length;
        }
        renderGrid();
      }
    }, { passive: true });

    track.addEventListener("pointercancel", (e) => {
      isTracking = false;
      try { track.releasePointerCapture(e.pointerId); } catch (_) {}
    }, { passive: true });

    track.addEventListener("wheel", (e) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) > 20) {
        e.preventDefault();
        const now = Date.now();
        if (now - lastDeckWheel > 240) {
          lastDeckWheel = now;
          const list = filtered();
          if (list.length <= 1) return;
          if (delta > 0) state.deckIndex = (state.deckIndex + 1) % list.length;
          else state.deckIndex = (state.deckIndex - 1 + list.length) % list.length;
          renderGrid();
        }
      }
    }, { passive: false });
  }

  function renderHowFaq() {
    const L = t();
    $("#how-title").textContent = L.howTitle;
    $("#how-lead").textContent = L.howLead;
    const steps = [
      [L.step1t, L.step1d],
      [L.step2t, L.step2d],
      [L.step3t, L.step3d],
      [L.step4t, L.step4d],
    ];
    $("#steps").innerHTML = steps
      .map(([h, p], i) => `<article class="step"><div class="num">0${i + 1}</div><h3>${h}</h3><p>${p}</p></article>`)
      .join("");
    $("#faq-title").textContent = L.faqTitle;
    $("#faq-list").innerHTML = L.faqs
      .map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`)
      .join("");
    $("#footer-note").textContent = L.footerNote;
  }

  function renderProduct() {
    const L = t();
    const bike = state.bikes.find((b) => b.ref.toLowerCase() === (state.ref || "").toLowerCase());
    $("#page-home").hidden = true;
    $("#page-product").hidden = false;
    if (!bike) {
      document.title = `${state.lang === "nl" ? "Fiets niet gevonden" : "Bike not found"} · Vouwloods Delft`;
      $("#page-product").innerHTML = `
        <button class="backlink" data-go="#/">${L.back}</button>
        <div style="padding:48px 16px;text-align:center">
          <h2>${state.lang === "nl" ? "Fiets niet gevonden" : "Bike not found"}</h2>
          <p class="lead-s" style="margin:8px 0 16px">${state.lang === "nl" ? "Deze fiets is mogelijk al verkocht of het referentienummer klopt niet." : "This bike may already be sold or the reference number is invalid."}</p>
          <a class="btn btn-brass" href="#/">${L.back}</a>
        </div>`;
      return;
    }
    document.title = `${bike.brand} ${bike.model} (${bike.ref}) · Vouwloods Delft`;
    interestStore.recordView(bike.ref);
    trackEvent("view_item", { ref: bike.ref, brand: bike.brand });
    const interest = interestStore.get(bike.ref);
    const isFav = state.favorites.includes(bike.ref);
    const highest = bike.currentBid || 0;
    const minNext = Math.ceil(Math.max(bike.minBid, highest + 5));
    const hist = (bike.localHistory || [])
      .map((h) => `<li>${euro(h.amount)} — ${escapeHtml(h.name)}</li>`)
      .join("");
    const rawMpHref = bike.mpUrl || window.VOUW.marktplaatsProfile || "";
    const mpHref = /^https?:\/\//i.test(rawMpHref) ? rawMpHref : "#";
    const qty = bike.qty || 1;
    const regionText = typeof window.VOUW.region === "object" ? (window.VOUW.region[state.lang] || window.VOUW.region.nl) : window.VOUW.region;
    const paymentText = typeof window.VOUW.payment === "object" ? (window.VOUW.payment[state.lang] || window.VOUW.payment.nl) : window.VOUW.payment;
    const pickupHoursText = typeof window.VOUW.pickupHours === "object" ? (window.VOUW.pickupHours[state.lang] || window.VOUW.pickupHours.nl) : window.VOUW.pickupHours;

    const pairHtml = qty > 1
      ? `<div class="note"><strong>${L.pair}</strong><p>${
          state.lang === "nl"
            ? `Dit is één advertentie voor <strong>twee fietsen</strong>. Vraagprijs ${euro(bike.price)} samen.${bike.unitPrice ? ` Los ook mogelijk voor ${euro(bike.unitPrice)} per stuk.` : ""}`
            : `This listing is <strong>two bikes</strong>. Asking ${euro(bike.price)} for the pair.${bike.unitPrice ? ` Singles also possible at ${euro(bike.unitPrice)} each.` : ""}`
        }</p></div>`
      : "";

    const trustStripHtml = `
      <div class="product-trust-strip">
        <div class="product-trust-item"><span class="pt-icon">🛡️</span><div><strong>${state.lang === "nl" ? "StopHeling gecheckt" : "StopHeling verified"}</strong><small>${state.lang === "nl" ? "100% eerlijke herkomst" : "Legitimate origin verified"}</small></div></div>
        <div class="product-trust-item"><span class="pt-icon">🚆</span><div><strong>${state.lang === "nl" ? "100% gratis in NS-trein" : "Free on NS trains"}</strong><small>${state.lang === "nl" ? "Handbagage, ook in de spits" : "Hand luggage, peak hours OK"}</small></div></div>
        <div class="product-trust-item"><span class="pt-icon">🚲</span><div><strong>${state.lang === "nl" ? "Proefrit in Delft" : "Test ride in Delft"}</strong><small>${state.lang === "nl" ? "Vrijblijvend proberen" : "Try before you buy"}</small></div></div>
        <div class="product-trust-item"><span class="pt-icon">💶</span><div><strong>${state.lang === "nl" ? "Tikkie of contant" : "Tikkie, cash or Revolut"}</strong><small>${state.lang === "nl" ? "Betaling pas bij afhalen" : "Payment upon inspection"}</small></div></div>
      </div>`;

    const trSpecs = window.I18N.specsTranslate || {};
    const trAcc = window.I18N.accessories || {};

    $("#page-product").innerHTML = `
      <button class="backlink" data-go="#/">${L.back}</button>
      <div class="product">
        <div>
          <div class="viewer" id="viewer">
            <img class="viewer-img is-on" id="viewer-a" src="${img(bike.photos[0])}" alt="${bike.brand} ${bike.model}">
            <img class="viewer-img" id="viewer-b" alt="">
            <div class="viewer-tools">
              <button class="btn btn-ghost" id="prev-ph" type="button" aria-label="${state.lang === "nl" ? "Vorige foto" : "Previous photo"}">‹</button>
              <span id="ph-label">1 / ${bike.photos.length}</span>
              <button class="btn btn-ghost" id="next-ph" type="button" aria-label="${state.lang === "nl" ? "Volgende foto" : "Next photo"}">›</button>
            </div>
          </div>
          <div class="thumbs">
            ${bike.photos.map((p, i) => `<button data-photo="${i}" class="${i === 0 ? "on" : ""}" aria-label="${state.lang === "nl" ? `Foto ${i + 1}` : `Photo ${i + 1}`}"><img src="${img(p)}" alt=""></button>`).join("")}
            ${bike.studio ? `<button data-studio="1" class="studio-thumb" aria-label="${L.atmosphere}"><img src="${img(bike.studio)}" alt=""><span>${L.atmosphere}</span></button>` : ""}
          </div>
          <div class="note"><strong>${L.notes}</strong><p>${bike.notes[state.lang]}</p></div>
          <div class="defect"><strong>${L.defects}</strong><p>${bike.defects[state.lang]}</p></div>
          <table class="specs">
            <tr><th>${L.ref}</th><td>${bike.ref}</td></tr>
            <tr><th>${L.brand}</th><td>${bike.brand}</td></tr>
            <tr><th>${L.model}</th><td>${bike.model}</td></tr>
            ${bike.year ? `<tr><th>${L.year}</th><td>${bike.year}</td></tr>` : ""}
            <tr><th>${L.color}</th><td>${bike.color[state.lang]}</td></tr>
            <tr><th>${L.gears}</th><td>${bike.gears} ${L.gears}</td></tr>
            <tr><th>${L.wheel}</th><td>${bike.wheel}"</td></tr>
            <tr><th>${L.weight}</th><td>${bike.weightKg} kg</td></tr>
            <tr><th>${L.folded}</th><td>${(trSpecs[bike.folded] && trSpecs[bike.folded][state.lang]) || bike.folded}</td></tr>
            <tr><th>${L.bar}</th><td>${(trSpecs[bike.bar] && trSpecs[bike.bar][state.lang]) || bike.bar}</td></tr>
            <tr><th>${L.brakes}</th><td>${(trSpecs[bike.brakes] && trSpecs[bike.brakes][state.lang]) || bike.brakes}</td></tr>
            <tr><th>${L.tires}</th><td>${(trSpecs[bike.tires] && trSpecs[bike.tires][state.lang]) || bike.tires}</td></tr>
            <tr><th>${L.included}</th><td>${bike.included.map((item) => (trAcc[item] && trAcc[item][state.lang]) || item).join(", ") || "—"}</td></tr>
          </table>
          ${trustStripHtml}
        </div>
        <aside class="buybox">
          <div class="refcode">${bike.ref} · ${L.status[bike.status]}</div>
          <h1>${bike.brand} ${bike.model}</h1>
          <div class="meta-row">
            <span class="pill cond-${bike.condition}">${L.cond[bike.condition]}</span>
            ${bike.electric ? `<span class="pill">${L.electric}</span>` : ""}
          </div>
          <div class="ask">${euro(bike.price)} <small>${L.asking}</small>${qty > 1 && bike.unitPrice ? `<span style="display:block;font-size:0.5em;font-weight:400;color:var(--muted);margin-top:2px">${euro(bike.unitPrice)} ${L.each}</span>` : ""}</div>
          ${pairHtml}
          ${qty > 1 ? `<div style="font-size:12px;color:var(--brass);background:rgba(215,168,92,0.1);padding:8px 12px;border-radius:10px;margin-bottom:10px;border:1px solid rgba(215,168,92,0.25)">💡 ${L.singleBikeNote}</div>` : ""}
          ${interest.saves > 0 || interest.views > 0 ? `<div class="social-urgency-box">
            <div class="urgency-header">
              <span class="urgency-flame">🔥</span>
              <span class="urgency-title">${L.highInterestTitle}</span>
            </div>
            <div class="urgency-stats">
              <strong>${interest.saves}</strong> ${L.peopleSaved} &middot; <strong>${interest.views}</strong> ${L.viewsToday}
            </div>
            <div class="urgency-callout">
              ⚡ ${L.testRideLimitNotice}
            </div>
          </div>` : ""}
          <p class="lead-s" style="margin:8px 0 0">${highest ? `${L.highest}: ${euro(highest)} · ${bike.bidCount} ${L.bids}` : L.noBids} · ${L.minBid} ${euro(minNext)}</p>
          <p class="lead-s">${L.bidLead}</p>
          <form class="bid-form" id="bid-form">
            <input type="number" name="amount" min="${minNext}" step="1" max="50000" placeholder="${L.yourBid}" aria-label="${L.yourBid}" required>
            <input type="text" name="name" placeholder="${L.yourName}" aria-label="${L.yourName}" maxlength="40">
            <button class="btn btn-signal" type="submit">${L.placeBid}</button>
          </form>
          ${hist ? `<div class="note"><strong>${L.bidHistory}</strong><ul>${hist}</ul></div>` : ""}
          <h3 style="margin:16px 0 8px">${L.contactTitle}</h3>
          <div class="contact-row">
            <a class="btn btn-wa" target="_blank" rel="noopener" href="${waLink(bike)}" style="font-size:14px;padding:12px 18px;justify-content:center">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" style="vertical-align:-3px;margin-right:4px"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              ${state.lang === "nl" ? "Koop of plan proefrit via WhatsApp" : "Buy or book test ride on WhatsApp"}
            </a>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <a class="btn btn-ghost" href="${emailLink(bike)}" style="flex:1;justify-content:center"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/></svg>${L.emailBtn}</a>
              <a class="btn btn-ghost" target="_blank" rel="noopener" href="${mpHref}" style="flex:1;justify-content:center">${L.mpBtn}</a>
              <button class="btn btn-ghost" id="share" style="padding:10px 14px" aria-label="${L.share}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>
            </div>
            <button class="btn-buybox-fav ${isFav ? "active" : ""}" data-fav="${bike.ref}" type="button">
              ${heartSvg(isFav)}
              <span>${isFav ? L.favRemove : L.favAdd}</span>
            </button>
            ${location.search.includes("admin") ? `<button class="btn btn-ghost" id="copy-listing">${L.copyListing}</button>` : ""}
          </div>
          <p class="lead-s" style="margin-top:14px;line-height:1.75"><strong>${L.pickup}:</strong> ${window.VOUW.city}, ${regionText} · ${pickupHoursText}<br>
          <strong>${L.pay}:</strong> ${paymentText}${window.VOUW.whatsapp ? `<br><strong>WhatsApp:</strong> <a target="_blank" rel="noopener" href="${waLink(bike)}" style="color:#25d366;font-weight:600;text-decoration:underline">${formatPhone(window.VOUW.whatsapp)}</a>` : ""}${window.VOUW.email ? `<br><strong>${L.email}:</strong> <a href="${emailLink(bike)}" style="color:var(--signal);text-decoration:underline">${window.VOUW.email}</a>` : ""}</p>
        </aside>
      </div>`;

    const gallery = bike.photos.slice();
    if (bike.studio) gallery.push(bike.studio);
    gallery.forEach((p) => { const imgEl = new Image(); imgEl.src = img(p); });
    let photoI = 0;
    let frontIsA = true;
    const showPhoto = (i) => {
      const next = (i + gallery.length) % gallery.length;
      if (next === photoI) return;
      photoI = next;
      const isStudio = bike.studio && gallery[photoI] === bike.studio;
      const incoming = frontIsA ? $("#viewer-b") : $("#viewer-a");
      const outgoing = frontIsA ? $("#viewer-a") : $("#viewer-b");
      if (incoming && outgoing) {
        incoming.src = img(gallery[photoI]);
        incoming.alt = `${bike.brand} ${bike.model}`;
        incoming.classList.remove("is-on");
        void incoming.offsetWidth;
        incoming.classList.add("is-on");
        outgoing.classList.remove("is-on");
        frontIsA = !frontIsA;
      }
      const lab = $("#ph-label");
      if (lab) lab.textContent = isStudio ? L.atmosphere : `${photoI + 1} / ${bike.photos.length}`;
      $$(".thumbs button").forEach((b) => {
        const idx = b.dataset.photo !== undefined ? Number(b.dataset.photo) : gallery.length - 1;
        b.classList.toggle("on", idx === photoI);
      });
    };
    $("#prev-ph").onclick = () => showPhoto(photoI - 1);
    $("#next-ph").onclick = () => showPhoto(photoI + 1);
    $$(".thumbs button").forEach((btn) => {
      btn.onclick = () => {
        if (btn.dataset.studio) showPhoto(gallery.length - 1);
        else showPhoto(Number(btn.dataset.photo));
      };
    });
    $("#copy-msg").onclick = async () => {
      await copyText(mpText(bike));
      toast(L.copied);
    };
    $("#copy-listing").onclick = async () => {
      await copyText(listingText(bike));
      toast(L.listingCopied);
    };
    $("#share").onclick = async () => {
      const url = location.href;
      if (navigator.share) {
        try {
          await navigator.share({ title: `${bike.brand} ${bike.model}`, url });
          return;
        } catch (err) {
          if (err && (err.name === "AbortError" || err.name === "NotAllowedError")) return;
        }
      }
      await copyText(url);
      toast(L.copied);
    };
    $("#bid-form").onsubmit = (e) => {
      e.preventDefault();
      if (bike.status !== "available") return toast(L.bidReserved);
      const fd = new FormData(e.target);
      const amount = Math.floor(Number(fd.get("amount")));
      const name = String(fd.get("name") || "").trim();
      if (!amount || !Number.isFinite(amount) || amount < minNext || amount > 50000) return toast(L.bidLow);
      const rec = bidStore.add(bike.ref, amount, name);
      bike.currentBid = rec.currentBid;
      bike.bidCount = rec.bidCount;
      bike.localHistory = rec.history;
      toast(L.bidOk);
      const extra =
        state.lang === "nl"
          ? `Ik bied ${euro(amount)}.`
          : `I bid ${euro(amount)}.`;
      // Open WhatsApp synchronously in user-event thread to prevent popup blockers
      window.open(waLink(bike, extra), "_blank");
      renderProduct();
    };

    let startX = 0;
    let startY = 0;
    let isTracking = false;
    const viewer = $("#viewer");
    viewer.addEventListener("pointerdown", (e) => {
      startX = e.clientX;
      startY = e.clientY;
      isTracking = true;
    }, { passive: true });
    viewer.addEventListener("pointerup", (e) => {
      if (!isTracking) return;
      isTracking = false;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        showPhoto(photoI + (dx < 0 ? 1 : -1));
      }
    });
    viewer.addEventListener("pointercancel", () => {
      isTracking = false;
    });
  }

  function openCompareModal(triggerEl) {
    const modal = $("#compare-modal");
    if (!modal) return;
    lastActiveTrigger = triggerEl || document.activeElement;
    renderCompareModalContent();
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    const closeBtn = $("#cmp-modal-close");
    if (closeBtn) setTimeout(() => closeBtn.focus(), 50);
  }

  function closeCompareModal() {
    const modal = $("#compare-modal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = "";
    if (lastActiveTrigger && typeof lastActiveTrigger.focus === "function") {
      lastActiveTrigger.focus();
    }
  }

  function renderCompareModalContent() {
    const L = t();
    const modal = $("#compare-modal");
    if (!modal) return;
    const items = state.compare
      .map((r) => state.bikes.find((b) => b.ref === r))
      .filter(Boolean);

    if (!items.length) {
      closeCompareModal();
      return;
    }

    const trSpecs = window.I18N.specsTranslate || {};
    const trAcc = window.I18N.accessories || {};

    const rows = [
      {
        label: L.asking,
        render: (b) => `<strong style="font-size:18px;color:var(--paper)">${euro(b.price)}</strong>${(b.qty || 1) > 1 && b.unitPrice ? `<br><small style="color:var(--muted)">${euro(b.unitPrice)} ${L.each}</small>` : ""}`,
      },
      {
        label: L.condition || (state.lang === "nl" ? "Staat" : "Condition"),
        render: (b) => `<span class="pill cond-${b.condition}">${L.cond[b.condition] || b.condition}</span>`,
      },
      {
        label: L.gears,
        render: (b) => `<strong>${b.gears}</strong> ${L.gears}`,
      },
      {
        label: L.brakes,
        render: (b) => trSpecs[b.brakes]?.[state.lang] || b.brakes,
      },
      {
        label: L.weight,
        render: (b) => `${b.weightKg} ${L.kg}`,
      },
      {
        label: L.wheel,
        render: (b) => `${b.wheel}${L.inch}`,
      },
      {
        label: L.folded,
        render: (b) => trSpecs[b.folded]?.[state.lang] || b.folded,
      },
      {
        label: L.electricLabel || (state.lang === "nl" ? "Elektrische motor" : "Electric motor"),
        render: (b) => b.electric ? `<span class="badge e" style="position:static;display:inline-block">${L.electric}</span>` : (state.lang === "nl" ? "Nee" : "No"),
      },
      {
        label: L.included,
        render: (b) => (b.included || []).map((acc) => `<span class="pill" style="display:inline-block;margin:2px 4px 2px 0">${trAcc[acc]?.[state.lang] || acc}</span>`).join(""),
      },
      {
        label: L.defects,
        render: (b) => `<small style="color:var(--muted);line-height:1.4;display:block">${escapeHtml(b.defects[state.lang] || "")}</small>`,
      },
    ];

    const cmpRefs = items.map((b) => b.ref).join(" en ");
    const cmpWaMsg = state.lang === "nl"
      ? `Hoi, ik twijfel op Vouwloods tussen ${cmpRefs}. Welke raad je aan voor mijn gebruik?`
      : `Hi, I'm comparing ${cmpRefs} on Vouwloods. Which one would you recommend for my commute?`;
    const num = (window.VOUW.whatsapp || "").replace(/[^\d]/g, "");
    const cmpWaUrl = `https://wa.me/${num}?text=${encodeURIComponent(cmpWaMsg)}`;

    modal.innerHTML = `
      <div class="compare-modal" role="dialog" aria-modal="true" aria-labelledby="cmp-modal-title">
        <div class="compare-modal-header">
          <h2 id="cmp-modal-title">${L.compareModalTitle || (state.lang === "nl" ? "Fietsen vergelijken" : "Compare folding bikes")} (${items.length})</h2>
          <button class="btn btn-ghost" id="cmp-modal-close" style="padding:6px 12px">✕ ${L.compareClose || (state.lang === "nl" ? "Sluiten" : "Close")}</button>
        </div>
        <div class="compare-modal-body">
          <table class="compare-table">
            <thead>
              <tr>
                <th class="row-label"></th>
                ${items.map((b) => `
                  <th class="compare-col-header" style="width:${Math.floor(100 / items.length)}%">
                    <a href="#/bike/${b.ref}" class="cmp-card-link" onclick="window._closeCompare && window._closeCompare()">
                      <img src="${img(b.photos[0])}" alt="${b.brand} ${b.model}">
                    </a>
                    <div style="font-size:11px;color:var(--brass);letter-spacing:0.08em;margin-top:4px">${b.ref}</div>
                    <h3>${b.brand} ${b.model}</h3>
                    <div class="price" style="margin:4px 0 10px">${euro(b.price)}</div>
                    <a class="btn btn-wa" target="_blank" rel="noopener" href="${waLink(b)}" style="margin-bottom:6px;font-size:12px;padding:8px">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                      ${L.waBtn}
                    </a>
                    <a class="btn btn-brass" href="#/bike/${b.ref}" onclick="window._closeCompare && window._closeCompare()" style="font-size:12px;padding:6px;margin-bottom:6px">
                      ${L.view}
                    </a>
                    <div>
                      <button class="compare-remove-btn" data-cmp-rm="${b.ref}" aria-label="${L.compareRemove || "Verwijderen"}: ${b.brand} ${b.model} (${b.ref})">✕ ${L.compareRemove || (state.lang === "nl" ? "Verwijderen" : "Remove")}</button>
                    </div>
                  </th>
                `).join("")}
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <th class="row-label">${row.label}</th>
                  ${items.map((b) => `<td>${row.render(b)}</td>`).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <div class="compare-modal-footer">
          <div class="cmp-advice-text">
            <strong>${L.compareAdviceTitle || "Twijfel je tussen deze modellen?"}</strong>
            <span>${L.compareAdviceDesc || "Vraag verkoper Kiran direct om advies over gewicht, vouwsnelheid en dagelijks forenzen."}</span>
          </div>
          <a class="btn btn-wa" target="_blank" rel="noopener" href="${cmpWaUrl}">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" style="vertical-align:-2px;margin-right:4px"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            ${L.compareAdviceBtn || "Vraag advies via WhatsApp"}
          </a>
        </div>
      </div>`;

    window._closeCompare = closeCompareModal;
    $("#cmp-modal-close").onclick = closeCompareModal;
    modal.onclick = (e) => {
      if (e.target === modal) closeCompareModal();
    };
    $$("[data-cmp-rm]").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const ref = btn.getAttribute("data-cmp-rm");
        const idx = state.compare.indexOf(ref);
        if (idx >= 0) state.compare.splice(idx, 1);
        if (!state.compare.length) closeCompareModal();
        render();
      };
    });
  }

  function renderCompare() {
    const L = t();
    const tray = $("#compare-tray");
    state.compare = state.compare.filter((ref) => state.bikes.some((b) => b.ref === ref));
    if (!state.compare.length) {
      tray.classList.remove("show");
      tray.innerHTML = "";
      closeCompareModal();
      return;
    }
    const items = state.compare
      .map((r) => state.bikes.find((b) => b.ref === r))
      .filter(Boolean);

    tray.classList.add("show");
    tray.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;cursor:pointer" id="cmp-open-tray" title="${L.compareOpen}">
        <strong style="color:var(--brass);font-size:13px;letter-spacing:0.04em">${L.compareTitle}:</strong>
        ${items.map((b) => `<img src="${img(b.photos[0])}" alt="${b.ref}" title="${b.brand} ${b.model}" style="width:48px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--line)">`).join("")}
      </div>
      <div class="sp" style="font-size:12px;cursor:pointer" id="cmp-open-text">${items.map((b) => `<strong>${b.ref}</strong> (${euro(b.price)})`).join(" vs ")}</div>
      <button class="btn btn-brass" id="cmp-open-btn" style="padding:8px 14px;font-size:13px;white-space:nowrap;font-weight:600">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" style="vertical-align:-2px;margin-right:4px"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>
        ${L.compareOpen || (state.lang === "nl" ? "Vergelijk nu" : "Compare now")} (${items.length})
      </button>
      <button class="btn btn-ghost" id="cmp-clear" style="padding:6px 10px;font-size:12px">${L.compareClear}</button>`;

    $("#cmp-clear").onclick = (e) => {
      e.stopPropagation();
      state.compare = [];
      closeCompareModal();
      render();
    };

    const openHandler = (e) => openCompareModal(e ? e.currentTarget : null);
    $("#cmp-open-btn").onclick = openHandler;
    $("#cmp-open-tray").onclick = openHandler;
    $("#cmp-open-text").onclick = openHandler;

    const modal = $("#compare-modal");
    if (modal && !modal.hidden) {
      renderCompareModalContent();
    }
  }

  function bindTilt() {
    $$(".tilt").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 8}deg)`;
      });
      card.addEventListener("pointerleave", () => { card.style.transform = ""; });
    });
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }
  const escapeAttr = escapeHtml;

  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    if (deckSwiping) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      e.preventDefault();
      e.stopPropagation();
      const ref = fav.getAttribute("data-fav");
      const idx = state.favorites.indexOf(ref);
      const isSaved = idx < 0;
      if (isSaved) {
        state.favorites.push(ref);
        toast(t().favSaved);
        trackEvent("add_to_wishlist", { ref });
      } else {
        state.favorites.splice(idx, 1);
        toast(t().favRemoved);
        trackEvent("remove_from_wishlist", { ref });
      }
      localStorage.setItem("vouw-favorites", JSON.stringify(state.favorites));
      interestStore.toggleSave(ref, isSaved);
      render();
      return;
    }
    const favFilter = e.target.closest("#f-favs");
    if (favFilter) {
      e.preventDefault();
      e.stopPropagation();
      if (!state.favorites.length && !state.onlyFavorites) {
        toast(t().favEmpty);
        return;
      }
      state.onlyFavorites = !state.onlyFavorites;
      render();
      return;
    }
    const wa = e.target.closest(".btn-wa");
    if (wa) {
      trackEvent("contact_whatsapp", { ref: state.ref || "" });
    }
    const cmp = e.target.closest("[data-compare]");
    if (cmp) {
      e.preventDefault();
      e.stopPropagation();
      const ref = cmp.getAttribute("data-compare");
      const i = state.compare.indexOf(ref);
      if (i >= 0) state.compare.splice(i, 1);
      else if (state.compare.length >= 3) return toast(t().compareMax);
      else state.compare.push(ref);
      render();
      return;
    }
    const deckSide = e.target.closest(".deck-item.side");
    if (deckSide) {
      e.preventDefault();
      e.stopPropagation();
      const to = Number(deckSide.getAttribute("data-deck-index"));
      if (!isNaN(to)) {
        state.deckIndex = to;
        renderGrid();
      }
      return;
    }
    const open = e.target.closest("[data-open]");
    if (open) {
      e.preventDefault();
      go("#/bike/" + open.getAttribute("data-open"));
      return;
    }
    const goEl = e.target.closest("[data-go]");
    if (goEl) {
      go(goEl.getAttribute("data-go"));
      return;
    }
    const viewBtn = e.target.closest("[data-view]");
    if (viewBtn) {
      state.view = viewBtn.getAttribute("data-view");
      renderGrid();
      $$("[data-view]").forEach((b) => b.classList.toggle("on", b === viewBtn));
    }
  });

  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) return;
    const cmpModal = $("#compare-modal");
    if (cmpModal && !cmpModal.hidden) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCompareModal();
      }
      return;
    }
    if (state.route === "bike") {
      if (e.key === "Escape") {
        e.preventDefault();
        go("#/");
      } else if (e.key === "ArrowLeft") {
        const prevBtn = $("#prev-ph");
        if (prevBtn) prevBtn.click();
      } else if (e.key === "ArrowRight") {
        const nextBtn = $("#next-ph");
        if (nextBtn) nextBtn.click();
      }
    } else if (state.route === "home" && state.view === "deck") {
      const list = filtered();
      if (!list.length) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        state.deckIndex = (state.deckIndex - 1 + list.length) % list.length;
        renderGrid();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        state.deckIndex = (state.deckIndex + 1) % list.length;
        renderGrid();
      }
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "f-brand") state.brand = e.target.value;
    if (e.target.id === "f-cond") state.cond = e.target.value;
    if (e.target.id === "f-power") state.power = e.target.value;
    if (e.target.id === "f-sort") state.sort = e.target.value;
    if (["f-brand", "f-cond", "f-power", "f-sort"].includes(e.target.id)) renderGrid();
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "f-q") {
      state.q = e.target.value;
      renderGrid();
    }
  });

  function boot(data) {
    try {
      state.bikes = data;
      bidStore.merge(state.bikes);
      render();
      bidStore.fetchRemote();
      if (window.VOUW && window.VOUW.bidSync && window.VOUW.bidSync.enabled && window.VOUW.bidSync.pollIntervalMs) {
        setInterval(() => bidStore.fetchRemote(), window.VOUW.bidSync.pollIntervalMs);
      }
    } catch (err) {
      console.error("Vouwloods render error", err);
    }
  }

  const isWeb = location.protocol === "http:" || location.protocol === "https:";
  if (isWeb) {
    fetch("data/bikes.json?v=" + Date.now())
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(boot)
      .catch((err) => {
        console.warn("Falling back to window.BIKES:", err);
        if (Array.isArray(window.BIKES) && window.BIKES.length) boot(window.BIKES);
      });
  } else if (Array.isArray(window.BIKES) && window.BIKES.length) {
    boot(window.BIKES);
  } else {
    fetch("data/bikes.json")
      .then((r) => r.json())
      .then(boot)
      .catch((err) => console.error(err));
  }

  const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };
  on("#lang-nl", "click", () => { state.lang = "nl"; localStorage.setItem("vouw-lang", "nl"); render(); });
  on("#lang-en", "click", () => { state.lang = "en"; localStorage.setItem("vouw-lang", "en"); render(); });
  on("#nav-inv", "click", (e) => { e.preventDefault(); go("#/"); setTimeout(() => $("#inventory")?.scrollIntoView({ behavior: "smooth" }), 50); });
  on("#nav-how", "click", (e) => { e.preventDefault(); go("#/"); setTimeout(() => $("#how")?.scrollIntoView({ behavior: "smooth" }), 50); });
  on("#nav-faq", "click", (e) => { e.preventDefault(); go("#/"); setTimeout(() => $("#faq")?.scrollIntoView({ behavior: "smooth" }), 50); });
  on("#hero-cta", "click", () => $("#inventory")?.scrollIntoView({ behavior: "smooth" }));
  on("#hero-sec", "click", () => $("#how")?.scrollIntoView({ behavior: "smooth" }));
  on("#logo", "click", (e) => { e.preventDefault(); go("#/"); });
  on("#cf-prev", "click", () => { const el = $("#coverflow"); if (el) el.scrollBy({ left: -280, behavior: "smooth" }); });
  on("#cf-next", "click", () => { const el = $("#coverflow"); if (el) el.scrollBy({ left: 280, behavior: "smooth" }); });
  window.addEventListener("hashchange", render);
})();
