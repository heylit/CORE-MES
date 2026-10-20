-- A7 (#518, kullanıcı kararı 4-a): Arkon'da girilmiş ölçü aletleri ve kalibrasyon geçmişi Kalibrasyon modülüne bir kez kopyalanır;
-- Arkon artık aletleri buradan okur. Arkon belgesi silinmez ve değişmez (yalnız okunur).
-- Aynı numaralı alet varsa Kalibrasyon'daki kalır ve Arkon'daki geçmişi alınmaz. Numarası ya da türü boş alet atlanır.
-- Tür adla eşlenir (büyük-küçük harf duyarsız); bulunmayan tür eklenir. Kaydı yapan kişi adla eşlenir; tek eşleşme yoksa belgeyi son
-- yazan kişi alınır (degistiren_id NOT NULL ve kisi'ye bağlıdır, boş kalmaz). Tarih tesis günüdür (göç oturumunun saat dilimi
-- tesis saat dilimidir, #cekirdek/db.ts TimeZone); bugünden sonraki ve biçimi bozuk kayıt atlanır. Arkon'da son kalibrasyon tarihi elle
-- girilmiş ve o gün uygun kayıt yoksa o tarihte uygun bir kayıt açılır (vade kaybolmasın).
-- Alan yoksa ->> NULL verir ve karşılaştırma da NULL olur: durum ve tarih denetimleri coalesce ile kesinleştirilir (KD-022).
DO $$
DECLARE
  b record;
  k jsonb;
  alet_no text;
  tur_adi text;
  yeni_tur int;
  yeni_alet int;
  periyot int;
  kaydeden int;
  kal_gunu date;
  son date;
BEGIN
  FOR b IN
    SELECT govde, degistiren_id FROM arkon_belge WHERE depo = 'gauges' AND jsonb_typeof(govde) = 'object' ORDER BY kimlik
  LOOP
    alet_no := upper(btrim(coalesce(b.govde ->> 'no', '')));
    tur_adi := btrim(coalesce(b.govde ->> 'type', ''));
    CONTINUE WHEN alet_no = '' OR tur_adi = '';
    CONTINUE WHEN EXISTS (SELECT 1 FROM olcu_aleti WHERE no = alet_no);

    SELECT id INTO yeni_tur FROM olcu_aleti_turu WHERE lower(ad) = lower(tur_adi);
    IF yeni_tur IS NULL THEN
      INSERT INTO olcu_aleti_turu (ad) VALUES (tur_adi) RETURNING id INTO yeni_tur;
    END IF;

    periyot := CASE WHEN coalesce(b.govde ->> 'interval', '') ~ '^[0-9]{1,5}$' AND (b.govde ->> 'interval')::int > 0
                    THEN (b.govde ->> 'interval')::int ELSE 365 END;
    INSERT INTO olcu_aleti (no, tur_id, ad, olcme_araligi, yer, periyot_gun, kullanim_disi, kullanim_disi_nedeni)
    VALUES (alet_no, yeni_tur, nullif(btrim(b.govde ->> 'name'), ''), nullif(btrim(b.govde ->> 'range'), ''),
            nullif(btrim(b.govde ->> 'loc'), ''), periyot, coalesce(b.govde ->> 'status' = 'out', false),
            CASE WHEN b.govde ->> 'status' = 'out' THEN 'Arkon kaydında kullanım dışı.' END)
    RETURNING id INTO yeni_alet;

    FOR k IN SELECT e FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.govde -> 'cals') = 'array' THEN b.govde -> 'cals' ELSE '[]'::jsonb END) AS e
    LOOP
      CONTINUE WHEN jsonb_typeof(k) <> 'object' OR coalesce(jsonb_typeof(k -> 'at'), '') <> 'number' OR coalesce(k ->> 'res', '') NOT IN ('ok', 'nok');
      CONTINUE WHEN (k ->> 'at')::numeric NOT BETWEEN 0 AND 32503680000000;
      kal_gunu := (to_timestamp((k ->> 'at')::double precision / 1000))::date;
      CONTINUE WHEN kal_gunu > current_date;
      kaydeden := NULL;
      SELECT min(id) INTO kaydeden FROM kisi WHERE ad = btrim(coalesce(k ->> 'by', '')) HAVING count(*) = 1;
      INSERT INTO kalibrasyon_kaydi (alet_id, tarih, kisi_id, sonuc, sertifika_no, aciklama)
      VALUES (yeni_alet, kal_gunu, coalesce(kaydeden, b.degistiren_id), CASE WHEN k ->> 'res' = 'ok' THEN 'uygun' ELSE 'uygunsuz' END,
              nullif(btrim(k ->> 'cert'), ''), nullif(btrim(k ->> 'note'), ''));
    END LOOP;

    IF jsonb_typeof(b.govde -> 'last') = 'number' AND (b.govde ->> 'last')::numeric BETWEEN 1 AND 32503680000000 THEN
      son := (to_timestamp((b.govde ->> 'last')::double precision / 1000))::date;
      IF son <= current_date AND NOT EXISTS (SELECT 1 FROM kalibrasyon_kaydi WHERE alet_id = yeni_alet AND tarih = son AND sonuc = 'uygun') THEN
        INSERT INTO kalibrasyon_kaydi (alet_id, tarih, kisi_id, sonuc, aciklama)
        VALUES (yeni_alet, son, b.degistiren_id, 'uygun', 'Arkon kaydındaki son kalibrasyon tarihi.');
      END IF;
    END IF;
  END LOOP;
END $$;
