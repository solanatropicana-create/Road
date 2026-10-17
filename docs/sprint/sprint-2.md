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
| A1 | **Tempo seçimi** (yeni koloni ekranında ve ayarlarda): *Gerçek*, *Canlı* (~3×), *Hızlı büyüme* (~7×). Yavru gelişimi, yumurtlama, kazı, yürüyüş, çayırın tohum verimi ve genç komşunun büyümesi tempoyla ölçeklenir; mevsimler aynı uzunlukta kalır. Seçim koloniyle kaydedilir. | yapılıyor |
| A2 | **Bilinmeyen toprak loş ve odak dışı:** Siyah yerine toprağın kendi katmanları derin gölgede görünür. Kazılmış boşluklar (başka kolonilerin galerileri) gizli kalır. | yapıldı |
| A3 | **Makro lens ince ayrıntılar:** Nokta yalnızca gerçekten ince olan hücrelere (en fazla 2 aynı tür komşu) uygulanır, ince hatlar birbirine bağlanıp ince ve yumuşak bir kanal olarak çizilir. Basamaklı duvarlar düz eğri olur. | yapıldı |
| A4 | **İniş sonrası sakinlik:** Başlık kartı sönene kadar paneller ve bildirimler bekler. | yapıldı |

### Sprint 2b: uzun izleme ve paylaşım

| # | İş | Durum |
|---|---|---|
| B1 | **Yuvanın zaman atlamalı filmi:** Her yuva hücresinin ne zaman kazıldığı kaydedilir. Film toprağı inişten önceki haline getirir, tünelleri ve odaları çeyrek hafta çeyrek hafta açar; yeni kazılan yer kehribar renkte parlayıp söner. Tarih, işçi ve oda sayısı akar. İleri geri sarılabilir. Koloni panelinden, yıl özetinden, oyun sonu kartından ve G tuşuyla açılır. | yapılıyor |
| B2 | **Filmi video olarak kaydet:** WebM; 16:9 ve dikey 9:16 (Reels/TikTok). | yapılıyor |
| B3 | **Kurbağa kapanını kaldır:** Kurbağanın bir gecede yediği ve onu kaçırmak için gereken kalabalık koloninin büyüklüğüne bağlı olsun. | sırada |
| B4 | **Ağaç gövdesine kabuk:** Yakın planda dikey yarıklar, yuvarlak gölge, yumuşak kenar. | sırada |
| B5 | **Hızlı tempolarda performans:** 500+ işçilik kolonide tick süresi ölçülür, gerekirse en pahalı adım hafifletilir. | sırada |

### Sprint 3 (sonra): bu sprintin ölçümlerine göre

- **Belgeselde zaman atlamalı film:** Belgesel ara sıra yuvanın son haftalarının filmini oynatır.
- **"Önemli an" kameraları:** Evlilik uçuşu ve ilk kış başlangıcı için özel çekimler.
- **İlk dakika rehberi:** İzleme modunda ilk 2 dakikada birkaç sessiz ipucu (takip et, belgesel, film).
- **Steam sayfası için görsel seti:** Zaman atlamalı filmden ve belgeselden otomatik kareler.

## 4. Yapılanlar

*(Her madde bitince buraya ölçümüyle birlikte eklenir.)*
