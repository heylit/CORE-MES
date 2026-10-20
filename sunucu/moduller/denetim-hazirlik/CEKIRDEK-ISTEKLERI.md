# denetim-hazirlik: çekirdek istekleri

Hazır yama: `tmi-moduller.zip` kökündeki `cekirdek-yamasi.diff` (üç modül birlikte; `git apply` ile). Tek tek:

1. `paylasilan/islemler.ts`: `import { DENETIM_HAZIRLIK_ISLEMLERI } from './islemler/denetim-hazirlik.ts';` ve `VERI_ISLEMLERI` içine `...DENETIM_HAZIRLIK_ISLEMLERI,`.
2. `paylasilan/sayfalar.ts`: `import { DENETIM_HAZIRLIK_IKINCI_MENU, DENETIM_HAZIRLIK_SAYFALARI } from './sayfalar/denetim-hazirlik.ts';`, `SAYFALAR` içine `...DENETIM_HAZIRLIK_SAYFALARI,`, `IKINCI_MENULER` içine `DENETIM_HAZIRLIK_IKINCI_MENU,`.
3. `paylasilan/islem-adlari.ts`: `ISLEM_ADLARI` içine `'denetim-hazirlik.oku'`, `'denetim-hazirlik.yaz'`, `'denetim-hazirlik.yonet'` adları; `MODUL_ADLARI` içine `'denetim-hazirlik'` (yamada yazılı).
4. `sunucu/cekirdek/uygulama.test.ts`, `TAM_DENETLENMEYEN_UCLAR`: `'POST /denetim-hazirlik/ekler/yukle govdesiz+secim'`. Kullanıcı kararı 12.10.2026 ("girmesin"): ek içeriği (base64, en çok 700 KB) denetim kaydına girmez, ad ve tür girer.
5. Yetki matrisi (kullanıcı kararı 12.10.2026, "öneri"): göç `sunucu/gocler/20261012073300_kisiler_paket_modul_yetkileri.sql` (üç modülün rol satırları), `sunucu/moduller/oturum/oturum.test.ts` onaylı matrisi ve `kurulum/yetki-matrisi.md`; hepsi yamada.
6. Menü grubu: var olan `Kalite` grubu; yeni grup yok.
7. Yeni paket: yok.
8. Öneri: belge deposu (sunucu + `cerceve-kopru.ts`) üç modülde aynı koddur; `window.claude` kullanan bundan sonraki prototipler için ortak çekirdek parçası olabilir. Bu teslimde modül sınırı gereği kopyadır.
