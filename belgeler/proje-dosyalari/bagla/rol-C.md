# Akış C (Tedarik): rol x işlem önerisi

ONAYLANDI (kullanıcı, RC1, 09.10.2026 04:31), şu değişiklik ve koşullarla:
- Ek satır R13: bakim rolüne `sayfa.stok` (yalnız okuma). Bakıma `stok.cikis` verilmez; malzemeyi depo çıkarır.
- Roller modül modül girer, o modülün "kullanıma açmadan önce" borçları kapandıktan sonra:
  - stok (R4, R5, R6, R13): tekrar koruması, toplama kapatma denetimi (ST4) ve okuma yetkisi (#365) birleştikten sonra;
  - finans (R8-R12): kayıt formlarının tarayıcıda kaydettiği gösterildikten sonra;
  - satın alma (R1-R3): firma bağı finansa bağlandıktan sonra.
- Her göçten önce o modülün satırları ve kapanan borç maddeleri tek mesajda kullanıcıya gösterilir; "gir" demeden göç girmez.
- Talep açma ana sayfaya taşınıyor (ayrı karar, satın alma ve ortak arayüz konuları listeler); R1 ve R2'deki "talep yalnız satın alma ve müdürde" varsayımı o kararla değişebilir.

Onayınızdan önce göç yazılmaz (CK1 a). Onaylanan satırlar tek göçle girer; göç önce var olan satırları sayar ve bildirir.
Yönetici rolü bütün işlemleri bayrakla taşır, tabloda yoktur.

Güncelleme (09.10.2026): stok satırları stok konusunun kendi önerisine göre birleştirildi (depo: mal kabul, çıkış, taşıma, sayım, toplama; müdür: ek olarak geri alma ve raf/konum tanımı; planlama: yalnız toplama; kalite, satın alma, muhasebe: yalnız okur; operatör, CAM, bakım: görmez). Önceki sürümdeki "kalite: stok.sayim" ve "bütün rollere sayfa.stok" düştü. Yeni satır sayısı 11.

Kaynaklar: `paylasilan/islemler/{satin-alma,stok,finans,malzemeler}.ts`; finans önerisi `finans/CEKIRDEK-ISTEKLERI.md` bölüm 5; stok önerisi `stok/BASKA-MODUL-ISTEKLERI.md` (K3); satın alma önerisi `satin-alma/UYUM-BORCU.md` 6 (teslimin matrisi: satın alma, müdür, muhasebe; depoda işlem yok). Bugünkü satırlar geliştirme veritabanından okundu (DOĞRULANDI, origin/main c73e2d4).

## Bugün verili olanlar (değişmez)

| İşlem | Roller |
|---|---|
| sayfa.malzemeler | planlama_proje, operator, mudur, kalite, satin_alma, cam, depo |
| malzemeler.yaz | planlama_proje, mudur, kalite, satin_alma, cam, depo |
| malzemeler.onayla | mudur, kalite |
| malzemeler.tanim-yaz | planlama_proje, mudur |
| sayfa.stok | planlama_proje, mudur, kalite, satin_alma, muhasebe_finans, depo |

## Önerilen yeni satırlar

| # | Rol | Eklenecek işlemler | Kaynak | Not |
|---|---|---|---|---|
| R1 | satin_alma | sayfa.satin-alma, satin-alma.oku, satin-alma.talep-ac, satin-alma.yaz, satin-alma.ayar | satın alma teslimi | satın almacı seti |
| R2 | mudur | sayfa.satin-alma, satin-alma.oku, satin-alma.talep-ac, satin-alma.onayla | satın alma teslimi | onay seti; dört göz kuralı sunucuda (SAT-30) |
| R3 | muhasebe_finans | sayfa.satin-alma, satin-alma.oku | VARSAYIM: teslim muhasebeyi matriste sayıyor, hangi işlemle olduğunu yazmıyor; en dar olanı önerdim |  |
| R4 | depo | sayfa.stok (zaten var), stok.giris, stok.cikis, stok.transfer, stok.sayim, stok.toplama | stok K3; stok.toplama ST4 | ST4: toplamayı başlatan ya da stok.toplama taşıyan başkası kapatır |
| R5 | planlama_proje | stok.toplama | stok konusunun önerisi (09.10.2026) | planlama yalnız toplama yapar |
| R6 | mudur | stok.giris, stok.cikis, stok.transfer, stok.sayim, stok.tanim, stok.geri-al, stok.toplama | stok K3; stok.toplama VARSAYIM |  |
| R7 | (satır yok) | operator, cam, bakim stoğu görmez; sayfa.stok verilmez | stok konusunun önerisi | kalite, satin_alma, muhasebe_finans yalnız okur: bugünkü sayfa.stok yeter. insan_kaynaklari, idari_isler öneride yok, görmez (VARSAYIM). Stok okuma uçları PR #365 ile `sayfa.stok` ya da bir stok işlemi ister; #365 birleşince görmeyen rol API'den de okuyamaz |
| R8 | muhasebe_finans | sayfa.finans, finans.oku, finans.yaz, finans.yonet, finans.firma-oku, finans.firma-yaz | finans bölüm 5 |  |
| R9 | mudur | sayfa.finans, finans.oku, finans.firma-oku | finans bölüm 5 |  |
| R10 | satin_alma | sayfa.finans, finans.firma-oku, finans.firma-yaz | finans bölüm 5 | tedarikçi firma kartını açabilsin diye (C1) |
| R11 | planlama_proje | sayfa.finans, finans.firma-oku, finans.firma-yaz | finans bölüm 5 | müşteri firma kartı |
| R12 | depo | finans.firma-oku | finans bölüm 5 | mal kabulde tedarikçi adı; sayfa.finans yok |
| R13 | bakim | sayfa.stok | kullanıcı kararı RC1 | yalnız okuma |

Bakım rolüne `stok.cikis` verilmez (kullanıcı kararı RC1).

Talep açma (`satin-alma.talep-ac`) bugün yalnız satın alma ve müdürde önerildi; teslim notu "satın alma ve müdür talebi içeriden açar" diyor (`satin-alma/NOTLAR.md:7`). Başka rollerin (planlama, CAM, bakım, kalite, depo) kendi talebini açması ayrı karardır.

Geri alma: satırları silen göç; veri kaybı yok, yalnız erişim geri çekilir.
