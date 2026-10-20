// İdari İşler (188 a, 190 a). Her personel kendi adına tesis talebi açar ve kendi taleplerini görür (talep-ac); Bugün ekranını,
// bütün talepleri ve periyodik kontrolleri idari işler ile müdür okur (oku); talebi üstlenme, kapatma ve red (talep-yonet) ile
// periyodik kontrol, sözleşme ve atık kaydı (kontrol-yaz), günün yemek sayısını bildirme (yemek-yaz), araç kartı ile araç görevini onaylama,
// reddetme ve km yazma (filo-yaz) idari işlerindir. Araç görev talebini her çalışan kendi adına açar ve kendi talebini görür
// (arac-talebi-ac, 247 a). Demirbaş kaydı, zimmetleme ve iade (zimmet-yaz, 244 a) idari işlerindir. Rol dağılımı 216 a (müdür yalnız
// okur), 234 a, 246 a, 247 a ve 256 a (zimmet-yaz yalnız idari işler, İK salt okur); satırlar Çekirdek'in göçünde.
export const IDARI_ISLER_ISLEMLERI = [
  'idari-isler.oku', 'idari-isler.talep-ac', 'idari-isler.talep-yonet', 'idari-isler.kontrol-yaz', 'idari-isler.yemek-yaz', 'idari-isler.filo-yaz',
  'idari-isler.arac-talebi-ac', 'idari-isler.zimmet-yaz',
] as const;
