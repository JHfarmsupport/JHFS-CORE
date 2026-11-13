// Login, tilmelding af passkey og logud. Bruger SimpleWebAuthnBrowser fra /static/webauthn.js.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  async function post(url, data) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data ?? {}),
      credentials: "same-origin",
    });
    const svar = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(svar.fejl || "Noget gik galt");
    return svar;
  }

  function venlig(e) {
    if (e && e.name === "NotAllowedError") return "Annulleret eller tiden løb ud. Prøv igen.";
    if (e && e.name === "InvalidStateError") return "Denne enhed har allerede en passkey til Core.";
    return (e && e.message) || "Noget gik galt";
  }

  function knap(id, fejlId, arbejde) {
    const k = $(id);
    k.addEventListener("click", async () => {
      $(fejlId).textContent = "";
      k.disabled = true;
      try {
        await arbejde();
      } catch (e) {
        $(fejlId).textContent = venlig(e);
      } finally {
        k.disabled = false;
      }
    });
  }

  const side = document.body.dataset.side;

  if (side === "login") {
    knap("login-knap", "login-fejl", async () => {
      const { udfordringId, valg } = await post("/auth/login/start");
      const svar = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: valg });
      await post("/auth/login/slut", { udfordringId, svar });
      location.href = "/";
    });
    knap("gendan-knap", "gendan-fejl", async () => {
      const { tilmeldingskode } = await post("/auth/gendan", { kode: $("gendan-kode").value });
      location.href = "/tilmeld#kode=" + encodeURIComponent(tilmeldingskode);
    });
    $("vis-gendan").addEventListener("click", (e) => {
      e.preventDefault();
      $("login").classList.add("skjult");
      $("gendan").classList.remove("skjult");
    });
    $("vis-login").addEventListener("click", (e) => {
      e.preventDefault();
      $("gendan").classList.add("skjult");
      $("login").classList.remove("skjult");
    });
  }

  if (side === "tilmeld") {
    const kode = new URLSearchParams(location.hash.slice(1)).get("kode") || "";
    // Fjern koden fra adresselinjen, så den ikke ligger i historikken.
    history.replaceState(null, "", "/tilmeld");
    if (!kode) $("tilmeld-fejl").textContent = "Linket mangler en kode. Bed om et nyt link.";
    knap("tilmeld-knap", "tilmeld-fejl", async () => {
      const { udfordringId, valg } = await post("/auth/tilmeld/start", { kode });
      const svar = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: valg });
      const res = await post("/auth/tilmeld/slut", { kode, udfordringId, svar, navn: $("enhed").value });
      if (res.gendannelseskoder) {
        const liste = $("kode-liste");
        liste.replaceChildren(...res.gendannelseskoder.map((k) => Object.assign(document.createElement("div"), { textContent: k })));
        $("tilmeld").classList.add("skjult");
        $("koder").classList.remove("skjult");
      } else {
        location.href = "/";
      }
    });
    $("koder-gemt").addEventListener("click", () => (location.href = "/"));
  }

  if (side === "forside") {
    fetch("/auth/mig", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((mig) => ($("velkommen").textContent = "Velkommen, " + mig.navn))
      .catch(() => (location.href = "/login"));
    $("logud-knap").addEventListener("click", async () => {
      await post("/auth/logud").catch(() => {});
      location.href = "/login";
    });
  }
})();
