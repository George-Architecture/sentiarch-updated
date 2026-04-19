// ============================================================
// SentiArch v2 — Space Type Tags
// 5 tags that determine how weather affects indoor environment
// ============================================================

import type { WeatherScenario, TimeSlot } from "./weatherScenarios";
import { getOutdoorLux, getSolarRadiantOffset } from "./weatherScenarios";

/** The 5 space type tags */
export type SpaceTag =
  | "indoor_ac"
  | "indoor_natural"
  | "semi_outdoor"
  | "outdoor"
  | "green_space";

export interface SpaceTagInfo {
  id: SpaceTag;
  label: string;
  description: string;
}

export const SPACE_TAGS: SpaceTagInfo[] = [
  { id: "indoor_ac",       label: "Indoor (AC)",           description: "Air-conditioned interior — fixed 25°C, 55% RH, 500 lux, 0.1 m/s" },
  { id: "indoor_natural",  label: "Indoor (Natural Vent)", description: "Naturally ventilated interior — temp offset from outdoor" },
  { id: "semi_outdoor",    label: "Semi-Outdoor",          description: "Covered but open — partial weather exposure" },
  { id: "outdoor",         label: "Outdoor",               description: "Fully exposed to weather conditions" },
  { id: "green_space",     label: "Green Space",           description: "Outdoor with greenery — PMV reduced by 0.3 for restorative effect" },
];

/** Resolved environment parameters for a space at a given weather + time */
export interface ResolvedEnv {
  air_temp: number;       // °C
  mean_radiant_temp: number; // °C (for PMV Tr parameter)
  humidity: number;       // %
  air_velocity: number;   // m/s
  lux: number;            // lux
  /** Background noise level — estimated from space type */
  noise_dB: number;
  /** PMV adjustment to apply AFTER calculation (e.g., greenery effect) */
  pmv_adjustment: number;
}

/**
 * Resolve environment parameters from space tag + weather + time.
 * This is the core function that replaces manual environment input.
 */
export function resolveEnvironment(
  tag: SpaceTag,
  weather: WeatherScenario,
  time: TimeSlot
): ResolvedEnv {
  const outdoorLux = getOutdoorLux(weather, time);
  const solarOffset = getSolarRadiantOffset(weather, time);

  switch (tag) {
    case "indoor_ac":
      return {
        air_temp: 25,
        mean_radiant_temp: 25,      // AC spaces have uniform radiant temp
        humidity: 55,
        air_velocity: 0.1,
        lux: 500,                    // artificial lighting
        noise_dB: 40,               // quiet AC hum
        pmv_adjustment: 0,
      };

    case "indoor_natural":
      return {
        air_temp: weather.outdoor_temp - 2,
        mean_radiant_temp: weather.outdoor_temp - 2 + solarOffset * 0.2, // some solar gain through windows
        humidity: Math.max(30, weather.humidity - 5),
        air_velocity: weather.wind_speed * 0.4,
        lux: Math.max(200, Math.round(outdoorLux * 0.05) + 200), // daylight + artificial
        noise_dB: 45,               // some outdoor noise penetration
        pmv_adjustment: 0,
      };

    case "semi_outdoor":
      return {
        air_temp: weather.outdoor_temp - 1,
        mean_radiant_temp: weather.outdoor_temp - 1 + solarOffset * 0.5, // partial shade
        humidity: weather.humidity,
        air_velocity: weather.wind_speed * 0.7,
        lux: Math.round(outdoorLux * 0.5),
        noise_dB: 55,               // moderate ambient noise
        pmv_adjustment: 0,
      };

    case "outdoor":
      return {
        air_temp: weather.outdoor_temp,
        mean_radiant_temp: weather.outdoor_temp + solarOffset, // full solar exposure
        humidity: weather.humidity,
        air_velocity: weather.wind_speed,
        lux: outdoorLux,
        noise_dB: 60,               // outdoor ambient
        pmv_adjustment: 0,
      };

    case "green_space":
      return {
        air_temp: weather.outdoor_temp,
        mean_radiant_temp: weather.outdoor_temp + solarOffset * 0.7, // tree shade reduces radiant
        humidity: weather.humidity,
        air_velocity: weather.wind_speed,
        lux: Math.round(outdoorLux * 0.7), // tree canopy filters light
        noise_dB: 50,               // greenery absorbs some noise
        pmv_adjustment: -0.3,       // psychological restorative effect
      };
  }
}

export function getSpaceTagById(id: string): SpaceTagInfo | undefined {
  return SPACE_TAGS.find(t => t.id === id);
}
