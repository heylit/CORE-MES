import type { IkRolu } from '#paylasilan/sozlesme/ik.ts';
import type { IkYetkisi } from './yetki.ts';
import type { Departman, Personel } from './tipler.ts';

// Ekran rolü sunucudan gelir (`GET /ik/veri` ben.rol, IK-21: işlemden ve ekipten çıkar); ekranın kendi rol ayarı yoktur.
export type IkEkranRolu = IkRolu;

const dolu = (v: unknown): boolean => v !== undefined && v !== null && v !== '';

// IK-24: ekip, personel kaydındaki yönetici bağı (alt kademeler dahil) ve yöneticisi olduğu departmanlardır. Sunucudaki
// `ekipKimlikleri` ile aynı kuraldır; sunucu zaten yalnız görebildiği kayıtları gönderir, bu yalnız gösterim içindir.
export function ekipKimlikleri(personeller: readonly Personel[], departmanlar: readonly Departman[], yonetici: string | null): Set<string> {
  const ekip = new Set<string>();
  if (yonetici === null) return ekip;
  const aktif = personeller.filter((e) => !dolu(e.cikisTarihi));
  const bolumler = new Set(departmanlar.filter((d) => d.yoneticiId === yonetici).map((d) => d.id));
  for (const e of aktif) if (e.id !== yonetici && (e.yoneticiId === yonetici || bolumler.has(e.departmanId ?? ''))) ekip.add(e.id);
  let buyudu = true;
  while (buyudu) {
    buyudu = false;
    for (const e of aktif) {
      if (!ekip.has(e.id) && e.id !== yonetici && ekip.has(e.yoneticiId ?? '')) { ekip.add(e.id); buyudu = true; }
    }
  }
  return ekip;
}

// 214 a: ekip maddeleri yalnız izin onayı yetkisiyle görünür (kabuk menüsüyle aynı kural). İK sayfasının maddeleri `ik.oku` ister.
const EKIP_GORUNUMLERI = new Set(['onay', 'ekip', 'uye', 'ekiptakvim']);
const ISLEMLERIM_GORUNUMLERI = new Set(['benim', 'izinlerim', 'bordrolarim', 'mesailerim', ...EKIP_GORUNUMLERI]);

export function gorunumAcik(anahtar: string, yetki: Pick<IkYetkisi, 'oku'> & { izinOnayVar: boolean }): boolean {
  if (EKIP_GORUNUMLERI.has(anahtar)) return yetki.izinOnayVar;
  if (ISLEMLERIM_GORUNUMLERI.has(anahtar)) return true;
  return yetki.oku;
}
