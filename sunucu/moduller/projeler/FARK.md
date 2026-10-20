# FARK: projeler (kart #803)

Taban: `main` 9da634f. Yeni modül; depoda önceki hâli yok.

Eklenen:
- Göç `sunucu/gocler/20261012131000_projeler_proje.sql`: `projeler_proje` tablosu, kod tekil dizini, kod ve açılış değişmezliği tetikleyicisi.
  Damga birleştirici "sıran geldi" deyince o anki saatle yeniden adlandırılır.
- Sunucu `sunucu/moduller/projeler/` (uclar, servis, kurallar, sorgular, disari, testler).
- İstemci `istemci/src/moduller/projeler/` (liste, ekleme ve düzenleme penceresi, test).
- Paylaşılan: `paylasilan/{sozlesme,islemler,sayfalar}/projeler.ts`.
- Toplayıcı satırları (ayrı commit): `paylasilan/islemler.ts`, `paylasilan/sayfalar.ts` (sayfa ve ikinci menü), `paylasilan/islem-adlari.ts` (iki işlem adı ve modül adı).

Değişen onaylı karar: yok. Silinen: yok.

Ek (kullanıcı isteği 2026-10-12, "projeye bağlı üretim emirlerini proje altında listele"): proje ayrıntı sayfası `/projeler/:id`; emir bölümü
`istemci/src/moduller/projeler/ProjeEmirleri.tsx`, üretim emirlerinin `GET /adimli-emirler?projeId=` ucunu çağırır (kart #810'a bağlı).

Ek (176 a, 2026-10-19; sipariş -> proje -> üretim emri zinciri):
- Göç `sunucu/gocler/20261019082000_projeler_siparis_bagi.sql`: `projeler_proje.siparis_id` (boş olabilir, `siparisler_siparis` yabancı anahtarı,
  kısmi dizin), bağın değişmezlik tetikleyicisi. Var olan projeler boş kalır; veri doldurulmaz (dolu tablo göçü 176 a ile onaylı).
- Uç `POST /projeler/siparisten/:siparisId/ac` (`projeler.yaz`): yalnız onaylı siparişten; firma siparişin firması. Uç `GET /projeler/siparis/:siparisId`.
- `disari.ts`: `siparisinProjeleri`; `ProjeOzeti` ve `Proje` cevabında `siparisId`.
- Kural PRJ-07, PRJ-08. Yeni işlem ve rol satırı yok.

Ek (198 a ve 180, 2026-10-19; proje bütçesi):
- Göç `sunucu/gocler/20261019091000_projeler_butce.sql`: `projeler_proje.butce_tutari` (numeric 18,2) ve `butce_para_birimi`, ikisi birlikte boş olabilir.
  Var olan projeler boş kalır (dolu tablo göçü 198 a ile onaylı).
- Bütçe yalnız `finans.maliyet-oku` olana gider ve yalnız onun gövdesinden yazılır (180). Proje formunda ve ayrıntısında yalnız o işlemde görünür.
- `disari.ts`: `projeGetir` cevabında `butceTutari`, `butceParaBirimi` (proje-maliyet okur; yalnız tek proje okumasında). Kural PRJ-09. Yeni işlem ve rol satırı yok.

Ek (194 a ve 197 a, 2026-10-19; Maliyet sekmesi):
- Proje ayrıntısı sekmeli: Genel, Üretim emirleri (emir okuma işlemiyle), Maliyet (`finans.maliyet-oku` ile). Tek sekme kalırsa sekme çubuğu çizilmez.
- Maliyet sekmesi `proje-maliyet/disari.ts` içindeki `ProjeMaliyeti` bileşenini çizer; fiyat alanlarını o modül `siparisler.fiyat-oku`'ya bağlar.
  Yeni sayfa, işlem ve rol satırı yok.

Ek (224, 2026-10-19; proje sipariş seçilmeden açılmaz):
- `POST /projeler` gövdesinde `siparisId` zorunlu, `firmaId` yok; firma siparişten gelir (PRJ-10, PRJ-07 ile aynı kural). Göç yok: var olan siparişsiz projeler kalır, düzenlemede firmaları seçilebilir.
- Uç `GET /projeler/siparis-secenekleri` (`projeler.yaz`): onaylı siparişler, en çok 20, tutarsız. Proje formunda yeni projede sipariş seçici; siparişe bağlı projede müşteri salt okunur.
- Sipariş artık kilitli okunur (`siparisKilitliAyrinti`; UYUM-BORCU 6 kapandı).

Ek (281, 2026-10-20; plan stüdyosundaki acil sipariş canlıya geçer):
- `disari.ts` `siparistenProjeAc(db, kullanici, siparisId, g)` -> `{ projeId }`. Kural `POST /projeler/siparisten/:siparisId/ac` ile aynı (onaylı sipariş, firma siparişten); bütçe yalnız `finans.maliyet-oku` taşıyandan. Yetki çağıran uçtadır; yeni işlem, rol satırı, göç yok.
