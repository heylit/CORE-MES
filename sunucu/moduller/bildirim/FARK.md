# FARK: bildirim (bildirim merkezi, 1. aşama) — dal `claude/bildirim-1-9w0fyw`, taban `main`

Yeni modül. Kararlar: 221 a (taslak uygun, ilk aşama), 222 a (herkes yalnız kendi bildirimine erişir, yetki genişletme onaylı),
223 a (e-posta üçüncü aşamada; bu dalda yok). Kurgu `arastirma/bildirim/2026-10-19-bildirim-merkezi-kurgusu.md`, taslak Artifact sürüm 1.

## Eklenen
- `sunucu/gocler/20261019102500_bildirim_tablolar.sql`: yeni boş tablolar `bildirim_kaydi`, `bildirim_tercihi`.
- `paylasilan/sozlesme/bildirim.ts`: şemalar ve dört olay türü (`satin-alma.talep-onay-bekliyor`, `siparisler.onay-bekliyor`, `ik.izin-onay-bekliyor`, `istasyonlar.makine-durdu`).
- `sunucu/moduller/bildirim/`: `kurallar.ts` (BIL-1..BIL-5), `sorgular.ts`, `servis.ts`, `uclar.ts` (7 uç, hepsi `oturum`), `disari.ts` (`bildirimGonder`), testler, belgeler.
- `istemci/src/moduller/bildirim/`: üst çubukta zil ve sayaç (`ust-eylem.tsx`, herkes), sağdan çekmece (Okunmamış / Hepsi, tümünü okundu, ayarlar);
  `/profil/bildirimler` (Gelenler, süzgeç Hepsi / Okunmamış / Uyarı ve acil, arşive kaldır), `/profil/bildirimler/arsiv`, `/profil/bildirimler/tercihler`.

## Taslaktan farklı
- Liste ikinci menüde değil, Profilim altındaki adreste ve sayfa içi sekmelerle: ikinci menü yalnız kayıtlı sayfanın altında açılır ve maddesi kayıtlı işlem ister
  (`paylasilan/sayfa-tanimi.ts` `ikinciMenuHatalari`); Profilim sayfa değildir, yeni sayfa işlemi de istenmedi. Başlık "Profilim" görünür (`Kabuk.tsx` `PROFIL_YOLU`).
- Yönetici sekmeleri (Olay türleri, E-posta defteri), sessiz saat ve günlük özet saati bu aşamada yok (e-posta ile gelir).
- Mesaj ve e-posta anahtarları görünür ve saklanır; kanallar açılana kadar şeritte söylenir, gönderim yalnız zile.

## Başka yerde değişen
- Yok. Toplayıcıya ve rol x işleme dokunulmadı.

## 298 a ve 298 b (ekip çağrısı yönlendirmesi) — dal `298-ekip-cagrisi-yonlendirme`, taban `main` e384b8d

Kararlar: 298 a ("298 a, yetki genişletme onaylı"; "bildirim yönetim ayarlarına ekle"), 298 b ayarcı ("298 ayarcı b, prototip değişikliği onaylı").
- `sunucu/gocler/20261019155500_bildirim_cagri_yonlendirme.sql`: yeni boş tablolar `bildirim_cagri_ekibi`, `bildirim_cagri_alicisi`; varsayılan eşleme tohumu.
- `sunucu/gocler/20261019160000_durus_nedenleri_ayarci_ekibi.sql`: `durus_nedeni_ekip` kısıtına `ayarci` (CHECK genişletme).
- `paylasilan/sozlesme/durus-nedenleri.ts`: `CAGRI_EKIPLERI` beşinci ekip `ayarci`; `istemci/src/moduller/durus-nedenleri/NedenFormlari.tsx` ad satırı.
- `paylasilan/sozlesme/bildirim.ts`: tür `arkon.ekip-cagrisi` (acil, alan işlemi yok, yolsuz gönderilir); yönlendirme şemaları.
- `sunucu/moduller/bildirim/`: iki uç (`ayarlar.yaz`), `disari.ts` `ekipCagrisiBildir`, BIL-7, BIL-8, `cagri-yonlendirme.test.ts`.
- `sunucu/moduller/kisiler/disari.ts`: `rolSecenekleri`, `rollerdekiKisiler` (salt okuma).
- `paylasilan/sayfalar/ayarlar.ts`: Sistem Ayarları ikinci menüsüne "Bildirim yönetimi" (`ayarlar.yaz`); `istemci/src/moduller/ayarlar/BildirimYonetimi.tsx`.
- Rol x işlem satırı ve yeni işlem yok.

## Çağrı alıcıları okuması (Arkon CEKIRDEK-ISTEKLERI 8) — dal `cekirdek-cagri-alicilari`, taban 298 yaması
- `GET /bildirimler/cagri-yonlendirme/benim` (`oturum`): oturumdaki kişinin rollerinden çıkan ekip listesi, `{ ekipler }`. Alıcı seçimi
  `ekipCagrisiBildir` ile aynı yoldan (`rollerdekiKisiler`) yapılır; iki kaynak oluşmaz. Yeni SQL, işlem, rol satırı ve göç yok.

## 2147 Y1 elle bildirim, ekran ortası, onay (sunucu) — dal `2147-bildirim-yayini`
Kararlar: 2147-1 a (bildirim modülünde), 2147-2 c (işlemler açılır, rol satırı yok), 2147-3 a (ekran ortası prototipteki gibi). Prototip `devir-heylit/2147/prototip/bildirim-merkezi.html`.
- Göç `20261105093000_bildirim_yayini.sql`: yeni boş `bildirim_yayini`, `bildirim_yayin_hedefi`; `bildirim_kaydi`'ye boş ya da varsayılanlı dört sütun ve iki kısıt (dolu satır değişmez).
- `paylasilan/islemler/bildirim.ts` (yeni), toplayıcıda iki satır, `islem-adlari.ts`'de üç satır (iki işlem, modül adı).
- `paylasilan/sozlesme/bildirim.ts`: yayın, hedef, ortadaki bildirim ve onay şemaları; `bildirimSemasi` değişmedi (istemci Y2'de).
- `sunucu/moduller/bildirim/yayin.ts` (yeni), `isler.ts` (yeni, dakikada bir ileri tarihli yayın), 9 uç; `arsivle` onay bekleyeni reddeder; `bildirimGonder` acil olanı ortada işaretler.
- `sunucu/kablolama.ts`: istasyonlar import satırına iki ad, bir bildirim importu, bir bağ (istasyon kişileri -> bildirim yayını).
- Simgeler ortak simge setinden 17 ad (prototipteki megafon setde yok; duyuru için `bell`/`calendar` kullanılır).

## 2147 Y2 elle bildirim ekranları (istemci) — dal `2147-y2`
- `paylasilan/sozlesme/bildirim.ts`: `bildirimSemasi`'na `onayIstenir`, `onaylandi`, `yayin` (tür, simge, gönderen, görsel, geri çekildi; otomatikte null); liste durumuna `onay-bekleyen`, `duyuru`, `bilgi`.
- Sunucu: liste, okundu ve arşiv cevabı yayın künyesini taşır (`yayinKunyeleri` + `kisiAdlari`); yeni uç, işlem, göç yok.
- İstemci: `OrtadakiPencere.tsx` (zil düğmesiyle her sayfada; onaylı olan "Okudum, anladım" demeden kapanmaz), `Hazirla.tsx`, `Yayinlar.tsx`, `gorsel.ts`; `/profil/bildirimler/hazirla` ve `/yayinlar` sekmeleri yalnız işlemi olana görünür; menü ve `paylasilan/sayfalar` değişmedi.
- Kabuk ve üst çubuğa dokunulmadı: pencere modülün üst eylem düğmesinden çizilir (`ust-eylemler.ts` "açtığı pencere modülündür").

## 2147 Y4 otomatik bildirimin gösterimi — dal `2147-y2`
- Göç `20261105094000_bildirim_tur_gosterimi.sql`: yeni boş `bildirim_tur_gosterimi` (tür, ortada, onay, sürüm); dolu tablo değişmez.
- Uçlar `GET /bildirimler/gosterim`, `POST /bildirimler/gosterim/:tur/degistir` (`ayarlar.yaz`, sürümlü); varsayılana eşit değer satırı siler.
- `bildirimGonder` türün gösterimini yazar (BIL-17); `bildirimYaz` `onay_istenir` alır.
- İstemci: `ayarlar/BildirimYonetimi.tsx`'e "Ekran ortası ve onay" kartı (bütün türler, iki işaret).
