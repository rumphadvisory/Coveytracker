// Turning a season's records into management decisions: which course to hunt, where harvest
// pressure is building, whether the population and reproduction are trending up, which dogs
// are carrying the load, and how hunts are going. Pure functions; used by the demo tour and
// meant for the real Season dashboard too.
import { harvestLine } from "./harvest.ts";
import { advisorRanking, countSummary, dogStats, ratio, rates, totals } from "./stats.ts";
import type { CoveyCountRow, CourseRow, DogRow, HuntWithRuns } from "../types/database";

export type InsightTopic = "course" | "harvest" | "trend" | "reproduction" | "dogs" | "quality";
export type Tone = "good" | "watch" | "neutral";

export interface Insight {
  topic: InsightTopic;
  icon: string;
  title: string;
  /** What the numbers say, with the numbers in it. */
  finding: string;
  /** The decision it supports. */
  action: string;
  tone: Tone;
}

export interface InsightInput {
  hunts: HuntWithRuns[]; // this season
  lastSeasonHunts: HuntWithRuns[];
  courses: CourseRow[];
  dogs: DogRow[];
  counts: CoveyCountRow[]; // this season's fall covey counts
  harvestRate?: number;
}

const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
const r1 = (x: number) => x.toFixed(1);

export function seasonInsights(input: InsightInput): Insight[] {
  const { hunts, lastSeasonHunts, courses, dogs, counts, harvestRate = 0.15 } = input;
  const out: Insight[] = [];
  const t = totals(hunts);
  const rt = rates(t);

  // 1. Best course to hunt (coveys per hour).
  const ranked = advisorRanking(courses, hunts);
  if (ranked.length && rt.coveysPerHour) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    const lift = (best.rates.coveysPerHour ?? 0) / rt.coveysPerHour - 1;
    out.push({
      topic: "course",
      icon: "landscape",
      title: "Where the birds are producing",
      finding: `${best.course.name} is producing ${r1(best.rates.coveysPerHour ?? 0)} coveys/hr, ${pct(lift)} ${lift >= 0 ? "above" : "below"} the property average${
        ranked.length > 1 ? `. ${worst.course.name} is lowest at ${r1(worst.rates.coveysPerHour ?? 0)}` : ""
      }.`,
      action: `Put your best hunts on ${best.course.name} when scenting is good. Look at habitat on ${ranked.length > 1 ? worst.course.name : "slower courses"}: burn timing, cover and food.`,
      tone: "good",
    });
  }

  // 2. Harvest pressure against the sustainable budget.
  const pop = countSummary(courses, counts);
  const lines = courses
    .map((c) => ({
      course: c,
      line: harvestLine(pop.find((p) => p.course.id === c.id)?.birds ?? 0, totals(hunts.filter((h) => h.course_id === c.id)).totalBirds, harvestRate),
    }))
    .filter((x) => x.line.budget > 0);
  if (lines.length) {
    const tight = lines.filter((x) => (x.line.used ?? 0) >= 0.85).sort((a, b) => (b.line.used ?? 0) - (a.line.used ?? 0));
    const roomiest = [...lines].sort((a, b) => b.line.remaining - a.line.remaining)[0];
    const room = roomiest.line.remaining > 0 ? `${roomiest.course.name} has the most room (${roomiest.line.remaining} birds).` : "No course has room left in its budget.";
    out.push(
      tight.length
        ? {
            topic: "harvest",
            icon: "speed",
            title: "Harvest pressure",
            finding: `Near or over the harvest budget (bag × 1.3 for unrecovered birds): ${tight
              .map((x) => `${x.course.name} ${pct(x.line.used ?? 0)}`)
              .join(", ")}.`,
            action: `Rest ${tight[0].course.name} or limit shooting there for the rest of the season. ${room}`,
            tone: "watch",
          }
        : {
            topic: "harvest",
            icon: "speed",
            title: "Harvest pressure",
            finding: `Every course is under 85% of its harvest budget. ${room}`,
            action: "Harvest is sustainable at this pace. Spread pressure toward courses with the most room.",
            tone: "good",
          },
    );
  }

  // 3. Season-over-season trend in coveys per hour (a population index from the hunts themselves).
  const last = rates(totals(lastSeasonHunts));
  if (rt.coveysPerHour && last.coveysPerHour) {
    const change = rt.coveysPerHour / last.coveysPerHour - 1;
    const band = change >= 0.05 ? "up" : change <= -0.05 ? "down" : "steady";
    out.push({
      topic: "trend",
      icon: band === "up" ? "trending_up" : band === "down" ? "trending_down" : "trending_flat",
      title: "Population trend",
      finding: `${r1(rt.coveysPerHour)} coveys/hr this season vs ${r1(last.coveysPerHour)} last season: ${
        band === "steady" ? "holding steady" : `${band} ${pct(change)}`
      }.`,
      action:
        band === "up"
          ? "Management is paying off. Keep the burn rotation and habitat work that got you here, and compare against your fall covey counts."
          : band === "steady"
            ? "Holding steady. Use the course and reproduction numbers to find where extra habitat work would pay off most."
            : "Find out why before next season: compare courses, burn history, predator control and weather; consider a lighter harvest rate.",
      tone: band === "down" ? "watch" : "good",
    });
  }

  // 4. Reproduction: juveniles per adult in the bag.
  const juvPerAdult = ratio(t.juvenile, t.adult);
  const lastT = totals(lastSeasonHunts);
  const lastJuv = ratio(lastT.juvenile, lastT.adult);
  if (juvPerAdult != null) {
    const up = lastJuv != null ? juvPerAdult >= lastJuv : null;
    out.push({
      topic: "reproduction",
      icon: "egg",
      title: "Reproduction",
      finding: `${juvPerAdult.toFixed(2)} juveniles per adult in the bag${lastJuv != null ? ` (last season ${lastJuv.toFixed(2)})` : ""}.`,
      action:
        up === false
          ? "A lower age ratio points to a weaker nesting and brood season. Review brood habitat, spring burns and nest predators."
          : "More young birds per adult points to a good nesting and brood season. Note what habitat work came before it.",
      tone: up === false ? "watch" : "good",
    });
  }

  // 5. Dogs: who is carrying the load.
  const ds = dogStats(dogs, hunts).filter((s) => s.hours > 0 && s.perHour != null);
  if (ds.length >= 2) {
    const avg = ds.reduce((a, s) => a + s.contacts, 0) / ds.reduce((a, s) => a + s.hours, 0);
    const top = [...ds].sort((a, b) => (b.perHour ?? 0) - (a.perHour ?? 0))[0];
    const low = [...ds].sort((a, b) => (a.perHour ?? 0) - (b.perHour ?? 0))[0];
    out.push({
      topic: "dogs",
      icon: "pets",
      title: "Dog performance",
      finding: `${top.dog.name} finds ${(top.perHour ?? 0).toFixed(2)} contacts/hr, ${pct((top.perHour ?? 0) / avg - 1)} above the kennel average. ${low.dog.name} is lowest at ${(low.perHour ?? 0).toFixed(2)}.`,
      action: `Run ${top.dog.name} on your best courses and biggest hunts. Give ${low.dog.name} lighter courses and development time, or check condition.`,
      tone: "neutral",
    });
  }

  // 6. Hunt quality: shooting on coveys found, and birds flushing wild.
  if (t.coveysSeen > 0) {
    const wild = ratio(t.wild, t.coveysSeen) ?? 0;
    out.push({
      topic: "quality",
      icon: "target",
      title: "Hunt quality",
      finding: `Guns shot on ${pct(rt.shotVsSeen ?? 0)} of coveys seen; ${pct(wild)} flushed wild before a point.`,
      action:
        wild >= 0.25
          ? "A high wild-flush rate often means pressured birds or poor scenting. Rest pressured courses, hunt into the wind and favor cool, damp mornings."
          : "Dogs are holding birds well. Keep hunts on the courses and conditions that produce points.",
      tone: wild >= 0.25 ? "watch" : "good",
    });
  }

  return out;
}
