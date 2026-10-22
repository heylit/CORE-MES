# Başka modül istekleri (saat)

- arkon (karar 80 a): saatten ekip çağrısı açmak için `arkon/disari.ts`'ten çağrı açan işlev. Bugün çağrı yalnız Arkon belge yazımında
  (`servis.ts` `cagriBildirimi` ve bildirim `ekipCagrisiBildir`) doğar. İstenen: kişi, istasyon ve ekip (`bakim`, `kalite`, `malzeme`, `amir`, `ayarci`)
  alan, Arkon çağrı kaydını yazıp bildirimi aynı yoldan gönderen, yetkiyi ve kapsamı çağıran kişiye göre denetleyen tek işlev. Saat tarafı
  (uç, işlem, düğme) işlev gelince yazılır; saat bildirim modülünü doğrudan çağırmaz (Arkon kaydı olmayan ikinci kaynak olurdu).
