# Dalga Kıranlar

Fizik tabanlı, üstten görünümlü bir korsan gemisi oyunu (mobil öncelikli, tarayıcıda çalışır). Referans aldığımız oyunun çekirdeği korundu: açık deniz, kendiliğinden ateş eden toplar ve limanda yuvalara top takma. Bunun üzerine çok daha büyük bir dünya, 8 gemi, 6 top türü ve gerçek bir gemi fiziği eklendi.

- Tasarım belgesi: [`docs/GDD.md`](docs/GDD.md)

## Çalıştırma

```bash
cd dalga
npm install
npm run dev          # http://localhost:5174 (telefondan aynı ağda IP:5174)
npm run typecheck
npm run sim-test     # başsız fizik/YZ testi: hız, dönüş, seviye kalibrasyonu, 3 dk YZ savaşı
npm run economy -- sandal 1 6   # bot oyuncu: dakikada kazanılan altın, batışlar
npm run build        # dist/
```

## Kontroller

| Dokunmatik | Klavye |
|---|---|
| Ekranın herhangi bir yerine dokunup sürükle: gemi o yöne döner, ne kadar uzağa çekersen o kadar hızlı | `WASD` / ok tuşları |
| Mavi yuvarlak düğme: gemi yeteneği | `Boşluk` |
| "Limana Gir" düğmesi (liman şamandıralarının içindeyken) | `E` |
| Mini haritaya dokun: dünya haritası | |

Toplar menzildeki düşmana kendiliğinden ateş eder. Yan toplar yalnızca bordadan ateşlediği için düşmana yanını çevirmek gerekir.

## Mimari

```
src/
  core/    matematik, seed'li RNG
  data/    gemiler, toplar, dünya (bölgeler, 150 ada, limanlar, bosslar), denge formülleri
  sim/     Three.js'e dokunmayan simülasyon
    waves.ts    dalga fonksiyonu (CPU + aynı tablodan üretilen GLSL)
    boat.ts     gemi fiziği: itki/sürtünme, omurga, dümen, rüzgar, yüzerlik, yalpa, su alma, batma
    weapons.ts  balistik nişan (öncülemeli), borda açıları, geri tepme
    world.ts    gülleler, isabet, alan hasarı, çarpışma (mahmuz), karaya oturma, halat, mayın, ganimet
    ai.ts       YZ kaptanları (tüccar, avcı, devriye, boss)
  game/    oyun akışı, profil/ekonomi, kayıt, düşman üretimi, ses (WebAudio sentezi)
  render/  su shader'ı, prosedürel gemi ve ada modelleri, parçacık efektleri, sahne
  ui/      HUD, joystick, liman ekranı, menüler
```

Simülasyon render katmanından bağımsızdır; `scripts/` altındaki testler Node'da doğrudan çalışır. Telefonda mağaza uygulaması olarak paketlemek için Capacitor kullanılabilir (yol haritasına bakın).
