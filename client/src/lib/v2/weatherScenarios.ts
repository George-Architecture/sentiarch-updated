// ============================================================
// SentiArch v2 — Weather Scenarios + Time of Day
// 12 HK presets (4 seasons × 3 conditions) + 4 time slots
// Based on HKO historical averages
// ============================================================

/** A weather scenario defines outdoor environmental conditions */
export interface WeatherScenario {
  id: string;
  label: string;
  season: "spring" | "summer" | "autumn" | "winter";
  condition: "sunny" | "overcast" | "rainy";
  /** Outdoor air temperature in °C */
  outdoor_temp: number;
  /** Relative humidity in % */
  humidity: number;
  /** Wind speed in m/s */
  wind_speed: number;
  /** Solar radiation level — affects radiant temperature and lux */
  solar: "high" | "moderate" | "diffuse" | "none";
}

/** Time slot affects solar radiation intensity */
export interface TimeSlot {
  id: string;
  label: string;
  hour: number;
  /** Solar multiplier: 1pm sunny has higher radiant heat than 8am */
  solar_multiplier: number;
  /** Base outdoor lux for sunny conditions at this time */
  base_lux_sunny: number;
}

// ---- 12 Weather Presets (HKO historical averages) ----

export const WEATHER_SCENARIOS: WeatherScenario[] = [
  // Spring (Mar-May)
  { id: "spring_sunny",    label: "Spring — Sunny",    season: "spring", condition: "sunny",    outdoor_temp: 24, humidity: 75, wind_speed: 2.5, solar: "moderate" },
  { id: "spring_overcast", label: "Spring — Overcast",  season: "spring", condition: "overcast", outdoor_temp: 22, humidity: 82, wind_speed: 2.0, solar: "diffuse" },
  { id: "spring_rainy",    label: "Spring — Rainy",    season: "spring", condition: "rainy",    outdoor_temp: 21, humidity: 90, wind_speed: 3.0, solar: "none" },

  // Summer (Jun-Aug)
  { id: "summer_sunny",    label: "Summer — Sunny",    season: "summer", condition: "sunny",    outdoor_temp: 33, humidity: 80, wind_speed: 2.0, solar: "high" },
  { id: "summer_overcast", label: "Summer — Overcast",  season: "summer", condition: "overcast", outdoor_temp: 30, humidity: 85, wind_speed: 1.5, solar: "diffuse" },
  { id: "summer_rainy",    label: "Summer — Rainy",    season: "summer", condition: "rainy",    outdoor_temp: 27, humidity: 92, wind_speed: 3.0, solar: "none" },

  // Autumn (Sep-Nov)
  { id: "autumn_sunny",    label: "Autumn — Sunny",    season: "autumn", condition: "sunny",    outdoor_temp: 26, humidity: 70, wind_speed: 3.0, solar: "moderate" },
  { id: "autumn_overcast", label: "Autumn — Overcast",  season: "autumn", condition: "overcast", outdoor_temp: 24, humidity: 78, wind_speed: 2.5, solar: "diffuse" },
  { id: "autumn_rainy",    label: "Autumn — Rainy",    season: "autumn", condition: "rainy",    outdoor_temp: 23, humidity: 88, wind_speed: 3.0, solar: "none" },

  // Winter (Dec-Feb)
  { id: "winter_sunny",    label: "Winter — Sunny",    season: "winter", condition: "sunny",    outdoor_temp: 18, humidity: 60, wind_speed: 3.0, solar: "moderate" },
  { id: "winter_overcast", label: "Winter — Overcast",  season: "winter", condition: "overcast", outdoor_temp: 15, humidity: 70, wind_speed: 2.0, solar: "diffuse" },
  { id: "winter_rainy",    label: "Winter — Rainy",    season: "winter", condition: "rainy",    outdoor_temp: 14, humidity: 85, wind_speed: 3.5, solar: "none" },
];

// ---- 4 Time Slots ----

export const TIME_SLOTS: TimeSlot[] = [
  { id: "morning_arrival",      label: "Morning Arrival (8 AM)",      hour: 8,  solar_multiplier: 0.5,  base_lux_sunny: 30000 },
  { id: "morning_break",        label: "Morning Break (10 AM)",       hour: 10, solar_multiplier: 0.8,  base_lux_sunny: 60000 },
  { id: "lunch",                label: "Lunch (1 PM)",                hour: 13, solar_multiplier: 1.0,  base_lux_sunny: 80000 },
  { id: "afternoon_dismissal",  label: "Afternoon Dismissal (4 PM)",  hour: 16, solar_multiplier: 0.6,  base_lux_sunny: 40000 },
];

// ---- Derived Outdoor Lux ----

/**
 * Calculate outdoor lux from weather scenario + time slot.
 * Sunny: base_lux × solar_multiplier
 * Overcast: ~20% of sunny
 * Rainy: ~8% of sunny
 */
export function getOutdoorLux(weather: WeatherScenario, time: TimeSlot): number {
  const baseLux = time.base_lux_sunny;
  switch (weather.solar) {
    case "high":     return Math.round(baseLux * time.solar_multiplier * 1.2);
    case "moderate": return Math.round(baseLux * time.solar_multiplier);
    case "diffuse":  return Math.round(baseLux * time.solar_multiplier * 0.20);
    case "none":     return Math.round(baseLux * time.solar_multiplier * 0.08);
  }
}

/**
 * Calculate mean radiant temperature offset from solar radiation.
 * Sunny afternoon → higher radiant temp than air temp.
 * Used as Tr offset for PMV calculation in outdoor/semi-outdoor spaces.
 */
export function getSolarRadiantOffset(weather: WeatherScenario, time: TimeSlot): number {
  switch (weather.solar) {
    case "high":     return 8.0 * time.solar_multiplier;   // up to +8°C at peak
    case "moderate": return 4.0 * time.solar_multiplier;   // up to +4°C
    case "diffuse":  return 1.0 * time.solar_multiplier;   // minimal
    case "none":     return 0;                              // no solar
  }
}

// ---- Lookup Helpers ----

export function getWeatherById(id: string): WeatherScenario | undefined {
  return WEATHER_SCENARIOS.find(w => w.id === id);
}

export function getTimeSlotById(id: string): TimeSlot | undefined {
  return TIME_SLOTS.find(t => t.id === id);
}
