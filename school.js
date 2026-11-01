/* ===========================================================================
   Basic Spanish — SCHOOL EDITION  (school.js)
   Loaded ONLY when the page is opened with ?edition=school (see the small
   loader at the end of index.html). It never runs in the normal app or web.

   What it does:
     - "Activate app" screen: scan the school QR (camera) or paste the code.
     - Verifies the licence signature (your ECDSA key) and, if valid, opens
       lessons 1–28 (+ dictionary + agenda) until the licence end date.
     - Home subtitle shows "Licensed to <school>" + a "Licence Terms" button.
     - Hides "The Books" section.
     - When the licence ends, everything locks and the subtitle goes back to
       "Extra Lessons" (the normal expiry machinery already does the locking).
   =========================================================================== */
(function () {
  "use strict";
  // make sure the flag sticks for the whole session
  try { if (/[?&]edition=school/.test(location.search)) sessionStorage.setItem("bsEdition", "school"); } catch (e) {}

  /* ---- same public key as the generator (SIGPUB) : only Alberto can sign ---- */
  var SIGPUB_HEX = "04abf5c19cbad17da59a7228832995878f51854c00de79643d8390626e3c24735eb67e5c124b08688eece1fe5b88c2145153ee4417d2cce4c4a2254e6ac1146ee6";
  var LS_LIC = "bs-school-lic";   // the licence string (so we can re-apply keys on reload)
  var LS_META = "bs-school";       // {s:school, x:expiryMs}

  var te = new TextEncoder(), td = new TextDecoder();
  function hexToBytes(h) { return new Uint8Array(h.match(/../g).map(function (x) { return parseInt(x, 16); })); }
  function b64urlToBytes(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
    return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); });
  }
  function getMeta() { try { return JSON.parse(localStorage.getItem(LS_META)); } catch (e) { return null; } }

  /* ---- verify + parse a licence string:  b64url(payload) + "." + b64url(sig) ---- */
  async function parseLicence(lic) {
    lic = String(lic || "").trim();
    var dot = lic.indexOf(".");
    if (dot < 1) throw new Error("format");
    var payload = b64urlToBytes(lic.slice(0, dot));
    var sig = b64urlToBytes(lic.slice(dot + 1));
    var key = await crypto.subtle.importKey("raw", hexToBytes(SIGPUB_HEX), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    var ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, payload);
    if (!ok) throw new Error("sig");
    var data = JSON.parse(td.decode(payload));
    if (data.t !== "school" || !Array.isArray(data.k) || data.k.length < 28) throw new Error("content");
    return data; // {t:"school", v, s:school, x:expiryMs (0 = forever), k:[28 base64 keys]}
  }

  /* ---- apply the keys/expiry into the app's own stores ---- */
  function applyLicence(data) {
    for (var i = 0; i < 28; i++) {
      unlocked[i] = data.k[i];
      if (data.x && data.x > 0) UEXP[i] = data.x; else delete UEXP[i];
    }
    saveUnlocked(); saveExp();
  }

  // is a stored licence still valid right now?
  function licensedNow() {
    var m = getMeta();
    if (!m) return null;
    if (m.x && m.x > 0 && trustedNow() > m.x) return null; // expired
    return m;
  }

  // on load: if we have a saved licence that is still valid, make sure the keys
  // are in place (survives a progress-data wipe). If expired, clean up.
  async function restore() {
    var m = getMeta();
    if (!m) return;
    if (m.x && m.x > 0 && trustedNow() > m.x) { cleanupExpired(); return; }
    // re-apply keys if any lesson key is missing
    var need = false; for (var i = 0; i < 28; i++) if (!unlocked[i]) { need = true; break; }
    if (need) {
      try { var lic = localStorage.getItem(LS_LIC); if (lic) applyLicence(await parseLicence(lic)); } catch (e) {}
    }
  }

  function cleanupExpired() {
    try { localStorage.removeItem(LS_META); } catch (e) {}
    // the app's checkExpiry() removes the unlocked keys + UEXP when the date passes
  }

  /* ---- Licence Terms (approved text) ---- */
  function licenceTerms() {
    var L = [
      ["1. One licence per school.", "Each licence (the QR code) unlocks the app for the students of a single school or institution, for the period shown. Use by another school or institution requires a separate licence."],
      ["2. No copying or sharing.", "The licensee (the institution that activated this app) may not copy, distribute, resell, or transfer the software, its content, or its licence code to any other person or institution."],
      ["3. Content is protected.", "All lessons, audio, images, and text are the author's intellectual property and may not be extracted, reproduced, or reused."],
      ["4. Traceable copies.", "Each licence is marked with the licensee's name (“Licensed to …”). Shared or leaked copies can be traced to the institution they were issued to."],
      ["5. For educational use by the licensee only.", ""],
      ["6. Limitation of liability.", "To the extent permitted by law, the author is not liable for any indirect or incidental damage arising from the use of the app."],
      ["7. Term and governing law.", "The licence opens the app until the end date shown, and then the lessons close automatically. This agreement is governed by the laws of Jamaica, and the licence also ends automatically if these terms are broken."]
    ];
    var P = [
      ["What is stored:", "a student's name, an optional photo, and their learning progress (stars and lessons completed)."],
      ["Where it is stored:", "only on the student's own device. Nothing is uploaded to the internet, sent to the author, or shared with anyone else."],
      ["Removing data:", "a student's data can be deleted at any time by removing their profile or uninstalling the app."],
      ["Children:", "the app is meant to be used by students under their teacher's supervision."]
    ];
    overlay("Licence Terms", function (close) {
      var body = [
        h("div", { cls: "ovh" }, h("span", { cls: "ovi" }, "📜"), h("h2", {}, "Basic Spanish — Software Licence Agreement")),
        h("p", { cls: "rintro" }, "Copyright © 2026 Alberto Garrido Hernández. All rights reserved."),
        h("p", {}, "Thank you for choosing Basic Spanish for your students. This licence gives your school full access to the app for the licensed period. Please keep in mind a few simple terms:")
      ];
      L.forEach(function (t) { body.push(h("p", {}, h("b", {}, t[0]), t[1] ? (" " + t[1]) : "")); });
      body.push(h("h2", { style: "margin-top:14px" }, "Privacy"));
      body.push(h("p", {}, "Basic Spanish is made for classroom use and runs fully offline."));
      P.forEach(function (t) { body.push(h("p", {}, h("b", {}, t[0]), " " + t[1])); });
      body.push(h("p", {}, "We hope your students enjoy learning Spanish. For more licences or any question, contact basicspanish26@gmail.com."));
      body.push(h("div", { cls: "controls" }, h("button", { cls: "btn primary", on: { click: close } }, "OK")));
      return body;
    });
  }

  /* ---- Activate screen (scan QR or paste) ---- */
  var jsqrLoading = null;
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve();
    if (jsqrLoading) return jsqrLoading;
    jsqrLoading = new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = "jsQR.js?v=1";
      s.onload = res; s.onerror = function () { rej(new Error("qr lib")); };
      document.head.appendChild(s);
    });
    return jsqrLoading;
  }

  async function finishActivation(lic, msgEl, close) {
    try {
      var data = await parseLicence(lic);
      if (data.x && data.x > 0 && trustedNow() > data.x) throw new Error("expired");
      applyLicence(data);
      try { localStorage.setItem(LS_LIC, String(lic).trim()); } catch (e) {}
      try { localStorage.setItem(LS_META, JSON.stringify({ s: data.s || "", x: data.x || 0 })); } catch (e) {}
      close();
      home();
    } catch (e) {
      var m = String(e && e.message || e);
      if (msgEl) {
        msgEl.className = "tmsg bad";
        msgEl.textContent = m === "expired" ? "⏰ Esta licencia ya venció. Pide una nueva. · This licence has expired."
          : m === "sig" ? "❌ Esta licencia no es válida. · This licence is not valid."
          : m === "format" || m === "content" ? "❌ No se pudo leer esa licencia. · Could not read that licence."
          : "❌ Licencia equivocada. Revísala. · Wrong licence.";
      }
    }
  }

  function activateScreen() {
    var meta = getMeta();
    var expired = meta && meta.x && meta.x > 0 && trustedNow() > meta.x;
    var stream = null, raf = 0, scanning = false;
    function stopCam() { scanning = false; if (raf) cancelAnimationFrame(raf); if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} stream = null; } }
    overlay("Activate", function (close) {
      var msg = h("p", { cls: "tmsg", "aria-live": "polite" });
      var videoWrap = h("div", { cls: "sch-scan", style: "display:none" });
      var video = document.createElement("video"); video.setAttribute("playsinline", ""); video.muted = true;
      var canvas = document.createElement("canvas");
      videoWrap.append(video);
      var scanHint = h("p", { cls: "rintro", style: "display:none;margin-top:8px" }, "Apunta la cámara al código QR. · Point the camera at the QR code.");
      var intro = h("p", { cls: "rintro" }, expired
        ? "El tiempo de esta licencia terminó. Escanea una licencia nueva para abrir todo otra vez. · This licence has ended. Scan a new one to open everything again."
        : "Escanea el QR que te dio tu escuela para abrir todas las clases. · Scan the QR from your school to open all the lessons.");

      function showScanning(on) {
        videoWrap.style.display = on ? "block" : "none";
        scanHint.style.display = on ? "block" : "none";
        intro.style.display = on ? "none" : "block";
        if (scanBtn) scanBtn.style.display = on ? "none" : "block";
      }

      async function startCam() {
        msg.className = "tmsg"; msg.textContent = "";
        try { await loadJsQR(); } catch (e) { msg.className = "tmsg bad"; msg.textContent = "No se pudo cargar el lector de QR. Usa «Pegar código». · Could not load the QR reader — use “Paste code”."; return; }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        } catch (e) { msg.className = "tmsg bad"; msg.textContent = "No se pudo abrir la cámara. Permite el acceso, o usa «Pegar código». · Could not open the camera."; return; }
        video.srcObject = stream; await video.play().catch(function () {});
        scanning = true; showScanning(true);
        var ctx = canvas.getContext("2d", { willReadFrequently: true });
        (function tick() {
          if (!scanning) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            var code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            if (code && code.data) { stopCam(); finishActivation(code.data, msg, close); return; }
          }
          raf = requestAnimationFrame(tick);
        })();
      }

      var scanBtn = h("button", { cls: "btn primary", on: { click: startCam } }, "📷 Escanear el QR · Scan the QR");
      var pasteWrap = h("div", { style: "display:none;margin-top:10px" });
      var ta = h("textarea", { cls: "sch-ta", rows: "3", placeholder: "Pega aquí la licencia · Paste the licence here", spellcheck: "false" });
      var pasteGo = h("button", { cls: "btn", on: { click: function () { finishActivation(ta.value, msg, close); } } }, "Activar · Activate");
      pasteWrap.append(ta, pasteGo);
      var pasteToggle = h("button", { cls: "tkey", on: { click: function () { stopCam(); showScanning(false); pasteWrap.style.display = pasteWrap.style.display === "none" ? "block" : "none"; } } }, "⌨️ Pegar código · Paste code");

      return [
        h("div", { cls: "ovh" }, h("span", { cls: "ovi" }, "🔑"), h("h2", {}, expired ? "⏰ Licencia vencida · Licence ended" : "Activate app")),
        videoWrap, scanHint, intro, scanBtn, pasteToggle, pasteWrap, msg
      ];
    }, function () { stopCam(); });
  }

  /* ---- patch the home screen for school edition ---- */
  function patchHome() {
    var app = document.getElementById("app"); if (!app) return;
    // only when the home hero is on screen
    var sub = app.querySelector(".hero .hsub");
    var books = document.getElementById("books");
    if (books) books.remove();
    if (!sub) return;
    var m = licensedNow();
    if (m && m.s) {
      sub.textContent = "Licensed to " + m.s;
      if (!sub.parentNode.querySelector(".sch-terms")) {
        var bt = h("button", { cls: "sch-terms", on: { click: licenceTerms } }, "Licence Terms");
        sub.insertAdjacentElement("afterend", bt);
      }
    } else {
      sub.textContent = "Extra Lessons";
    }
  }

  /* ---- wrap home()/render() so the patch runs after every draw ---- */
  function wrap(name) {
    if (typeof window[name] !== "function") return;
    var orig = window[name];
    window[name] = function () { var r = orig.apply(this, arguments); try { patchHome(); } catch (e) {} return r; };
  }

  /* ---- styles (injected, so index.html CSS is untouched) ---- */
  function injectCSS() {
    if (document.getElementById("sch-css")) return;
    var st = document.createElement("style"); st.id = "sch-css";
    st.textContent =
      ".sch-terms{display:inline-block;margin:6px auto 0;font:inherit;font-weight:700;font-size:12px;background:var(--surface,#fff);color:var(--teal,#0E6E78);border:2px solid var(--line,#cfe5e2);border-radius:99px;padding:4px 12px;cursor:pointer}" +
      ".sch-scan{margin:4px auto 12px;border-radius:14px;overflow:hidden;background:#000;width:100%;max-width:340px;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center}" +
      ".sch-scan video{width:100%;height:100%;object-fit:cover}" +
      ".sch-ta{width:100%;font:14px var(--mono,monospace);border:2px solid var(--line,#cfe5e2);border-radius:10px;padding:10px;background:var(--surface,#fff);color:var(--ink,#12343b)}" +
      ".tmsg.bad{color:var(--mango-ink,#b0233b)}";
    document.head.appendChild(st);
  }

  /* ---- boot ---- */
  async function boot() {
    injectCSS();
    try { await restore(); } catch (e) {}
    wrap("home"); wrap("render");
    if (licensedNow()) {
      // re-draw home so the now-open lessons + "Licensed to" show
      try { if (typeof cur === "undefined" || cur == null) home(); else patchHome(); } catch (e) { try { patchHome(); } catch (_) {} }
    } else {
      try { patchHome(); } catch (e) {}
      try { activateScreen(); } catch (e) {}
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
