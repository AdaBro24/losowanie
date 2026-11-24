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
  if (!draw || ![1, 2].includes(draw.version) || !Array.isArray(draw.people) || !Array.isArray(draw.assignments)) {
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
  const restrictions = draw.version === 1 ? people.map(() => []) : draw.restrictions;
  if (!Array.isArray(restrictions) || restrictions.length !== people.length ||
      restrictions.some((list, giver) => !Array.isArray(list) ||
        list.some((recipient) => !Number.isInteger(recipient) || recipient < 0 || recipient >= people.length || recipient === giver) ||
        new Set(list).size !== list.length)) {
    throw new Error("Link zawiera nieprawidłowe wykluczenia.");
  }
  if (draw.version === 2 && (typeof draw.id !== "string" || !/^[a-f0-9]{24}$/.test(draw.id))) {
    throw new Error("Link nie zawiera prawidłowego identyfikatora losowania.");
  }
  if (recipients.some((recipient, giver) => restrictions[giver].includes(people.indexOf(recipient)))) {
    throw new Error("Losowanie narusza zapisane wykluczenia.");
  }
  if (draw.budget !== null && (typeof draw.budget !== "number" || !Number.isFinite(draw.budget) || draw.budget < 0)) {
    throw new Error("Nieprawidłowy budżet.");
  }
  return { ...draw, restrictions };
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

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function findAssignment(people, restrictions) {
  const count = people.length;
  const recipientOwners = Array(count).fill(-1);

  function assign(giver, visited) {
    const available = shuffle(Array.from({ length: count }, (_, index) => index)
      .filter((recipient) => recipient !== giver && !restrictions[giver].has(recipient)));
    for (const recipient of available) {
      if (visited[recipient]) continue;
      visited[recipient] = true;
      if (recipientOwners[recipient] === -1 || assign(recipientOwners[recipient], visited)) {
        recipientOwners[recipient] = giver;
        return true;
      }
    }
    return false;
  }

  for (const giver of shuffle(Array.from({ length: count }, (_, index) => index))) {
    if (!assign(giver, Array(count).fill(false))) return null;
  }
  const assignments = Array(count);
  recipientOwners.forEach((giver, recipient) => { assignments[giver] = people[recipient]; });
  return assignments;
}

function makeDraw(people, budget, restrictions) {
  const assignments = findAssignment(people, restrictions);
  if (!assignments) return null;
  const idBytes = crypto.getRandomValues(new Uint8Array(12));
  return {
    version: 2,
    id: Array.from(idBytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
    people,
    assignments,
    budget,
    restrictions: restrictions.map((blocked) => [...blocked]),
  };
}

function drawFromUrl() {
  const match = window.location.hash.match(/^#santa=([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  return decodeDraw(match[1]);
}

function createIntro() {
  return `
    <section class="intro">
      <span class="eyebrow">Losowanie rodzinne</span>
      <h1>Rodzinne<br><em>losowanie</em></h1>
      <p class="intro-copy">Dodaj uczestników, ustaw wykluczenia i wylosuj jedną osobę dla każdego.</p>
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
        <details class="exclusions">
          <summary>Wykluczenia — opcjonalnie</summary>
          <p class="exclusions-copy">Wybierz osoby, których dana osoba nie może wylosować. Zaznacz „w obie strony”, aby wykluczenie działało wzajemnie.</p>
          <div class="exclusion-list" id="exclusion-list"></div>
          <button class="secondary-button add-exclusion" id="add-exclusion" type="button" disabled>Dodaj wykluczenie</button>
        </details>
        <div class="input-row">
          <label class="field-label" for="budget">Budżet <span class="field-hint">opcjonalnie</span></label>
          <div class="input-suffix"><input id="budget" name="budget" type="number" min="0" max="1000000" step="1" placeholder="np. 100" inputmode="numeric"><span>zł</span></div>
        </div>
        <p id="form-error" class="form-error" role="alert"></p>
        <button class="primary-button" type="submit">Wylosuj prezenty <span aria-hidden="true">→</span></button>
        <p class="privacy-note">Wyniki pozostają w jednym linku — bez konta i bez zapisywania danych na serwerze.</p>
      </form>
    </section>`;

    const namesField = document.querySelector("#names");
    const exclusionList = document.querySelector("#exclusion-list");
    const addExclusionButton = document.querySelector("#add-exclusion");
    const getNames = () => namesField.value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);

    function updateExclusionOptions() {
      const names = getNames();
      addExclusionButton.disabled = names.length < 2;
      exclusionList.querySelectorAll("select").forEach((select) => {
        const previousValue = select.value;
        select.replaceChildren(new Option("Wybierz osobę…", ""));
        names.forEach((name) => select.add(new Option(name, name)));
        if (names.includes(previousValue)) select.value = previousValue;
      });
    }

    function addExclusionRow() {
      const row = document.createElement("div");
      row.className = "exclusion-row";
      row.innerHTML = `
        <label class="exclusion-field">Ta osoba
          <select class="exclusion-giver" aria-label="Osoba, która nie losuje"></select>
        </label>
        <label class="exclusion-field">Nie może wylosować
          <select class="exclusion-recipient" aria-label="Osoba wykluczona"></select>
        </label>
        <label class="mutual-option"><input class="exclusion-mutual" type="checkbox"> W obie strony</label>
        <button class="remove-exclusion" type="button" aria-label="Usuń wykluczenie">×</button>`;
      exclusionList.append(row);
      updateExclusionOptions();
      row.querySelector(".remove-exclusion").addEventListener("click", () => row.remove());
    }

    namesField.addEventListener("input", updateExclusionOptions);
    addExclusionButton.addEventListener("click", addExclusionRow);

  document.querySelector("#draw-form").addEventListener("submit", (event) => {
    event.preventDefault();
      const rawNames = getNames();
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

    const restrictions = rawNames.map(() => new Set());
    const nameIndexes = new Map(rawNames.map((name, index) => [name, index]));
    for (const row of exclusionList.querySelectorAll(".exclusion-row")) {
      const giver = row.querySelector(".exclusion-giver").value;
      const recipient = row.querySelector(".exclusion-recipient").value;
      if (!giver || !recipient) {
        error.textContent = "Uzupełnij obie osoby w każdym wykluczeniu albo usuń pusty wiersz.";
        return;
      }
      if (giver === recipient) {
        error.textContent = "Nie dodawaj siebie jako wykluczenia — nikt i tak nie może wylosować samego siebie.";
        return;
      }
      const giverIndex = nameIndexes.get(giver);
      const recipientIndex = nameIndexes.get(recipient);
      restrictions[giverIndex].add(recipientIndex);
      if (row.querySelector(".exclusion-mutual").checked) {
        restrictions[recipientIndex].add(giverIndex);
      }
    }

    try {
      const draw = makeDraw(rawNames, budget, restrictions);
      if (!draw) {
        error.textContent = "Przy tych wykluczeniach nie da się przydzielić każdemu innej osoby. Zmień lub usuń część wykluczeń.";
        return;
      }
      const link = new URL(window.location.href);
      link.searchParams.delete("organizer");
      link.hash = `santa=${encodeDraw(draw)}`;
      const organizerLink = new URL(link);
      organizerLink.searchParams.set("organizer", "1");
      history.replaceState(null, "", organizerLink);
      renderOrganizer(link.href, draw, link.hash.slice("#santa=".length));
    } catch (drawError) {
      error.textContent = "Nie udało się wykonać losowania w tej przeglądarce. Spróbuj ponownie.";
      console.error("Losowanie nie powiodło się:", drawError);
    }
  });
}

function loadStatuses(key, count) {
  const emptyStatuses = Array(count).fill(false);
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return { statuses: emptyStatuses, warning: "" };
    const statuses = JSON.parse(stored);
    if (!Array.isArray(statuses) || statuses.length !== count || statuses.some((status) => typeof status !== "boolean")) {
      throw new Error("Nieprawidłowy format checklisty.");
    }
    return { statuses, warning: "" };
  } catch (error) {
    console.error("Nie udało się odczytać checklisty:", error);
    return { statuses: emptyStatuses, warning: "Nie udało się odczytać checklisty z tej przeglądarki." };
  }
}

function renderOrganizerChecklist(draw, token) {
  const key = `santa-status-${draw.id || token}`;
  const loaded = loadStatuses(key, draw.people.length);
  const statuses = loaded.statuses;
  const warning = document.querySelector("#tracker-warning");
  warning.textContent = loaded.warning;

  function addPerson(list, name, index, checked) {
    const item = document.createElement("li");
    const label = document.createElement("label");
    label.className = "tracker-person";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.dataset.index = String(index);
    const personName = document.createElement("span");
    personName.textContent = name;
    const status = document.createElement("small");
    status.textContent = checked ? "potwierdzono" : "oczekuje";
    label.append(checkbox, personName, status);
    item.append(label);
    list.append(item);
  }

  function updateChecklist() {
    const pending = document.querySelector("#pending-list");
    const completed = document.querySelector("#completed-list");
    const completedCount = statuses.filter(Boolean).length;
    const pendingCount = statuses.length - completedCount;
    pending.replaceChildren();
    completed.replaceChildren();
    document.querySelector("#tracker-count").textContent = `Potwierdzili ${completedCount} / ${statuses.length}`;
    document.querySelector("#pending-heading").textContent = `Nie potwierdzili jeszcze (${pendingCount})`;
    document.querySelector("#completed-heading").textContent = `Potwierdzili odkrycie (${completedCount})`;
    statuses.forEach((checked, index) => {
      addPerson(checked ? completed : pending, draw.people[index], index, checked);
    });
    if (pendingCount === 0) {
      const allDone = document.createElement("li");
      allDone.className = "tracker-note";
      allDone.textContent = "Wszyscy potwierdzili odkrycie swojego wyniku.";
      pending.append(allDone);
    }
  }

  document.querySelector("#tracker").addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[data-index]");
    if (!checkbox) return;
    statuses[Number(checkbox.dataset.index)] = checkbox.checked;
    try {
      localStorage.setItem(key, JSON.stringify(statuses));
      warning.textContent = "";
    } catch (error) {
      console.error("Nie udało się zapisać checklisty:", error);
      warning.textContent = "Nie udało się zapisać zmian. Checklista może nie być dostępna po zamknięciu tej przeglądarki.";
    }
    updateChecklist();
  });
  updateChecklist();
}

function renderOrganizer(link, draw, token) {
  const count = draw.people.length;
  app.innerHTML = `${createIntro()}
    <section class="card" aria-labelledby="card-title">
      <div class="card-heading">
        <div><h2 id="card-title">Losowanie gotowe</h2><p class="card-subtitle">Dodano ${count} uczestników.</p></div>
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
      <section class="tracker" id="tracker" aria-labelledby="tracker-title">
        <div class="tracker-heading"><h3 id="tracker-title">Potwierdzenia uczestników</h3><span class="tracker-count" id="tracker-count"></span></div>
        <p class="tracker-note">Po otrzymaniu potwierdzenia od uczestnika zaznacz jego imię. Lista zapisuje się tylko w tej przeglądarce i nie aktualizuje się automatycznie.</p>
        <h4 id="pending-heading"></h4>
        <ul class="tracker-list" id="pending-list"></ul>
        <details class="completed-details">
          <summary id="completed-heading"></summary>
          <ul class="tracker-list completed-list" id="completed-list"></ul>
        </details>
        <p class="tracker-warning" id="tracker-warning" role="status"></p>
      </section>
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
  renderOrganizerChecklist(draw, token);
}

function renderParticipant(draw) {
  const count = draw.people.length;
  app.innerHTML = `${createIntro()}
    <section class="card" aria-labelledby="card-title">
      <div class="card-heading">
        <div><h2 id="card-title">Wybierz swoje imię</h2><p class="card-subtitle">Pokażemy Ci osobę, którą wylosowałeś.</p></div>
        <span class="card-icon" aria-hidden="true">🎁</span>
      </div>
      <p class="participant-count">${participantLabel(count)} ${count === 1 ? "bierze" : "biorą"} udział${draw.budget === null ? "." : ` · budżet: ${draw.budget} zł.`}</p>
      <label class="select-label" for="participant">Wybierz swoje imię</label>
      <select id="participant" aria-describedby="participant-error"><option value="">Wybierz z listy…</option></select>
      <p class="form-error" id="participant-error" role="alert"></p>
      <button class="primary-button" id="reveal-button" type="button">Pokaż mój prezent <span aria-hidden="true">→</span></button>
      <p class="privacy-note">Upewnij się, że nikt nie widzi Twojego ekranu.</p>
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
        <div><h2 id="card-title">Twój wynik</h2><p class="card-subtitle">Uczestnik: <strong id="participant-name"></strong>.</p></div>
        <span class="card-icon" aria-hidden="true">🔔</span>
      </div>
      <div class="gift-stage">
        <div class="gift" id="gift" aria-hidden="true"><div class="gift-box"></div><div class="gift-lid"></div><div class="gift-bow"></div></div>
        <p class="gift-caption" id="gift-caption">Kliknij, aby zobaczyć swój wynik.</p>
        <p class="result-name" id="result-name" hidden></p>
        <p class="result-caption" id="result-caption" hidden>Osoba, której kupisz prezent.</p>
      </div>
      <button class="primary-button" id="open-gift" type="button">Odkryj, kogo wylosowałeś</button>
    </section>`;
  document.querySelector("#participant-name").textContent = name;
  const result = document.querySelector("#result-name");
  result.textContent = recipient;
  document.querySelector("#open-gift").addEventListener("click", (event) => {
    const button = event.currentTarget;
    document.querySelector("#gift").classList.add("open");
    document.querySelector("#gift-caption").textContent = "Wylosowana osoba:";
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
    if (new URLSearchParams(window.location.search).get("organizer") === "1") {
      const participantUrl = new URL(window.location.href);
      participantUrl.searchParams.delete("organizer");
      renderOrganizer(participantUrl.href, draw, window.location.hash.slice("#santa=".length));
      return;
    }
    renderParticipant(draw);
  } catch (error) {
    console.error("Nieprawidłowy link losowania:", error);
    renderInvalidLink();
  }
}

start();
