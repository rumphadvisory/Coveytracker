// Open-Meteo current conditions + quail scenting model.

export interface Conditions {
  temperature: number; // °F
  feelsLike: number; // °F
  humidity: number; // %
  dewPoint: number; // °F
  pressure: number; // inHg, sea-level adjusted (what a barometer reads)
  windSpeed: number; // mph
  windDirection: number; // degrees
  windGusts: number; // mph
  weatherCode: number;
  description: string;
  fetchedAt: string;
}

const WEATHER_CODES: Record<number, string> = {
  0: "Clear",
  1: "Mainly Clear",
  2: "Partly Cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Freezing Fog",
  51: "Light Drizzle",
  53: "Drizzle",
  55: "Heavy Drizzle",
  56: "Freezing Drizzle",
  57: "Freezing Drizzle",
  61: "Light Rain",
  63: "Rain",
  65: "Heavy Rain",
  66: "Freezing Rain",
  67: "Freezing Rain",
  71: "Light Snow",
  73: "Snow",
  75: "Heavy Snow",
  77: "Snow Grains",
  80: "Light Showers",
  81: "Showers",
  82: "Heavy Showers",
  85: "Snow Showers",
  86: "Snow Showers",
  95: "Thunderstorm",
  96: "Thunderstorm w/ Hail",
  99: "Thunderstorm w/ Hail",
};

export function describeWeatherCode(code: number): string {
  return WEATHER_CODES[code] ?? "Unknown";
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function compass(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

export function buildWeatherUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current:
      "temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,surface_pressure,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: "auto",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

const HPA_PER_INHG = 33.8639;

export async function fetchConditions(lat: number, lng: number): Promise<Conditions> {
  const res = await fetch(buildWeatherUrl(lat, lng));
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  const json = await res.json();
  return parseConditions(json);
}

interface OpenMeteoResponse {
  current?: Record<string, number | string | null>;
  current_units?: Record<string, string>;
}

export function parseConditions(json: OpenMeteoResponse): Conditions {
  const c = json?.current;
  if (!c) throw new Error("Unexpected weather response");
  const units = json.current_units ?? {};
  // Open-Meteo reports pressure in hPa. Prefer sea-level pressure (pressure_msl):
  // the 30.1 inHg "high pressure" threshold is a barometer (sea-level) reading,
  // and raw surface pressure reads low at elevation.
  const key = c.pressure_msl != null ? "pressure_msl" : "surface_pressure";
  const rawPressure = Number(c[key]);
  const pressure = String(units[key] ?? "hPa").toLowerCase().includes("inhg")
    ? rawPressure
    : rawPressure / HPA_PER_INHG;
  return {
    temperature: Number(c.temperature_2m),
    feelsLike: Number(c.apparent_temperature),
    humidity: Number(c.relative_humidity_2m),
    dewPoint: Number(c.dew_point_2m),
    pressure,
    windSpeed: Number(c.wind_speed_10m),
    windDirection: Number(c.wind_direction_10m),
    windGusts: Number(c.wind_gusts_10m),
    weatherCode: Number(c.weather_code),
    description: describeWeatherCode(Number(c.weather_code)),
    fetchedAt: new Date().toISOString(),
  };
}

/** Text values used to pre-fill a hunt's weather fields. */
export function huntWeatherFields(c: Conditions) {
  return {
    weather: c.description,
    temperature: `${Math.round(c.temperature)}°F`,
    wind: `${compass(c.windDirection)} ${Math.round(c.windSpeed)} mph${
      c.windGusts > c.windSpeed + 2 ? `, gusts ${Math.round(c.windGusts)}` : ""
    }`,
    barometric_pressure: `${c.pressure.toFixed(2)} inHg`,
  };
}

export type ScentRating = "Excellent" | "Good" | "Fair" | "Poor";

export interface ScentScore {
  score: number;
  rating: ScentRating;
  factors: { label: string; points: number; max: number }[];
}

export function scentingScore(c: Pick<Conditions, "temperature" | "humidity" | "windSpeed" | "dewPoint">): ScentScore {
  const { temperature: t, humidity: h, windSpeed: w, dewPoint: dp } = c;
  const temp = t >= 35 && t <= 55 ? 3 : t >= 25 && t <= 65 ? 2 : t >= 15 && t <= 75 ? 1 : 0;
  const hum = h >= 60 && h <= 90 ? 3 : h >= 40 && h <= 95 ? 2 : h >= 30 ? 1 : 0;
  const wind = w < 8 ? 2 : w <= 15 ? 1 : 0;
  const dew = dp >= 30 && dp <= 50 ? 2 : dp >= 20 && dp <= 60 ? 1 : 0;
  const score = temp + hum + wind + dew;
  const rating: ScentRating = score >= 8 ? "Excellent" : score >= 6 ? "Good" : score >= 4 ? "Fair" : "Poor";
  return {
    score,
    rating,
    factors: [
      { label: "Temperature", points: temp, max: 3 },
      { label: "Humidity", points: hum, max: 3 },
      { label: "Wind", points: wind, max: 2 },
      { label: "Dew point", points: dew, max: 2 },
    ],
  };
}

export function pressureNote(inHg: number): { level: "high" | "normal" | "low"; text: string } {
  if (inHg >= 30.1)
    return {
      level: "high",
      text: "High pressure — favorable. Georgia plantation data shows coveys/hour rising after a rapid pressure rise that leaves the barometer high.",
    };
  if (inHg >= 29.8) return { level: "normal", text: "Normal pressure — typical covey activity expected." };
  return { level: "low", text: "Low pressure — birds may be less active; expect fewer coveys per hour." };
}
