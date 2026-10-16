# Tanıtım videoları

Dikey tanıtım videosu (ve geniş fragman) oyunun kendisinden çekilir: ekran kaydı değil, kare kare render. Oyunun döngüsü durdurulur, her karede simülasyon belirli sayıda adım ilerler, kamera senaryodaki yerine konur, sahne bir kez çizilir ve kare doğrudan ffmpeg'e gider. Makro lens her karede tüm karolarını çizer, hareket makinenin hızından bağımsız olarak akıcıdır.

| Dosya | Ne yapar |
|---|---|
| `stage.mjs` | Çekim sahnesi: tarayıcıyı açar, kayıtlı koloniyi yükler, `take()` ile kamera anahtar kareleri ya da bir karıncayı takip ederek klip kaydeder |
| `trailer.mjs` | Çekim listesi: uçuş, kuruluş, mevsimler boyunca büyüme, toplayıcılar, koku izleri, giriş, kazıcılar, kraliçe ve yavrular, dolu ambar, ekip hâlinde taşıma, fırtına, gece, kış, final (`--tall` ile dikey) |
| `titles.mjs` | Yazı kartları, oyunun yazı tipleriyle (Fraunces, IBM Plex Mono), saydam PNG |
| `score.py` | Müzik ve ses tasarımı: tamamen sentez (örnek ses ya da lisans yok), kesmelere göre zamanlanır |
| `edit.mjs` | Kurgu: geçişler, ritme oturan kesmeler, hafif renk düzeltme, kartlar, müzik, −14 LUFS ses seviyesi |

## Çalıştırma

```bash
npm run dev                                   # oyun sunucusu (5173)
node scripts/film/trailer.mjs --tall          # dikey çekimler → shots/film/clips/tall/
node scripts/film/trailer.mjs --tall queen    # yalnızca bu çekim
node scripts/film/edit.mjs                    # → shots/film/out/underroot-teaser.mp4 (+ -instagram.mp4, ~6 Mbps)
node scripts/film/edit.mjs tall --cta "Follow the colony"   # son karta çağrı satırı
node scripts/film/trailer.mjs && node scripts/film/edit.mjs wide   # 2.39:1 fragman
```

Olgun koloni çekimleri sanat laboratuvarının kayıtlı kolonilerini kullanır (`shots/fixtures/`, ilk kullanımda birkaç dakikada üretilir; bkz. `scripts/artlab.mjs`). Gereken araçlar: Playwright (global), ffmpeg, Python 3 ve numpy.

Metinler, sıralama ve süreler `edit.mjs` içindeki `TIMELINES` tablosunda; oyunun adı ve alt başlık `NAME` ve `TAGLINE` sabitlerinde. Bir çekimi değiştirmek için `trailer.mjs`'de kamera anahtar karelerini düzenleyip yalnızca o çekimi yeniden kaydetmek yeter.
