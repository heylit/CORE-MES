# Fark: musteri-tedarikci (kart #1164, dal 1164-musteri-tedarikci)

Depoda bu modül yoktu; firma kartı finanstaydı. Kullanıcı kararı: ana menüde ayrı sayfa, finans, satın alma, sevkiyat ve ötekiler buradan beslenir (S1-S6, karar kartı #1164).

## Eklenen
- Göç `sunucu/gocler/20261013214000_musteri_tedarikci_firma.sql`: `finans_firma` -> `musteri_tedarikci_firma` (sıra, birincil anahtar, dizin, kısıt ve tetikleyici adları yeni önekle; satır ve kimlik değişmez, S2); kartta `enlem`, `boylam` (S4); yeni `musteri_tedarikci_adres` (fatura, teslim, şube; her biri koordinatlı, S5); sevkiyatın firmaya bağlı aktif noktalarının koordinatı bir kez noktanın adıyla teslim adresi olur (S4); `finans.firma-oku/yaz` satırları `musteri-tedarikci.oku/yaz` olur ve aynı rollere `sayfa.musteri-tedarikci` verilir (S6). Göç başında sayım NOTICE ile yazılır.
- Sunucu: `sorgular.ts`, `kurallar.ts`, `servis.ts`, `uclar.ts`, `disari.ts`, `ornek-veri.ts` (5 ORN- firma finanstan taşındı); testler `kurallar.test.ts`, `firma.test.ts` (finanstan taşındı, adres testleri eklendi), `goc.test.ts` (dolu tabloda göç).
- Paylaşılan: `sozlesme/musteri-tedarikci.ts` (firma şemaları finanstan taşındı, koordinat ve adres eklendi), `islemler/musteri-tedarikci.ts`, `sayfalar/musteri-tedarikci.ts` (Tanımlar grubu, ikinci menü: Tüm firmalar, Müşteriler, Tedarikçiler, Fason firmalar); toplayıcılarda kendi satırı.
- İstemci: `istemci/src/moduller/musteri-tedarikci/` liste, ayrıntı paneli, firma, adres ve konum formları, testler.

## Değişen (başka modüller; S2 gereği aynı anda)
- finans: firma kodu çıktı; pasif/aktif ucu kaldı (finans FARK.md). `paylasilan/sozlesme/finans.ts`, `islemler/finans.ts`, `sayfalar/finans.ts` (Firmalar maddesi `musteri-tedarikci.oku`), `islem-adlari.ts`. İstemci `kopru.ts`, `FinansCercevesi.tsx`, `cerceve/finans.html` (yetki adları), testler.
- satin-alma: `servis.ts` firma işlevlerini musteri-tedarikci'den alır (kur ve `tedarikciOlabilirMi` finansta); istemci `merkez/tasiyici.ts` firma ekleme yolu; testler.
- sevkiyat, logo, malzemeler, projeler, rota, portal, uretim-emirleri: `servis.ts` ve `ornek-veri.ts` ithalleri `../musteri-tedarikci/disari.ts`; testlerde tablo ve uç adı.
- oturum, kisiler: yalnız testlerde rol matrisi beklenen işlem adları.
- Belgeler: `CLAUDE.md` (firma sahipliği satırı, ayrı commit), `kurulum/proje-talimati.md`, `kurulum/proje-hedefi.md`.

## Silinen
- `finans_firma` adı (tablo yeniden adlandırıldı), `finans.firma-oku`, `finans.firma-yaz` işlemleri. Eski tarihli göç testleri (o tarihteki şemayı kurar) eski adı kullanmaya devam eder.

## 265 a: müşteri sınıfı
Göç `20261019124000_musteri_tedarikci_musteri_sinifi.sql` firmaya boş olabilen `musteri_sinifi` (A, B, C) ekler; dolu tabloda sütun boş başlar.
Kart formunda ve ayrıntıda müşteri ve "ikisi" türünde görünür; tedarikçide boş gider. Düzeltmede gönderilmezse korunur (Finans çerçevesi göndermez).
`disari.ts` `musteriSiniflari(db, idler)`: sınıfsız firma null, olmayan kimlik haritada yok. Çarpanlar ve okunması plan şeridindedir.
VARSAYIM: sınıfı `musteri-tedarikci.yaz` yazar, yeni işlem yok; sınıf listede ve seçim kutusunda gösterilmez.
