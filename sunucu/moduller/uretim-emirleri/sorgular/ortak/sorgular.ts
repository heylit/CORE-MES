// Zaman ISO 8601 metni olarak döner (sözleşme: zaman).
export const ISO = (sutun: string) => `to_json(${sutun}) #>> '{}'`;
export const NULLU_ISO = (sutun: string) => `CASE WHEN ${sutun} IS NULL THEN NULL ELSE ${ISO(sutun)} END`;
export const TARIH = (sutun: string) => `to_char(${sutun}, 'YYYY-MM-DD')`;

// Terminalin işlediği iş emri: çalışan, yoksa sıradaki bekleyen, hepsi bittiyse son biten. İş emirsiz emirde boştur;
// sayaç, olay ve kontrol listesi bu iş emri kapsamında okunur ve yazılır (iş emirsiz emirde kapsam boş iş emridir).
export const TERMINAL_IS_EMRI = (emir: string) => `(SELECT ie.id FROM uretim_emirleri_is_emri ie WHERE ie.uretim_emri_id = ${emir}
  ORDER BY CASE ie.durum WHEN 'calisiyor' THEN 0 WHEN 'bekliyor' THEN 1 ELSE 2 END, CASE WHEN ie.durum = 'tamam' THEN -ie.sira ELSE ie.sira END
  LIMIT 1)`;

// Bitmiş ve iptal emir kapalıdır; listeler varsayılan olarak yalnız açıkları döner (kart #1323).
export const KAPALI = "e.durum IN ('bitti', 'iptal')";
// Arama metni LIKE kalıbı olarak değil düz metin olarak aranır (% ve _ joker sayılmaz).
export const ARAMA = (p: string) => `($${p}::text IS NULL OR strpos(lower(e.emir_no || ' ' || e.parca_no || ' ' || e.parca_ad), lower($${p}::text)) > 0)`;

// Üç defter tek listede: kimlik tablo kimliğinin üç katı artı kaynak payıdır (0 kayıt, 1 olay, 2 sayım),
// bu yüzden çakışmaz. Aynı anı taşıyan satırlarda başlatma önce, bitirme sonra gelir.
// Kalite kararı sağlama ya da redde geçen satırdır ve karar anında görünür; kişi sayandır, kararı veren ayrı gelir. Karar veren sütunundan önce
// yazılmış karar satırı, aynı anda aynı adedi karar bekleyenden düşen eşinden tanınır; kararı veren bilinmez.
export const KARAR_SATIRI = `(s.tur = 'red' OR (s.tur = 'saglam' AND s.duzeltme AND (s.karar_veren_kisi_id IS NOT NULL OR EXISTS (
  SELECT 1 FROM uretim_sayimi k WHERE k.emir_id = s.emir_id AND k.zaman = s.zaman AND k.tur = 'karar_bekliyor'
     AND k.duzeltme AND k.adet = -s.adet AND k.is_emri_id IS NOT DISTINCT FROM s.is_emri_id))))`;

export const DAL_VE_ONCUL = `(SELECT d.dal FROM uretim_emirleri_is_emri_dali d WHERE d.is_emri_id = i.id) AS dal,
  (SELECT d.adet_carpani FROM uretim_emirleri_is_emri_dali d WHERE d.is_emri_id = i.id) AS "adetCarpani",
  (SELECT COALESCE((SELECT json_agg(json_build_object('id', o.oncul_is_emri_id, 'tur', o.tur, 'devirAdedi', o.devir_adedi) ORDER BY o.oncul_is_emri_id)
                      FROM uretim_emirleri_is_emri_onculu o WHERE o.is_emri_id = d.is_emri_id), '[]'::json)
     FROM uretim_emirleri_is_emri_dali d WHERE d.is_emri_id = i.id) AS onculler`;
