# Kurulum: İnsan Kaynakları (ik) v3, taban TMICOREV2 640bebf

Paket, TMI CORE V2 modül düzeninde hazır koddur: sözleşme, işlem, sayfa ve ayar `paylasilan/`, uçlar `uc({...})` ile `sunucu/moduller/ik/`,
SQL yalnız `sorgular.ts`, kural yalnız `kurallar.ts` (saf), göçler `sunucu/gocler/`, ekran `istemci/src/moduller/ik/`. Uygulama
(ik-modulu) yalıtılmış çerçevede açılır; v2'deki görünüm, yerleşim ve kullanım değişmedi, yalnız Mesailerim ve bordro onayı eklendi.
v2 oturtmasının yerine geçer (v2 depoya girmediyse doğrudan bu kurulur; v2 kuruluysa FARK.md bölüm 1'deki yeniden adlandırmalara bakın).

## İçerik
- `paylasilan/`, `sunucu/`, `istemci/`: modülün bütün dosyaları (v2 + v3), depo köküne aynı yollarla.
- Çekirdek yamaları, sırayla: `cekirdek-1-toplayicilar.diff` (toplayıcılar, işlem adları), `cekirdek-2-kisiler.diff` (kisiler
  seçim listesi), `cekirdek-3-rol-gocu.diff` (iki rol göçü, yetki matrisi belgesi, matris testleri). Ayrıntı: CEKIRDEK-ISTEKLERI.md.
- `yama/ik_v3_uygulama_yamasi.py`: paket.ts'e uygulanmış yamanın betiği (kayıt için; kurulumda koşulmaz).
- FARK.md, NOTLAR.md (varsayımlar), KURAL-TEST.md, BASKA-MODUL-ISTEKLERI.md, ON-PAKET-ik.md, ON-PAKET-ik-v3.md; modül içinde
  NOTLAR.md ve UYUM-BORCU.md.

## Adımlar (depo kökünde, iş dalında)
1. Modül dosyalarını açın (hepsi yeni dosya): `unzip ik-v3-paketi.zip 'paylasilan/*' 'sunucu/*' 'istemci/*' -d .`
2. Yamaları sırayla uygulayın: her biri için `git apply --check <dosya> && git apply <dosya>`.
   Taban 640bebf değilse ve yama tutmazsa satırlar CEKIRDEK-ISTEKLERI.md'deki yerlerine elle eklenir; rol testleri o tabanın
   matrisine göre yeniden kurulur.
3. Göçler: `npm run goc`. Sıra: `20261012082705_ik_tablolar` (39 tablo), `20261012082718_kisiler_ik_islemleri` (roller),
   `20261012083000_ik_bordro_onayi` (onay defteri), `20261012083010_kisiler_ik_bordro_gordum` (onay işlemi),
   `20261012083020_kisiler_ik_bakim_sevkiyat` (bakım ve sevkiyata İK İşlemlerim). Var olan tabloyu
   değiştirmez; yalnız `rol_islemi`'ne satır ekler.
4. Denetim: `npm run tip`, `npm run sinir`, `npm run lint`, `npm run test:modul -- ik`, ardından oturum, sağlık ve kisiler testleri.
5. Tabana bu damgalardan yeni bir göç girmişse beş göç, sırası korunarak daha yeni damgalarla yeniden adlandırılır; `sunucu/moduller/ik/sema.ts`
   yorumundaki tablo göçü adı da.

Yeni npm paketi yok. Dış servis çağrısı yok.

## Doğrulama (depo kopyası; Node 22.22, PostgreSQL 16)
Taban 640bebf + yalnız bu paket:
- `npm run tip` hatasız; `npm run lint` hatasız; `npm run sinir`: "Sınır denetimi: 864 dosya, 0 ihlal."
- `npm run test:modul -- ik`: sunucu "# pass 57" "# fail 0"; istemci "Test Files 3 passed (3)" "Tests 18 passed (18)".
- Oturum, sağlık, kisiler, ik ve yetki matrisi belgesi (karar 1-a sonrası): 238 testten 237 geçti; kalan "aynı çiftten 20 eşzamanlı deneme" tabanda da kırmızı (ortam).
- Tüm istemci: "Test Files 128 passed (128)" "Tests 1161 passed (1161)".
- Paket yeniden kurularak denendi: temiz 640bebf + paket dosyaları + üç yama, sınanan ağaçla `diff -r` ile birebir aynı.
Taban + Kalite Merkezi + bu paket birlikte: tam sunucu 2122/2123 (kalan kırmızı tabanda da kırmızı), tam istemci 1181/1181 (NOTLAR.md).
