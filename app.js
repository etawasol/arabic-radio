(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const audio = $("audio");
  const LS = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : d;
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {
      }
    }
  };
  const SECURE_PAGE = location.protocol === "https:" && !window.NativeRadio;
  const state = {
    all: [],
    list: [],
    view: "all",
    cat: "all",
    country: "all",
    q: "",
    favs: new Set(LS.get("ar.favs", [])),
    recent: LS.get("ar.recent", []),
    current: null,
    playing: false,
    sleepAt: 0,
    sleepTimer: null
  };
  const norm = (s) => (s || "").toString().toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim();
  const esc = (s) => (s != null ? s : "").toString().replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const hue = (s) => {
    let h = 0;
    for (const c of s || "") h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  };
  function logoHTML(st, id = "") {
    const letter = esc((st.n || "?").trim().charAt(0).toUpperCase());
    const idAttr = id ? ` id="${id}"` : "";
    const bg = `style="background:hsl(${hue(st.n)} 45% 38%)"`;
    if (!st.l || SECURE_PAGE && st.l.startsWith("http:")) return `<div class="logo"${idAttr} ${bg}>${letter}</div>`;
    return `<div class="logo"${idAttr} ${bg}><img loading="lazy" src="${esc(st.l)}" alt="" referrerpolicy="no-referrer"
    onerror="this.parentNode.textContent='${letter}'"></div>`;
  }
  function flagHTML(code) {
    if (code === "INT") return '<span aria-hidden="true">🌐</span>';
    if (!/^[A-Z]{2}$/.test(code || "")) return "";
    const c = code.toLowerCase();
    return `<img class="flag" src="https://flagcdn.com/w40/${c}.png" alt="" loading="lazy" onerror="this.remove()">`;
  }
  function toast(msg, ms = 2400) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove("show"), ms);
  }
  async function loadStations() {
    const r = await fetch("stations.json");
    const data = await r.json();
    let st = data.stations;
    if (SECURE_PAGE) {
      st = st.map((s) => ({ ...s, u: s.u.filter((u) => u.startsWith("https:")) })).filter((s) => s.u.length);
    }
    st.forEach((s) => s._q = norm(`${s.n} ${s.cn} ${s.kn}`));
    state.all = st;
    $("count").textContent = `${st.length} محطة`;
    buildFilters();
    render();
    const last = LS.get("ar.last", null);
    const lastSt = last && st.find((s) => s.id === last);
    if (lastSt) showNowPlaying(lastSt);
  }
  function counts(key, label) {
    const m = /* @__PURE__ */ new Map();
    for (const s of state.all) {
      const e = m.get(s[key]) || { k: s[key], label: s[label], n: 0 };
      e.n++;
      m.set(s[key], e);
    }
    return [...m.values()].sort((a, b) => (b.k === "INT") - (a.k === "INT") || b.n - a.n);
  }
  function chip(group, value, label, n, pre = "") {
    const on = state[group] === value ? " on" : "";
    return `<button class="chip${on}" data-g="${group}" data-v="${esc(value)}">${pre}${esc(label)}${n != null ? `<b>${n}</b>` : ""}</button>`;
  }
  function buildFilters() {
    $("cats").innerHTML = chip("cat", "all", "كل التصنيفات") + counts("k", "kn").map((c) => chip("cat", c.k, c.label, c.n)).join("");
    $("countries").innerHTML = chip("country", "all", "كل الدول") + counts("c", "cn").map((c) => chip("country", c.k, c.label, c.n, flagHTML(c.k))).join("");
    const cur = state.all.find((s) => s.c === state.country);
    $("countryLabel").innerHTML = state.country === "all" ? "🌍 كل الدول" : `${flagHTML(state.country)} ${esc((cur == null ? void 0 : cur.cn) || "")}`;
  }
  document.addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    state[c.dataset.g] = c.dataset.v;
    if (c.dataset.g === "country") $("countries").classList.remove("open");
    buildFilters();
    render();
  });
  $("countryToggle").onclick = () => {
    const open = $("countries").classList.toggle("open");
    $("countryToggle").setAttribute("aria-expanded", open);
  };
  $("tabs").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.view = b.dataset.view;
    [...$("tabs").children].forEach((x) => x.classList.toggle("on", x === b));
    render();
  };
  let qT;
  $("q").oninput = (e) => {
    clearTimeout(qT);
    qT = setTimeout(() => {
      state.q = norm(e.target.value);
      render();
    }, 120);
  };
  function filtered() {
    let src = state.all;
    if (state.view === "fav") src = src.filter((s) => state.favs.has(s.id));
    if (state.view === "recent") src = state.recent.map((id) => state.all.find((s) => s.id === id)).filter(Boolean);
    return src.filter((s) => (state.cat === "all" || s.k === state.cat) && (state.country === "all" || s.c === state.country) && (!state.q || s._q.includes(state.q)));
  }
  function render() {
    var _a;
    state.list = filtered();
    const cur = (_a = state.current) == null ? void 0 : _a.id;
    $("grid").innerHTML = state.list.map((s) => `
    <button class="card${s.id === cur ? " playing" + (state.playing ? " live" : "") : ""}" data-id="${esc(s.id)}">
      ${logoHTML(s)}
      <div class="meta"><div class="name">${esc(s.n)}${state.favs.has(s.id) ? '<span class="star">★</span>' : ""}</div>
        <div class="sub">${esc(s.cn)} · ${esc(s.kn)}</div></div>
      <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
    </button>`).join("");
    const empty = $("empty");
    empty.hidden = state.list.length > 0;
    if (!state.list.length) {
      empty.textContent = state.view === "fav" ? "لا توجد محطات مفضلة بعد. شغّل محطة واضغط ☆ لإضافتها." : state.view === "recent" ? "لم تستمع لأي محطة بعد." : "لا توجد نتائج مطابقة.";
    }
  }
  $("grid").addEventListener("click", (e) => {
    var _a;
    const card = e.target.closest(".card");
    if (!card) return;
    const st = state.all.find((s) => s.id === card.dataset.id);
    if (((_a = state.current) == null ? void 0 : _a.id) === st.id && state.playing) engine.stop();
    else startStation(st);
  });
  function setStatus(kind, text) {
    const el = $("npStatus");
    el.className = "status " + (kind || "");
    el.querySelector("span").textContent = text;
    const live = kind === "live";
    if (live !== state.playingLive) {
      state.playingLive = live;
    }
    document.querySelectorAll(".card.playing").forEach((c) => c.classList.toggle("live", live));
  }
  function setPlaying(on) {
    state.playing = on;
    $("playBtn").textContent = on ? "⏸" : "▶";
    if (!on) document.querySelectorAll(".card.playing").forEach((c) => c.classList.remove("live"));
  }
  function showNowPlaying(st) {
    state.current = st;
    $("player").hidden = false;
    $("npName").textContent = st.n;
    $("npLogo").outerHTML = logoHTML(st, "npLogo");
    updateFavBtn();
  }
  function startStation(st) {
    showNowPlaying(st);
    state.recent = [st.id, ...state.recent.filter((id) => id !== st.id)].slice(0, 20);
    LS.set("ar.recent", state.recent);
    LS.set("ar.last", st.id);
    engine.play(st);
    render();
  }
  function step(d) {
    const list = state.list.length ? state.list : state.all;
    const i = list.findIndex((s) => {
      var _a;
      return s.id === ((_a = state.current) == null ? void 0 : _a.id);
    });
    startStation(list[(i + d + list.length) % list.length]);
  }
  $("playBtn").onclick = () => state.playing ? engine.stop() : state.current && startStation(state.current);
  $("nextBtn").onclick = () => step(1);
  $("prevBtn").onclick = () => step(-1);
  function updateFavBtn() {
    const on = state.current && state.favs.has(state.current.id);
    $("favBtn").textContent = on ? "★" : "☆";
    $("favBtn").classList.toggle("on", !!on);
  }
  $("favBtn").onclick = () => {
    var _a;
    const id = (_a = state.current) == null ? void 0 : _a.id;
    if (!id) return;
    if (state.favs.has(id)) {
      state.favs.delete(id);
      toast("أُزيلت من المفضلة");
    } else {
      state.favs.add(id);
      toast("أُضيفت إلى المفضلة ★");
    }
    LS.set("ar.favs", [...state.favs]);
    updateFavBtn();
    render();
  };
  $("sleepBtn").onclick = () => $("sleepSheet").hidden = false;
  $("sleepSheet").onclick = (e) => {
    var _a;
    const b = e.target.closest("button[data-min]");
    if (b || e.target === $("sleepSheet")) $("sleepSheet").hidden = true;
    if (!b) return;
    const min = +b.dataset.min;
    (_a = engine.sleep) == null ? void 0 : _a.call(engine, min);
    clearInterval(state.sleepTimer);
    state.sleepAt = min ? Date.now() + min * 6e4 : 0;
    updateSleep();
    if (min) {
      state.sleepTimer = setInterval(updateSleep, 15e3);
      toast(`سيتوقف التشغيل بعد ${b.textContent}`);
    } else toast("أُلغي المؤقت");
  };
  function updateSleep() {
    const left = state.sleepAt - Date.now();
    if (state.sleepAt && left <= 0) {
      clearInterval(state.sleepTimer);
      state.sleepAt = 0;
      engine.stop();
      toast("أُوقف التشغيل بالمؤقت");
    }
    $("sleepLabel").textContent = state.sleepAt ? `${Math.ceil(left / 6e4)} د` : "مؤقت";
    $("sleepBtn").classList.toggle("on", !!state.sleepAt);
  }
  const webEngine = (() => {
    const MAX_RETRIES = 40;
    const s = {
      st: null,
      idx: 0,
      attempt: 0,
      want: false,
      liveOnce: false,
      retries: 0,
      hls: null,
      timer: null,
      retryTimer: null,
      lastTime: -1,
      stuckSince: 0
    };
    const hasMS = "mediaSession" in navigator;
    const msState = (v) => {
      if (hasMS) try {
        navigator.mediaSession.playbackState = v;
      } catch {
      }
    };
    function cleanup() {
      clearTimeout(s.timer);
      clearTimeout(s.retryTimer);
      if (s.hls) {
        s.hls.destroy();
        s.hls = null;
      }
      audio.removeAttribute("src");
      audio.load();
    }
    function load(st, idx, reconnect2) {
      var _a;
      cleanup();
      if (!reconnect2) {
        s.liveOnce = false;
        s.retries = 0;
      }
      s.st = st;
      s.idx = idx;
      s.want = true;
      const attempt = ++s.attempt, url = st.u[idx];
      setPlaying(true);
      if (!reconnect2) setStatus("load", idx ? `تجربة رابط احتياطي ${idx}…` : "جارٍ الاتصال…");
      const isHls = st.h || /\.m3u8(\?|$)/i.test(url);
      if (isHls && !audio.canPlayType("application/vnd.apple.mpegurl") && ((_a = window.Hls) == null ? void 0 : _a.isSupported())) {
        s.hls = new Hls({ enableWorker: true, manifestLoadingMaxRetry: 4, levelLoadingMaxRetry: 4 });
        s.hls.on(Hls.Events.ERROR, (_, d) => {
          if (d.fatal) fail(attempt);
        });
        s.hls.loadSource(url);
        s.hls.attachMedia(audio);
      } else audio.src = url;
      audio.play().catch((err) => {
        if (err.name !== "AbortError") fail(attempt);
      });
      s.timer = setTimeout(() => {
        if (audio.readyState < 3) fail(attempt);
      }, 15e3);
      s.lastTime = -1;
      s.stuckSince = Date.now();
      if (hasMS && !reconnect2) {
        const art = st.l && !(SECURE_PAGE && st.l.startsWith("http:")) ? [{ src: st.l, sizes: "512x512" }] : [{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }];
        navigator.mediaSession.metadata = new MediaMetadata({ title: st.n, artist: `${st.cn} · ${st.kn}`, album: "الإذاعات العربية", artwork: art });
      }
      msState("playing");
    }
    function fail(attempt) {
      if (!s.st || !s.want || attempt !== s.attempt) return;
      if (s.liveOnce) {
        reconnect();
        return;
      }
      if (s.idx + 1 < s.st.u.length) {
        load(s.st, s.idx + 1, false);
        return;
      }
      giveUp("تعذّر تشغيل هذه المحطة حالياً");
    }
    function reconnect() {
      if (s.retries >= MAX_RETRIES) {
        giveUp("انقطع البث ولم تنجح إعادة الاتصال");
        return;
      }
      s.attempt++;
      const n = ++s.retries, delay = Math.min(1e3 * 2 ** Math.min(n - 1, 4), 15e3);
      const idx = (s.idx + (n > 2 ? 1 : 0)) % s.st.u.length;
      clearTimeout(s.timer);
      clearTimeout(s.retryTimer);
      setStatus("load", `انقطع الاتصال — إعادة الاتصال (${n})…`);
      s.retryTimer = setTimeout(() => s.want && load(s.st, idx, true), delay);
    }
    function giveUp(msg) {
      cleanup();
      s.want = false;
      setPlaying(false);
      setStatus("err", msg);
      msState("paused");
    }
    function stop() {
      s.want = false;
      s.attempt++;
      cleanup();
      setPlaying(false);
      setStatus("", "متوقف");
      msState("paused");
    }
    audio.addEventListener("playing", () => {
      clearTimeout(s.timer);
      s.liveOnce = true;
      s.retries = 0;
      s.stuckSince = Date.now();
      setStatus("live", "يبث الآن");
      msState("playing");
    });
    audio.addEventListener("waiting", () => s.want && setStatus("load", "جارٍ التحميل…"));
    audio.addEventListener("error", () => {
      if (audio.getAttribute("src")) fail(s.attempt);
    });
    audio.addEventListener("ended", () => fail(s.attempt));
    audio.addEventListener("pause", () => {
      if (s.want && audio.getAttribute("src")) setTimeout(() => {
        if (s.want && audio.paused) audio.play().catch(() => reconnect());
      }, 1500);
    });
    setInterval(() => {
      if (!s.want || !s.liveOnce || s.retryTimer && s.retries) return;
      if (audio.currentTime !== s.lastTime) {
        s.lastTime = audio.currentTime;
        s.stuckSince = Date.now();
        return;
      }
      if (Date.now() - s.stuckSince > 12e3) {
        s.stuckSince = Date.now();
        fail(s.attempt);
      }
    }, 3e3);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && s.want && audio.paused && s.st) load(s.st, s.idx, true);
    });
    window.addEventListener("online", () => {
      if (s.want && s.st) load(s.st, s.idx, true);
    });
    if (hasMS) {
      const h = (a, f) => {
        try {
          navigator.mediaSession.setActionHandler(a, f);
        } catch {
        }
      };
      h("play", () => state.current && startStation(state.current));
      h("pause", stop);
      h("stop", stop);
      h("nexttrack", () => step(1));
      h("previoustrack", () => step(-1));
    }
    audio.volume = LS.get("ar.vol", 0.8);
    return { play: (st) => load(st, 0, false), stop, setVolume: (v) => {
      audio.volume = v;
    } };
  })();
  const nativeEngine = window.NativeRadio && (() => {
    window.onNativeRadio = (ev, text, id) => {
      var _a;
      if (id && id !== ((_a = state.current) == null ? void 0 : _a.id)) {
        const st = state.all.find((s) => s.id === id);
        if (st) {
          showNowPlaying(st);
          state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 20);
          LS.set("ar.recent", state.recent);
          LS.set("ar.last", id);
          render();
        }
      }
      if (ev === "playing") {
        setPlaying(true);
        setStatus("live", "يبث الآن");
      } else if (ev === "loading") {
        setPlaying(true);
        setStatus("load", text || "جارٍ الاتصال…");
      } else if (ev === "stopped") {
        setPlaying(false);
        setStatus("", "متوقف");
      } else if (ev === "error") {
        setPlaying(false);
        setStatus("err", text || "تعذّر تشغيل هذه المحطة حالياً");
      } else if (ev === "sleepdone") {
        state.sleepAt = 0;
        clearInterval(state.sleepTimer);
        updateSleep();
      }
    };
    const item = (s) => ({ id: s.id, name: s.n, subtitle: `${s.cn} · ${s.kn}`, urls: s.u, logo: s.l || "", hls: !!s.h });
    return {
      play: (st) => {
        setPlaying(true);
        setStatus("load", "جارٍ الاتصال…");
        let queue = state.list.some((s) => s.id === st.id) ? state.list : [st];
        let index = queue.findIndex((s) => s.id === st.id);
        if (queue.length > 300) {
          const from = Math.max(0, index - 150);
          queue = queue.slice(from, from + 300);
          index -= from;
        }
        window.NativeRadio.play(JSON.stringify({ queue: queue.map(item), index }));
      },
      stop: () => window.NativeRadio.stop(),
      setVolume: (v) => window.NativeRadio.setVolume(v),
      sleep: (min) => window.NativeRadio.sleep(min)
    };
  })();
  const engine = nativeEngine || webEngine;
  $("vol").value = LS.get("ar.vol", 0.8);
  $("vol").oninput = (e) => {
    engine.setVolume(+e.target.value);
    LS.set("ar.vol", +e.target.value);
  };
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      $("playBtn").click();
    } else if (e.key === "ArrowLeft") step(1);
    else if (e.key === "ArrowRight") step(-1);
    else if (e.key === "/" || e.ctrlKey && e.key === "f") {
      e.preventDefault();
      $("q").focus();
    }
  });
  if ("serviceWorker" in navigator && !window.NativeRadio && !window.radioHost && (SECURE_PAGE || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {
    });
  }
  loadStations().catch(() => toast("تعذّر تحميل قائمة المحطات", 5e3));
})();
