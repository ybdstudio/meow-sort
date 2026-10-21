# Meow Sort: kịch bản ads

> **v0.4 (hiện tại): profile `paced`.** Test trên máy thật cho thấy TikTok từ chối interstitial gọi cách nhau dưới khoảng 30 giây (`interstitialAdShow:fail frequency controlled`). Bản cũ vẫn hiện "Ad break" và làm tối màn hình dù không có ad nào, nên người chơi bị ngắt quãng vô ích. Bản v0.4:
> - Mọi interstitial cách nhau ≥ 40 giây, tính từ lúc ad trước kết thúc (TikTok yêu cầu ≥ 30 giây). Ad đầu tiên sớm nhất ở giây 30. Sau một rewarded phải chờ 25 giây. `I_break` chỉ chạy từ level 3 và khi đã 60 giây không có ad nào. Bỏ `I_panel`.
> - Không còn thông báo "Ad break" và không làm tối màn hình trước khi ad thật sự chạy. Nếu bị TikTok từ chối, game chạy tiếp ngay và lần thử sau chờ đủ thời gian giãn cách.
> - Mô phỏng với giới hạn 30 giây của TikTok: khoảng **4,5 IPU trong 5 phút** (≈1 interstitial + 3,5 rewarded). Profile `ipu8` cũ (dày đặc) còn khoảng 6,7 IPU với giới hạn này, nhưng ngắt quãng nhiều. Đổi profile bằng `ADS.profile`.

## Bản cũ v0.3: profile ipu8 (mục tiêu 8 IPU)

IPU (impressions per user) ở đây là số quảng cáo một người chơi xem trong 5 phút đầu, tính cả rewarded lẫn interstitial.
Toàn bộ thông số nằm trong `ADS` ở `js/config.js`; logic thời gian nằm ở `js/ads_policy.js`. Game và bộ mô phỏng dùng chung đúng đoạn code này.

## Placements

| Label | Loại | Vị trí trong game | Người chơi nhận | Giới hạn |
|---|---|---|---|---|
| **Double Coin** | Rewarded | Nút "▶ x2 Coins" trên bảng Level Complete | +50 coins (gấp đôi thưởng level) | 1 lần mỗi level; đã xem Double Coin thì bấm Next không hiện inter |
| **Shuffle** / **Extra Bed** | Rewarded | Nút Shuffle hoặc Extra Bed sau khi hết lượt free (nhãn "▶ Ad") | +1 lượt, dùng ngay | Không giới hạn |
| **Rescue** | Rewarded | Popup "Out of moves!" (mở sau 1,2 giây khi hết nước đi) | +1 bed, +1 shuffle | Popup còn có Undo và Restart |
| **Gift Pod** | Rewarded | Pod video treo trên HUD (nảy khi sẵn sàng) và hàng "Watch a video" trong Free Coins | +100 coins | Cooldown 45 giây, có đồng hồ đếm ngược dưới pod |
| **Extra Bed** (level boost) | Rewarded | Nút "▶ Start with +1 Bed" ở đầu level (từ level 3), hiện tối đa 12 giây trước nước đi đầu tiên | +1 bed | 1 lần mỗi level |
| **Inter1** | Interstitial | Chỉ ở điểm nghỉ tự nhiên, luôn hiện "Ad break" 1,2 giây trước | | Xem bảng dưới |

### Điểm kích hoạt interstitial (profile `ipu8`)

| Trigger | Khi nào |
|---|---|
| `I_next` | Bấm Next Level ở bảng thắng (kể cả sau level 1) |
| `I_break` | Ngay sau khi một kệ vừa match xong, từ level 2 trở đi, khi đã ≥15 giây chưa có ad nào. Không bao giờ chen vào giữa lúc đang di chuyển mèo |
| `I_restart` | Restart hoặc Replay |
| `I_select` | Chọn level trong Settings |
| `I_panel` | Đóng Settings hoặc Free Coins |

**Luật chung:**
- Inter đầu tiên sớm nhất ở giây 15.
- Hai inter cách nhau ≥15 giây.
- Sau một rewarded, phải ≥10 giây mới có inter.
- Tối đa 40 inter mỗi phiên.
- Không inter nào chen vào giữa level 1 (tutorial).
- Khi ad đang chạy: game đóng băng, âm thanh tắt, chạm màn hình bị bỏ qua. Sau 100 giây mà SDK không phản hồi thì game tự chạy lại.

## Mô phỏng 5 phút (`node tools/sim_ads.js`)

Kết quả mô phỏng 5.000 người chơi, có tính cả thời gian xem ad (interstitial 6–15 giây, rewarded 25–32 giây):

| | `ipu8` (mặc định) | `balanced` |
|---|---|---|
| IPU 5 phút: trung bình / trung vị | **7,7 / 8** (p10 = 7, p90 = 9) | 4,3 |
| Interstitial / rewarded | 4,75 / 2,99 | ~0,9 / ~3,2 |
| Số level qua trong 5 phút | 2,4 | ~2,9 |

Một phiên mẫu (`ipu8`), 8 impressions:
`0:45 I_next · 1:20 I_break · 1:59 I_next · 2:30 I_break · 3:00 R2 · 4:00 I_break · 4:09 R4 · 4:51 I_next`

Mô hình người chơi đặt ở đầu `tools/sim_ads.js`:
- thời gian mỗi level, số match mỗi level;
- tỉ lệ bấm x2 khoảng 45%;
- tỉ lệ cần thêm booster, tỉ lệ bị kẹt, tỉ lệ bấm pod.

Khi có analytics thật, cập nhật các số này rồi chạy lại mô phỏng.

## Rủi ro và cách điều chỉnh

- **TikTok có thể chặn interstitial nếu quá dày** (lỗi 11004, "time since last playback is too short"). Docs không công bố khoảng cách tối thiểu.
  - Nếu TikTok buộc ≥30 giây: IPU mô phỏng còn khoảng 6,7 (`node tools/sim_ads.js --ttmin 30`).
  - Game bỏ qua ad bị từ chối một cách an toàn: không treo, không trừ gì của người chơi.
- **8 IPU trong 5 phút là mức dày.** Khoảng một nửa thời gian người chơi ở trong ad, nên có rủi ro D1 retention.
  - Đặt `ADS.profile = 'balanced'` để chuyển sang profile nhẹ, không cần sửa code.
  - Nên A/B test hai profile.
- **Các nút để tinh chỉnh**, theo thứ tự tác động lên IPU:
  1. `interCooldown`
  2. `breakAfterIdle`
  3. `interAfterReward`
  4. cooldown của R4
  5. bật hoặc tắt từng trigger

## Tích hợp HS (kit hs-tiktok-sdk 1.0.7, hs-game.js 3.0.0)

- Game chỉ gọi `HSGame.showAd('<label>')` với đúng label trên HS dashboard: `Double Coin`, `Shuffle`, `Extra Bed`, `Rescue`, `Gift Pod`, `Inter1`. Ad unit nào được phát (waterfall, cooldown, bật/tắt) do dashboard quyết định.
- Phần thưởng chỉ được cộng trong `onGive` (`native/src/hs_native.js`), theo bảng `HS_DEFAULTS`, hoặc theo dashboard khi online. Interstitial `Inter1` không có thưởng.
- Nhiệm vụ TikTok (thêm vào màn hình chính, quay lại từ profile) và share đều đi qua `HSGame.tiktokMission` / `HSGame.share`. Cloud save dùng `HSGame.save` / `onLoad`.
- `dist/meow-sort.hs-dashboard.json` (sinh khi build): dán phần `iaa_config` vào HS → Ads Config → Edit raw JSON.
- Kiểm tra: `node tools/hs/hs-check.mjs dist/meow-sort` (0 fail) và `node tools/test_ads.js`.
