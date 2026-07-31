import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, "dist");
const ASSETS_DIR = path.join(ROOT, "assets");

const VALID_TYPES = new Set(["road", "mtb", "gravel"]);
const VALID_LEVELS = new Set(["official", "amateur"]);
const VALID_MODES = new Set(["online", "offline"]);
const VALID_PRECISIONS = new Set(["exact", "range", "approx"]);
const DEFAULT_START_TIME = "10:00";
const TIMEZONE_OFFSET = "+06:00";
const DEFAULT_IMAGES = {
  mtb: "./assets/races/mtb.jpg",
};

const MONTHS_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const SEASON_MONTHS = ["Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь"];

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long" });

function stylesCacheKey(css) {
  return createHash("sha256").update(css).digest("hex").slice(0, 12);
}

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

function isoLocalDate(d) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthNameFromDate(d) {
  if (!d) return null;
  return MONTHS_RU[d.getMonth()];
}

function parseStartTime(value, index) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
    throw new Error(`Запись #${index + 1}: startTime должно быть в формате HH:MM`);
  }
  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) {
    throw new Error(`Запись #${index + 1}: некорректное startTime`);
  }
  return value;
}

function resolveImagePath(value, index) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(`Запись #${index + 1}: image должно быть строкой`);
  }
  if (value.includes("..") || value.startsWith("/") || /^https?:\/\//i.test(value)) {
    throw new Error(`Запись #${index + 1}: image должно быть относительным путём внутри assets/`);
  }
  const normalized = value.replace(/^\.?\/?assets\//, "");
  return `./assets/${normalized}`;
}

function normalizeRace(raw, index) {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Запись #${index + 1}: некорректный объект`);
  }

  if (!raw.name || !raw.organizer) {
    throw new Error(`Запись #${index + 1}: обязательны поля name и organizer`);
  }

  if (!VALID_TYPES.has(raw.type)) {
    throw new Error(`Запись #${index + 1}: type должен быть road, mtb или gravel`);
  }

  if (!VALID_LEVELS.has(raw.level)) {
    throw new Error(`Запись #${index + 1}: level должен быть official или amateur`);
  }

  if (!VALID_MODES.has(raw.mode)) {
    throw new Error(`Запись #${index + 1}: mode должен быть online или offline`);
  }

  const datePrecision = raw.datePrecision || "exact";
  if (!VALID_PRECISIONS.has(datePrecision)) {
    throw new Error(`Запись #${index + 1}: неизвестный datePrecision`);
  }

  const start = toDate(raw.date?.start || raw.date);
  const end = toDate(raw.date?.end || raw.date);
  const startTime = parseStartTime(raw.startTime, index);
  let image = resolveImagePath(raw.image, index);
  if (!image && raw.type === "mtb") {
    image = DEFAULT_IMAGES.mtb;
  }

  if (startTime && datePrecision !== "exact") {
    throw new Error(`Запись #${index + 1}: startTime допустимо только для exact`);
  }

  return {
    name: raw.name,
    organizer: raw.organizer,
    organizerUrl: raw.organizerUrl || null,
    eventUrl: raw.eventUrl || null,
    resultsUrl: raw.resultsUrl || null,
    type: raw.type,
    level: raw.level,
    mode: raw.mode,
    datePrecision,
    start: isoLocalDate(start),
    end: isoLocalDate(end || start),
    dateText: raw.dateText || null,
    startTime,
    image,
    month: monthNameFromDate(start),
  };
}

function formatRaceDate(race) {
  if (race.dateText && race.datePrecision === "approx") {
    return race.dateText;
  }
  if (!race.start) {
    return race.dateText || "Дата не указана";
  }

  const start = toDate(race.start);
  const end = toDate(race.end);

  let label;
  if (end && race.start !== race.end) {
    label = `${dateFormatter.format(start)} — ${dateFormatter.format(end)}`;
  } else {
    label = dateFormatter.format(start);
  }

  if (race.startTime && race.datePrecision === "exact") {
    label = `${label}, ${race.startTime}`;
  }

  return label;
}

function sortRacesByStartDate(a, b) {
  if (!a.start && !b.start) return 0;
  if (!a.start) return 1;
  if (!b.start) return -1;
  return a.start.localeCompare(b.start);
}

function prepareRaces(races) {
  return races
    .map((raw, index) => {
      const race = normalizeRace(raw, index);
      return {
        ...race,
        dateLabel: formatRaceDate(race),
        countdownTime: race.startTime || DEFAULT_START_TIME,
      };
    })
    .sort(sortRacesByStartDate);
}

function serializeRacesJson(races) {
  return JSON.stringify(races).replace(/</g, "\\u003c");
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

  const races = prepareRaces(parsed.races);
  const stylesUrl = `./styles.css?v=${stylesCacheKey(stylesText)}`;
  const racesJson = serializeRacesJson(races);

  const pageHtml = pageTemplateText
    .replace("{{STYLES_URL}}", stylesUrl)
    .replace("{{RACES_JSON}}", racesJson)
    .replace("{{RACE_COUNT}}", String(races.length))
    .replace("{{TIMEZONE_OFFSET}}", TIMEZONE_OFFSET)
    .replace("{{DEFAULT_START_TIME}}", DEFAULT_START_TIME)
    .replace("{{SEASON_MONTHS_JSON}}", JSON.stringify(SEASON_MONTHS));

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

  console.log(`Сборка завершена: dist/index.html (${races.length} стартов)`);
}

main().catch((error) => {
  console.error(`Ошибка сборки: ${error.message}`);
  process.exitCode = 1;
});
