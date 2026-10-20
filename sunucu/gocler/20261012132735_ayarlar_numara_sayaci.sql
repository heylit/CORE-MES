-- Belge numaralarının sırası ayardaki kalıbın dönemine (ay, yıl ya da hep) göre burada sayılır; numarayı isteyen modül
-- ayarlar/disari.ts numaraAl ile alır.
CREATE TABLE ayar_numara_sayaci (
  anahtar text NOT NULL,
  donem text NOT NULL,
  son_sira int NOT NULL,
  CONSTRAINT ayar_numara_sayaci_pk PRIMARY KEY (anahtar, donem),
  CONSTRAINT ayar_numara_sayaci_anahtar_bicimi CHECK (anahtar ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$'),
  CONSTRAINT ayar_numara_sayaci_donem_bicimi CHECK (donem ~ '^(-|\d{4}|\d{4}-\d{2})$'),
  CONSTRAINT ayar_numara_sayaci_sira_pozitif CHECK (son_sira > 0)
);
