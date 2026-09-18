const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

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
    addressdetails: "0",
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
        onSelect({ lat: parseFloat(item.lat), lon: parseFloat(item.lon), label: item.display_name });
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

function renderResults({ distanceKm, durationMin, isNight, isPeak }) {
  const fares = estimateAllFares({ distanceKm, durationMin, isNight, isPeak });

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

  tripSummary.hidden = false;
  tripSummary.textContent = `距離約 ${distanceKm.toFixed(1)} 公里 · 預估車程 ${Math.round(durationMin)} 分鐘${
    isNight ? " · 夜間時段" : ""
  }${isPeak ? " · 尖峰時段" : ""}`;

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
    const durationMin = route.duration / 60;

    const departureValue = departureInput.value ? new Date(departureInput.value) : new Date();
    const isNight = isNightTime(departureValue);
    const isPeak = peakToggle.checked || isPeakTime(departureValue);

    renderResults({ distanceKm, durationMin, isNight, isPeak });
    setStatus("");
  } catch (err) {
    setStatus(err.message || "發生錯誤,請稍後再試");
  } finally {
    compareBtn.disabled = false;
  }
});
