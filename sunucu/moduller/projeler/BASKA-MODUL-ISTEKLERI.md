# Başka modül istekleri: projeler

Yok. Kullanılan var olan fonksiyonlar: `finans/disari.ts` `firmaAdlari`, `firmaAra`, `firmaVarMi`.

Bu modülün verdiği (üretim emirleri için, imzalar o konuya iletildi):
- `projeNo(db, projeId): Promise<string | null>`
- `projeGetir(db, projeId): Promise<ProjeOzeti | null>`
- `projeKoduIleBul(db, kod): Promise<ProjeOzeti | null>`
- `projeSecenekleri(db, { yalnizAktif?, firmaId? }?): Promise<ProjeOzeti[]>`
- `projeAdlari(db, idler): Promise<Map<number, string>>`
