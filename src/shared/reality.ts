/* Reality: the single place where the sim's clock and money are tied to the real world.
   CLOCK: a sim day lasts 15 real minutes; a sim year is 60 sim days (15 real hours); a month is 5 days, a season 15.
   Everything that happens "per day" (hunger, sleep, work) is calibrated to a real day; everything "per year" (births,
   marriage, crime, illness, firm failure, house prices) to a real year; the rest follows from the median income below.
   Because a year is 6x shorter than a real one, day-sized amounts are ~6x larger than real day-sized amounts while annual and
   monthly figures are real: $50k a year is $833 a sim day, rent is $1,400 a month (5 days). Benchmarks are approximate (US/OECD-ish). */
export const TICK_HZ = 5;
export const DAY_MINUTES = 15;
export const DAY_TICKS = DAY_MINUTES * 60 * TICK_HZ;      // 4500
export const YEAR_DAYS = 60, MONTH_DAYS = 5, SEASON_DAYS = 15;
export const YEAR_TICKS = DAY_TICKS * YEAR_DAYS;
/** Legacy tick scale: the sim was tuned with 1200-tick days. Per-tick rates divide by TS, durations multiply by it. */
export const TS = DAY_TICKS / 1200;
export const HOUR_TICKS = DAY_TICKS / 24;

/* ---- life ---- */
export const ADULT = 18;
/** Lifespan in years: triangular 62..98, mean 80. */
export const lifespan = (rf: () => number) => 62 + rf() * 18 + rf() * 18;
export const FERTILE_MIN = 20, FERTILE_MAX = 42;
/** Births per married couple per year while both are in their fertile years (-> ~12-18 births per 1,000 people per year). */
export const BIRTHS_PER_COUPLE_YEAR = 0.12;

/* ---- money ---- */
export const MEDIAN_INCOME = 50_000;                       // $ per year, median earner
export const DAY_WAGE = MEDIAN_INCOME / YEAR_DAYS;         // $833 per sim day
/** Old tuning had a ~9.6-coin day wage; thresholds written in those coins scale by KB. */
export const KB = DAY_WAGE / 9.6;
/** Meal price unit: market prices step through 8,6,4,3,2 units depending on stock; a typical meal (3 units) is ~3.3% of a day's wage. */
export const MEAL_UNIT = DAY_WAGE * 0.033 / 3;
export const FOOD_PRICE = 3 * MEAL_UNIT, DRINK_PRICE = 1.5 * MEAL_UNIT;
export const RICH = 250_000;                               // a fortune worth a "getting rich" headline
export const POOR_LINE = 3 * DAY_WAGE;                     // under three days' pay in the bank
export const NATION_TAX = 0.22;                            // national income tax withheld from wages
export const LOCAL_TAX_DEFAULT = 3;                        // % of wages kept by the town (mayors move it between 1 and 8)
export const BENEFIT = 0.4 * DAY_WAGE;                     // unemployment benefit per day for the jobless with little cash
export const LABOUR_SHARE = 0.45;                          // share of a building's cost that is wages (the rest is imported materials)
/** Wealth: lognormal, median $9k liquid, sigma 1.7 (Gini ~0.78, top 1% ~28%, top 10% ~67%); older adults hold more. */
export function drawWealth(rf: () => number, age: number): number {
  if (age < ADULT) return 0;
  const u1 = Math.max(1e-9, rf()), u2 = rf(), z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const lifeStage = age < 25 ? 0.2 : age < 35 ? 0.6 : age < 55 ? 1.3 : 2.0;
  return 9000 * lifeStage * Math.exp(1.7 * z);
}
/** Workplace wage per 8-hour shift (= a day's pay) and export revenue per shift, by building type (see BT). Revenue is ~1.45x the wage. */
export const WAGE_BY_TYPE = [0, 0, 0, 700, 760, 0, 0, 800, 1000, 780, 620];
export const REV_BY_TYPE = WAGE_BY_TYPE.map(w => Math.round(w * 1.45));
export const STAFF_BY_TYPE = [0, 6, 0, 5, 6, 0, 0, 8, 14, 18, 8];
/** Upkeep (utilities, supplies, insurance) per day: a quarter of the payroll the building carries when fully staffed. */
export const UPKEEP_BY_TYPE = WAGE_BY_TYPE.map((w, i) => Math.round(w * STAFF_BY_TYPE[i] * 0.25));
UPKEEP_BY_TYPE[1] = 450; UPKEEP_BY_TYPE[2] = 300;
/** What it costs to build, in dollars (labour is LABOUR_SHARE of it). */
export const BUILD_COST = [275_000, 600_000, 1_200_000, 350_000, 250_000, 150_000, 1_200_000, 3_000_000, 600_000, 3_000_000, 450_000];
/** Worker-days of labour a building needs (one dot builds for one 8-hour shift per step). */
export const BUILD_DAYS = BUILD_COST.map(c => Math.max(2, Math.round(c * LABOUR_SHARE / DAY_WAGE)));
/** Farms: far more productive than before, and far fewer of them. */
export const FARM_PRODUCTIVITY = 3;
export const FARMERS_SHARE = 0.06;
/** Format dollars for text. */
export const usd = (n: number) => '$' + Math.round(n).toLocaleString('en');
