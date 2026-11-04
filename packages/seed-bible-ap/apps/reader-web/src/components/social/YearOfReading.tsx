// MY YEAR OF READING — seedbible.org's History grid on Today (TodayPane/useReadingHistoryTimeline + its
// ReadingHistoryTimeline): a column per week and a row per weekday for the year, Mon/Wed/Fri and the months labelled,
// each day shaded in four steps by time spent reading (full at an hour, as theirs), a Less/More legend and the years
// to pick from. The days come from this reader's own reading history (the device, and the vault once signed in);
// tapping a day lists what was read then.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import type { RecentReading } from "../../state/records/history";
import { useI18n } from "../../i18n";
import {
  ReadingHistoryTimeline,
  type ReadingHistoryContentData,
  type ReadingHistoryTimelineFooterData,
  type Range,
} from "./ReadingHistoryTimeline";
import { localDateKey } from "./VerseOfTheDay";

const STEP = 0.25;
const FULL_SECONDS = 3600;
const DAY_MS = 864e5;

/** A day's shade: seedbible.org's four bands between the divider colour and the theme's primary. */
export function shadeFor(seconds: number): string | undefined {
  if (seconds < 60) return undefined;
  const progress = Math.min(1, seconds / FULL_SECONDS);
  const band = Math.round(Math.max(progress, STEP) / STEP) * STEP;
  return `color-mix(in srgb, var(--sb-primary-color) ${Math.round(band * 100)}%, var(--sb-divider-color))`;
}

type Days = Map<string, { seconds: number; chapters: RecentReading[] }>;

export function YearOfReading({
  state,
  onOpen,
  label,
}: {
  state: ReaderState;
  onOpen: (r: RecentReading) => void;
  /** A chapter's name in the reader's words ("Genesis 1"). */
  label: (chapterRef: string) => string;
}) {
  const { t, language } = useI18n();
  const [days, setDays] = useState<Days>(new Map());
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [picked, setPicked] = useState<Range | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void state.history.daily().then(setDays);
  }, []);
  // Today is at the right-hand end: start there, as seedbible.org's grid does.
  useEffect(() => {
    const el = timelineRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [year, days]);

  const years = useMemo(() => {
    const ys = new Set([thisYear]);
    for (const k of days.keys()) ys.add(Number(k.slice(0, 4)));
    return [...ys].sort((a, b) => a - b);
  }, [days]);

  const itemsData = useMemo(() => {
    const startDate = new Date(year, 0, 1);
    const endDate = year === thisYear ? new Date() : new Date(year, 11, 31);
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const endWeekStart = new Date(endDate);
    endWeekStart.setDate(endWeekStart.getDate() - endWeekStart.getDay());
    endWeekStart.setHours(0, 0, 0, 0);
    // Rounded, not floored: a daylight-saving change makes the span an hour short of whole weeks, and flooring then
    // drops the week with today in it.
    const weeks =
      Math.round(
        (endWeekStart.getTime() - weekStart.getTime()) / (7 * DAY_MS)
      ) + 1;
    const weekday = new Intl.DateTimeFormat(language, { weekday: "short" });
    const monthName = new Intl.DateTimeFormat(language, { month: "short" });
    const full = new Intl.DateTimeFormat(language, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const items: ReadingHistoryContentData[] = [
      ...[
        [new Date(2024, 0, 1), "3 / 4"],
        [new Date(2024, 0, 3), "5 / 6"],
        [new Date(2024, 0, 5), "7 / 8"],
      ].map(([d, row]) => {
        const name = weekday.format(d as Date);
        return {
          type: "label" as const,
          key: name,
          gridRow: row as string,
          gridColumn: "1 / 2",
          isDay: true,
          children: name,
        };
      }),
    ];
    const months = new Set<string>();
    for (let w = 0; w < weeks; w++) {
      const lastDay = w === weeks - 1 ? endDate.getDay() : 6;
      const labelDate = new Date(weekStart);
      labelDate.setDate(labelDate.getDate() + w * 7 + lastDay);
      const mk = `${labelDate.getMonth()}-${labelDate.getFullYear()}`;
      if (!months.has(mk)) {
        months.add(mk);
        const name = monthName.format(labelDate);
        items.push({
          type: "label",
          key: `label-${mk}`,
          gridRow: "1 / 2",
          gridColumn: `${w + 2} / ${w + 4}`,
          isDay: false,
          children: name.charAt(0).toUpperCase() + name.slice(1),
        });
      }
      for (let d = 0; d < 7; d++) {
        if (w === weeks - 1 && d > endDate.getDay()) break;
        const date = new Date(weekStart);
        date.setDate(date.getDate() + w * 7 + d);
        const start = Math.floor(date.getTime() / 1000);
        const key = localDateKey(date.getTime());
        items.push({
          type: "item",
          id: `${w}-${d}`,
          key: `${w}-${d}-${key}`,
          tooltipContentsData: [{ content: full.format(date) }],
          range: { start, end: start + 86399 },
          readingHistoryRangeSeconds: picked,
          handleItemClick: (r) => setPicked(r),
          style: {
            gridRow: `${d + 2} / ${d + 3}`,
            gridColumn: `${w + 2} / ${w + 3}`,
            background: shadeFor(days.get(key)?.seconds ?? 0),
          },
          isUpcoming: date.getTime() > Date.now(),
        });
      }
    }
    return items;
  }, [days, year, picked, language]);

  const footer: ReadingHistoryTimelineFooterData = {
    legendSquaresData: [
      { key: 0, style: { backgroundColor: "var(--sb-divider-color)" } },
      ...[1, 2, 3, 4].map((i) => ({
        key: i,
        style: { backgroundColor: shadeFor(i * STEP * FULL_SECONDS)! },
      })),
    ],
    lessText: t("less", { defaultValue: "Less" }),
    moreText: t("more", { defaultValue: "More" }),
    yearSelectorLabelTextContent: t("selected-year", {
      year,
      defaultValue: "Year: {{year}}",
    }),
    yearSelectorOptionsData: years.map((y) => ({
      key: y,
      className: `year-selector-option${y === year ? " selected" : ""}`,
      onClick: () => {
        setYear(y);
        setPicked(null);
      },
      content: y,
    })),
  };

  const pickedDay = picked ? days.get(localDateKey(picked.start * 1000)) : null;
  return (
    <div className="sb-today-titled-section">
      <div className="sb-today-titled-section-header">
        <h5>{t("feed-history", { defaultValue: "History" })}</h5>
      </div>
      <ReadingHistoryTimeline
        itemsData={itemsData}
        timelineRef={timelineRef}
        footer={footer}
      />
      {pickedDay && (
        <div
          className="sb-recent-chips"
          aria-label={t("read-that-day", { defaultValue: "Read that day" })}
        >
          {pickedDay.chapters.map((r) => (
            <button
              key={r.chapterRef}
              type="button"
              className="sb-recent-chip"
              onClick={() => onOpen(r)}
            >
              {label(r.chapterRef)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
