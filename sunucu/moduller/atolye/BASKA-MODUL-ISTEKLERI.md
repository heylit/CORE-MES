# BASKA-MODUL-ISTEKLERI: atolye

Hiçbirinin sahtesi kurulmadı. Bugün eksik olanın yerine ne yapıldığı her maddede yazılı.

## 1. uretim-emirleri: istasyon durumu (`disari.ts`)

- **Neden:** Haritada istasyonun rengi, özet sayılar ve "sağlam" toplamı bugün istemcide çevriliyor. Ekran, `GET /uretim-emirleri?durum=basladi` cevabını okuyup istasyona göre eşliyor (`istemci/src/moduller/atolye/kurallar.ts` `istasyonGorunumu`, `ozetle`). Kuralın sunucuda olması için emir modülü durum vermeli; atolye de `GET /atolye/salonlar/:id/durum` ucuyla salonun durumunu tek cevapta döner.
- **Önerilen imza:**

```ts
export interface IstasyonDurumu {
  istasyonId: number;
  emir: { id: number; emirNo: string; parcaNo: string; parcaAd: string; adet: number; baslama: string } | null;
  calisma: 'calisiyor' | 'durakli' | 'durdu' | null; // başlamış emir yoksa null
  saglam: number | null;
  hurda: number | null;
  durusNedeni: { id: number; ad: string } | null;
}
export function istasyonDurumlari(db: Db, istasyonIdleri: readonly number[]): Promise<IstasyonDurumu[]>;
```

## 2. uretim-emirleri: son olaylar (olay akışı)

- **Neden:** Prototipteki "Olay akışı" paneli (istasyon durdu, başladı, bitti) için genel bir defter ucu ya da işlevi yok.
- **Önerilen imza:** `sonOlaylar(db, { sinir: number; istasyonIdleri?: number[] }): Promise<{ zaman: string; istasyon: { id; ad }; olay: KayitOlayi; emirNo: string; neden: string | null }[]>`. İstemci ucu `GET /uretim-emirleri/olaylar?sinir=40` olarak da açılabilir.
- **Bugün:** panel yok (ON-PAKET kapsam tablosu).

## 3. istasyonlar (istemci): tip etiketleri

- **Neden:** `istemci/src/moduller/istasyonlar/etiketler.ts` içindeki tip adları başka modüle açık değil. Atolye aynı adları kendi `kurallar.ts`'inde (`ISTASYON_TIPI_ADI`, `Record<IstasyonTipi, string>`) tutuyor.
- **İstek:** `istemci/src/moduller/istasyonlar/disari.ts`'e `TIP_ADLARI` (ya da eşdeğeri) eklensin; atolye kopyasını siler.

## 4. stok (modül yok): göz bağlantısı

- **Neden:** Prototipteki kritik stok, toplama listesi ve göz stoku.
- **Bağlantı:** Stok, göze `atolye_goz.id` ile yabancı anahtarla bağlanır. Bağlı göz, raf küçültülünce silinmez (ATL-12, yabancı anahtar durdurur).
- **Atolyenin vereceği:** `gozBul(db, adres): Promise<{ gozId; rafId; bolme; kat; goz } | null>` ve `gozAdresi(db, gozId): Promise<string | null>` (atolye `disari.ts`, stok gelince).

## 5. stok (modül yok): göz ve kalem başına adet

- **Neden:** Kalemin gözdeki yeri ve gözün doluluğu atölyede tutuluyor (`atolye_goz_kalemi`, ATL-29; kullanıcı kararı: "göz ataması + doluluk"). Adet, giriş-çıkış ve hareket stok modülünündür; atölye bunları tutmaz.
- **İstenen (stok gelince):** göz kalemi başına adet: `disari.ts` `gozAdetleri(db, gozIdler): Promise<Map<number, { kodAnahtari: string; adet: number }[]>>` ya da aynı içerikte okuma ucu. Atölye göz panelinde ve parçalar listesinde adedi gösterir; doluluk elle kalır (adetten hacim hesabı için kalem ölçüsü gerekir, bugün yok).
- **Atolyenin vereceği:** göz bağlantısı (madde 4) ve göz kalemi listesi (`GET /atolye/goz-kalemleri`).
- **Bugün:** Önceki yer tutucu (`GET /stok/goz-ozetleri`, `stok.oku`) kaldırıldı; istemci stok ucunu sormaz. Uç ve işlev adı VARSAYIM.

## 6. cizimler: kayıtlara bağlı belgeler tek sorguda (`disari.ts`, kart #921)

- **Neden:** Yerleşim cevabı her istasyonun Çizim Merkezi modelini ister; bugün istasyon başına bir `kaydaBagliBelgeler(db, 'istasyonlar', id)` sorgusu atılıyor (fabrika cevabında bütün istasyonlar kadar).
- **Önerilen imza:** `kayitlaraBagliBelgeler(db, hedefModul: BagModulu, hedefIdler: readonly number[]): Promise<Map<number, BagliBelge[]>>`.
- **Karşılandı:** cizimler #925 ile geldi; `yerlesim` bölümün istasyonlarını tek çağrıyla okur (`servis.ts` `merkezModeliSec`). Tek istasyonluk okuma (bağlama komutu, model dosyası) `kaydaBagliBelgeler` ile kalır.

## 7. malzemeler: stok kodlarından kart numaraları tek sorguda (`disari.ts`, kart #1123)

- **Neden:** Harita her kalem kodunu karta çözer (ATL-36); bugün tekil kod başına bir `malzemeNoKoddan(db, kod)` sorgusu atılıyor.
- **Önerilen imza:** `malzemeNolariKoddan(db, stokKodlari: readonly string[]): Promise<Map<string, number>>` (anahtar büyük harfe çevrilmiş stok kodu; boş dizide sorgu yok).
- **Bugün:** tek tek çağrı; kalem sayısı yüzleri bulunca gelir.

## 8. istasyonlar: makineler tek sorguda, pasifler dahil (`disari.ts`, kart #1120)

- **Neden:** Yerleşim cevabı yerleşik her makineyi ister; pasife alınmış ama yerleşik makine `aktifMakineler` listesinde yok, tek tek `makineGetir` ile okunuyor.
- **Önerilen imza:** `makineleriGetir(db, idler: readonly number[]): Promise<Map<number, Makine>>` (pasifler dahil; boş dizide sorgu yok).
- **Bugün:** aktifler tek sorguda, listede olmayan makine tek tek.

## 9. arkon: son terminal olayları için okuma ucu (kart #1122)

- **Neden:** Haritanın "Son hareketler" listesi Arkon olaylarını da göstermeli (ölçüm, çağrı). Atolye sunucusu `arkon/disari.ts` ithal edemez:
  arkon stoku, stok atolyeyi ithal eder; atolye -> arkon döngü kurar (ADR 0006).
- **Önerilen uç:** `GET /arkon/son-olaylar?sonraId=<id>&sayi=50` (Arkon modülünde), cevap `ArkonSonOlay[]` (kimlik, tür, zaman, istasyon kodu ve kimliği,
  emir no, kişi adı). Yetki: Arkon okuma işlemleri ya da `sayfa.atolye` (yetki kapsamı Arkon sahibinin ve kullanıcının kararı).
- **Karşılandı:** #1160 ile `GET /arkon/son-olaylar` açıldı (yetki `sayfa.atolye` dahil, iş merkezi kapsamı uçta); liste onu okur (ATL-40).

