# Tanıtım videoları

Instagram reel'i (ve geniş fragman) oyunun kendisinden çekilir: ekran kaydı değil, kare kare render. Oyunun döngüsü durdurulur, her karede simülasyon belirli sayıda adım ilerler, kamera senaryodaki yerine konur, sahne bir kez çizilir ve kare doğrudan ffmpeg'e gider. Makro lens her karede tüm karolarını çizer, hareket makinenin hızından bağımsız olarak akıcıdır.

| Dosya | Ne yapar |
|---|---|
| `stage.mjs` | Çekim sahnesi: tarayıcıyı açar, kayıtlı koloniyi yükler, `take()` ile kamera anahtar kareleri ya da bir karıncayı takip ederek klip kaydeder |
| `reel.mjs` | Reel'in çekimleri (1080×1920): makrodan tüm koloniye açılan giriş, toplayıcılar, koku izleri, kapıda haber, ekip hâlinde taşıma, kazıcılar, ambar, kraliçe ve yavrular, isimli karınca, *Zodarion* örümceği |
| `trailer.mjs` | Hikâye ve hava çekimleri: uçuş, kuruluş, mevsimler boyunca büyüme, fırtına, kış, final (`--tall` ile dikey) |
| `titles.mjs` | Yazı kartları, oyunun yazı tipleriyle (Fraunces, IBM Plex Mono), saydam PNG; dikeyde yazılar Instagram arayüzünün kapatmadığı bantta |
| `score.py` | Müzik ve ses tasarımı: tamamen sentez (örnek ses ya da lisans yok), kesmelere göre zamanlanır |
| `edit.mjs` | Kurgu: geçişler, ritme oturan kesmeler, hafif renk düzeltme, kartlar, müzik, −14 LUFS ses seviyesi |

## Çalıştırma

```bash
npm run dev                                         # oyun sunucusu (5173)
node scripts/film/trailer.mjs --tall flight founding growth storm winter finale nest
node scripts/film/reel.mjs                          # reel'e özel çekimler → shots/film/clips/tall/
node scripts/film/edit.mjs                          # → shots/film/out/underroot-reel.mp4 (+ -instagram.mp4, ~6 Mbps)
node scripts/film/edit.mjs reel --cta "Follow the colony"   # son karta çağrı satırı
node scripts/film/edit.mjs wide                     # 2.39:1 fragman (önce trailer.mjs geniş çekimleri)
```

Olgun koloni çekimleri sanat laboratuvarının kayıtlı kolonilerini kullanır (`shots/fixtures/`, ilk kullanımda birkaç dakikada üretilir; bkz. `scripts/artlab.mjs`). Gereken araçlar: Playwright (global), ffmpeg, Python 3 ve numpy.

Metinler, sıralama ve süreler `edit.mjs` içindeki `TIMELINES` tablosunda; oyunun adı ve alt başlık `NAME` ve `TAGLINE` sabitlerinde. Bir çekimi değiştirmek için `reel.mjs` ya da `trailer.mjs`'de kamera anahtar karelerini düzenleyip yalnızca o çekimi yeniden kaydetmek yeter.
