# Meow Sort: kịch bản ads (mục tiêu 8 IPU trong 5 phút đầu)

IPU (impressions per user) ở đây là số quảng cáo một người chơi xem trong 5 phút đầu, tính cả rewarded lẫn interstitial.
Toàn bộ thông số nằm trong `ADS` ở `js/config.js`; logic thời gian nằm ở `js/ads_policy.js`. Game và bộ mô phỏng dùng chung đúng đoạn code này.

## Placements

| Label | Loại | Vị trí trong game | Người chơi nhận | Giới hạn |
|---|---|---|---|---|
| **R1** Double Coins | Rewarded | Nút "▶ x2 Coins" trên bảng Level Complete | +50 coins (gấp đôi thưởng level) | 1 lần mỗi level; đã xem R1 thì bấm Next không hiện inter |
| **R2** Booster Refill | Rewarded | Nút Shuffle hoặc Extra Bed sau khi hết lượt free (nhãn "▶ Ad") | +1 lượt, dùng ngay | Không giới hạn |
| **R3** Rescue | Rewarded | Popup "Out of moves!" (mở sau 1,2 giây khi hết nước đi) | +1 bed, +1 shuffle | Popup còn có Undo và Restart |
| **R4** Gift Pod | Rewarded | Pod video treo trên HUD (nảy khi sẵn sàng) và hàng "Watch a video" trong Free Coins | +100 coins | Cooldown 45 giây, có đồng hồ đếm ngược dưới pod |
| **R5** Level Boost | Rewarded | Nút "▶ Start with +1 Bed" ở đầu level (từ level 3), hiện tối đa 12 giây trước nước đi đầu tiên | +1 bed | 1 lần mỗi level |
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

## Nguồn quảng cáo (`ADS.provider = 'auto'`)

1. **HS (HyperScale)**: dùng khi gói có `hs/hs-game.js` và `hs-config.js` (sinh từ `native/hs-config.json`, file này không commit vào git).
2. **TikTok trực tiếp**: `createRewardedVideoAd` / `createInterstitialAd`, cần `ADS.adUnitIds`.
3. **Không có nguồn nào**: nút rewarded tự ẩn, interstitial bỏ qua, game vẫn chơi bình thường.
