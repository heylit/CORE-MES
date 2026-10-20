# İstasyonlar: eski kod geçmişi ve eskiKoddanKimlikCoz (AG2-2) - yazım listesi

Durum: liste. Kaynak: kullanıcı kararı AG2-2 a (09.10.2026, farkla: geçmişi istasyonlar tutar), Arkon isteği `/mnt/project-files/bagla/arkon-AG2-tesis-kodu.md` bölüm 7.

## Kart
Ayrı kart öneriyorum: "İstasyonlar: tesis kodu geçmişi ve eski koddan kimlik çözme (AG2-2)". Neden: yeni tablo ve göç, üç düzeyin
güncelleme yolu değişiyor, Arkon göçü buna bağlı; #368 (üretim alanı) çekme isteğinde ve tek konulu kalsın. Dal `<kart>-istasyonlar-kod-gecmisi`.

## Göç (yeni, boş tablo; dolu tabloya dokunmaz)
- `istasyonlar_kod_gecmisi`: `id` identity PK; `is_merkezi_id`, `istasyon_id`, `makine_id` (her biri `REFERENCES ... ON DELETE CASCADE`, boş olabilir),
  kısıt "üçünden tam biri dolu"; `kod text NOT NULL`; `birakildi timestamptz NOT NULL DEFAULT now()`. Dizin: `(kod)`.
- Göç önce sayar (yeni tablo boş başlar; üç kaynak tablonun satır sayısı iletiyle yazılır, hiçbir satır değişmez).
- Geçmiş göçten itibaren başlar: göçten önceki kod değişiklikleri bilinmiyor (BİLMİYORUM: bugün kayıt yok), geriye doldurma yok.
- Silinen kaydın geçmişi de silinir: kayıt yalnız kullanılmıyorsa silinebiliyor; çözücü silinmiş kimlik döndürmesin.

## Sunucu
- `isMerkeziGuncelle`, `istasyonGuncelle`, `makineGuncelle`: kod değişirse aynı işlemde eski kod geçmişe yazılır; kod aynıysa satır yazılmaz. Eski satıra dokunulmaz.
- `disari.ts` (Arkon'un önerdiği imza, itirazım yok):
  ```ts
  export type TesisDuzeyi = 'is_merkezi' | 'istasyon' | 'makine';
  export function eskiKoddanKimlikCoz(db: Db, duzey: TesisDuzeyi, kodlar: readonly string[], zaman?: Date): Promise<Map<string, number>>;
  ```
  Davranış: tek sorgu; boş dizide sorgu yok; kod kırpılıp büyük harfe çevrilerek eşlenir, haritanın anahtarı çağıranın verdiği metindir.
  Bir kaydın `zaman` anındaki kodu: o andan sonra bırakılan en erken geçmiş satırının kodu, yoksa bugünkü kodu. Aynı kod iki kayda verildiyse o anda o kodu taşıyan döner;
  `zaman` yoksa bugünkü sahibi, bugün sahibi yoksa en son bırakan. Haritada olmayan kod hiç kullanılmamıştır ya da kaydı silinmiştir.
- Testler: kod değişince geçmiş satırı (aynı kodla güncellemede yok), toplu çözme, zaman anındaki sahip, kod el değiştirdiğinde iki an, silinen kayıt, boş dizi.

## Ekran
Yok.

## Diğer parçalar
- Arkon: çözücü birleşince kendi göçü ve okuması (Arkon listesi). İstasyonlar Arkon'a yazmaz.

## Sorulur
GG1. Yeni geçmiş tablosu için göç onayı (yeni ve boş tablo; dolu tablolarda satır değişmez). a) Onay (öneri) b) Bekle.
