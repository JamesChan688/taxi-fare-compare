const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const TRAFFIC_DATA_URL = "data/traffic.json";
const REFERENCE_SPEED_KMH = 30; // 假設的「正常車流」平均時速,用來換算壅塞係數

// Nominatim 回傳的中文縣市名稱 -> TDX 城市代碼(僅涵蓋目前有抓即時路況的城市)
const CITY_NAME_TO_TDX_CODE = {
  "台北市": "Taipei",
  "臺北市": "Taipei",
  "新北市": "NewTaipei",
  "桃園市": "Taoyuan",
  "台中市": "Taichung",
  "臺中市": "Taichung",
  "台南市": "Tainan",
  "臺南市": "Tainan",
  "高雄市": "Kaohsiung",
};

let trafficData = null;
fetch(TRAFFIC_DATA_URL)
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => {
    trafficData = data;
  })
  .catch(() => {
    trafficData = null;
  });

function getCongestionInfo(cityName) {
  const cityCode = CITY_NAME_TO_TDX_CODE[cityName];
  const cityStats = cityCode && trafficData?.cities?.[cityCode];
  if (!cityStats || !cityStats.avgSpeedKmh) {
    return { multiplier: 1, avgSpeedKmh: null, cityCode: cityCode || null };
  }
  const multiplier = Math.min(1.8, Math.max(1, REFERENCE_SPEED_KMH / cityStats.avgSpeedKmh));
  return { multiplier, avgSpeedKmh: cityStats.avgSpeedKmh, cityCode };
}

const originInput = document.getElementById("origin");
const destinationInput = document.getElementById("destination");
const originSuggestions = document.getElementById("origin-suggestions");
const destinationSuggestions = document.getElementById("destination-suggestions");
const form = document.getElementById("fare-form");
const statusEl = document.getElementById("status");
const compareBtn = document.getElementById("compare-btn");
const resultsPanel = document.getElementById("results-panel");
const resultsBody = document.getElementById("results-body");
const tripSummary = document.getElementById("trip-summary");
const departureInput = document.getElementById("departure-time");
const peakToggle = document.getElementById("peak-toggle");

let originPoint = null; // { lat, lon, label }
let destinationPoint = null;
let routeLine = null;
let originMarker = null;
let destinationMarker = null;

const map = L.map("map", { attributionControl: true }).setView([25.047, 121.517], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function searchPlaces(query) {
  if (!query || query.trim().length < 2) return [];
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "6",
    countrycodes: "tw",
    addressdetails: "1",
  });
  const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("地點搜尋失敗");
  return res.json();
}

function renderSuggestions(listEl, items, onPick) {
  listEl.innerHTML = "";
  if (!items.length) {
    listEl.hidden = true;
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item.display_name;
    li.tabIndex = 0;
    li.addEventListener("click", () => onPick(item));
    listEl.appendChild(li);
  });
  listEl.hidden = false;
}

function wireAutocomplete(inputEl, listEl, onSelect) {
  const doSearch = debounce(async () => {
    try {
      const results = await searchPlaces(inputEl.value);
      renderSuggestions(listEl, results, (item) => {
        inputEl.value = item.display_name;
        listEl.hidden = true;
        const city = item.address?.city || item.address?.county || null;
        onSelect({ lat: parseFloat(item.lat), lon: parseFloat(item.lon), label: item.display_name, city });
      });
    } catch (err) {
      listEl.hidden = true;
    }
  }, 400);

  inputEl.addEventListener("input", () => {
    onSelect(null); // clear previous selection once user edits text again
    doSearch();
  });

  document.addEventListener("click", (e) => {
    if (!listEl.contains(e.target) && e.target !== inputEl) {
      listEl.hidden = true;
    }
  });
}

wireAutocomplete(originInput, originSuggestions, (point) => (originPoint = point));
wireAutocomplete(destinationInput, destinationSuggestions, (point) => (destinationPoint = point));

const useCurrentLocationBtn = document.getElementById("use-current-location");

async function reverseGeocode(lat, lon) {
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lon),
    addressdetails: "1",
  });
  const res = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("反查地址失敗");
  return res.json();
}

useCurrentLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("這個瀏覽器不支援定位功能");
    return;
  }

  useCurrentLocationBtn.disabled = true;
  setStatus("正在取得目前位置…");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      try {
        const place = await reverseGeocode(latitude, longitude);
        const city = place.address?.city || place.address?.county || null;
        originPoint = { lat: latitude, lon: longitude, label: place.display_name, city };
        originInput.value = place.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        setStatus("");
      } catch (err) {
        originPoint = { lat: latitude, lon: longitude, label: "目前位置", city: null };
        originInput.value = "目前位置";
        setStatus("已定位,但無法反查地址名稱");
      } finally {
        useCurrentLocationBtn.disabled = false;
      }
    },
    (err) => {
      useCurrentLocationBtn.disabled = false;
      setStatus(err.code === err.PERMISSION_DENIED ? "已拒絕定位權限,請手動輸入地址" : "無法取得目前位置");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

function setStatus(text) {
  statusEl.textContent = text || "";
}

function updateMapMarkers() {
  if (originMarker) map.removeLayer(originMarker);
  if (destinationMarker) map.removeLayer(destinationMarker);

  if (originPoint) {
    originMarker = L.marker([originPoint.lat, originPoint.lon]).addTo(map).bindPopup("上車地點");
  }
  if (destinationPoint) {
    destinationMarker = L.marker([destinationPoint.lat, destinationPoint.lon]).addTo(map).bindPopup("目的地");
  }
}

async function fetchRoute(origin, destination) {
  const coords = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  const url = `${OSRM_URL}/${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("路線查詢失敗");
  const data = await res.json();
  if (!data.routes || !data.routes.length) throw new Error("找不到可行駕車路線");
  return data.routes[0];
}

function drawRoute(route) {
  if (routeLine) map.removeLayer(routeLine);
  const latlngs = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  routeLine = L.polyline(latlngs, { color: "#e8663c", weight: 5, opacity: 0.85 }).addTo(map);
  map.fitBounds(routeLine.getBounds(), { padding: [24, 24] });
}

function isNightTime(date) {
  const h = date.getHours();
  return h >= 23 || h < 6;
}

function isPeakTime(date) {
  const h = date.getHours();
  return (h >= 7 && h < 9) || (h >= 17 && h < 19);
}

function renderResults({ distanceKm, baseDurationMin, isNight, isPeak, congestion }) {
  const { multiplier: congestionMultiplier, avgSpeedKmh } = congestion;
  const adjustedDurationMin = baseDurationMin * congestionMultiplier;
  const delayMinutes = Math.max(0, adjustedDurationMin - baseDurationMin);

  const fares = estimateAllFares({
    distanceKm,
    durationMin: adjustedDurationMin,
    isNight,
    isPeak,
    delayMinutes,
    congestionMultiplier,
  });

  resultsBody.innerHTML = "";
  fares.forEach((fare, index) => {
    const tr = document.createElement("tr");
    if (index === 0) tr.classList.add("best");

    const nameTd = document.createElement("td");
    nameTd.textContent = (index === 0 ? "🏆 " : "") + fare.name;

    const amountTd = document.createElement("td");
    amountTd.className = "fare-amount";
    amountTd.textContent = `NT$ ${fare.total}`;

    const noteTd = document.createElement("td");
    noteTd.textContent = [fare.baseNote, fare.extraNote].filter(Boolean).join(" · ");

    tr.append(nameTd, amountTd, noteTd);
    resultsBody.appendChild(tr);
  });

  const parts = [
    `距離約 ${distanceKm.toFixed(1)} 公里`,
    `一般車程 ${Math.round(baseDurationMin)} 分鐘`,
  ];
  if (avgSpeedKmh) {
    parts.push(`目前該縣市平均車速約 ${avgSpeedKmh} km/h(TDX 即時路況,壅塞係數 x${congestionMultiplier.toFixed(2)})`);
  } else {
    parts.push("此區域暫無即時路況資料");
  }
  if (isNight) parts.push("夜間時段");
  if (isPeak) parts.push("尖峰時段");

  tripSummary.hidden = false;
  tripSummary.textContent = parts.join(" · ");

  resultsPanel.hidden = false;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!originPoint) {
    setStatus("請從建議清單中選擇上車地點");
    return;
  }
  if (!destinationPoint) {
    setStatus("請從建議清單中選擇目的地");
    return;
  }

  compareBtn.disabled = true;
  setStatus("查詢路線中…");
  updateMapMarkers();

  try {
    const route = await fetchRoute(originPoint, destinationPoint);
    drawRoute(route);

    const distanceKm = route.distance / 1000;
    const baseDurationMin = route.duration / 60;

    const departureValue = departureInput.value ? new Date(departureInput.value) : new Date();
    const isNight = isNightTime(departureValue);
    const isPeak = peakToggle.checked || isPeakTime(departureValue);
    const congestion = getCongestionInfo(originPoint.city);

    renderResults({ distanceKm, baseDurationMin, isNight, isPeak, congestion });
    setStatus("");
  } catch (err) {
    setStatus(err.message || "發生錯誤,請稍後再試");
  } finally {
    compareBtn.disabled = false;
  }
});
