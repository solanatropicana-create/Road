# Tanıtım videoları

Fragman ve dikey tanıtım videosu oyunun kendisinden çekilir: ekran kaydı değil, kare kare render. Oyunun döngüsü durdurulur, her karede simülasyon belirli sayıda adım ilerler, kamera senaryodaki yerine konur, sahne bir kez çizilir ve kare doğrudan ffmpeg'e gider. Makro lens her karede tüm karolarını çizer, hareket makinenin hızından bağımsız olarak akıcıdır.

| Dosya | Ne yapar |
|---|---|
| `stage.mjs` | Çekim sahnesi: tarayıcıyı açar, kayıtlı koloniyi yükler, `take()` ile kamera anahtar kareleri ya da bir karıncayı takip ederek klip kaydeder |
| `trailer.mjs` | Çekim listesi: uçuş, kazı, kuruluş, mevsimler boyunca büyüme, toplayıcılar, giriş, şaft, yavru odası, ekip hâlinde leş taşıma, fırtına, gece, kış, final |
| `titles.mjs` | Yazı kartları, oyunun yazı tipleriyle (Fraunces, IBM Plex Mono), saydam PNG |
| `score.py` | Müzik ve ses tasarımı: tamamen sentez (örnek ses ya da lisans yok), kurgu noktalarına göre zamanlanır |
| `edit.mjs` | Kurgu: geçişler, ritme oturan kesmeler, sinemaskop bantlar, hafif renk düzeltme, kartlar, müzik, −14 LUFS ses seviyesi |

## Çalıştırma

```bash
npm run dev                                   # oyun sunucusu (5173)
node scripts/film/trailer.mjs                 # 2.39:1 çekimler → shots/film/clips/wide/
node scripts/film/trailer.mjs --tall          # 9:16 çekimler  → shots/film/clips/tall/
node scripts/film/trailer.mjs forager storm   # yalnızca bu çekimler
node scripts/film/edit.mjs                    # dört video → shots/film/out/
node scripts/film/edit.mjs wide tr            # yalnızca Türkçe fragman
node scripts/film/edit.mjs wide en --cta "Wishlist on Steam"   # son karta çağrı satırı
```

Olgun koloni çekimleri sanat laboratuvarının kayıtlı kolonilerini kullanır (`shots/fixtures/`, ilk kullanımda birkaç dakikada üretilir; bkz. `scripts/artlab.mjs`). Gereken araçlar: Playwright (global), ffmpeg, Python 3 ve numpy.

## Çıktılar

- `underfoot-trailer-en.mp4`, `underfoot-trailer-tr.mp4`: 1920×1080, 2.39:1 bantlı, ~63 sn, YouTube / web sitesi / mağaza sayfası için
- `underfoot-teaser-en.mp4`, `underfoot-teaser-tr.mp4`: 1080×1920, ~35 sn, Reels / TikTok / Shorts için
- Her videonun yanında aynı adlı `.jpg` kapak karesi

Metinler `edit.mjs` içindeki `TEXT` tablosunda, zaman çizelgesi `TIMELINES` içinde. Bir çekimi değiştirmek için `trailer.mjs`'de kamera anahtar karelerini düzenleyip yalnızca o çekimi yeniden kaydetmek yeter.
