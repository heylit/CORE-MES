-- Adım adım talimat (989 a, 992 a, 993 a): talimat sürümü adımlara bölünür; her adımın başlığı, açıklaması ve kontrol noktası olur.
-- Talimatın sürümü yine rota_talimati satırıdır (dolu tabloya dokunulmaz): adımlı sürümün metni adım başlıklarından kurulur, böylece
-- emre giden kontrol listesi ve talimat sürümü sabitlemesi değişmez. Adımı olmayan eski sürüm tek adımlı talimat olarak okunur.
-- Talimat şablonu kütüphanedir; adımları talimata kopyalanır, bağlanmaz (989 a).

-- kontrol: yok | onay | olcum (ad, alt, ust, birim) | foto (aciklama) | secim (secenekler). Ayarın biçimini servis denetler.
CREATE TABLE rota_talimat_adimi (
  talimat_id int NOT NULL CONSTRAINT rota_talimat_adimi_talimat_bagi REFERENCES rota_talimati (id),
  sira int NOT NULL CONSTRAINT rota_talimat_adimi_sira_pozitif CHECK (sira > 0),
  baslik text NOT NULL CONSTRAINT rota_talimat_adimi_baslik_dolu CHECK (btrim(baslik) <> '' AND length(baslik) <= 120),
  metin text CONSTRAINT rota_talimat_adimi_metin_boyu CHECK (metin IS NULL OR (btrim(metin) <> '' AND length(metin) <= 2000)),
  kontrol_turu text NOT NULL CONSTRAINT rota_talimat_adimi_kontrol_gecerli CHECK (kontrol_turu IN ('yok', 'onay', 'olcum', 'foto', 'secim')),
  kontrol_ayari jsonb NOT NULL DEFAULT '{}' CONSTRAINT rota_talimat_adimi_ayar_nesne CHECK (jsonb_typeof(kontrol_ayari) = 'object'),
  zorunlu boolean NOT NULL,
  PRIMARY KEY (talimat_id, sira),
  CONSTRAINT rota_talimat_adimi_zorunlu_kontrollu CHECK (NOT zorunlu OR kontrol_turu <> 'yok')
);
-- Talimat sürümü gibi adımları da yalnız eklenir: emre sabitlenen sürümün adımları sonradan değişmez.
CREATE TRIGGER rota_talimat_adimi_degismez BEFORE UPDATE OR DELETE ON rota_talimat_adimi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER rota_talimat_adimi_bosaltilmaz BEFORE TRUNCATE ON rota_talimat_adimi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

CREATE TABLE rota_talimat_sablonu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kod text NOT NULL CONSTRAINT rota_talimat_sablonu_kod_bicimi CHECK (kod ~ '^[A-Z0-9][A-Z0-9-]{1,29}$'),
  ad text NOT NULL CONSTRAINT rota_talimat_sablonu_ad_dolu CHECK (btrim(ad) <> '' AND length(ad) <= 120),
  sartname_id int CONSTRAINT rota_talimat_sablonu_sartname_bagi REFERENCES rota_islem_sartnamesi (id),
  aktif boolean NOT NULL DEFAULT true,
  surum int NOT NULL DEFAULT 1 CONSTRAINT rota_talimat_sablonu_surum_pozitif CHECK (surum > 0),
  CONSTRAINT rota_talimat_sablonu_kod_tekil UNIQUE (kod)
);
CREATE INDEX rota_talimat_sablonu_sartname_fk_idx ON rota_talimat_sablonu (sartname_id) WHERE sartname_id IS NOT NULL;

-- Şablon adımları şablon kaydedilince bütün olarak yeniden yazılır (şablon emre sabitlenmez; kopyalanan talimat kendi sürümünü taşır).
CREATE TABLE rota_talimat_sablon_adimi (
  sablon_id int NOT NULL CONSTRAINT rota_talimat_sablon_adimi_sablon_bagi REFERENCES rota_talimat_sablonu (id) ON DELETE CASCADE,
  sira int NOT NULL CONSTRAINT rota_talimat_sablon_adimi_sira_pozitif CHECK (sira > 0),
  baslik text NOT NULL CONSTRAINT rota_talimat_sablon_adimi_baslik_dolu CHECK (btrim(baslik) <> '' AND length(baslik) <= 120),
  metin text CONSTRAINT rota_talimat_sablon_adimi_metin_boyu CHECK (metin IS NULL OR (btrim(metin) <> '' AND length(metin) <= 2000)),
  kontrol_turu text NOT NULL CONSTRAINT rota_talimat_sablon_adimi_kontrol_gecerli CHECK (kontrol_turu IN ('yok', 'onay', 'olcum', 'foto', 'secim')),
  kontrol_ayari jsonb NOT NULL DEFAULT '{}' CONSTRAINT rota_talimat_sablon_adimi_ayar_nesne CHECK (jsonb_typeof(kontrol_ayari) = 'object'),
  zorunlu boolean NOT NULL,
  PRIMARY KEY (sablon_id, sira),
  CONSTRAINT rota_talimat_sablon_adimi_zorunlu_kontrollu CHECK (NOT zorunlu OR kontrol_turu <> 'yok')
);

-- Varsayılan talimat şablonları (genel atölye bilgisi; ürün, müşteri ve şirket bilgisi yok).
INSERT INTO rota_talimat_sablonu (kod, ad, sartname_id)
SELECT v.kod, v.ad, s.id FROM (VALUES
  ('TS-CNC', 'CNC işleme: ilk parça ve seri', 'TLS-GNL'),
  ('TS-TES', 'Tesviye: çapak alma ve kenar kırma', NULL),
  ('TS-AST', 'Astar uygulama', 'AST-EPX'),
  ('TS-BYA', 'Boya (son kat)', 'BYA-YAS'),
  ('TS-MON', 'Montaj', NULL),
  ('TS-MRK', 'Markalama', NULL),
  ('TS-CMM', 'CMM ölçüm', 'MYT-BLG'),
  ('TS-FSN', 'Fasona gönderme hazırlığı', NULL),
  ('TS-TKR', 'Delikte kırılan takımın sökümü', 'TKR-SOK')
) AS v (kod, ad, sartname) LEFT JOIN rota_islem_sartnamesi s ON s.kod = v.sartname;

INSERT INTO rota_talimat_sablon_adimi (sablon_id, sira, baslik, metin, kontrol_turu, kontrol_ayari, zorunlu)
SELECT t.id, v.sira, v.baslik, v.metin, v.kontrol_turu, v.kontrol_ayari::jsonb, v.zorunlu FROM (VALUES
  ('TS-CNC', 1, 'Programı ve sıfır noktasını doğrula', 'Program adı ve revizyonu iş emrindekiyle aynı olmalı. İş parçası sıfırını prob ile al.', 'onay', '{}', true),
  ('TS-CNC', 2, 'Takımları bağla, boy ve çap ofsetlerini gir', 'Takım listesindeki sırayla. Aşınmış ya da kırık uç kullanma.', 'yok', '{}', false),
  ('TS-CNC', 3, 'Parçayı bağla', 'Bağlama aparatı ve sıkma torku çizimdeki ya da kurulum föyündeki gibi.', 'yok', '{}', false),
  ('TS-CNC', 4, 'İlk parçayı işle ve kritik ölçüyü ölç', 'Kritik ölçüler ölçüm planından. Sınır dışıysa ofseti düzelt ve yeniden ölç.', 'olcum', '{"ad":"Kritik ölçü","alt":null,"ust":null,"birim":"mm"}', true),
  ('TS-CNC', 5, 'İlk parçayı kaliteye onaylat', 'Onaysız seriye geçilmez.', 'onay', '{}', true),
  ('TS-CNC', 6, 'Seride periyodik kontrol yap', 'Kontrol sıklığı ölçüm planındaki gibi.', 'olcum', '{"ad":"Periyodik ölçü","alt":null,"ust":null,"birim":"mm"}', false),
  ('TS-TES', 1, 'Parçayı yumuşak çene ile bağla', 'Yüzeyi çizmemek için yumuşak çene kullan; bağlama yüzeyini temizle.', 'yok', '{}', false),
  ('TS-TES', 2, 'Kenarları kır, çapakları al', 'Çapak alma takımıyla tek yönde çek; delik ağızlarını havşa ile temizle.', 'yok', '{}', false),
  ('TS-TES', 3, 'Kenar kırma ölçüsünü kontrol et', 'Pah ölçerle iki köşeden ölç.', 'olcum', '{"ad":"Kenar kırma","alt":0.2,"ust":0.5,"birim":"mm"}', true),
  ('TS-TES', 4, 'Temizle ve kutula', 'Basınçlı hava ile talaşı al; kutulanmış parçayı fotoğrafla.', 'foto', '{"aciklama":"Kutulanmış parça"}', false),
  ('TS-AST', 1, 'Yüzeyi yağdan arındır', 'Solventli bezle iki kez sil; çıplak elle tutma.', 'onay', '{}', true),
  ('TS-AST', 2, 'Maskelenecek yerleri kapat', 'Diş, geçme ve topraklama yüzeyleri.', 'yok', '{}', false),
  ('TS-AST', 3, 'Ortam sıcaklığını ve nemi kontrol et', 'Şartnamedeki aralık dışında uygulama yapılmaz.', 'olcum', '{"ad":"Ortam sıcaklığı","alt":10,"ust":35,"birim":"°C"}', true),
  ('TS-AST', 4, 'Astarı uygula', 'Tabanca mesafesi ve basıncı ekipman föyündeki gibi; çapraz katla.', 'yok', '{}', false),
  ('TS-AST', 5, 'Kuru film kalınlığını ölç', 'Şartnamedeki kalınlık aralığına göre.', 'olcum', '{"ad":"Kuru film kalınlığı","alt":null,"ust":null,"birim":"µm"}', true),
  ('TS-BYA', 1, 'Astar yüzeyini kontrol et', 'Toz ve akıntı varsa zımparala, sil.', 'onay', '{}', true),
  ('TS-BYA', 2, 'Rengi karşılaştır', 'Renk kartı ile standart ışık altında.', 'secim', '{"secenekler":["Uygun","Uygun değil"]}', true),
  ('TS-BYA', 3, 'Son katı uygula', 'Önce kenarlar, sonra düz yüzeyler.', 'yok', '{}', false),
  ('TS-BYA', 4, 'Kalınlık ve yapışma testi yap', 'Kalınlık ölçer ve çapraz kesim, şartnamedeki sıklıkla.', 'foto', '{"aciklama":"Çapraz kesim"}', false),
  ('TS-MON', 1, 'Bileşenleri topla', 'Reçetedeki bileşenler ve adetleri.', 'onay', '{}', true),
  ('TS-MON', 2, 'Rulmanı yerine oturt', 'Pres kuvvetini oturan bileziğe ver.', 'yok', '{}', false),
  ('TS-MON', 3, 'Bağlantı elemanlarını sık', 'Çapraz sırayla, iki turda.', 'olcum', '{"ad":"Sıkma torku","alt":null,"ust":null,"birim":"Nm"}', true),
  ('TS-MON', 4, 'Hareketi elle dene', 'Sıkışma ve boşluk olmamalı.', 'yok', '{}', false),
  ('TS-MON', 5, 'Etiketle ve fotoğrafla', NULL, 'foto', '{"aciklama":"Montajlı ürün"}', false),
  ('TS-MRK', 1, 'İçeriği ve yeri çizimden al', 'Parti no, tarih ve ürün kodu; yer çizimdeki işaretli yüzey.', 'yok', '{}', false),
  ('TS-MRK', 2, 'İşaretle', 'Lazer ya da nokta vuruş; kritik yüzeye işaret konmaz.', 'yok', '{}', false),
  ('TS-MRK', 3, 'Okunurluğu kontrol et', 'İşaret eksiksiz ve okunur olmalı.', 'foto', '{"aciklama":"Markalama"}', true),
  ('TS-CMM', 1, 'Parçayı ölçüm ortamında dinlendir', 'Ölçüm odası sıcaklığına gelmesi için bekle.', 'onay', '{}', true),
  ('TS-CMM', 2, 'Parçayı fikstüre bağla', 'Fikstür ve yön ölçüm planındaki gibi.', 'yok', '{}', false),
  ('TS-CMM', 3, 'Ölçüm programını çalıştır', 'Program revizyonu iş emrindekiyle aynı olmalı.', 'yok', '{}', false),
  ('TS-CMM', 4, 'Raporu değerlendir', 'Tolerans dışı ölçü varsa kaliteye bildir.', 'secim', '{"secenekler":["Uygun","Uygun değil"]}', true),
  ('TS-CMM', 5, 'Raporu iş emrine ekle', NULL, 'yok', '{}', false),
  ('TS-FSN', 1, 'Maskelenecek yüzeyleri kapat', 'Şartnamedeki maskeleme alanına göre tapa ya da bant.', 'onay', '{}', true),
  ('TS-FSN', 2, 'Adet say ve etiketle', 'Fason iş emri numarası etikette görünmeli.', 'olcum', '{"ad":"Adet","alt":null,"ust":null,"birim":"adet"}', true),
  ('TS-FSN', 3, 'Belgeleri pakete koy', 'Şartnamenin istediği belgeler fason belgesindedir.', 'yok', '{}', false),
  ('TS-TKR', 1, 'Tezgahı durdur, kırığı fotoğrafla', 'Kırık uç görünüyorsa elle çıkarmaya çalışma.', 'foto', '{"aciklama":"Kırık takım"}', true),
  ('TS-TKR', 2, 'Söküm yöntemini seç', 'Kılavuz kırığında sökücü, matkap kırığında erozyon.', 'secim', '{"secenekler":["Sökücü","Erozyon","Delik büyütme ve burç"]}', true),
  ('TS-TKR', 3, 'Deliği temizle ve ölç', 'Delik çapı ve diş tam mı kontrol et.', 'olcum', '{"ad":"Delik çapı","alt":null,"ust":null,"birim":"mm"}', true)
) AS v (kod, sira, baslik, metin, kontrol_turu, kontrol_ayari, zorunlu) JOIN rota_talimat_sablonu t ON t.kod = v.kod;
