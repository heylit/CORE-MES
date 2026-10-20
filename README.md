# TMI CORE V2

CNC atölyesi için üretim planlama ve izlenebilirlik sistemi. Kurum içi çalışır.

## Kurulum

```
npm install
copy .env.ornek .env      (değerleri doldur; varsayılan yoktur)
npm run goc               (göçleri uygula)
npm run yonetici -- <kullanici_adi> "<Ad Soyad>"   (ilk yönetici; parolayı sorar)
npm run gelistir:sunucu   (http://127.0.0.1:4100/api/saglik)
npm run gelistir:istemci  (http://127.0.0.1:4101)
```

Gereken: Node 24+, PostgreSQL, `tmiv2` ve `tmiv2_test` veritabanları.

`git worktree` ile açılan ağaca `.env` kopyalanmaz; betikler ana çalışma ağacındakini okur.

## Doğrulama

`npm run kontrol` tip denetimi, modül sınırı denetimi ve bütün testleri koşar.

Yapı ve kurallar: `CLAUDE.md`. Mimari kararlar: `belgeler/adr/`.
