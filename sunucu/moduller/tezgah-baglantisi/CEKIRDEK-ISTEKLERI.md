# Çekirdek istekleri (tezgah-baglantisi, kart 3753)

Durum: uygulandı (yama 0003, kullanıcı kararı 26.11.2026 "Böyle girsin"); ADR 0034 kabul. `npm run sinir` 0 ihlal.
Aşağıdaki metin kayıt için kalır.

## 1. CLAUDE.md "Kırmızı çizgiler" istisna listesi
Tezgah okuma (ADR 0033) maddesinin ardına, aynı satırın sonundaki noktadan önce:

```
, Heidenhain okuma (ADR 0034, yalnız `tezgah-baglantisi` modülü `lsv2.ts`, yalnız LSV2 salt okuma, yalnız TCP 19000, adres `TMIV2_TEZGAH_LSV2_MAKINELERI`'nde, kurum içi, parola tutulmaz, varsayılan kapalı)
```

CLAUDE.md bugün 10797 bayt; ek ~230 bayt, 15 KB sınırının altında kalır (`araclar/kural-metni.test.ts`).

## 2. `npm run sinir` kural j izin listesi
`araclar/sinir-denetimi.ts` `DIS_ISTEK_IZINLI` listesine, `tezgah-baglantisi/istemci.ts` satırının altına:

```ts
  'sunucu/moduller/tezgah-baglantisi/lsv2.ts', // ADR 0034
```

Önerilen test (`araclar/sinir-denetimi.test.ts`, "kural j"): izinli dosyalar listesine `sunucu/moduller/tezgah-baglantisi/lsv2.ts`,
reddedilen dosyalar listesine `sunucu/moduller/tezgah-baglantisi/lsv2-tur.ts` eklenir (aynı modülde öteki dosya `connect`/`new Socket`
kullanırsa kırmızı kalır).

## 3. ADR 0034
Taslak teslim klasöründe (`ADR-0034-TASLAK.md`); README satırı taslağın sonunda. Numarayı koordinatör kesinleştirir.

## Doğrulama
Yerelde iki değişiklik uygulanmadı (araç ve CLAUDE.md yazarın dokunamadığı dosyalar). Uygulandıktan sonra beklenen: `npm run sinir`
0 ihlal; `node --test araclar/sinir-denetimi.test.ts araclar/kural-metni.test.ts` yeşil (koşulmadı).
