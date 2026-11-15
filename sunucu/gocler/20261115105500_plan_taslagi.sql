-- 3282 1d: kişinin planlama taslağı. Kokpit'te planlayanın kararları önce burada komut olarak durur; ortak çalışma (plan_planlama_kaydi)
-- "Uygula"ya kadar değişmez. Yalnız ekleme: var olan tablo ve satırlara dokunulmaz, geriye dönük doldurma yok. Geri dönüşte tablo düşer,
-- açık taslaklar kaybolur (ortak çalışma etkilenmez).
CREATE TABLE plan_taslagi (
  kisi_id int PRIMARY KEY REFERENCES kisi (id) ON DELETE CASCADE,
  -- Taslak açıldığında okunan ortak çalışmanın sürümü ve imzası (işlerin yeri, kilitler, plan ayarı); Uygula çatışmayı bununla bulur.
  taban_surum bigint NOT NULL,
  taban_imzasi jsonb NOT NULL,
  komutlar jsonb NOT NULL DEFAULT '[]',
  surum int NOT NULL DEFAULT 1,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_taslagi_komutlar_dizi CHECK (jsonb_typeof(komutlar) = 'array'),
  CONSTRAINT plan_taslagi_imza_nesne CHECK (jsonb_typeof(taban_imzasi) = 'object'),
  CONSTRAINT plan_taslagi_surum_pozitif CHECK (surum > 0)
);
