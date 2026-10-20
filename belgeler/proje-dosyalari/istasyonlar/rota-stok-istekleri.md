# İstasyonlar: rota ve stok istekleri (öneri listesi, yazım yok)

Kaynak: `origin/260-rota` `sunucu/moduller/rota/BASKA-MODUL-ISTEKLERI.md`, `UYUM-BORCU.md` B13-B14, `baglanti.ts`;
`origin/206-stok-depo` `sunucu/moduller/stok/BASKA-MODUL-ISTEKLERI.md` (DOĞRULANDI: dosyalar okundu, 08.10.2026).
Yazım kullanıcının "yaz"ından sonra. Öneri: tek kart "İstasyonlar: rota ve stok için katalog ve kişi okuma" (rota #260 ve stok #206'ya bağlı).

## A. Dolu tabloya eklenecek sütunlar

`istasyonlar_operasyon_tipi` (96 satır dolu). Hepsi boş olabilir; varsayılan yok, satır silinmez, değer değişmez.

| Sütun | Tip | Neden | Not |
|---|---|---|---|
| `kisaltma` | text, en çok 6 harf ya da rakam | rota ekranı adımda kısaltma gösterir | Boşsa rota kodu gösterir (bugünkü geçici eşlem gibi) |
| `varsayilan_ayar_dk` | numeric(8,2) | rota adımına önerilen ayar süresi | Boş = bilinmiyor, sıfır uydurulmaz |
| `varsayilan_birim_dk` | numeric(10,4) | rota adımına önerilen birim süre | Aynı |
| `varsayilan_istasyon_id` | int REFERENCES istasyon | adım açılınca önerilen istasyon | Pasif istasyon kalabilir |
| `sira` | int | rotanın katalog sırası | Gerekli mi soru 3 |

`istasyon` (dolu tablo), yalnız stok için ve Aşama 2'de: üretim alanı konumu olan istasyonu ayırmak için soru 4.

## B. Yeni ya da değişen `disari.ts` fonksiyonları

```ts
// Sütunlar gelince operasyonTipleri dönüşü genişler (rotanın operasyonKatalogu eşlemi kalkar):
export interface OperasyonTipi { id; kod; ad; grup; aktif; kisaltma: string | null; varsayilanAyarDk: string | null;
  varsayilanBirimDk: string | null; varsayilanIstasyonId: number | null; sira: number | null }
operasyonTipleri(db: Db, { pasiflerDahil }?): Promise<OperasyonTipi[]>; // imza aynı

// Rota bugün her aktif istasyon için ayrı sorgu atıyor (baglanti.ts istasyonKisileri). Tek sorgu:
istasyonKisiAtamalari(db: Db, g?: { istasyonId?: number; kisiId?: number; tarih?: string }):
  Promise<{ istasyonId: number; kisiId: number; yuzde: string }[]>; // makineKisiAtamalari ile aynı kalıp

// Kişi başına tek istasyon gerekiyorsa (soru 5):
kisininIstasyonu(db: Db, kisiId: number, tarih?: string): Promise<number | null>;
```

Stok için yeni fonksiyon gerekmez: `istasyonAdlari(db, idler)` ve `istasyonGetir(db, id)` var. Bayrak gelirse `istasyonGetir` dönüşüne alan eklenir.

## C. Rota bağlamada (Aşama 2, bu kartta değil)

- B13: okuma uçlarının `biri` listesine `sayfa.rota` (rol kararıyla); rota bölümleri güncellemede `surum` gönderir.
- B14: rota Operasyonlar bölümü katalog şemasını (büyük harf kod, grup) okur; rotanın aradığı küçük harfli kodlar
  (depo_girisi, uretim, muayene, tesviye, markalama, ozel_proses, yuzey_islem, sevk) katalogda yok, eşlem gerekir (soru 2).
