// Harvest budget model.

/** Bag counts are inflated to account for crippled / unrecovered birds. */
export const UNRECOVERED_MULTIPLIER = 1.3;
export const DEFAULT_HARVEST_RATE = 0.15;
export const DEFAULT_COVEY_SIZE = 12;

export type Pressure = "green" | "yellow" | "red" | "none";

export interface HarvestLine {
  population: number;
  budget: number;
  bagged: number;
  harvested: number; // bagged × 1.3
  remaining: number;
  used: number | null; // harvested / budget
  pressure: Pressure;
}

export function harvestLine(population: number, bagged: number, rate: number): HarvestLine {
  const budget = Math.round(population * rate);
  const harvested = Math.round(bagged * UNRECOVERED_MULTIPLIER);
  const used = budget > 0 ? harvested / budget : null;
  return {
    population,
    budget,
    bagged,
    harvested,
    remaining: budget - harvested,
    used,
    pressure: pressureLevel(used, harvested),
  };
}

export function pressureLevel(used: number | null, harvested: number): Pressure {
  if (used == null) return harvested > 0 ? "red" : "none";
  if (used < 0.7) return "green";
  if (used <= 1) return "yellow";
  return "red";
}
