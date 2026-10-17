# Sprint 2: Seyir zevki

*17 Ekim 2026. Hedef: oyunu yakında yayınlayacakmışız gibi, açıp izleyen birinin ilk dakikadan itibaren keyif alması. Bu belge sprint başındaki analizi, planı ve yapılanları anlatır; her madde bittikçe güncellenir.*

## 1. Önce: bütün dallar main'de

Sprint başında main'de olmayan üç dal vardı:

- `claude/serene-einstein-krrafp`: 92 commit, Sprint 1'in tamamı (yaşayan dünya, yeraltı, belgesel, ses, kayıt yuvaları).
- `claude/busy-turing-e9fcqz`: grup kavgaları, gömülü ikinci kapı, komşuların topladığı tohumun görünmesi.
- `claude/marketing-videos`: oyunun kendisinden kare kare tanıtım videoları (`scripts/film/`).

Üçü birleştirildi ([PR #4](https://github.com/solanatropicana-create/Road/pull/4)). Çakışmalarda iki tarafın eklediği alanların hepsi korundu. 8 harita × 160 haftalık ölçümün sonuçları:

- 8/8 koloni 4. yılın baharında hayatta, açlık ölümü 0.
- 8/8'de evlilik uçuşu oldu. Son nüfus 86–643 işçi.

Birleşmenin bir şeyi bozup bozmadığını ayrıca ölçtük. 1. yılda iki dal arasındaki tek fark, `busy-turing`'in "takılınca etrafı yokla" yürüyüşünden geliyor. Bu fark hasadı düşürmüyor: 8 haritada 45. haftaya kadar 3358 tohum toplandı, birleşme öncesi 3257.

İki haritanın 2.–3. yılda ~100 işçide takılmasının sebebi birleşme değil, kurbağa (aşağıda 2.6).

## 2. Analiz

Yöntem:

- **Yolculuk:** Bir izleyici gibi başlık ekranı → iniş → kuruluş → ilk işçiler → 1. yaz, sonbahar, kış → 2. yaz, her aşamada ekran görüntüleri.
- **Olgun koloni:** 2. yılın yazındaki bir koloni, günün dört saatinde (şafak, öğle, akşam, gece) beş yakınlıkta (bütün kesit, yuva, giriş, kreş, ambar).
- **Belgesel:** 8 kare.
- **Önce/sonra:** Her değişiklik aynı kayıtlı koloni üzerinde önce/sonra görüntüleriyle denendi.

### Güçlü yanlar

- Yer üstü çok iyi: odak dışı çayır, çiçekler, ateşböcekleri, ışık huzmeleri.
- Karıncalar ve yavrular canlı ve okunaklı.
- Ambardaki tohum yığınları iştah açıcı.
- Gece kırmızı gözlem lambası yuvayı okunur tutuyor.
- Belgesel kamerası çekimleri iyi seçiyor, altyazıları güzel.

### Sorunlar (izleyiciye etkisine göre)

1. **Büyüme yavaş.** Gerçek tempoda:
   - İlk işçiler 9 hafta sonra çıkıyor (1×'te 54 dakika, varsayılan 4×'te 13 dakika).
   - 1. yılın sonunda koloni 30–40 işçi, 7 oda.
   - Büyük bir yuva 2–3 yıl sürüyor (16×'te yarım saati aşar).

   Rakip karınca simülasyonlarında yuva dakikalar içinde yayılıyor. İzleyici bunu bekliyor.
2. **Kadrajın çoğu simsiyah.** Koloninin bilmediği toprak neredeyse düz siyah çiziliyordu (%97 opak). Kuruluş ve ilk yıl boyunca ekranın yarısından fazlası boştu. Lamba ışığı hissi iyi bir fikir, ama ekran "kapalı" görünüyordu.
3. **Yakın planda kesikli siyah noktalar.** Makro lens, bulanıklaştırınca kaybolacak tek hücrelik ayrıntıları (ince bir çatlak, tek bir tane) korumak için hücre merkezine bir nokta koyuyordu. Bu kural basamaklı çapraz duvarların her girintisine de uygulanıyordu. Sonuç: z9 ve üstünde her odanın kenarında kare nokta dizileri, tek hücrelik kök kanalları da kesikli çizgi.
4. **İnişten sonra kalabalık ekran.** "She comes down / İniyor" başlık kartı hâlâ ekrandayken başlık çubuğu, sağ panel, araç çubuğu ve bildirim aynı anda geri geliyordu.
5. **Yuvanın büyümesi bir bakışta görülemiyor.** İzleyicinin paylaşmak isteyeceği bir an yok. Pazarlama notlarında "15 sn'lik klip, 16:9 ve 9:16" isteniyordu.
6. **Kurbağa kapanı.** Kurbağa 80+ işçili koloniye geliyor, her gece 6–16 işçi yiyor ve yuvayı hatırlayıp geri dönüyor. Onu kaçırmak için 25 alarmlı işçi gerekiyor. 100 işçilik bir koloni bu kalabalığı toplayamıyor, kurbağa her gece geri geliyor ve koloni iki yıl yerinde sayıyor (8 haritanın 2'sinde 53 ve 78 işçi). İzleyici için iki yıl hiçbir şey olmuyor.
7. **Ağaç gövdesi yakın planda düz bir blok.** Kabuk dokusu yok, kenarı keskin ve düz.
8. **Performans.** Hızlı tempolarda koloni 500+ işçiye çıkacak. 16×'te kare başına simülasyon bütçesi (12 ms) aşılırsa oyun ağırlaşır.

## 3. Plan

Öncelik sırası "izleyicinin ilk 10 dakikası", sonra "uzun izleme", sonra "paylaşılabilirlik".

### Sprint 2a: ilk izlenim

| # | İş | Durum |
|---|---|---|
| A1 | **Tempo seçimi** (yeni koloni ekranında ve ayarlarda): *Gerçek*, *Canlı* (~3×), *Hızlı büyüme* (~7×). Yavru gelişimi, yumurtlama, kazı, yürüyüş, çayırın tohum verimi ve genç komşunun büyümesi tempoyla ölçeklenir; mevsimler aynı uzunlukta kalır. Seçim koloniyle kaydedilir. | yapıldı |
| A2 | **Bilinmeyen toprak loş ve odak dışı:** Siyah yerine toprağın kendi katmanları derin gölgede görünür. Kazılmış boşluklar (başka kolonilerin galerileri) gizli kalır. | yapıldı |
| A3 | **Makro lens ince ayrıntılar:** Nokta yalnızca gerçekten ince olan hücrelere (en fazla 2 aynı tür komşu) uygulanır, ince hatlar birbirine bağlanıp ince ve yumuşak bir kanal olarak çizilir. Basamaklı duvarlar düz eğri olur. | yapıldı |
| A4 | **İniş sonrası sakinlik:** Başlık kartı sönene kadar paneller ve bildirimler bekler. | yapıldı |

### Sprint 2b: uzun izleme ve paylaşım

| # | İş | Durum |
|---|---|---|
| B1 | **Yuvanın zaman atlamalı filmi:** Her yuva hücresinin ne zaman kazıldığı kaydedilir. Film toprağı inişten önceki haline getirir, tünelleri ve odaları çeyrek hafta çeyrek hafta açar; yeni kazılan yer kehribar renkte parlayıp söner. Tarih, işçi ve oda sayısı akar. İleri geri sarılabilir. Koloni panelinden, yıl özetinden, oyun sonu kartından ve G tuşuyla açılır. | yapıldı |
| B2 | **Filmi video olarak kaydet:** MP4 (tarayıcı destekliyorsa) ya da WebM; 16:9 ve dikey 9:16 (Reels/TikTok). | yapıldı |
| B3 | **Kurbağa kapanını kaldır:** Kurbağanın bir gecede yediği ve onu kaçırmak için gereken kalabalık koloninin büyüklüğüne bağlı olsun. | yapıldı (asıl sınır hasat çıktı, bkz. 5.1) |
| B4 | **Ağaç gövdesine kabuk:** Yakın planda dikey yarıklar, yuvarlak gölge, yumuşak kenar. | yapıldı |
| B5 | **Hızlı tempolarda performans:** 500+ işçilik kolonide tick süresi ölçülür, gerekirse en pahalı adım hafifletilir. | yapıldı |

### Sprint 3 (sonra): bu sprintin ölçümlerine göre

- **Belgeselde zaman atlamalı film:** Belgesel ara sıra yuvanın son haftalarının filmini oynatır.
- **"Önemli an" kameraları:** Evlilik uçuşu ve ilk kış başlangıcı için özel çekimler.
- **İlk dakika rehberi:** İzleme modunda ilk 2 dakikada birkaç sessiz ipucu (takip et, belgesel, film).
- **Steam sayfası için görsel seti:** Zaman atlamalı filmden ve belgeselden otomatik kareler.

## 4. Yapılanlar

### Tempo (A1)

Yeni koloni ekranında, mod kartlarının hemen üstünde *Gerçek · Canlı · Hızlı büyüme* seçimi ve bir satırlık açıklaması var. Aynı seçim ayarlar panelinde de duruyor, oyun sırasında değiştirilebiliyor. Seçim koloniyle kaydediliyor ve bir sonraki yeni koloni için hatırlanıyor. Eski kayıtlar *Gerçek* tempoyla açılıyor; testler için `?tempo=` adres parametresi var.

Tempo neleri ölçekliyor:

| | Gerçek | Canlı | Hızlı büyüme |
|---|---|---|---|
| Yavru gelişimi ve yumurtlama | 1× | 3× | 7× |
| Kazı (hücre başına süre ÷) | 1× | 2,2× | 4× |
| Yürüyüş | 1× | 1,5× | 2,2× |
| Çayırın tohum verimi | 1× | 2× | 3,5× |
| Genç komşu koloninin büyümesi | 1× | 3× | 3× |

Mevsimler, ömürler ve havanın akışı değişmiyor. Gerçek tempoda simülasyon eskisiyle birebir aynı (8 haritada 45 hafta karşılaştırıldı). İniş bitince oyun gerçek tempoda 4×, hızlı tempolarda 2× hızla devam ediyor; hızlı tempolarda karıncalar zaten daha hızlı yürüyor.

**Ölçüm (8 harita, 60 hafta, `scripts/batch.ts`):**
- *Canlı:* 8/8 hayatta, açlık 0. 1. yılın Ağustos'unda 127–196 işçi; 60. haftada 317–596 işçi, 13–21 oda; 6/8'de 2. yılın baharında evlilik uçuşu.
- *Hızlı büyüme:* 8/8 hayatta, açlık 0. 1. yılın yazında koloni 500–1000 işçiye çıkıyor (7. harita 15. haftada 536 işçi ve 17 oda; 3. harita 20. haftada 980 işçi ve 34 oda). 60. haftada 899–1027 işçi, zirve 968–1139, 26–35 oda, her haritada evlilik uçuşu (25–202 kanatlı). Kesitin taşıyabileceği üst sınır 1000 işçi (B5).

### Bilinmeyen toprak (A2)

Bilinmeyen toprak artık düz siyah değil. Her 8 mm'lik sis hücresi, içindeki katı hücrelerin rengini alıp derin gölgede gösteriyor. Boşluklar örneklenmediği için başka kolonilerin galerileri gizli kalıyor. Kuruluşta ve ilk yılda kadraj, lamba ışığında duran bir toprak kesiti gibi okunuyor.

### Makro lensin ince ayrıntıları (A3)

Bulanıklığın yutacağı bir hücre artık yalnızca gerçekten inceyse korunuyor: en fazla iki komşusu kendi türündense (tek hücrelik çatlak ya da kanal, tek bir tane). İnce hatlar komşularına bağlanıp sürekli bir kanal olarak çiziliyor; rengi çevredeki toprağa doğru %40 yumuşatılıyor. Basamaklı çapraz duvarlardaki nokta dizileri kayboldu, duvarlar düzgün eğri.

### İniş sonrası (A4)

"İniyor" kartı sönene kadar (3,4 sn) paneller gizli kalıyor, bildirimler sırada bekliyor.

### Yuvanın filmi (B1, B2)

- **Kayıt:** `Story` her çeyrek haftada bir, yuva planındaki her hücrenin ilk açık görüldüğü anı ve haftalık sayıları (işçi, yavru, tohum, oda) tutuyor. Kayıtta birkaç kilobayt yer kaplıyor. Eski kayıtlar açıldıklarında mevcut yuvayla başlıyor.
- **Film:** Toprak inişten önceki haline dönüyor, ışık oyundaki gibi derinlikle azalıyor. Tüneller ve odalar açıldıkça kehribar renkte parlayıp sönüyor; tarih, koloni adı, işçi ve oda sayısı akıyor. Film 10–20 saniye sürüyor ve ileri geri sarılabiliyor.
- **Biçim:** Derin ve dar yuvalar dikey (9:16), yayvan yuvalar geniş (16:9) açılıyor; ikisi arasında geçiş yapılabiliyor.
- **Video:** "Video olarak kaydet" filmi baştan oynatıp kaydediyor. Tarayıcı destekliyorsa MP4, yoksa WebM; 1280×720 ya da 720×1280. Testte 12,5 saniyelik bir video çıktı.
- **Açma yolları:** G tuşu, Koloni paneli, yıl özeti, oyun sonu kartı. İzleme modunda kimse dokunmuyorsa yılın filmi kış başında bir kez kendiliğinden oynuyor ve kendini kapatıyor. Yuva 4 odaya ulaşınca bir kereliğine "G filmi oynatır" ipucu çıkıyor.

### Ağaç gövdesi (B4)

Toprağın üstündeki gövde yakın planda kendi dokusunu alıyor: 1–2 mm genişliğinde, gövde boyunca kıvrılan, ayrılıp birleşen yarıklar ve aralarında ışık alan mantar plakalar. Önceden düşmüş dal lifi dokusuyla düz bir blok gibi görünüyordu.

### Kurbağa ve performans (B3, B5)

**Ölçüm (gerçek tempo, 8 harita, 160 hafta, bu turun bütün değişiklikleriyle):**
- 8/8 koloni 4. yılın baharında hayatta, açlık ölümü 0, 7/8'de evlilik uçuşu. Son nüfus 108–495 (birleşmeden sonraki ölçümde 86–643).
- Kurbağanın yediği işçi, yerinde sayan iki haritada 53'ten 25'e ve 78'den 30'a indi.
- Ama bu iki harita yine 120–150 işçide kaldı. Asıl sınır kurbağa değil, hasat: 1. haritanın 3. yazında 45–60 toplayıcı haftada 50–95 tohum getiriyor, yüzeyde 420–440 tohum duruyor. Bunu bir sonraki sprinte bırakıyoruz (aşağıda).

- **Kurbağa:** Bir gecede yediği işçi sayısı koloninin büyüklüğüne göre ölçekleniyor (100 işçiden birkaç tane, tam öğün yalnızca büyük koloniden). Onu kaçırmak için gereken kalabalık da 10 + işçilerin %5'i, en fazla 25.
- **Performans:** 900 işçilik bir kolonide tick süresinin ~%25'i mesafe alanlarına (BFS), ~%7'si sis açmaya gidiyordu.
  - Sis artık her yarıçap ve hücre içi konum için bir kez hesaplanan damgalarla açılıyor; sonuç aynı, karekök yok.
  - Mesafe alanları binlerce hücrelik bir yuvada 1,8 kata kadar daha seyrek yenileniyor; larva ve yumurta alanları hariç.
  - Leş araması önce mesafeye bakıyor.
  - Kesit en fazla 1000 işçi taşıyor; sonrasında kraliçe yalnızca kanatlı yavru yetiştiriyor. Günlüğe "kesit doldu" notu düşüyor.
  - Sonuç: 1013 işçilik bir kolonide tick 0,74 ms (boş makinede, Node). 16× için saniyede 356 ms simülasyon gerekiyor; oyun kare başına en fazla 12 ms (60 fps'de saniyede 720 ms) ayırıyor. Ekran kartı olan bir bilgisayarda hızlı büyüme 16×'te tam hızda dönmeli. Bu sunucu tarayıcıda yazılımla çizdiği için fps burada ölçülemedi. 554 karıncanın çizime kare başına 4–7 ms eklediği ölçüldü.

### Testler

- **Oyuncu testi** (masaüstü, dizüstü, telefon; her düğmeye gerçek fareyle): 0 bulgu. İlk turda telefonda 6 bulgu çıkmıştı: tempo satırı ayarlar panelini uzatıp bir ses kaydırıcısını alttaki çubuğun altına itiyordu. Panel ve çekmece çubuğun üstüne alındı.
- **İzleyici testi** (1×, kuruluş, ilk işçiler, bir yıl sonra): ışınlanan yük 0, leş sıçraması 0, takılan karınca 0.
- **Kayıt:** 450 işçilik hızlı büyüme kolonisinin kaydı 1,5 MB; yükleyince film verisi ve tempo eksiksiz geri geliyor.
- **Tek dosyalık sürüm** (`npm run build:artifact`): 557 KB, sorunsuz derleniyor.

## 5. Sıradaki (öneri)

1. **Gerçek tempoda hasat verimi.** Bazı haritalarda (8 haritanın 2–3'ü) koloni 2. ve 3. yılda 120–150 işçide kalıyor: yüzeyde yüzlerce tohum varken toplayıcı başına haftada 1–2 tohum geliyor. `scripts/econ.ts` ile toplayıcıların nerede vakit kaybettiği (arama yarıçapı, ikinci kapı, krater, kesit dışı) izlenmeli.
2. **Büyük kolonilerde üçüncü kapı.** Hızlı büyümede 1000 işçilik kolonilerin yüzey trafiği iki kapıdan geçiyor; üçüncü bir kapı hem gerçekçi hem izlemesi zevkli.
3. **Belgeselde film:** Belgesel ara sıra yuvanın son haftalarının filmini oynatabilir.
4. **Oynanabilir sürümün güncellenmesi:** README'deki claude.ai bağlantısı eski bir derleme. `npm run build:artifact` ile çıkan tek dosya oraya yüklenmeli.

