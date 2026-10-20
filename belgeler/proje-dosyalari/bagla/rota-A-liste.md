# Rota: A akisinda uretim emirlerini beklemeyen borclar (BO1 a)

Kaynak: ana dal `c73e2d4`, `bagla/HAZIRLIK.md` (A akisi), `sunucu/moduller/rota/UYUM-BORCU.md`, `bagla/malzemeler-tur1.md`.
Kart: #260 (acik). Dal onerisi: `260-rota-bagla-a` (yeni, ana daldan). Kullanici "yaz" demeden dal acilmaz, commit atilmaz.
Isaretler: [G] goc, [G-DOLU] var olan tabloya kisit ya da degisiklik (onay ayrica sorulur), [EKRAN] ekrana dokunur, [Y] rol x islem (kullanici onayi).

| No | Madde | Neden UE'yi beklemiyor | Goc | Bekledigi |
|---|---|---|---|---|
| R1 | Operasyon katalogu gecici eslemi kalkar (B1, A4): `baglanti.ts` `operasyonKatalogu` silinir, servis `istasyonlar/disari.ts` `operasyonTipleri`'ni dogrudan okur (kisaltma, varsayilan ayar/birim suresi, varsayilan istasyon katalogdan) | Katalog alanlari ana dalda (DOGRULANDI `paylasilan/sozlesme/istasyonlar.ts:173-183`, #324) | [G-DOLU] `rota_adimi.operasyon_tipi_id` -> `istasyonlar_operasyon_tipi(id)` FK; once var olan satirlar dogrulanir | yok |
| R2 | Operasyonlar bolumu katalogu dogru semayla okur, yazmada surum gonderir (B14) | R1 ile ayni sozlesme | yok | R1; [EKRAN] |
| R3 | Kisi istasyonu gecici karsiligi kalkar (B2): `istasyonKisileri` -> `istasyonKisiAtamalari`; secim kurali (en buyuk yuzde) rotada kalir (IR5 b) | Fonksiyon ana dalda (DOGRULANDI `istasyonlar/disari.ts:67`) | yok | yok. Plan'daki ayni kopya (P-B4) B akisinda |
| R4 | Kaynaklar bolumu istasyonlar guncelleme uclarina surum gonderir (B13, 400 kapanir) | Yalniz istemci ve istasyonlar sozlesmesi | yok | [EKRAN]; okuma 403'u R10'a bagli |
| R5 | Eski surum iletisi cekirdegin `eskiSurum()`'u (B12) | Rota ici | yok | yok |
| R6 | Tetikleyici fonksiyon adlari `rotalar_*` -> `rota_*` (B18) | Rota ici | [G] ad degisikligi; veri degismez | yok |
| R7 | Malzeme secicisi ve arama (B3, A1): `baglanti.ts` `malzemeAra` kalkar, malzemelerin tek imzali `malzemeAra`'si okunur; test teslimdeki haline doner | UE degil, malzemeler M2 (C akisi tur 1) | yok | malzemeler M2 |
| R8 | Birim gosterimi (B5): kart birimi `malzemeOzeti`/`malzemeOzetleri`'nden | UE degil, malzemeler M1 | yok | malzemeler M1; [EKRAN] |
| R9 | `(no, tur)` tekili + rota bilesik FK (B4, A5); `malzeme_turu` kopyasi dogrulanir | UE degil | [G-DOLU] iki goc: malzemelerde tekil (malzemeler isi), rotada bilesik FK | malzemeler tekili |
| R10 | Rol satirlari: okuma uclari `yetki: { biri: [...] }` (B11), rol x islem (B8, B21) | Rota ici | [G] rol satirlari | [Y] kullanici onayi, ortak matristen |
| R11 | Kaldir dugmeleri simge (B20) | Rota ici | yok | [EKRAN] gorunum turu |

Rota disinda ama rotanin karariyla (RT1 a) acilan madde:
- A6 / B16: malzemelerdeki `kayit.bom[]`, `kayit.ops[]` ve `OPS` sabitleri kalkar. Is malzemelerin; [G-DOLU] JSONB. Not: rota bugun malzemeler `disari.ts`'ini ithal ediyor; malzemeler sunucuda rotayi ithal ederse dongu olur (ADR 0006). Malzeme kartinda recete gosterimi ekranda birlestirilir (VARSAYIM, geri alma: ekran).

UE'yi ya da olmayan modulu bekleyenler (bu listede yok):
- B6 emre kopyalama (`uretimEmriAc`) [UE]; B9 bolumlerdeki emir ve plan verisi [UE]/plan; B17 vardiya uclari (personel-vardiya modulu yok); B15 bolumler RT3 a ile teslimdeki gibi, bolum bolum ilgili akista.

Oneri sirasi: R1-R6 tek parca (rota + istasyonlar okumasi, bir goc R1 ve bir ad goci R6); R7-R9 malzemeler M1-M2 ve tekil girdikten sonra; R10 akis sonunda rol turunda.
