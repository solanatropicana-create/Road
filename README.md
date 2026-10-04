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

Varsayılan **kaptan modu**: nereye gidileceğini ve neyin vurulacağını sen seçersin, gemi bunu kendi iticileriyle yapar.

| Kaptan modu (fare) | Dokunmatik |
|---|---|
| Sağ tık: oraya git · sağ sürükle: rota çiz · Shift+sağ: rotaya nokta ekle | Boşluğa dokun: git · sürükle: rota çiz |
| Sağ tık düşmana: kenetlen (mesafeyi koru, etrafında dön) | Düşmana dokun: hedefle ve kenetlen |
| Sol tık düşman modülü: bütün silahlar oraya | |
| `Space` durdur (durmuşken emir verilebilir), `1` `2` `3` hız ×½ ×1 ×2, `H` ateşi tut | DURDUR ve HIZ düğmeleri |

**Dümen modu** (`Tab` veya DÜMEN düğmesi): `W` `S` ileri/geri, `A` `D` dön, `Q` `E` yana kay, fare nişan, sol tık top, sağ tık lazer, `F` uçuş asistanı / drift, `Shift` yavaşlat. Dokunmatikte sol yarı yön, sağ yarı nişan ve ateş.

Genel: `R` yeni tur, `N` sonraki tur (izle), `Esc` menü, `M` ses, `B` bloom, tekerlek zoom.

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
