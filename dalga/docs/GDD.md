# Dalga Kıranlar: Oyun Tasarım Belgesi

> Sürüm 0.1 · Oynanabilir prototip. Sayılar ilk denge turunun sonucudur; oyun testleriyle değişecek.

## 1. Özet

**Tür:** Mobil, üstten görünüm, gemi savaşı ve yağma (tek oyunculu, .io havasında).

**Tek cümle:** *"Küçük bir sandalla başla, kalyon kaptanı ol; ama ambarındaki altın limana varana kadar senin değil."*

**Referans oyunda eksik olanlar ve bizim cevabımız:**

| Referans oyun | Dalga Kıranlar |
|---|---|
| Küçük, tek parça bir harita | 2,8 km yarıçaplı dünya, 4 bölge, 150 ada, 4 liman |
| 5 gemi | 8 gemi, her birinin kendine özgü yeteneği var |
| Birkaç seviyeli tek tür top | 6 top türü × 10 seviye, birleştirme (merge) sistemi |
| Basit hareket | Rüzgar, omurga sürtünmesi, yalpa, su alma, çarpışma, halat fiziği |
| Düz ilerleme | Risk ve ödül: ambar kapasitesi ve batınca altının denize saçılması |

## 2. Çekirdek döngü

1. **Limandan çık.** Gemini ve yuvalarındaki topları seç.
2. **Avlan.** Toplar menzile giren düşmana kendiliğinden ateş eder. Oyuncunun işi konumlanmak: bordasını çevirmek, rüzgarı kullanmak, kaçmak, çarpmak.
3. **Yağmala.** Batan gemiler altın fıçıları bırakır. `?` işaretleri batık hazine, mücevher sandığı ya da pusu olabilir.
4. **Ambar dolunca ikilem:** Geri dön ya da bir gemi daha batır. Batarsan ambarındaki altın denize saçılır (geri dönüp toplamaya çalışabilirsin).
5. **Limanda harca.** Yeni gemi, gövde, yelken ve ambar yükseltmesi, top sandıkları, top birleştirme.
6. **Daha dış halkaya aç.** Daha güçlü düşmanlar, daha büyük ödüller, yeni limanlar, bosslar.

## 3. Fizik (tasarım sütunu: "gemi gibi hissettirmeli")

- **İtki ve sürtünme:** Terminal hız `vmax·√gaz`. Ağır gemiler geç hızlanır.
- **Omurga:** Yan kayma güçlü biçimde sönümlenir. Bu yüzden keskin dönüşte gemi kayarak döner ve momentumun bir kısmı ileri aktarılır.
- **Dümen:** Dönüş hızı ileri hızla artar. Duran bir gemi zor döner, kürekliler daha iyi döner.
- **Rüzgar:** Yelken açısına göre verim (pupa %95, apaz %112, orsa %78, rüzgara karşı %55). Kadırga kürekli olduğu için etkilenmez. Fırtına kuşağında rüzgar sertleşir ve dalgalanır.
- **Yüzerlik:** Baş, kıç, iskele ve sancakta dalga yüksekliği örneklenir; yay-sönüm sistemiyle yalpa, baş-kıç vurma ve inip çıkma hesaplanır. Küçük gemiler çabuk, büyükler ağır sallanır. Su mesh'i aynı dalga fonksiyonunu kullanır.
- **Yatma:** Dönüşte dışa, rüzgar altına, top geri tepmesinde ve isabet alınca yatar.
- **Su alma:** Can %45'in altına inince gemi yavaşlar, delik tarafına yatar, güverteden duman ve alev çıkar.
- **Batma:** Yana yatar, burnu kalkar, kabarcıklar çıkarak batar. Kargosu fıçılar halinde saçılır.
- **Çarpışma (mahmuz):** Kapsül-kapsül çözümü ve impuls. Hasar, göreli hız ve kütle oranıyla hesaplanır. Başıyla vuran gemi (özellikle Kadırga) az hasar alır, çok hasar verir. Darbe merkez dışındaysa gemiyi döndürür.
- **Karaya oturma:** Ada kıyısı kutupsal bir fonksiyondur; gemi kıyıdan itilir, sürtünür ve sert vuruşta hasar alır.
- **Gülleler:** Gerçek balistik kullanılır (yerçekimi ve atan geminin hızı). Nişan, göreli hızla öncülenir. Havan yüksek kavisle adaların ardını vurur.
- **Zıpkın halatı:** Yay-sönüm halat iki gemiyi birbirine çeker. Hafif gemi daha çok savrulur.

## 4. Gemiler

| Gemi | Yuva | Özellik | Yetenek | Fiyat |
|---|---|---|---|---|
| Sandal | 2 | çok çevik | Kürek Hamlesi (hız) | başlangıç |
| Şalupa | 4 | hızlı, baş ve kıç topu | Rüzgarı Yakala | 600 |
| Brigantin | 6 | dengeli | Tam Borda (anında dolum) | 3.500 |
| Kadırga | 5 | kürekli, mahmuz ×2,2 | Mahmuz Hücumu | 9.000 |
| Fırkateyn | 10 | hızlı ve güçlü | Tam Borda | 20.000 |
| Bomba Gemisi | 6 | 2 döner havan yuvası | Barut Fıçıları (mayın) | 38.000 |
| Kalyon | 14 | yüzen kale, yavaş döner | Tamirat | 80.000 + 60 💎 |
| Hayalet Gemi | 10 | en hızlısı | Sis Perdesi (görünmezlik) | 450 💎 |

Yükseltmeler gemiye özeldir: Gövde (+%12 can), Yelken (+%3 hız ve dönüş), Ambar (+%25 kapasite), her biri 10 seviye.

## 5. Toplar

| Tür | Rol |
|---|---|
| Top | Dengeli yan top |
| Uzun Top | Uzun menzil, dar açı, kaçanları avlar |
| Karronat | 4 saçma, kısa menzil, yakın dövüşte yıkıcı |
| Zincir Gülle | Yelkeni parçalar, hedefi %40 yavaşlatır |
| Havan | Yüksek kavis ve alan hasarı, en az 28 m menzil |
| Zıpkın | Halat atar, hedefi kendine çeker |

10 seviye vardır. Hasar en hızlı artar; dolum süresi ve menzil biraz iyileşir. **Birleştirme:** aynı tür ve seviyedeki iki top birleşip bir üst seviyeye çıkar. Altınla da yükseltilebilir, satılabilir.

Sandıklar: Tahta (altın), Demir (altın, havan şansı), Altın (elmas, zıpkın ve yüksek seviye), 4 saatte bir bedava Günlük Hediye. Sandık seviyesi keşfedilen liman sayısıyla artar.

## 6. Dünya

| Bölge | Yarıçap | Düşman Sv | Karakter |
|---|---|---|---|
| Sakin Koy | 0–650 | 1–5 | Tüccar ve küçük korsanlar, sakin su |
| Mercan Denizi | 650–1350 | 4–11 | Mercan adaları, donanma devriyeleri |
| Fırtına Kuşağı | 1350–2050 | 10–18 | 2,6 kat dalga, köpüklü tepeler, sert rüzgar, sis |
| Ölü Sular | 2050–2800 | 17–26 | Hayalet gemiler, yeşil sis, ölü ağaçlar |

- **Limanlar** kenarı şamandıralarla işaretli güvenli sulardır; içinde kimse ateş etmez. Keşfedilen her liman kasaya altın yatırma ve donanım noktasıdır.
- **Bosslar** (her bölgede bir tane, inleri haritada ☠): Kambur Bill (8), Mercan Kraliçesi (15), Fırtına Amirali (22), Uçan Hollandalı (30). Her biri 2,2 kat can ve muhafızlarla gelir; elmas ve yüksek seviyeli top sandığı düşürür. 4 dakikada yeniden doğar.
- **Gizemli enkazlar (`?`):** %62 batık hazine, %23 pusu, %15 mücevher sandığı.

**Gruplar:** Korsan, donanma ve tüccar arasında düşmanlık tablosu vardır. Korsanlar tüccarlara ve donanmaya saldırır, hayaletler herkese. Bu yüzden oyuncunun karışmadığı savaşlar da çıkar ve ganimetini kapmak mümkündür.

**Seviye renkleri:** Düşmanın etiketindeki altıgen yeşilse (≤ −3) kolay, sarıysa dengeli, kırmızıysa (≥ +3) tehlikeli bir rakiptir.

## 7. Ekonomi (ilk tur)

- Ödül: `90 × 1.22^(sv−1)`; tüccar ×2,2, donanma ×1,2, hayalet ×1,5.
- Bot testi (`npm run economy`): Sandal ~50–80 altın/dk, Şalupa ~110/dk, Brigantin (1. bölgede) ~600/dk. İlk gemi yükseltmesi birkaç dakikada gelir.
- YZ topçuları oyuncudan dağınık atar (×2,2 sapma) ve %25 daha az hasar verir. Oyuncunun gövdesi 6 sn vurulmayınca saniyede %3 onarılır.

## 8. Yol haritası

**Faz 1, his ve içerik (sıradaki):**
- [ ] Gerçek cihaz testleri (iPhone/Android), performans profili, düşük grafik modunda daha az su ızgarası
- [ ] Dokunarak hedef seçme, ateş kesme düğmesi
- [ ] Görevler (günlük ve haftalık), başarımlar
- [ ] Mürettebat (kaptan perkleri), bayrak ve yelken kozmetikleri
- [ ] Kraken ve deniz canavarı olayları, fırtına dalgası olayı
- [ ] Müzik

**Faz 2, mağaza:**
- [ ] Capacitor ile iOS/Android paketi, yerel kayıt, titreşim (haptics)
- [ ] Ödüllü reklam ("4 elmas için izle"), elmas paketleri
- [ ] Bulut kayıt

**Faz 3, çok oyunculu:**
- [ ] Simülasyon zaten render'dan bağımsız ve sabit adımlı; yetkili sunucu (authoritative server) ile .io modu
- [ ] Filo (klan) savaşları
