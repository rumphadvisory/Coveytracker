import { compass, type Conditions } from "@/lib/weather";
import StatBox from "./StatBox";

export default function WeatherCard({ c }: { c: Conditions }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatBox label="Temperature" value={`${Math.round(c.temperature)}°F`} />
      <StatBox label="Feels like" value={`${Math.round(c.feelsLike)}°F`} />
      <StatBox label="Humidity" value={`${Math.round(c.humidity)}%`} />
      <StatBox label="Dew point" value={`${Math.round(c.dewPoint)}°F`} />
      <StatBox label="Pressure" value={c.pressure.toFixed(2)} sub="inHg" />
      <StatBox label="Wind" value={`${Math.round(c.windSpeed)} mph`} sub={compass(c.windDirection)} />
      <StatBox label="Gusts" value={`${Math.round(c.windGusts)} mph`} />
      <StatBox label="Conditions" value={<span className="text-base">{c.description}</span>} />
    </div>
  );
}
