import { createHash } from 'node:crypto';
import type { z } from 'zod';
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { kararliJson } from '#cekirdek/tekrar.ts';
import type { DenetimGirdisi, Denetle } from '#cekirdek/uc.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type { KayitSatiri, SuzgecSecenekleriCevabi, kayitListesiSorgusu } from '#paylasilan/sozlesme/denetim.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { gizle, kimlikParametreleri } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

type KayitListesiSorgusuCikti = z.output<typeof kayitListesiSorgusu>;

export interface GovdeOzeti {
  _ozet: { boyut: number; sha256: string };
}

// Gövdesiz uçta gövdenin yerine yazılan: kararlı JSON'un bayt sayısı ve özeti. Maskelenmiş gövde verilir: ham
// gövdenin özeti deftere girerse kısa bir gizli değer (parola, PIN) özetten çevrimdışı denenebilir.
export function govdeOzeti(maskeliGovde: unknown): GovdeOzeti | undefined {
  if (maskeliGovde === undefined) return undefined;
  const metin = Buffer.from(kararliJson(maskeliGovde), 'utf8');
  return { _ozet: { boyut: metin.length, sha256: createHash('sha256').update(metin).digest('hex') } };
}

// Ucun seçtiği alanlar özetin yanına ayrı anahtarla girer; seçim de maskelenir (seçici gizli adlı alanı seçmiş olabilir).
function govdesizKayit(maskeliGovde: unknown, secilen: DenetimGirdisi['secilen']): (GovdeOzeti & { _secilen?: unknown }) | undefined {
  const ozet = govdeOzeti(maskeliGovde);
  return ozet === undefined || secilen === undefined ? ozet : { ...ozet, _secilen: gizle(secilen) };
}

// Ek gövdenin parçasıdır (yalnız gövdeyi okuyabilen görür): ayrılmış `_ek` anahtarına girer. Gövde düz nesne değilse ya da
// kendisi `_ek` taşıyorsa gövde `_govde` altına alınır; ek gövdenin bir alanını ezemez.
function ekli(govde: unknown, ek: DenetimGirdisi['ek']): unknown {
  if (ek === undefined) return govde;
  const maskeliEk = gizle(ek);
  const duz = typeof govde === 'object' && govde !== null && !Array.isArray(govde);
  if (duz && !Object.hasOwn(govde, '_ek')) return { ...govde, _ek: maskeliEk };
  return govde === undefined ? { _ek: maskeliEk } : { _govde: govde, _ek: maskeliEk };
}

// Parametre de maskelenir: gövdesiz uçta satırın tek içerik sütunudur ve yol parametresi gizli değer taşıyabilir.
export const denetimYaz: Denetle = (db, girdi) => {
  const maskeli = gizle(girdi.govde);
  return sorgular.denetimEkle(db, {
    ...girdi,
    parametre: gizle(girdi.parametre),
    govde: ekli(girdi.kip === 'govdesiz' ? govdesizKayit(maskeli, girdi.secilen) : maskeli, girdi.ek),
  });
};

const suzgec = (s: KayitListesiSorgusuCikti): sorgular.KayitSuzgeci => ({
  kisi: s.kisi ?? null, baslangic: s.baslangic ?? null, bitis: s.bitis ?? null, yontem: s.yontem ?? null, yol: s.yol ?? null,
});

export async function kayitListesi(db: Db, sorgu: KayitListesiSorgusuCikti): Promise<SayfaliListe<KayitSatiri>> {
  const s = suzgec(sorgu);
  return sayfaliListe(sorgu, {
    say: () => sorgular.kayitSay(db, s),
    satirlar: async (dilim) => {
      const ham = await sorgular.kayitlar(db, s, dilim);
      const adlar = await kisiAdlari(db, ham.flatMap((k) => (k.kisi_id === null ? [] : [k.kisi_id])));
      return ham.map((k) => ({
        id: k.id, zaman: k.zaman, kisiId: k.kisi_id, kisiAd: k.kisi_id === null ? null : adlar.get(k.kisi_id) ?? null,
        yontem: k.yontem, yol: k.yol, kimlikler: kimlikParametreleri(k.parametre),
      }));
    },
  });
}

export async function suzgecSecenekleri(db: Db): Promise<SuzgecSecenekleriCevabi> {
  const adlar = await kisiAdlari(db, await sorgular.kayitliKisiler(db));
  const kisiler = [...adlar].map(([id, ad]) => ({ id, ad })).sort((a, b) => a.ad.localeCompare(b.ad, 'tr') || a.id - b.id);
  return { kisiler, komutlar: await sorgular.kayitliKomutlar(db) };
}

// Kayıt yazılırken maskelenmiştir; okurken yeniden maskelenir: kural sonradan genişlediyse eski satırdaki değer de çıkmaz.
export async function kayitIcerigi(db: Db, id: number): Promise<{ id: number; parametre: unknown; govde: unknown }> {
  const kayit = await sorgular.kayitIcerigi(db, id);
  if (!kayit) throw bulunamadi('Denetim kaydı bulunamadı.');
  return { id: kayit.id, parametre: gizle(kayit.parametre), govde: gizle(kayit.govde) };
}
