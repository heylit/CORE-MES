# FARK: idari-isler (İdari İşler 1)

Taban: `main` 6485349. Yeni modül; depoda önceki hâli yok. Başvuru: onaylı taslak (İdari İşler; Bugün, Talepler, Talep aç). Kapsam belgesi
`arastirma/idari-guvenlik/2026-10-19-idari-isler-ve-nizamiye-onerisi.md` (188 a, 190 a). Bu PR 1. parçadır: tesis talepleri ve Bugün.
Periyodik kontroller (yasal kontrol, sözleşme, atık) 2. parçadır. Zimmet, yemek, filo ve personel servisi bu adımda yok.

Eklenen:
- Göç `sunucu/gocler/20261019101500_idari_isler_tablolar.sql`: `idari_isler_talep`, `idari_isler_numara_sayaci`. Yeni ve boş tablolar.
- Sunucu `sunucu/moduller/idari-isler/` (uclar, servis, kurallar, sorgular, testler).
- Paylaşılan: `paylasilan/sozlesme/idari-isler.ts`, `paylasilan/islemler/idari-isler.ts`, `paylasilan/sayfalar/idari-isler.ts` (sayfa ve ikinci menü).
- İstemci `istemci/src/moduller/idari-isler/`: Bugün (kök), Tesis talepleri panosu, Talep aç, Taleplerim.
- Toplayıcı satırları (ayrı commit): `paylasilan/islemler.ts`, `paylasilan/sayfalar.ts`, `paylasilan/islem-adlari.ts`.

Taslaktan farklar (VARSAYIM, geri alması ucuz):
- Panodaki dört kademeli öncelik yerine talep açmadaki iki kademe (Normal, Acil: iş duruyor) kullanıldı; sıralama acil, sonra eski.
- Yer serbest metindir (en çok 120); QR okutulan etiketin metni yer olur. Fabrika haritası alanına bağ 2. aşamada.
- Fotoğraf ekleme ve bildirim yok; talep sahibi durumu Taleplerim'de görür (menü sayacı).
- Geri al yalnız üstlenmede (bırak). Kapatma ve red geri alınmaz.
- Damla, termometre, kamera simgeleri ortak sette yok; yakın simge kullanıldı (Çekirdek isteği).

Değişen onaylı karar: yok. Silinen: yok. Rol x işlem satırı yok (216 a; Çekirdek 101700 göçüyle).

2. parça (periyodik kontroller, 188 a, 190 a): göç `sunucu/gocler/20261019102000_idari_isler_kontroller.sql`: `idari_isler_kontrol`,
`idari_isler_kontrol_kaydi` (yalnız eklenir). Yeni ve boş tablolar. Ekran "Periyodik kontroller" (ikinci menüde, `idari-isler.oku`); Bugün'e
süresi geçen ve 7 gün içindeki kalemler düşer. Yazma `idari-isler.kontrol-yaz` (1. parçada kayıtlı). Firma seçimi musteri-tedarikci
`disari.ts` (`firmaAra`, `firmaAdlari`, `firmaVarMi`) ile, yalnız etkin tedarikçi ve iki yönlü firmalar.

Taslaktan farklar (VARSAYIM, geri alması ucuz):
- Sözleşme kartında "Yenile / bitir" ikiye ayrıldı: kartta "Yenilendi" (yeni bitiş tarihi girilir), ayrıntıda "Bitir".
- Atık birimi sabit liste (kg, ton, lt, m3, adet); birim tanımları bağlamada Malzemeler'den.
- Kayıt (yapıldı, teslim, yenileme) değiştirilemez ve silinmez; yanlış kayıt yeni kayıtla düzeltilir.
- Rapor dosyası eklenmez; belge (rapor ya da form) numarası yazılır.

3. parça (yemek sayısı, 171 a): göç `sunucu/gocler/20261019104000_idari_isler_yemek.sql`: `idari_isler_yemek_bildirimi` (yalnız eklenir).
Yeni ve boş tablo. Ekran "Yemek sayısı" (ikinci menüde, `idari-isler.oku`); Bugün'de kısayol. Bildirme yeni işlem `idari-isler.yemek-yaz`
(rol satırı 256 a ile yalnız idari_isler, Çekirdek göçü 20261019115000). Kadro Vardiya `disari.ts` (`vardiyaKadrosu`, `basladigiGunTakvimleri`), izinli İK `disari.ts` (`izinliKisiler`) ile.

Taslaktan farklar (VARSAYIM, geri alması ucuz):
- Fazla mesai İK'dan (`gununFazlaMesaisi`, onay bekleyen kayıt da sayılır, izinde görünen sayılmaz); ziyaretçi sayısı elle girilir, Nizamiye'de günlük sayı veren uç yok (istek yazıldı).
- Kadro yalnız vardiya kadrosundaki (istasyona atanmış) ve o gün vardiyası başlayan kişilerdir; ofis personeli düzeltmeyle eklenir.
- İzinli yalnız kadrodakilerden sayılır.
- Bildirim bugün ve sonraki 7 gün için yapılır; geçmiş güne yazılmaz. Yeni bildirim öncekinin yerine geçer, eski kayıt kalır.
- Ekranın gördüğü kadro ya da izinli bildirim anında değişmişse bildirim reddedilir ve sayılar yenilenir.

4. parça (filo araç kartı, 172 a): göç `sunucu/gocler/20261019106000_idari_isler_arac.sql`: `idari_isler_arac`. Yeni ve boş tablo.
Ekran "Filo" (ikinci menüde, `idari-isler.oku`); Bugün'de kısayol, sayı kartı ve uyarılı araçlar. Yazma yeni işlem `idari-isler.filo-yaz`
(rol satırı onaya bağlı). Sevkiyat'ın `sevkiyat_araci` tablosuna dokunulmadı; bağ bağlamada plaka ile.

Taslaktan farklar (VARSAYIM, geri alması ucuz):
- Görev talebi ("Araç talebi") ve masraf ("Masraf gir") bu parçada yok; sonraki iki parçada gelir.
- Durum elle seçilir (görevde dahil); görev talebi gelince "görevde" görevden yazılır.
- Plaka "34 ABC 123" biçimine çevrilir, il kodu 01-81; plaka tekildir, pasif araç da plakasını tutar.
- Km geriye yazılmaz.
- Uyarı: muayene ve sigorta 30 gün kala, bakım 1.000 km kala; pasif araçta uyarı yok. Bugün'e 7 gün kala ve geçmişte düşer.

5. parça (araç görev talebi, 247 a): göç `sunucu/gocler/20261019106500_idari_isler_arac_gorevi.sql`: `idari_isler_arac_gorevi`. Yeni ve boş tablo.
Ekranlar "Araç görevleri" (`idari-isler.oku`; onay, red, çıkış ve dönüş km'si `idari-isler.filo-yaz`) ve "Araç talebim" (yeni işlem
`idari-isler.arac-talebi-ac`, her çalışan). Görev aracın km'sini ve durumunu yazar (çıkışta görevde, dönüşte müsait).

Taslaktan farklar (VARSAYIM, geri alması ucuz):
- Planlama gün düzeyinde (gidiş ve dönüş tarihi); saat, yolcu ve yük açıklamaya yazılır.
- Onaylı görev araç çıkmadan reddedilir ya da geri çekilir; yoldaki görev yalnız dönüşle kapanır.
- Talep numarası yok; görev listede varış, tarih ve talep edenle tanınır.
- Bugün ekranına düşmez; onay bekleyen sayısı menü sayacındadır.

6. parça (araç masrafı, 172 a): göç `sunucu/gocler/20261019109500_idari_isler_arac_masrafi.sql`: `idari_isler_arac_masrafi`. Yeni ve boş tablo.
Filo satırında "masraflar" düğmesi yan pencere açar: liste ve bu yılın toplamı (`idari-isler.oku`), giriş ve iptal (`idari-isler.filo-yaz`).
Yeni işlem yok.

Taslaktan farklar (VARSAYIM, geri alması ucuz):
- Kayıt düzeltilmez; yanlış kayıt gerekçeyle iptal edilir, listede kalır, toplama girmez.
- Tutar TL; KDV ayrımı ve döviz yok. Proje ve finans bağı bağlamada.
- Ayrı "Masraf gir" menü maddesi yok; giriş araç satırından.
- Belge (fiş, fatura) dosyası eklenmez; belge no yazılır.

7. parça (demirbaş ve zimmet, 170 a, 244 a): göç `sunucu/gocler/20261019110000_idari_isler_demirbas_zimmet.sql`: `idari_isler_demirbas`,
`idari_isler_zimmet` (yeni, boş) ve kopya işlevi; göç `20261019110500_idari_isler_zimmet_ik_kopyasi.sql`: `ik_zimmet` kayıtlarının kopyası
(dolu tablo göçü, 244 a onaylı; `ik_zimmet`'e dokunmaz). Ekran "Demirbaş ve zimmet" (`idari-isler.oku`); kayıt, zimmetleme, iade ve kişiye
bağlama yeni işlem `idari-isler.zimmet-yaz` (rol satırı onaya bağlı). `disari.ts`: `kisilerinAcikZimmetleri` (İK çıkış uyarısı için).

Taslaktan farklar (VARSAYIM, geri alması ucuz):
- Demirbaş numarası kayıt numarasından türetilir (DB-00001); ayrı numara sayacı yok. Seri no tekil değildir (İK'da tekrarlı olabilir).
- İK'daki her kayıt ayrı demirbaş olur; aynı eşyanın iki İK kaydı iki demirbaş olarak gelir.
- Kişiye bağlanmamış personelin zimmeti adla gelir, ekranda uyarıyla görünür, kişiye bağlanır (koordinatör kararı, 244).
- Zimmet formu yazdırma, demirbaş etiketi, kişi odaklı ekran ve "Zimmetlerim" bu parçada yok.
