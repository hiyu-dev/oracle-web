/**
 * 西洋占星術エンジン
 * 出生日時・出生地 → 10天体 + 12ハウス + アスペクトを計算
 */
import { julian, solar, moonposition, planetposition, base } from 'astronomia';
import marsData    from 'astronomia/data/vsop87Bmars';
import venusData   from 'astronomia/data/vsop87Bvenus';
import mercuryData from 'astronomia/data/vsop87Bmercury';
import jupiterData from 'astronomia/data/vsop87Bjupiter';
import saturnData  from 'astronomia/data/vsop87Bsaturn';
import uranusData  from 'astronomia/data/vsop87Buranus';
import neptuneData from 'astronomia/data/vsop87Bneptune';
import earthData   from 'astronomia/data/vsop87Bearth';

const SIGNS = [
  '牡羊座','牡牛座','双子座','蟹座','獅子座','乙女座',
  '天秤座','蠍座','射手座','山羊座','水瓶座','魚座'
];

const PLANETS = ['太陽','月','水星','金星','火星','木星','土星','天王星','海王星','冥王星'];

// 黄道経度（度）→ サイン名・度数
function lonToSign(lon) {
  const deg = ((lon % 360) + 360) % 360;
  const signIdx = Math.floor(deg / 30);
  const degInSign = deg - signIdx * 30;
  return {
    sign: SIGNS[signIdx],
    signIdx,
    deg: degInSign,
    totalDeg: deg,
  };
}

// 度→ラジアン
const toRad = d => d * Math.PI / 180;
// ラジアン→度
const toDeg = r => r * 180 / Math.PI;

/**
 * ハウスカスプ計算（Equal House + 正確な ASC/MC）
 * ASC・MCは球面三角法で正確に算出、中間ハウスはASCから等分
 */
function calcHouses(ramc, lat, eps) {
  const ramcRad = toRad(ramc);
  const latRad  = toRad(lat);
  const epsRad  = toRad(eps);

  // ASC（上昇宮）
  const ascRaw = toDeg(Math.atan2(
    Math.cos(ramcRad),
    -Math.sin(ramcRad) * Math.cos(epsRad) - Math.tan(latRad) * Math.sin(epsRad)
  ));
  const ascDeg = ((ascRaw % 360) + 360) % 360;

  // MC（天頂）
  const mcRaw = toDeg(Math.atan2(
    Math.sin(ramcRad),
    Math.cos(ramcRad) * Math.cos(epsRad)
  ));
  const mcDeg = ((mcRaw % 360) + 360) % 360;

  // Equal House：ASCから30度ずつ（プレミアム占いとしては充分な精度）
  const cusps = Array.from({ length: 12 }, (_, i) => (ascDeg + i * 30) % 360);

  return { cusps, ascDeg, mcDeg };
}

// 天体がどのハウスにあるか判定
function whichHouse(planetLon, cusps) {
  for (let i = 0; i < 12; i++) {
    const start = cusps[i];
    const end = cusps[(i + 1) % 12];
    const pLon = ((planetLon % 360) + 360) % 360;
    if (end > start) {
      if (pLon >= start && pLon < end) return i + 1;
    } else {
      if (pLon >= start || pLon < end) return i + 1;
    }
  }
  return 1;
}

// アスペクト判定（許容度付き）
const ASPECT_DEFS = [
  { name: 'コンジャンクション（合）', angle: 0,   orb: 8 },
  { name: 'セクスタイル（六分）',     angle: 60,  orb: 5 },
  { name: 'スクエア（四分）',         angle: 90,  orb: 7 },
  { name: 'トライン（三分）',         angle: 120, orb: 7 },
  { name: 'オポジション（対衝）',     angle: 180, orb: 8 },
];

function getAspects(positions) {
  const aspects = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const diff = Math.abs(positions[i].totalDeg - positions[j].totalDeg);
      const angle = Math.min(diff, 360 - diff);
      for (const asp of ASPECT_DEFS) {
        if (Math.abs(angle - asp.angle) <= asp.orb) {
          aspects.push({
            planet1: PLANETS[i],
            planet2: PLANETS[j],
            aspect: asp.name,
            orb: Math.abs(angle - asp.angle).toFixed(1),
          });
        }
      }
    }
  }
  return aspects;
}

/**
 * メイン計算関数
 * @param {Object} birth - { year, month, day, hour, minute, lat, lon, tz }
 */
export function calcChart(birth) {
  const { year, month, day, hour, minute, lat, lon, tz } = birth;

  // UTC に変換してユリウス日を計算
  const utcHour = hour + minute / 60 - tz;
  const jd = julian.CalendarGregorianToJD(year, month, day + utcHour / 24);

  // 地球VSOP87オブジェクト（太陽・惑星の計算に共用）
  const earthPP = new planetposition.Planet(earthData);

  // 太陽（VSOP87高精度版）
  const sunApparent = solar.apparentVSOP87(earthPP, jd);
  const sunLon = toDeg(sunApparent.lon);

  // 月
  const moonPos = moonposition.position(jd);
  const moonLon = toDeg(moonPos.lon);

  // 惑星（地心黄道経度）
  function getPlanetLon(data) {
    const pp = new planetposition.Planet(data);
    const pos = pp.position(jd);
    const earthPos = earthPP.position(jd);
    let geoLon = toDeg(pos.lon) - toDeg(earthPos.lon) + 180;
    return ((geoLon % 360) + 360) % 360;
  }

  const mercuryLon = getPlanetLon(mercuryData);
  const venusLon   = getPlanetLon(venusData);
  const marsLon    = getPlanetLon(marsData);
  const jupiterLon = getPlanetLon(jupiterData);
  const saturnLon  = getPlanetLon(saturnData);
  const uranusLon  = getPlanetLon(uranusData);
  const neptuneLon = getPlanetLon(neptuneData);

  // 冥王星は近似（VSOP87データなし → 2000年基準線形近似）
  const plutoLon = ((281.5 + (jd - 2451545.0) * 0.00396) % 360 + 360) % 360;

  const rawLons = [sunLon, moonLon, mercuryLon, venusLon, marsLon, jupiterLon, saturnLon, uranusLon, neptuneLon, plutoLon];
  const positions = rawLons.map((l, i) => ({ planet: PLANETS[i], ...lonToSign(l) }));

  // 黄道傾斜角（簡易）
  const T = (jd - 2451545.0) / 36525;
  const eps = 23.439291111 - 0.013004167 * T;

  // 恒星時 (GMST) → LMST
  const gmst = (280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T) % 360;
  const lmst = ((gmst + lon + 360) % 360);

  // ハウス計算
  const { cusps, ascDeg, mcDeg } = calcHouses(lmst, lat, eps);

  // 各天体のハウス
  positions.forEach(p => {
    p.house = whichHouse(p.totalDeg, cusps);
  });

  // ASC / MC
  const asc = lonToSign(ascDeg);
  const mc  = lonToSign(mcDeg);

  // アスペクト
  const aspects = getAspects(positions);

  return {
    jd,
    positions,
    asc,
    mc,
    cusps: cusps.map((c, i) => ({ house: i + 1, ...lonToSign(c) })),
    ascDeg,
    mcDeg,
    aspects,
    eps,
  };
}

export { SIGNS, PLANETS };
