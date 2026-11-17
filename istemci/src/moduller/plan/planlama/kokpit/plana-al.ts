import type { AtolyeKomutuCevabi, PlanaAlGovdesi, PlanaAlOnizlemesiCevabi } from '#paylasilan/sozlesme/planlama-atolye.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../../ortak/veri/istek-kimligi.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { GonderHatasi } from '../motor/atolye/gonder.ts';

// Plana alma (3151): planda yeri olmayan emrin ilk adımı tezgâha ve saate kilitlenir; komut taşıma gibi önce çalışmayı kaydeder, sonra kendi
// ucuna gider. Önizleme okunamazsa null: seçenek sonuçsuz gösterilir, komutu sunucu yine denetler.
export type PlanaAlOnizlemesi = PlanaAlOnizlemesiCevabi;
export const PLANA_AL_ONIZLEME_YOLU = '/plan/planlama-calismasi/plana-al-onizlemesi';
// Sayfanın bildiği sürüm eskiyse (sayfa açıkken çalışma yazıldı: açılıştaki kaynak değişikliği satırı, sayfanın kendi yazması, başka kişi)
// sunucu "Plan bu sırada değişti" diye reddeder ve güncel sürümü döner. Önizleme bir kez güncel sürümle yeniden sorulur; eski sürümün
// yerine geçen sürüm bellekte tutulur, sonraki sorular doğrudan onunla gider. Yazma bu sürümü kullanmaz (taslak komutu ya da kendi denetimi).
const yerineGecen = new Map<number, number>();
function onizlemeSor(g: Omit<PlanaAlGovdesi, 'calismaSurumu'>, calismaSurumu: number): Promise<PlanaAlOnizlemesi | null> {
  const q = new URLSearchParams({ calismaSurumu: String(calismaSurumu), emirId: g.emirId, tezgah: g.tezgah, baslangic: String(g.baslangic) });
  if (g.adimlar && g.adimlar.length > 0) q.set('adimlar', JSON.stringify(g.adimlar));
  return api.get<PlanaAlOnizlemesi>(`${PLANA_AL_ONIZLEME_YOLU}?${q.toString()}`).then((c) => c, () => null);
}
export async function planaAlOnizle(g: Omit<PlanaAlGovdesi, 'calismaSurumu'>, calismaSurumu: number): Promise<PlanaAlOnizlemesi | null> {
  const v = yerineGecen.get(calismaSurumu) ?? calismaSurumu;
  const c = await onizlemeSor(g, v);
  if (c === null || c.gecerli || c.calismaSurumu === null || c.calismaSurumu === v) return c;
  yerineGecen.set(calismaSurumu, c.calismaSurumu);
  return onizlemeSor(g, c.calismaSurumu);
}
export async function emriPlanaAl(komut: CalismaKomutu, g: Omit<PlanaAlGovdesi, 'calismaSurumu'>): Promise<AtolyeKomutuCevabi> {
  const calismaSurumu = await komut.kaydet();
  if (calismaSurumu === null) throw new GonderHatasi('Emir plana alınamadı: çalışma kaydedilemedi; sayfayı yenileyip yeniden deneyin.');
  try {
    return await tekrarKorumaliGonder((d) => api.post<AtolyeKomutuCevabi>('/plan/planlama-calismasi/plana-al', { ...g, calismaSurumu }, d));
  } catch (h) { throw new GonderHatasi(`Emir plana alınamadı: ${hataIletisi(h, 'sunucuya ulaşılamadı')}`); }
}
