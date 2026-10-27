# TS IK: P1-P6 parca sozlesmesi (Y0 iskelet uzerine)

Kok: `istemci/src/moduller/ik/yeni/`. Adres: `/ik/yeni/<gorunum>[/<kimlik>]` ve `/ik-islemlerim/yeni/<gorunum>[/<kimlik>]`;
kok adres (`/ik/yeni`, `/ik-islemlerim/yeni`) Pano ve Benim sayfam'dir. Alimda yalniz `yeni/` adres parcasi duser.
Gorunum adres parcalari ikinci menudeki yollarla aynidir (`paylasilan/sayfalar/ik.ts`); ayrinti sayfalari `calisan`, `aday`, `pozisyon`, `uye`.

| Parca | Klasor | Disari verilen bilesen (adi degismez; gorunumler.ts ithal eder) | Gorunum anahtari | CSS oneki |
|---|---|---|---|---|
| P1 | personel/ | `Personel`, `Calisan`, `Organizasyon` | personel, calisan, org | tc-ikp- |
| P2 | izin-devam/ | `Izinler`, `DevamVeMesai` (Puantaj sekmesi dahil) | izin, devam | tc-iki- |
| P3 | bordro/ | `Bordro`, `Hesaplamalar`, `MaliyetPlani`, `Ayarlar` | bordro, hesap, plan, ayarlar | tc-ikb- |
| P4 | isealim/ | `Performans`, `Egitim`, `IseAlim`, `Aday`, `Pozisyon` | performans, egitim, isealim, aday, pozisyon | tc-ika- |
| P5 | analiz/ | `Pano`, `Yapilacaklar`, `Raporlar`, `Gunluk` | pano, gorev, rapor, log | tc-ikr- |
| P6 | islemlerim/ | `BenimSayfam`, `Izinlerim`, `Bordrolarim`, `Mesailerim`, `Onaylar`, `Ekip`, `EkipUyesi`, `EkipTakvimi` | benim, izinlerim, bordrolarim, mesailerim, onay, ekip, uye, ekiptakvim | tc-ikm- |

Her bilesen `(o: IkEkranOzellikleri) => JSX` imzasindadir. Y0 her klasore yer tutucu `index.tsx` koyar; parca o dosyayi ve klasorunu
sahiplenir. Parca yalniz kendi klasorune ve `ekran-testleri/ik-yeni.spec.ts` icinde kendi `test.describe('P<n> ...')` bloguna yazar.
Kendi css dosyasi kendi klasorundedir. Iskelet dosyalarina (asagidaki liste) dokunulmaz; eksik islev iskelet sahibine istek olarak gelir.
PDKS aktar Nizamiye'nin ekranidir (`/ik/pdks`), yeni ekranda yoktur; sekmesi oraya gider.

## Parcalar arasi bilesenler (koordinator 20:58, P4 istegi)
Baska parca yalniz bu adlari ithal eder (`../personel/index.tsx`, `../isealim/index.tsx`); Y0 yer tutucuda imzalari koyar.
- P1 `PersonelFormu { acik: boolean; onDolu: Partial<Personel>; kapat(): void; kaydedildi(p: Personel): void }`: P4 "Ise al" on dolu acar
  (ad, soyad, telefon, kisiselEposta, il, pozisyon, departmanId, iseGiris, brutMaas, egitim, okul, yabanciDil); adayin guncellenmesi
  (asama, empId, iseAlimTarihi, teklifYanit, gorusme iptali) ve calisan sayfasina gecis P4'undur (`kaydedildi` icinde).
- P4 `PozisyonFormu { acik: boolean; onDolu: Partial<Pozisyon>; kapat(): void; kaydedildi?(j: Pozisyon): void }`: P1 "Yerine pozisyon ac" on dolu acar.

## Y0'in sabit imzalari (parcalar kullanir, degistirmez)
- `gorunumler.ts`: `IkEkranOzellikleri { depo: IkDeposu; yetki: IkYetkisi; rol: IkEkranRolu; ben: Personel | null; kimlik: string | null;
  git(gorunum: IkGorunum, kimlik?: string): void; motor: IkMotoru | null }`.
  `ben` ekranin "ben"idir (kisinin personel kaydi). `kimlik` ayrinti sayfasinin kaydidir.
- `veri.ts`:
  - `useIkDeposu()`: `GET /ik/veri` tek okuma; `IkDeposu { ben: IkBen; kayitlar; surumler; ayarlar; ayarSurumu; gecmis; tur(t); al(id) }`.
  - `useIkKomutu()`: `{ kaydet(kayit), topluKaydet(kayitlar), iptal(id), ayarKaydet(ayarlar), bordroKesinlestir(bordrolar), bordroGordum(id), puantajYaz(gunler), calisiyor }`.
    Yazma ucunu yetkiye gore kendisi secer (izin talep/karar, devam onay, pozisyon onayla, personel iletisim: bugunku kopru.ts kurallari).
    Cevap depoya yazilir; eski surumde depo yenilenir ve kullanici iletisi cikar. Kayit govdesindeki sistem alanlarini (zaman, yazan) ekran yazmaz.
  - `yeniKimlik(tur)`: yeni kayit kimligi (`emp_...`).
  - `useIkPuantaj(ay, personel?)`, `useIzinGunu(personel, baslangic, bitis)`, `useKisiVardiyasi(personel)`, `useIkOzeti()`.
- `tipler.ts`: kayit turleri `Personel`, `Departman`, `Izin`, `Devam`, `Bordro`, `Performans`, `Egitim`, `Pozisyon`, `Aday`, `Gorusme`, `IkAyarlar`;
  `KayitTurleri` (tur -> tip). Alanlar ik-modulu `docs/VERI-MODELI.md`; hepsi istege baglidir (sunucu govdeyi oldugu gibi saklar).
- `yetki.ts`: `IkYetkisi { oku, personelYaz, ucretYaz, izinYaz, izinTalep, izinOnay, devamYaz, devamOnay, bordroKesinlestir, bordroKilitAc,
  bordroGordum, performansYaz, egitimYaz, iseAlimYaz, pozisyonOnay, ayarYaz, ozelVeriOku, herhangiYazma }`. `ben.saltOkunur`'da
  butun yazmalar false. Ekran yalniz gizler; denetim uctadir.
- `rol.ts`: `IkEkranRolu = 'ik' | 'yonetici' | 'calisan'` (sunucudaki `ikRolu`); `ekipKimlikleri(personeller, departmanlar, yonetici)` (IK-24, sunucuyla ayni kural);
  `gorunumAcik(anahtar, yetki)` (214 a: onay, ekip, uye, ekiptakvim yalniz `ik.izin-onay` ile).
- `motor.ts`: motoru ithal eden tek yer (211 a cevabina gore yolu tek satirda degisir). `IkMotoru` (motorun ekranda kullanilan yuzu, tipli),
  `motorKur(kayitlar, ayarlar): IkMotoru | null`. M0 gelene kadar null doner: hesap gereken yer `DurumKutusu durum="yukleniyor" mesaj="Hesap motoru hazirlaniyor"` gosterir.
  Sabit listeler (izin turleri, asamalar vb.) M0 ile `motor.ts`'ten `ikSabitleri()` olarak gelir; parca kendi kopyasini yazmaz.
- `bicim.ts`: `para(v)`, `paraKisa(v)`, `tarih(v)`, `kisaTarih(v)`, `ayAdi(ay)`, `adSoyad(p)`, `YOK` ("—"; veri yoksa sifir yazilmaz).
- `ortak/`: `KisiHucresi { personel }` (bas harf + ad, renk tasarim degiskeninden), `DurumCipi { tur: 'izin' | 'personel'; deger }`,
  `AySecici { ay; degistir }`, `BelgeYazdir { baslik; children; kapat }` (izin formu, calisma belgesi, pusula, tazminat dokumu; `window.print`).
- `test-ortak.tsx`: `ikAc(adres, { kullanici, veri })`, `ornekVeri()` (uydurma ornek, gercek veri yok), kullanicilar `IK_YONETICI`, `IK_OKUYAN`, `MUDUR`, `CALISAN`, `KAPISIZ`.

## Kurallar (her parca)
- TASARIM KORUMA (2026-10-24, kullanici; 20:22 duzeltilmis okuma teyitli; 203 a kalkti): HTML'den TS'ye gecen sayfalarda amac TypeScript'e gecis ve
  mantik, kurgu, bozukluk hatalarinin duzeltilmesidir. Ortak tasarima oturur: renkler (tasarim degiskenleri, sabit renk yok), yazi tipi ve boyutlari,
  dugme, kart, form ve bildirim gorunusu, genel dugme ikonlari (Malzemeler ikonlari dahil ortak sete gecebilir). Degismez: sayfanin duzeni, yerlesimi,
  kullanimi, akisi, araclari ve yapisi; ozel tasarimlar ortak parcaya cevrilmez, kendi tasarimiyla tasinir (orn. planlama motoru ve sonsuz tahta,
  planlama atolyesi, Recete-Rota akis semasi ve tablosu, Uretim Terminali). 360 genislige sigdirmak icin duzen degistirilmez; tasma yalniz duzen
  bozulmadan giderilir. Fark yalniz mantik/kurgu/bozukluk hatasi, guvenlik ya da onayli karar (orn. 357 b: motor isteyen dugme gorunur ama pasif)
  gerektirdiginde yapilir; her fark gerekcesi ve hata turuyla soru olur, varsayilan oneri "eski hali kalsin". Bu dosyadaki ortak bilesen ve 360/768/1280
  maddeleri bu metne gore okunur: ortak bilesen yalniz sayfanin duzenini, yerlesimini ve araclarini degistirmiyorsa kullanilir; 360/768/1280 olcumunde
  duzen degismez (kurulum/proje-talimati.md KURALLAR 3).
- 203 a kalkti (kullanici, 2026-10-24 20:07); yerine TASARIM KORUMA. Tasarim degiskenleri, ortak `Simge` ve ortak dugme, kart, form, bildirim gorunusu
  gecerlidir; ortak bilesenler (`Tablo` arac yuvasiyla, `SayfaBasligi`, `FormPenceresi`, `Pencere`, `OnayPenceresi`, `Sekmeler`, `Rozet`, `SayiKarti`,
  `GrafikKarti`, `useBildirim` eylemli) yalniz sayfanin duzeni birebir kaliyorsa kullanilir; 360/768/1280'de duzen degismez. Sabit renk, olcu, satir ici
  stil yok.
- 205 a: tarayicidaki hesaplar saf TS islevi (parcanin `kurallar.ts` dosyasi, birim testli). Bordro kesinlesmesi sunucudadir.
- 208 a: olcut bugun calisan hal; kapali ozellikler (ornek veri, geri yukle, tumunu sil) ve 210.6 "Yedegi indir" yeni ekrana girmez.
- 209 a: ana akis `ekran-testleri/ik-yeni.spec.ts` icinde kendi blogunda.
- Arama: gorunumun kayitlari ve duz Turkce komutlar `useSayfaKomutlari('ik-<gorunum>', ...)` ile Ctrl K "Bu sayfa" grubuna verilir.
- Yardim metinleri (35 konu) P5'in `analiz/yardim.ts` dosyasinda; `rehber.ts` alima kadar degismez.
- Envanter `degerlendirme/ts-gecisi/envanter/ik.md` bolum 2'deki her alan ve islem; DEVIR'de isaretli liste. Fark varsa "fark" satiri, onaya gider.

Kabul (parca basina): envanter satiri tam; yazma dugmeleri yetkiye gore gizli, izinli ve reddedilen test; 360/768/1280 olcumu; ekran testi blogu; `kontrol` yesil.

## Iskelet dosyalari (Y0'in; parcalar dokunmaz)
`IkYeni.tsx`, `gorunumler.ts`, `veri.ts`, `tipler.ts`, `yetki.ts`, `rol.ts`, `motor.ts`, `bicim.ts`, `ik-yeni.css`, `ortak/*`, `test-ortak.tsx`, testleri; `../rotalar.tsx`.
