import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, "dist");
const ASSETS_DIR = path.join(ROOT, "assets");
const MONTHS_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long" });

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toDate(value) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

function normalizeRace(raw, index) {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Запись #${index + 1}: некорректный объект`);
  }

  if (!raw.name || !raw.organizer) {
    throw new Error(`Запись #${index + 1}: обязательны поля name и organizer`);
  }

  const datePrecision = raw.datePrecision || "exact";
  const start = toDate(raw.date?.start || raw.date);
  const end = toDate(raw.date?.end || raw.date);

  return { ...raw, datePrecision, start, end };
}

function getStatus(race, now) {
  if (race.datePrecision === "approx") {
    return { key: "approx", label: "Дата уточняется" };
  }
  if (!race.start || !race.end) {
    return { key: "approx", label: "Дата уточняется" };
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (race.end < today) return { key: "past", label: "Прошла" };
  if (race.start <= today && race.end >= today) return { key: "current", label: "Сегодня" };
  return { key: "upcoming", label: "Скоро" };
}

function formatRaceDate(race) {
  if (race.dateText && race.datePrecision === "approx") {
    return race.dateText;
  }
  if (!race.start) {
    return race.dateText || "Дата не указана";
  }
  if (race.end && race.start.getTime() !== race.end.getTime()) {
    return `${dateFormatter.format(race.start)} - ${dateFormatter.format(race.end)}`;
  }
  return dateFormatter.format(race.start);
}

function monthKey(race) {
  return race.start ? race.start.getMonth() : 12;
}

function monthTitle(key) {
  return key === 12 ? "С неопределенной датой" : MONTHS_RU[key];
}

function renderCalendar(races) {
  const now = new Date();
  const prepared = races
    .map(normalizeRace)
    .map((race) => ({ ...race, status: getStatus(race, now) }))
    .sort((a, b) => {
      if (!a.start && !b.start) return 0;
      if (!a.start) return 1;
      if (!b.start) return -1;
      return a.start - b.start;
    });

  const groups = new Map();
  for (const race of prepared) {
    const key = monthKey(race);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(race);
  }

  return [...groups.keys()]
    .sort((a, b) => a - b)
    .map((key) => {
      const cards = groups.get(key).map((race) => {
        const date = escapeHtml(formatRaceDate(race));
        const name = escapeHtml(race.name);
        const organizer = escapeHtml(race.organizer);
        const statusClass = `status-${race.status.key}`;
        const statusLabel = escapeHtml(race.status.label);
        const statusBadge = race.status.key === "upcoming"
          ? ""
          : `<span class="status ${statusClass}">${statusLabel}</span>`;
        const resultsLink = race.resultsUrl
          ? `<a class="results-link" href="${escapeHtml(race.resultsUrl)}" target="_blank" rel="noreferrer">Результаты</a>`
          : "";

        return `
          <article class="race-card" data-status="${escapeHtml(race.status.key)}">
            <div class="race-date">${date}</div>
            <h3 class="race-name">${name}</h3>
            <p class="race-organizer">Организатор: ${organizer}</p>
            <div class="race-footer">
              ${statusBadge}
              ${resultsLink}
            </div>
          </article>
        `;
      }).join("");

      return `
        <section class="month-group">
          <h2 class="month-title">${monthTitle(key)}</h2>
          <div class="race-list">${cards}</div>
        </section>
      `;
    })
    .join("");
}

function renderTable(races) {
  const now = new Date();
  const prepared = races
    .map(normalizeRace)
    .map((race) => ({ ...race, status: getStatus(race, now) }))
    .sort((a, b) => {
      if (!a.start && !b.start) return 0;
      if (!a.start) return 1;
      if (!b.start) return -1;
      return a.start - b.start;
    });

  return prepared.map((race) => {
    const date = escapeHtml(formatRaceDate(race));
    const name = escapeHtml(race.name);
    const organizer = escapeHtml(race.organizer);
    const resultsCell = race.resultsUrl
      ? `<a class="results-link" href="${escapeHtml(race.resultsUrl)}" target="_blank" rel="noreferrer">Открыть</a>`
      : "—";

    return `
      <tr class="race-row" data-status="${escapeHtml(race.status.key)}">
        <td>${date}</td>
        <td>${name}</td>
        <td>${organizer}</td>
        <td>${resultsCell}</td>
      </tr>
    `;
  }).join("");
}

async function main() {
  const [cardsTemplateText, tableTemplateText, yamlText, stylesText] = await Promise.all([
    fs.readFile(path.join(ROOT, "index.template.html"), "utf8"),
    fs.readFile(path.join(ROOT, "table.template.html"), "utf8"),
    fs.readFile(path.join(ROOT, "data", "races.yaml"), "utf8"),
    fs.readFile(path.join(ROOT, "styles.css"), "utf8"),
  ]);

  const parsed = yaml.load(yamlText);
  if (!parsed || !Array.isArray(parsed.races)) {
    throw new Error("Формат data/races.yaml неверный: ожидается массив races");
  }

  const cardsHtml = cardsTemplateText.replace("{{CALENDAR_CONTENT}}", renderCalendar(parsed.races));
  const tableHtml = tableTemplateText.replace("{{TABLE_CONTENT}}", renderTable(parsed.races));

  await fs.mkdir(DIST_DIR, { recursive: true });
  await fs.cp(ASSETS_DIR, path.join(DIST_DIR, "assets"), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(DIST_DIR, "index.html"), cardsHtml, "utf8"),
    fs.writeFile(path.join(DIST_DIR, "table.html"), tableHtml, "utf8"),
    fs.writeFile(path.join(DIST_DIR, "styles.css"), stylesText, "utf8"),
  ]);

  console.log("Сборка завершена: dist/index.html, dist/table.html");
}

main().catch((error) => {
  console.error(`Ошибка сборки: ${error.message}`);
  process.exitCode = 1;
});
