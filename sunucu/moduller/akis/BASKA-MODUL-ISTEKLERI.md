# Başka modül istekleri: akis (kart #1338)

Hepsi yalnız okuma; sahibi konulara iletildi.

| Modül | Fonksiyon | Durum |
|---|---|---|
| stok | `emrinAkisHareketleri(db, uretimEmriId)`, `partiGirisZamanlari(db, partiIdler)` | main'de (PR #1340) |
| sevkiyat | `emirlerinSevkDurumu(db, emirIdleri)` | main'de (PR #1342) |
| uretim-emirleri | `emirAkisKaydi(db, emirId)`: emir, iş emirleri (op, sıra, istasyon, fason firma, termin, başlama, bitiş, standart süreler metin), olaylar, sayımlar, fason hareketleri | main'de (PR #1347) |

Var olanlardan kullanılanlar: `uretim-emirleri/disari.ts` `adimliEmirListesi`, `recete-rota/disari.ts` `receteRotaStatuleri`, `istasyonlar/disari.ts` `istasyonAdlari`.

3429-1 (siparişin akışı): yeni dışa aktarım istenmedi; var olanlar kullanıldı: `siparisler/disari.ts` `siparisAyrintisi`,
`uretim-emirleri/disari.ts` `siparisSatirlarininEmirleri`, `emirlerinIsEmriIdleri`, `uretimEmriOzeti`, `plan/disari.ts` `canliPlan`,
`sevkiyat/disari.ts` `siparisinSevkleri`, `finans/disari.ts` `siparisFaturalari`, `malzemeler/disari.ts` `malzemeOzetleri`.
Siparişler'in kapatma kapısı bu modülün `disari.ts` `siparisKapanisEksikleri` okumasını çözücüyle alır (kablolama.ts; Siparişler alt kattadır).
