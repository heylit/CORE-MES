# recete-rota: çekirdek ve ortak istekleri (teslim 20.10.2026)

Bu teslim `sunucu/cekirdek`, `paylasilan` ve `istemci/src/ortak`'a yazmaz. Aşağıdakiler çekirdek şeridinin işidir; her biri ayrı kartla girer.

## Bu teslimin çalışması için
1. İkinci menü (paylasilan şeridi): `paylasilan/sayfalar/recete-rota.ts` içindeki `RECETE_ROTA_IKINCI_MENU` yerine `istemci/src/moduller/recete-rota/planlama-menusu.ts` `ONERILEN_IKINCI_MENU`. Yama paketin kökünde: `cekirdek-ikinci-menu.diff`.
   Neden: yeni planlama sayfaları (ysiparis, maliyet, giderler, mesaiplan, fasonplan, malzplan, terminler, denge, yillik, sevkiyat) menüde görünsün, adres izlensin. Girene kadar bu sayfalar planlama çerçevesinin kendi yan menüsünden açılır.
   Denendi (DOĞRULANDI, paket `ciktilar/yama-tip.txt`, `ciktilar/yama-testleri.txt`): yama uygulanmış ağaçta `npm run tip` 0; `istemci/src/ortak/rota`, ikinci menü ve gezinme testleri ile `planlama-derle.test.ts` 18 dosya, 150 test yeşil. Kullanılan simgeler (gantt, lira, truck, gauge, flag) `SIMGELER`'de var.
   Yetki: maddeler bugünkü işlemleri kullanır (`sayfa.recete-rota`, `plan.oku`); yeni işlem yok. Planlama sayfalarının yalnız yöneticiye açılması bir yetki kararıdır (SORULACAKLAR).
2. Teslim izin listesi (araçlar): `araclar/teslim-incele.ts` `IZINLI_UZANTI` yalnız `.ts`, `.tsx`, `.css`, `.md`. Bu teslimde ayrıca `cerceve/planlama/**` altında `.betik`, `.stil`, lisans metinleri (`LICENSE-*`) ve üretilmiş `cerceve/planlama-modulu.html` var.
   Var olan karşılık: `cerceve/recete-rota-motoru.html` ve `cerceve/yazi/*.woff2` önceki teslimde "elle oturtulan varlık" olarak girdi (`UYGULA.md`). Öneri: aynı yol; ya da `istemci/src/moduller/*/cerceve/**` için ayrı izin satırı.
3. Lint: `.betik` ve `.stil` eslint ve stylelint'in uzantı kalıbına girmez (DOĞRULANDI, `npm run lint` 0). Kaynaklar `.js`/`.css` yapılırsa `eslint.config.js`'deki `arkon/web/**` gibi `istemci/src/moduller/recete-rota/cerceve/**` yok sayılmalı. Öneri: uzantılar kalsın, istek yok.

## Bağlamada gerekecek (bugün kayıttaki `plan` alt nesnesinde)
4. Tasarım değişkeni: planlamanın iş renkleri `--is-0`..`--is-9` (açık ve koyu tema, 20 onaltılık renk) `cerceve/planlama/stil/modul.stil`'de. Ortak `tokens.css`'e seri renkleri olarak girebilir.
5. Ayar ya da tablo sütunu olarak tanımlar (denemenin taslağı; FARK.md "Planlama alanları"):
   - Makine: `verim` (1 = tam), `opOran`, `isiksiz`, `ucret` (₺/saat, plan), `vardiyalar`, `arizaGun`, `onarimSaat`.
   - Kişi: `ayar` (ayarcı).
   - Rota adımı: `aile`, `aparat`, `kasa`, `minParti` (= `minLot`), `fai`, `program`, `fasonIzin`, `bag` (öncül listesi).
   - Ayar matrisi: aile -> aile geçiş dakikası (`den`, `ye`, `dk`).
   - Aparat: `id`, `ad`, `adet`.
   - Fason firma: `kapasite`, `sureGun`, `cikisGunleri`, `cikisSaat`, `fiyat`, `sapmaGun`.
   - Malzeme: `tedarikGun`, `muayeneGun`.
   - Sipariş: `gelir`, `cezaGun`, `musteri`, `elle` çarpanı ve gerekçesi, `ust`, `ustAdim` (montaj bağı).
   - Atölye geneli: `tasimaSaat`, `transferOran`, `faiSaat`, `programSaat`, `ayarciUcret`, `mesaiUcret`.
   Hangisinin hangi modülün tablosuna gideceği `ORTAKLIK-recete-rota.md` ve SORULACAKLAR'daki sahiplik sorusuyla belli olur.
6. Sunucu motoru: planlama motoru (`motor/engine.betik`) bugün tarayıcıda ayrı iş parçacığında koşar. Sunucuya taşınırsa yeri (`sunucu/moduller/plan` ya da yeni modül) ve canlı planın tek kaynağı çekirdek kararıdır (SORULACAKLAR).

## Şema
Göç yok. Planlama durumu `recete_rota_kayit` tablosunda `recete-rota-motoru-v1:planlama` anahtarındadır; anahtar `paylasilan/sozlesme/recete-rota.ts` `ANAHTAR_BICIMI`'ne uyar (DOĞRULANDI, kod; uçtan uca gerçek sunucuyla denenmedi, tarayıcı kanıtı sahte kabukla).
