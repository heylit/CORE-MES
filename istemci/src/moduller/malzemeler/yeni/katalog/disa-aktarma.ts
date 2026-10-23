// Katalogun CSV ve JSON dışa aktarması; sütunlar ve alanlar prototiptekiyle aynı sırada. Listede görünen (süzülmüş) kartlar aktarılır.
// Fiyat, para birimi, fiyat esası, kg ve parça fiyatı, stok ve en az sipariş sütunları prototipte de çıkarılıyordu; burada hiç kurulmaz.
import { isNum, r4 } from '../bicim.ts';
import { ONAY, PROPS, TURLER } from '../sabitler/index.ts';
import * as K from '../kurallar/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { KartKaydi } from '../tipler.ts';

type Hucre = string | number | null | undefined;

const csvHucresi = (v: Hucre): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const sayi = (v: unknown): string => (isNum(v) ? String(r4(v)).replace('.', ',') : v === null || v === undefined ? '' : String(v));

function propBasligi(p: { ad: string; u?: string }): string {
  if (p.u === '*') return `${p.ad} (sertlik birimi aileye göre)`;
  return p.u ? `${p.ad} (${p.u})` : p.ad;
}

export function katalogCsvMetni(kayitlar: readonly KartKaydi[], b: KuralBaglami): string {
  const props = PROPS as readonly { k: string; ad: string; u?: string }[];
  const bas = ['Tür', 'Kod', 'Ad', 'Aile', 'Sınıf', 'Kalite', 'Standart', 'Eşdeğerler', 'Form', 'Ölçüler', 'Tolerans', 'Birim ağırlık (kg)', 'kg/m', 'kg/m²',
    'Durum ve işlem', 'Tedarikçi', 'Stok birimi', 'Sertifikalar', 'Notlar', 'Ayrıntılar', ...props.map(propBasligi),
    'Onay durumu', 'Teknik kod', 'Açıklama 1', 'Açıklama 2', 'Açıklama 3'];
  const yer = (ad: string) => bas.indexOf(ad);
  const satirlar = kayitlar.map((x) => {
    const r: Hucre[] = new Array<Hucre>(bas.length).fill('');
    const com = x.com ?? {};
    if (K.isGen(x, b)) {
      r[0] = TURLER[x.tur as keyof typeof TURLER]?.ad ?? x.tur;
      r[1] = com.kod;
      r[2] = com.ad;
      r[3] = (K.sarfKat(x, b) ?? K.dbKat(x, b) ?? {}).ad ?? '';
      const w = K.weight(x, b);
      if (w && typeof w.kg === 'number') r[yer('Birim ağırlık (kg)')] = sayi(w.kg);
      r[yer('Tedarikçi')] = com.ted ?? '';
      r[yer('Stok birimi')] = K.finalBirim(x, b);
      r[yer('Sertifikalar')] = (com.sertifika ?? []).join(', ');
      r[yer('Notlar')] = com.not ?? '';
      r[yer('Ayrıntılar')] = K.gFlat(x, b)
        .filter(([s, k]: string[]) => !(s === 'Tanım' && (k === 'Kod' || k === 'Ad')))
        .map(([, k, v]: string[]) => `${k}: ${v}`).join(' | ');
    } else {
      const s = K.specData(x, b);
      const ozellikler = new Set(K.propsFor(x.fam, b).map((p: { k: string }) => p.k));
      const sirali: Hucre[] = ['Hammadde', s.kod, s.ad, s.f?.ad ?? '', s.c?.ad ?? '', s.g?.ad ?? '', s.std, K.eqText(s.eq, b), s.fm?.ad ?? '', K.dimsStr(x, true, b), x.tol,
        sayi(s.w?.kg), sayi(s.w?.perM), sayi(s.w?.perM2), s.opts.map((o) => `${o.ad}: ${String(o.v)}`).join(' | '), com.ted, s.birim,
        (com.sertifika ?? []).join(', '), com.not, '', ...props.map((p) => (ozellikler.has(p.k) ? sayi(K.val(p.k, x, b)) : ''))];
      sirali.forEach((v, i) => { r[i] = v; });
    }
    const son = bas.length - 5;
    r[son] = ONAY[K.onayDurum(x, b)].ad;
    r[son + 1] = (typeof com.tkod === 'string' && com.tkod) || K.teknikKod(x, b);
    r[son + 2] = K.finalAc(x, 0, b);
    r[son + 3] = K.finalAc(x, 1, b);
    r[son + 4] = K.finalAc(x, 2, b);
    return r;
  });
  return `﻿${[bas, ...satirlar].map((r) => r.map(csvHucresi).join(';')).join('\r\n')}`;
}

export function katalogJsonMetni(kayitlar: readonly KartKaydi[], b: KuralBaglami): string {
  const yuvarla = (v: unknown) => (isNum(v) && v ? r4(v) : null);
  const ogeler = kayitlar.map((x) => {
    const com = x.com ?? {};
    const temel = K.isGen(x, b)
      ? K.gStokOzeti(x, b)
      : (() => {
        const s = K.specData(x, b);
        return {
          tur: 'hammadde', kod: s.kod, ad: s.ad, aile: s.f?.ad ?? '', sinif: s.c?.ad ?? '', kalite: s.g?.ad ?? '', standart: s.std, esdegerler: { ...s.eq },
          form: s.fm?.ad ?? '', olculer: { ...x.dims }, olcu_metni: K.dimsStr(x, true, b), tolerans: x.tol,
          agirlik: s.w ? { parca_kg: yuvarla(s.w.kg), kg_m: yuvarla(s.w.perM), kg_m2: yuvarla(s.w.perM2) } : null,
          durum_islem: Object.fromEntries(s.opts.map((o) => [o.ad, o.v])),
          ozellikler: Object.fromEntries(s.props.map((p) => [p.ad + (p.u ? ` (${p.u})` : ''), p.v])),
          ek_ozellikler: (x.extra ?? []).filter((e: { ad?: string }) => e.ad), ticari: { ...com, birim: s.birim },
          guncelleme: new Date(x.updatedAt ?? Date.now()).toISOString(),
        };
      })();
    return {
      ...temel, onay_durumu: K.onayDurum(x, b), onay: x.onay ?? null, teknik_kod: com.tkod || K.teknikKod(x, b),
      aciklama_1: K.finalAc(x, 0, b), aciklama_2: K.finalAc(x, 1, b), aciklama_3: K.finalAc(x, 2, b),
    };
  });
  return JSON.stringify(ogeler, null, 2);
}

export function birlesmeCsvMetni(kayitlar: readonly KartKaydi[], b: KuralBaglami): string {
  const l = K.birlesmeListesi(kayitlar, b);
  const satirlar = [['Eski kod', 'Eski ad', 'Yeni kod', 'Tarih', 'Neden'], ...l.map((r) => [r.eski_kod, r.eski_ad, r.yeni_kod, r.tarih, r.neden])];
  return `﻿${satirlar.map((r) => r.map(csvHucresi).join(';')).join('\r\n')}`;
}
