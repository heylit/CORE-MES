# Arkon AG2 (AA7): tesis kodu dönüşümü, liste

Yazım yok. Bu liste onay içindir; onaydan önce göç, kod ya da veri değişikliği yapılmaz.
Kart: #199. Kaynak: kesif turu, dosya ve satır çapası ile (DOĞRULANDI); satır sayıları sunucuda sayılmadan BİLMİYORUM.

## 1. Dönüşümün dokunduğu yerler

### 1a. Tesis ayarı (kv/plant)
- Saklanmaz; her okumada TMI istasyon, iş merkezi ve makine tablolarından üretilir: `sunucu/moduller/arkon/servis.ts:72`, `:226-230`;
  `kurallar.ts:151-160` (wcs/sts/mcs, `id` alanı TMI `kod`). DOĞRULANDI.
- Sonuç: tesis ayarında taşınacak satır yok; dönüşüm burada yalnız "id olarak ne gönderilir" kararıdır.
- Sunucu bugün kodu iş merkezine yalnız kapsam (scope) için çözer: `kurallar.ts:945-953`. DOĞRULANDI.
- TMI istasyon kodu değiştirilebilir (`istasyonlar_tesis.sql:1`); eski kayıtlardaki kod o zaman boşa düşer. Dönüşümün asıl nedeni budur. DOĞRULANDI.

### 1b. Kayıtlardaki makine ve iş merkezi
- `arkon_kayit.makine`, `arkon_kayit.is_merkezi` (text, kod tutar): `sunucu/gocler/20261007151000_arkon.sql:21-22`. DOĞRULANDI.
- `arkon_kayit` yalnız eklenir; UPDATE/DELETE/TRUNCATE tetikleyiciyle engellidir (aynı göç, `arkon_kayit_degismez`). Dolu satırı değiştirmek tetikleyiciyi kapatmayı gerektirir. DOĞRULANDI.
- `arkon_kayit.govde` içinde aynı kodlar (machine, mc, wc, st). DOĞRULANDI.
- `arkon_belge.govde` içinde kodlar: depolar pkgs, requests, maint, logi, downs (machine, mc, wc, st, scope/target alanları). DOĞRULANDI.

### 1c. Tabletteki yerel kayıt (sunucuda değil)
- LS anahtarları: `station`, `lastState:<kod>`, `pvStation`, `boardWc`, `planWc`. Kod değişirse tablet eski kodla açılır. DOĞRULANDI.

### 1d. Arkon ekranının kod beklediği yerler (arkon/web/src)
- `app/ortak-ayarlar.ts:27-33` (tesis listesi kod anahtarlı)
- `operator.ts` MACHINE ve LS okuma/yazma
- `pano-planlama.ts:92-98`, `:195-204`, `:303-304` (pano/planlama süzgeci ve gruplama)
- `bakim-raporlar.ts:94-146` (bakım raporu makine gruplaması)
- `hazirlik.ts` (istasyon seçimi)
Hepsi `id` alanını string kod olarak karşılaştırır. DOĞRULANDI.

## 2. Etkilenecek satır sayısı
- Yerel veritabanında veri yok; gerçek sayı BİLMİYORUM.
- Sunucuda koşulacak salt okuma sayımı (hiçbir satır değişmez):
```sql
SELECT 'arkon_kayit' AS tablo, count(*) FILTER (WHERE makine IS NOT NULL OR is_merkezi IS NOT NULL) AS kodlu, count(*) AS toplam FROM arkon_kayit
UNION ALL
SELECT 'arkon_belge:' || depo, count(*) FILTER (WHERE govde::text ~ '"(machine|mc|wc|st|scope|target)"'), count(*)
FROM arkon_belge WHERE depo IN ('pkgs','requests','maint','logi','downs') GROUP BY depo;
```
- Kuralınız gereği: göç önce bu sayımı yapar; etkilenecek satır varsa durur ve bildirir.

## 3. Yöntem ve geri alma yolu
- A (öneri, C ile birlikte): okumada çözme. Yeni tablo `arkon_eski_kod (tur, kod, tmi_id, gecerli_bitis)`; dolu tablolar değişmez.
  Geri alma: tablo ve okuma katmanı kaldırılır; veri kaybı yok.
- B: dolu tablolara id sütunu ve doldurma. `arkon_kayit` tetikleyicisinin kapatılması gerekir (yalnız ekleme ilkesini deler).
  Geri alma: sütun düşürülür; asıl risk tetikleyicinin kapalı kaldığı penceredir.
- C: yalnız yeni yazımlarda id (boş olabilen sütun, ekleme anında doldurulur); eski satıra dokunulmaz.
  Geri alma: sütun düşürülür.
- Öneri A+C: ekrana kod gitmeye devam eder (ekran değişmez); sunucu kayıtta id de tutar, eski kodu tablodan çözer.

## 4. Ekranın dönüşümden sonra aynı çalıştığının gösterilmesi
- Sunucu testleri (var, genişletilir): `kurallar.test.ts:55`, `arkon.test.ts:163`, `guvenlik.test.ts:1497` (tesis üretimi, kapsam çözümü).
  Eklenecek: kod değişince eski kayıt yeni istasyona çözülür; bilinmeyen kod davranışı.
- İstemci: tesis/kod davranışını ölçen test yok (DOĞRULANDI); A+C'de ekran değişmediği için yeni istemci testi gerekmez (VARSAYIM).
- Tarayıcı: `/mnt/project-files/arkon/ikinci-tur/betikler` betikleri dönüşümden önce ve sonra aynı veriyle koşulur; ekran görüntüleri ve operatör/pano/bakım akışı yan yana konur.

## 5. Sorular (onay için)
1. Yöntem: A+C / A / B / C. Neden: B dolu ve yalnız eklenen tabloyu değiştirir. Öneri: A+C.
2. TMI'de istasyon kodu değişince eski kod: eski-kod tablosuna otomatik yazılsın / elle girilsin. Neden: otomatik yazım TMI modülünden olay ister (BASKA-MODUL-ISTEKLERI). Öneri: otomatik.
3. Ekran sınırında string kod kalsın / ekran id'ye geçsin. Neden: geçiş ekranı değiştirir (teslim olduğu gibi alınır). Öneri: kalsın.
4. Bilinmeyen kodla gelen kayıt: reddedilsin / kabul edilip id boş kalsın. Neden: tablet eski LS koduyla yazabilir; ret üretim kaydını düşürür. Öneri: kabul, id boş, borca yaz.
5. Tarayıcıyla önce/sonra karşılaştırması: koşulsun / yalnız sunucu testi. Neden: ekranda istemci testi yok. Öneri: koşulsun.

## 6. Kararlar (kullanıcı, 09.10.2026)
- AG2-1 a: A+C. AG2-3 a: ekrana kod gider. AG2-4 a: bilinmeyen kod kabul, kimlik boş, borca yazılır. AG2-5 a: tarayıcıda önce/sonra.
- AG2-2 a, farkla: eski kod geçmişini Arkon değil İSTASYONLAR tutar; kod değişince eski kodu kendi tablosuna kendisi yazar ve `disari.ts`'te çözücü açar; Arkon onu okur. Arkon'da `arkon_eski_kod` tablosu YOK (bölüm 3'teki A bununla değişti).
- Sayım sorgusu göçün ilk adımıdır; etkilenecek satır varsa göç durur ve bildirir.

## 7. İstasyonlar modülüne istek (önerilen imza)
```ts
// sunucu/moduller/istasyonlar/disari.ts
export type TesisDuzeyi = 'is_merkezi' | 'istasyon' | 'makine';
// Kodları kimliğe çözer: bugünkü kod ve geçmişteki eski kodlar. Haritada olmayan kod hiç kullanılmamıştır.
// Aynı kod zaman içinde iki kayda verildiyse `zaman` anında geçerli olan döner; verilmezse bugünkü sahibi, yoksa en son bırakan.
export function eskiKoddanKimlikCoz(
  db: Db, duzey: TesisDuzeyi, kodlar: readonly string[], zaman?: Date,
): Promise<Map<string, number>>;
```
- Toplu çağrı (tek sorgu): Arkon bir istekte çok satır çözer; kod başına sorgu olmaz.
- İstasyonlar tarafı (onların işi, VARSAYIM): üç düzey için tek geçmiş tablosu (düzey, kayıt kimliği, eski kod, bırakıldığı an), kod güncellemesi aynı işlemde yazar; eski satıra dokunulmaz.
- Arkon kullanımı: yazımda kod kimliğe çözülür ve yeni boş olabilen sütunlara yazılır (C); okumada eski kayıttaki kod bu çözücüyle bugünkü kayda bağlanır (A). Ekrana yine bugünkü kod gider.
- Sıra: önce istasyonlar çözücüsü birleşir, sonra Arkon göçü ve okuma. C (yeni yazımda kimlik) bugünkü kodla çözülebildiği için çözücüden bağımsız yazılabilir.
