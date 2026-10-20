# cnc-kurulum: çekirdek istekleri

Hazır yama: paket kökündeki `cekirdek-yamasi.diff` (`git apply` ile; taban `main` b610f0f üzerinde denendi). Tek tek:

1. `paylasilan/islemler.ts`: `import { CNC_KURULUM_ISLEMLERI } from './islemler/cnc-kurulum.ts';` ve `VERI_ISLEMLERI` içine `...CNC_KURULUM_ISLEMLERI,`.
2. `paylasilan/sayfalar.ts`: `import { CNC_KURULUM_IKINCI_MENU, CNC_KURULUM_SAYFALARI } from './sayfalar/cnc-kurulum.ts';`, `SAYFALAR` içine
   `...CNC_KURULUM_SAYFALARI,`, `IKINCI_MENULER` içine `CNC_KURULUM_IKINCI_MENU,`.
3. `paylasilan/islem-adlari.ts`: `'cnc-kurulum.oku'`, `'cnc-kurulum.yaz'` adları; `MODUL_ADLARI` içine `'cnc-kurulum': 'CNC kurulum motoru'`.
4. `sunucu/cekirdek/uygulama.test.ts`, `TAM_DENETLENMEYEN_UCLAR`: `'POST /cnc-kurulum/kayitlar/yaz govdesiz+secim'`. Kullanıcı kararı (12.10.2026): gövde deftere girmez.
   prototip her değişiklikte bütün durumunu (son NC programı dahil, yüzlerce KB) yazar; gövde deftere girerse denetim kaydı hızla büyür.
   Deftere anahtar, biçim ve beklenen sürüm girer.
5. Kullanıcı onayıyla (12.10.2026, kart #795) PR #796 içinde ayrı commit olarak girdi. Rol satırları: göç `sunucu/gocler/20261012172818_kisiler_cnc_kurulum_yetkileri.sql`, `kurulum/yetki-matrisi.md` ve onaylı
   matris testleri (`oturum.test.ts`, `kisiler/goc.test.ts`, `kisiler/rol-dagilimi.test.ts`); hepsi yamada. Kullanıcı kararı (12.10.2026): dağılım önerildiği gibi kalır.
6. Menü grubu: var olan `Üretim` grubu, sıra 40; simge `rotate` (teslimdeki `bolt` SmartES sayfasına verildi; oturtmada boştaki `rotate` seçildi).
7. Yeni paket yok. Prototip 3B kütüphanesini ve STEP okuyucusunu kendi içinde taşır.
8. Öneri: yerel depo köprüsü (`cerceve-kopru.ts` + `kopru.ts`) `localStorage` kullanan bundan sonraki prototipler için ortak çekirdek parçası olabilir.
