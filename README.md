# 🚕 叫車比價 Taxi Fare Compare

輸入上車地點與目的地,快速比較幾種常見叫車服務風格的預估車資。純前端小專案,不需要任何後端伺服器或 API 金鑰即可執行。

## 功能

- 地點搜尋與自動完成(OpenStreetMap Nominatim)
- 路線規劃與距離/時間估算(OSRM)
- 地圖上顯示路線(Leaflet)
- 依公開計費規則模擬多家叫車服務的預估車資,並標示最便宜選項
- 支援夜間 / 尖峰時段加成

## 執行方式

不需要建置工具,直接用任何靜態伺服器啟動即可,例如:

```bash
python3 -m http.server 8765
```

然後開啟 http://localhost:8765

## 技術架構

- 純 HTML / CSS / JavaScript(無框架、無建置步驟)
- [Leaflet](https://leafletjs.com/) 地圖繪製
- [Nominatim](https://nominatim.org/) 地點搜尋(OpenStreetMap)
- [OSRM](http://project-osrm.org/) 路線規劃

## ⚠️ 免責聲明

本專案的車資皆為依「公開計費規則」換算的**娛樂性估算**,並非各叫車服務的官方報價,也未與任何叫車平台合作或串接其真實計費系統。實際車資請以各 App 現場顯示為準。

## Roadmap

- [ ] 串接 [TDX 運輸資料流通服務](https://tdx.transportdata.tw/) 即時路況資料,讓車程估算反映真實壅塞程度(規劃中,詳見 issues)
