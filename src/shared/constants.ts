/* Tunable constants and enums shared by sim, server and client. */
import { TICK_HZ, DAY_TICKS, YEAR_DAYS, SEASON_DAYS, ADULT, BUILD_DAYS, UPKEEP_BY_TYPE, STAFF_BY_TYPE, WAGE_BY_TYPE, REV_BY_TYPE, FOOD_PRICE, DRINK_PRICE } from './reality';
export * from './reality';
export const INF = 65535;
export const TILE = { GRASS: 0, ROAD: 1, BLOCK: 2, WATER: 3, OPEN: 4, TREE: 5, BRIDGE: 6, FORD: 7, SAND: 8, ROCK: 9 };
export const COST = [4, 2, INF, INF, 3, INF, 2, 4, 4, INF];
export const BT = { HOUSE: 0, FARM: 1, MARKET: 2, TAVERN: 3, WORKSHOP: 4, PARK: 5, HALL: 6, DOCK: 7, OFFICE: 8, FACTORY: 9, STORE: 10, BUILDER: 11 };
export const BT_NAME = ['House', 'Farm', 'Market', 'Tavern', 'Workshop', 'Park', 'Town Hall', 'Dock', 'Office', 'Factory', 'Store', 'Builders'];
export const BUILD_SHIFTS = BUILD_DAYS, UPKEEP = UPKEEP_BY_TYPE, STAFF = STAFF_BY_TYPE, MAXM = 64;
export const WAGE = WAGE_BY_TYPE, REV = REV_BY_TYPE;
export const JOBS = ['farmer', 'crafter', 'keeper', 'drifter'];
export const STOCK_CAP = 700;
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'], YIELD = [1.0, 1.3, 2.0, 0.7], RAIN_P = [0.35, 0.15, 0.4, 0.55];

export const CON = [['ME','me'],['YOU','you'],['WANT','want'],['GO','go'],['GIVE','give'],['SEE','see'],['LIKE','like'],['HELP','help'],
  ['HUNGRY','hungry'],['TIRED','tired'],['HAPPY','happy'],['SAD','sad'],['LONELY','lonely'],['RICH','rich'],['BROKE','broke'],
  ['FOOD','food'],['HOME','home'],['WORK','work'],['SLEEP','sleep'],['COIN','coin'],['FRIEND','friend'],
  ['MARKET','market'],['FARM','farm'],['PARK','park'],['TAVERN','tavern'],['WORKSHOP','workshop'],
  ['NIGHT','night'],['DAY','day'],['DRINK','drink'],['NO','no'],['YES','yes'],['MUCH','plenty of'],['LITTLE','little'],
  ['GOOD','good'],['BAD','bad'],['NOW','now'],['HELLO','hello'],['BYE','bye'],['THANKS','thanks'],['AND','and'],
  ['STEAL','steal'],['LOVE','love'],['ANGRY','angry'],['THIEF','thief'],['STOP','stop'],['SORRY','sorry'],['BABY','baby'],['MARRY','marry'],['MINE','mine'],['DIE','died'],['AFRAID','afraid'],['JEALOUS','jealous']];


export const TRAITS = ['thief','hothead','gossip','kind','romantic','jealous','coward','ambitious','lazy'];
export const TRAIT_W = [0.025,0.12,0.15,0.15,0.2,0.1,0.12,0.15,0.1];
export const DREAMS = ['rich','famous','love','family'];
export const DREAM_TXT = { rich: 'get rich (250 coins)', famous: 'have 8 friends', love: 'find true love', family: 'raise 2 children', content: 'content with life' };
export const C: Record<string, number> = {}; CON.forEach((c, i) => { C[c[0]] = i; });
