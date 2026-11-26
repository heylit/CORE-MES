# saglik UYUM-BORCU (kart 3668, dilim A-C)

| Kural | Istisna | Nerede | Nasil uyumlanir |
|---|---|---|---|
| jsonb | `saglik_kapanma` sutunlari `hata_satirlari`, `suren_istekler`, `bellek`, `dakikalar` jsonb | `20261124140000_saglik_kapanma.sql` | Okuma sirasinda zod `safeParse` ile suzulur. Sorgu yapilmayan, yalniz ayrinti icin saklanan anlik goruntu; tabloya acmak istenirse ayri goc |
| Yalniz ekranda kalan kural | Kapanma onceligi ve 60 gun gunluk siniri istemcide de hesaplanir (`kapanma-yorumu.ts`) | istemci/sistem | Sunucu `gunluk.dosyalar` / `gunler` alanini zaten doner; istemci yalniz dugmeyi pasiflestirir |
| Kendi bilesen / stil | Yok: ortak `Sekmeler`, `Pencere`, `Dugme`, `Rozet`, tasarim degiskenleri | - | - |
| Tarayicida tutulan veri | Yok (sekme ve suzgec URL'de) | - | - |
| Cekirdek kalibi | Kullanilmayan: yok | - | - |
| ISCI_BELLEK_SINIRI_MB = 2048 | Olculmemis varsayim | `plan/isci-izleme.ts` | Canli bellek olcumuyle ayarlanir |
