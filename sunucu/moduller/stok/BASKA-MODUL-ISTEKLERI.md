# Başka modül istekleri: stok

Kalıp `kisiler/disari.ts` `kisiAdlari`: kimlik listesi alan tek sorgu, olmayan kimlik haritada yok. Kopya yazılmadı.

## kisiler: rol x işlem satırları (kullanıcı kararı K3, onaylı)

Yeni göçle `rol_islemi` ve sayfa yetkisi:

| Rol | İşlemler |
|---|---|
| bütün yerleşik roller | `sayfa.stok` (stoğu giriş yapan herkes görür; okuma uçları `oturum`) |
| depo | `stok.giris`, `stok.cikis`, `stok.transfer`, `stok.sayim` |
| kalite | `stok.sayim` |
| mudur | `stok.giris`, `stok.cikis`, `stok.transfer`, `stok.sayim`, `stok.tanim`, `stok.geri-al` |

DOĞRULANDI: bugün yalnız `depo` rolü `sayfa.stok` taşıyor (`20261006092612_kisiler_roller.sql:122`). Akış testi bu satırları kendi şemasında ekler.

## uretim-emirleri (dışa açık dosyası yok, DOĞRULANDI 5eb9481)

```ts
uretimEmriOzeti(db: Db, id: number): Promise<{ id: number; emirNo: string; durum: EmirDurumu; isMerkeziId: number } | null>;
emirNolari(db: Db, idler: number[]): Promise<Map<number, string>>;
```

DEP-36 kapandı (Aşama 2 tur 1): `emirOzeti(...).istasyonId` -> `istasyonGetir` -> iş merkezi; `uretimEmriOzeti` gerekmedi.
Bekleyen: ekranda emir no (bugün "Emir #<kimlik>" yazar; `emirNolari`) ve sarfın bağlanacağı iş emri kimliği (SH3 a, tur 2).
Emrin varlığı yabancı anahtarla değil servis denetimiyle (`emirVarDenetle`, `sarfEmriDenetle`) sağlanır; yabancı anahtar emir modeli belli olunca ayrı göçle (UYUM-BORCU 11).
Emir tamamlama (kart #206, ilk sistemdeki "Tamamla ve stokta"): stok `emirMalzemeIhtiyaci` ve `uretimEmriOzeti` kullanır. İstek: `uretimEmriOzeti` bitmiş emirde `saglamAdet` versin (`uretim_emri.saglam_adet`); gelince stok tamamlamada gövdedeki `miktar` yerine onu kullanır. Tamamla düğmesi emir ekranındadır: emir ekranı önizlemeyi `GET /stok/uretim-emirleri/:id/tamamlama` ile okur, onaylanınca `POST /stok/uretim-emirleri/:id/tamamla` gönderir. KAPANDI: `saglamAdet` #443 ile geldi, stok kullanıyor; düğmeler rota #446 ile emir kartında.
Eksikleri teslim al (kullanıcı kararı a, 10.10.2026): emir ekranı eksik varsa (önizlemede `eksik` sıfırdan büyük) `/stok/mal-kabul?emir=<kimlik>` adresine bağlantı verir; mal kabul eksikleri satıra doldurur.

## malzemeler

Kapandı (Aşama 2 tur 1, ana dal d0c33e1): `malzemeOzetleri` ve `malzemeAra` stok tarafından kullanılıyor (liste, panel, sepet, arama, mal kabul kart seçimi).

Birim kapandı: özet `birim` taşıyor, stok ekranları gösteriyor (Aşama 2 tur 1). Hizmet türü gelince stok hizmet satırına depo girişi yazmaz.

## Sonraki sürümde bağlananlar

- firmalar: `firmaVarMi(db, id)`, `firmaAdlari(db, idler)`: fason kutusu ve tedarikçi firması.
- atölye: `uretimKonumuVarMi(db, id)`, `uretimKonumuAdlari(db, idler)`: üretim alanı konumu.
- satın alma: sipariş satırı sütunu geldi (`siparis_satir_id`, göç `20261009051000`). SH1 a: stok mal kabul işleminde satın almanın `teslimIsle(db, kullanici, {siparisSatirId, miktar, malKabulSatirId})` ve düzeltmede `teslimGeriAl(db, kullanici, {malKabulSatirId})` fonksiyonlarını çağırır; `teslimAlinanlar` verilmez. Açık sipariş satırları satın almanın `siparisSatirlari` süzgecinden.
- rota ve Arkon/üretim kaydı: `stokCikisi` ve `stokGirisi` (satır listesi, tekil çağrı) kaynak hazır olunca.

## Oturtmada eklenen ve düzeltilen (kart #206, kullanıcı kararları 08.10.2026)

- **firmalar yerine finans** (sabit kimlik: firma `finans_firma.id`, ayrı firmalar modülü yok): yukarıdaki "firmalar" satırı finansın `firmaVarMi(db, id)`, `firmaAdlari(db, idler)` fonksiyonlarıdır.
- **atölye yerine istasyonlar** (STK4 a: üretim alanı konumu istasyonlara bağlanır). İstek, `istasyonlar/disari.ts`:
  Var olanlar yeter (DOĞRULANDI `sunucu/moduller/istasyonlar/disari.ts`): `istasyonAdlari(db, idler)` ve `istasyonGetir(db, id)` (varlık ve tip).
  Eksik: istasyonun "üretim alanı konumu" olup olmadığını söyleyen alan yok; gerekiyorsa istasyonlardan istenir (tip `depo` mu, ayrı bayrak mı: Aşama 2'de sorulur).
  Bağ Aşama 2'de yeni göçle (`stok_konum.istasyon_id`); bugün üretim alanı konum türü kapalı.
- **uretim-emirleri (UE listesi; modül dışarıda, yazılmaz)**:
  - Soru: "Stok üretim emrine bağlanacak; yeni modelde hangi kayda (üretim emri mi, iş emri mi)?" Bugün `stok_parti`, `stok_hareketi`, `stok_fis` içinde `uretim_emri_id` düz sayıdır (STK6 b); yabancı anahtar Aşama 2'de ayrı göçle.
  - Stok bugün `emirOzeti(db, id)` ile emrin varlığını denetler (`servis.ts` `emirVarDenetle`); yeni modelde bu fonksiyon kalmalı ya da karşılığı bildirilmeli.
  - İstenen: `emirNolari(db, idler): Promise<Map<number, string>>` (ekranda emir no) ve emrin iş merkezi ya da istasyonu (DEP-36 kapsamı; bugünkü `emirOzeti` `istasyonId` veriyor).
- **satın alma** (STK2 a, SH1 a: teslim stokun mal kabulünde alınır): yabancı anahtar geldi; yön stok -> satın alma, satın alma stoğu ithal etmez. Kalanı aşan teslim reddedilmez, satın almada "fazla teslim" görünür.
- **malzemeler** (STK3 a): kart ekranındaki depo yeri ve konum metni Aşama 2'de stoktan okunur; gerekirse stok `varsayilanGozler(db, malzemeIdler)` verir.

## Reçete ve Rota: Stok sekmesi stoğa bağlansın (kart #1108, RR-4b)

- Bugün R&R ekranının Stok sekmesi statülü stoğu kendi yerel durumunda (`statusStock`) tutar ve "Statü atlatma" da yerelde yazılır.
- İstenen: sekme statülü stoğu stoktan okusun: `GET /stok/malzemeler/:id` cevabındaki `statuKirilimi` (`statuId` null serbest, `miktar`, `ilkGiris`); kart kimliği `malzeme_katalog_karti.no`.
- Statü atlatma stoka yazsın: `POST /stok/statu-degistir` gövdesi `{ malzemeId, konumId, partiId, kaynakStatuId, hedefStatuId, miktar, aciklama }`; yetki `stok.statu-degistir` (yalnız müdür; depoya verilmez, kart #1208). Konum ve parti seçimi için bakiye satırları aynı cevabın `bakiyeler` dizisinde (`statuId` ile).
- Yön: R&R istemcisi stok uçlarını çağırır; stok kodu recete-rota'yı ithal etmez, yalnız `recete_rota_statu` yabancı anahtarı vardır.

## malzemeler: `malzemeAra` parça no ve tedarikçi koduyla da arasın (14.10, mal kabul katalog araması)

Mal kabulde depocu kartı müşteri parça no, teknik resim no, tedarikçi kodu ya da eski kodla da bulmak ister. Bugün `katalogMalzemeAra` (`sunucu/moduller/malzemeler/sorgular.ts`, `ARAMA_KOSULU`) yalnız `stok_kodu`, `kayit.com.ad` ve `no` ile arar; katalog ekranının kendi araması `com.ted`, `com.tkod`, `com.eskiKod` alanlarına da bakar.
İstek: imza değişmeden (`malzemeAra(db, { metin, ... })`) arama koşuluna `kayit.com.tkod`, `kayit.com.eskiKod` ve müşteri parça no / teknik resim no alanları eklensin (alan yolları malzemeler sahibinden okunmalı; DOĞRULANMADI). Stok tarafında değişiklik gerekmez.

## etiket-merkezi ve arkon: lotsuz istisna kartı (kart #154, Soru 129)

- Bugün `stok/disari.ts` `refakatPartisi(db, id)` lotsuz (istisna) kart için null döner; tip değişmedi, çünkü iki modül `lotNo`'yu dolu bekliyor.
- İstenen (Aşama 2): Etiket Merkezi lotsuz kartı "Lot bekliyor" yazarak bassın; Arkon kart listesinde lotsuz kartı göstersin (Dal 10, #156). İkisi için `disari.ts` `partiId`, `lotNo` boş olabilen ayrı bir okuma verir.

## uretim-emirleri: sayım cevabında stok uyarısı (kart #157, Dal 11)

- Lotsuz düşüm ve "teslim edilmeden başka istasyondan" notu bugün yalnız hareket açıklamasında. İstenen: sayım cevabı `uyari` alanını taşısın; stok `uretimSayimiYansit` sonucundan uyarıyı verir. Dal 11'de yazılır.

## bildirim ve kisiler: Dal 8'in ortak dosya değişiklikleri (kart #155)

- `paylasilan/sozlesme/bildirim.ts`: iki yeni tür `stok.birakildi` (bilgi) ve `stok.teslim-suresi-doldu` (uyarı); `bildirim/kurallar.test.ts` beklenen liste buna göre güncellendi.
- `kisiler/rol-dagilimi.test.ts`: stok taşıma yoklaması `GET /stok/sepet` yerine `POST /stok/sepet/teslim-et` (sepet herkese açıldı, Soru 133).
- Kablolama: sayım uyarısı için `disari.ts uretimSayimiYansitUyarili` hazır; kablolamanın ona geçmesi Dal 11 tarafında.

- Üretim Emirleri (kart #492): `disari.ts` emir no ile kimlik çözümü (`emirNoCoz(db, metin)`), malzeme fişi listesinde emir no ile arama için. Gelene kadar arama yalnız önekli fiş no ile.
