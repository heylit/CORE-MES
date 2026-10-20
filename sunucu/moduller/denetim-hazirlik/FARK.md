# FARK: "Kalibrasyon" sekmesinin vade ve durumu Kalibrasyon modülünün kuralıyla hesaplanır (kullanıcı kararı "Tek kural")

- `ek-betikler.ts` kuralı çerçeveye gömer; prototipte `kNext` ve `kStat` onu çağırır (`kKural`). Metinler ve renkler aynı: "Bugün" ve 7 gün ya da daha az kalan kırmızı vurgulu kalır, sayım ve süzgeçte hepsi "yaklaşan".
- Davranış aynı (önce testle sabitlendi: `kalibrasyon-durumu.test.tsx`). Sunucu, şema, işlem ve rol değişmedi.

# denetim-hazirlik: fark

Depoda karşılığı olmayan yeni modül; silinen ya da değişen dosya yok. Taban: `main` 708190c.

## Eklenen
- `sunucu/gocler/20261012165213_denetim_hazirlik_belge_deposu.sql`: `denetim_hazirlik_belge` (belge deposu), `denetim_hazirlik_ek` (ekler), `denetim_hazirlik_surum` sayacı.
- `sunucu/moduller/denetim-hazirlik/`: `uclar.ts`, `servis.ts`, `sorgular.ts`, `kurallar.ts`, `disari.ts`, testler, `UYUM-BORCU.md`.
- `paylasilan/sozlesme/denetim-hazirlik.ts`, `paylasilan/islemler/denetim-hazirlik.ts`, `paylasilan/sayfalar/denetim-hazirlik.ts`.
- `istemci/src/moduller/denetim-hazirlik/`: `DenetimHazirlikCercevesi.tsx`, `cerceve-kopru.ts`, `kopru.ts`, `yazi-tipleri.ts`, `rotalar.tsx`, `denetim-hazirlik.css`, testler.
- `istemci/src/moduller/denetim-hazirlik/cerceve/denetim-hazirlik.html`: prototip, bayt bayt aynı (sha256 `b53026c302f28d0aad0d11357f51519b6eeeb5c7a4f0336ebc1eef8f12846411`).
- `istemci/src/moduller/denetim-hazirlik/cerceve/yazi/`: prototipin yazı tipleri (SIL OFL 1.1, lisansları yanında).

## Prototipe göre
Prototip dosyası değişmedi. Açılışta yalnız şunlar eklenir: içerik politikası, gömülü yazı tipi stili ve köprü betiği; Google
yazı tipi bağlantıları çıkarılır (dış servis yok). Köprü `navigator.storage.persist` isteğini "kalıcı" diye karşılar (opak kökende
tarayıcı reddeder; veri zaten sunucuda kalıcıdır). Görünüm, yerleşim ve kullanım aynıdır.

## Değişen onaylı karar
Yok.

## Oturtmada (kart #742)
- Menü simgesi `check` yerine `search`: `check` Kalite Merkezi'nde, `flag` Projeler'de; ana menüde simge tekil olmalı (`istemci/src/ortak/rota/sayfa-simgeleri.test.ts`).
