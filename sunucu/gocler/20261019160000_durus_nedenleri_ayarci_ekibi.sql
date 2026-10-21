-- 298 b: operatörün çağırabildiği beşinci ekip "ayarci"; duruş nedeni bu ekibi otomatik çağrı için seçebilir.
ALTER TABLE durus_nedeni DROP CONSTRAINT durus_nedeni_ekip;
ALTER TABLE durus_nedeni ADD CONSTRAINT durus_nedeni_ekip
  CHECK (cagri_ekibi IS NULL OR cagri_ekibi IN ('bakim', 'kalite', 'malzeme', 'amir', 'ayarci'));
