# Underfoot — Tasarım Belgesi

*Çalışma adı. Gece prototipi, 12 Ekim 2026.*

## 1. Tek cümlede

Gerçek ölçekte bir toprak kesitinde, bir *Messor structor* (hasatçı karınca) kraliçesinin kurduğu koloniyi izliyorsun. Karıncalara tek tek emir vermiyorsun, koloninin neyi önemsediğine karar veriyorsun.

## 2. Bu gece ne yapıldı

- Tarayıcıda oynanabilir prototip var: kraliçe iner, kanatlarını koparır, yuvasını kazar, ilk işçileri büyütür. Sonra koloni kendi başına büyür: kazar, tohum toplar, ambar doldurur, yavru besler, çöp atar. Yağmur ve fırtınada su basar, ıslak tavanlar çöker.
- Koloni beyni arayüzü (Mod B) çalışıyor.
- Simülasyon sağlam. 8 farklı haritada 30 dakikalık (5 oyun günü) otomatik testte 8 koloninin 8'i de büyüdü: 118–186 işçi, 2000–3300 hücrelik yuva, hiç açlık ölümü yok.
- Gece boyunca bulunan ve düzeltilen önemli hatalar: krater kenarında sapı kesilip havada kalan bitkiler toplayıcıları kilitliyordu (iki haritada koloni açlıktan ölüyordu); kraliçe yüzeydeki bir çakılın üstüne inince kazamıyordu.
- Çalıştırmak için: `npm install` ve ardından `npm run dev`. Tek dosyalık sürüm için `npm run build:artifact`.

## 3. Görsel dil: seçtiğim yön ve nedenleri

Hedef şu: ekran görüntüsünün kendisi paylaşılmak istensin. Bir doğa belgeselinin makro çekimi ile bir laboratuvar gözlem düzeneğinin arasında bir yerde duruyoruz. Çizgi film karıncası yok.

### 3.1 Gerçek ölçek: 1 hücre = 1 mm

- Dünya 640 × 360 hücre, yani 64 × 36 cm'lik bir toprak dilimi. Bu, gerçek bir gözlem formikaryumu boyutu.
- Minör işçi 7 mm, majör 9 mm, kraliçe 13 mm boyunda; gerçek *Messor structor* ölçüleri.
- Tohum 1–2 hücre, kum tanesi 1 hücre.
- Karınca saniyede 15 mm yürür; bu, gerçek *Messor* hızı.

**Neden:** Formicarium dahil benzer oyunların çoğunda ölçek keyfi. Gerçek ölçek bize iki şey kazandırıyor:

1. Her şey "doğru" görünüyor. Yaprak, çakıl ve kök kendi gerçek boyutunda.
2. Ölçek pazarlamada kullanılabilir: "64 cm toprak, 150 karınca, hepsi gerçek boyutta."

### 3.2 Makro objektif hissi

Görüntü üç katmandan oluşuyor, bir makro fotoğraftaki gibi:

1. **Arka plan (odak dışı):** çayır, gökyüzü, bokeh. Yumuşak ve bulanık.
2. **Toprak kesiti (sahne):** keskin piksel sanatı, 1 piksel = 1 mm.
3. **Karıncalar (özne):** ekran çözünürlüğünde, her yakınlaştırmada keskin (bkz. 3.3).

Ayrıntılar:

- Toprak kesiti keskin piksel sanatı.
- Arkadaki çayır, gökyüzü ve çimen yarım çözünürlükte çiziliyor ve yumuşak büyütülüyor. Böylece arka plan, makro fotoğraftaki gibi alan derinliği dışında kalıyor.
- Arka planda bokeh daireleri ve gece ateş böcekleri var.
- Kenarlarda vinyet, üstünde hafif film greni var.

**Neden:** Piksel sanatı tek başına "retro oyun" diye okunuyor. Arkadaki bulanıklık ise "kameranın önündeki gerçek bir şey" diye okunuyor. İkisi birlikte hem okunaklı hem de sinematik duruyor. Bu, klip aracı fikriyle de doğrudan bağlantılı (bkz. 7.4).

### 3.3 Karıncalar: sahnenin öznesi

Karıncalar toprak gibi piksel olarak değil, ekran çözünürlüğünde çiziliyor. İlk denemede piksel karıncalar yakınlaştırınca okunmaz bir gürültüye dönüşüyordu. Makro lens fikrinde netlik özneye ait olmalı.

- **Anatomi:** *Messor*, Myrmicinae alt familyasından. Bu yüzden:
  - Belde iki boğum var (petiol ve postpetiol).
  - Göğsün arkasında küçük dikenler var.
  - Başın altında "psammofor" var: kum taşımaya yarayan sakal gibi kıllar. Bu kıllar yalnızca yakın planda görünüyor.
- **Hareket:**
  - Altı bacak tripod yürüyüşüyle adım atıyor.
  - Antenler sürekli tarıyor.
  - Karıncalar hücreden hücreye kaymadan süzülüyor.
  - Duvara ve tavana dönüp ters yürüyebiliyor.
  - Geri dönerken gövde gerçekten dönüyor.
  - Kazarken başını sallıyor.
- **Işık:**
  - Parlak kitin üstünde ince bir parlama var.
  - Kenarda bir piksellik sıcak bir ışık hattı var; üst üste binen karıncalar böylece ayrışıyor.
  - Yuvada arka duvara yumuşak bir gölge düşüyor.
- **Kastlar:** Majörün kafası iri ve kızıl-kahve. Kraliçenin karnı büyük; kanatları yarı saydam ve inince düşüyor.
- **Yavru ve ölüler:**
  - Larvalar beslendikçe şişiyor ve kursaklarında tohum lapası görünüyor.
  - Pupalar çıplak, çünkü Myrmicinae koza örmez. Olgunlaştıkça kararıyorlar.
  - Ölü karıncalar sırtüstü yatıyor, bacakları kıvrık.
- **Ambar:** Yakın planda tohumlar parlak taneler olarak yığılıyor, kabuklar soluk pullar gibi duruyor.
- **Ayrıntı seviyesi:**
  - Uzaktan sade bir siluet.
  - Yakında tam anatomi.
  - 150+ karıncada çizim maliyeti yaklaşık 2–3 ms.

**Neden:** Toprak piksel, karınca pürüzsüz. Bu bilerek yapılmış bir karışım. Sahne bir "tuval", karınca ise kameranın odaklandığı canlı. Yakın plan ekran görüntüleri ve klipler bu sayede belgesel gibi görünüyor. Bunu beğenmezsen karıncalar tekrar piksel yapılabilir; sorulardan biri bu (9. bölüm).

### 3.4 Toprak gerçek horizonlarla

- Yukarıdan aşağı katmanlar:
  1. Koyu humus ve kökler.
  2. Kahverengi tın.
  3. Paslı kırmızı kil (demir oksit).
  4. Soluk alt toprak ve çakıl.
- Her katmanın sertliği farklı. Kil en zor kazılanı ama tavanı en iyi o tutuyor.
- Kazılan toprak dışarı taşınıyor ve yuva ağzının çevresinde gerçek *Messor* yuvaları gibi bir toprak höyüğü oluşturuyor.
- Tünelin arka duvarı, kazılan toprağın tonunu "hatırlıyor". Böylece kazılmış yer, kazılmamış yerden ayrı görünüyor.
- Toprak dokusu:
  - Çimenlerin saçak kökleri ve yoncanın kazık kökü, içinden geçtiği toprağın açık tonunda iplikler olarak görünüyor.
  - Eski solucan yolları (krotovina) koyu üst toprakla dolu. Gevşek oldukları için karıncalar bu yolları takip etmeyi sever.
  - Kilin içinde gri ve pas rengi lekeler var; suyun durduğu ve demirin paslandığı yerler.
  - Alt toprakta ince tabakalanma var.
  - Üst toprakta kömür parçacıkları var.
- Höyük gerçek bir *Messor* krateri gibi alçak ve geniş: girişin iki yanında bir sırt, çayıra doğru incelen bir döküntü. Koloni büyüdükçe höyük de büyüyor.
- Yuva mimarisi kendiliğinden "Noel ağacı" şeklini alıyor: tek dikey şaft ve iki yanında yassı odalar. Bu, Tschinkel'in gerçek hasatçı karınca yuvalarına alüminyum dökerek çıkardığı kalıplarla aynı.

**Neden:** Toprak bu oyunun asıl tuvali. Katmanlar hem güzel görünüyor hem de oyuna anlam katıyor: derin kazmak pahalı ama güvenli.

### 3.5 Gece: kırmızı gözlem lambası

- Gece yer üstü maviye ve karanlığa döner.
- Yer altı ise kırmızı bir gözlem lambasıyla aydınlanır. Gerçek karınca bakıcıları da kırmızı ışık kullanır, çünkü karıncalar kırmızıyı göremez.
- Gün 6 dakika sürüyor (1x hızda). Şafak ve gün batımında gökyüzü renk geçişleri var.

**Neden:** Bu sayede gece de oynanabilir oluyor ve ekran görüntüleri günün saatine göre çok farklı renk kimlikleri kazanıyor. Akşam altın sarısı, gece kırmızı ve lacivert, yağmurda kurşuni.

### 3.6 Arayüz: laboratuvar aleti

- Yazı tipleri IBM Plex Mono (sayılar ve etiketler) ile IBM Plex Sans (metin).
- Koyu, yarı saydam ve bulanık arkalıklı paneller.
- Tek bir vurgu rengi var: kehribar (`#e2b45c`), tohum ve tahıl rengi.
- Arayüz bir saha defteri ya da gözlem cihazı gibi davranıyor. Sayılar ve grafik ön planda, süs yok.

**Neden:** Oyun "bilimsel gözlem" havasında. Arayüz sahneyle yarışmamalı, ona not düşmeli.

### 3.7 Palet

| Kullanım | Renk |
|---|---|
| Vurgu (tohum, seçili) | `#e2b45c` kehribar |
| Arayüz metni | `#efe6d6` kemik beyazı |
| Panel zemini | `#100c09` %74 opak |
| Kraliçe odası tonu | `#5a3350` mürdüm |
| Kreş tonu | `#7a6248` |
| Ambar tonu | `#7a5a26` |
| Dinlenme odası tonu | `#3e3328` |
| Uyarı | `#e07a5f` |

### 3.8 Bilerek yapmadıklarım

- Sevimli, gözlü, çizgi film karıncalar yapmadım. Karınca küçük ve gerçekçi; kişilik davranıştan gelmeli.
- Neon, bilim kurgu ve "oyunsu" HUD kullanmadım.
- Izgara ya da tile görünümü yok. Hücreler var ama toprak organik görünüyor.

## 4. Oyuncunun rolü: Koloni Beyni (Mod B)

Oyuncu tek bir karıncaya emir vermez. Koloninin önceliklerini belirler. Her işçi bu öncelikleri kendi yaşına, kastına ve gördüklerine göre tartar.

| Kontrol | Ne yapar |
|---|---|
| İş öncelikleri: Kaz / Topla / Bak / Temizle (Kapalı · Düşük · Normal · Yüksek) | Koloninin o işe ayırmak istediği payı değiştirir. Altındaki çubuk gerçekte kaç karıncanın o işte olduğunu gösterir. |
| Kraliçe: Üreme (Düşük · Normal · Yüksek) | Yumurta hızını belirler. Yüksek üreme hızlı büyütür ama yiyecek yetmezse açlık riski doğar. |
| Majör oranı | Yavruların ne kadarının iri kafalı majör olacağını belirler. Majörler tohum kırar ve yavaştır. İleride savaşacaklar. |
| Yuva: + Kreş / + Ambar / + Dinlenme odası / Daha derine kaz | Planlayıcının sırasına oda ekler. |
| Büyüme işareti | Yeraltında bir noktaya tıklarsın, koloni o yöne doğru genişler. |
| Sandbox: Yağmur / Fırtına | Hava zaten kendiliğinden geliyor. Bu butonlar yuva tasarımını hemen test etmek için var. |

Ayrıca:

- Bir karıncaya tıklarsan kamera onu takip eder. Karıncanın etrafında kehribar köşeli parantezler çıkar; panelde adı, kastı, yaşı, ne yaptığı ve ne taşıdığı görünür.
- H tuşu tüm panelleri gizler; ekran görüntüsü ve video için temiz kadraj verir.
- Bir odanın üstüne gelirsen içindeki tohum ya da yavru sayısı çıkar.
- Kısayollar: Boşluk duraklatır, 1–5 hız seçer, F tüm kesiti gösterir, tekerlek zoom yapar, sürükleme kaydırır.

## 5. Simülasyon: şu an çalışan sistemler

**Dünya**

- Hücre tabanlı toprak: malzeme, ton, nem ve "arka duvar" katmanları.
- Gevşek malzeme (kazı toprağı, tohum, çöp) düşen kum fiziğiyle akıyor.
- Yerleşen toprak sıkışıp şev tutuyor.
- Su akıyor, toprağa emiliyor ve nem aşağı sızıyor.
- Doymuş tavan ve duvarlar çöküyor.

**Kraliçe ve kuruluş**

- Kraliçe kanatlarını koparıyor, A* ile bir giriş şaftı ve bir kraliçe odası kazıyor.
- Kapalı kuruluş (claustral) yapıyor: ilk yavruları kendi vücut rezerviyle besliyor, dışarı çıkmıyor.

**Yavru**

- Yumurta, larva ve pupa evreleri var. Larvalar beslenmeli; beslenmeyen ölür.
- Bakıcılar yavruyu kreşe taşıyor.
- Su basan kreşte yavru boğuluyor.

**Kastlar ve görev dağılımı**

- Minör ve majör işçi var.
- Görev, açık ilkesiyle dağıtılıyor: oyuncu önceliği ile koloni ihtiyacının çarpımı istenen payı verir, gerçekleşen payla karşılaştırılır.
- Yaşa bağlı iş bölümü var: genç işçi bakıcı, yaşlı işçi toplayıcı olur. Bu gerçek karıncalarda da böyle.
- Karıncalar yeni görevi sadece yuvadayken alır. Kaybolan karınca yükünü bırakır ve yeniden düşünür.

**Yuva planlayıcı**

- Koloni nüfusa göre yer ihtiyacı hesaplar.
- Sırayla ambar, kreş, dinlenme odası ekler ve şaftı derinleştirir.
- Odalar düz tabanlı, loblu "krep" şeklinde. Gerçek *Messor* odaları da böyle.
- Bağlantı yolu bulunamayan oda planlanmaz.
- Kopan işler yeniden bağlanır.
- Yuvaya düşen toprak "temizlenecek" olarak işaretlenir.

**Toplama**

- Toplayıcı bir yön seçip uzaklaşıyor, sonra arıyor.
- Yakındaki tohumu kokluyor, iz feromonu bırakıyor ve izi yönüyle takip ediyor.
- Tohumu ambara taşıyor. Ambar yoksa tohum ortak kursağa (trofalaksi) gidiyor.

**Yiyecek döngüsü**

- Tohum yeniyor, kabuğu kalıyor. Temizlikçiler kabuğu dışarıdaki çöp yığınına (midden) taşıyor.
- Açlık başlarsa kraliçe yumurtayı kısıyor ve işçiler toplamaya kayıyor.

**Hava**

- 0,9–2,2 günde bir yağmur geliyor.
- Fırtınada şimşek çakıyor.
- Yağmurda toplayıcılar eve koşuyor, yer üstündekiler sığınıyor.
- Suya düşen karınca havaya doğru yüzüyor ya da boğuluyor.

**Dış dünya**

- Çayırdan tohum yağıyor, ara sıra meyve düşüyor.
- Kuşlar ve fareler yerdeki fazla tohumu topluyor.

**Performans**

- 150 karıncada simülasyon adımı yaklaşık 0,15 ms. 16x hızda bile tarayıcıda rahat çalışıyor.
- Görüntüsüz test aracı var: `npm run headless` ve `scripts/batch.sh`.

## 6. Formicarium'dan aldıklarımız ve geçtiğimiz yerler

**Aldıklarımız**

- Yan kesit toprak.
- Piksel toprak ve kazıların kalıcı izleri.
- "Kendi kendine yaşayan koloni" hissi.

**Geçtiğimiz yerler**

1. **Gerçek ölçek ve gerçek tür.** Davranışlar *Messor structor*'un gerçek biyolojisine dayanıyor: ambar, majörler, kuruluş, midden.
2. **Oyuncu rolü.** Formicarium bir oyuncak. Bizde koloni beyni katmanı var; kararların sonucu var.
3. **Hava ve su.** Yuva tasarımının bir sınavı var: su basıyor, tavan çöküyor.
4. **Görsel derinlik.** Makro lens arka planı, gün döngüsü ve kırmızı gece lambası var.
5. **Steam'e uygun yapı.** Sezon ve run yapısı, rakip koloni ve klip aracı planlanıyor (aşağıda).

## 7. Yol haritası: öneriler, kararı birlikte vereceğiz

Aşağıdakiler benim önerilerim. Senin "benle konuşmadan tasarımı komple yapma" isteğine uyarak bunların hiçbirine başlamadım. Gece sadece temel simülasyonu ve görsel dili kurdum.

### 7.1 Rakip koloni

**Öneri:** Aynı kesitte, karşı tarafta ikinci bir koloni olsun. Bu, *Messor* ya da daha agresif bir tür olabilir; örneğin *Tetramorium* (kaldırım karıncası). Gerçekte de *Tetramorium* ile *Messor* arasında toprak savaşları olur.

Çatışma tohum alanı üzerinden çıkar:

- Toplayıcılar karşılaşınca kavga eder.
- Majör oranı burada anlam kazanır.
- Kazı sırasında tüneller birleşirse yeraltı savaşı başlar.

**Seçenekler:**

- (a) Rakip tamamen yapay zekâ.
- (b) Rakip ikinci bir oyuncu (aynı ekran ya da asenkron).
- (c) Rakip yalnızca belirli run'larda gelen bir tehdit.

### 7.2 Sezon / run yapısı

**Öneri:** Bir run bir koloninin ömrü olsun. İlkbaharda kurulur ve kışa kadar sürer, yaklaşık 60–90 dakikalık bir oturum.

- Kışa yeterli ambar ve yeterli derinlik (don sınırının altı) ile girersen koloni hayatta kalır.
- Hayatta kalan koloni bir sonraki sezonda kanatlı kraliçe ve erkek çıkarır. Bu "skor" olur ve bir sonraki run'a taşınan kazanım (meta ilerleme) verir: yeni tür, yeni harita, yeni özellik.
- Sezonun dinamikleri:
  - Yaz: kuraklık, tohum bol.
  - Sonbahar: yağmur ve sel.
  - Kış: toprak donar, koloni derinde uyur.

**Açık soru:** Roguelite mı (her run sıfırdan, meta ilerleme var), yoksa uzun soluklu tek koloni mi (Dwarf Fortress gibi)?

### 7.3 Türler

**Öneri:** Her tür farklı bir oyun stili olsun.

| Tür | Oyun stili |
|---|---|
| *Messor structor* (hasatçı) | Ambar ekonomisi, majörler, sabırlı. Başlangıç türü. |
| *Lasius niger* (bahçe karıncası) | Yaprak biti çiftliği (ballı özsu), hızlı büyüme, küçük işçi. |
| *Camponotus* (marangoz) | Toprak yerine çürük ahşap kazar, gece aktif, iri. |
| *Tetramorium* | Agresif, kalabalık, savaş odaklı. Rakip olarak da kullanılabilir. |
| *Solenopsis* (ateş karıncası) | Sel olunca sal kurar! Hava sistemimizle çok iyi eşleşir. |

### 7.4 Dahili klip aracı

**Öneri:** Oyun son 60 saniyeyi sürekli bellekte tutsun. Bir tuşa basınca:

- 15 saniyelik bir klip kaydedilir.
- Kamera sinematik bir yörünge, zoom ve odak çeker.
- Dikey (9:16) ve yatay format seçilebilir.
- Üstüne "Gün 4 · 87 işçi · *Messor structor*" gibi saha notu yazısı eklenir.

**Neden:** Bu tür oyunlar TikTok ve Instagram'da büyüyor (fieldnotes.sim örneği). Oyuncunun kendi kolonisinin videosunu tek tuşla paylaşması bedava pazarlama. Makro lens görsel dili bunun için seçildi.

**Teknik:** Canvas'tan `MediaRecorder` ile WebM, Electron'da da MP4'e çevirme.

### 7.5 Steam / Electron

- Şu anki yapı TypeScript, Vite ve Canvas2D. Bağımlılığı yok, tek dosyaya derleniyor.
- Electron sarmalı ile Steam'e çıkış kolay. Vampire Survivors da web teknolojisiyle yapılıp Steam'de çıktı.
- Steamworks entegrasyonu `steamworks.js` ile olur (başarımlar, bulut kayıt).
- Kayıt/yükleme sistemi henüz yok. Dünya typed array tabanlı olduğu için kolay eklenir.

## 8. Bilinen sorunlar

- **Tek giriş, yoğun trafik.** Büyük kolonide 60'tan fazla karınca aynı şafttan geçiyor: toprak taşıyanlar, kabuk atanlar, toplayıcılar. Gerçekçi ama görsel olarak kalabalık.
  - Önerim: koloni 120 işçiyi geçince ikinci bir giriş açılsın (gerçek büyük *Messor* yuvalarında birden çok giriş olur).
  - Bu bir mimari kararı olduğu için sormadan yapmadım.
- Yağmur suyu derine pek inmiyor, bu yüzden çökmeler nadir.
- Ses yok.
- Kayıt/yükleme yok.
- Klavye dışında erişilebilirlik ayarı yok.

## 9. Sana sorular: karar bekleyenler

1. **İsim.** "Underfoot" çalışma adı. Türkçe bir isim mi istersin, İngilizce mi? Steam için İngilizce daha geniş kitleye ulaşır.
2. **Run yapısı.** Roguelite sezonlar mı (7.2), yoksa uzun soluklu tek koloni mi?
3. **Rakip koloni.** Yapay zekâ mı, ikinci oyuncu mu, sadece tehdit mi (7.1)?
4. **İlk eklenecek ikinci tür hangisi?** Benim önerim *Solenopsis* (sal kurma) ya da *Lasius* (yaprak biti çiftliği).
5. **Görsel dil.** Makro lens + gerçek ölçek + laboratuvar arayüzü yönü sana uyuyor mu? Değiştirmek istediğin bir şey var mı?
   - Özellikle: toprak piksel, karıncalar pürüzsüz (3.3). Bu karışımı beğendin mi, yoksa her şey piksel mi olsun?
6. **Oyuncu müdahalesi.** Koloni beyni dışında doğrudan dünya müdahalesi (tohum bırakma, su dökme, taş koyma) olsun mu? Şu an yalnızca sandbox'ta yağmur var.
7. **Ses.** Ambiyans tasarımı ne yönde olsun? Mikrofonla kaydedilmiş gerçek toprak sesleri, ya da minimal synth?
8. **İkinci giriş.** Büyük kolonilerde ikinci bir giriş açılsın mı (8. bölüm)? Oyuncu bunu kendisi mi işaretlesin, yoksa koloni kendisi mi karar versin?
