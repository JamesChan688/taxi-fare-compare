// Fare estimators based on publicly known Taiwan taxi pricing rules.
// These are approximations for a fun comparison tool, not official quotes.

const PROVIDERS = [
  {
    id: "meter",
    name: "小黃跳錶(台北市費率)",
    note: "起跳 85 元(1.25 km 內),之後每 200 公尺加 5 元;塞車每 5 分鐘加 5 元。",
    estimate({ distanceKm, isNight, delayMinutes }) {
      const base = 85;
      const extraKm = Math.max(0, distanceKm - 1.25);
      const distanceFare = Math.ceil(extraKm / 0.2) * 5;
      const delayFare = Math.floor(delayMinutes / 5) * 5;
      let total = base + distanceFare + delayFare;
      if (isNight) total += 20; // 夜間 23:00-06:00 加成
      const notes = [];
      if (isNight) notes.push("夜間加成 +20 元");
      if (delayFare > 0) notes.push(`塞車延滯 +${delayFare} 元`);
      return { total: Math.round(total), note: notes.join(" · ") || null };
    },
  },
  {
    id: "line-taxi",
    name: "LINE TAXI 風格",
    note: "跳錶費 + 平台服務費 20 元,尖峰時段加成 10%。",
    estimate({ distanceKm, isNight, isPeak, delayMinutes }) {
      const base = 85;
      const extraKm = Math.max(0, distanceKm - 1.25);
      const distanceFare = Math.ceil(extraKm / 0.2) * 5;
      const delayFare = Math.floor(delayMinutes / 5) * 5;
      let total = base + distanceFare + 20 + delayFare;
      if (isNight) total += 20;
      if (isPeak) total *= 1.1;
      const notes = [];
      if (isPeak) notes.push("尖峰加成 +10%");
      if (delayFare > 0) notes.push(`塞車延滯 +${delayFare} 元`);
      return { total: Math.round(total), note: notes.join(" · ") || null };
    },
  },
  {
    id: "big-fleet",
    name: "台灣大車隊風格(預約)",
    note: "跳錶費 + 預約叫車費 30 元。",
    estimate({ distanceKm, isNight, delayMinutes }) {
      const base = 85;
      const extraKm = Math.max(0, distanceKm - 1.25);
      const distanceFare = Math.ceil(extraKm / 0.2) * 5;
      const delayFare = Math.floor(delayMinutes / 5) * 5;
      let total = base + distanceFare + 30 + delayFare;
      if (isNight) total += 20;
      const notes = ["含預約費 30 元"];
      if (delayFare > 0) notes.push(`塞車延滯 +${delayFare} 元`);
      return { total: Math.round(total), note: notes.join(" · ") };
    },
  },
  {
    id: "yoxi",
    name: "Yoxi 風格",
    note: "跳錶費 + 預約叫車費 20 元,會員常態 95 折。",
    estimate({ distanceKm, isNight, delayMinutes }) {
      const base = 85;
      const extraKm = Math.max(0, distanceKm - 1.25);
      const distanceFare = Math.ceil(extraKm / 0.2) * 5;
      const delayFare = Math.floor(delayMinutes / 5) * 5;
      let total = (base + distanceFare + delayFare) * 0.95 + 20;
      if (isNight) total += 20;
      const notes = ["會員 95 折"];
      if (delayFare > 0) notes.push(`塞車延滯 +${delayFare} 元`);
      return { total: Math.round(total), note: notes.join(" · ") };
    },
  },
  {
    id: "dynamic",
    name: "動態計價風格(類 Uber)",
    note: "起跳 60 元 + 每公里 12 元 + 每分鐘 2 元,尖峰/壅塞動態加乘。",
    estimate({ distanceKm, durationMin, isPeak, congestionMultiplier }) {
      const base = 60;
      const distanceFare = distanceKm * 12;
      const timeFare = durationMin * 2; // durationMin already reflects current congestion
      let total = base + distanceFare + timeFare;
      const notes = [];
      if (isPeak) {
        total *= 1.4;
        notes.push("尖峰動態加乘 x1.4");
      }
      if (congestionMultiplier > 1.05) {
        notes.push(`路況壅塞 x${congestionMultiplier.toFixed(2)}`);
      }
      return { total: Math.round(total), note: notes.join(" · ") || null };
    },
  },
];

function estimateAllFares({ distanceKm, durationMin, isNight, isPeak, delayMinutes = 0, congestionMultiplier = 1 }) {
  return PROVIDERS.map((provider) => {
    const { total, note } = provider.estimate({
      distanceKm,
      durationMin,
      isNight,
      isPeak,
      delayMinutes,
      congestionMultiplier,
    });
    return {
      id: provider.id,
      name: provider.name,
      baseNote: provider.note,
      extraNote: note,
      total,
    };
  }).sort((a, b) => a.total - b.total);
}
