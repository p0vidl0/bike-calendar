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

/** Локальная календарная дата для data-атрибутов (клиентский пересчёт статуса). */
function isoLocalDate(d) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function sortRacesByStartDate(a, b) {
  if (!a.start && !b.start) return 0;
  if (!a.start) return 1;
  if (!b.start) return -1;
  return a.start - b.start;
}

/** Название мероприятия как ссылка, если задан eventUrl. */
function raceNameHtml(race) {
  const name = escapeHtml(race.name);
  if (!race.eventUrl) return name;
  return `<a class="race-event-link" href="${escapeHtml(race.eventUrl)}" target="_blank" rel="noreferrer">${name}</a>`;
}

/** Имя организатора как ссылка, если задан organizerUrl. */
function organizerHtml(race) {
  const label = escapeHtml(race.organizer);
  if (!race.organizerUrl) return label;
  return `<a class="race-organizer-link" href="${escapeHtml(race.organizerUrl)}" target="_blank" rel="noreferrer">${label}</a>`;
}

function renderCalendar(races) {
  const now = new Date();
  const prepared = races
    .map(normalizeRace)
    .map((race) => ({ ...race, status: getStatus(race, now) }))
    .sort(sortRacesByStartDate);

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
        const name = raceNameHtml(race);
        const organizer = organizerHtml(race);
        const statusClass = `status-${race.status.key}`;
        const statusLabel = escapeHtml(race.status.label);
        const statusBadge = `<span class="status ${statusClass} race-status-label${race.status.key === "upcoming" ? " hidden" : ""}" data-role="race-status">${statusLabel}</span>`;
        const dp = escapeHtml(race.datePrecision);
        const ds = escapeHtml(isoLocalDate(race.start));
        const de = escapeHtml(isoLocalDate(race.end));
        const resultsLink = race.resultsUrl
          ? `<a class="results-link" href="${escapeHtml(race.resultsUrl)}" target="_blank" rel="noreferrer">Результаты</a>`
          : "";

        return `
          <article class="race-card" data-status="${escapeHtml(race.status.key)}" data-date-precision="${dp}" data-start="${ds}" data-end="${de}">
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
    .sort(sortRacesByStartDate);

  return prepared.map((race) => {
    const date = escapeHtml(formatRaceDate(race));
    const name = raceNameHtml(race);
    const organizer = organizerHtml(race);
    const resultsCell = race.resultsUrl
      ? `<a class="results-link" href="${escapeHtml(race.resultsUrl)}" target="_blank" rel="noreferrer">Открыть</a>`
      : "—";

    const dp = escapeHtml(race.datePrecision);
    const ds = escapeHtml(isoLocalDate(race.start));
    const de = escapeHtml(isoLocalDate(race.end));

    return `
      <tr class="race-row" data-status="${escapeHtml(race.status.key)}" data-date-precision="${dp}" data-start="${ds}" data-end="${de}">
        <td>${date}</td>
        <td>${name}</td>
        <td>${organizer}</td>
        <td>${resultsCell}</td>
      </tr>
    `;
  }).join("");
}

async function main() {
  const [pageTemplateText, yamlText, stylesText] = await Promise.all([
    fs.readFile(path.join(ROOT, "index.template.html"), "utf8"),
    fs.readFile(path.join(ROOT, "data", "races.yaml"), "utf8"),
    fs.readFile(path.join(ROOT, "styles.css"), "utf8"),
  ]);

  const parsed = yaml.load(yamlText);
  if (!parsed || !Array.isArray(parsed.races)) {
    throw new Error("Формат data/races.yaml неверный: ожидается массив races");
  }

  const pageHtml = pageTemplateText
    .replace("{{CALENDAR_CONTENT}}", renderCalendar(parsed.races))
    .replace("{{TABLE_CONTENT}}", renderTable(parsed.races));

  const tableRedirectHtml = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0;url=./index.html" />
    <title>Переход…</title>
    <script>location.replace("./index.html");</script>
  </head>
  <body>
    <p><a href="./index.html">Календарь</a></p>
  </body>
</html>
`;

  await fs.mkdir(DIST_DIR, { recursive: true });
  await fs.cp(ASSETS_DIR, path.join(DIST_DIR, "assets"), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(DIST_DIR, "index.html"), pageHtml, "utf8"),
    fs.writeFile(path.join(DIST_DIR, "table.html"), tableRedirectHtml, "utf8"),
    fs.writeFile(path.join(DIST_DIR, "styles.css"), stylesText, "utf8"),
  ]);

  console.log("Сборка завершена: dist/index.html (dist/table.html — редирект на index.html)");
}

main().catch((error) => {
  console.error(`Ошибка сборки: ${error.message}`);
  process.exitCode = 1;
});
