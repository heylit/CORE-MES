-- Ekip çağrısı yönlendirmesi (298 a): operatörün çağırdığı ekip, bildirimin hangi rollere gideceğini seçer. Ekip satırı
-- sürümü ve son değiştireni taşır; roller ayrı satırdır, silinen rol yönlendirmeden de düşer.
CREATE TABLE bildirim_cagri_ekibi (
  ekip text PRIMARY KEY CONSTRAINT bildirim_cagri_ekibi_ekip_gecerli CHECK (ekip IN ('bakim', 'kalite', 'malzeme', 'amir', 'ayarci')),
  surum int NOT NULL DEFAULT 1 CONSTRAINT bildirim_cagri_ekibi_surum_gecerli CHECK (surum >= 1),
  degistiren_kisi_id int CONSTRAINT bildirim_cagri_ekibi_degistiren_fk REFERENCES kisi,
  degistirildi timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bildirim_cagri_alicisi (
  ekip text NOT NULL CONSTRAINT bildirim_cagri_alicisi_ekip_fk REFERENCES bildirim_cagri_ekibi ON DELETE CASCADE,
  rol_id int NOT NULL CONSTRAINT bildirim_cagri_alicisi_rol_fk REFERENCES rol ON DELETE CASCADE,
  CONSTRAINT bildirim_cagri_alicisi_pk PRIMARY KEY (ekip, rol_id)
);
CREATE INDEX bildirim_cagri_alicisi_rol ON bildirim_cagri_alicisi (rol_id);

-- Varsayılan (298 a): bakım -> bakım + müdür, malzeme -> depo, kalite -> kalite, ayarcı -> müdür (298 b).
-- Amir için karar yok: bugün çağrıyı gören `arkon.amir` rolleri (vardiya sorumlusu, müdür) korunur.
INSERT INTO bildirim_cagri_ekibi (ekip) VALUES ('bakim'), ('kalite'), ('malzeme'), ('amir'), ('ayarci');
INSERT INTO bildirim_cagri_alicisi (ekip, rol_id)
SELECT e.ekip, r.id
  FROM (VALUES ('bakim', 'bakim'), ('bakim', 'mudur'), ('kalite', 'kalite'), ('malzeme', 'depo'),
               ('amir', 'vardiya_sorumlusu'), ('amir', 'mudur'), ('ayarci', 'mudur')) AS e (ekip, rol)
  JOIN rol r ON r.kod = e.rol;
