# Sprint 1: Yaşayan dünya

*13 Ekim 2026. Bu belge sprint başında yapılan analizi, ölçümleri ve sprintte yapılanları özetler. Sondaki "Sıradaki" bölümü bir sonraki sprintin önerisidir.*

## 1. Soru: kendi kendine yaşayan, karar veren bir karınca dünyası yarattık mı?

**Kısa cevap: sprint başında hayır, şimdi büyük ölçüde evet.**

Sprint başında oyunu hiç dokunmadan, 8 farklı haritada 2 oyun yılı (110 hafta) kendi başına çalıştırdık. Sprint sonunda aynı 8 haritayı 3 yıldan uzun (160 hafta, 4. yılın Mayıs'ı) çalıştırdık:

| | Sprint başı (8 harita, 2 yıl) | Sprint sonu (8 harita, 3+ yıl) |
|---|---|---|
| Hayatta kalan koloni | 0 / 8 (3'ü öldü, 5'i çöktü) | **8 / 8** (hepsi 4. yılın baharında, kraliçesiyle) |
| Evlilik uçuşu yapan koloni | 0 / 8 | **8 / 8** (her biri 3. ve 4. yılın baharında; harita başına 43–136 kanatlı) |
| Zirve nüfus | — | 391–850 işçi |
| Açlıktan ölen işçi (harita başına) | 170–280 | **0** (8 haritanın hepsinde) |
| Ambarda görünen tohum (1. yıl sonbahar) | 0–8 (hepsi görünmez rezervde) | 100–450 |

"Hayatta kalan" burada koloninin 4. yılın baharına kraliçesi ve yüzlerce işçisiyle çıkması demek. Ölümler artık açlıktan değil dünyanın kendisinden geliyor: komşu kolonilerle savaşlar (harita başına 17–326 işçi), kırkayak (12–32), parazit sinek (12–30), örümcek (5–12), mantar, kaybolan toplayıcılar, yaşlılık; hırsız karıncalar 12–44 yavru çalıyor. Ölçüm için `scripts/econ.ts` her haftayı tek satırda yazıyor: işçi, yavru, ambar, gelir, gider, toplayıcıların nerede olduğu, uçuş havası.

Çöküşün sebebi tek bir şey değildi. Sırayla bulunan sorunlar:

1. **İkinci kapı tuzağı.** Koloni 120 işçiye ulaşınca ikinci bir kapı kazıyor. Kapının ağzı höyük toprağıyla kapalıyken bile "açıldı" sayılıyordu. Dışarıdaki karıncalar kapağın üstünde mahsur kalıyordu: 210 işçinin 156'sı dışarıdayken haftalık tohum girişi 165'ten 3'e düştü.
2. **Kapı ağzı çukuru.** Kapı kazılırken yüzeyde açılan 3 mm'lik çukura 88 toplayıcı sıkıştı. Arama kuralı onları aşağı itiyordu, alttaki tünele de girmiyorlardı.
3. **İki kapı arası "sırt".** İki kapı olunca aralarındaki bölge "yuvadan en uzak nokta" gibi görünüyordu. Dışarı yürüyen toplayıcılar orada döngüye girip kalıyordu (bir anda 110-128 karınca).
4. **Kapı kenarı boşluğu.** Toplayıcı yönünü yazı tura ile seçiyordu. Yarısı, çıktığı kenarın karşısındaki krater boşluğuna doğru yürümeye çalışıp 80 saniye takılıyordu.
5. **Görünmez rezerv.** Ambar hazır olmadan gelen her tohum, kraliçenin "kursak rezervi" denen görünmez bir sayaca gidiyordu. 1. yıl boyunca ambarlar boş, ekrandaki "Tohum" sayısı 0'dı, rezervde ise 300+ tohum vardı. Hasatçı karınca oyununun temel görüntüsü (dolan ambar) hiç oluşmuyordu.
6. **Kraliçe geliri görmüyordu.** Yumurtlama yalnızca eldeki stoka bakıyordu. Baharda stok yüksek olduğu için koloni bir ayda 98'den 210 işçiye çıkıyor, sonra hepsi açlıktan ölüyordu.
7. **Kışa hazırlık yoktu.** Kalabalık koloniler sonbaharda stoğu yazın yiyip bitiriyordu.
8. **Çimlenme 10 saniye sürüyordu.** Islanan 48 tohumun 45'i 10 saniyede filizleniyordu. Karıncaların tohumu güneşe çıkarıp kurutma davranışı hiç devreye giremiyordu.
9. **Majör sayısı taşıyordu.** Ayar %12 iken majörler %33'e çıkıyordu (larva ve pupalar sayılmıyordu).

Gece boyunca 8 haritalık uzun koşular ve bir kod incelemesi altı sorun daha buldu:

10. **İki krater arası tuzak.** Koloni ikinci kapıyı açınca, iki kapının arasına çıkan her toplayıcı hem sağdaki hem soldaki kraterde geri dönüyordu: arama yapan karınca yuva hücresine adım atmıyordu, kraterin dibi ise tünel ağzından başka bir şey değil. Bir koloni 230 toplayıcıyla haftada 80 tohum taşıyordu (1. yılda toplayıcı başına 10, şimdi 0,4); iki kapı arasındaki şeritte tohum çoktan bitmişti, 2 dakikada 5 tohum geliyordu. Artık arayan karınca kapının ağzını dudağından geçiyor: aynı anda 38, iyi havada dakikada 70–85 tohum.
11. **Yumurtanın gelecekteki ağzı.** Kraliçe "stok kaç hafta yeter" hesabında yumurtaları yarım yetişkin sayıyordu; oysa bir ay sonra larva olup en çok yiyen onlar oluyor. Hesap artık yumurtayı gelecek ayın larvası sayıyor. Haziran'dan sonraki kış hesabı da kalan sezonun gelirini olduğu gibi stoğa ekliyor, o sürede yenecek olanı düşmüyordu: 480 işçilik bir koloni yaz hasadını geldikçe yedi, kışa boş girdi (237 açlık ölümü). Gelirin tamamen yeneceğini varsayan ilk düzeltme ise küçük kolonilerin büyümesini boğdu (yazın her yeni işçi yediğinden fazlasını getirir). Doğru sinyal kapasite çıktı: hasat, mevcut işçilerin bakımını karşılamıyorsa koloni kesitin besleyebileceği sınıra gelmiştir ve kraliçe o yaz yeni işçi yetiştirmez.
12. **Kışın kapıda kalanlar.** Kış başında kapı 40 saniye sonra tıkanıyordu; uzaktaki toplayıcılar yetişemiyor, 30–100 işçi bütün kış ikinci kapının tıkacının üstünde bekliyordu. Ana kapıda da tıkaç, genişletilmiş kuyunun tamamını kapatmıyordu: çöpçüler kışın bile dışarı çıkıyordu. Şimdi kış kapanışı dışarıdakiler için 2 dakikaya kadar bekliyor, tıkaç ağzın tamamını kapatıyor, yine de kalan olursa ağzına gelen karıncayı içeridekiler alıyor.
13. **Danaburnunun bitmeyen galerisi.** İşi biten danaburnu kesitten çıkmıyor, haftalarca rastgele kazıyordu: bir haritada toprağın altında 51.000 hücrelik bir boşluk açmış, yuvanın iç alanları bu boşluğa taşıp oyunu 6 kat yavaşlatmıştı. Artık işi bitince kısa sürede kesitten çıkıyor (galerileri üç boyutlu, bizim kesitimiz onların tek bir düzlemi). Eski galeriler birkaç hafta içinde üstten dökülen toprakla doluyor ve **krotovina** olarak kalıyor: açık renkli toprakta koyu, koyu toprakta açık bir iz. Toprağın kendi tarihi oluyor.
14. **Dikleşen krater.** Koloni büyüdükçe kapının etrafındaki höyük 2–3 cm'ye çıkıyor, krater duvarları dikleşiyor. Toplayıcıları bitki saplarından uzak tutan kural ("altında zemin olmayan hücre = sap") dik duvarı da sap sanıyordu: tırmanmayı cezalandırıp aşağı inmeyi ödüllendiriyordu. 300 işçilik bir kolonide toplayıcılar dakikalarca krater dibinde gidip geliyor, dakikada 6–18 tohum geliyordu. Yanında toprak duvar olan hücre artık duvar sayılıyor: aynı anda dakikada 30–63 tohum.
15. **Bağımsız kod incelemesi.** Sprint farkını ayrı bir ajan hata için okudu, dört gerçek bulgu çıktı ve düzeltildi: dolu ama sıcak bir kreş yavru taşımayı ve kraliçenin yumurtlamasını durduruyordu (artık yalnız yeri olan kreşler sayılıyor); kraliçe adayı ve erkek yavrular hiç taşınmıyor, kraliçenin yanını tıkıyordu; yağmurda kapının dudağındaki toplayıcı içeri girmek yerine geri çıkıyordu; düşman galerisi tıkanırken içinde kalan işçiler orada hapsoluyordu (artık önce geri çağrılıyorlar).

### Koloni ne kadarını kendisi karar veriyor?

Kodu karar karar inceledik. Özet:

- **Gerçekten yerel, kendiliğinden olanlar:** dışarı çıkış (dönen toplayıcı kapıdakileri dürter), leş için yardım çağırma ve birlikte sürükleme, alarmın karıncadan karıncaya yayılması, mantar sporlarına karşı tımar, ölülerin dışarı taşınması.
- **Merkezi formül olanlar:** iş dağılımı (koloni çapında paylar), yuva planı (her 3 saniyede çalışan bir mimar), yumurtlama, kast seçimi, evlilik uçuşu takvimi, savaş ve yağma zarları.

Merkezi kısımlar kötü değil ama girdileri zayıftı. Bu sprintte yumurtlamayı gelire, kışa ve kıtlığa bağladık. Ayrıca yeraltı tehditlerine karşı yerel savunma ekledik: alarmı alan işçi tehdide koşuyor.

## 2. Harita yeterli mi, genişlemeli mi?

**Genişlik: hayır.** Dünya 128×72 cm. Toplayıcılar zaten genişliğin %90'ını kullanıyor. Kenarın ötesine gidip dönen "kesit dışı toplama" da daha büyük çayırı temsil ediyor.

**Derinlik: şimdilik hayır, önce var olan derinliği kullanalım.** Toprak 55 cm derin, ama odalar en fazla 25 cm'ye iniyor ve kesitin alt yarısı neredeyse hiç kullanılmıyor. Gerçek *Messor* yuvaları 1-2 m'ye iner. Önce kışlık odaları don çizgisinin altına, ambarları daha derine indirelim. Taban suyunu da gerçek bir su tablası yapalım. Ondan sonra toprak 85-95 cm'ye büyütülebilir. Bunun maliyeti, kayıt dosyası küçültüldükten sonra makul (bellek ~68 MB'den ~105 MB'ye).

**Ağaç:** Haritada zaten ağaç var: gövde dibi, yeraltında kalın kökler, gölge, sonbaharda yaprak dökümü. Tepesi çizilmiyor çünkü 1 mm = 1 piksel ölçekte bir ağaç metrelerce yükseklikte ve gökyüzü 16 cm. Bunu dürüst buluyoruz. Daha fazla ağaç dünyayı derinleştirmez. Derinlik toprağın altındaki yaşamdan gelir. Bu sprintte de oraya yatırım yaptık.

## 3. Yapılanlar

### Kuşlar kaldırıldı
Tepeli toygar simülasyondan, çizimden, kartlardan ve metinlerden çıkarıldı. Eski kayıtlarda kalan bir kuş yüklemede siliniyor. Kurucu kraliçeleri öldüren tek şey kuştu. Bunun yerine açıkta kalan kraliçeler artık "sıcak ve avcı böcek" yüzünden ölüyor.

### Koloni hayatta kalıyor
Yukarıdaki sorunların hepsi düzeltildi (10–15 numaralılar yukarıda anlatıldı). İlk dokuz için:

- Kapı ancak gerçekten dışarıya açılınca kapı sayılıyor. Ağzını kapatan toprak kazı planına giriyor.
- Toplayıcı yönünü çıktığı kenara göre seçiyor ve 2,5 saniye ilerleyemezse dönüyor.
- Ambar yoksa tohum kraliçe odasının iki yanına, sonra dinlenme odalarının arkasına yığılıyor. Tohum yığını artık her zaman görünür.
- Kraliçe gelen tohum hızına göre yumurtluyor: yavrular yetişkin olunca stok + gelir kaç hafta yeter, ona bakıyor. Hazirandan itibaren kışı da hesaba katıyor.
- Kıtlıkta işçiler ölmeden önce yumurtalar, sonra en genç larvalar yeniyor (gerçek karıncalar böyle yapar). Açlık kurbanı artık "en yaşlı" (yani toplayıcı) değil, rastgele.
- Yetişkin işçi tüketimi yarıya indirildi. Hasatçı işçiler çok az yer, hasadın çoğu yavruya gider. Kış uykusunda metabolizma yarıya düşüyor.
- Çimlenme dakikalar sürüyor, böylece karıncalar ıslak tohumu güneşe çıkarabiliyor.
- Kayıt dosyasından geçici arama tamponları çıkarıldı (tarayıcının 5 MB sınırına yaklaşıyordu).

### Yeraltı tehditleri (yeni)
- **Hırsız karıncalar (*Solenopsis fugax*):** 2 mm'lik sarı karıncalar, kıl inceliğinde bir galeri kazıp kreşe sızıyor ve birer birer yumurta ve küçük larva taşıyor. İşçiler gedikte yeterince uzun toplanınca deliği toprakla tıkıyor.
- **Kırkayak (*Lithobius*):** Geceleri kapıdan sızıp tünellerde yalnız işçileri ve yavruları avlıyor. Kalabalık onu kovuyor, büyük kalabalık öldürüyor ve larvalara yediriyor.
- **Danaburnu (*Gryllotalpa*):** Nemli lös sahalarında geceleri 7 mm genişliğinde galeriler kazıyor. Yuvayı delerse odaya toprak döküyor ve yavru yiyor. Sokulunca geri çekiliyor, işçiler galerisini duvarla kapatıyor.

Üçü de alarm sistemine bağlı: alarmı alan işçi tehdide koşuyor ve bu yeni bir yerel karar.

### Yavrular en sıcak kreşe taşınıyor (yeni)
Her yavru artık kendi odasının sıcaklığında gelişiyor. Hemşireler yavruyu (yumurta, larva, pupa) o anda en hızlı gelişeceği kreşe taşıyor: serin sabahta güneşin ısıttığı üst odalara, öğle sıcağında aşağıdakilere. Taşınan yavru bir süre dinlendiriliyor ki hemşireler onu sürekli bir oraya bir buraya götürmesin. İhtiyaç olmayan yiyeceği taşıyan hemşire onu ambara geri koyuyor.

### Kazı önceliği
Kreş ya da ambar yarım kaldıysa dinlenme odası bekliyor. Koloni önce ihtiyacı olan odayı bitiriyor.

### İşçiler gerçek boyda (diğer daldan)
Diğer sohbetin "Workers shrink to real Messor structor size" değişikliği bu dala birleştirildi: işçiler 4,3–6,5 mm, ilk (nanitik) işçiler 4,2 mm'nin altında, majörler 8,3–9,3 mm. Taşınan yükler her boyda karıncanın çenesinde kendi gerçek boyunda kalıyor.

### Görseller tek tek yeniden çizildi
`sheet.html` adında bir varlık sayfası eklendi. Oyundaki her canlı ve nesne tek başına, üç yakınlıkta çiziliyor. Böylece her biri ayrı ayrı değerlendirilebiliyor (`node scripts/sheet.mjs çıktı.png`).

Yeniden çizilenler:
- **Çekirge:** Eskisi tek elips gövde ve çubuk bacaklardı. Yenisinde kısa boncuklu antenler, büyük göz, eyer biçimli göğüs kalkanı, damarlı kanat, balıksırtı desenli arka bacak ve pembe kaval var.
- **Harpalus böceği:** Çizgili kanat kınları, soğuk parlaklık, kırmızı bacak ve antenler, üçlü yürüyüş.
- **Zodarion örümceği:** 8 benekli bacak. Pusudayken ön bacaklarını anten gibi kaldırıp tıklatıyor.
- **Forid sinek:** Kambur göğüs, damarlı kanatlar, aşağı kıvrık yumurta borusu.
- **Yuva misafirleri:** Kör tespihböceği, karınca çekirgesi, Attaephilus.
- **Leşler:** Ölü çekirge ve böcek sırtüstü, bacakları havada.
- **Taşınan yükler:** Toprak topağı, kıvrık larva, çıplak pupa, ölü yuva arkadaşı, kavuz kabuğu, böcek parçası.
- **Yeni tehditler:** Hırsız karıncalar, kırkayak, danaburnu.

### Arayüz yeniden düzenlendi
- Sol üstteki 500 piksellik kart yerine kısa bir **başlık** geldi: koloni adı, dört sayı, tarih ve hava.
- Sağda tek bir **çekmece** var, üç sekmeli: *Yönet* (yalnız Yönlendir modunda), *Koloni*, *Notlar*. Okunmamış not için nokta çıkıyor. 1440 pikselden dar ekranlarda kapalı başlıyor.
- **Bildirimler** üst üste üç kutu yerine tek satır, sırayla geliyor.
- **Takip kartı** başlığın altına taşındı. Artık notlarla çakışmıyor.
- Saat çizgisindeki performans göstergesi ayarlara taşındı. Duraklatınca "oynat" simgesi çıkıyor. "?" düğmesi "ayarlar" oldu.
- Yemek tahmini 3,4 kat şişkindi (gün/hafta karışıklığı), düzeltildi.
- Telefonda takip kartı ile bildirimler ve ölçek çubuğu artık çakışmıyor.
- Başlıktaki saat satırında sıcaklık taşıp kesiliyordu; hava durumunu zaten simge gösterdiği için kelime kaldırıldı (üstüne gelince yazıyor).

## 4. Sabah turu: organik yuva, kazıp çıkma, büyük yırtıcılar

Sabah gelen geri bildirim: odalar fazla kusursuz, sıkışan karıncalar kazıp çıkmıyor, koloniyi gerçekten bitirebilecek tehlikeler yok.

**Yuva neden kusursuzdu?** Yuvada bir "mimar" var: her 3 saniyede bir sıradaki odayı düzgün bir elips olarak plana işaretliyor, işçiler yalnızca bu hücreleri kazıyordu. Sonuç ortada tek kuyu, iki yanda simetrik ve eşit aralıklı odalardan oluşan bir "çam ağacı"ydı. Şimdi:
- Odalar loblu ve yamuk: iki ölçekte çıkıntı, bir ucu yüksek, tavanı düzensiz, tabanı düz.
- Dolan oda (kreş, ambar, dinlenme) yarı yarıya ihtimalle yeni oda açmak yerine yanına bir lob eklenerek genişliyor.
- Tüneller kıvrılıyor, genişleyip daralıyor. Kuyu ara sıra bir odanın ucundan dallanıyor, odalar başka odaların ucuna da eklenebiliyor.
- Kazacak bir şey yokken ara sıra kör keşif galerileri kazılıyor; işçiler duvarları ve tavanları kullandıkça kemiriyor.
- İkinci kapı her kolonide 55–110 işçi arasında rastgele bir eşikte açılıyor (önceden sabit 120).

**Kazıp çıkma.** Kraliçe odasına ve dinlenme odalarına yolu kalmayan işçi (tohum yığını, çökme) birkaç saniye sonra kraliçeye doğru toprağı ya da tohumu kazarak yol açıyor. Testte tohum duvarıyla kapatılan 6 işçi 20 saniyede çıktı.

**Büyük yırtıcılar.**
- *Yeşil kurbağa:* alacakaranlıkta kalabalık bir koloninin (80+ işçi) yolunun yanına oturuyor, toplayıcıları diliyle tek tek yutuyor ve yuvayı hatırladıkça geri geliyor. Üstüne yeterince alarmlı işçi çıkarsa sıçrayıp gidiyor. İlk sürümü 28 işçilik bir koloniyi iki haftada bitirdi, ayarlandı.
- *Kum kertenkelesi:* sıcak günlerde höyükte güneşleniyor, geçen toplayıcılara atılıyor.
- *Köstebek (nadir):* kesiti baştan sona geçiyor. Önündeki toprağı açıp arkasını kapatıyor. Yuvanın dışında iz koyu bir toprak şeridi olarak kalıyor, yuvanın içinde odaları gevşek toprakla dolduruyor ve işçiler onları yeniden kazıyor. Yolundaki yavruları yiyor, kraliçeye denk gelirse onu öldürebiliyor. İlk sürümde arkasında bıraktığı gevşek kum yuvaya akıyor, iz zincirleme plana katılıp 13.000 hücrelik sahte kazı işi doğuruyordu; düzeltildi.

Bu turda bir kural daha eklendi: Temmuz ortasından sonraki yavru, gelecek hasada değil eldeki stoğa göre yetiştiriliyor. Daha önce 360 işçilik bir koloni Temmuz'da 183 yumurta bırakıp kışa 600 işçiyle girdi ve 178'ini açlıktan kaybetti.

**Son ölçüm (aynı 8 harita, 160 hafta, hepsi bu değişikliklerle):** 8/8 koloni 4. yılın baharında hayatta, 8/8'de iki evlilik uçuşu, **açlıktan ölen işçi 0**, zirve 255–545 işçi. Harita başına kayıplar: kurbağa 6–45, kertenkele 5–42, köstebek 5 haritada 6–30 işçi ve 4 haritada 8–83 yavru, komşu savaşları 31–129. Kraliçeyi köstebek bu 8 haritanın hiçbirinde öldürmedi; risk gerçek ama nadir.

## 5. Öğleden sonra turu: oyuncu testi, rüzgâr, büyük av, kendiliğinden kazı, yaşayan toprak

Geri bildirim: "Skip" tuşuna basılamıyor, kraliçe toprağı taşımıyor (höyük kendiliğinden oluşuyor), büyük av küçülerek eriyor, yuva hâlâ planlı, toprağın altı her haritada aynı ve boş, harita en başta tamamen sisli.

**Neden gözden kaçtı?** Testler düğmelere fareyle değil kodla basıyordu (`cine.skip()`), oyunu da hep hızlı sardırıyordu. İki yeni test:
- `scripts/playertest.mjs`: üç ekran boyutunda her düğmeye gerçek fareyle tıklıyor, üst üste binen, ekrandan taşan, küçük kalan ya da tıklanamayan her şeyi raporluyor.
- `scripts/watchtest.mjs`: oyunu 1x hızda izleyici gibi izliyor. Işınlanan yükleri, birden küçülen leşleri, takılan karıncaları ve en uzun sessiz anı sayıyor.

**Kraliçe kendi toprağını taşıyor.** Dört hücrelik bir topak yapıp ağzında yukarı çıkarıyor ve kenara döküyor. Kenarın ötesine "kaybolan" toprak artık yok. Kuruluş 600 saniye kadar sürüyor.

**Rüzgâr.** Esinti hafif, fırtına sert. Kuru ve gevşek hafriyatı ve çöpü rüzgâr yönüne savuruyor, ıslak ya da sıkışmış toprağa dokunmuyor. Höyük rüzgârla ve yağmurla alçalıyor. Çimen ve çiçekler rüzgârla eğiliyor, başlıkta da rüzgâr gösteriliyor.

**Kamera bilinen dünyayla sınırlı.** Başta kraliçenin çevresindeki bir avuç toprak görünüyor. Koloni keşfettikçe ve kazdıkça dünya büyüyor ve yuva hep ortada kalıyor. Sisli boş harita artık gezilemiyor.

**Büyük av.**
- Önce birlikte taşınıyor. Bulan karınca yardım çağırırken gelen diğerleri leşi tutup bekliyor.
- Kesmek zor ve yavaş: her ekleme iki işçi, bacak 30 sn, kafa 50–60 sn, göğüs 60–70 sn. Majörler 2,5 kat hızlı kesiyor. Kesen karıncanın başı ileri geri gidiyor.
- Leş küçülmüyor, parça kaybediyor: bacaklar, kanat, kafa, göğüs. Kopan yerde ham bir kesik görünüyor ve her parça bir karıncanın ağzında ayrı ayrı taşınıyor. Solucan boğum boğum kesiliyor.
- Kapıdaki bir çekirge yaklaşık bir dakikada bitiyor (önceden 15 saniyede eriyordu).

**Kesilen parça hemen yiyecek olmuyor (sonradan gelen düzeltme).** İlk sürümde eve gelen parça ambara tek hücrelik bir "et kırıntısı" olarak konuyordu. Büyük parçaların fazlası anında ortak yiyeceğe yazılıyordu; kapıda kimse tutmayan leş de her 6 saniyede kendiliğinden bir parça "yiyecek" veriyordu. Şimdi gerçek *Messor* gibi:
- Parça bütün olarak kreşe, yavruların arasına konuyor (kreş yoksa ambara ya da kraliçenin yanına).
- Bakıcılar gelip 2–4 saniye ısırıyor ve her lokmayı aç bir larvaya götürüyor. Bir arka bacak 2, bir karın 3 lokma.
- Aç larva yoksa yanındaki işçiler yavaş yavaş kendileri yiyor.
- Geriye kalan kabuk (bacak, kanat, kafa kabuğu) çöp olarak kalıyor ve temizlikçiler çöplüğe taşıyor. 10 gün kadar yenmeyen parça çürüyüp kabuğa dönüyor.
- Kapıdaki sahipsiz leş artık kendiliğinden yiyecek vermiyor; dışarı çıkan toplayıcıları bekliyor.
- Kreşteki parçanın üstüne gelince ne olduğu ve kaç lokma kaldığı görünüyor.
- Ölçüm (4 hafta, 235 işçilik koloni): kreşe 128 lokmalık parça geldi; 33'ünü bakıcılar larvalara götürdü, kalanını işçiler yedi, çürüyen olmadı. Yiyecek kaybolmuyor, zamana yayılıyor.
- 8 harita × 160 hafta: 8/8 hayatta. 6 haritada açlıktan ölüm 0. İki büyük kolonide (zirve 500 ve 700 işçi) 4. yılın baharında kış stoğu bitti (16 ve 181 işçi). Bu, bilinen bahar darboğazı (aşağıda 2. madde). Haritalar arası fark kaotik, ama sıradaki iş bu.

**Kendiliğinden kazı (stigmerji).** Plan hâlâ odaları başlatıyor, ama büyüme artık karıncalardan geliyor:
- Kazılan galerinin ucunda bir "kazı kokusu" kalıyor. O ucu kazan bir sonraki parçayı da açıyor, koku zayıfladıkça galeri sona eriyor. Galeriler kıvrılıyor, ara sıra çatallanıyor, başka bir tünele çıkarsa orada bitiyor.
- Kalabalık bir odada duvara en yakın karıncalar duvarı kazıyor. Oda karıncaların toplandığı yana doğru tabanla aynı hizada genişliyor.
- Tünelde boş duran bir işçi ara sıra kendi galerisini başlatıyor, diğerleri de devam ettiriyor.

**Yaşayan toprak.**
- Her haritanın kendi toprağı var: katmanlar farklı dalgalanıyor, kıvrılıyor ve eğiliyor; kum ve çakıl mercekleri bulunuyor.
- Çürümüş köklerin bıraktığı açık kök kanalları aşağı kıvrılıyor. Bazen bir taşın altında, gizli oyuklar keşfedilmeyi bekliyor (bulununca not düşülüyor).
- Üst toprakta mayıs böceği kurtçukları var. Bazı haritalarda dalgalı bir taban suyu var: baharda yükseliyor, yazın çekiliyor, yuva onun altına inemiyor.
- Kökler mevsimde uçlarından büyüyor; kazı planının içine uzanırsa kesilmesi gerekiyor. Sonbaharda ince uçlar ölüp çürüyor ve kanala dönüşüyor.
- Solucanlar arkalarında ince açık tüneller bırakıyor; karıncalar bunları kestirme olarak kullanabiliyor.

**Arayüz kiti.** Referanslar: Terra Nil (sakin, yuvarlak, az çerçeveli eko arayüzü), Alba (okunaklı, dost canlısı doğa uygulaması), saha rehberleri ve müze etiketleri (serif isimler, italik Latince), Empires of the Undergrowth (koyu toprak üstünde net sayaçlar).
- Teknik "cihaz" görünümü (her yerde monospace, köşe çentikleri, büyük harf etiketler) kaldırıldı.
- Yerine sıcak koyu kartlar, 14 px köşe, tek amber vurgu ve çukur bir iz içinde hap düğmeler geldi. Sayılar eşit genişlikli sans, belgesel altyazıları serif italik.

**Ölçüm (aynı 8 harita, 160 hafta, bu turun bütün değişiklikleriyle):** 8/8 koloni 4. yılın baharında hayatta, **açlıktan ölen işçi 0**, 8/8'de evlilik uçuşu (1–100 kanatlı), zirve 236–729 işçi. 1x seyir testinde (90 sn × 3 aşama) ışınlanan toprak **0** (önceden 236), kenar dışına bırakılan yük 0, birden küçülen leş 0, takılan karınca 0. Oyuncu testinde laptop ve telefonda 0 bulgu. Masaüstünde iki bulgu vardı: 720p başlık ekranında dil düğmeleri taşıyordu, başlık sıkılaştırıldı. Telefonda ölçek çubuğu açık panelin üstüne biniyordu, gizlendi.

Yolda yakalanan iki şey:
- Taban suyu ilk sürümde nem modelinin listesine giriyordu (yüz binlerce hücre her tick dolaşılıyordu) ve simülasyon 17 kat yavaşlamıştı. Artık sabit tutuluyor.
- Test çalışırken kaynak dosyayı düzenleyince geliştirme sunucusu sayfayı yeniliyor ve test "çöküyor". Oyuncu testi artık sayfanın kendiliğinden yenilendiğini ayrıca raporluyor.

## 6. Sıradaki (öneri)

1. **Ağaç ve yarı 3B:** Ağacın gövdesi önde, kesit arkada derinlik bulanıklığıyla.
2. **Bahar darboğazı:** 500+ işçilik koloniler kışa kişi başı yetersiz stokla giriyor. Yaz sonu yumurtlama kuralı stoğa göre daha sıkı olmalı, sonbahar hasadı da daha uzun sürmeli.
3. **Majörler değirmenci olsun:** Tohumu kırıp "karınca ekmeği" yapsınlar.
4. **Komşu koloniler (ertelendi).**
5. **Akarlar:** Temasla yayılan, tımarla temizlenen bir parazit.
6. **Sondan sonra:** Steam için masaüstü paketi (Tauri).
