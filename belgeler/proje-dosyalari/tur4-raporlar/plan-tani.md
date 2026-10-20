# Plan tanisi (kart #261) — YENI MODUL GELINCE adim 1-3

Salt okuma. Depo: heylit/TMICOREV2, main `f4d1837` (DOGRULANDI); harita "Goc sirasi" 42 goc, son `20261008111500_istasyonlar_operasyon_tipi_surum.sql` (DOGRULANDI `npm run harita`).
Kaynak: `/mnt/project-files/TMICOREV2-TESLİMLER/teslim-rota-plan-c2c9871 08.10.26 14.34/` (rota ile ayni klasor; plan dosyalari asagida). Rota tarafi: `rota-tani.md`.

## 1. Tani

- Ad `plan`. Kapsam: is emirlerini makine ya da kisiye ve zamana yerlestirir (uretim emrini degil); motorla oneri, surukle-tasi, kuyruk sirasi, kilit; studyo (senaryo, canliya alma).
- Klasorler: `sunucu/moduller/plan`, `paylasilan/{sozlesme,islemler}/plan.ts`, goc `20261008100000_plan_tablolar.sql`. **Istemci klasoru yok**: plan ekranlari rota istemcisinde (DOGRULANDI: `istemci/src/moduller/` altinda yalniz `rota/`; FARK-plan "Plan ekranlari Rota istemcisindedir (P2)").

## Hangi parca hangi module ait

| Parca | Modul | Not |
|---|---|---|
| `sunucu/moduller/plan/*`, goc, `paylasilan/sozlesme/plan.ts`, `paylasilan/islemler/plan.ts` | plan | Ayrilabilir |
| `istemci/src/moduller/rota/PlanEkrani.tsx`, `KanbanEkrani.tsx`, `PlanStudyosuEkrani.tsx`, `plan.css` (~440 satir) | plan ekrani, rota klasorunde | Ayrilamayan ortak: rota `rotalar.tsx`, `bolumler.ts`, `ROTA_IKINCI_MENU`, `Rotalar.test.tsx` (plan, Kanban, studyo testleri ayni dosyada), ortak `gorunum.ts`/`anahtarlar.ts` |
| `rota/disari.ts` `revizyonGetir` | rota | Plan okur (aday kaynak uyarisi) |

## a) Dosyanin icinde ne var (plan parcasi)

| Tur | Dosyalar |
|---|---|
| Sunucu | `servis.ts` (22 KB), `sorgular.ts` (5.6 KB), `kurallar.ts` (6.5 KB: sure, bosluk, bagimlilik, motor, uyarilar, gostergeler), `uclar.ts` (14 uc: 2 GET, 12 POST), `disari.ts` (bos; plan en ustte), `UYUM-BORCU.md` (P-B1..P-B8) |
| Goc | `20261008100000_plan_tablolar.sql`: plan_durumu (tek satir plan surumu), plan_yerlesimi, plan_senaryosu, plan_senaryo_yerlesimi |
| Paylasilan | `sozlesme/plan.ts` (3.5 KB), `islemler/plan.ts` (plan.yaz, plan.kilitle, plan.studyo, plan.canliya-al) |
| Istemci | yok (rota klasorunde, yukarida) |
| Testler | `kurallar.test.ts` (4 saf), `plan.test.ts` (6 test, gercek PostgreSQL), ekran testleri `Rotalar.test.tsx` icinde (3) |
| Belgeler | FARK-plan, CEKIRDEK-ISTEKLERI-plan, BASKA-MODUL-ISTEKLERI-plan, KURAL-TEST-plan (PL-01, PL-02, P1, P3, P4, P5-a..e, P5-u, KY-01), ON-PAKET-plan (surum 3, kararlar P1-P5), ORTAKLIK-plan, GUVENLIK-DENETIMI-plan, UYGULA-plan |
| Eksik | `sayfalar/plan.ts` yok (karar P2 geregi). Prototip teslimde yok. |

## b) Gelenin turu

Yazilmis kod, taban `c2c9871` (UYGULA-plan.md). Depoda plan modulu yok; yalniz uc yer tutucu sayfa var: `/cizelge` (Planlama), `/matris` (Planlama), `/kuyruk` (Uretim; operatorde de gorunur) (DOGRULANDI `paylasilan/sayfalar/{cizelge,matris,kuyruk}.ts`, rol satirlari `20261006092612_kisiler_roller.sql`: planlamaci uc sayfa, operator `sayfa.kuyruk`). Yazarin kostugu (gecici karsiliklarla): plan sunucu 6/6, saf 4/4, ekran 19/19, `kontrol` 1024/1024 (FARK-plan). Benim tarafimdan CALISTIRILMADI.

## Ayni ekran iki kez geliyor mu

Evet, islevce: depodaki yer tutucular ile teslimdeki ekranlar ayni isi goruyor. `/cizelge` ~ Rota > Plan (PlanEkrani: makine/kisi cizelgesi), `/matris` ~ Rota > Plan icindeki doluluk matrisi, `/kuyruk` ~ Rota > Kanban (kaynak basina sira). Teslim yer tutucularin kaldirilmasini cekirdek istegi olarak yaziyor (CEKIRDEK-ISTEKLERI-plan madde 2). Kod olarak iki kez gelmiyor (yer tutucularin ekrani `YapimAsamasinda`). Soru P1.

## c) Cakisma taramasi

**Baska modulde olan (oradan okunur)**
- Is emri, durumu, teslim, sure, bagimlilik: uretim-emirleri (`planlanacakIsEmirleri`; main'de YOK, UE disarida). `is_emri_id` FK'siz (P-B2). SABIT KIMLIK "uretim kaydi uretim-emirleri" ile uyumlu: plan emir yazmaz, yalniz kaynagi `isEmriKaynagiYaz` ile UE'ye yazdirir (P3).
- Makine: `plan_yerlesimi.makine_id -> makine` (istasyonlar); kisi: `kisi_id -> kisi` (kisiler); kapsam `kisininIzinliIsMerkezleri` (VAR). Kisinin istasyonu `istasyonKisileri` (YOK, rota ile ayni istek).
- Aday kaynak: rota `revizyonGetir` (teslimle gelir).
- Vardiya, takvim: yok; surekli calisma varsayar (P-B3). OS3 (vardiya personel-vardiya, simdilik Arkon) ile celismez; bagi yok.

**Yalniz bu modulde olan (sahibi plan)**
- Yerlesim (kaynak, baslangic, bitis, sira, kilit, surum), plan surumu, senaryo ve senaryo yerlesimi.

**Belirsiz — 1 madde**
- C1. Plan ekranlarinin yeri ve depodaki uc yer tutucu sayfa (soru P1). Hedef "modul ana menude tek sayfa ve kendi istemci klasoru" diyor; teslim P2 karariyla ekranlari rota sayfasina koyuyor.

**SABIT KIMLIK ve OS1-OS10 ile celisen**: yok. Uyumlu olanlar: uretim emri / is emri modeli (plan is emrini yerlestirir), istasyon/makine istasyonlarda, kisi kisilerde, OS8 (asil kayit emirde; plan kayit tutmaz). Not: plan kaynagi makine ya da kisi (rota K3); sabit kimlikteki "istasyon is emrine aittir" ile ayni rota notu gecerli (VARSAYIM: ayrinti, UE kararina kalir).

## d) Yerlestirme

- Akis B (plan): is emirleri istasyonlara ve zamana; vardiya geldiginde takvim. Akis A'nin ustunde.
- Altinda (plan cagirir): uretim-emirleri, rota, istasyonlar, kisiler, malzemeler (`malzemeOzeti`); altyapi denetim, istek-kimligi, oturum. Ustunde: kimse (disari bos).
- Plan'in istedigi (BASKA-MODUL-ISTEKLERI-plan.md; main'de durum DOGRULANDI):
  - uretim-emirleri (disarida, UE listesine): `planlanacakIsEmirleri(db): Promise<PlanIsEmri[]>` (id, uretimEmriId, emirNo, malzemeNo, adet, teslim, kaynakRotaRevizyonId, sira, opNo, ad, kaynak, ayarSuresiDk, birimSureDk, bagimlilik, devirAdedi, durum) — YOK; `isEmriKaynagiYaz(db, kullanici, isEmriId, kaynak: {tur: 'makine'|'kisi'; id}): Promise<void>` — YOK; rota'nin `uretimEmriAc` — YOK.
  - istasyonlar: `istasyonKisileri(db)` — YOK; `istasyonlar`, `aktifIstasyonlar`, `istasyondakiMakineler`, `makineGetir`, `kisininIzinliIsMerkezleri` — VAR.
  - kisiler `kisiAdlari`, `kisileriListele` — VAR. malzemeler `malzemeOzeti` — VAR. rota `revizyonGetir` — teslimle.
  - vardiya/mesai: `calismaTakvimi(db, kaynak, aralik)` benzeri — modul yok.
- Baska modullerin plandan istedigi: yok (rota istemcisi plan sozlesmesini ithal ediyor; sunucu tarafinda kimse plani cagirmiyor).

## e) Depodaki guncel durumla fark

| Kalip | Durum | Ekrana dokunur mu |
|---|---|---|
| Okuma `yetki: { biri: [...] }` (ADR 0007) | UYMUYOR: `GET /plan`, `GET /plan/senaryolar` `'oturum'`. Borca. | Hayir |
| Ikinci menu | Plan'in kendi menusu yok; maddeler `ROTA_IKINCI_MENU` icinde (P2). | — |
| Toplayici dar istisnasi | `PLAN_ISLEMLERI` istek olarak yazilmis; oturtmada ayri commit. Yer tutucu sayfalarin kaldirilmasi toplayiciya ve rol satirlarina dokunur: cekirdek isi, onayla. | Evet (menu) |
| Tekrar korumasi | UYAR: `oner`, `yerlestir`, `senaryolar` acma `tekrarKorumali`. | Hayir |
| denetimEki | Gerekmez (hepsi tam denetim). | Hayir |
| Surum denetimi | UYAR: yerlesim surumu ve plan surumu; `eskiSurum()` kullaniliyor (DOGRULANDI servis importu). | Hayir |
| Goc damgasi | UYMUYOR: `20261008100000` < `20261008111500`; yeniden damgalanir. | Hayir |
| Kisit adlari | `plan_senaryo_yerlesimi` birincil anahtari adsiz. Borca. | Hayir |
| Calisma kopyasi kalintisi | `plan.test.ts` `gecici_is_emri` tablosunu okuyor/yaziyor (satir 211, 228, 231); tablo teslimde yok (P-B8). Test plan icinde kurulacak gecici karsilikla oturur. | Hayir |
| Dosya saklama | Ilgisiz. | — |

## f) Kirmizi cizgi taramasi

Bulgu yok (0). Dis adres, CDN, eski sistem izi, parola yok; test verisi "Deneme ..."; yeni paket yok; `btree_gist` eklentisi istenmiyor (cakisma serviste, P-B5). Ayni grep'ler rota-tani.md bolum f'de.

## g) Oturtma plani

1. PR-1 (kucuk, ~120 satir): `paylasilan/sozlesme/plan.ts`, `paylasilan/islemler/plan.ts` + `PLAN_ISLEMLERI` toplayici satiri ayri commit. Rota istemcisi bunu ithal ettigi icin rotadan once.
2. PR-2: rota (rota-tani.md).
3. PR-3 (~1.000 satir): plan sunucusu + goc (yeniden damgali). Oturtma kiriklari (ekrana dokunmaz): UE fonksiyonlari yokken plan icinde gecici karsilik (bos is emri listesi; `isEmriKaynagiYaz` "baglamada" hatasi), testte plan icinde gecici is emri kurulumu; `istasyonKisileri` gecici bos. Hepsi UYUM-BORCU "baglamada kapanacak". Yeni emir modeli (uretim emri + is emirleri) gelmeden plan gercek veriyle CALISMAZ: akis B Asama 2'ye kalir.
4. P1 cevabina gore cekirdek PR: yer tutucu sayfalarin ve `sayfa.cizelge/matris/kuyruk` rol satirlarinin kaldirilmasi (rol x islem degisikligi, onayla; kilitli testler `kisiler/goc.test.ts`, `oturum/oturum.test.ts`, `saglik.test.ts`, `App.test.tsx` birlikte).
5. UE listesine: `planlanacakIsEmirleri`, `isEmriKaynagiYaz`. Istasyonlara: `istasyonKisileri`. Rol onerisi Asama 2'ye.

Soru:

P1. Plan ekranlari nerede kalsin, depodaki /cizelge, /matris, /kuyruk ne olsun?
Neden: Teslim plan ekranlarini Rota sayfasina koyuyor (Plan, Plan studyosu, Kanban) ve uc yer tutucunun kaldirilmasini istiyor; depoda bu uc sayfa ve rol satirlari var (operator /kuyruk'u goruyor). Ayni is menude iki yerde durur.
Secenekler: a) teslimdeki gibi: ekranlar Rota sayfasinda, uc yer tutucu sayfa ve rol satirlari kaldirilir (rol degisikligi; operator Kanban'i ancak rota sayfasi verilirse gorur)  b) plan kendi sayfasi `/plan` ve ikinci menusuyle (Cizelge, Matris, Kuyruk) gelir; ekranlar plan istemcisine tasinir, rota menusundeki plan maddeleri kalkar (ekrana ve rota teslimine dokunur)  c) simdilik ikisi birden: teslim oldugu gibi oturur, yer tutucular Asama 2'ye kadar kalir.
Oneri: c (Asama 1 rol ve menu degisikligi gerektirmez); kalici karar Asama 2'de a ile b arasinda.
