-- 1209 b (kullanıcı kararı 29.10.2026): GKK kalite istasyonunun operasyonudur; kalite çalışanı terminalden öteki adımlar gibi başlatır,
-- kabul sayar ve hatalı girer. Kalite rolü terminal sayfasını zaten görür; yazma işlemi eklenir. Sınır bugünkü kapsamdır: kişi yalnız
-- izinli iş merkezinin istasyonunda sayar.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır; ekrandan önceden verilmiş satır korunur.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'kalite'), 'terminal.uret'
ON CONFLICT DO NOTHING;
