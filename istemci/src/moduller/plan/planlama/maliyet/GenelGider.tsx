import { useMemo } from 'react';
import { planGuncel } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { GiderSayfasi } from './asil/GiderSayfasi.tsx';
import { amortFormu, amortismanEksik, kalemDegisFormu, tezBilgiFormu } from './formlar.ts';
import {
  anahtarAdi, baslangicMs, genelGiderHesabi, kalemTutari, kisaTl, maliyetSistemi, mesaiSistemi, takvimKur, tl, YOK, type GenelGiderHesabi, type GiderKalemi, type TezgahGiderSatiri,
} from './kurallar.ts';
import { PARA_KILIDI } from './Maliyetler.tsx';
import { hucreKoy, IsiSayfasi, kdOran, yazici, type Acilim, type Hucre, type IsiBos, type IsiSatiri, type IsiVerisi } from './ortak.tsx';

interface Satir { f: (z: TezgahGiderSatiri) => number | null; kalem: GiderKalemi | null }

export function genelGiderBaglami(c: PlanlamaCalismasi | null): GenelGiderHesabi | null {
  return c && baslangicMs(c.D) !== null ? genelGiderHesabi(c, takvimKur(c)) : null;
}

// Gider kalemi × tezgâh grubu, aylık pay; boş hücre kalemin o gruba yazılmadığını söyler (zz30-isi ISI.giderler).
export function giderIsisi(c: PlanlamaCalismasi, v: GenelGiderHesabi): IsiVerisi<Satir> | IsiBos {
  const D = c.D;
  if (!D.tezgahlar.length) return { bos: 'Tezgâh ve gider bilgisi girilince dağılım burada görünür.' };
  const M = maliyetSistemi(D); const ms = mesaiSistemi(D);
  const gr = [...new Set(D.tezgahlar.map((t) => t.grup ?? ''))];
  const sutunlar = gr.map((g) => ({ k: g, ad: g || YOK, alt: `${String(D.tezgahlar.filter((t) => (t.grup ?? '') === g).length)} tezgâh` }));
  const top = (f: Satir['f'], g: string): number | null => {
    const l = v.tez.filter((z) => (z.tezgah.grup ?? '') === g).map(f).filter((x): x is number => x !== null);
    return l.length ? l.reduce((a, b) => a + b, 0) : null;
  };
  const tanim: { k: string; ad: string; alt: string; simge: 'layers' | 'cpu'; veri: Satir }[] = [
    ...M.kalemler.map((k) => ({ k: k.id, ad: k.ad, alt: `${tl(kalemTutari(k, M, ms))}/ay · ${anahtarAdi(k.anahtar)}`, simge: 'layers' as const, veri: { f: (z: TezgahGiderSatiri) => z.kalem[k.id] ?? null, kalem: k } })),
    { k: 'amort', ad: 'Amortisman', alt: 'tezgâh başına', simge: 'cpu', veri: { f: (z) => z.amort, kalem: null } },
  ];
  let mx = 0;
  for (const r of tanim) for (const g of gr) { const x = top(r.veri.f, g); if (x !== null) mx = Math.max(mx, x); }
  let en: { ad: string; g: string; x: number } | null = null;
  const satirlar: IsiSatiri<Satir>[] = tanim.map((r) => {
    const h: Record<string, Hucre> = {};
    for (const g of gr) {
      const x = top(r.veri.f, g);
      if (x === null) continue;
      hucreKoy(h, g, { v: x ? kisaTl(x) : '0', kd: mx > 0 ? kdOran(x / mx, [0.05, 0.15, 0.35, 0.6]) : 0, etiket: `${tl(x)} / ay` });
      if (!en || x > en.x) en = { ad: r.ad, g, x };
    }
    return { ...r, h };
  });
  const eksA = amortismanEksik(D);
  const enB = en as { ad: string; g: string; x: number } | null;
  const metin = `${enB ? `En sıcak hücre ${enB.ad}, ${enB.g || YOK}: ayda ${tl(enB.x)}. ` : ''}Aylık genel gider ${tl(v.aylik)}, ${v.atil === null ? 'boş tezgâh saatlerine düşen tutar bilinmiyor' : `bunun ${tl(v.atil)} tutarı boş tezgâh saatlerine düşüyor`}${eksA.length ? `; ${String(eksA.length)} tezgâhın amortisman bilgisi eksik` : ''}.`;
  return {
    genis: 'kalem', baslik: 'Gider kalemi × tezgâh grubu, aylık pay', satirAd: 'Gider kalemi', sutunlar, satirlar,
    ust: { ton: eksA.length ? 'uyari' : '', simge: 'layers', metin },
    lejant: { kdAd: { 1: 'Küçük pay', 2: 'Orta', 3: 'Büyük', 4: 'En büyük paylar' } },
    not: 'Bütçe tutulmadığı için ay ay sapma yerine kalemin tezgâh gruplarına dağılımı gösterilir; boş hücre o kalemin o gruba yazılmadığını söyler.',
  };
}

export function GenelGider(o: PlanlamaEkranOzellikleri) {
  const c = o.calisma;
  const v = useMemo(() => (o.yetki.maliyetOku ? genelGiderBaglami(c) : null), [c, o.yetki.maliyetOku]);
  const V = useMemo(() => (!o.yetki.maliyetOku ? PARA_KILIDI : c && v ? giderIsisi(c, v) : { bos: 'Planın başlangıç günü okunamadı; dağılım çizilemiyor.' }), [c, v, o.yetki.maliyetOku]);
  const yaz = yazici(o.komut);
  const yazabilir = o.komut !== null && o.yetki.maliyetOku;
  const kalemDegis = useMemo(() => (c && yazabilir ? kalemDegisFormu(c.D, yaz) : null),
  // yaz her çizimde yeniden kurulur; form çalışma ve yetkiyle değişir.
  [c, yazabilir]);

  const acilim = (r: IsiSatiri<Satir>, ck: string): Acilim | null => {
    if (!c) return null;
    const D = c.D;
    const tz = D.tezgahlar.filter((t) => (t.grup ?? '') === ck);
    const cel = r.h[ck];
    const sec = [{ ad: 'Maliyetler', etki: 'Bu payın siparişlerin maliyetine nasıl girdiğini gösterir.', simge: 'lira' as const, yap: () => { o.git('maliyet'); } }];
    if (!r.veri.kalem) {
      const eks = amortismanEksik(D).find((id) => tz.some((t) => t.id === id));
      const t = eks ?? tz[0]?.id;
      return {
        baslik: `Amortisman · ${ck || YOK}`, simge: 'cpu', ton: eks ? 'uyari' : '',
        neden: `${ck || YOK} grubunda ${String(tz.length)} tezgâh; aylık amortisman ${cel?.etiket ?? 'yok'}.${eks ? ` ${eks} için alış bedeli ya da ömür girilmedi.` : ''}`,
        bilgi: [['Tezgâhlar', tz.map((z) => z.id).join(', ')]],
        formlar: t && yazabilir ? [
          { tanim: amortFormu(D, yaz, t), deg: { tez: t }, etki: 'Tezgâhın aylık payı alış bedeli ve ömürden hesaplanır.' },
          { tanim: tezBilgiFormu(D, yaz, t), deg: { tez: t }, etki: 'Kira ve enerji payı bu bilgilerle dağıtılır.' },
        ] : [],
        secenekler: sec, kilitli: !yazabilir,
      };
    }
    const k = r.veri.kalem;
    const tutar = kalemTutari(k, maliyetSistemi(D), mesaiSistemi(D));
    return {
      baslik: `${k.ad} · ${ck || YOK}`, simge: 'layers', ton: '',
      neden: `${k.ad} ayda ${tl(tutar)}; ${anahtarAdi(k.anahtar)} ölçüsüyle dağılıyor, ${ck || YOK} grubuna ${cel?.etiket ?? 'pay düşmüyor'}.`,
      bilgi: [['Aylık', tl(tutar)], ['Dağıtım ölçüsü', anahtarAdi(k.anahtar)], ['Kapsam', k.kapsam || 'bütün tezgâhlar']],
      formlar: kalemDegis ? [{ tanim: kalemDegis, deg: { kal: k.id }, etki: 'Tutar ya da dağıtım ölçüsü değişince bütün tezgâhların saat maliyeti yeniden hesaplanır.' }] : [],
      secenekler: sec, kilitli: !yazabilir,
    };
  };

  return <IsiSayfasi ad="Genel gider ve amortisman" simge="layers" veri={V} acilim={acilim} planEski={c !== null && c.plan !== null && !planGuncel(c)} iyilestir={o.yetki.planYaz} tum={c ? <GiderSayfasi c={c} G={v} para={o.yetki.maliyetOku} yaz={yazabilir ? yaz : null} git={o.git} /> : null} />;
}
