-- 1985 a (1952 iş 2b): parça motorun paralel bölmesinden mi (rotada "paralel böl"), planlamacının elle bölmesinden mi. Motorun bölmesini
-- motor sonraki öneride yeniden kurar; elle bölme (kart #1572) yerinde kalır. Var olan parçalar elle bölmedir (false); sabit varsayılanlı
-- sütun tabloyu yeniden yazmaz.
ALTER TABLE plan_yerlesim_parcasi ADD COLUMN motor_bolmesi boolean NOT NULL DEFAULT false;
ALTER TABLE plan_senaryo_yerlesim_parcasi ADD COLUMN motor_bolmesi boolean NOT NULL DEFAULT false;
