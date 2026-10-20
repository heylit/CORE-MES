# Kural ve test eşlemesi (finans, tam teslim)

Dosyalar: `sunucu/moduller/finans/kurallar.test.ts` (saf, 15), `para.test.ts` (gerçek PostgreSQL, 43), `firma.test.ts` (gerçek PostgreSQL, 17), `istemci/src/moduller/finans/FinansCercevesi.test.tsx` (9). Her satırdaki test hem izinli hem yasak durumu sınar. "Kısıt" sütunu veritabanının aynı kuralı tutan kısıt ya da tetikleyici adıdır (servis atlansa da reddeder).

| Kural | Kısıt / tetikleyici | Test (dosya: adın başı) |
|---|---|---|
| FNS-1 KDV oranı belge tarihinde geçerli; 0-100 | `finans_belge_kdv_orani`, `finans_kdv_orani_aralik` | kurallar: "FNS-1"; para: "FNS-1 (D-5)" |
| FNS-2 faturalıda firma zorunlu; faturasız yalnız izinli kategori | `finans_belge_firma_gerekli`, `finans_belge_faturasiz_kategori` | para: "FNS-2, FNS-11" |
| FNS-3 belge no en çok 16 | `finans_belge_no` | para: "FNS-3, FNS-34, FNS-37" |
| FNS-4 ISO para birimi; TRY kuru 1 | `finans_belge_para_birimi`, `finans_belge_kur` | para: "FNS-4, FNS-5, FNS-6" |
| FNS-5 KDV, tevkifat, toplam, TL karşılığı veritabanında | hesaplanan sütunlar | para: "FNS-4, FNS-5, FNS-6" |
| FNS-6 tevkifat pay/payda | `finans_belge_tevkifat` | para: "FNS-4, FNS-5, FNS-6" |
| FNS-7 dağıtım + mahsup belge toplamını aşamaz | tetikleyici `finans_dagilim_denetle` (`finans_dagilim_belge_asim`), `finans_mahsup_asim` | para: "FNS-7, FNS-8, FNS-17" |
| FNS-8 belge durumu sunucuda hesaplanır | `finans_belge_durumu_yaz` | para: "FNS-7, FNS-8, FNS-17"; "FNS-38, FNS-40" (gövdedeki durum yok sayılır) |
| FNS-9 kapanmış/kısmen kapanmış belgenin parasal alanı değişmez | `finans_belge_kapali_kilit` | kurallar: "FNS-9, FNS-10"; para: "FNS-9, FNS-39" |
| FNS-10 Logo'dan gelen/eşleşmiş belge elle değişmez | `finans_belge_logo_kilit` | kurallar: "FNS-9, FNS-10"; para: "FNS-10 (K-1)" |
| FNS-11 faturasız belge elle kaynaklı | `finans_belge_faturasiz_elle` | para: "FNS-2, FNS-11" |
| FNS-12 Logo kayıt no tekil (belge, ödeme, çek) | `finans_belge_logo_kayit_no_tekil`, `finans_odeme_logo_kayit_no_tekil`, `finans_cek_logo_kayit_no_tekil` | para: "FNS-12" |
| FNS-13 silme yok, iptal finans.yonet | `yalniz_ekleme` (silme), uç yetkisi | para: "yetki:", "FNS-13, FNS-14 (D-1)", "FNS-21" |
| FNS-14 belge iptali yalnız o belgenin dağıtım ve mahsubunu kaldırır | servis + `finans_dagilim_sonrasi` | para: "FNS-13, FNS-14 (D-1)", "FNS-14 (K-12)" |
| FNS-15 yöntem hesap türüyle uyumlu | `finans_odeme_hesap_turu`, `finans_odeme_hesap` | para: "peşin belge kapanır ..." |
| FNS-16 ödeme para birimi = hesap para birimi | `finans_odeme_hesap_para_birimi` | para: "peşin belge kapanır ..." |
| FNS-17 dağıtılmayan kısım avans | sorgu (kalan) | para: "FNS-7, FNS-8, FNS-17" |
| FNS-18 avans mahsubu, ödeme kalanını aşamaz | `finans_dagilim_odeme_asim` | para: "FNS-18 (D-2, K-13)" |
| FNS-19 aynı firma ve yön | `finans_dagilim_firma_yon` | para: "FNS-19" |
| FNS-20 çapraz kapatma, iki tutar ve kur; kur farkı bilgi | `finans_dagilim_ayni_para`, `finans_dagilim_denetle` | kurallar: "K-9"; para: "FNS-20 (K-9, K-11)" |
| B-008 çapraz kur günün kurundan en çok ayardaki pay kadar (varsayılan %20) sapar; o gün kur yoksa kaydın kendi kuru; ödenen = kapanan x kur | `caprazKurHatasi`, `finans_dagilim_capraz_kur_sinir`, `finans_dagilim_capraz_tutar` | kurallar: "B-008"; para: "B-008" |
| FNS-21 ödeme iptali dağıtımları kaldırır | servis | para: "FNS-21" |
| FNS-22 çek geçişleri | servis (`cekGecisiHatasi`) | kurallar: "FNS-22"; para: "FNS-22, FNS-23, FNS-24" |
| FNS-23 çek sonucu aynı para birimli banka hesabına | `finans_cek_hesap_uyumu`, `finans_cek_sonuc_hesap` | para: "FNS-22, FNS-23, FNS-24" |
| FNS-24 çekle kapanır, nakde tahsilde girer | `finans_hesap_bakiyesi` | para: "FNS-22, FNS-23, FNS-24" |
| FNS-25 karşılıksız çek tahsilatı iptal eder | servis | para: "FNS-25 (D-3)" |
| FNS-26 ciro ödeme doğurur | `finans_odeme_ciro_gider`, `finans_odeme_cek` | para: "FNS-26, FNS-54, FNS-27" |
| FNS-27 ciro edilmiş çek karşılıksız: iki ödeme iptal | servis | para: "FNS-26, FNS-54, FNS-27" |
| FNS-28 sonuçlanmış çek değişmez | `finans_cek_kilit` | para: "FNS-22, FNS-23, FNS-24" |
| FNS-29 hesap bakiyesi hesap başına | `finans_hesap_bakiyesi` | para: "FNS-29, FNS-31, FNS-32, FNS-59" |
| S-01 eşzamanlı eşitleme farkı kilitten sonraki bakiyeyle | servis | para: "S-01" |
| FNS-30 virman aynı para birimi, iki ayrı hesap | `finans_virman_para_birimi`, `finans_virman_farkli_hesap` | para: "FNS-30" |
| FNS-31 eşitleme yalnız eklenir | `finans_bakiye_esitleme_yalniz_ekleme` | para: "FNS-29, FNS-31, FNS-32, FNS-59" |
| FNS-32 pasif hesaba hareket yok; bakiyeli hesap pasife alınmaz | `finans_pasif_hesap` + servis | kurallar: "FNS-32, FNS-59"; para: "FNS-29, ..." |
| FNS-33 düzenli ödeme ödendi | servis | para: "FNS-33" |
| S-10 düzenli ödeme bir ayda bir kez (iptal edilen belge ayı boşaltır) | `finans_belge_duzenli_donem` + servis kilidi | para: "S-10" |
| B-003 KDV dahil tutardan net tam kuruşla; oluşamayan toplam reddedilir | `kdvDahildenNet` | kurallar: "B-003"; para: "B-003" |
| FNS-34 açılış belgesi kâr/zarara girmez; vadesi geçmiş olabilir | `finans_belge_vade` (açılış istisnası) | para: "FNS-3, FNS-34, FNS-37" (kâr/zarar dışı tutma ekranda: UYUM-BORCU) |
| FNS-35 dönemli bütçe | `finans_butce_tekil`, `finans_butce_ay_basi` | para: "FNS-35 (D-6)" |
| FNS-36 tevkifatın vergi ekranındaki yeri | ekranda | UYUM-BORCU |
| FNS-37 firma kendi tablosundan | yabancı anahtar | para: "FNS-3, FNS-34, FNS-37" |
| FNS-38 zaman ve kişi sunucudan | `finans_belge_acilis_degismez`, `finans_firma_acilis_degismez` | para: "FNS-38, FNS-40"; firma: "FNS-38" |
| FNS-39 sürüm denetimi | `surumluGuncelle` | para: "FNS-9, FNS-39", "FNS-13, FNS-14", "FNS-57", ayar testi; firma: "FNS-39" |
| FNS-40 tekrar korumalı komutlar | `tekrarKorumali` | para: "FNS-38, FNS-40"; firma: "FNS-40" |
| FNS-41 toplu aktarım ≤1000, tek işlem, denetime özet | `denetim: 'govdesiz'` | para: "FNS-41, FNS-50" |
| FNS-42 kullanıcı metni kaçırılır | prototip `esc()` | FinansCercevesi.test: "ayar betiği ..."; GUVENLIK-DENETIMI bölüm 4 |
| FNS-43..49, FNS-53, D-9 (firma) | firma göçü kısıtları | firma.test ve kurallar.test (firma teslimindeki KURAL-TEST ile aynı) |
| FNS-46 pasif firmaya yeni kayıt yok | `finans_pasif_firma` | para: "FNS-46" |
| FNS-50 toplu aktarımda firma tam eşleşir (İ/I duyarsız) | servis | kurallar: "FNS-50"; para: "FNS-41, FNS-50" |
| FNS-51 satış müşteriye, alış tedarikçiye | servis | kurallar: "FNS-51"; para: "FNS-51" |
| FNS-52 firma varsayılanı yeni belgeye öneri | ekranda | UYUM-BORCU |
| FNS-54 ciro durumundaki çekin ciro ödemesi vardır; ikinci ciro yok | `finans_odeme_ciro_tekil` | para: "FNS-26, FNS-54, FNS-27" |
| FNS-55 mahsup parasız kapatır | `finans_mahsup_denetle` | para: "FNS-55, FNS-56 (K-12)" |
| FNS-56 farklı para birimli mahsup | `finans_mahsup_ayni_para` | kurallar: "K-12"; para: "FNS-56" |
| B-009 dövizli mahsupta kur saklanır ve en çok ayardaki pay kadar sapar; göç dolu mahsup tablosunda durur | `finans_mahsup.capraz_kur`, `finans_mahsup_capraz_kur_sinir` | para: "B-009"; capraz-kur-goc |
| B-004 iptal nedeni açıklamayı ezmez | `odemeIptalYaz` (`iptal_nedeni`) | para: "B-004"; akis-d: "CEKIRDEK-ISTEKLERI 8: ödeme iptal nedeni" |
| FNS-62 siparişe yalnız iptal edilmemiş alış faturası, siparişin tedarikçisinin faturası bağlanır; bağlı faturanın firması değişmez | `siparisBagiHatasi`, `finans_belge_siparis_alis`, `finans_belge_siparis_butun`, `finans_belge_siparis` | akis-d: "FNS-62 (D6 b)" |
| FK1 çapraz kur payı ayardan okunur ve yönetimle değişir; gönderilmezse korunur | `ayarGuncelle` (`coalesce`), `finans_ayar_capraz_kur_payi` | akis-d: "CEKIRDEK-ISTEKLERI 8, FK1" |
| Akış D uçtan uca, göçün rolleriyle (muhasebe yazar, müdür okur, satın alma ve depo yalnız firma) | rol x işlem göçü (kart #223) | akis-d: "muhasebe akışı yürütür", "satın alma ve depo firma kartında kalır" |
| FNS-57 kur tablosu | `finans_kur_tekil`, `finans_kur_para_birimi` | para: "FNS-57 (K-10)" (değerlemede kullanımı ekranda) |
| FNS-58 kur farkı gelir tablosuna yalnız kategoriden | `finans_belge_kategori` | ekranda (gelir tablosu); UYUM-BORCU |
| FNS-59 hareketli hesabın açılışı değişmez | servis | kurallar: "FNS-32, FNS-59"; para: "FNS-29, ..." |
| FNS-60 alınacak ya da verilecek ödeme kalan firma pasife alınmaz; neden yazılır, tutar yalnız rakam yetkisi olana (FNS-48) | servis + `finans_aktif_firma` paylaşımlı kilidi (eşzamanlı yeni kayıt) | kurallar: "FNS-60, FNS-48"; para: "FNS-60" |
| FNS-61 düzeltme ve iptal deftere değişen alanın önceki ve yeni değerini ek olarak bırakır; değişmeyen alan, sürüm ve kayıt zamanı yazılmaz; reddedilen komut defter satırı bırakmaz | çekirdek `denetimEki` (eki yazılamayan komut geri alınır) | kurallar: "FNS-61"; para: dört "FNS-61" testi |
| Yetki matrisi | `uc()` | para: "yetki:"; firma: iki "yetki:" testi |
| FNS-63 faturası bağlanmış siparişin ödeme planı değişmez | servis (`siparisFaturasiVarMi`) | kurallar: "FNS-63, FNS-64"; satın alma: "SAT-73 SAT-74 FNS-63 FNS-64 #1124" |
| FNS-64 plan en çok 12 satır, avans vadeliden önce; tutar > 0, yöntem listesi | `finans_siparis_odemesi_sira`, `_tutar`, `_yontem`; kurallar `siparisOdemePlaniHatasi` | kurallar: "FNS-63, FNS-64"; satın alma: "SAT-73 SAT-74 FNS-63 FNS-64 #1124" |
| FNS-65 genel gider saat başı = aylık gider / aylık makine saati, dört ondalık; saat sıfırsa oran yok (null); o güne geçerli son satır, aynı güne sonra girilen geçerli; satır değişmez ve silinmez | `finans_genel_gider_orani_gider`, `_saat`, `_olusturan`; `yalniz_ekleme()` tetikleyicileri; kurallar `genelGiderSaatBasi` | genel-gider: "FNS-65", "göç:", "disari.genelGiderOrani" |
| FNS-66 satış faturası yalnız onaylı ya da kapanmış, müşterisi aynı firma olan siparişe bağlanır; sevk yalnız siparişle; bağlı faturanın firması değişmez | `satisBagiHatasi`, `finans_belge_satis_bagi`, `finans_belge_sevk_siparisli`, `finans_belge_satis_siparisi`, `finans_belge_sevk` | kurallar: "FNS-66"; satis-bagi: "göç:", "FNS-66" |
| FNS-68 faturaya iptal edilmemiş teslimat sevki bağlanır; sevkin bilinen müşterisi ve siparişi faturanınkidir (Sevkiyat bilmediğini null verir) | `sevkBagiHatasi`, kablolama "sevk işi özeti -> finans satış faturası" | kurallar: "FNS-68"; satis-bagi: "FNS-68" |
| FNS-67 iade asıl faturanın ters yönünde, aynı firma ve para biriminde; sipariş ve sevk asıldan; iadeler toplamı asılı geçmez (ekleme ve düzeltme); iadesi olan fatura iptal edilmez | `iadeHatasi`, `iadeAsimi`, `finans_belge_iade`, `finans_belge_iade_kendisi`, `finans_belge_kategori` | kurallar: "FNS-67"; satis-bagi: "FNS-67", "disari.siparisFaturalari" |
