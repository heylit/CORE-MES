# ORTAKLIK: nizamiye

| Kavram | Sahibi | Nizamiye'de | Bağlanınca okunacak yer |
|---|---|---|---|
| Kişi (ev sahibi, görevli) | kisiler (`kisi`) | `nizamiye_ziyaret.ev_sahibi_kisi_id`, `giren_kisi_id`, `cikaran_kisi_id`, `iptal_eden_kisi_id`, `olusturan_kisi_id` (FK `kisi`); ad `kisiAdlari` ile | kisiler `disari.ts` |
| Firma | musteri-tedarikci | `nizamiye_ziyaret.firma_adi` serbest metin (ziyaretçi firması her zaman müşteri ya da tedarikçi değil) | Aşama 2'de sorulur: firma kaydına bağ |
| Belge no | ayarlar (numara sayacı) | `nizamiye_ziyaret.ziyaret_no`, ayar `nizamiye.ziyaret-no` | aynı |
| Geçici kart | nizamiye (`nizamiye_kart`: kart_no, tur, izinli_bolge, durum) | sahibi; İK zimmetinden ayrı | İK işten çıkış kontrolü okuyacak |
| Cihaz (kart okuyucu) | nizamiye (`nizamiye_pdks_cihaz`: ad, ip) | sahibi; istasyon değil | Aşama 2'de sorulur: ortak cihaz listesi |
| Personel kartı (1326, 1327 a) | nizamiye (`nizamiye_personel_kart`: kisi_id, kart_ozeti, kart_son4) | sahibi; tek kaynak (oturum kart girişi okur, PDKS ileride okuyabilir) | oturum kart girişi nizamiye `disari.ts` ile okur |
| Durum listeleri | nizamiye | ziyaret `beklenen/iceride/cikti/iptal`; kart `bos/kayip/hasarli` (+ türetilen `kullanimda`) | - |
| Personel varlığı | nizamiye (`nizamiye_pdks_hareket`: kisi_id, zaman, yon; `nizamiye_pdks_aktarim`; kart okuyucudan `nizamiye_pdks_cihaz_hareket`, `nizamiye_pdks_gonderim`) | PDKS dosyasından ve kart okuyucudan; sicil no `kisi.sicil_no` ile | İK mesai hesabı okuyabilir; sahiplik Aşama 2 |

Dışa açık: `disari.ts` → `yemegeKalanZiyaretci(db, tarih)` (İdari İşler yemek sayısı; `nizamiye_ziyaret.ogle_yemegi`); `personelKartSahibi(db, kartNo)` (oturum, istasyonda kart + PIN girişi; kayıtsız ya da biçimsiz kart null).
