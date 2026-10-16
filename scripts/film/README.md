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
npm run build                                          # oyunun yayın derlemesi
scripts/film/serve.sh node scripts/film/trailer.mjs --tall        # dikey çekimler → shots/film/clips/tall/
scripts/film/serve.sh node scripts/film/trailer.mjs --tall queen  # yalnızca bu çekim
node scripts/film/edit.mjs circle notes seed           # uzman incelemesinden sonraki üç varyant
node scripts/film/edit.mjs                             # ilk teaser (underroot-teaser.mp4)
node scripts/film/edit.mjs circle --cta "Follow the colony"       # son karta çağrı satırı
```

`serve.sh` derlemeyi iş süresince 5173'te sunar ve sonra kapatır. Her video `shots/film/out/` altına çıkar: ana dosya, Instagram'a yüklemelik ~6 Mbps kopya (`-instagram.mp4`) ve kapak karesi (`.jpg`).

## Varyantlar

| Ad | Çıktı | Ne |
|---|---|---|
| Full Circle | `underroot-v1-full-circle` | İlk teaser'ın hikâyesi, incelemeden sonra: aydınlık ve sesli açılış, büyüme hızlandırması, bir toplayıcının tohumunu eve kadar izleme, kendi planlarıyla yağmur/kuş/kış, başlık aydınlık kolonide, sonunda havalanan kanatlı kraliçeler (başa döner) |
| Field Notes | `underroot-v2-field-notes` | Doğa defteri: altın etiketler altında sola dayalı, doğrulanmış satırlar; oyunun kendi alan notu; ahşap, tıkırtı ve toprak shaker'ıyla "seed clock" müziği |
| One Seed | `underroot-v3-one-seed` | ~24 sn kısa döngü: ilk karede yazı, bir tohumun çayırdan ambara yolu, kuş, başlık |

Varyantlar telefon hoparlörü için karışır (`score.py`, `phone`), kesmelerde kısa bir tıkırtı vardır, siyaha kararmaz ve döngü olarak biter.

Olgun koloni çekimleri sanat laboratuvarının kayıtlı kolonilerinden `pannonian` olanı kullanır (seed 6, Pannonya lösü: oyunda *Messor structor*; ilk kullanımda birkaç dakikada üretilir, bkz. `scripts/artlab.mjs`). Anadolu sahasındaki `meadow` kolonisi oyunda *M. structor* grubundan kardeş türdür; `--fixture meadow` ile seçilebilir. Gereken araçlar: Playwright (global), ffmpeg, Python 3 ve numpy.

Metinler, sıralama ve süreler `edit.mjs` içindeki `TIMELINES` tablosunda; oyunun adı ve alt başlık `NAME` ve `TAGLINE` sabitlerinde. Bir çekimi değiştirmek için `trailer.mjs`'de kamera anahtar karelerini düzenleyip yalnızca o çekimi yeniden kaydetmek yeter.
