# Başka modül istekleri (finans, tam teslim)

Yok. Finans başka modülün `disari.ts` dosyasını çağırmaz. Testler kisiler, oturum, denetim ve istek-kimligi modüllerinin var olan fonksiyonlarını kullanır; bunlar istek değildir.
Finansın verdiği (`sunucu/moduller/finans/disari.ts`): firmaAdlari, firmaVarMi, firmaAra, firmaOzeti (firma teslimiyle aynı, değişmedi).

## Satın almaya bilgi (oturtma, 08.10.2026)

Satın almanın `firma-gecici.ts`'te beklediği imzalarla fark ve kararlar UYUM-BORCU.md "Bağlamada kapanacak" 2-5'tedir (FN4: toplu `firmaOzetleri` Aşama 2'de finanstan; FN5: bütçeler ayrı). Finans bu dalda satın almaya yazmaz.

## Satın almaya istek: sipariş-fatura bağı (D6 b, 11.10.2026)

Finans hazır (`disari.ts`): `alisBelgeleri(db, firmaId): Promise<AlisBelgesi[]>` (id, belgeNo, belgeTarihi, aciklama, durum, satinAlmaSiparisi; tutar yok) ve
`belgeSiparisBagla(db, kisiId, { belgeId, siparisFirmaId, siparis: { talepId, teklifId } | null }): Promise<{ id, surum }>`.
İstenen: satın almada sipariş ekranında "Fatura" alanı (tedarikçinin alış faturalarından seçim, bağı kaldırma) ve ayrı bir yazma ucu (ör. `POST /satin-alma/siparisler/:talepId/:teklifId/fatura`, kendi işlemi); uç kendi transaction'ında siparişin firmasını `siparisFirmaId` olarak verir. Ret iletileri finanstan gelir.

## Satın almaya istek: faiz finanstan (12.10.2026, bağlamada kapanacak)

Finans hazır (`disari.ts`): `faizGetir(db, paraBirimi, tarih): Promise<{ aylikYuzde, gecerlilikBaslangic } | null>` o güne kadar başlamış son aylık faizi, `faizler(db, tarih)` hepsini döner; yoksa `null` (sıfır uydurulmaz).
İstenen: satın alma güncel aylık faizi `satin_alma_kur.aylik_faiz_yuzdesi` yerine finanstan okur; teklif ve siparişte o gün kullanılan faiz kendi kaydında saklanmaya devam eder, böylece yeni oran geçmiş teklifi değiştirmez. Satın alma ayarlarındaki faiz alanı kaldırılır ya da yalnız gösterilir; faiz `finans_faiz`'e yalnız finans ekranından girer.

## Satın almaya istek: kur ve faiz şeridi en üstte (kart #953, kullanıcı kararı 13.10.2026)

Finans hazır (istemci `finans/disari.ts`): `<KurFaizSeridi />`. Son kur ve faiz, kimin ne zaman girdiği; `finans.kur-yaz` olana kur ve faiz giriş formu. Kendi verisini okur (`GET /finans/kur-ozeti`), prop almaz; işlemi olmayana hiçbir şey çizmez.
İstenen: satın alma ana sayfasının en üstüne (başlığın altına, öteki kartlardan önce) bu bileşeni koymak. Satın alma kendi kur ayarını (`satin_alma_kur`) bağlamada finansa bırakır (UYUM-BORCU).

## recete-rota: istasyon saat maliyeti açıklaması (211 a)
KAPANDI (#1846): açıklama istasyon saat maliyeti alanının altında görünür metin.
- İstasyon saat maliyeti `POST /finans/maliyetler/istasyon/yaz` ile Reçete ve Rota ekranından girilir (`istemci/src/moduller/recete-rota/kopru.ts`, "Finans: birim maliyetler"). Giriş alanının yanına "Doğrudan gider: enerji, bakım, sarf (amortisman ve kira genel giderde)" yazılması istenir. Davranış değişmez.

## Sevkiyata istek: sevk işi özeti (260 a) — KARŞILANDI (#2063, FNS-68)
- Finans satış faturasını `finans_belge.sevkiyat_isi_id` ile sevk işine bağlar; bugün yalnız yabancı anahtar denetlenir.
- İstenen: `sevkiyat/disari.ts`'te `sevkIsiOzeti(db, id): Promise<{ tur: 'teslimat' | 'alim' | 'aktarma'; firmaId: number | null; siparisId: number | null; iptal: boolean } | null>` (yoksa `null`). Finans bununla yalnız iptal edilmemiş teslimatın, aynı firmaya (ve sevk siparişe bağlıysa aynı siparişe) faturalanmasına izin verir.
- Sevkiyatın firma ve sipariş bağı 261 a göçüyle gelirse alanlar oradan doldurulur; gelene dek `null` döner.

## Stoka istek: aylık emirsiz stok çıkışı (2623 a, 2594 b)
- Genel gider belgeden kaydı bu tutar olmadan satır yazmaz ("emirsiz stok çıkışı (diğer)" eksik kalır).
- İstenen (2714 ile güncellendi, 2709 c, 2710 b): `stok/disari.ts`'te `emirsizCikisTutari(db, ay: 'GGGG-AA'): Promise<{ tutar: number | null; eksik: string[] }>`: ay içindeki emre bağlı olmayan diğer, numune, fire çıkışları ve sayım eksiğinin miktar x son alış fiyatı toplamı (TL, kuruş). Son alışı bilinmeyen çıkış toplama girmez, tutarı null yapmaz; `eksik`'e okunur bir satırla yazılır (ör. "fiyatı bilinmeyen 2 çıkış"), Finans bunu öneride uyarı olarak gösterir. `tutar` yalnız hesap yapılamazsa null. Bağ `sunucu/kablolama.ts`'te `stokCikisiCozucusu` ile kurulur.

## İdari işlere istek: aylık araç masrafı (2614 2/2 a, 2594 b) — KALDIRILDI (2711 b, kart 2714)
- Araç gideri genel gidere yalnız Finans belgesinden girer; Finans `aracMasrafiCozucusu`'nu kaldırdı, bağ kurulmaz. `aylikAracMasrafi` (2708) Finans'ça kullanılmaz; kalıp kalmayacağı İdari İşler'in kararıdır.
- Eski istek: `idari-isler/disari.ts`'te `aylikAracMasrafi(db, ay: 'GGGG-AA'): Promise<number | null>`: bütün araçların o aydaki masraf toplamı (TL, kuruş); masraf yoksa 0, tutarı bilinmeyen masraf varsa `null`. Bağ `sunucu/kablolama.ts`'te `aracMasrafiCozucusu` ile kurulur.
