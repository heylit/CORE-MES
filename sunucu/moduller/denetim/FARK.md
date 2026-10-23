# FARK: denetim, 3. tur (kart #48, dal 48-denetim-okuma, taban main 7c20cef)

## Eklenen
- Okuma uçları (`uclar.ts`): `GET /denetim-kayitlari` (sayfalı liste; süzgeç kişi, tarih aralığı, komut), `GET /denetim-kayitlari/suzgecler`
  (yetki `denetim.oku`) ve `GET /denetim-kayitlari/:id/govde` (yetki `denetim.govde-oku`).
- Yeni işlem `denetim.govde-oku` (`paylasilan/islemler/denetim.ts`). Hiçbir role verilmez; yalnız bayraklı yönetici taşır. Rol göçü yok.
- Sözleşme `paylasilan/sozlesme/denetim.ts`; sayfa ve ikinci menü `paylasilan/sayfalar/denetim.ts` (`/denetim`, `sayfa.denetim`, grup Yönetim).
- Toplayıcı `paylasilan/sayfalar.ts`: yalnız bu modülün kaydı (içe aktarma, sayfa, ikinci menü), ayrı commit.
- Ekran `istemci/src/moduller/denetim/` (liste, süzgeç, sayfalama, satır ayrıntısı; yazma yok). Menüde Yönetim grubunda Sistem Ayarları'ndan önce (sıra 5): Ayarlar grubun sonunda kalır.
- Kural DNT-01 (`kurallar.ts` `kimlikParametreleri`): listede yalnız tam sayı değerli `id` / `...Id` yol parametreleri döner.
- Okumada `gizle` yeniden uygulanır.
- Testler `okuma.test.ts`, `kurallar.test.ts` (DNT-01), `DenetimKaydi.test.tsx`.

## Değişen
- `servis.ts` `denetimYaz` aynı; sorgular `import * as sorgular` ile alınıyor. Yazma yolu, şema ve göç değişmedi.

## Silinen
Yok.

## Onaylı kararlar
- K4 a (okuma ekranı) uygulandı; kullanıcının 3. tur farkı (D48): liste gövde ve parametre taşımaz, gövde ayrı işlemle ayrı uçta.
- D48m a: müdüre `sayfa.denetim` çekirdek isteği olarak yazıldı (`CEKIRDEK-ISTEKLERI.md`); rol satırına dokunulmadı.

# FARK: denetim, H2 (kart #259, dal 259-denetim-modul-yetki; yazan çekirdek konusu)

## Eklenen
- Göç `20261008082740_denetim_modul_yetki.sql`: `denetim_kaydi`'na boş olabilen `modul text` ve `yetki text`. Eski satırlar boş kalır;
  yalnız-ekleme tetikleyicisi sütun eklemede çalışmaz, sonradan doldurma reddedilir.
- Çekirdek (`sunucu/cekirdek/uc.ts`, `uygulama.ts`): kayıt ucun modülünü (keşifte) ve yetki işlemini taşır; modülsüz kaydedilen uçta modül boştur.
- Test `denetim.test.ts` `kayıt ucun modülünü ve yetkisini taşır; ...`.

## Değişen
- `sorgular.ts` `denetimEkle` iki sütunu yazar. `KURAL-TEST.md` kural, izinli test, reddedilen test biçiminde (K9 a). Okuma ve süzgeç değişmedi.

## Onaylı kararlar
- H2 a: bundan sonra modülün sahibi çekirdek konusudur.

# FARK: denetim, N4 (kart #259, dal 259-denetim-eki; yazan çekirdek konusu)

## Eklenen
- `servis.ts` `ekli`: uç katmanından gelen denetim eki gövdede `_ek` anahtarına maskelenerek girer; gövde düz nesne değilse ya da
  `_ek` taşıyorsa `_govde` altına alınır. Göç yok.
- Test `okuma.test.ts` `denetim eki: ...`: ek maskelidir, liste göstermez, müdür gövde ucunda 403, yönetici görür.

## Onaylı kararlar
- N4: sınırlar 8 alan, 512 bayt, 100 satır; `_ek` gövdenin parçasıdır, yalnız `denetim.govde-oku` görür (ADR 0008).

# FARK: denetim, eski/yeni değer defteri (392 a; dal ga1-denetim-defteri; Güvenlik Merkezi)

## Eklenen
- Göç `20261023194500_denetim_degisiklik_defteri.sql`: yalnız ekleme `denetim_degisiklik` tablosu ve ortak tetik işlevi
  `denetim_degisiklik_yaz(<anahtar sütunları>, <dışarıdaki sütunlar>...)`. Yeni ve boş tablo; dolu tablo değişmez. Modüller kendi tablolarına
  kendi göçleriyle bağlar. Kişi, yazma ucunun transaction başında verdiği `tmiv2.kisi_id` oturum değişkenidir; göç ve arka işte boştur.
- Uçlar: `GET /denetim-degisiklikleri` ve `/suzgecler` (`denetim.oku`; değer taşımaz, yalnız alan adları),
  `GET /denetim-degisiklikleri/:id/icerik` (`denetim.govde-oku`; eski ve yeni değer, okurken maskeli). Yeni işlem ve rol satırı yok.
- Ekran: Denetim Kaydı'nda "Görünüm" süzgeci (Komutlar / Değişiklikler); değişiklik satırı açılınca alan, eski, yeni listesi.

## Onaylı kararlar
- 392 a (dolu tablo göçü), 257 a (kapsam), 258 a (rol ve kişi-iş merkezi de deftere), 259 a (ekran görünümü, prototip değişikliği).
