# Dis gelistirici

Depoda yazma yetkisi olmayan gelistiriciler icindir (2091 a). Depo herkese aciktir; okuma ve fork icin yetki gerekmez.
Bu belge yalniz teslim yolunu tanimlar; CLAUDE.md ve kurulum/proje-talimati.md'nin geri kalani (temel kural, kirmizi cizgiler, yapi kurallari, ONAY) aynen gecerlidir.

Baglantilar: depo https://github.com/heylit/CORE-MES, fork https://github.com/heylit/CORE-MES/fork, istekler https://github.com/heylit/CORE-MES/pulls

## Bir kez
1. Depoyu kendi hesabina fork'la.
2. Claude ile calisilacaksa Claude GitHub uygulamasini fork'a kur ve oturumu fork'ta ac.

## Her is icin
1. Koordinatorden al: kart no, dosya listesi icin kilit. Biri eksikse yazmaya baslanmaz. Goc varsa damgayi kendin al: yazdigin anin UTC zamani, 14 hane (`date -u +%Y%m%d%H%M%S`); birlesmeden once main'deki en buyuk damgadan kucukse yeniden damgala.
2. Fork'u guncelle (Sync fork ya da `git fetch upstream main && git rebase upstream/main`).
3. Fork'ta `<kart no>-<kisa-ad>` dali ac; yalniz kilitli dosyalara ve kendi modulunun klasorlerine yaz.
4. `npm run kontrol`; `npm run harita -- --modul <ad>` ciktisindaki "Ona bagimli" moduller icin `npm run test:modul -- <ad>`.
5. Acik depo taramasi: gercek ad, parca no, musteri, IP, alan adi, parola, anahtar, ic surec yok.
6. Fork'taki daldan heylit/CORE-MES main'e cekme istegi ac (head `<kullanici>:<dal>`). Acilamazsa `https://github.com/heylit/CORE-MES/compare/main...<kullanici>:CORE-MES:<dal>` baglantisiyla elle acilir. Baslik kart no ile biter, or. "Add stock filter (2091)"; `denetim` isi bunu arar. Is bitene kadar taslak.
7. Govdede DEVIR bolumu: taban commit, kosulan komutlarin son satirlari, kosulamayanlar, "bu is sunlari varsaydi" (en cok 10 satir), onay durumu, acik depo tarama satiri.

## Sinirlar
- heylit/CORE-MES'e push edilmez; cekme istegi bir teslim istegidir. Birlestirme yalniz Birlestirici'nindir: kapi kontrolunden gecirir, uygunsa alir, degilse nedenini istege yazar.
- Kirmizi CI ve main ile catisma gelistiricinin isidir; duzeltme ayni dala push edilir, istek kendiliginden guncellenir.
- Zorla push, bos commit, test atlama yok. Her iddia DOGRULANDI / VARSAYIM / BILMIYORUM.
