# ORTAKLIK: malzeme-izi

Modül hiçbir kavramı tutmaz; tablosu yoktur. Okuduğu kavramlar ve sahipleri:

| Kavram | Sahip modül | Okunan işlev (disari.ts) | Tablo |
|---|---|---|---|
| Malzeme kartı (kod, ad, tür, birim, onay) | malzemeler | `malzemeOzeti`, `malzemeAra` | `malzeme_katalog_karti` |
| Stok miktarı ve değer grupları | stok | `stokMiktarlari`, `degerGrubuToplamlari` | `stok_bakiye`, `stok_konum` |
| Parti (lot) | stok | `sonPartiler` | `stok_parti` |
| Açık sipariş satırı (gelecek) | satin-alma | `malzemeGelisTarihleri` | `satin_alma_siparis_satiri` |
| Ortalama alış, son alış, kg fiyatı | satin-alma | `ortalamaAlisFiyatlari`, `sonAlisFiyatlari`, `malzemeKgFiyatlari` | teslim, teklif, `satin_alma_kg_fiyati` |
| Açık NCR | kalite-merkezi | `acikNcrPartileri` | kalite kayıtları |

Hal (1278 a) türetilmiş bir etikettir, saklanmaz.
