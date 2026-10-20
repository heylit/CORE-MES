# mesaj: çekirdek istekleri

Teslimdeki ortak yama (`cekirdek-yamasi.diff`, üç modül birlikte) bugünkü main'e tutmadı; oturtmada yalnız bu modülün satırları elle, ayrı commit'lerle girdi:

1. `paylasilan/islemler.ts`: `import { MESAJ_ISLEMLERI } from './islemler/mesaj.ts';` ve `VERI_ISLEMLERI` içine `...MESAJ_ISLEMLERI,`.
2. `paylasilan/sayfalar.ts`: `import { MESAJ_IKINCI_MENU, MESAJ_SAYFALARI } from './sayfalar/mesaj.ts';`, `SAYFALAR` içine `...MESAJ_SAYFALARI,`, `IKINCI_MENULER` içine `MESAJ_IKINCI_MENU,`.
3. `paylasilan/islem-adlari.ts`: `ISLEM_ADLARI` içine `'mesaj.oku'`, `'mesaj.yaz'`, `'mesaj.yonet'` adları; `MODUL_ADLARI` içine `'mesaj'` (yamada yazılı).
4. `sunucu/cekirdek/uygulama.test.ts`, `TAM_DENETLENMEYEN_UCLAR`: `'POST /mesaj/ekler/yukle govdesiz+secim'`. Kullanıcı kararı 12.10.2026 ("girmesin"): ek içeriği (base64, en çok 700 KB) denetim kaydına girmez, ad ve tür girer.
5. Rol satırları (kullanıcı kararı 12.10.2026, 1 "evet"; çekirdek yazar: göç, onaylı matris testleri `oturum.test.ts`, `kisiler/goc.test.ts`, `kisiler/rol-atama.test.ts`, `kisiler/rol-dagilimi.test.ts` ve `kurulum/yetki-matrisi.md`):
   `mudur`, `planlama_proje`, `kalite`, `cam`, `bakim`, `satin_alma`, `depo`, `sevkiyat`, `insan_kaynaklari`, `idari_isler`, `muhasebe_finans` için `sayfa.mesaj`, `mesaj.oku`, `mesaj.yaz`.
   `operator` listede yok (#720 ile çelişir; İK için sorulan soruya "kalsın" denirse `sayfa.mesaj`, `mesaj.oku` sorulur). `mesaj.yonet` hiçbir role verilmez.
6. Menü grubu: var olan `Yönetim` grubu; yeni grup yok.
7. Yeni paket: yok. Teslim `xlsx` 0.20.3 istiyordu; kullanıcı kararıyla (12.10.2026, 2 "hayır") eklenmedi, Excel dosyası içe aktarımı kapalı (FARK.md).
8. Öneri: belge deposu (sunucu + `cerceve-kopru.ts`) üç modülde aynı koddur; `window.claude` kullanan bundan sonraki prototipler için ortak çekirdek parçası olabilir. Bu teslimde modül sınırı gereği kopyadır.
