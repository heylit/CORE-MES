# portal: çekirdek istekleri

Hazır yama: `tmi-moduller.zip` kökündeki `cekirdek-yamasi.diff` (üç modül birlikte; `git apply` ile). Tek tek:

1. `paylasilan/islemler.ts`: `import { PORTAL_ISLEMLERI } from './islemler/portal.ts';` ve `VERI_ISLEMLERI` içine `...PORTAL_ISLEMLERI,`.
2. `paylasilan/sayfalar.ts`: `import { PORTAL_IKINCI_MENU, PORTAL_SAYFALARI } from './sayfalar/portal.ts';`, `SAYFALAR` içine `...PORTAL_SAYFALARI,`, `IKINCI_MENULER` içine `PORTAL_IKINCI_MENU,`.
3. `paylasilan/islem-adlari.ts`: `ISLEM_ADLARI` içine `'portal.oku'`, `'portal.yaz'`, `'portal.yonet'` adları; `MODUL_ADLARI` içine `'portal'` (yamada yazılı).
4. `sunucu/cekirdek/uygulama.test.ts`, `TAM_DENETLENMEYEN_UCLAR`: `'POST /portal/ekler/yukle govdesiz+secim'`. Kullanıcı kararı 12.10.2026 ("girmesin"): ek içeriği (base64, en çok 700 KB) denetim kaydına girmez, ad ve tür girer.
5. Yetki matrisi (kullanıcı kararı 12.10.2026, "öneri"): göç `sunucu/gocler/20261012073300_kisiler_paket_modul_yetkileri.sql` (üç modülün rol satırları), `sunucu/moduller/oturum/oturum.test.ts` onaylı matrisi ve `kurulum/yetki-matrisi.md`; hepsi yamada.
6. Menü grubu: var olan `Yönetim` grubu; yeni grup yok.
7. Yeni paket: yok.
8. Öneri: belge deposu (sunucu + `cerceve-kopru.ts`) üç modülde aynı koddur; `window.claude` kullanan bundan sonraki prototipler için ortak çekirdek parçası olabilir. Bu teslimde modül sınırı gereği kopyadır.
