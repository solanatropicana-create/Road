# Görsel inceleme: sanat paneli ve öneri

*12 Ekim 2026. Oyunda denemek için: `L` tuşu ya da `?art=new`. Varsayılan görünüm değişmedi.*

İki soru vardı:

1. Görsel taraf bir adım daha nasıl iyileşir?
2. Kamera yakınlaşınca art stilinin değişmesi mantıklı mı?

## Kısa cevap

**Evet, ama stil değişmesin, lens odaklansın.** Uzakta piksel kesit kalsın; orada iyi çalışıyor ve yuvanın haritası gibi okunuyor. Yaklaştıkça renk, ışık ve kompozisyon aynı kalsın. Değişen tek şey şu: milimetre büyütülmesin, içi çözülsün. Kırıntı, kum tanesi, gözenek, karıncaların sıvadığı tünel duvarı ve pürüzsüz bitkiler görünsün. Geçiş zoom 5 ile 8 arasında kademeli olsun, bir eşikte birden olmasın.

Beş panelistin beşi de bu soruya "kısmen evet" dedi. Sanat yönetmeninin duvara asılacak kuralı:

> Odaktaki hiçbir şey dört ekran pikselinden büyük bir piksel göstermez. Bunun altında hücre pikseldir, üstünde kırıntıdır: milimetreyi büyütme, içine ayrıntı ekle. Her stil değişimi bir aralıkta olur, bir eşikte değil.

Bu, oyunun "makro objektif" vaadinin tam yakınlaştığı yerde bozulmasını düzeltiyor. Bugün zoom 14'te bir milimetre 14 piksellik düz bir kare. Karıncalar ve tohumlar ise pürüzsüz çiziliyor. Panelin dört üyesi bunu tek başına en büyük sorun saydı.

## Önce / sonra

Aynı koloni, aynı kare, aynı an. Solda bugünkü görünüm, sağda öneri. Görüntüleri yeniden üretmek için: `node scripts/artlab.mjs`.

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

`L` tuşu öneriyi açıp kapatıyor. Tuşlar panelinde de var. `?art=new` öneriyle başlatıyor.

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

## Karar bekleyen sorular

1. **Yön:** "Uzakta piksel, yakında malzeme" yönü uygun mu? Uygunsa öneriyi varsayılan yapıp lensin performans işine geçebilirim.
2. **Gece lambası:** Bu kadar kırmızı mı olsun? Çok sinematik ama gece oyunu okumak biraz zorlaşıyor. Ara bir ton da olur.
3. **Oda tonları:** Hafif, sıcak tonlar mı kalsın, yoksa odayı yalnızca içindekiler mi anlatsın (ton hiç olmasın)? Tomás ve Ilse ikincisine yakın.
4. **Geçiş aralığı:** Panel 4,5–7 ile 6–10 arasında farklı aralıklar önerdi. Ben 5–8'i seçtim. Belgesel kamera çekimleri (zoom 8–11) böylece tamamen odakta kalıyor.
