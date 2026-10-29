-- 3B model bağı (1212 a): makineye ya da bağlama aparatına Çizim Merkezi'ndeki bir model belgesi bağlanır. Bağın kendisi Çizim Merkezi'nde
-- (cizimler_bag, hedef "cnc-kurulum", hedef kimliği bu satır); burada yalnız hedef ve sürüm durur. Yeni ve boş tablo.
CREATE TABLE cnc_kurulum_model (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  makine_id integer UNIQUE REFERENCES makine (id) ON DELETE RESTRICT,
  aparat_anahtari text UNIQUE CHECK (aparat_anahtari ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  surum integer NOT NULL DEFAULT 1 CHECK (surum > 0),
  guncelleyen_kisi_id integer NOT NULL REFERENCES kisi (id),
  guncellendi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cnc_kurulum_model_tek_hedef CHECK (num_nonnulls(makine_id, aparat_anahtari) = 1)
);
