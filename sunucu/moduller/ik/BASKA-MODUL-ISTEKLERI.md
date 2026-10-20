# Başka modül istekleri (ik)

## kisiler: `kisiSecenekleri(db)`
Neden: personel kartındaki "TMI kullanıcısı" alanı (kullanıcı kararı 2, 08.10.2026) etkin kişilerden seçilir; kişi personel
kaydıyla bu bağla eşleşir (IK-25). kisiler/disari.ts bugün kişi listesi açmıyor (DOĞRULANDI: dışa açtıkları arasında yok;
`kisiAdlari` yalnız verilen kimliklerin adını döndürür). v1'deki `kisiSicilNo` isteği **geri çekildi**.
Girmezse: teslim derlenmez (`servis.ts` bu fonksiyonu çağırır). Yerel kopyada aynen eklendi, testler bununla koştu.

`sunucu/moduller/kisiler/sorgular.ts` sonuna:
```ts
// Etkin kişilerin seçim listesi (başka modüllerin kişi seçme alanı için): kimlik, ad, sicil no.
export function etkinKisiSecenekleri(db: Db): Promise<{ id: number; ad: string; sicilNo: string | null }[]> {
  return db.sorgu('SELECT id, ad, sicil_no AS "sicilNo" FROM kisi WHERE aktif ORDER BY ad, id');
}
```
`sunucu/moduller/kisiler/disari.ts`: ithal satırı `import { etkinKisiSecenekleri, kisiAdlariniBul } from './sorgular.ts';` ve sonuna:
```ts
// Etkin kişilerin seçim listesi (kimlik, ad, sicil no). İK personel kartındaki "TMI kullanıcısı" alanı bununla dolar.
export function kisiSecenekleri(db: Db): Promise<{ id: number; ad: string; sicilNo: string | null }[]> {
  return etkinKisiSecenekleri(db);
}
```

## istasyonlar
İstek yok: `isMerkezleri(db, { pasiflerDahil })` ve `kisininIzinliIsMerkezleri(db, kisiId)` var (DOĞRULANDI:
`sunucu/moduller/istasyonlar/disari.ts`). İK tabloları `is_merkezi (id)` sütununa yabancı anahtarla bağlanır.
