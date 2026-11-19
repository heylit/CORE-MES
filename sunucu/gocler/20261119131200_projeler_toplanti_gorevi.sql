-- 3448 (onay a): projeli toplantının aksiyonundan açılan görev. Bağ yalnız eklenen boş olabilen sütundur; var olan görev değişmez.
-- Aksiyon Toplantılar'ındır: yabancı anahtar yok (Projeler alt kattadır, toplantı tablosunu tanımaz); bağın doğruluğunu görevi açan Toplantılar sağlar.
ALTER TABLE projeler_gorev ADD COLUMN toplanti_aksiyon_id int;

-- Bir aksiyondan iptal edilmemiş tek görev olur: "Göreve çevir" ikinci kez görev açmaz.
CREATE UNIQUE INDEX projeler_gorev_toplanti_aksiyon_tekil ON projeler_gorev (toplanti_aksiyon_id)
  WHERE toplanti_aksiyon_id IS NOT NULL AND durum <> 'iptal';
