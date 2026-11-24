const app = document.querySelector("#app");
const snow = document.querySelector(".snow");
const MAX_PARTICIPANTS = 200;

function makeSnow() {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 32; i += 1) {
    const flake = document.createElement("span");
    flake.className = "snowflake";
    flake.style.setProperty("--left", `${Math.random() * 100}%`);
    flake.style.setProperty("--size", `${2 + Math.random() * 4}px`);
    flake.style.setProperty("--opacity", `${0.3 + Math.random() * 0.55}`);
    flake.style.setProperty("--duration", `${9 + Math.random() * 13}s`);
    flake.style.setProperty("--delay", `${-Math.random() * 20}s`);
    flake.style.setProperty("--drift", `${Math.round(Math.random() * 100 - 50)}px`);
    fragment.append(flake);
  }
  snow.append(fragment);
}

function encodeDraw(draw) {
  const bytes = new TextEncoder().encode(JSON.stringify(draw));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeDraw(token) {
  const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const draw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!draw || draw.version !== 1 || !Array.isArray(draw.people) || !Array.isArray(draw.assignments)) {
    throw new Error("Nieprawidłowy format losowania.");
  }
  if (draw.people.length < 2 || draw.people.length > MAX_PARTICIPANTS || draw.people.length !== draw.assignments.length) {
    throw new Error("Nieprawidłowa liczba uczestników.");
  }
  const people = draw.people;
  const normalized = people.map((name) => typeof name === "string" ? name.trim().toLocaleLowerCase("pl") : "");
  if (normalized.some((name) => !name) || new Set(normalized).size !== people.length) {
    throw new Error("Lista uczestników zawiera nieprawidłowe lub powtórzone imiona.");
  }
  const recipients = draw.assignments.map((name) => typeof name === "string" ? name : "");
  if (recipients.some((name, index) => !people.includes(name) || name === people[index]) ||
      new Set(recipients).size !== people.length) {
    throw new Error("Losowanie nie spełnia zasad — utwórz nowe.");
  }
  if (draw.budget !== null && (typeof draw.budget !== "number" || !Number.isFinite(draw.budget) || draw.budget < 0)) {
    throw new Error("Nieprawidłowy budżet.");
  }
  return draw;
}

function randomInt(max) {
  const range = 0x100000000;
  const limit = range - (range % max);
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % max;
}

function makeDraw(people, budget) {
  const assignments = [...people];
  do {
    for (let i = assignments.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [assignments[i], assignments[j]] = [assignments[j], assignments[i]];
    }
  } while (assignments.some((person, index) => person === people[index]));
  return { version: 1, people, assignments, budget };
}

function drawFromUrl() {
  const match = window.location.hash.match(/^#santa=([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  return decodeDraw(match[1]);
}

function createIntro() {
  return `
    <section class="intro">
      <span class="ornament" aria-hidden="true">✳</span>
      <span class="eyebrow">Najpiękniejsza tradycja</span>
      <h1>Podaruj komuś<br><em>odrobinę magii.</em></h1>
      <p class="intro-copy">Rodzinne losowanie prezentów, które zostawia niespodziankę w tajemnicy aż do świąt.</p>
      <div class="steps" aria-label="Jak to działa">
        <span class="step"><span class="step-number">1</span>Dodaj bliskich</span>
        <span class="step"><span class="step-number">2</span>Wylosuj</span>
        <span class="step"><span class="step-number">3</span>Podaruj radość</span>
      </div>
    </section>`;
}

function participantLabel(count) {
  if (count === 1) return "1 osoba";
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  return `${count} ${lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14) ? "osoby" : "osób"}`;
}

function renderCreate() {
  app.innerHTML = `${createIntro()}
    <section class="card" aria-labelledby="card-title">
      <div class="card-heading">
        <div><h2 id="card-title">Zacznijmy losowanie</h2><p class="card-subtitle">Wpisz imiona — każde w osobnej linijce.</p></div>
        <span class="card-icon" aria-hidden="true">🎄</span>
      </div>
      <form id="draw-form" novalidate>
        <label class="field-label" for="names">Uczestnicy <span class="field-hint">minimum 2 osoby</span></label>
        <textarea id="names" name="names" placeholder="np.&#10;Babcia&#10;Tata&#10;Kasia&#10;Michał" required></textarea>
        <div class="input-row">
          <label class="field-label" for="budget">Budżet <span class="field-hint">opcjonalnie</span></label>
          <div class="input-suffix"><input id="budget" name="budget" type="number" min="0" max="1000000" step="1" placeholder="np. 100" inputmode="numeric"><span>zł</span></div>
        </div>
        <p id="form-error" class="form-error" role="alert"></p>
        <button class="primary-button" type="submit">Wylosuj prezenty <span aria-hidden="true">→</span></button>
        <p class="privacy-note">Wyniki pozostają w jednym linku — bez konta i bez zapisywania danych na serwerze.</p>
      </form>
    </section>`;

  document.querySelector("#draw-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const rawNames = document.querySelector("#names").value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
    const uniqueNames = rawNames.map((name) => name.toLocaleLowerCase("pl"));
    const error = document.querySelector("#form-error");
    if (rawNames.length < 2) {
      error.textContent = "Dodaj co najmniej dwie osoby, aby móc wylosować prezenty.";
      return;
    }
    if (rawNames.length > MAX_PARTICIPANTS) {
      error.textContent = `Możesz dodać maksymalnie ${MAX_PARTICIPANTS} osób.`;
      return;
    }
    if (new Set(uniqueNames).size !== rawNames.length) {
      error.textContent = "Każda osoba musi mieć unikalne imię. Usuń powtórzone wpisy.";
      return;
    }

    const budgetInput = document.querySelector("#budget").value;
    const budget = budgetInput === "" ? null : Number(budgetInput);
    if (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget > 1000000)) {
      error.textContent = "Wpisz poprawny budżet od 0 do 1 000 000 zł.";
      return;
    }
    try {
      const draw = makeDraw(rawNames, budget);
      const link = new URL(window.location.href);
      link.hash = `santa=${encodeDraw(draw)}`;
      history.replaceState(null, "", link);
      renderOrganizer(link.href, draw);
    } catch (drawError) {
      error.textContent = "Nie udało się wykonać losowania w tej przeglądarce. Spróbuj ponownie.";
      console.error("Losowanie nie powiodło się:", drawError);
    }
  });
}

function renderOrganizer(link, draw) {
  const count = draw.people.length;
  app.innerHTML = `${createIntro()}
    <section class="card" aria-labelledby="card-title">
      <div class="card-heading">
        <div><h2 id="card-title">Losowanie gotowe!</h2><p class="card-subtitle">${participantLabel(count)} ${count === 1 ? "ma" : "mają"} już swoje tajemnicze zadanie.</p></div>
        <span class="card-icon" aria-hidden="true">✨</span>
      </div>
      <div class="share-box">
        <label class="share-label" for="share-link">Jeden wspólny link dla wszystkich</label>
        <div class="share-controls">
          <input class="share-url" id="share-link" type="text" readonly>
          <button class="secondary-button" id="copy-link" type="button">Kopiuj link</button>
        </div>
      </div>
      ${draw.budget === null ? "" : `<p class="notice">Umówiony budżet: <strong>${draw.budget} zł</strong>. Widać go wszystkim uczestnikom.</p>`}
      <p class="notice"><strong>Ważne:</strong> Ten link zawiera wszystkie wyniki losowania. Udostępniaj go tylko uczestnikom — osoby z dostępem do linku mogą technicznie odczytać całe losowanie.</p>
      <button class="primary-button" id="new-draw" type="button">Utwórz nowe losowanie</button>
    </section>`;
  const input = document.querySelector("#share-link");
  input.value = link;
  document.querySelector("#copy-link").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(link);
      button.textContent = "Skopiowano!";
      window.setTimeout(() => { button.textContent = "Kopiuj link"; }, 2200);
    } catch (error) {
      input.focus();
      input.select();
      button.textContent = "Zaznaczono — skopiuj";
      console.error("Nie udało się skopiować linku:", error);
    }
  });
  document.querySelector("#new-draw").addEventListener("click", resetApp);
}

function renderParticipant(draw) {
  const count = draw.people.length;
  app.innerHTML = `${createIntro()}
    <section class="card" aria-labelledby="card-title">
      <div class="card-heading">
        <div><h2 id="card-title">Kto kryje się za ekranem?</h2><p class="card-subtitle">Wybierz swoje imię i sprawdź, komu podarujesz radość.</p></div>
        <span class="card-icon" aria-hidden="true">🎁</span>
      </div>
      <p class="participant-count">${participantLabel(count)} ${count === 1 ? "bierze" : "biorą"} udział${draw.budget === null ? "." : ` · budżet: ${draw.budget} zł.`}</p>
      <label class="select-label" for="participant">Wybierz swoje imię</label>
      <select id="participant" aria-describedby="participant-error"><option value="">Wybierz z listy…</option></select>
      <p class="form-error" id="participant-error" role="alert"></p>
      <button class="primary-button" id="reveal-button" type="button">Pokaż mój prezent <span aria-hidden="true">→</span></button>
      <p class="privacy-note">Nie pokazuj ekranu innym — niespodzianka będzie tylko Twoja.</p>
    </section>`;
  const select = document.querySelector("#participant");
  draw.people.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.append(option);
  });
  document.querySelector("#reveal-button").addEventListener("click", () => {
    const index = draw.people.indexOf(select.value);
    if (index < 0) {
      document.querySelector("#participant-error").textContent = "Najpierw wybierz swoje imię z listy.";
      select.focus();
      return;
    }
    renderGift(select.value, draw.assignments[index]);
  });
}

function renderGift(name, recipient) {
  app.innerHTML = `${createIntro()}
    <section class="card" aria-labelledby="card-title">
      <div class="card-heading">
        <div><h2 id="card-title">Ciii… to tajemnica!</h2><p class="card-subtitle">Witaj, <strong id="participant-name"></strong>. Twój prezent już czeka.</p></div>
        <span class="card-icon" aria-hidden="true">🔔</span>
      </div>
      <div class="gift-stage">
        <div class="gift" id="gift" aria-hidden="true"><div class="gift-box"></div><div class="gift-lid"></div><div class="gift-bow"></div></div>
        <p class="gift-caption" id="gift-caption">Gotowy na swoją świąteczną misję?</p>
        <p class="result-name" id="result-name" hidden></p>
        <p class="result-caption" id="result-caption" hidden>Niech ten prezent wywoła wielki uśmiech! ♥</p>
      </div>
      <button class="primary-button" id="open-gift" type="button">Odkryj, kogo wylosowałeś</button>
    </section>`;
  document.querySelector("#participant-name").textContent = name;
  const result = document.querySelector("#result-name");
  result.textContent = recipient;
  document.querySelector("#open-gift").addEventListener("click", (event) => {
    const button = event.currentTarget;
    document.querySelector("#gift").classList.add("open");
    document.querySelector("#gift-caption").textContent = "W tym roku obdarujesz…";
    button.hidden = true;
    window.setTimeout(() => {
      result.hidden = false;
      document.querySelector("#result-caption").hidden = false;
      celebrate();
    }, 420);
  }, { once: true });
}

function celebrate() {
  const colors = ["#c44c49", "#d4a84e", "#47775b", "#e7c56e", "#fffefa"];
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 60; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.setProperty("--drift", `${Math.round(Math.random() * 180 - 90)}px`);
    piece.style.animationDelay = `${Math.random() * 0.6}s`;
    piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    fragment.append(piece);
  }
  document.body.append(fragment);
  window.setTimeout(() => document.querySelectorAll(".confetti").forEach((piece) => piece.remove()), 3700);
}

function renderInvalidLink() {
  app.innerHTML = `${createIntro()}
    <section class="card" aria-labelledby="card-title">
      <div class="card-heading"><div><h2 id="card-title">Nie udało się odczytać linku</h2><p class="card-subtitle">Link jest niepełny, uszkodzony albo zawiera nieprawidłowe losowanie.</p></div><span class="card-icon" aria-hidden="true">🕯️</span></div>
      <p class="notice">Poproś organizatora o ponowne wysłanie oryginalnego linku. Wyników nie da się odtworzyć bez niego.</p>
      <button class="primary-button" id="reset-link" type="button">Wróć do tworzenia losowania</button>
    </section>`;
  document.querySelector("#reset-link").addEventListener("click", resetApp);
}

function resetApp() {
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  renderCreate();
}

function start() {
  makeSnow();
  if (!window.location.hash) {
    renderCreate();
    return;
  }
  try {
    const draw = drawFromUrl();
    if (!draw) {
      renderInvalidLink();
      return;
    }
    renderParticipant(draw);
  } catch (error) {
    console.error("Nieprawidłowy link losowania:", error);
    renderInvalidLink();
  }
}

start();
