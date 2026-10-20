# Çekirdek istekleri (plan)

1. İşlem toplayıcısı `paylasilan/islemler.ts`: `PLAN_ISLEMLERI` (`paylasilan/islemler/plan.ts`) eklenir.
2. Eski sayfa tanımları kaldırılır (karar P2: plan ekranları Rota sayfasında): `paylasilan/sayfalar/cizelge.ts` (/cizelge),
   `paylasilan/sayfalar/matris.ts` (/matris), `paylasilan/sayfalar/kuyruk.ts` (/kuyruk; Üretim grubunda ayrı kalmaz) ve toplayıcıdaki
   satırları; `sayfa.cizelge`, `sayfa.matris`, `sayfa.kuyruk` işlemlerinin rol satırları aynı göçte.
3. Rol x işlem (kullanıcı onayıyla ayrı göç). Öneri:
   ```sql
   INSERT INTO rol_islemi (rol_id, islem)
   SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem FROM (VALUES
     ('planlama_proje', 'plan.yaz'), ('planlama_proje', 'plan.kilitle'), ('planlama_proje', 'plan.studyo'), ('planlama_proje', 'plan.canliya-al'),
     ('mudur', 'plan.kilitle'), ('mudur', 'plan.studyo'), ('mudur', 'plan.canliya-al')) AS m (kod, islem);
   ```
   Kilitli iki testin (kisiler/goc.test.ts, oturum/oturum.test.ts) satırları aynı değişiklikte güncellenir.

Not (2026-10-08, karar PL1 c): madde 2 Aşama 1'de uygulanmaz; yer tutucu sayfalar ve rol satırları kalır, karar Aşama 2'de.

## T4 (kart #415)
4. İkinci menü sayacına ton (uyarı / bilgi): "N onayda" uyarı, "N taslak" bilgi, "N geç" ve "N düşük" uyarı. Bugün `ikinciMenuSayacSemasi` tek sayı taşır.
5. Ortak CSV indirme parçası (`istemci/src/ortak`): liste ekranları bugün rota istemcisindeki yerel yardımcıyı kullanır (S4 b).
6. Komut paleti (Ctrl / Cmd + K) düğmesi kabukta; bugün yalnız klavye kısayoluyla açılır.

## 280 a (plan okuma yetkisi, kullanıcı onayı 20.10.2026)
7. İşlem `plan.oku` ("Planı görür") `PLAN_ISLEMLERI`'ne; rol x işlem: planlama_proje, mudur, vardiya_sorumlusu, cam, kalite, bakim (yonetici hepsini alır).
   Plan bağlar: `GET /plan`, `/plan/karsilastir`, `/plan/canli-yerlesim`, `/plan/senaryolar` `{ biri: ['plan.oku', 'plan.yaz'] }`; `/plan/surum` ve
   `/plan/menu-sayaclari` oturumlu kalır (kabuk her rolde çağırır), sayaçlar `plan.oku` yoksa boş döner.
