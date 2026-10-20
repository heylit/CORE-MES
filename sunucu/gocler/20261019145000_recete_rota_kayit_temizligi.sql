-- Ana kayıtta ekranın açılışta sahibinden okuyup olduğu gibi değiştirdiği dilimler bayat kopyadır (309 b); yazma artık onları ayıklıyor, eski satırdaki kopya da silinir: iş merkezi, istasyon, makine, kişi, emir listesi, takvimin vardiya ve tatilleri, plan ayarının plan modülündeki beş alanı. Malzeme, rota ve revizyon kopya değildir (kartsız kalem, adımın çıktı kartı ve statüleri, yerel revizyon yalnız burada durur), dokunulmaz. Kayda özgü alanlar ve senaryo anahtarları değişmez.
UPDATE recete_rota_kayit
   SET deger = (
         SELECT CASE WHEN jsonb_typeof(b.d -> 'settings') = 'object' THEN
                  CASE WHEN (b.d -> 'settings') - ARRAY['rule', 'dir', 'buffer', 'freezeDays', 'peopleLimit'] = '{}'::jsonb THEN b.d - 'settings'
                       ELSE jsonb_set(b.d, '{settings}', (b.d -> 'settings') - ARRAY['rule', 'dir', 'buffer', 'freezeDays', 'peopleLimit']) END
                ELSE b.d END
           FROM (SELECT CASE WHEN jsonb_typeof(a.d -> 'cal') = 'object' THEN
                          CASE WHEN (a.d -> 'cal') - ARRAY['shifts', 'holidays'] = '{}'::jsonb THEN a.d - 'cal'
                               ELSE jsonb_set(a.d, '{cal}', (a.d -> 'cal') - ARRAY['shifts', 'holidays']) END
                        ELSE a.d END AS d
                   FROM (SELECT deger - ARRAY['wcs', 'stations', 'machines', 'people', 'emirler'] AS d) AS a) AS b),
       surum = nextval('recete_rota_surum'),
       guncellendi = now()
 WHERE anahtar = 'recete-rota-motoru-v1' AND bicim = 'json' AND jsonb_typeof(deger) = 'object';

-- Kaydı yazan kişi kisi tablosundadır (312 b). Eski satırlar denetlenmez (NOT VALID): karşılığı olmayan eski değer silinmez ve göçü durdurmaz; yeni yazma denetlenir.
ALTER TABLE recete_rota_kayit
  ADD CONSTRAINT recete_rota_kayit_guncelleyen_kisi_fk FOREIGN KEY (guncelleyen_kisi_id) REFERENCES kisi (id) NOT VALID;
