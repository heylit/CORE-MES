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
