import { randomUUID } from 'node:crypto';
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, gecersiz } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { altKartaBagla } from '../alt-kart/servis.ts';
import { katalogSunucuAnahtari } from '../kurallar.ts';
import { katalogKartiKaydet } from '../servis.ts';
import * as s from '../sorgular.ts';
import { alternatifDegerlendir } from './servis.ts';
import { alternatifEtiketi, alternatifKartAdi, dondurulmusUyum, islemFarkliMi, type AlternatifNitelikleri, type DondurulmusSinir, type SetKarti } from './kurallar.ts';

export type { AlternatifNitelikleri } from './kurallar.ts';

const nesne = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

// 3437 a (dilim 3b-2): satın almada onaylanan alternatif için kart. Aynı nitelikli kart (benzersiz anahtar) varsa o kullanılır; yoksa ana
// kartın kaydından nitelikleri değiştirilmiş kart ONAYDA açılır (açan: çağıran kişi; dört göz malzemelerin onay akışındadır) ve ana
// kartın alternatif alt kartı olarak bağlanır. Zarf yeniden denetlenir: sınır dışı aday kart açmaz. Ad ve ağırlık kartı onaylayan
// tamamlar: ad ana kartın adına alternatif etiketi eklenerek önerilir, birim ağırlık boş kalır. Yetki denetlemez; çağıran korur.
// 3593 (Risk S4, S5): alternatif kartıyla gelen teklifte kart yalnız teklife dondurulan sınırın içindeki değerle açılır (sinir). İşlem
// ana karttan farklıysa yeni kartın işlemi odur; aynı anahtarlı kartın işlemi tutmazsa o kart kullanılmaz, yeni kart mükerrer gerekçesiyle
// açılır (anahtarda işlem yok; anahtarı değiştiren göç yapılmaz).
const dizi = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const ISLEM_GEREKCESI = 'alternatif: islem farki';
export async function alternatifKartiAc(
  db: Db, k: Kullanici, anaNo: number, a: AlternatifNitelikleri, sinir: DondurulmusSinir | null = null,
): Promise<{ no: number; yeni: boolean }> {
  const ana = await s.kartKimlikVeKayit(db, anaNo);
  if (ana === null || ana.tur !== 'hammadde' || ana.onayDurumu === 'iptal') throw bulunamadi('Alternatifin ana kartı bulunamadı.');
  const kayit0 = ana.kayit;
  const opts0 = nesne(kayit0['opts']);
  const aday = {
    form: typeof kayit0['form'] === 'string' ? kayit0['form'] : null,
    kalite: a.kalite ?? (typeof kayit0['grade'] === 'string' ? kayit0['grade'] : null),
    durum: a.durum ?? (typeof opts0['durum'] === 'string' ? opts0['durum'] : null),
    yuzey: a.yuzey ?? (typeof opts0['yuzey'] === 'string' ? opts0['yuzey'] : null),
    olcu: { ...(nesne(kayit0['dims']) as Record<string, number>), ...a.olcu },
  };
  const anaIslem = dizi(opts0['islem']);
  const islem = a.islem ?? anaIslem;
  const islemFarki = islemFarkliMi(islem, anaIslem);
  if (sinir !== null) {
    const setAday: SetKarti = { ...sinir.ana, form: aday.form, kalite: aday.kalite, durum: aday.durum, yuzey: aday.yuzey, islemler: islem, olcu: { ...sinir.ana.olcu, ...a.olcu } };
    const u = dondurulmusUyum(sinir, setAday);
    if (!u.uyar) throw gecersiz(`Alternatif kartı sınırı dışında; kart açılmaz (${u.neden}).`);
    const ayni = (await alternatifDegerlendir(db, anaNo, aday))?.sonuc === 'ayni';
    if (ayni && !islemFarki) return { no: anaNo, yeni: false };
  } else {
    if (islemFarki) throw gecersiz('İşlemi farklı alternatif yalnız alternatif kartıyla kabul edilir; kart açılmaz.');
    const sonuc = await alternatifDegerlendir(db, anaNo, aday);
    if (sonuc === null || sonuc.sonuc === 'disi') throw gecersiz(`Alternatif kabul sınırı dışında; kart açılmaz${sonuc ? ` (${sonuc.nedenler.join(', ')})` : ''}.`);
    if (sonuc.sonuc === 'ayni') return { no: anaNo, yeni: false };
  }
  const kimlik = `alt-${randomUUID()}`;
  const { onay: _o, rev: _r, talep: _t, ...kopya } = kayit0;
  const etiket = alternatifEtiketi(a);
  const com = nesne(kayit0['com']);
  const { kod: _k, ...comKopya } = com;
  const kayit: Record<string, unknown> = {
    ...kopya, id: kimlik, onay: { durum: 'onayda' },
    grade: aday.kalite, opts: { ...opts0, ...(aday.durum === null ? {} : { durum: aday.durum }), ...(aday.yuzey === null ? {} : { yuzey: aday.yuzey }), ...(islemFarki ? { islem } : {}) },
    dims: aday.olcu,
    // Kod ana kartın önekinden; sıra sunucudan (yeniStokKodu).
    com: { ...comKopya, kod: `${ana.onek}1`, ad: alternatifKartAdi(typeof com['ad'] === 'string' ? com['ad'].trim() : '', etiket) },
  };
  const anahtar = katalogSunucuAnahtari('hammadde', kayit);
  const var_ = anahtar ? await s.katalogAyniAnahtarli(db, anahtar, kimlik) : [];
  // Aynı nitelikli ve aynı işlemli kart varsa yeni kart açılmaz; bağı yoksa bağ kurulmaz (başka ailenin kartı olabilir), kart olduğu gibi
  // kullanılır. Anahtarı tutan ama işlemi tutmayan kart (ana kart dahil) kullanılmaz (S4).
  let mukerrer: string | null = null;
  for (const v of var_) {
    const no = (await s.kartNoKimlikle(db, v.kimlik))!;
    const vIslem = dizi(nesne((await s.katalogKartKaydiNoIle(db, no))?.kayit['opts'])['islem']);
    if (!islemFarkliMi(islem, vIslem)) return { no, yeni: false };
    mukerrer = ISLEM_GEREKCESI;
  }
  await katalogKartiKaydet(db, k, kimlik, { kayit, ozet: { benzersiz_anahtar: null, mukerrer_gerekcesi: mukerrer }, surum: null } as Parameters<typeof katalogKartiKaydet>[3]);
  await altKartaBagla(db, k, kimlik, { anaKimlik: ana.kimlik, tur: 'alternatif', etiket });
  return { no: (await s.kartNoKimlikle(db, kimlik))!, yeni: true };
}
