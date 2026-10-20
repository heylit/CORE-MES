# Başka modül istekleri: logo (kart #207)

Kullanılan işlevler var: `logoyaGidecekMalzemeler`, `malzemeLogoSonucu`, `LogoyaGidecekMalzeme`, `MalzemeLogoSonucu`. Bu iş malzemelere yazmaz
(kullanıcı kararı 08.10.2026); aşağıdakiler malzemeler yazarına imzalı istektir.

## satın alma (Logo siparişi, #205 karar 1; istek 12.10.2026 satın alma konusuna iletildi)
1. Göç (boş olabilen sütunlar, satır değişmez): `satin_alma_siparis.id int GENERATED ALWAYS AS IDENTITY UNIQUE` (`logo_giden.belge_no` int);
   `logo_kayit_no`, `logo_gonderim_durumu` (`bekliyor|gonderildi|hata`), `logo_hata` (<= 2000), `logo_gonderim_zamani`, `logo_iptal_durumu`;
   `satin_alma_siparis_satiri.logo_satir_ref`. Kısıt: `gonderildi` ise kayıt no dolu.
2. Kural: sipariş `siparis_verildi` olunca `bekliyor` (S1 a). Logo'ya gitmiş siparişin tedarikçisi ve para birimi değişmez;
   satır, miktar ve fiyat düzenlemesi Logo'ya gider (S2 b, madde 5). Gitmiş sipariş iptal edilince `logo_iptal_durumu = 'bekliyor'`.
3. `disari.ts` (tipler `logo/servis.ts` `SatinAlmaKaynagi` ile aynı): `logoyaGidecekSiparisler(db, sinir)`, `siparisLogoSonucu(db, id, sonuc)`,
   `logoyaIptalGidecekSiparisler(db, sinir)`, `siparisLogoIptalSonucu(db, id, sonuc)`. Satırda `stokKodu` malzemeler kartından; karta bağlı değilse `null`.
4. Ekran: sipariş satırında Logo durumu rozeti (bekliyor / gönderildi + kayıt no / hata metni); düzen değişmez.
5. Kart #777 genişlemesi (S2 b, S3 b; tipler `logo/servis.ts` `SatinAlmaKaynagi`): Logo'ya gitmiş siparişin düzenlemesi kilitlenmez, düzenleme kuyruğa düşer
   (`guncellemeGidecekler`, `guncellemeSonucu`; kaldırılan satırların Logo kayıtları listesiyle); satır kapatma (`kapatmaGidecekler`, `kapatmaSonucu`);
   onaylı talep Logo talep fişi olur (`talep.logo_kayit_no`, `talep_satiri.logo_satir_ref`; `talepGidecekler`, `talepSonucu`); siparişe bağlanan talep
   kalemi karşılama olur (`siparis_satiri.logo_karsilama_ref`; `karsilamaGidecekler`, `karsilamaSonucu`). Düzenleme sonucu yeni satır kayıtlarını getirir.

## malzemeler (kart #232, kullanıcı kararı LB9 a, LB2 a, LB7 a)
Durum: malzemeler PR #348 ile karşılandı (ana dalda); logo `birimSetiKaldir` artık `logoBirimSetiKullaniliyorMu` kullanıyor.

1. İzinli liste denetimi, sunucu: karşılık kaydında (`POST /malzeme-logo-karsiliklari/kaydet`)
   - tür karşılığı yalnız `10, 11, 12, 13` (hammadde, yarı mamul, mamul, sarf); demirbaş (`4`) şimdilik gönderilmez, karşılığı boş kalır ve kart "eksik" görünür (LB2 a);
   - birim karşılığı yalnız `GET /api/logo/birim-setleri` cevabında `gecerli: true` olan kod. Malzemeler sunucusu bu listeyi logo'dan okuyamaz
     (bağımlılık yönü logo -> malzemeler, ADR 0006); önerilen: denetim istemcide seçimle, sunucuda biçimle (boşluksuz, en çok 40). Gönderimde
     listede olmayan kod logo tarafında "hata: Geçersiz karşılık: birim seti X Logo birim seti listesinde yok." olur (bu işte yazıldı, test LGB-10).
2. LB7 kısıtı: karşılık tablosuna göç (`CHECK`); var olan veri kısıtı bozuyorsa göç durur ve bozan satırları listeler, veriyi değiştirmez.
3. "Logo gönderimi" sayfası: karşılık penceresinde serbest metin yerine seçim (tür: dört sabit; birim: `GET /api/logo/birim-setleri`),
   listede olmayan kayıtlı karşılık "geçersiz" rozetiyle görünür. Sayfanın düzeni değişmez.
4. Kullanım işlevi (`disari.ts`): `logoBirimSetiKullaniliyorMu(db, kod): Promise<boolean>`, bütün birim karşılıklarına bakar. Bugün logo yalnız
   kuyruktaki kartların karşılığına bakıyor (UYUM-BORCU 7).
5. Karşılandı, `isler.ts`'e bağlı (ayar `logo.malzeme-guncelleme-gonderimi`). Ad güncellemesi (kart #777 S4 b): Logo'ya gitmiş kartın adı değişince kuyruğa düşer; `disari.ts` `logoyaGuncellemeGidecekMalzemeler(db, sinir)` ve
   `malzemeLogoGuncellemeSonucu(db, no, { ad } & ({ tamam: true } | { hata }))` (gönderilen ad; kart bu arada değiştiyse bekliyor kalır) (tipler `logo/servis.ts` `MalzemeGuncellemeKaynagi`). Kod, tür, birim kilitli kalır.

## portal (satış teklifi ve siparişi, kart #777; istek 12.10.2026 portal oturumuna iletildi, imzalar ilke olarak kabul)
1. `disari.ts` (tipler `logo/servis.ts` `SatisKaynagi`): `logoyaGidecekSatisTeklifleri(db, sinir)` (`requests/*`, sürüm gönderilince ya da kabulde),
   `satisTeklifiLogoSonucu(db, id, { kayitNo, satirlar } | { hata })`, `logoyaGidecekSatisSiparisleri(db, sinir)` (`orders/*` `type:'sales'`, 'open';
   `teklifKayitNo` ve satırda `teklifSatirRef`), `satisSiparisiLogoSonucu(db, id, ...)`. Miktar ve fiyat metin (ondalık).
2. Sonuç alanları belge içinde (jsonb): Logo kayıt no, durum, hata (<= 2000), satır ref. Firma finans firmasına bağlı değilse kuyruğa girmez.
3. Teklifsiz satış siparişi önce teklif kuyruğuna girer (siparişin kendi teklif alanlarıyla), teklif Logo'ya gidince sipariş kuyruğuna.

## stok / üretim emirleri (sarf ve üretimden giriş fişi; karşılandı, 335)
Karşılandı: stok `emirMalzemeFisleri` (#2138), üretim emirleri `emirHurdalari` (#2140) ve `emirNolari`, emir bitti olayı `emirBittiDinle`. Kuyruk logonundur
(`logo_malzeme_fisi_giden`); sahiplerden yalnız okunur, sonuç onlara yazılmaz. Fiş Logo'ya gittikten sonra değişmez; düzeltme ayrı fiştir (yazılmadı).
