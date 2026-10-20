// İnsan Kaynakları. Okuma tek uçtan (`GET /ik/veri`, oturum) yapılır ve kişiye göre süzülür: `ik.oku` bütün kayıtları
// açar, olmayan kişi kendi kaydını ve (yöneticiyse) ekibini görür. Her yazma alanının kendi işlemi vardır.
export const IK_ISLEMLERI = [
  'ik.oku',
  'ik.personel-yaz',
  'ik.ucret-yaz',
  'ik.izin-yaz',
  'ik.izin-talep',
  'ik.izin-onay',
  'ik.devam-yaz',
  'ik.bordro-kesinlestir',
  'ik.bordro-kilit-ac',
  // Çalışanın kendi kesinleşmiş bordrosunu "gördüm" diye onaylaması (IK-40..IK-46); bordroyu değiştirmez.
  'ik.bordro-gordum',
  'ik.performans-yaz',
  'ik.egitim-yaz',
  'ik.ise-alim-yaz',
  'ik.pozisyon-onay',
  'ik.ayar-yaz',
  // Kan grubu ve engel durumu KVKK'da özel nitelikli kişisel veridir; kişi kartını görmek bunları açmaz.
  'ik.ozel-veri-oku',
] as const;
