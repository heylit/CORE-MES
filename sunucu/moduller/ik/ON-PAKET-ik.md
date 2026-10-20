# Ön paket: ik (İnsan Kaynakları) — v2, tam ayrıştırılmış şema

Durum: **onaylandı (08.10.2026, "tamamla ve teslim et"); kod yazıldı ve bu teslimdedir.** v1 (teslim-ik-c0f4ec6) şemasının yerine geçer. Ekran, uçlar, kurallar (IK-0..IK-25),
çerçeve ve köprü aynı kalır; değişen veri katmanıdır.

## Kullanıcı kararları (08.10.2026)
1. Her kayıt türü ayrı tabloda, **tam ayrıştırma**: her alan bir sütun, iç içe listeler alt tabloda. JSON sütun yok.
2. Kişi–personel eşleşmesi personel kartındaki **"TMI kullanıcısı"** alanıyla (sicil no ile değil).
3. Örnek veri, yedekten geri yükleme, tümünü silme kapalı; "Yedeği indir" açık.
4. Modülün değişiklik günlüğü kalır (geri al, silineni geri getir).
5. Rol x işlem önerildiği gibi; muhasebe_finans bordroyu görmez.
6. **İş merkezi kapsamı uygulanır**: personele iş merkezi alanı ve kapsam süzgeci.
7. (A) Pozisyona da iş merkezi alanı eklenir; aday ve görüşme kapsamı pozisyondan alır.
8. (B) Personelde iş merkezi **zorunlu** (`NOT NULL`). Pozisyonda da zorunlu: VARSAYIM, aynı gerekçe.

## Sonuçları (bu kararların doğurduğu)
- Sunucu uygulamanın kaydını tablolardan kurar ve tablolara parçalar (tür başına eşleyici, `eslesme/<tur>.ts`). Uygulamanın
  gönderdiği ve sütunu olmayan alan **400 ile reddedilir** (sessizce düşmez). Uygulamaya her yeni alan bir göç ister.
- Kayıtların birbirine bağı sayı kimliğiyle (`no`, `GENERATED ALWAYS AS IDENTITY`) ve yabancı anahtarla kurulur; uygulamanın metin
  kimliği (`emp_x1y2`) `kimlik` sütununda tekil durur. Başka modüller `no` sütununa bağlanır (malzeme kartı kalıbı).
- Tutar `numeric(14,2)`, oran `numeric(7,4)`, tarih `date`, zaman `timestamptz`, saat `time`. Liste seçenekleri `CHECK` ile.
- Ekrana üç alan eklenir (K2 istisnası, kullanıcı kararı): personel kartında **TMI kullanıcısı** ve **İş merkezi** (zorunlu),
  pozisyon formunda **İş merkezi** (zorunlu). Excel aktarımında iş merkezi sütunu zorunlu olur (kod ya da ad ile eşleşir).
- İş merkezi kapsamı çekirdek kalıbıyla: `kisininKapsami(db, kisiId, kisininIzinliIsMerkezleri)` (DOĞRULANDI:
  `sunucu/cekirdek/kapsam.ts`, `sunucu/moduller/istasyonlar/disari.ts` "kisininIzinliIsMerkezleri"). İş merkezi olmayan kayıt
  herkesin kapsamındadır (çekirdek anlamı: `kapsamdaMi(kapsam, null) === true`).
- Uygulamanın ayarları (parametre dönemleri, vergi dilimleri, prim ve teşvik tanımları, tatiller, listeler) modülün kendi
  tablolarında kalır; Sistem Ayarları bugün yalnız boolean tutar (DOĞRULANDI: `paylasilan/ayar-tanimi.ts`).

## Tablolar
Ortak sütunlar (ana tablolarda): `no int GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, `kimlik text UNIQUE` (biçim kısıtlı),
`surum int`, `iptal boolean` (silme yerine), `olusturan_kisi_id`, `olusturma`, `guncelleyen_kisi_id`, `guncelleme`.
Alt tablolar ana tabloya `ON DELETE` olmadan bağlanır (ana kayıt silinmez); alt satırlar her yazmada ana kayıtla birlikte yenilenir.

### Personel
- **ik_personel** (57 alan): ad, soyad, tckn (`char(11)`, rakam), dogum_tarihi, dogum_yeri, cinsiyet, medeni_durum, cocuk_sayisi,
  kan_grubu, uyruk, engel_durumu, askerlik, egitim, okul, ehliyet, yabanci_dil, telefon, eposta, kisisel_eposta, il, ilce, adres,
  acil_kisi, acil_yakinlik, acil_telefon, sicil_no (tekil), departman_no → ik_departman, pozisyon, yaka_tipi, kademe,
  yonetici_no → ik_personel, ise_giris, deneme_bitis, sozlesme_turu, sozlesme_bitis, calisma_sekli, lokasyon, sgk_no, durum,
  brut_maas, yan_hak_tutar, yemek_yontem, yemek_hesap, yemek_deger, yol_yontem, yol_hesap, yol_deger, tesvik_kodu, bes_katilim,
  banka, iban (TR biçimi), onceki_kullanilan_izin, yan_haklar, cikis_tarihi, cikis_kodu, cikis_notu;
  **kisi_id → kisi (tekil: bir kullanıcı en çok bir personel)**, **is_merkezi_id → is_merkezi (NOT NULL)**.
- **ik_personel_ucret**: personel_no, yururluk (date), brut, neden, notu — tekil (personel_no, yururluk).
- **ik_personel_hareket**: personel_no, tarih, alan, eski, yeni, zaman.
- **ik_personel_belge**: personel_no, belge_adi, tamam, tarih — anahtar (personel_no, belge_adi).
- **ik_personel_notu**: personel_no, zaman, metin, yazan_kisi_id.
- **ik_personel_cikis_adimi**: personel_no, adim, tarih.
- **ik_personel_primi**: personel_no, prim_kodu, aktif, deger.
- **ik_departman**: ad, kod, gider_hesabi, yonetici_no → ik_personel, butce, aciklama.

### İzin ve devam
- **ik_izin**: personel_no, tur, baslangic, bitis (≥ baslangic), gun `numeric(5,1)`, durum, vekil_no, aciklama, talep_tarihi,
  karar_tarihi, karar_veren_kisi_id, karar_veren_personel_no, kaynak (İK / Çalışan).
- **ik_devam**: personel_no, tarih, tur, saat `numeric(5,2)`, onay, aciklama.

### Gelişim ve zimmet
- **ik_performans**: personel_no, donem, degerlendiren_no, tarih, hedefler, guclu, gelisim, aksiyon.
  **ik_performans_puani**: performans_no, kriter, puan (1–5).
- **ik_egitim**: ad, tur, kurum, durum, tarih, sure, maliyet, gecerlilik, aciklama. **ik_egitim_katilimcisi**: egitim_no, personel_no.
- **ik_zimmet**: personel_no, tur, marka, seri_no, verilis, iade (≥ verilis), deger, aciklama.

### İşe alım
- **ik_pozisyon** (30 alan): baslik, departman_no, adet, gerekce, yerine_no, talep_eden_no, sorumlu_no, durum, acilis, butce_notu,
  ucret_min, ucret_max (≥ min), ilan_baslik, lokasyon, calisma_sekli, calisma_turu, deneyim, egitim_seviye, ozet, sorumluluklar,
  nitelikler, tercih, yan_haklar, ucret_goster, son_basvuru, ilan_kodu (tekil), basvuru_eposta, basvuru_baglanti,
  mulakat_sorulari, aciklama, ozel_metin, **is_merkezi_id → is_merkezi (NOT NULL)**; gonderen_kisi_id, onaylayan_kisi_id, onaylama, dort_gozsuz_onay.
  **ik_pozisyon_yayini**: pozisyon_no, kanal_kodu, durum, yayin_tarihi, bitis, baglanti, notu.
- **ik_aday** (27 alan): ad, soyad, eposta, telefon, pozisyon_no, il, kaynak, referans_no, basvuru_tarihi, asama, kvkk_onayi,
  mevcut_sirket, mevcut_pozisyon, tecrube_yil, egitim, okul, yabanci_dil, cv_baglanti, ozet, maas_beklentisi, baslayabilir,
  teklif_ucret, teklif_tarihi, teklif_yanit, teklif_notu, red_nedeni, notlar, personel_no (işe alındıysa), ise_alim_tarihi, red_tarihi.
- **ik_gorusme**: aday_no, tur, tarih, saat (`time`), sure, sekil, yer, durum, oneri, guclu, zayif, notlar, degerlendirme_tarihi.
  **ik_gorusmeci**: gorusme_no, personel_no. **ik_gorusme_puani**: gorusme_no, kriter, puan.

### Bordro (yalnız kesinleştirmeyle yazılır)
- **ik_bordro**: personel_no, donem (`date`, ayın ilk günü), parametre_donemi_no; girdiler (brut, gun, ek, mesai_saat, tatil_saat,
  kesinti); hesap sonuçları, motorun döndürdüğü her alan bir sütun (DOĞRULANDI: motor.ts calcMonth dönüşü): aylik, brut_hakedis,
  mesai_ucreti, ucret, yemek_tutar, yemek_gv_istisnasi, yemek_sgk_istisnasi, yol_tutar, yol_gv_istisnasi, yol_sgk_istisnasi,
  yan_hak_toplami, toplam, sgk_matrahi, sgk_isci, issizlik_isci, engelli_indirimi, gv_matrahi, kumulatif_matrah_once,
  gv_hesaplanan, gv_istisnasi, gelir_vergisi, dv_hesaplanan, dv_istisnasi, damga_vergisi, bes, diger_kesinti, net, ayni_odeme,
  bankaya_odenecek, isveren_brut, tesvik_kodu, tesvik_indirimi, isveren_sgk, isveren_issizlik, maliyet, asgari_matrah;
  kesinlesme, kesinlestiren_kisi_id. Tekil (personel_no, donem).
- **ik_bordro_primi**: bordro_no, prim_kodu, tutar.

### Ayarlar
- **ik_genel_ayar** (tek satır): sirket_adi, cumartesi_is_gunu, deneme_suresi_ay, engelli_esik, engelli_oran, sirket_tanitim,
  kariyer_eposta, kariyer_sayfasi, ilan_lokasyon, kvkk_baglanti, ilan_yan_haklari, muhasebe hesap kodları, surum.
- **ik_resmi_tatil**: tarih (anahtar), ad.
- **ik_parametre_donemi**: ad, baslangic (ayın ilk günü, tekil), notu ve ~40 parametre sütunu (asgari ücret, SGK tavanı ve oranları,
  damga oranı, kıdem tavanı, mesai katsayıları, aylık ve haftalık saat, yıllık mesai sınırı, BES oranı, rapor kesintisi, engelli
  indirimleri, yemek ve yol kuralları, ihbar ve izin süreleri, yaş alt sınırı, varsayılan teşvik). Kilitli dönem tetikleyiciyle korunur.
- **ik_gelir_vergisi_dilimi**: donem_no, sira, ust_sinir (son dilimde boş), oran.
- **ik_prim_tanimi**: donem_no, kod, ad, tur, deger, siklik, aylar, atama, kideme_dahil.
- **ik_tesvik_tanimi**: donem_no, kod, ad, tur, deger, kanun_no.
- **ik_ozluk_belge_tanimi**: sira, ad. **ik_degerlendirme_kriteri**: kullanim (performans / mülakat), sira, ad.
- **ik_soru_seti**: kod, ad, kategori, odak. **ik_soru**: set_no, sira, metin.
- **ik_ilan_kanali**: kod, ad, adres, ek_kod, aktif.
- **ik_gorev_durumu**: anahtar, ertele, gizli, kisi_id. **ik_maliyet_plani** (tek satır) ve **ik_maliyet_plani_kadrosu**.

### Geçmiş
- **ik_kayit_gecmisi**: kayıt türü, kayıt kimliği, işlem, etiket, değişiklikler, silinen kaydın kopyası, kişi, zaman; yalnız eklenir.
  JSON sütunsuz şekli: **ik_kayit_gecmisi_alani** (gecmis_no, alan, onceki, sonraki — metin) ve silinen kaydın kopyası yerine
  alanlarının geçmişe satır olarak yazılması.

Toplam: 39 tablo (11 ana, 13 alt, 13 ayar, 2 geçmiş). Göç tek tanımdan üretildi (`sema.ts`); `sema.test.ts` ikisini bağlar.

## Kapsam (karar 6)
| Kayıt | İş merkezi nereden |
|---|---|
| Personel | kendi `is_merkezi_id` |
| İzin, devam, bordro, performans, zimmet, ücret, belge | bağlı olduğu personelin |
| Eğitim | katılımcılar kapsama göre süzülür; katılımcısı kapsamda olmayan eğitim listede görünmez |
| Departman, ayarlar | kapsamsız (hepsi görür) |
| Pozisyon | kendi `is_merkezi_id` |
| Aday, görüşme | bağlı olduğu pozisyonun |

Yazma: kapsam dışı iş merkezindeki kayda yazan `kapsamDisi()` (403, tek ileti). Okuma: süzgeç SQL'de (`kapsamSuzgeci`).
Çalışan ve yönetici ekranının kişi kapsamı (IK-21) kapsamdan bağımsız sürer.

## Başkasından istenen
- **kisiler**: personel kartındaki seçim listesi için `kisiSecenekleri(db): Promise<{ id, ad, sicilNo }[]>` (etkin kişiler; BASKA-MODUL-ISTEKLERI).
  v1'deki `kisiSicilNo` isteği geri çekildi.
- **istasyonlar**: `isMerkezleri(db, { pasiflerDahil })` ve `kisininIzinliIsMerkezleri(db, kisiId)` (var, DOĞRULANDI).
- **kisiler**: `kisiAdlari` (var). **ayarlar**: `sistemAyariOku(db, 'ik.dort-goz')`.

## Logo ve SMARTES uyumu
Yok (İK bu teslimin alan listelerinde değil). Bordro sütunları ayrıştığı için ileride Logo bordro aktarımı sütun eşlemesiyle kurulabilir.

## Açık sorular
Yok. Şema onaylanınca kodlamaya başlanır.

## Doğrulananlar
- `is_merkezi (id)`, `kisi_is_merkezi` ve kapsam kalıbı: `sunucu/gocler/20261006104042_istasyonlar_tesis.sql`, `sunucu/cekirdek/kapsam.ts` ("kapsamdaMi", "kisininKapsami").
- Uygulamanın her form alanının sütunu var (form tanımı ile `sema.ts` karşılaştırması, 10 tür "tamam"); örnek şirketin 247 kaydı hatasız ayrıştı.
- Gerçek TMI ile tarayıcıda: 34 personel ve bağlı kayıtlar yazıldı, iki ay bordrosu sunucuda kesinleşti, personel formunda iş merkezi ve TMI kullanıcısı seçimleri göründü ve kaydedildi, ayarlar kaydedilip geri okundu; konsol hatası yok.
