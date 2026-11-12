import { type Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { DenetimSecimi, IkiliCevap } from '#cekirdek/uc.ts';
import type { IrsaliyeBelgeleriCevabi, IrsaliyeEkleGovdesi } from '#paylasilan/sozlesme/stok-irsaliye.ts';
import { belgeAcVeBagla, kaydaBagliBelgeler, kayitlaraBagliBelgeler, kayittakiBelgeDosyasi, kayittanKaldirVeArsivle } from '../../belge-merkezi/disari.ts';
import { irsaliyeBelgeAdi } from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';

// Mal kabul belgesi değişmez (yalnız eklenir); irsaliye ona bağ olarak eklenir ve kaldırılır, belgenin kendisine dokunulmaz.
const HEDEF = 'stok-mal-kabul' as const;
const YOK = 'Bu mal kabulde böyle bir irsaliye yok.';

async function malKabulOlmali(db: Db, id: number): Promise<{ no: string; irsaliyeNo: string | null }> {
  const b = await sorgular.malKabulBul(db, id);
  if (!b) throw bulunamadi('Mal kabul belgesi bulunamadı.');
  return b;
}

export async function irsaliyeBelgeleri(db: Db, malKabulId: number): Promise<IrsaliyeBelgeleriCevabi> {
  await malKabulOlmali(db, malKabulId);
  return { belgeler: (await kaydaBagliBelgeler(db, HEDEF, malKabulId)).filter((b) => b.tur === 'irsaliye').map((b) => ({ id: b.id, ad: b.ad })) };
}

// Liste ekranları satır başına sorgu atmasın diye.
export async function malKabullerinIrsaliyeleri(db: Db, malKabulIdler: readonly number[]): Promise<Map<number, { id: number; ad: string }[]>> {
  const harita = await kayitlaraBagliBelgeler(db, HEDEF, [...new Set(malKabulIdler)]);
  return new Map([...harita].map(([id, l]) => [id, l.filter((b) => b.tur === 'irsaliye').map((b) => ({ id: b.id, ad: b.ad }))]));
}

export async function irsaliyeEkle(
  db: Db, k: Kullanici, malKabulId: number, g: IrsaliyeEkleGovdesi, denetimEki: (satirlar: readonly DenetimSecimi[]) => void,
): Promise<IrsaliyeBelgeleriCevabi> {
  const b = await malKabulOlmali(db, malKabulId);
  const bagli = (await kaydaBagliBelgeler(db, HEDEF, malKabulId)).filter((x) => x.tur === 'irsaliye');
  // Cihazda bekleyen irsaliye bağlantı gelince yeniden gönderilir; istek kimliğinin süresi geçmiş olabilir: aynı dosya ikinci kez bağlanmaz.
  if (bagli.some((x) => x.ozet === g.ozet)) return irsaliyeBelgeleri(db, malKabulId);
  const sira = bagli.length + 1;
  await belgeAcVeBagla(db, k, { ad: irsaliyeBelgeAdi(b.no, b.irsaliyeNo, sira), tur: 'irsaliye', ozet: g.ozet, dosyaAdi: g.dosyaAdi }, HEDEF, malKabulId, denetimEki);
  return irsaliyeBelgeleri(db, malKabulId);
}

// 3058 c + 3062 a: mal kabulden kalkar, merkezde arşive alınır; kim ve ne zaman denetim kaydındadır, ek hangi belge ve dosya olduğunu yazar.
export async function irsaliyeKaldir(
  db: Db, malKabulId: number, belgeId: number, denetimEki: (satirlar: readonly DenetimSecimi[]) => void,
): Promise<IrsaliyeBelgeleriCevabi> {
  await malKabulOlmali(db, malKabulId);
  const bagli = (await kaydaBagliBelgeler(db, HEDEF, malKabulId)).find((x) => x.id === belgeId && x.tur === 'irsaliye');
  if (bagli === undefined) throw bulunamadi(YOK);
  const kalkan = await kayittanKaldirVeArsivle(db, belgeId, HEDEF, malKabulId);
  if (kalkan === null) throw bulunamadi(YOK);
  denetimEki([{ belgeId, ad: kalkan.ad, ozet: kalkan.ozet }]);
  return irsaliyeBelgeleri(db, malKabulId);
}

export async function irsaliyeDosyasi(db: Db, malKabulId: number, belgeId: number): Promise<IkiliCevap> {
  const dosya = await kayittakiBelgeDosyasi(db, HEDEF, malKabulId, belgeId);
  if (dosya === null) throw bulunamadi(YOK);
  return dosya;
}
