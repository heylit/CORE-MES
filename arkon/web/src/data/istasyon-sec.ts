// Operatör ekranının istasyonu: bu cihazda seçilmiş istasyon, yoksa kişinin TMI'de atandığı istasyon, yoksa listede ilk yetkili
// istasyonu, o da yoksa listedeki ilk istasyon. Listede olmayan (silinmiş ya da pasif) kayıt atlanır.
export function istasyonSec(kayitli: string | null | undefined, atanan: string | null | undefined, liste: readonly string[], yetkili?: readonly string[] | null): string {
  const var_ = (x: string | null | undefined): x is string => !!x && liste.includes(x);
  if (var_(kayitli)) return kayitli;
  if (var_(atanan)) return atanan;
  return liste.find((x) => (yetkili ?? []).includes(x)) ?? liste[0] ?? kayitli ?? '';
}

// İlk açılış: cihazda istasyon yoksa ekran kişinin TMI istasyonuyla açıldığında bu istasyon cihaza yazılır (üretim kaydı,
// olay ve sayım `isStationTablet` ile cihaz istasyonu ister; yazılmazsa kayıt düşer). Atama yoksa operatöre istasyon sorulur.
export function ilkAcilis(kayitli: string | null | undefined, atanan: string | null | undefined, acilan: string, uretebilir: boolean): 'kaydet' | 'sor' | null {
  if (kayitli || !uretebilir || !acilan) return null;
  return atanan === acilan ? 'kaydet' : 'sor';
}

// Kullanıcı onayı (2026-10-15): istasyon değiştirme yetkisi (prod.station) olmayan kişi, tabletin istasyonunu yalnız kendi
// yetkili istasyonları (TMI'de Vardiya ataması ve Reçete ve Rota yetkinliği) arasında değiştirir; yetkisi olan bütün listeyi görür.
export function secilebilirIstasyonlar<T extends { id: string }>(liste: readonly T[], tamYetki: boolean, yetkili: readonly string[] | null | undefined): T[] {
  return tamYetki ? [...liste] : liste.filter((x) => (yetkili ?? []).includes(x.id));
}
