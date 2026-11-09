-- Talimatın şablon kökeni (2588 a): talimat sürümü ya da taslağı bir talimat şablonundan kopyalandıysa şablonun kimliği ve o anki
-- sürümü. Canlı bağ değildir (989 a): şablon sonradan değişse de talimat değişmez; kayıt yalnız "hangi şablonun hangi sürümünden
-- kopyalandı" bilgisidir. Kaydı olmayan (eski ya da elle yazılmış) sürümün kökeni bilinmez. Yalnız yeni tablo; dolu tabloya dokunulmaz.
CREATE TABLE rota_talimat_kokeni (
  talimat_id int PRIMARY KEY CONSTRAINT rota_talimat_kokeni_talimat_bagi REFERENCES rota_talimati (id),
  sablon_id int NOT NULL CONSTRAINT rota_talimat_kokeni_sablon_bagi REFERENCES rota_talimat_sablonu (id),
  sablon_surum int NOT NULL CONSTRAINT rota_talimat_kokeni_surum_pozitif CHECK (sablon_surum > 0)
);
CREATE INDEX rota_talimat_kokeni_sablon_fk_idx ON rota_talimat_kokeni (sablon_id);
-- Talimat sürümü gibi kökeni de yalnız eklenir.
CREATE TRIGGER rota_talimat_kokeni_degismez BEFORE UPDATE OR DELETE ON rota_talimat_kokeni
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER rota_talimat_kokeni_bosaltilmaz BEFORE TRUNCATE ON rota_talimat_kokeni
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Taslağın kökeni yayında talimata taşınır; taslak silinince ya da yayınlanınca birlikte silinir.
CREATE TABLE rota_talimat_taslak_kokeni (
  taslak_id int PRIMARY KEY CONSTRAINT rota_talimat_taslak_kokeni_taslak_bagi REFERENCES rota_talimat_taslagi (id) ON DELETE CASCADE,
  sablon_id int NOT NULL CONSTRAINT rota_talimat_taslak_kokeni_sablon_bagi REFERENCES rota_talimat_sablonu (id),
  sablon_surum int NOT NULL CONSTRAINT rota_talimat_taslak_kokeni_surum_pozitif CHECK (sablon_surum > 0)
);
CREATE INDEX rota_talimat_taslak_kokeni_sablon_fk_idx ON rota_talimat_taslak_kokeni (sablon_id);
