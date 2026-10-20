# Reçete ve Rota: bağlama yönergesi (Aşama 2)

Bu yönerge diğer projede uygulanacak. Bu pakette hiçbir şeyi uygulamaz. Taban `main` 3cbc270.

Kullanıcı kararları (13.10.2026):
- Emir verisi gerçek tablolarda tutulur.
- Malzeme ve rota da bağlanır, Arkon MES (Üretim Terminali) de bağlanır. Terminalin kendisi değişmez.
- Operatör ekranı kaldırıldı (bu pakette yapıldı).
- Reçete ve Rota'nın Üretim emirleri bölümü, ana menüdeki Üretim Emirleri'nin (`/emirler`) yerine geçer. Parti bölme ve birleştirme bu bölüme eklenir.

İddialar CLAUDE.md'deki üç türe ayrılır: DOĞRULANDI (dosya ve metin çapasıyla), VARSAYIM ve BİLMİYORUM.
- Prototip satır numaraları `istemci/src/moduller/recete-rota/cerceve/recete-rota-motoru.html` dosyasınındır.
- Tablo adları göçlerin son hâlinden alındı.

## 1. Yöntem
Prototip bütün durumunu tek nesnede tutuyor: `st`, satır 1147 `blank()`. Her değişiklikte nesnenin tamamını yazıyor. Bağlamanın ilkesi şudur:

1. **Okuma.** Sunucuda `recete-rota` modülüne `GET /recete-rota/durum` eklenir. Bu uç bağlı koleksiyonları diğer modüllerin `disari.ts` işlevleriyle okur ve prototipin `st` biçimine çevirir. Çeviri `kurallar.ts` içinde saf işlevlerle yapılır, böylece test edilebilir.
2. **Yazma.** Bağlı koleksiyonların tamamı geri yazılmaz; bütün durumu karşılaştırıp fark çıkarmak çakışmaya açıktır. Bunun yerine prototipteki ilgili eylem işleyicileri (`act(...)` içindeki `addItem`, `createOrder`, `releaseOrder`, `revSubmit` ve benzerleri) köprüdeki `window.tmi.komut(ad, govde)` çağrısına yönlendirilir.
   - Köprü bu çağrıyı ilgili modülün var olan ucuna iletir.
   - Komut başarılı olursa durum yeniden okunur. Hata olursa prototipin kendi uyarı satırında gösterilir.
3. **Bağlanmayan kısım.** Plan stüdyosu senaryoları, arayüz tercihleri ve aşağıda "karşılığı yok" denen alanlar `recete_rota_kayit` tablosunda kalır.
4. **Görünüm.** Prototipin görünümü değişmez. HTML'de yalnız veri giriş ve çıkış noktaları değişir.

## 2. Eşleme tablosu

### Malzemeler (`st.items`, sample 1241). Sahibi malzemeler modülü.
| Prototip | Depo | Not |
|---|---|---|
| id | `malzeme_katalog_karti.no` | Diğer modüller FK'yi buna verir |
| code | `stok_kodu` | Üretilmiş sütun (önek + sıra no) |
| name | `kayit.com.ad` | jsonb |
| type ham/yari/mamul | `tur` hammadde/yarimamul/mamul | Depoda ayrıca sarf, demirbaş ve hizmet var; prototip bunları göstermez |
| unit | `kayit.com.birim` | `malzeme_birimi.kod` |
| min | `stok_malzeme_ayari.kritik_seviye` | Sahibi stok modülü |
| stock | `stok_bakiye` toplamı (`stokMiktarlari`) | Salt okunur |
| cost | finans `finans_malzeme_maliyet.birim_maliyet` | Kart #1187; durum cevabının `maliyet` dilimi, yazma `POST /finans/maliyetler/malzeme/yaz` |

Yeni ürün açma (`createProduct` 4295) malzemeler kart akışına gider: `POST /malzeme-katalogu-kartlari/:kimlik/kaydet`. Kart taslak olarak açılır ve onay ister (`onay_durumu`). Prototipteki gibi anında kullanılamaz.

### Kaynaklar. Sahibi istasyonlar, kisiler ve vardiya modülleri.
| Prototip | Depo |
|---|---|
| wcs (id, code, name) | `is_merkezi` (id, kod, ad) |
| wcs.week {0..6: vardiya[]} | `vardiya_matrisi` (is_merkezi_id, gun 1-7, vardiya_id). Gün dönüşümü gerekir: prototipte 0 Pazar |
| stations (code, name, wcId) | `istasyon` (kod, ad, is_merkezi_id) |
| stations.eff, opPer | `istasyonlar_plan_ayari.verim_yuzde`, `operator_ihtiyaci` |
| stations.count | Aktif makine sayısı (`istasyondakiMakineler`); ayrı alan yok |
| stations.cost | finans `finans_istasyon_maliyet.saat_maliyeti` (kart #1187) |
| machines (code, name, stationId) | `makine` (kod, ad, istasyon_id) |
| machines.status aktif/bakim/ariza | `istasyonlar_makine_durumu.durum` calisir/bakim/ariza |
| opdefs (code, abbr, name, stationId, setup, cycle) | `istasyonlar_operasyon_tipi` (kod, kisaltma, ad, varsayilan_istasyon_id, varsayilan_ayar_dk, varsayilan_birim_dk). Kart #544: kullanılmış tipin kodu değişmez |
| people (name, code, role) | `kisi` (ad, sicil_no, gorev) |
| people.wcId | `istasyonlar.kisi_is_merkezi` |
| people.shiftId | `vardiya_kisi` |
| people.skills[istasyon] | `istasyonlar_yetkinlik` (kisi_id, istasyon_id) |
| people.cost | finans `finans_kisi_maliyet.saat_maliyeti` (kart #1187) |
| cal.shifts (start, end, breaks) | `vardiya` (baslangic, bitis), `vardiya_molasi` |
| cal.holidays | `vardiya_takvim_gunu` (tur tatil) |

### Rota (`st.routes`, `st.routeRevs`, satırlar 1274 ve 3437). Sahibi rota modülü.
| Prototip | Depo | Not |
|---|---|---|
| routeRevs.no A, B | `rota_revizyonu.harf` | |
| Durum taslak/onay/onayli/yururlukte | Durum taslak/onay_bekliyor/onayli/yururlukte (+iptal) | Depoda geçişler tetikleyiciyle kilitli, dört göz kuralı var; prototipte yok |
| steps.seq | `rota_adimi.op_no`, `sira` | |
| steps.opId | `operasyon_tipi_id` | |
| steps.stationId | **Karşılığı farklı** | `rota_adimi` istasyon değil makine ya da kişi tutar. Soru 3 |
| steps.machineId | `rota_adimi.makine_id` | İsteğe bağlı sabit makine; boşsa planlayıcı seçer. Makine seçiliyken adımın alternatif istasyonları ve paralel bölmesi planda kullanılmaz (ekranda uyarı çıkar). `makine_id` ile `kisi_id` birlikte dolu olamaz (`rota_adimi_tek_kaynak`) |
| setup, cycle | `ayar_suresi_dk`, `birim_sure_dk` | |
| dep bagimli/ortulu/bagimsiz | `bagimlilik` bekleyen/akisli/bagimsiz | VARSAYIM: anlamlar eşleşiyor, doğrulanmalı |
| depQty | `devir_adedi` | |
| rejectPct | `fire_payi_yuzde` | |
| split tek/bol, minLot | `makine_kullanimi` tek/paralel, `en_kucuk_parca` | |
| resetup | `yeniden_ayar` | |
| alts, altTimes | `rota_aday_kaynagi` (makine ya da kişi, kendi süreleriyle) | Soru 3 ile aynı fark |
| ins[] (itemId, qty, scrap) | `rota_bileseni` (malzeme_id, miktar, fire_yuzde) | |
| ins[].status, outItem, outStatus | Karşılığı yok | Statülü stok, soru 5 |
| outs[] kind yan | `rota_yan_urunu` | |
| routes.base (çıktı adedi) | Karşılığı yok | BİLMİYORUM |
| Talimat | `rota_talimati` | Prototipte yok; terminal bunu okur |

Rota komutları için uçlar `/rota/urunler/:urunId/taslak-ac` ve `/rota/revizyonlar/:id/{kaydet,onaya-gonder,geri-gonder,onayla,yururluge-al,iptal}`.

### Emirler (`st.orders`, satırlar 1301 ve 4456). Sahibi uretim-emirleri modülü.
| Prototip | Depo |
|---|---|
| no | `uretim_emri.emir_no` |
| itemId | `malzeme_no` |
| qty | `adet` |
| start, due | `baslangic`, `teslim` (date) |
| priority 1-4 | `oncelik` 1-4, aynı anlam |
| note | `aciklama` |
| rev | `kaynak_rota_revizyonu_id` |
| status taslak/serbest/uretimde/tamam/iptal | `durum` taslak/planli/basladi/bitti/iptal |
| created, doneAt (ms) | `acilma`, `bitis` (timestamptz) |
| opStatus, opProg (anahtar `emir\|düğüm\|adım`) | `uretim_emirleri_is_emri.durum` bekliyor/calisiyor/tamam ve `saglam_adet` |
| splitManual (plandaki parça bölme) | Karşılığı yok; yerinde kalır |
| Yeni: parti bölme ve birleştirme | `ust_emir_id`, `bolunme_sira`, `birlestigi_emir_id`, `birlesme_op_no` |

Emir komutları:
- **Aç:** `POST /rota/revizyonlar/:id/emre-kopyala`. Yalnız yürürlükteki revizyondan açılır; prototip onaylı ama yürürlükte olmayan revizyona da sabitleyebiliyor (satır 1657). Soru 6.
- **Serbest bırak:** `POST /adimli-emirler/:id/plana-al`.
- **İptal:** `POST /adimli-emirler/:id/iptal`.
- **Parti:** `POST /adimli-emirler/:id/{bol,birlestir,birlesme-plani}`. Kurallar `istemci/src/moduller/rota/PartiPaneli.tsx` içindeki `bolunebilirAdimlar`, `birlesmeAdaylari` ve `birlesmeHedefleri` işlevlerinden taşınır.

BİLMİYORUM: prototip tek emirde bütün ürün ağacını açıyor (`build`, satır 1442; düğüm yolu `nid`). Depoda yarı mamul için ayrı emir mi açıldığı, yoksa aynı emrin iş emri mi olduğu okunmadı. `uretimEmriAc` (`uretim-emirleri/is-emri-servis.ts:145`) Faz 4'ten önce okunmalı.

### Plan. Sahibi plan modülü.
| Prototip `settings` | Depo `plan_ayari` |
|---|---|
| rule oncelik/edd/cr/spt/fifo | kural oncelik/edd/cr/spt. **fifo yok** |
| dir ileri/geri | yon |
| buffer, freezeDays | tampon_gun, dondurma_gun |
| peopleLimit | personel_kisiti |
| ui.planDrafts | taslak_emirler |
| qorder | `plan_yerlesimi.elle_sira` |
| frozen | `plan_yerlesimi.dondurulmus` |
| assign (resId, personId) | `plan_yerlesimi.makine_id` / `kisi_id` |

Terminal sırayı `canliSira` (plan modülü) üzerinden okur. Prototipin plan motoru tarayıcıda çalışır. Soru 2.

### Stok. Sahibi stok modülü.
| Prototip | Depo |
|---|---|
| moves (türü `note` metninden çıkar) | `stok_hareketi.tur` giris/cikis/transfer/sayim_*, `giris_kaynagi` mal_kabul/uretim, `cikis_nedeni` uretime_sarf/sevk/fire... |
| Üretim girişi, emir tüketimi | `POST /stok/uretim-girisi`, `POST /stok/uretim-emirleri/:id/tamamla` |
| Sayım düzeltmesi | `POST /stok/sayim` |
| statuses, statusCards, statusStock | Karşılığı yok. Soru 5 |

### Terminal (Arkon, `/uretim-terminali`). Değişmez.
DOĞRULANDI: terminal emirleri `uretim-emirleri/disari.ts` üzerinden okur (`arkon/servis.ts:142` `tmiTaslaklari`). Rotalı emrin her iş emri ayrı bir paket olur (`tmi-ie-<iş emri>`). Operatör olayları şu işlevlere gider:

| Operatör olayı | Çağrılan işlev |
|---|---|
| Başlat / devam | `emirBaslat` / `emirDevam` |
| Duraklat | `emirDuraklat` |
| Sağlam sayım, hurda | `emirSayim` |
| Bitir | `emirBitir` |
| Durdur | `emirDurdur` (duruş nedeniyle) |

Bu yönlendirme `arkon/servis.ts:699` `tmiKomutuYurut` içindedir. Prototipin eski operatör eylemleri birebir bunlara karşılık gelir: `opStart`, `opPause`, `opAdd`, `opDone`, `opFault`. Emirler gerçek tablolarda olunca bağlantı kendiliğinden kurulur.

Not: `/terminal` adlı ikinci, yerel bir ekran da var. Menüde gizli; dokunulmaz.

## 3. Akış sırası ve kabul ölçütleri
Her faz ayrı kart ve ayrı daldır. Kullanıcı her fazı sunucuda deneyip "tamam" der.

1. **Faz 1, okuma köprüsü ve malzemeler.**
   - `GET /recete-rota/durum` yazılır; `st.items` gerçek kartlardan gelir.
   - Ürün açma kart akışına bağlanır.
   - Kabul: malzemelerde açılan kart Reçete ve Rota'da görünür, prototipte açılan ürün malzemelerde taslak kart olarak görünür, stok miktarı stok modülüyle aynıdır.
2. **Faz 2, kaynaklar.**
   - Kapsam: iş merkezi, istasyon, makine, operasyon tipi, kişi, yetkinlik, vardiya.
   - Kabul: Kaynaklar bölümündeki her değişiklik İstasyonlar, Kişiler ve Vardiya ekranlarında görünür; makine arızası iki tarafta aynıdır.
3. **Faz 3, rota.**
   - Kapsam: revizyon, adım, bileşen, yan ürün, onay ve yürürlük akışı.
   - Kabul: prototipte yürürlüğe alınan rota `GET /rota/urunler/:urunId` ile aynı adımları döner; dört göz kuralı çalışır.
4. **Faz 4, emirler.**
   - `/emirler` sayfası prototipin emir bölümünü açar ve eski `EmirlerEkrani` menüden kalkar.
   - Emir açma, serbest bırakma, iptal ve parti bölme/birleştirme çalışır.
   - Kabul: açılan ve serbest bırakılan emir Üretim Terminali'nde görünür; bölünen parti iki emir olarak iki tarafta görünür.
5. **Faz 5, terminal ilerlemesi.**
   - Kabul: terminalde başlatılan, sayılan ve bitirilen iş emri, prototipin emir ilerlemesinde, Plan'da ve Kanban'da görünür. Terminalde hiçbir dosya değişmez.
6. **Faz 6, plan ve stok.**
   - Plan ayarı ve sıra plan modülüne bağlanır.
   - Üretim girişi ve tüketim `stok_hareketi`ne yazılır.
   - Kabul: terminaldeki sıra Plan'daki sırayla aynıdır; emir bitince stok hareketi oluşur.

Her fazda şu denetimler yeşil olmalı: tam `kontrol`, `sinir -- --modul recete-rota` ve kart yorumunda `Audit:`. Yeni yabancı anahtarlar ayrı göçle gelir.

## 4. Kullanıcıya sorulacaklar (diğer projede, fazdan önce)
1. **Rota onayı.** Depodaki dört göz kuralı ve kilitli geçişler mi geçerli olacak, prototipin herkesin onaylayabildiği akışı mı? Neden: iki kural çelişiyor. Seçenekler: depo kuralı / prototip kuralı. Öneri: depo kuralı, çünkü onaylı karar.
2. **Plan motoru.** Plan sunucudaki plan modülünde mi hesaplansın, tarayıcıdaki prototip motorunda mı? Neden: terminal sırayı plan modülünden okuyor. Seçenekler: sunucu / prototip, sonucu sunucuya yazar. Öneri: prototip hesaplasın ve sonucu `plan_yerlesimi`ne yazsın; görünüm aynı kalır.
3. **Rota adımı kaynağı.** Prototip adımı istasyona bağlıyor, depo makineye ya da kişiye. Seçenekler: `rota_adimi`ne `istasyon_id` sütunu eklensin / adım istasyonun ilk makinesine bağlansın. Öneri: sütun eklensin. Bu bir şema işi.
4. **Maliyet alanları.** Malzeme, istasyon ve kişi maliyetleri nerede tutulsun? Seçenekler: `recete_rota_kayit`'ta kalsın / finans modülüne gitsin. Öneri: şimdilik kayıtta kalsın. KARAR (14.10.2026, kart #1187): finans modülüne gitti.
5. **Statülü stok.** Prototipteki KKB, KKO, RET gibi statüler ve statülü stok depoda yok. Seçenekler: kayıtta kalsın, stoğa yansımasın / stok modülüne statü eklensin. Öneri: kayıtta kalsın.
6. **Onaylı ama yürürlükte olmayan revizyondan emir.** Prototip buna izin veriyor, depo yalnız yürürlükteki revizyondan emir açıyor. Seçenekler: yalnız yürürlükteki / ikisi de. Öneri: yalnız yürürlükteki.
7. **fifo kuralı.** Plan kuralı fifo depoda yok. Seçenekler: `plan_ayari` kısıtına eklensin / menüden kalksın. Öneri: eklensin.
8. **Mevcut veri.** Prototip kaydındaki örnek veri taşınacak mı? Seçenekler: boş başla / sunucuda tek seferlik taşıma. Öneri: boş başla. Depoya gerçek veri girmez.
