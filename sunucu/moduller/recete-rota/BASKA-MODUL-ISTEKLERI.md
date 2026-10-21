# recete-rota: başka modül istekleri (teslim 20.10.2026)

Bu teslim başka modülün dosyasına dokunmaz. Aşama 1'de bağlantı gereken yer boş bırakıldı; aşağıdakiler Aşama 2'de, her biri ilgili modülün kartıyla ve o modülün `disari.ts`'iyle gelir.

| İsteyen yer | Gereken | Olası sahibi | Bugün |
|---|---|---|---|
| Fason planı, Kaynaklar > Fason ve aparat | Fason firma listesi: kod, ad (kapasite, süre, çıkış günü ve saati planlamada kalabilir) | musteri-tedarikci | Karşılandı: durum okuması aktif fason firmaları verir (`fasonFirms`); planlama sayfası bunları fasoncu olarak kurar (21.10.2026, 23 a). Kapasite, süre ve çıkış ayarı planlamada kalır. |
| Planlama örneği, ayar (23 a, 21.10.2026) | Örnek veride görevi tam "Ayarcı" olan iki kişi (`sunucu/moduller/kisiler/ornek-veri.ts`, `gorev`); planlama ayarcıyı kişi görevinden okur (`kisiGorevi`), ayarı olan adım ayarcısız yerleşmez | kisiler | Örnekte ayarcı yok; örnek plan ayar süreli adımları yerleştirmez. 298'deki Arkon "Ayarcı" çağrı ekibi rollere yönlenir, bu alanla ilgisi yoktur. |
| Planlama motoru, ilk parça onayı (`fai` adımı) | Onay süresi ve onayın kendisi: planlama onayı bekleyen süre olarak koyar | Kalite Merkezi | Süre kayıttaki adım alanından (`fai`) ve atölye genelinden (`faiSaat`); onay olayı okunmaz. |
| Canlıya al | Canlı planın yazılacağı tablo (emir no, OP no -> makine, başlangıç) ve sürümü | uretim-emirleri (220 a canlı plan) | Yalnız kayda yazılır (`st.tmiCanli`); sunucu planı güncellenmez. Reçete ve Rota çerçevesi kaydı okur (`curPlan`). |
| Canlıya al, operatör ekranı | Terminalin okuduğu plan sırası (istasyon başına iş listesi) | Arkon MES / Üretim Terminali | Terminal güncellenmez; bu teslim Arkon'a dokunmaz. |
| Planlama motoru, gerçekleşen | Başlamış ve biten adımlar, gerçek başlangıç ve bitiş saatleri | uretim-emirleri / terminal | Kayıttaki `opStatus`, `opProg` okunur; terminal kaydı okunmaz. |
| Malzeme satın alma planı | Açık satın alma siparişleri ve geliş tarihleri | malzemeler / satın alma | Kayıttaki `item.plan.tedarikGun` ile hesaplanır; açık sipariş okunmaz. |
| Maliyetler, Genel gider | Saatlik ücretler ve genel gider kalemleri | kisiler / finans | Kayıttaki `ucret`, `ayarciUcret`, `mesaiUcret` ve planlamanın kendi gider tablosu. |

DOĞRULANDI: 1., 3. ve 4. satır (FARK "Fason adım ve canlı plan", `zz28-rr-canli.betik` başlık yorumu, t163). VARSAYIM: 2. satır ve son üç satırın "Bugün" sütunu alan adlarından çıkarıldı, motor kodunda satır satır izlenmedi.
Bugün hiçbirinde veri uydurulmaz: kaynak yoksa alan boştur.

## plan (UE şeridi): başlamış adımın kalanı ve ortak motor (354, 391 a; ADR 0018 taslağı)

391 a (onaylı): başlamış adımın kalanını yalnız sunucu hesaplar, ortak motor onu kullanır. Bugün sunucu adetten (`plan/servis.ts`
`function gerceklesenler(`), motor geçen süreden (`engine.betik` `schedule`, `lowerBound`, `lbHeadsTails`) hesaplıyor; çerçeveye çalışan
adımın gerçekleşeni hiç gelmiyor.

1. Çalışan adımın gerçekleşeni dışarı verilsin: `canliOzeti` (ya da plan modülünün seçeceği ayrı okuma) iş başına `{ anahtar ('emirNo|opNo'),
   makineId, baslangic, sayimAni, kalanDk }`. `kalanDk` bugünkü `gerceklesenler` ile aynı hesap, verim uygulanmış (`gerceklesenAralik`
   içindeki `verimliSure`); `sayimAni` son sayım, yoksa başlama. Yeni hesap yazılmaz, var olan tek kaynak açılır (396 a, 397 a aynen).
2. ADR 0018 onaylanırsa: `plan/disari.ts` içinde `planMotoruCozucusu` kaydı (ADR 0006 madde 6); karşılığı Reçete ve Rota verir, bağ
   `sunucu/kablolama.ts`'te. Kuyruk yaz ve canlıya al komutlarında saatleri sunucu ortak motorla sabit sırayla yeniden kurar. Canlıya alma
   (356 b) ayrı onaydır; o güne kadar asıl plan `kurallar.ts` `oner` ile kalır.
3. Test: sayımı olan çalışan adımda okunan `kalanDk` plan ekranındaki bitişle aynıdır; sayımsız adımda ayar dahildir.

## Satış teklifi denemesi (Y4): sunucuda kaynak okuması çerçevedekiyle aynı olsun

Teklif denemesi planın girdisini sunucuda çerçevenin koduyla kurar (`motor/girdi.betik` `girdiKur`). Çerçeve kaynak okumasını istemcide
sahiplerin uçlarından toplar (`istemci/src/moduller/recete-rota/kopru.ts` `ekOzeti`, `kaynak-komutlari.ts` `takvimEki`); sunucuda
(`servis.ts` `kaynakOku`) aynısı için iki okuma eksik. Eksikken alan null'dır (çerçevenin okuyamadığı durumla aynı): takvim çalışmanın
kayıtlı takviminden gelir, kişinin görevi tek tek okunur.

| Sahibi | Gereken | Neden | Bugün |
|---|---|---|---|
| vardiya | `disari.ts`'ten kişi vardiyaları: `kisiVardiyalari(db): { kisiId, vardiyaId }[]` (`sorgular.ts`'teki var olan sorgu) | Takvim eki: iş merkezi haftası (`vardiyaMatrisi`, zaten dışarıda) ve kişi -> vardiya; ikisi birlikte yoksa takvim eki kurulmaz | `ek.takvim` null; çalışmanın kayıtlı haftası kullanılır. Kişi vardiyası değiştiyse sunucu planı çerçevedekinden ayrılır |
| kisiler | Toplu görev okuması: `kisiGorevleri(db, idler): Map<number, string \| null>` | Ayarcı görevden okunur (`gorev` "Ayarcı"); bugün kişi başına bir sorgu | `kisiGorevi(db, id)` kişi başına çağrılıyor |

VARSAYIM: iki okuma da var olan sorgunun dışarı açılmasıdır, yeni hesap gerekmez (sorgular okundu, servis katmanı izlenmedi).
