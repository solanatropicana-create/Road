# Underfoot

*Çalışma adı.* Gerçek ölçekte (1 piksel = 1 mm) bir toprak kesitinde *Messor structor* hasatçı karınca kolonisi simülasyonu. Oyuncu karıncalara emir vermez, koloninin önceliklerini belirler.

Tasarım belgesi, görsel dil kararları ve açık sorular: [docs/GDD.md](docs/GDD.md)

Oynanabilir sürüm (özel link): https://claude.ai/artifact/Ja2FVX7Gs5UHxjRM7yPXha

![Akşam ışığında kesit: tek şaft ve iki yanında yassı odalar](docs/img/hero.jpg)

| | |
|---|---|
| ![Tohum taşıyan toplayıcılar, yakın plan](docs/img/macro.jpg) | ![Ambar: tohum yığını](docs/img/granary.jpg) |
| ![Gece: kırmızı gözlem lambası ve ateş böcekleri](docs/img/night.jpg) | ![Fırtına: su şafttan iniyor](docs/img/storm.jpg) |

## Çalıştırma

```bash
npm install
npm run dev            # http://localhost:5173
```

- `?seed=123` aynı haritayı yeniden üretir.
- `?site=anatolia` sahayı seçer: `pannonian`, `sand`, `limestone`, `vineyard`, `anatolia`, `pontic`.
- `?paused=1` duraklatılmış başlatır.

## Dünya

Altı gerçek *Messor* sahası (Pannonya lösü, kumlu bozkır, kireçtaşı tepe, bağ kenarı, Orta Anadolu, Karadeniz bozkırı), her biri kendi iklimi, toprak profili ve bitkileriyle. Aynı sahanın her haritası farklı: toprak kalınlığı, bakı, tohum bankası, kil merceği, yassı taşlar, eski yuvalar, ağaç, çalı, taban suyu, çömlek kırıkları, ağustos böceği perileri. Takvim haftalık: kış uykusu, kar, yılda bir evlilik uçuşu. Yüzeyde beş bitki türü tohum takvimine göre olgunlaşıp kuruyor; karaçalı ya da kuşburnu çiçek açıp meyve döküyor, ağaç gölge yapıp yaprak döküyor; tepeli toygar, çekirge, Harpalus böceği ve solucanlar dolaşıyor.

## Modlar

Açılış ekranı iki yol sunar:

- **İzle:** Koloni her şeye kendi karar verir. Sağdaki "Koloni" paneli işçilerin ne yaptığını, yavruları ve odaları salt okunur gösterir. Bir odaya tıklayınca kamera oraya gider.
- **Yönlendir:** Koloni beyni sensin: iş öncelikleri, üreme, majör oranı, oda siparişleri.

Mod, tuşlar panelinden (?) her an değiştirilebilir. İzle'ye geçince bütün ayarlar koloninin kendi varsayılanına döner.

## Kontroller

| | |
|---|---|
| Tıklama (başta) | Kraliçenin ineceği yeri seç |
| Tıklama | Karınca seç ve takip et |
| Sürükle / tekerlek | Kaydır / yakınlaştır |
| Boşluk | Duraklat |
| 1–5 | Hız (1× … 16×) |
| F | Tüm kesiti göster |
| C | Belgesel kamera: kendi başına özneler seçer, alt yazıyla anlatır |
| P | Kazı planını göster/gizle (kehribar noktalar) |
| T | Koku izlerini (feromon) göster/gizle |
| H | Sinema modu: paneller gizlenir, belgesel alt yazısı kalır |
| ? | Tuşlar paneli (dil seçimi ve yeni koloni de burada) |
| Esc | Takibi, işaretlemeyi ya da sinema modunu bırak |

P, T, H, C ve ? alt çubukta düğme olarak da var (dokunmatik ekranlar için). Arayüz İngilizce ve Türkçe; dil tarayıcıdan seçilir, tuşlar panelinden değiştirilir.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Tip kontrolü ve üretim derlemesi (`dist/`) |
| `npm run build:artifact` | Tek dosyalık sayfa (`dist-artifact/underfoot.html`) |
| `npm run headless -- 7 20` | Görüntüsüz: 7 numaralı harita, 20 dakika, büyüme raporu |
| `scripts/batch.sh 40` | 8 haritayı paralel 40 dakika çalıştırır (sağlamlık testi) |
| `node scripts/shot.mjs ad 7 9000` | Çalışan dev sunucusundan ekran görüntüsü (`shots/`) |
| `node scripts/beauty.mjs` | Belgelerdeki seçilmiş görüntüler (paneller gizli) |
| `node scripts/play.mjs ad 3 40` | Oyuncu gibi oynar: kraliçeyi indirir, 16× hızda bekler, ekran görüntüsü alır |
| `scripts/playtest.mjs` | Oyun testi aracı: tarayıcıda oyunu sürer (`openGame()`), bkz. `docs/playtest/` |

## Kod yapısı

```
src/
  config.ts        ölçek, zaman ve ayar sabitleri
  world/           hücre dünyası, toprak üretimi, bitkiler, düşen kum fiziği, su ve nem
  sim/             koloni, karınca davranışı, yuva planlayıcı, mesafe alanları, yavru
  render/          piksel kesit, makro arka plan, ışık ve hava, kamera, vektör karıncalar (antdraw.ts)
  ui/              koloni beyni, saha defteri, belgesel kamera (director.ts), ipuçları, dil tablosu (i18n.ts)
scripts/           görüntüsüz test, toplu test, ekran görüntüsü, tek dosya derleme
```

Simülasyon 30 Hz sabit adımla çalışır ve görüntüden bağımsızdır. Aynı seed her zaman aynı koloniyi üretir.

Koloni tarayıcıda otomatik kaydedilir (`src/sim/save.ts`). Sayfa yeniden açılınca iniş ekranında "Continue colony" düğmesi çıkar.
