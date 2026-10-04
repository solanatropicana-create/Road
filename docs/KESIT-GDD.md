# KESİT — Oyun Tasarım Belgesi (Faz 0)

> Çalışma adı. Sürüm 0.1 · **Durum: TBD (taslak)**. Yön onaylandı (Paket 3 "Tatlı Seferler" + Paket 1'den enkaz ve hırslar); ayrıntılar değişebilir.

> ⚠️ **TBD:** Bu belgedeki sayılar, modül listeleri, faz planı ve teknik kararlar kesinleşmedi. Şu anki tek öncelik: **bir savaşı keyifli hale getirmek** (uçuş + nişan + yerel hasar + parçalanma hissi). Geri kalan her şey o his oturduktan sonra yeniden değerlendirilecek.

---

## 1. Özet

**Tür:** Tek oyunculu, 2D üstten görünüm, space RPG roguelike. Kalıcı bir ev üssü (sandbox) ve oradan çıkılan seferler (roguelike).

**Tek cümlelik his:**
> *"Gemimi parça parça ben kurdum. Her mermi bir yere çarpıyor ve o yerin ne olduğu önemli."*

**Ton:** Sevimli görseller (pastel neon, küçük robot ve yaratık mürettebat), fizikle saçılan parçalar. Bu yüzeyin altında tavizsiz bir sistem derinliği var.

**Ana ilham kaynakları:**
- FTL: sistem ve güç ikilemi, olaylar
- Cosmoteer / Reassembly: karolardan kurulan gemiler
- Starsector: yağma
- Sunless Sea: hırslar, atmosfer
- Hardspace: Shipbreaker: söküm zevki

---

## 2. Tasarım sütunları

Her özellik bu beş maddeye göre değerlendirilir. Uymayan özellik kesilir.

1. **Tutarlı fizik, istisnasız.** Oyuncu, düşman, enkaz ve asteroid aynı kurallara tabi. Soyut HP yok, zarla isabet yok. Bir şey bozulduysa simülasyon bozduğu için bozulmuştur.
2. **Hasar = fizik + fonksiyon.** Vurulan karo hem kütle ve şekil kaybeder hem de üstündeki sistemi ve geçen hatları kaybeder. İkisi aynı olaydan doğar.
3. **Gemi senin karakter kağıdın.** Güç seviye atlamaktan değil, tasarımdan, parçalardan ve yaralardan gelir.
4. **Az fiil, derin sistem.** Uç, savaş, sök, kur, konuş. Başka fiil eklemeden önce iki kez düşün.
5. **Ölüm acıtır, yıkmaz.** Gemi ve kargo gider. Üs, planlar ve anılar kalır.

---

## 3. Çekirdek döngü

```
        ┌──────────── EV ÜSSÜ (kalıcı, sandbox) ────────────┐
        │  tersane · plan arşivi · mürettebat · hırslar     │
        └───────┬───────────────────────────────▲───────────┘
                │ gemi + mürettebat + erzak seç  │ ganimet, planlar, hikâye
                ▼                                │
        ┌──────────── SEFER (roguelike, 1–2 saat) ──────────┐
        │  bölge haritası → düğüm → uç / savaş / sök / olay │
        │  tehdit artar → derine in ya da çıkış kapısına git│
        └───────┬───────────────────────────────────────────┘
                │ ölüm
                ▼
          gemi ve kargo kaybolur, enkaz bölgede kalır
          (bir sonraki seferde kurtarılabilir)
```

**Ana gerilim, açgözlülük ile risk arasında:** derine inmek daha iyi ganimet demek, ama tehdit artıyor ve eve dönüş yolu uzuyor.

---

## 4. Fizik modeli

### 4.1 Temel kurallar
- **Sabit zaman adımı:** 60 Hz. Fizik render'dan bağımsız çalışır.
- **Deterministik:** Seed'li RNG kullanılır. Simülasyonda `Math.random` yasak. Aynı girdi + aynı seed = aynı sonuç.
- **Birimler:** 1 karo = 1 m, kütle kg, kuvvet N, enerji J. Sayılar oynanış için ölçeklenebilir ama **oranlar tutarlı** kalır.
- **Entegrasyon:** Yarı-örtük (semi-implicit) Euler: önce hız, sonra konum güncellenir.

### 4.2 Gemi = karolardan oluşan rijit cisim
- Her gemi bir ızgaradır. Her karonun **malzemesi** (kütle, dayanıklılık, ısı kapasitesi) ve isteğe bağlı bir **modülü** vardır.
- **Kütle, kütle merkezi ve dönme ataleti** karolardan hesaplanır ve karo kaybında yeniden hesaplanır.
- **Kopma:** Bir karo yok olunca bağlantı flood-fill ile yeniden kontrol edilir. Ayrılan her grup kendi hızı ve açısal hızıyla **yeni bir cisim** olur. Kopan parçada reaktör varsa o parça kendi başına çalışmaya devam eder.

### 4.3 Kuvvetler
- **İtici** kuvveti takılı olduğu karonun konumundan, baktığı yöne uygular. Tork = r × F. Asimetri kendiliğinden ortaya çıkar.
- **İsabet impulsu:** Mermi momentumu (m·v) çarptığı noktaya uygulanır. Yandan vurulan gemi savrulur ve döner.
- **Çarpışma:** Önce kaba eleme (çember), sonra karo karo kesin kontrol, ardından impuls çözümü. Çarpışmada açığa çıkan bağıl kinetik enerji iki gövdeye **hasar** olarak dağıtılır, yani çarparak saldırmak (ramming) de bir taktiktir.

---

## 5. Uçuş modeli ve stabilizatörler

Taban fizik saf Newton fiziği: gemi bırakıldığı yönde kaymaya devam eder. Pürüzsüz kontrol **fiziksel modüllerden** gelir:

| Modül | Görevi | Kırılırsa |
|---|---|---|
| **Jiroskop / reaksiyon çarkı** | İtici yakmadan tork üretir, hassas nişan sağlar. Doyma sınırı var. | Dönüş iticilere kalır; sallanma ve hedefi geçme |
| **Manevra iticileri (RCS)** | Yana kayma ve ince düzeltme | Bir taraf giderse gemi o yöne çeker |
| **Stabilizatör / sönümleyici** | Kaymayı aktif olarak keser, güç harcar | Buz pateni gibi kayma |
| **Uçuş bilgisayarı** | Girdiyi itici komutlarına çevirir (itici karışımı). Veri ağına bağlıdır. | İticiler koordinesiz; ham, elle kontrol |

- **Uçuş asistanı açık/kapalı:** Oyuncu stabilizatörü kapatıp bilerek drift yapabilir (kayarken geriye ateş etmek gibi). Bu bir beceri tavanı.
- **Kademeli bozulma:** Kontrol hissi aslında bir sağlık göstergesi. Gemi HP barıyla değil, elinde nasıl davrandığıyla "yaralı" hissettirir.
- **Kontrol şeması:** Klavyeyle uçuş (W/S ileri-geri, A/D dönüş, Q/E yana kayma), fareyle nişan. Hedef seçerken **taktik yavaşlatma** ile zaman %20'ye düşer.

---

## 6. Silahlar ve yerel hasar

### 6.1 Hasar çözümü (tüm silahlar için ortak)
- Merminin enerjisi var: kinetikte ½mv².
- Yörünge, ızgara üzerinde ışın takibiyle (DDA) izlenir. Her karoda şu olur:
  - `E > karo.kalanDayanım` ise: karo kırılır, `E -= karo.kalanDayanım`, mermi bir sonraki karoya geçer (delme).
  - Değilse: `karo.kalanDayanım -= E`, mermi durur.
- Kırılan karo; modülünü, üstünden geçen hatları ve kütlesini kaybeder. Ağlar (bkz. §7) bir sonraki adımda yeniden çözülür.

### 6.2 Silah aileleri

| Aile | Fizik | Rolü |
|---|---|---|
| **Kinetik** (top, raylı top) | Kütle × hız; delme + impuls | Zırh delme, savurma |
| **Lazer** | Süre boyunca karoya **ısı** basar; erime eşiği aşılınca karo gider | Hassas cerrahi kesim, hatları kesme |
| **Patlayıcı** (füze, mayın) | Çevreye enerji yayar; ışınlar karolarca bloklanır; mesafeyle azalır | Dış yüzeydeki modülleri temizleme |
| **EMP** | Vurduğu düğümden **güç ağına** ani akım basar; sigortalar atar, sistemler kilitlenir | Söküm için sakatlama (yok etmeden) |
| **Söküm kesici** | Kısa menzilli kontrollü lazer | Modülü sağlam şekilde ayırma (bkz. §9) |

> Kabarcık şeklinde kalkan yok, başlangıçta zırh ve nokta savunması var. İleride eklenecek bir kalkan da fiziğe uymak zorunda: emdiği her joule'ü bir kapasitörden ödemeli.

---

## 7. Sistem ağı ("sistemlerin sistemi")

Oyunun çekirdeği bu. Her modül bir **düğüm**, her hat bir **kenar**. Dört ağ var ve dördü de aynı genel graf altyapısında çalışır:

| Ağ | Kaynak → Tüketici | Hat kesilirse |
|---|---|---|
| ⚡ **Güç** | Reaktör / batarya → her şey | Hattın aşağısı söner |
| 🌡️ **Isı** | Her aktif modül ısı üretir → ısı boruları → radyatörler | Isınan sistem önce yavaşlar, sonra hasar alır |
| 📡 **Veri** | Köprü / uçuş bilgisayarı → taretler, iticiler | Taret "kör mod"a geçer (sadece ileri ateş, düşük isabet); iticiler koordinesiz çalışır |
| 🔩 **Besleme** | Cephane deposu / yakıt tankı → silahlar, iticiler | Silah elindeki şarjörü bitirince susar. Delinen tank sızdırır, tutuşabilir. |

### 7.1 Güç yönetimi (FTL'in ikilemi, mekanda)
- Talep arzı aşınca oyuncunun belirlediği **öncelik sırası** uygulanır. Bunu savaşta değiştirmek asıl beceri.
- Batarya ve kapasitörler kısa süreli tampon görevi görür.

### 7.2 Isı
- Her karonun bir sıcaklığı var. Isı komşu karolara ve borularla radyatörlere akar.
- Radyatörler yüzey alanıyla orantılı ısı atar. Büyük ve dışarıda durmaları gerekir, bu da onları kolay hedef yapar. Bilinçli bir tasarım ikilemi.
- Eşikler: T1'den sonra verim düşer, T2'den sonra karo hasar alır, T3'te tutuşma ihtimali başlar (deterministik RNG ile).

### 7.3 Tasarım sonuçları
- Yedekli hatlar güvenlidir ama kütle ve yer kaplar.
- Merkezdeki reaktör korunur ama sıcak bir çekirdek yaratır.
- Bir **ağ görünümü** (overlay) her an açılabilir: hatlar, akış ve kopuklar renkli gösterilir.

---

## 8. Gemi yapısı

### 8.1 Malzemeler (başlangıç seti)

| Malzeme | Kütle | Dayanım | Not |
|---|---|---|---|
| Hafif çerçeve | düşük | düşük | ucuz, iskelet |
| Çelik zırh | yüksek | yüksek | standart koruma |
| Seramik | orta | ısıya çok dayanıklı | lazere karşı |
| Hurda sac | orta | rastgele | yağmadan gelen, kaliteli olması şansa bağlı |

### 8.2 Modül kataloğu (başlangıç, yaklaşık 15 adet)
- **Güç:** küçük reaktör, batarya
- **Isı:** radyatör, ısı borusu
- **Veri:** köprü, uçuş bilgisayarı, veri hattı
- **Hareket:** ana itici, RCS, jiroskop, stabilizatör, yakıt tankı
- **Silah:** kinetik taret, lazer taret, füze rampası, cephane deposu
- **Destek:** tamir drone yuvası, kargo bölmesi, mürettebat kabini, kaçış kapsülü

Modüller veri olarak tanımlanır (JSON/TS tanım dosyaları). Kod modülleri adıyla değil, **özellikleriyle** tanır: üretir, tüketir, ısıtır, kuvvet uygular gibi.

---

## 9. Yağma ve söküm

- Düşman gemileri **aynı modül kataloğundan** kurulur.
- Bir modül ancak **sağlam** ise sökülebilir. Reaktörü patlatırsan hurda alırsın; hatları kesip ya da EMP ile sakatlarsan modülü alırsın.
- **Nasıl savaştığın neyle geliştireceğini belirler.**
- Sökülen modül iki şeyden birine dönüşür:
  - **Kargo:** Hemen takılabilir (sefer içinde sahada montaj, sınırlı).
  - **Plan:** Eve dönünce tersine mühendislikle plan arşivine eklenir, artık hurdayla üretilebilir.

---

## 10. Mürettebat

- 3–6 küçük karakter (robotlar ve yaratıklar), her birinin ismi, kişiliği ve tuhaflıkları var.
- **İstasyonlara atanırlar** (köprü, makine dairesi, topçuluk), atandıkları yere bonus verirler.
- **Fiziksel olarak bir karoda dururlar.** O karo vurulursa yaralanırlar (tutarlılık ilkesi). Kaçış kapsülü onları kurtarabilir.
- Seferlerden deneyim ve **anı** kazanırlar: küçük hikâye olayları, ilişkiler, mavi seçenekler (FTL'deki gibi).
- Başlangıçta mürettebat yürümez (yol bulma yok). Tamiri **tamir drone'ları** yapar: gövdenin üstünde hasarlı karoya giderler, hurda harcarlar, vurulabilirler.

---

## 11. Sefer yapısı

### 11.1 Yapı
- Üsten bir **bölge** seçilir. Bölgeler açıldıkça çoğalır; her birinin bir kimliği var (asteroid kuşağı, sıcak bölge, enkaz tarlası, sessiz bölge…).
- Bölge, dallanan bir **düğüm haritası** (FTL tarzı). **Her düğüm serbestçe uçulan sürekli bir sahne**: savaş, enkaz, istasyon, anomali, olay.
- Derinlik arttıkça ganimet ve tehlike artar.
- **Çıkış kapıları** belirli düğümlerde. Eve dönmek oyuncunun kararı. Atlama motorunun şarj olması zaman alır: hasar almadan ve güç ayırarak beklemen gerekir.

### 11.2 Tehdit saati: "Gürültü"
- Gürültülü her eylem bölgenin **dikkatini** çeker: savaş, söküm, sıcak çalışan motorlar.
- Gürültü arttıkça daha güçlü avcılar gelir, sonunda bölgenin "süpürücüsü" ortaya çıkar.
- Sessiz oynamak (soğuk motor, lazerle cerrahi söküm) geçerli bir stil.

### 11.3 Süre ve kayıt
- Hedef sefer süresi **1–2 saat**.
- Düğüm aralarında kaydedip çıkılabilir (bir slot, kalıcı ölümle uyumlu).

### 11.4 Ölüm ve enkaz
- Gemi ve kargo kaybolur. Mürettebat kaçış kapsülüyle kurtulmuş olabilir.
- Enkaz bölgeye **işaretçi** olarak kaydedilir. Bir sonraki seferde o bölgeye gidip kendi parçalarını kurtarabilirsin.

---

## 12. Ev üssü (sandbox)

- **Tersane:** Gemi editörü. Karo yerleştirme, hat çekme, ağ doğrulama, test sahası (hedef dummy'leri).
- **Plan arşivi:** Tersine mühendislik yapılmış modüller.
- **Mürettebat odası:** Karakter etkileşimleri, işe alım.
- **Hırslar panosu:** Uzun vadeli hedefler.
- **Üs geliştirmeleri:** Yeni bölgeler, daha büyük tersane, daha iyi tersine mühendislik.

---

## 13. Hırslar (zorunlu final yerine)

Oyuncunun seçtiği, birden fazla sefere yayılan büyük hedefler. Her birinin kendi epilogu var. Örnekler:
- **Efsanevi Gövde:** Dağınık bölgelerden antik bir geminin 5 parçasını topla ve yeniden inşa et.
- **Kayıp İstasyon:** İpuçlarını takip edip haritada olmayan bir yeri bul.
- **Hurdacı Kralı:** Bir lonca kur, rakipleri geride bırak.

> Hırslar fizik ve sistem çekirdeği oturduktan sonra (Faz 8) ayrıntılandırılacak.

---

## 14. Sunum

- **Görsel:** Pastel neon palet, okunaklı karo sanatı, yumuşak bloom. Kırılan parçalar kıvılcım ve küçük ekran sarsıntısıyla saçılır, uzun süre ortalıkta süzülür. Mevcut neon yarış prototipindeki Pixi efekt deneyimi buraya taşınır.
- **Okunabilirlik:** Ağ görünümü, hasarlı karo vurgusu, kütle merkezi ve itme vektörleri (isteğe bağlı yardımcı katman).
- **Ses:** Keşif ve savaş katmanları arasında geçiş yapan dinamik müzik (FTL / Ben Prunty yaklaşımı). Modül sesleri durumu anlatır: gıcırdayan jiroskop, öksüren reaktör.

---

## 15. Teknik mimari

- **Stack:** TypeScript + Vite + **Pixi.js 8** (mevcut repo stack'i), render için.
- **Fizik:** Kendi yazdığımız deterministik grid fiziği. Harici fizik motoru yok, çünkü karo bazlı kütle, kopma ve delme kontrolü bizde olmalı.
- **Katmanlar:**
  ```
  src/
    core/      sabit adım döngüsü, seed'li RNG, vektör matematiği
    physics/   rijit cisim, karo ızgarası, çarpışma, kopma
    ship/      malzemeler, modüller, gemi tanımı (veri odaklı)
    networks/  genel graf çözücü + güç/ısı/veri/besleme
    combat/    mermiler, DDA delme, hasar
    ai/        düşman davranışları (oyuncuyla aynı kontrol arayüzü)
    expedition/ bölge, düğüm haritası, gürültü, çıkış
    base/      tersane, arşiv, mürettebat, hırslar
    render/    Pixi sahneleri, efektler, overlay'ler
    ui/        HUD, menüler
    data/      modül, malzeme, düşman tanımları
  ```
- **Simülasyon render'dan ayrı:** `sim.step(input)` saf ve deterministik çalışır, render yalnızca durumu okur. Bu sayede test, tekrar oynatma (replay) ve hata ayıklama kolaylaşır.
- **AI da oyuncu gibi girdi üretir.** Düşmanlar hile yapamaz.
- **Kayıt:** IndexedDB (localStorage fallback'iyle), sürümlenmiş kayıt şeması.

---

## 16. Kapsam dışı (bilinçli olarak kesildi)

Gezegene iniş · yürüyerek gezme · karmaşık ekonomi simülasyonu · büyük filo yönetimi · multiplayer · 3D · tam açık dünya.

---

## 17. Faz planı

Her fazın sonunda **çalışan, denenebilir** bir şey olmalı.

| Faz | Hedef | "Bitti" kriteri |
|---|---|---|
| **0** | Konsept | Bu belge onaylandı ✅ |
| **1** | **Fizik çekirdeği** | Karolardan oluşan test gemisi uçuyor. Kütle merkezi ve atalet karolardan hesaplanıyor. Debug'da bir itici silinince gemi gözle görülür şekilde asimetrik davranıyor. |
| **2** | **Uçuş asistanı** | Jiroskop, RCS, stabilizatör ve uçuş bilgisayarı birer modül. Uçuş asistanı açık/kapalı ve drift çalışıyor. Her biri silinince kontrol hissi beklendiği gibi bozuluyor. |
| **3** | **Silahlar ve yerel hasar** | Kinetik + lazer. DDA ile delme, impuls, karo kırılması, gemi bölünmesi, süzülen enkaz. Dummy hedefe ateş edilebiliyor. |
| **4** | **Sistem ağı** | Güç, ısı, veri ve besleme graf çözücüsü. Kesilen hat aşağıdaki sistemleri durduruyor. Ağ görünümü var. |
| **5** | **Düşman yapay zekası ve ilk savaş** | Aynı kurallarla 1'e 1 savaş, taktik yavaşlatma. **🎯 İlk oynanabilir dilim.** |
| **6** | **Yağma ve tersane** | Sağlam modül sökme, gemi editörü, ağ doğrulama, test sahası. |
| **7** | **Sefer yapısı** | Bölge düğüm haritası, olaylar, gürültü saati, çıkış kapısı, ölüm ve enkaz işaretçisi, düğüm arası kayıt. |
| **8** | **Ev üssü ve meta ilerleme** | Üs merkezi, plan arşivi, mürettebat, hırslar (ilk 1 tanesi uçtan uca). **🎯 İlk tam döngü.** |
| **9** | **İçerik ve ton** | Sanat ve ses geçişi, daha fazla modül, düşman ve bölge, denge. |
| **10** | **Cila** | Öğretici akış, ayarlar, performans, yayın hazırlığı. |

---

## 18. Açık sorular

1. **Repo:** Yeni oyun neon yarış prototipinin yerine mi geçecek, ayrı bir branch/klasörde mi yaşayacak?
2. **Gemi boyutu:** Tipik gemi kaç karo olsun? (Öneri: başlangıçta 30–80 karo, geç oyunda ~200; performans Faz 1'de ölçülecek.)
3. **Mürettebat yürüsün mü?** Başlangıçta hayır (§10); Faz 9'da tekrar değerlendirilecek.
4. **Kalkanlar:** Fiziksel bir kalkan modülü olsun mu, yoksa sadece zırh ve nokta savunması mı?
5. **Görsel kimlik:** "Tatlı" ne kadar tatlı? Gemilerin yüz ifadeleri / ışık gözleri olsun mu?
6. **Oyun adı:** "KESİT" çalışma adı; nihai isim sonra.
