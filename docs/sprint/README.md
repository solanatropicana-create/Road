# Sprint 1: Yaşayan dünya

*13 Ekim 2026. Bu belge sprint başında yapılan analizi, ölçümleri ve sprintte yapılanları özetler. Sondaki "Sıradaki" bölümü bir sonraki sprintin önerisidir.*

## 1. Soru: kendi kendine yaşayan, karar veren bir karınca dünyası yarattık mı?

**Kısa cevap: sprint başında hayır, şimdi büyük ölçüde evet.**

Sprint başında oyunu hiç dokunmadan, 8 farklı haritada 2 oyun yılı (110 hafta) kendi başına çalıştırdık:

| | Sprint başı | Ara ölçüm (4 harita, 3 yıl) |
|---|---|---|
| 2. yılı çıkaran koloni | 0 / 8 (3'ü öldü, 5'i çöktü) | 4 / 4 (biri 2. sonbaharda yarıya indi) |
| Evlilik uçuşu yapan koloni | 0 / 8 | 3 / 4 (11–17 kanatlı birey, 3. baharda) |
| Açlıktan ölen işçi (harita başına) | 170–280 | 57–337 (çoğu 3. yılın kışında) |
| Ambarda görünen tohum (1. yıl sonbahar) | 0–8 (hepsi görünmez rezervde) | 100–450 |

Ara ölçümden sonra 3. yıl kışındaki çöküşler için işçi tüketimi yarıya indirildi ve kraliçeye kışı hesaba katan bir kural eklendi; 8 haritalık son ölçüm bu belgeye eklenecek.

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
Yukarıdaki dokuz sorunun hepsi düzeltildi:

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

## 4. Sıradaki (öneri)

1. **Yavru göçü:** Her yavru kendi hücresinin sıcaklığında gelişsin. Hemşireler yavruyu gün içinde sıcak üst odalarla serin alt odalar arasında taşısın. Bu, gerçek ve gözle görülür bir günlük ritim verir.
2. **Majörler değirmenci olsun:** Tohumu kırıp "karınca ekmeği" yapsınlar, larvalar ekmekle beslensin. Böylece majör ayarı gerçek bir ekonomi kararı olur.
3. **Derin kış odaları** ve gerçek taban suyu. Ardından toprağın 85-95 cm'ye büyütülmesi.
4. **Akarlar:** Temasla yayılan, tımarla temizlenen bir parazit.
5. **Kazı önceliği:** Kreş ve ambar, dinlenme odalarından önce bitsin.
6. **Sondan sonra:** Steam için masaüstü paketi (Tauri), yerel fontlar, Steam Deck testi.
