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
  // a global flag index.html checks to drop the public web link / QR in the school edition
  try { window.BS_SCHOOL = true; } catch (e) {}

  /* ---- same public key as the generator (SIGPUB) : only Alberto can sign ---- */
  var SIGPUB_HEX = "04abf5c19cbad17da59a7228832995878f51854c00de79643d8390626e3c24735eb67e5c124b08688eece1fe5b88c2145153ee4417d2cce4c4a2254e6ac1146ee6";
  var LS_LIC = "bs-school-lic";   // the licence string (so we can re-apply keys on reload)
  var LS_META = "bs-school";       // {s:school, x:expiryMs}
  var LS_TEACHER = "bs-school-teacher";  // the school's own teacher name (typed in Settings), for the certificate

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
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } });
          try { var trk = stream.getVideoTracks()[0]; if (trk && trk.applyConstraints) trk.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(function () {}); } catch (e) {}
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
    // re-bind the ⚙️ gear to the wrapped openSettings (it was captured before school.js loaded, so demo kept the old menu)
    try {
      var gear = document.querySelector(".gearbtn");
      if (gear && !gear.getAttribute("data-sch")) {
        var ng = gear.cloneNode(true);           // cloning drops the old click listener
        ng.setAttribute("data-sch", "1");
        ng.addEventListener("click", function () { try { window.openSettings(); } catch (e) {} });
        gear.parentNode.replaceChild(ng, gear);
      }
    } catch (e) {}
    // only when the home hero is on screen
    var sub = app.querySelector(".hero .hsub");
    var books = document.getElementById("books");
    if (books) books.remove();
    if (!sub) return;
    var m = licensedNow();
    if (m && m.s) {
      sub.textContent = "Licensed to " + m.s;
      sub.classList.add("sch-lic");
      sub.style.color = "#1565C0";
      sub.style.fontWeight = "500";
      if (!sub.parentNode.querySelector(".sch-terms")) {
        var bt = h("button", { cls: "sch-terms", on: { click: licenceTerms } }, "Licence Terms");
        sub.insertAdjacentElement("afterend", bt);
      }
    } else {
      sub.textContent = "Extra Lessons";
      sub.classList.remove("sch-lic");
      sub.style.color = "";
      sub.style.fontWeight = "";
    }
  }

  /* ---- a locked lesson: tell the student to scan the school QR (no teacher-password unlock here) ---- */
  function schoolLockScreen(u, box, idx, unitTab) {
    box.append(h("div", { cls: "lockcard" },
      h("div", { cls: "lockic", "aria-hidden": "true" }, "🔒"),
      h("h2", {}, unitTab ? "Unidad bloqueada " : "Lección bloqueada "),
      h("p", { cls: "en2" }, unitTab ? "This unit is locked" : "This lesson is locked"),
      h("p", {}, "Escanea el QR de licencia de tu escuela para abrir todas las clases."),
      h("p", { cls: "en2" }, "Scan your school's licence QR to open all the lessons."),
      h("div", { cls: "inl" }, h("span", {}, "👨‍🏫 El profe explica · The teacher explains"), h("span", {}, "🎵 Una canción · A song"), h("span", {}, "🎮 Juegos · Games"), h("span", {}, "⭐ La prueba con estrellas · The quiz with stars")),
      h("button", { cls: "btn primary", on: { click: function () { try { activateScreen(); } catch (e) {} } } }, "📷 Escanear el QR · Scan the QR")));
  }

  /* ---- licence ended: one school-wide message (not a 28-item "ask your teacher to renew" list) ---- */
  function schoolCheckExpiry(rerender) {
    var now = trustedNow(), closed = [];
    for (var k in UEXP) { if (UEXP[k] && now > UEXP[k]) { delete unlocked[k]; delete UEXP[k]; closed.push(+k); } }
    if (closed.length) {
      saveUnlocked(); saveExp();
      try { cleanupExpired(); } catch (e) {}   // drop the licence meta so Home shows "Extra Lessons" again
      if (rerender) { try { if (typeof cur === "undefined" || cur == null) home(); else render(); } catch (e) {} }
      setTimeout(function () {
        overlay("Licence ended", function (c) {
          return [
            h("div", { cls: "ovh" }, h("span", { cls: "ovi" }, "⏰"), h("h2", {}, "Licencia vencida · Licence ended")),
            h("p", {}, "La licencia de tu escuela terminó. Tus estrellas y premios se quedan contigo. · Your school's licence has ended. You keep your stars and rewards."),
            h("p", {}, "Escanea un QR de licencia nuevo para abrir todo otra vez. · Scan a new licence QR to open everything again."),
            h("div", { cls: "controls" },
              h("button", { cls: "btn primary", on: { click: function () { c(); try { activateScreen(); } catch (e) {} } } }, "📷 Escanear QR · Scan QR"),
              h("button", { cls: "btn", on: { click: c } }, "OK"))
          ];
        });
      }, 300);
    }
    return closed;
  }

  /* ---- share without any public web link (text + share url) for the school edition ---- */
  function stripLink(text) {
    if (typeof text !== "string") return text;
    return text
      .replace(/https?:\/\/spanishflt\.github\.io\/?/gi, "")
      .replace(/\s*·?\s*(¡Aprende conmigo!\s*·\s*Learn with me:|Learn with me:|Basic Spanish:)\s*$/i, "")
      .replace(/\s+$/, "");
  }
  function schoolShareNow(P, fname, text, bt) {
    text = stripLink(text);
    if (bt) { if (bt.dataset.busy) return; bt.dataset.busy = "1"; setTimeout(function () { delete bt.dataset.busy; }, 1500); }
    if (!P.blob || (hasAppShare() && !P.b64)) { P.ready.then(function () { if (bt) delete bt.dataset.busy; schoolShareNow(P, fname, text, null); }); return; }
    if (hasAppShare()) { try { BasicSpanishApp.shareFile(P.b64, fname, "image/png", text); return; } catch (e) {} }
    var file = new File([P.blob], fname, { type: "image/png" });
    var fallback = function () { try { if (window.BasicSpanishApp && typeof BasicSpanishApp.saveFile === "function") { blobB64(P.blob).then(function (b) { BasicSpanishApp.saveFile(b, fname, "image/png"); }); return; } } catch (e) {} downloadPic(P.blob, fname); };
    if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], text: text, title: "Basic Spanish" }).catch(function (e) { if (e && (e.name === "AbortError" || e.name === "InvalidStateError")) return; fallback(); }); return; }
    if (navigator.share) { navigator.share({ text: text, title: "Basic Spanish" }).catch(function () {}); return; }  // no url in the school edition
    fallback();
  }

  /* ---- adapt ⚙️ Settings: add the licence, drop "Move my progress", rename the app ---- */
  function patchSettings() {
    var secs = document.querySelectorAll(".setsec");
    for (var j = 0; j < secs.length; j++) {
      var h3 = secs[j].querySelector("h3");
      if (!h3) continue;
      // remove the student-only "Move my progress" migration section
      if (h3.textContent.indexOf("Pasar mi progreso") >= 0 || h3.textContent.indexOf("Move my progress") >= 0) { secs[j].remove(); continue; }
      // rename "Basic Spanish – Extra Lessons" -> "Basic Spanish School" in the About section
      if (h3.textContent.indexOf("Acerca") >= 0) {
        var ps = secs[j].querySelectorAll("p");
        for (var p = 0; p < ps.length; p++) { var b = ps[p].querySelector("b"); if (b && b.textContent.indexOf("Extra Lessons") >= 0) b.textContent = "Basic Spanish School"; }
      }
    }
    var m = licensedNow();
    var about = null, s2 = document.querySelectorAll(".setsec");
    for (var i = 0; i < s2.length; i++) { var hd = s2[i].querySelector("h3"); if (hd && hd.textContent.indexOf("Acerca") >= 0) { about = s2[i]; break; } }
    if (!about) about = s2[0];
    if (!about || about.querySelector(".sch-lic-set") || about.querySelector(".sch-act-set")) return;

    // no licence yet (demo): give a way back to the Activate screen without closing the app
    if (!m || !m.s) {
      var boxA = h("div", { cls: "sch-act-set sch-lic-set" });
      boxA.appendChild(h("p", { cls: "rintro" }, "Escanea el QR de licencia de tu escuela para abrir todas las clases. · Scan your school's licence QR to open all the lessons."));
      boxA.appendChild(h("button", { cls: "btn primary", on: { click: function () { try { activateScreen(); } catch (e) {} } } }, "📷 Activar · Escanear licencia"));
      about.appendChild(boxA);
      return;
    }

    var boxL = h("div", { cls: "sch-lic-set" });
    boxL.appendChild(h("p", {}, h("b", {}, "🏫 Licence")));
    boxL.appendChild(h("p", {}, "Licensed to ", h("b", {}, m.s)));
    if (m.x && m.x > 0) {
      var fmt = new Date(m.x).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      boxL.appendChild(h("p", {}, "Valid until ", h("b", {}, fmt)));
    }
    about.appendChild(boxL);

    // the school types their own teacher name here; it appears on the students' certificates
    var boxT = h("div", { cls: "sch-lic-set" });
    boxT.appendChild(h("p", {}, h("b", {}, "🧑‍🏫 Teacher's name · Nombre del profesor")));
    boxT.appendChild(h("p", { cls: "rintro" }, "Sale en los certificados de tus alumnos. · Appears on your students' certificates."));
    var inp = h("input", { cls: "sch-inp", type: "text", placeholder: "Ej.: Mrs. Jane Brown", spellcheck: "false" });
    try { inp.value = (window.bsTeacherName ? bsTeacherName() : ""); } catch (e) {}
    var msg = h("span", { cls: "rintro", style: "margin-left:8px" });
    var sv = h("button", { cls: "sch-terms", on: { click: function () { try { localStorage.setItem(LS_TEACHER, (inp.value || "").trim()); msg.textContent = "✓"; setTimeout(function () { msg.textContent = ""; }, 1500); } catch (e) {} } } }, "Guardar · Save");
    boxT.appendChild(inp);
    boxT.appendChild(h("div", {}, sv, msg));
    about.appendChild(boxT);
  }

  /* ---- wrap a global fn so a patch runs after every call ---- */
  function wrapAfter(name, fn) {
    if (typeof window[name] !== "function") return;
    var orig = window[name];
    window[name] = function () { var r = orig.apply(this, arguments); try { fn(); } catch (e) {} setTimeout(function () { try { fn(); } catch (e) {} }, 0); return r; };
  }
  function wrap(name) { wrapAfter(name, patchHome); }

  /* ---- styles (injected, so index.html CSS is untouched) ---- */
  function injectCSS() {
    if (document.getElementById("sch-css")) return;
    var st = document.createElement("style"); st.id = "sch-css";
    st.textContent =
      ".hsub.sch-lic{font-size:13px;line-height:1.3;font-weight:500;color:#1565C0;text-align:left;overflow-wrap:anywhere;margin-top:7px}" +
      ".sch-terms{display:inline-block;margin:3px 0 10px;font:inherit;font-weight:700;font-size:12px;background:var(--surface,#fff);color:var(--teal,#0E6E78);border:2px solid var(--line,#cfe5e2);border-radius:99px;padding:5px 14px;cursor:pointer}" +
      ".sch-lic-set{margin-top:8px;border-top:1px solid var(--line,#e3efed);padding-top:8px}" +
      ".sch-inp{width:100%;box-sizing:border-box;border:2px solid var(--line,#cfe5e2);border-radius:10px;padding:8px;font:inherit;margin:4px 0}" +
      ".sch-scan{margin:4px auto 12px;border-radius:14px;overflow:hidden;background:#000;width:100%;max-width:340px;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center}" +
      ".sch-scan video{width:100%;height:100%;object-fit:cover}" +
      ".sch-ta{width:100%;font:14px var(--mono,monospace);border:2px solid var(--line,#cfe5e2);border-radius:10px;padding:10px;background:var(--surface,#fff);color:var(--ink,#12343b)}" +
      ".tmsg.bad{color:var(--mango-ink,#b0233b)}" +
      /* fix scroll-chaining: inner windows must not scroll the background when they reach the end */
      ".gm-win,.ovbox,.dict-list,.rlist,.cl-card,.sp-p,.screen,.thumbs{overscroll-behavior:contain}";
    document.head.appendChild(st);
  }

  /* ---- adapt the "How to use the app" guide for the offline school edition ---- */
  function schoolGuide() {
    if (typeof GUIDE === "undefined" || !Array.isArray(GUIDE)) return;
    function idx(kw) { for (var i = 0; i < GUIDE.length; i++) { if (GUIDE[i] && GUIDE[i][1] && GUIDE[i][1].indexOf(kw) >= 0) return i; } return -1; }
    var g;
    g = idx("Getting started");
    if (g >= 0) GUIDE[g] = ["🚀", "Primeros pasos · Getting started", [
      "<b>Esta app funciona sin internet.</b> Todo — las lecciones, el audio, el diccionario y la agenda — está dentro de la app. <b>No necesita internet.</b> · <b>This app works fully offline.</b> Everything is inside the app.",
      "<b>Para abrir todas las clases,</b> toca <b>📷 Escanear el QR</b> y escanea el <b>QR de licencia</b> que te da tu escuela. Mira <i>Licencia · Licence</i> aquí abajo. · Tap <b>Scan the QR</b> and scan the licence QR from your school.",
      "Abre la app y escribe tu nombre en <b>✏️ Tu nombre · Your name</b> (mira abajo).",
      "Sube el <b>volumen de medios</b> del teléfono para escuchar al profesor. · Turn up the media volume to hear the teacher."
    ]];
    g = idx("Unlocking lessons");
    if (g >= 0) GUIDE[g] = ["🔑", "Licencia · Licence", [
      "Sin licencia solo están abiertos la <b>🎁 clase de prueba</b> y las unidades extra. Con la licencia de tu escuela se abre <b>todo</b>: las 28 lecciones, el diccionario y la agenda, <b>hasta la fecha de vencimiento</b>. · With your school's licence everything opens until the end date.",
      "<b>Para activar:</b> toca <b>📷 Escanear el QR</b> y escanea el <b>QR que te da tu escuela</b>. Se abre todo de una vez — <b>no hace falta un código por cada teléfono</b>. · Scan the school's QR; everything opens at once.",
      "El nombre de la escuela aparece en el inicio como <b>Licensed to …</b>, y la misma licencia sirve en <b>cualquier teléfono</b> que escanee ese QR.",
      "Cuando la licencia termina, <b>tus estrellas, premios y notas se quedan contigo</b>; escanea un QR nuevo para abrir todo otra vez. · When it ends, your progress is kept; scan a new QR to open everything again.",
      "Mantén la <b>fecha y hora del teléfono correctas</b>. Si se atrasa la fecha a propósito, las lecciones se cierran hasta arreglarla."
    ]];
    g = idx("Move my progress"); if (g >= 0) GUIDE.splice(g, 1);
    g = idx("Offline");
    if (g >= 0) GUIDE[g] = ["📶", "Sin internet · Offline", [
      "La app funciona <b>sin internet</b>: las lecciones y el audio ya vienen dentro de ella. · The app works offline; the lessons and audio are already inside it.",
      "⚠️ Tus estrellas, premios, nombre, tema y notas se guardan <b>en este teléfono</b>. Si borras los datos de la app o la desinstalas, se pierden."
    ]];
    // remove any remaining item that talks about the web / downloading the app
    for (var i = 0; i < GUIDE.length; i++) {
      if (GUIDE[i] && Array.isArray(GUIDE[i][2])) {
        GUIDE[i][2] = GUIDE[i][2].filter(function (it) {
          return String(it).indexOf("spanishflt.github.io") < 0 && String(it).indexOf("Download the Android app") < 0 && String(it).indexOf("older Android app") < 0;
        });
      }
    }
  }

  /* ---- replace the ℹ️ "About your lessons" popup for the school edition ---- */
  function schoolInfoPopup() {
    window.lessonInfo = function () {
      overlay("About your lessons", function (close) {
        return [
          h("div", { cls: "ovh" }, h("span", { cls: "ovi", "aria-hidden": "true" }, "ℹ️"), h("h2", {}, "Sobre tus clases · About your lessons")),
          h("p", {}, "Con la licencia de tu escuela, ", h("b", {}, "todas las clases, el diccionario y la agenda"), " están abiertos en este teléfono ", h("b", {}, "hasta la fecha de vencimiento"), ". · With your school's licence, everything is open on this phone until the end date."),
          h("p", {}, "⭐ ", h("b", {}, "Estrellas · Stars: "), "estudia la lección con el profesor y haz la prueba para ganar estrellas."),
          h("p", {}, "Tus estrellas y tu progreso se guardan ", h("b", {}, "en este teléfono"), ", y los conservas aunque termine la licencia. · Your stars and progress are saved on this phone; you keep them even when the licence ends."),
          h("p", {}, "Solo se pierden si ", h("b", {}, "desinstalas la app"), " o ", h("b", {}, "borras sus datos"), " (Ajustes › Apps › Basic Spanish › Almacenamiento › Borrar datos)."),
          h("p", {}, "Si tienes algún problema, habla con tu profesor de español. · If you have a problem, talk to your Spanish teacher."),
          h("div", { cls: "controls" }, h("button", { cls: "btn primary", on: { click: close } }, "OK"))
        ];
      });
    };
  }

  /* ---- boot ---- */
  async function boot() {
    injectCSS();
    try { schoolGuide(); } catch (e) {}
    try { schoolInfoPopup(); } catch (e) {}
    // one licence opens everything, so per-lesson "open until / renew" notes don't fit the school model
    try { window.expiryNote = function () { return null; }; } catch (e) {}
    // a locked lesson in the school model means "no valid licence" -> scan the school QR, not a teacher password
    try { window.lockScreen = schoolLockScreen; } catch (e) {}
    // when the licence ends, everything closes at once -> one school message, not a per-lesson "ask your teacher to renew" list
    try { window.checkExpiry = schoolCheckExpiry; } catch (e) {}
    // the in-unit "buy the workbook at Old Harbour Primary School" cross-sell doesn't fit a school that bought a licence
    try { window.unitBooks = function () { return null; }; } catch (e) {}
    // share without the public web link (image watermark/QR handled in index.html via window.BS_SCHOOL)
    try { window.shareNow = schoolShareNow; } catch (e) {}
    // the licensee school name, taken from the licence (never typed by the student) -> drawn as a trace on the shared cards + certificate
    try { window.bsSchoolName = function () { try { var m = licensedNow(); return (m && m.s) ? String(m.s) : ""; } catch (e) { return ""; } }; } catch (e) {}
    // the school's OWN teacher name (typed by them in Settings) -> shown as the signing teacher on the certificate, instead of the author's
    try { window.bsTeacherName = function () { try { return (localStorage.getItem(LS_TEACHER) || "").trim(); } catch (e) { return ""; } }; } catch (e) {}
    // student name: written ONCE (the app's normal askName with its confirm); once saved it is locked.
    // No "teacher: fix name" button here (that needs the author's password, which schools don't have).
    try { window.nameInfo = schoolNameInfo; } catch (e) {}
    try { await restore(); } catch (e) {}
    wrap("home"); wrap("render"); wrapAfter("openSettings", patchSettings);
    if (licensedNow()) {
      // re-draw home so the now-open lessons + "Licensed to" show
      try { if (typeof cur === "undefined" || cur == null) home(); else patchHome(); } catch (e) { try { patchHome(); } catch (_) {} }
    } else {
      try { patchHome(); } catch (e) {}
      try { activateScreen(); } catch (e) {}
    }
  }

  /* ---- locked name (school): shows the saved name, photo button, no editing ---- */
  function schoolNameInfo() {
    overlay("Your name", function (close) {
      return [
        h("div", { cls: "ovh" }, h("span", { cls: "ovi" }, "👤"), h("h2", {}, (typeof RW !== "undefined" && RW && RW.name) ? RW.name : "")),
        h("p", {}, "🔒 Este nombre aparece en tu progreso y en tu certificado. No se puede cambiar. · This name appears on your progress card and certificate. It can't be changed."),
        h("button", { cls: "btn", on: { click: function () { close(); try { photoMenu(); } catch (e) {} } } }, (typeof RW !== "undefined" && RW && RW.photo) ? "📷 Mi foto · My photo" : "📷 Poner foto · Add photo"),
        h("button", { cls: "btn primary", on: { click: close } }, "OK")
      ];
    });
  }

  /* ---- (old) editable name — no longer used ---- */
  function schoolAskName(onDone) {
    var inp = h("input", { type: "text", maxlength: "40", placeholder: "Nombre y apellido · First and last name", autocomplete: "name" });
    try { inp.value = (typeof RW !== "undefined" && RW && RW.name) ? RW.name : ""; } catch (e) {}
    var msg = h("p", { cls: "tmsg", "aria-live": "polite" });
    overlay("Your name", function (close) {
      return [
        h("div", { cls: "ovh" }, h("span", { cls: "ovi" }, "👤"), h("h2", {}, "Tu nombre · Your name")),
        h("p", {}, "Escribe tu nombre y apellido. Sale en tu progreso y en tu certificado. · Write your first and last name. It appears on your progress and certificate."),
        h("div", { cls: "tform" }, inp, h("button", { cls: "btn primary", on: { click: function () {
          var v = (inp.value || "").trim().replace(/\s+/g, " ");
          if (v.length < 2) { msg.textContent = "✏️ Escribe tu nombre · Write your name"; try { inp.focus(); } catch (e) {} return; }
          RW.name = v; try { saveRW(); } catch (e) {} close(); try { refreshTop(); } catch (e) {} if (onDone) onDone();
        } } }, "💾 Guardar · Save")),
        msg,
        h("button", { cls: "btn", on: { click: function () { close(); try { photoMenu(); } catch (e) {} } } }, (typeof RW !== "undefined" && RW && RW.photo) ? "📷 Mi foto · My photo" : "📷 Poner foto · Add photo"),
        h("button", { cls: "btn", on: { click: close } }, "OK")
      ];
    });
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
