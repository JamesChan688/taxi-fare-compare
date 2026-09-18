// Fare estimators based on publicly known Taiwan taxi pricing rules.
// These are approximations for a fun comparison tool, not official quotes.

const PROVIDERS = [
  {
    id: "meter",
    name: "小黃跳錶(台北市費率)",
    note: "起跳 85 元(1.25 km 內),之後每 200 公尺加 5 元。",
    estimate({ distanceKm, isNight }) {
      const base = 85;
      const extraKm = Math.max(0, distanceKm - 1.25);
      const distanceFare = Math.ceil(extraKm / 0.2) * 5;
      let total = base + distanceFare;
      if (isNight) total += 20; // 夜間 23:00-06:00 加成
      return { total: Math.round(total), note: isNight ? "已計入夜間加成 +20 元" : null };
    },
  },
  {
    id: "line-taxi",
    name: "LINE TAXI 風格",
    note: "跳錶費 + 平台服務費 20 元,尖峰時段加成 10%。",
    estimate({ distanceKm, isNight, isPeak }) {
      const base = 85;
      const extraKm = Math.max(0, distanceKm - 1.25);
      const distanceFare = Math.ceil(extraKm / 0.2) * 5;
      let total = base + distanceFare + 20;
      if (isNight) total += 20;
      if (isPeak) total *= 1.1;
      return { total: Math.round(total), note: isPeak ? "已計入尖峰加成 +10%" : null };
    },
  },
  {
    id: "big-fleet",
    name: "台灣大車隊風格(預約)",
    note: "跳錶費 + 預約叫車費 30 元。",
    estimate({ distanceKm, isNight }) {
      const base = 85;
      const extraKm = Math.max(0, distanceKm - 1.25);
      const distanceFare = Math.ceil(extraKm / 0.2) * 5;
      let total = base + distanceFare + 30;
      if (isNight) total += 20;
      return { total: Math.round(total), note: "含預約費 30 元" };
    },
  },
  {
    id: "dynamic",
    name: "動態計價風格(類 Uber)",
    note: "起跳 60 元 + 每公里 12 元 + 每分鐘 2 元,尖峰動態加乘。",
    estimate({ distanceKm, durationMin, isPeak }) {
      const base = 60;
      const distanceFare = distanceKm * 12;
      const timeFare = durationMin * 2;
      let total = base + distanceFare + timeFare;
      let surgeNote = null;
      if (isPeak) {
        total *= 1.4;
        surgeNote = "尖峰動態加乘 x1.4";
      }
      return { total: Math.round(total), note: surgeNote };
    },
  },
];

function estimateAllFares({ distanceKm, durationMin, isNight, isPeak }) {
  return PROVIDERS.map((provider) => {
    const { total, note } = provider.estimate({ distanceKm, durationMin, isNight, isPeak });
    return {
      id: provider.id,
      name: provider.name,
      baseNote: provider.note,
      extraNote: note,
      total,
    };
  }).sort((a, b) => a.total - b.total);
}
