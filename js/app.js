(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const euro = (n) => "€\u00a0" + Number(n).toLocaleString("nl-NL");
  const t = () => window.I18N[state.lang];

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
    compare: [],
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
      return ref ? `${base}/${encodeURIComponent(ref)}` : base;
    },
    async fetchRemote() {
      const url = this.getEndpoint();
      if (!url) return null;
      try {
        const res = await fetch(url, { headers: { "Accept": "application/json" } });
        if (!res.ok) return null;
        const remoteData = await res.json();
        if (!remoteData || typeof remoteData !== "object") return null;
        const local = this.load();
        let changed = false;
        Object.keys(remoteData).forEach((ref) => {
          const r = remoteData[ref];
          if (!r || typeof r !== "object") return;
          const l = local[ref] || { currentBid: 0, bidCount: 0, history: [] };
          if ((r.currentBid || 0) > (l.currentBid || 0) || (r.bidCount || 0) > (l.bidCount || 0)) {
            local[ref] = {
              currentBid: Math.max(r.currentBid || 0, l.currentBid || 0),
              bidCount: Math.max(r.bidCount || 0, l.bidCount || 0),
              history: r.history && r.history.length ? r.history : (l.history || [])
            };
            changed = true;
          }
        });
        if (changed) {
          this.save(local);
          this.merge(state.bikes, local);
          render();
        }
        return remoteData;
      } catch (err) {
        return null;
      }
    },
    add(ref, amount, name) {
      const stored = this.load();
      const cur = stored[ref] || { currentBid: 0, bidCount: 0, history: [] };
      cur.currentBid = amount;
      cur.bidCount = (cur.bidCount || 0) + 1;
      cur.history = [{ amount, name: name || "anon", at: Date.now() }, ...(cur.history || [])].slice(0, 8);
      stored[ref] = cur;
      this.save(stored);

      const url = this.getEndpoint(ref);
      if (url) {
        const method = (window.VOUW && window.VOUW.bidSync && window.VOUW.bidSync.provider === "firebase") ? "PUT" : "POST";
        fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cur)
        }).catch((err) => console.warn("Vouwloods bid sync error:", err));
      }
      return cur;
    },
  };

  function waLink(bike, extra = "") {
    const num = (window.VOUW.whatsapp || "").replace(/[^\d]/g, "");
    const L = t();
    const msg =
      state.lang === "nl"
        ? `Hallo, ik heb interesse in ${bike.brand} ${bike.model} (${bike.ref}${(bike.qty || 1) > 1 ? ", 2 stuks" : ""}) via Vouwloods. Vraagprijs ${euro(bike.price)}. ${extra}`.trim()
        : `Hello, I'm interested in ${bike.brand} ${bike.model} (${bike.ref}${(bike.qty || 1) > 1 ? ", pair" : ""}) via Vouwloods. Asking ${euro(bike.price)}. ${extra}`.trim();
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  }

  function mpText(bike) {
    return state.lang === "nl"
      ? `Hallo, ik reageer op Vouwloods ref ${bike.ref} — ${bike.brand} ${bike.model} (${bike.year}). Ik wil hem graag bekijken in Delft.`
      : `Hello, contacting about Vouwloods ref ${bike.ref} — ${bike.brand} ${bike.model} (${bike.year}). I'd like to view it in Delft.`;
  }

  function listingText(bike) {
    const L = t();
    const loc = window.VOUW.city;
    const siteUrl = (location.origin && location.origin !== "null" && location.protocol.startsWith("http"))
      ? `${location.origin}${location.pathname.replace(/\/+$/, "")}/#/bike/${bike.ref}`
      : `https://knarayanareddy.github.io/vouwfiets/#/bike/${bike.ref}`;
    if (state.lang === "nl") {
      return `${bike.brand} ${bike.model} vouwfiets (${bike.year || "ZGAN"}) — ${bike.color.nl}\nRef: ${bike.ref}\nVraagprijs: ${euro(bike.price)} | bieden vanaf ${euro(bike.minBid)}\nStaat: ${L.cond[bike.condition]}\n${bike.gears} versnellingen · ${bike.wheel}" · ${bike.weightKg} kg${bike.electric ? " · elektrisch" : ""}\n\n${bike.notes.nl}\n\nGebreken: ${bike.defects.nl}\nInbegrepen: ${bike.included.join(", ") || "—"}\nOphalen in ${loc}. Bekijk alle foto's & voorraad: ${siteUrl}`;
    }
    return `${bike.brand} ${bike.model} folding bike (${bike.year || "like new"}) — ${bike.color.en}\nRef: ${bike.ref}\nAsking: ${euro(bike.price)} | bids from ${euro(bike.minBid)}\nCondition: ${L.cond[bike.condition]}\n${bike.gears} gears · ${bike.wheel}" · ${bike.weightKg} kg${bike.electric ? " · electric" : ""}\n\n${bike.notes.en}\n\nDefects: ${bike.defects.en}\nIncluded: ${bike.included.join(", ") || "—"}\nPickup in ${loc}. View all photos & stock: ${siteUrl}`;
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2600);
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
      document.documentElement.lang = state.lang;
      renderChrome();
      if (state.route === "bike") renderProduct();
      else renderHome();
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
    $("#nav-inv").textContent = L.navInventory;
    $("#nav-how").textContent = L.navHow;
    $("#nav-faq").textContent = L.navFaq;
    $("#nav-wa").innerHTML = L.wa;
    $("#nav-wa").href = `https://wa.me/${window.VOUW.whatsapp.replace(/[^\d]/g, "")}`;
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
    if (root.children.length) {
      root.dataset.n = String(root.children.length);
      startCoverflowAuto();
      return;
    }
    root.dataset.n = String(items.length);
    const L = t();
    root.innerHTML = items.map((b) => {
      const src = img(b.studio || b.photos[0]);
      const tag = b.studio ? `<span class="badge pair">${L.atmosphere}</span>` : "";
      return `<a class="cf-card" href="#/bike/${b.ref}">
        <img src="${src}" alt="${b.brand} ${b.model}">
        ${tag}
        <div class="meta"><small>${b.ref}${(b.qty || 1) > 1 ? " · 2" : ""}</small><strong>${b.brand} ${b.model}</strong>${euro(b.price)}</div>
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
    $("#filters").innerHTML = `
      <input id="f-q" value="${escapeAttr(state.q)}" placeholder="${L.searchPh}">
      <select id="f-brand">
        <option value="">${L.allBrands}</option>
        ${brands().map((b) => `<option ${b === state.brand ? "selected" : ""}>${b}</option>`).join("")}
      </select>
      <select id="f-cond">
        <option value="">${L.allCond}</option>
        ${conds.map((c) => `<option value="${c}" ${c === state.cond ? "selected" : ""}>${L.cond[c]}</option>`).join("")}
      </select>
      <select id="f-power">
        <option value="">${L.allPower}</option>
        <option value="e" ${state.power === "e" ? "selected" : ""}>${L.onlyE}</option>
        <option value="pedal" ${state.power === "pedal" ? "selected" : ""}>${L.onlyPedal}</option>
      </select>
      <select id="f-sort">
        <option value="feat" ${state.sort === "feat" ? "selected" : ""}>${L.sortFeat}</option>
        <option value="price-asc" ${state.sort === "price-asc" ? "selected" : ""}>${L.sortPriceAsc}</option>
        <option value="price-desc" ${state.sort === "price-desc" ? "selected" : ""}>${L.sortPriceDesc}</option>
        <option value="bids" ${state.sort === "bids" ? "selected" : ""}>${L.sortBids}</option>
        <option value="year" ${state.sort === "year" ? "selected" : ""}>${L.sortYear}</option>
      </select>
      <div class="view-toggle">
        <button data-view="grid" class="${state.view === "grid" ? "on" : ""}">${L.viewGrid}</button>
        <button data-view="deck" class="${state.view === "deck" ? "on" : ""}">${L.viewDeck}</button>
      </div>`;
  }

  function cardHTML(b) {
    const L = t();
    const inC = state.compare.includes(b.ref);
    const highest = b.currentBid || 0;
    return `<article class="card tilt" data-open="${b.ref}">
      <div class="shot"><img src="${img(b.photos[0])}" alt="">
        <span class="badge">${b.ref}</span>
        ${b.electric ? `<span class="badge e">${L.electric}</span>` : ""}
        ${(b.qty || 1) > 1 ? `<span class="badge pair">${L.pair}</span>` : ""}
        ${b.status !== "available" ? `<span class="badge res">${L.status[b.status]}</span>` : ""}
      </div>
      <div class="card-body">
        <div class="refcode">${b.year ? b.year + " · " : ""}${b.color[state.lang]}</div>
        <h3>${b.brand} ${b.model}</h3>
        <div class="meta-row">
          <span class="pill cond-${b.condition}">${L.cond[b.condition] || b.condition}</span>
          <span class="pill">${b.gears} ${L.gears}</span>
          <span class="pill">${b.wheel}${L.inch}</span>
          <span class="pill">${b.weightKg} ${L.kg}</span>
        </div>
        <div class="price-row">
          <div class="price">${euro(b.price)}</div>
          <div class="bidlet">${highest ? `${L.highest} ${euro(highest)}<br>${b.bidCount} ${L.bids}` : L.noBids}</div>
        </div>
        <div class="card-actions">
          <button class="btn btn-brass" data-open="${b.ref}">${L.view}</button>
          <button class="btn btn-ghost" data-compare="${b.ref}">${inC ? L.compared : L.compare}</button>
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
      root.innerHTML = `<div class="empty">${L.empty}</div>`;
      return;
    }
    if (state.view === "deck") {
      root.className = "deck";
      const mid = Math.min(list.length, 9);
      const slice = list.slice(0, mid);
      root.innerHTML = slice
        .map((b, i) => {
          const off = i - Math.floor(slice.length / 2);
          const rot = off * 8;
          const x = off * 42;
          const z = -Math.abs(off) * 30;
          return `<div class="deck-item" style="transform: translateX(${x}px) translateZ(${z}px) rotateY(${rot}deg); z-index:${20 - Math.abs(off)};">${cardHTML(b)}</div>`;
        })
        .join("");
    } else {
      root.className = "grid";
      root.innerHTML = list.map(cardHTML).join("");
    }
    bindTilt();
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
    const bike = state.bikes.find((b) => b.ref === state.ref);
    $("#page-home").hidden = true;
    $("#page-product").hidden = false;
    if (!bike) {
      $("#page-product").innerHTML = `<p class="empty">${L.empty}</p>`;
      return;
    }
    const highest = bike.currentBid || 0;
    const minNext = Math.max(bike.minBid, highest + 5);
    const hist = (bike.localHistory || [])
      .map((h) => `<li>${euro(h.amount)} — ${escapeHtml(h.name)}</li>`)
      .join("");
    const mpHref = bike.mpUrl || window.VOUW.marktplaatsProfile;
    const qty = bike.qty || 1;
    const pairHtml = qty > 1
      ? `<div class="note"><strong>${L.pair}</strong><p>${
          state.lang === "nl"
            ? `Dit is één advertentie voor <strong>twee fietsen</strong>. Vraagprijs ${euro(bike.price)} samen.${bike.unitPrice ? ` Los ook mogelijk voor ${euro(bike.unitPrice)} per stuk.` : ""}`
            : `This listing is <strong>two bikes</strong>. Asking ${euro(bike.price)} for the pair.${bike.unitPrice ? ` Singles also possible at ${euro(bike.unitPrice)} each.` : ""}`
        }</p></div>`
      : "";

    $("#page-product").innerHTML = `
      <button class="backlink" data-go="#/">${L.back}</button>
      <div class="product">
        <div>
          <div class="viewer" id="viewer">
            <img class="viewer-img is-on" id="viewer-a" src="${img(bike.photos[0])}" alt="${bike.brand} ${bike.model}">
            <img class="viewer-img" id="viewer-b" alt="">
            <div class="viewer-tools">
              <button class="btn btn-ghost" id="prev-ph" type="button">‹</button>
              <span id="ph-label">1 / ${bike.photos.length}</span>
              <button class="btn btn-ghost" id="next-ph" type="button">›</button>
            </div>
          </div>
          <div class="thumbs">
            ${bike.photos.map((p, i) => `<button data-photo="${i}" class="${i === 0 ? "on" : ""}"><img src="${img(p)}" alt=""></button>`).join("")}
            ${bike.studio ? `<button data-studio="1" class="studio-thumb"><img src="${img(bike.studio)}" alt=""><span>${L.atmosphere}</span></button>` : ""}
          </div>
          <div class="note"><strong>${L.notes}</strong><p>${bike.notes[state.lang]}</p></div>
          <div class="defect"><strong>${L.defects}</strong><p>${bike.defects[state.lang]}</p></div>
          <table class="specs">
            <tr><th>${L.ref}</th><td>${bike.ref}</td></tr>
            <tr><th>${L.brand}</th><td>${bike.brand}</td></tr>
            <tr><th>${L.model}</th><td>${bike.model}</td></tr>
            ${bike.year ? `<tr><th>${L.year}</th><td>${bike.year}</td></tr>` : ""}
            <tr><th>${L.color}</th><td>${bike.color[state.lang]}</td></tr>
            <tr><th>${L.gears}</th><td>${bike.gears}</td></tr>
            <tr><th>${L.wheel}</th><td>${bike.wheel}"</td></tr>
            <tr><th>${L.weight}</th><td>${bike.weightKg} kg</td></tr>
            <tr><th>${L.folded}</th><td>${bike.folded}</td></tr>
            <tr><th>${L.bar}</th><td>${bike.bar}</td></tr>
            <tr><th>${L.brakes}</th><td>${bike.brakes}</td></tr>
            <tr><th>${L.tires}</th><td>${bike.tires}</td></tr>
            <tr><th>${L.included}</th><td>${bike.included.join(", ") || "—"}</td></tr>
          </table>
        </div>
        <aside class="buybox">
          <div class="refcode">${bike.ref} · ${L.status[bike.status]}</div>
          <h1>${bike.brand} ${bike.model}</h1>
          <div class="meta-row">
            <span class="pill cond-${bike.condition}">${L.cond[bike.condition]}</span>
            ${bike.electric ? `<span class="pill">${L.electric}</span>` : ""}
          </div>
          <div class="ask">${euro(bike.price)} <small>${L.asking}</small></div>
          ${pairHtml}
          <p class="lead-s" style="margin:8px 0 0">${highest ? `${L.highest}: ${euro(highest)} · ${bike.bidCount} ${L.bids}` : L.noBids} · ${L.minBid} ${euro(minNext)}</p>
          <p class="lead-s">${L.bidLead}</p>
          <form class="bid-form" id="bid-form">
            <input type="number" name="amount" min="${minNext}" step="5" placeholder="${L.yourBid}" required>
            <input type="text" name="name" placeholder="${L.yourName}" maxlength="40">
            <button class="btn btn-signal" type="submit">${L.placeBid}</button>
          </form>
          ${hist ? `<div class="note"><strong>${L.bidHistory}</strong><ul>${hist}</ul></div>` : ""}
          <h3 style="margin:16px 0 8px">${L.contactTitle}</h3>
          <div class="contact-row">
            <a class="btn btn-wa" target="_blank" rel="noopener" href="${waLink(bike)}">${L.waBtn}</a>
            <a class="btn btn-ghost" target="_blank" rel="noopener" href="${mpHref}">${L.mpBtn}</a>
            <button class="btn btn-ghost" id="copy-msg">${L.copyMsg}</button>
            <button class="btn btn-ghost" id="copy-listing">${L.copyListing}</button>
            <button class="btn btn-ghost" id="share">${L.share}</button>
          </div>
          <p class="lead-s" style="margin-top:14px"><strong>${L.pickup}:</strong> ${window.VOUW.city}, ${window.VOUW.region} · ${window.VOUW.pickupHours[state.lang]}<br>
          <strong>${L.pay}:</strong> ${window.VOUW.payment[state.lang]}</p>
        </aside>
      </div>`;

    const gallery = bike.photos.slice();
    if (bike.studio) gallery.push(bike.studio);
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
        incoming.classList.remove("is-on");
        void incoming.offsetWidth;
        incoming.classList.add("is-on");
        outgoing.classList.remove("is-on");
        frontIsA = !frontIsA;
      }
      const lab = $("#ph-label");
      if (lab) lab.textContent = isStudio ? L.atmosphereHint : `${photoI + 1} / ${bike.photos.length}`;
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
      await navigator.clipboard.writeText(mpText(bike));
      toast(L.copied);
    };
    $("#copy-listing").onclick = async () => {
      await navigator.clipboard.writeText(listingText(bike));
      toast(L.listingCopied);
    };
    $("#share").onclick = async () => {
      const url = location.href;
      if (navigator.share) {
        try { await navigator.share({ title: `${bike.brand} ${bike.model}`, url }); return; } catch {}
      }
      await navigator.clipboard.writeText(url);
      toast(L.copied);
    };
    $("#bid-form").onsubmit = (e) => {
      e.preventDefault();
      if (bike.status !== "available") return toast(L.bidReserved);
      const fd = new FormData(e.target);
      const amount = Number(fd.get("amount"));
      const name = String(fd.get("name") || "").trim();
      if (!amount || amount < minNext) return toast(L.bidLow);
      const rec = bidStore.add(bike.ref, amount, name);
      bike.currentBid = rec.currentBid;
      bike.bidCount = rec.bidCount;
      bike.localHistory = rec.history;
      toast(L.bidOk);
      renderProduct();
      const extra =
        state.lang === "nl"
          ? `Ik bied ${euro(amount)}.`
          : `I bid ${euro(amount)}.`;
      setTimeout(() => window.open(waLink(bike, extra), "_blank"), 400);
    };

    let dragX = null;
    const viewer = $("#viewer");
    viewer.addEventListener("pointerdown", (e) => { dragX = e.clientX; viewer.setPointerCapture(e.pointerId); });
    viewer.addEventListener("pointerup", (e) => {
      if (dragX == null) return;
      const dx = e.clientX - dragX;
      dragX = null;
      if (Math.abs(dx) > 40) showPhoto(photoI + (dx < 0 ? 1 : -1));
    });
  }

  function renderCompare() {
    const L = t();
    const tray = $("#compare-tray");
    if (!state.compare.length) {
      tray.classList.remove("show");
      return;
    }
    const items = state.compare
      .map((r) => state.bikes.find((b) => b.ref === r))
      .filter(Boolean);
    tray.classList.add("show");
    tray.innerHTML = `
      <strong>${L.compareTitle}</strong>
      ${items.map((b) => `<img src="${img(b.photos[0])}" alt=""><span>${b.ref}<br>${euro(b.price)}</span>`).join("")}
      <span class="sp">${items.map((b) => `${b.brand} ${b.model} (${L.cond[b.condition]})`).join(" · ")}</span>
      <button class="btn btn-ghost" id="cmp-clear">${L.compareClear}</button>`;
    $("#cmp-clear").onclick = () => { state.compare = []; render(); };
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

  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open) {
      e.preventDefault();
      go("#/bike/" + open.getAttribute("data-open"));
      return;
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
