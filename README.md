# KESİT

Karolardan yapılmış gemilerin tutarlı bir fizikle parçalandığı, tek oyunculu space RPG roguelike. Bu repo şu an **savaş dilimi prototipini** içeriyor.

- Tasarım belgesi (TBD): [`docs/KESIT-GDD.md`](docs/KESIT-GDD.md)
- Fragman: [`docs/media/kesit-savas.mp4`](docs/media/kesit-savas.mp4) · [`docs/media/kesit-patlama.gif`](docs/media/kesit-patlama.gif)

## Çalıştırma

```bash
npm install
npm run dev            # http://localhost:5173
npm run typecheck
npm run sim-test       # başsız YZ vs YZ turları: çökme/NaN kontrolü, tur süreleri
npm run balance        # gemi çiftleri için kazanma matrisi
npm run build:artifact # tek dosyalık sayfa: dist-artifact/kesit.html
```

## Kontroller

| Klavye / fare | Dokunmatik |
|---|---|
| `W` `S` ileri/geri, `A` `D` dön, `Q` `E` yana kay | Sol yarıda sürükle: gemi o yöne döner ve yakar |
| Fare nişan, sol tık top, sağ tık lazer | Sağ yarıya dokunup tut: o noktaya ateş |
| `Space` uçuş asistanı / drift, `Shift` yavaşlat | ASİSTAN ve YAVAŞ düğmeleri |
| `R` yeni tur, `N` sonraki tur (izle), `Esc` menü, `M` ses, `B` bloom, tekerlek zoom | MENÜ düğmesi |

## Mimari

```
src/
  core/     seed'li RNG, vektör yardımcıları
  sim/      deterministik simülasyon (render'a dokunmaz)
    defs.ts        karo kataloğu: kütle, dayanım, güç, itki, silah sayıları
    blueprints.ts  gemi yerleşimleri (ASCII)
    ship.ts        karo ızgarası → planck gövdesi (karo başına bir fixture)
    flight.ts      itici dağıtımı: sınırlı en küçük kareler (asistan) / ham mod
    power.ts       güç ağı: iletken karoların bileşenleri, öncelikli dağıtım
    world.ts       adım döngüsü, mermiler, DDA delme, patlamalar, çarpışma hasarı, bölünme
    ai.ts          YZ pilotu (oyuncuyla aynı ShipInput'u üretir)
  game/     maç akışı, girdi, HUD, ses (WebAudio sentez)
  render/   Pixi sahnesi, gemi çizimi, efektler
```

Simülasyon 60 Hz sabit adımla ve seed'li RNG ile çalışır; aynı seed aynı savaşı üretir. `window.__capture` kancası fragman karelerini kare kare yakalamak için kullanılır.
