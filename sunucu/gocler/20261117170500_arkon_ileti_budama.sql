-- Budanan en büyük ileti kimliği: cihazın kaçırdığı yalnız budamadan anlaşılır. Sayaç ölçü olamaz: yarım kalan ya da geri alınan ekleme
-- sayacı satır yazmadan ilerletir (PostgreSQL dizileri işlemle geri alınmaz) ve boş tabloda cihazlar boşuna yeniden yüklenirdi.
CREATE TABLE arkon_ileti_budama (
  tek boolean PRIMARY KEY DEFAULT true CONSTRAINT arkon_ileti_budama_tek CHECK (tek),
  tavan bigint NOT NULL
);
