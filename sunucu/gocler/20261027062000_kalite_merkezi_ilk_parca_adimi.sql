-- İlk parça kararı adım başınadır (kart 744, kararlar 744 a ve 756 a): karar hangi iş emrinin (operasyonun) ilk parçasıysa ona
-- yazılır; Arkon'un kapısı adımın son kararını okur. Eski satırlar iş emirsiz kalır ve hiçbir adıma sayılmaz (756 a: canlı veri yok,
-- açık emirlerde ilk parça yeniden istenir). Tablo yalnız eklenir (tetikleyici); sütun eklemek satır değiştirmez.
ALTER TABLE kalite_merkezi_ilk_parca_karari ADD COLUMN is_emri_id int REFERENCES uretim_emirleri_is_emri;
CREATE INDEX kalite_merkezi_ilk_parca_karari_adim ON kalite_merkezi_ilk_parca_karari (is_emri_id, zaman DESC, id DESC) WHERE is_emri_id IS NOT NULL;
