# Özellik karşılama (Rota sayfası, kart #415)

Kaynak: `OZELLIK-LISTESI-ilk-sistem.md` (DEVAM paketi). Her madde: Var (test ya da ekran), borç numarası (UYUM-BORCU, rota B, plan P-B) ya da kart.
E: `istemci/src/moduller/rota/Rotalar.test.tsx`, U: sunucu akış testi, K: saf kural testi. "Önceki teslim": T4'ten önce gelen ekran, dokunulmadı.

## Ortak
| Madde | Durum |
|---|---|
| Tek "Rota" sayfası, ikinci menü üç grup | Var (önceki teslim; `paylasilan/sayfalar/rota.ts`) |
| Menü sayıları | Kısmen: onayda / açık revizyon, geç, senaryo, düşük stok, operasyon sayısı (U A7); ton, malzeme ve emir sayısı B33 |
| Son bakılan ürün | Var (A8) |

## Ürün ve rotalar
| Madde | Durum |
|---|---|
| Ürün seçici, şema / tablo / ağaç, baz ve sipariş miktarı, özet | Var (önceki teslim; E RT-45, RT-58) |
| Revizyon şeridi, ilk değişiklikte taslak, onaya gönder, dört göz | Var (E RT-05, RT-08, RT-10) |
| Tahta (yakınlaştırma, gezinme, sığdır, araçları gizle) | Var (önceki teslim) |
| Şema kutuları, bağımlılık etiketi, alt rota, sıralama, ekleme | Var (E RT-45, RT-33) |
| Yüzen düzenleme kartı, Esc | Var (E yüzen kart) |
| Talimat sürümlü, onay ve fark, ürün ağacı ihtiyacı | Var (E RT-60, RT-58) |
| Akış tablosu | Var (E RT-32) |
| EK: "Rev N'dan yeni taslak aç", revizyon listesi | Var (önceki teslim, `RevizyonSeridi.tsx`) |
| EK: "Önce planda dene" | B30 |
| EK: Şemadan "Üretim emri oluştur" (önizlemeyle) | B30 (emir Üretim emirleri bölümünden açılır) |
| EK: "Listeden değiştir", "Katalog değerlerine dön", "Tanımla ve adıma ekle" | Var (E T4 EK maddeleri) |
| EK: Hızlı ekle kutusu | B30 |
| EK: Komut paleti (Ctrl / Cmd + K) | Var (E Hızlı git); kabukta düğme çekirdek isteği |
| İkinci tarama: "Bu adımdaki kullanım", "Bu adımdan çıkış" | Var (`AdimPaneli.tsx`) |
| İkinci tarama: "Statülü kart aç" | B30, B32 |

## Üretim emirleri
| Madde | Durum |
|---|---|
| Yeni emir formu: mamul, adet, teslim | Var (E UE-01) |
| Öncelik, başlangıç, açıklama, taslak | Var (E UE-01; U emir önceliği testi) |
| Satır içinde başlangıç ve teslim | B27 |
| Kompakt satır, açılır kart, adım adım görünüm | Var (E UE-01) |
| Bekleyen adıma kaynak seçici, kaynaksız uyarı | Var (E UE-01; makine ya da kişi) |
| "Rotası değişti", "Emirlere uygula" | B28 |
| İptal (iki adımlı), arşivdeki eski emirler | Var |
| Terminal başlat / bitir | uretim-emirleri ve Arkon (bu kartta değil) |
| EK: durumlar, "Plana al", süzgeçler | Var (E UE-01) |
| EK: "Kanbanda göster", "Şemada aç" | Var (E UE-01) |
| EK: "Tamamla ve stokta", "Eksikleri teslim al", malzeme ihtiyacı, yan ürün | "Stok ve tamamlama" ve "Eksikleri teslim al" var (E #444); kalanlar B29 |
| EK: Emir önizlemesi | Var (Yeni üretim emri > Önizle; kart #262) |
| EK: Operasyon kartı "Öne al", "Bu işin dondurmasını kaldır" | Var (Kanban kartı); ekran testi tıklamıyor, P-B23 |
| EK: Operasyon kartında "Emri aç" | P-B18 |
| EK: "Plan sırasına dön" | Var (Kanban kuyruk başlığı; kart #262) |
| EK: "Partiyi böl", "Parçaları birleştir" | E #262: emir kartında "Partiyi böl" (sıradaki bekleyen adımdan) ve alt partide birleştir (üst ya da aynı adımdan kardeş); listede alt parti üstün altında dal. Kanban kartında düğme yok; plan çizelgesi, emir planı ve Kanbanda dal (B37 kapandı) |
| EK: "Başlat", ilerleme girişi | Arkon (operatör ekranı) |

## Plan
| Madde | Durum |
|---|---|
| Göstergeler | Var (E P1, P6); personelin sınırladığı gün P-B19 |
| Plan ayarları (kural, tampon, dondurma, personel kısıtı, taslak emirler) | Var (E PL-07, U ayar); personel kısıtı motor tarafı P-B19 |
| Uyarılar | Var (E P1) |
| Emir zaman çizelgesi, ileri / geri | Var (E P1; K PL-07 yön) |
| Matris üç kip | Var (E matris); Personel kipi P-B19 |
| PL-01..PL-11 (öncelik ve emir başlangıcı dahil) | KURAL-TEST (plan); PL-06 P-B18, PL-09 P-B19, takvim verisi P-B20 |
| P1: öner, taşı, kilitle, kaldır, çizelge, doluluk | Var (U P1, P5; önceki teslim ekranı korundu) |
| EK: Seçenekleri karşılaştır, Uygula, dondur, dondurmayı kaldır, elle sıraları sil | Var (E motor paneli, U dondurma) |
| İkinci tarama: "Bağlılıkları göster", emir renk lejantı | P-B21 |

## Plan stüdyosu
| Madde | Durum |
|---|---|
| Senaryo aç, dört hızlı deneme | Var (E P4, P6); canlıya alma P-B16 |
| Değişiklik listesi, tek tek kaldırma | Var (E, U P4) |
| Canlı değişti uyarısı | Var (U P4) |
| Karşılaştırma tablosu | Var |
| İki adımlı canlıya al, çakışmayı ezerek, vazgeç, silinmez | Var (E P4) |
| Canlıya alma sahibi modülün komutlarıyla | Kısmen: makine ya da kişi iş emrine yazılır (U P5); diğerleri P-B16 |
| EK: Aç ve düzenle, taslak şeridi, stüdyodan çık | Var (E P4, P6) |
| EK: Çoğalt, Sil, değişiklikleri at, canlıdaki son değişiklikleri al | Var |
| İkinci tarama: ad ve not, tüm değişiklikler, canlıya göre etkisi | Var |
| P6: canlı yalnız taslaktan değişir | Var (U P1, P6); Üretim emirleri komutları P-B17 |

## Kanban
| Madde | Durum |
|---|---|
| Sütunlar makine / kişi, istasyon gruplu, atanmamış | Var (E Kanban) |
| Kart içeriği, elle sıra işareti | Var |
| Sürükle, ↑ ↓, kaynak seçimi, elle sıraları sil | Var (E Kanban; U KY-03) |
| EK: üç görünüm | Var (E Kanban) |
| İkinci tarama: süzgeçler | Var; "Tamamlananları göster", durum panosunda sürükleme B36 |

## Stok
| Madde | Durum |
|---|---|
| Kart, stok, minimum, düşük; menüde "N düşük" | Var (E stok; U A7) |
| EK: hareketlerde "İşlemi geri al" (toplu, iki adımlı) | Stok Merkezi'nde; Rota > Stok salt okunur, bağlantı verir (kullanıcı kararı, E #448) |
| EK ve ikinci tarama: statüler, statülü stok, "Kartı aç ve ekle" | B32 |
| Okuma yetkisi | B31 |

## Operasyonlar, Malzemeler, Kaynaklar, Operatör ekranı
| Madde | Durum |
|---|---|
| Operasyon kataloğu, revizyon listesi, "Akışta aç" | Var (E IS-03, A2) |
| "Adımlara uygula" | B35 (#409) |
| Kısaltma satır içinde | Var (önceki teslim) |
| Malzemeler sekmeleri, arama, kullanım, "Kendi rotası", sayfalama | Var (önceki teslim; A2 "Akışta aç") |
| Kaynaklar beş sekme, tatiller | Var (E VR-01, IS-05, IS-02); Vardiyalar sekmesi vardiya modülünün ekranı, Personel'de kişi vardiyası (#441); Personel yetkinlik #439 |
| "Tüm iş merkezlerine uygula", "Tümünü temizle", genel bakış açıklaması | #410, #409 (Kaynaklar bölümü) |
| Operatör ekranı | Arkon (bu kartta değil) |

## Prototipe özgü
CSV: S4 b kararıyla yalnız liste ekranlarında (Operasyonlar, Malzemeler, Üretim emirleri, Stok). JSON ve başlangıç ekranı gelmez.
