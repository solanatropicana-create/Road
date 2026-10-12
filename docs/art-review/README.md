# Görsel inceleme: sanat paneli ve öneri

*12 Ekim 2026. Öneri onaylandı ve oyunun varsayılan görünümü oldu; aşağıda önce uygulanan hali, sonra panelin ilk turu var. Görüntüler, ilk turun kaydırmalı önce/sonra karşılaştırması ve oynanabilir sürüm (özel link): https://claude.ai/artifact/2DCm4JE4DcLWVYGPztyLk5*

## Uygulanan hali

Onayla gelen üç not:

- **Kırmızı ışık gereksiz.** Gece lambası eski haline döndü: kırmızı tek renk ve ışık havuzu yok.
- **Yakın plan ayrıntıları kalsın, uzakta piksel olur.** Öyle kaldı.
- **Yakından uzağa giderken ayrıntı birden kaybolmasın.** Geçiş genişletildi ve yeniden kuruldu (aşağıda).

Bir de bu arada oyuna yeni içerik geldi (mevsimler, beş bitki türü, çalı, ölü böcekler, buluntular, örümcekler, komşu koloni). Onlar da lense uyduruldu.

### Neler değişti

- **Öneri varsayılan oldu.** `L` tuşu ve `?art=new` kaldırıldı. Sıcak oda tonları, yuvadaki güçlü kenar ışığı, yatık tohumlar ve yuvarlak toz artık her zaman açık.
- **Kademeli odak.** Lens artık iki ayrı şeyi zoom ile ayarlıyor:
  - Görünürlük: zoom 3,4'ten 4,4'e kadar belirir. Bu aralıkta hâlâ piksel kesit gibi görünür: her alt piksel kendi hücresinin rengini ve sınıfını alır.
  - Odak: zoom 3,4'ten 6,8'e kadar artar. Renkler hücreler arasında karışır, kenarlar kavisleşir, doku, mineral taneler, duvar astarı ve gölgeler yavaş yavaş gelir.
  - Böylece bir anda iki farklı görüntü üst üste binmiyor ve uzaklaşırken ayrıntı adım adım azalıyor.
  - Kökler, lifler belirdikten sonra pikselden çözülüyor; geçişte kökler hiç kaybolmuyor.
- **Bitkiler:** Mevsimle sararıp kuruyorlar, çizimleri de öyle. Yeni türler:
  - Kılotu (stipa): ince yapraklar ve gümüş tüylü uzun kılçıklar.
  - Dönbaba (erodium): beş taç yapraklı pembe çiçek.
- **Çalı:** Gövdeler yuvarlak ve kabuklu. Yapraklar damarlı. Çiçekler beş taç yapraklı; çakal eriğinde beyaz, kuşburnunda pembe. Meyveler: buğulu çakal eriği ve parlak kuşburnu.
- **Yere düşmüş yapraklar ve dallar:** Turuncu şeritler yerine ince, kıvrık kahverengi yapraklar ve kabuklu dallar.
- **Ölü böcekler, düşen meyveler ve ağustos böceği nimfi:** Yuvarlak, kubbeli ve hafif parlak. Ambarda depolanan böcek ve meyve parçaları tohumların arasında kırıntı olarak görünüyor.
- **İki toprağın sınırı:** Humus ile kum, tın ile kil arası artık hücre basamağı değil; dalgalı dillerle karışıyor.
- **Performans:** Lens ekranı 32 × 32 mm'lik parçalar halinde tutuyor.
  - Bir parça yalnızca toprağı, ışığı ya da odağı değişince yeniden çiziliyor.
  - Bayat parçalar her karede ekranın ortasından başlayarak 6 ms'lik bir bütçeyle yenileniyor.
  - Böylece kaydırmak, karınca takip etmek ya da günün ışığının değişmesi ekranı bir anda yeniden çizdirmiyor.
  - Bu bulut makinesinde bir parça yakın planda (k=6) 3,8 ms, uzakta (k=2) 0,5 ms sürüyor.
  - Lensin dokuları, açılıştan sonra boş bir anda hazırlanıyor.

### Görüntüler

Yeni oyun sürümüyle aynı iki kayıtlı koloniden (`node scripts/artlab.mjs`).

| | |
|---|---|
| ![Akşam, yuva, zoom 8](img/applied-dusk-nest-z8.jpg) | ![Akşam, giriş, zoom 11](img/applied-dusk-entrance-z11.jpg) |
| ![Ambar, zoom 14](img/applied-granary-z14.jpg) | ![Yüzey, zoom 13](img/applied-surface-z13.jpg) |
| ![Gece, zoom 12: kırmızı ışık yok](img/applied-night-z12.jpg) | ![Sonbaharda çakal eriği, zoom 12](img/applied-shrub-autumn-z12.jpg) |
| ![Kum bozkırı: humus ile kumun sınırı, zoom 10](img/applied-sand-z10.jpg) | |

**Geçiş:** zoom 2,6 · 3,4 · 4 · 4,6 (üst sıra) ve 5,2 · 6 · 7 · 9 (alt sıra). Uzakta piksel, yaklaştıkça adım adım odak.

![Zoom 2,6'dan 9'a aynı yuva girişi](img/applied-zoom-ladder.jpg)

### Hâlâ açık

- Yumurtaların paket halinde durması.
- Yüzeydeki küçük su birikintilerinin kenarı.
- 9:16 klip render'ı (klip aracıyla birlikte).
- Yazılım render'ı kullanan bu makinede ekran kartı tarafının maliyetini ölçemedim. Gerçek bir dizüstünde bir kez bakmak iyi olur.

---

# İlk tur: panel ve öneri

İki soru vardı:

1. Görsel taraf bir adım daha nasıl iyileşir?
2. Kamera yakınlaşınca art stilinin değişmesi mantıklı mı?

## Kısa cevap

**Evet, ama stil değişmesin, lens odaklansın.** Uzakta piksel kesit kalsın; orada iyi çalışıyor ve yuvanın haritası gibi okunuyor. Yaklaştıkça renk, ışık ve kompozisyon aynı kalsın. Değişen tek şey şu: milimetre büyütülmesin, içi çözülsün. Kırıntı, kum tanesi, gözenek, karıncaların sıvadığı tünel duvarı ve pürüzsüz bitkiler görünsün. Geçiş zoom 5 ile 8 arasında kademeli olsun, bir eşikte birden olmasın.

Beş panelistin beşi de bu soruya "kısmen evet" dedi. Sanat yönetmeninin duvara asılacak kuralı:

> Odaktaki hiçbir şey dört ekran pikselinden büyük bir piksel göstermez. Bunun altında hücre pikseldir, üstünde kırıntıdır: milimetreyi büyütme, içine ayrıntı ekle. Her stil değişimi bir aralıkta olur, bir eşikte değil.

Bu, oyunun "makro objektif" vaadinin tam yakınlaştığı yerde bozulmasını düzeltiyor. Bugün zoom 14'te bir milimetre 14 piksellik düz bir kare. Karıncalar ve tohumlar ise pürüzsüz çiziliyor. Panelin dört üyesi bunu tek başına en büyük sorun saydı.

## Önce / sonra

Aynı koloni, aynı kare, aynı an. Solda o günkü görünüm, sağda öneri (ilk turun sürümüyle, `L` tuşuyla alındı).

**Akşam, yuva, zoom 8.** Panelin "paylaşılacak kare" dediği yer.

| Önce | Sonra |
|---|---|
| ![Önce: dusk-nest-z8](img/dusk-nest-z8-before.jpg) | ![Sonra: dusk-nest-z8](img/dusk-nest-z8-after.jpg) |

**Akşam, yuva girişi ve döküntü tepesi, zoom 11.** Tepe artık kazılan toprağın peletlerinden oluşuyor; çimen pürüzsüz.

| Önce | Sonra |
|---|---|
| ![Önce: dusk-entrance-z11](img/dusk-entrance-z11-before.jpg) | ![Sonra: dusk-entrance-z11](img/dusk-entrance-z11-after.jpg) |

**Öğlen, ambar, zoom 14.** Duvarlar kavisli, duvar astarı ve zemin kenarı ışık alıyor; kreş artık su gibi turkuaz değil; tohumlar yatık ve sıkışık.

| Önce | Sonra |
|---|---|
| ![Önce: granary-z14](img/granary-z14-before.jpg) | ![Sonra: granary-z14](img/granary-z14-after.jpg) |

**Öğlen, yüzey, zoom 13.** Bitkiler basamaklı çizgi yerine sivrilen yapraklar; kökler soluk lekeler yerine ince lifler.

| Önce | Sonra |
|---|---|
| ![Önce: surface-z13](img/surface-z13-before.jpg) | ![Sonra: surface-z13](img/surface-z13-after.jpg) |

**Gece, ambar, zoom 12.** Kırmızı lamba gerçekten kırmızı; ortada bir ışık havuzu, kenarlar karanlık.

| Önce | Sonra |
|---|---|
| ![Önce: night-z12](img/night-z12-before.jpg) | ![Sonra: night-z12](img/night-z12-after.jpg) |

**Tüm kesit.** Uzaktan bakınca neredeyse aynı. Yalnızca oda tonları değişti; bu bilinçli.

| Önce | Sonra |
|---|---|
| ![Önce: whole-slice](img/whole-slice-before.jpg) | ![Sonra: whole-slice](img/whole-slice-after.jpg) |

**Geçiş.** Öneri açıkken zoom 4, 5, 6 (üst sıra) ve 7, 8, 11 (alt sıra). Zoom 5'te bitkiler pürüzsüzleşiyor, toprak 5 ile 8 arasında yavaşça odaklanıyor.

![Öneri açıkken zoom 4, 5, 6, 7, 8 ve 11](img/zoom-ladder.jpg)

## Panel

Panel, oyun testindeki gibi beş "gerçek insan" personasıyla kuruldu. Hepsi aynı görüntülere baktı, aynı olgun koloniyi kendileri de çekti ve en fazla 800 kelimelik bir rapor yazdı. Raporlar İngilizce, `panel/` klasöründe. Her panelist bir de kaba bir boyama (paint-over) yaptı (`panel/mock-*.jpg`).

| Persona | Bakış açısı | En önemli bulgusu |
|---|---|---|
| Mira, sanat yönetmeni ([a1](panel/a1-artdirector.md)) | Piksel tutarlılığı, değer yapısı | Makroda toprak "büyütülmüş JPEG" gibi. Kural: odakta 4 pikselden büyük piksel olmasın. |
| Tomás, makro belgesel görüntü yönetmeni ([a2](panel/a2-cinematographer.md)) | Gerçek bir lens ne görür | Zoom 14 yaklaşık 1:3 makro; o büyütmede her lens 0,2 mm'lik taneleri çözer. Kırmızı lamba aslında kırmızı değil. |
| Jin, teknik sanatçı ([a3](panel/a3-techartist.md)) | Maliyet ve uygulanabilirlik | Her öneriye mühendislik günü ve kare maliyeti biçti. Zoom 5 geçişinde 106 ms takılma buldu. |
| Defne, pazarlama ve kapsül tasarımcısı ([a4](panel/a4-marketing.md)) | Telefonda kaydırmayı durduran kare | En iyi kareler makro karelerdi ve tam da onları kare toprak bozuyordu. 9:16 kırpımda toprak karenin yarısından fazlası. |
| Dr. Ilse, toprak mikromorfoloğu ([a5](panel/a5-soilscience.md)) | Toprak ve yuva gerçekte nasıl görünür | Karıncalar tünel duvarını çeneleriyle sıvar; makroda yuvanın imzası bu ince, koyu astar. Döküntü tepesi pelet olmalı. |

## Ortak bulgular

| Bulgu | Kaç panelist | Prototipte |
|---|---|---|
| Makroda toprak düz kareler; kırıntı, tane, gözenek yok | 5 / 5 | Var |
| Tünel ve oda duvarları basamaklı | 5 / 5 | Var (kavisli, astarlı, temas gölgeli) |
| Bitkiler makroda basamaklı piksel çizgi | 5 / 5 | Var |
| Kreşin turkuaz tonu su basmış gibi okunuyor | 5 / 5 | Var (sıcak, hafif tonlar) |
| Karıncalar yuvada karanlık duvarda kayboluyor | 4 / 5 | Var (daha açık arka duvar, daha güçlü kenar ışığı) |
| Gece kırmızı lambası yalnızca biraz karanlık, kırmızı değil | 4 / 5 | Var |
| Zoom 5'te ani geçiş ve takılma | 4 / 5 | Var (geçiş 5→8; takılma giderildi) |
| Ambar ızgara gibi; yığının içi kare | 3 / 5 | Var (yatık, kaydırılmış sıralar, gölgeli iç) |
| Hash yüzünden kesitte çapraz noktalı çizgiler | 2 / 5 | Düzeltildi (her iki görünümde) |
| Yumurtalar tek sıra boncuk gibi; gerçekte paket halinde | 2 / 5 | Yok |
| Dikey klip için 9:16 doğal render | 1 / 5 | Yok (klip aracıyla birlikte) |

## Prototipte ne var

*İlk turda öneri `L` tuşuyla açılıp kapanıyordu; artık varsayılan görünüm.*

- **Makro lens** (`src/render/macro.ts`):
  - Zoom 5'ten 8'e kadar kesit milimetre altına çözülüyor. Her milimetre 2–6 alt piksel oluyor.
  - Renkler hücre merkezleri arasında karışıyor.
  - Toprak ile boşluk arasındaki sınır hafifçe bulanıklaştırılmış bir katılık alanından çiziliyor. Böylece basamaklar kavise dönüyor. Düz duvarlar yerinde kalıyor, iki hücrelik bir geçit kapanmıyor.
  - Her malzemenin kendi dokusu var:
    - Humusta kırıntı ve gözenek.
    - Tında silt, kum tanesi ve küçük agregalar.
    - Kilde ince kılcal çatlaklar.
    - Alt toprakta kum.
    - Kazı toprağında peletler.
  - Dokunun ortalaması hücrenin kendi rengine eşit. Bu yüzden ışık, nem ve gece lambası aynen geçiyor.
  - Mineral taneler var: kuvars, pas ve koyu taneler, ara sıra parlayan bir tane.
  - Tünel duvarında ince, koyu, pürüzsüz bir astar var. Zeminlerin kenarı ışık alıyor. Boşluğun içinde temas gölgesi var.
  - Taşlar hafif kubbeli.
- **Bitkiler** (zoom 4,2'den itibaren):
  - Sap, eğri olarak çiziliyor.
  - Çimen yaprağı uca doğru sivriliyor.
  - Yoncanın üç yaprakçığı var, üstlerinde açık renk "V" deseni.
  - Yonca başı çiçekçik topu, çoban çantasının çiçekleri küçük beyaz çiçekler.
  - Olgun tohumlar tane olarak duruyor.
- **Kökler:** Kök hücreleri zincir halinde izleniyor ve ince lifler olarak çiziliyor.
- **Oda tonları:**
  - Kreş krem, ambar okra, kraliçe odası kızıl kahve.
  - Karışım %38'den %20'ye indi.
  - Mavi-yeşil artık yalnızca suya ait.
- **Gece lambası:** Toprak altı neredeyse tek renk kırmızı. Görüntünün ortasında bir ışık havuzu var, kenarlara doğru kararıyor.
- **Karıncalar:** Yuvada kenar ışığı ve parlama daha güçlü, çünkü siyah karınca koyu toprağın üstünde duruyor.
- **Ambar:** Yığındaki tohum yatık duruyor, sıralar yarım hücre kaydırılmış.
- **Toz:** Yakında yuvarlak çiziliyor, kare değil.

Her iki görünüme de giren iki düzeltme var:

- Kesitteki benekler artık doğru bir hash ile dağılıyor. Eskiden çapraz çizgiler oluşturuyorlardı.
- Zoom 5 geçişinde bütün kesit yeniden boyanıyordu; bu bu makinede yaklaşık 120 ms sürüyordu. Artık yalnızca tohum, çöp ve bitki hücreleri yeniden boyanıyor; bu yaklaşık 28 ms.

## Maliyet: dürüst not

Lens, görüntüyü JavaScript'te piksel piksel üretiyor. Bu bulut makinesinde (yazılım render'ı, paylaşılan işlemci) ekranın tamamını yeniden üretmek yaklaşık 40 ms sürüyor.

Bunu hafifletmek için görüntü önbellekte tutuluyor:

- Kamera durduğu ve gördüğü toprak değişmediği sürece görüntü yeniden kullanılıyor. Duran kamerada ek maliyet yok denecek kadar az.
- Küçük kaydırmalarda 6 mm'lik bir pay var.
- Işık yalnızca fark edilecek kadar değişince görüntü yeniden üretiliyor.

Bir karıncayı takip ederken görüntü birkaç karede bir yeniden üretiliyor ve bu bir takılma olarak hissedilebilir. Gerçek sürüm için Jin'in önerisi iki yoldan biri:

- 32×32 hücrelik parçalar halinde önbellek, ve değişen hücreleri bulmak için `dirtyList`.
- Ya da aynı işi WebGL'de yapmak.

Jin'in tahmini: işlemcide 1 ms'nin altında, ekran kartında 1–2 ms. Bu prototip görünümü göstermek için. Performans işi ayrı bir adım.

## Yapılmayanlar

- Yumurtaların yapışkan paketler halinde durması (Tomás, Ilse).
- Taşların tam oval olması. Şimdilik köşeleri yuvarlak ve kubbeli.
- Yaprak döküntüsünün kıvrık ince yaprak olarak çizilmesi.
- Toprak altındaki filizlerin soluk sarı olması.
- Kök kılları.
- Ara sıra bir kollembol (springtail).
- Yüzeydeki su birikintilerinin kenarı hâlâ köşeli.
- Geçiş bandında (zoom 5–7) piksel ve lens bir an üst üste görünüyor. En çok köklerde fark ediliyor. Jin geometriyi saydamlıkla karıştırmak yerine parametreleri kaydırmayı öneriyor.
- 9:16 klip render'ı (Defne). Klip aracıyla birlikte ele alınmalı.

## İlk turdaki sorular (cevaplandı: yön onaylandı, kırmızı ışık kaldırıldı, oda tonları hafif kaldı, geçiş genişletildi)

1. **Yön:** "Uzakta piksel, yakında malzeme" yönü uygun mu? Uygunsa öneriyi varsayılan yapıp lensin performans işine geçebilirim.
2. **Gece lambası:** Bu kadar kırmızı mı olsun? Çok sinematik ama gece oyunu okumak biraz zorlaşıyor. Ara bir ton da olur.
3. **Oda tonları:** Hafif, sıcak tonlar mı kalsın, yoksa odayı yalnızca içindekiler mi anlatsın (ton hiç olmasın)? Tomás ve Ilse ikincisine yakın.
4. **Geçiş aralığı:** Panel 4,5–7 ile 6–10 arasında farklı aralıklar önerdi. Ben 5–8'i seçtim. Belgesel kamera çekimleri (zoom 8–11) böylece tamamen odakta kalıyor.
