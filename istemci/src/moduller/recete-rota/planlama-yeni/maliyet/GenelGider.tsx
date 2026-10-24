import { useMemo } from 'react';
import { SayiKarti, Tablo, type MenuOgesi } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { amortFormu, amortismanEksik, dolayliFormu, genelFormu, kalemDegisFormu, kalemYeniFormu, tezBilgiFormu } from './formlar.ts';
import {
  anahtarAdi, baslangicMs, genelGiderHesabi, kalemTutari, kisaTl, maliyetSistemi, mesaiSistemi, sayi, sgkKatsayisi, takvimKur, tl, tlSaat, turAdi,
  ymAyar, YOK, type GenelGiderHesabi, type GiderKalemi, type TezgahGiderSatiri,
} from './kurallar.ts';
import { PARA_KILIDI } from './Maliyetler.tsx';
import { hucreKoy, IsiSayfasi, kdOran, yazici, type Acilim, type FormTanimi, type Hucre, type IsiBos, type IsiSatiri, type IsiVerisi } from './ortak.tsx';

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
  const metin = `${enB ? `En sıcak hücre ${enB.ad}, ${enB.g || YOK}: ayda ${tl(enB.x)}. ` : ''}Aylık genel gider ${tl(v.aylik)}, bunun ${tl(v.atil)} tutarı boş tezgâh saatlerine düşüyor${eksA.length ? `; ${String(eksA.length)} tezgâhın amortisman bilgisi eksik` : ''}.`;
  return {
    baslik: 'Gider kalemi × tezgâh grubu, aylık pay', satirAd: 'Gider kalemi', sutunlar, satirlar,
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
  const F = useMemo(() => {
    if (!c || !yazabilir) return null;
    return { kalemYeni: kalemYeniFormu(c.D, yaz), kalemDegis: kalemDegisFormu(c.D, yaz), amort: amortFormu(c.D, yaz), tezbilgi: tezBilgiFormu(c.D, yaz), dolayli: dolayliFormu(c.D, yaz), genel: genelFormu(c.D, yaz) };
  // yaz her çizimde yeniden kurulur; formlar çalışma ve yetkiyle değişir.
  }, [c, yazabilir]);

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
      formlar: F?.kalemDegis ? [{ tanim: F.kalemDegis, deg: { kal: k.id }, etki: 'Tutar ya da dağıtım ölçüsü değişince bütün tezgâhların saat maliyeti yeniden hesaplanır.' }] : [],
      secenekler: sec, kilitli: !yazabilir,
    };
  };

  const M = c ? maliyetSistemi(c.D) : null;
  const eylemler: MenuOgesi[] = yazabilir && M ? [{
    anahtar: 'kip', baslik: M.kip === 'kalem' ? 'Tek orandan hesapla' : 'Kalemlerden hesapla', simge: 'layers',
    sec: () => {
      const yeni = M.kip === 'kalem' ? 'tek' : 'kalem';
      yaz('Genel gider hesabı', yeni === 'kalem' ? 'kalemlerden' : 'tek oran', (t) => { t.D = { ...t.D, maliyetSis: { ...(typeof t.D.maliyetSis === 'object' && t.D.maliyetSis !== null ? t.D.maliyetSis : {}), ...maliyetSistemi(t.D), kip: yeni } }; });
    },
  }] : [];
  const formlar = F ? [F.kalemYeni, F.kalemDegis, F.amort, F.tezbilgi, F.dolayli, F.genel].filter((x): x is FormTanimi => x !== null) : [];
  return <IsiSayfasi ad="Genel gider" simge="layers" veri={V} acilim={acilim} formlar={formlar} eylemler={eylemler} tum={c && v ? <TumGiderler c={c} v={v} /> : null} />;
}

function TumGiderler({ c, v }: { c: PlanlamaCalismasi; v: GenelGiderHesabi }) {
  const D = c.D;
  const M = maliyetSistemi(D); const ms = mesaiSistemi(D);
  const eksA = amortismanEksik(D).length;
  const dol = v.kap ? Math.min(100, (v.mesgul / v.kap) * 100) : null;
  return (
    <>
      <div className="tc-pyk-kartlar">
        <SayiKarti baslik="Aylık genel gider" simge="layers" metin={tl(v.aylik)} altMetin={`${String(M.kalemler.length)} kalem + amortisman ${tl(v.amort)}`} />
        <SayiKarti baslik="Tezgâh saatine düşen" simge="lira" metin={tlSaat(v.ort)} altMetin={M.kip === 'kalem' ? 'ortalama, maliyette kullanılıyor' : `kullanılan tek oran ${tlSaat(ymAyar(D).genelGider)}`} />
        <SayiKarti baslik="Önümüzdeki 30 gün doluluk" simge="gauge" metin={dol === null ? '—' : `%${sayi(dol, 0)}`} altMetin={`${sayi(v.mesgul, 0)} / ${sayi(v.kap, 0)} sa planlı`} />
        <SayiKarti baslik="Boş kapasitenin gideri" simge="alert" metin={tl(v.atil)} altMetin="ürüne yüklenmez, dönem gideri" ton={v.atil > v.aylik * 0.3 ? 'uyari' : 'bilgi'} />
        <SayiKarti baslik="Amortisman bilgisi eksik tezgâh" simge="cpu" sayi={eksA} altMetin={`${String(D.tezgahlar.length)} tezgâhtan`} ton={eksA ? 'uyari' : 'bilgi'} />
      </div>
      <Tablo
        etiket="Tezgâhların genel gideri" satirlar={v.tez} satirAnahtari={(z) => z.tezgah.id} bosMesaj="Tezgâh yok." arac={{ csv: { ad: 'genel-gider' } }}
        sutunlar={[
          { anahtar: 'id', baslik: 'Tezgâh', mono: true, hucre: (z) => z.tezgah.id },
          { anahtar: 'grup', baslik: 'Grup', hucre: (z) => z.tezgah.grup ?? YOK },
          { anahtar: 'kap', baslik: 'Pratik kapasite', hizala: 'sag', hucre: (z) => `${sayi(z.kap, 0)} sa` },
          { anahtar: 'amort', baslik: 'Amortisman', hizala: 'sag', hucre: (z) => tl(z.amort) },
          { anahtar: 'pay', baslik: 'Gider payı', hizala: 'sag', hucre: (z) => tl(z.pay) },
          { anahtar: 'aylik', baslik: 'Aylık', hizala: 'sag', hucre: (z) => tl(z.aylik) },
          { anahtar: 'oran', baslik: 'Saatlik genel gider', hizala: 'sag', hucre: (z) => tlSaat(z.oran) },
          { anahtar: 'mesgul', baslik: 'Planlı', hizala: 'sag', hucre: (z) => `${sayi(z.mesgul, 0)} sa` },
          { anahtar: 'atil', baslik: 'Boş kapasite gideri', hizala: 'sag', hucre: (z) => tl(z.atil) },
          { anahtar: 'dog', baslik: 'Hesaplanan saat ücreti', hizala: 'sag', hucre: (z) => (z.dog.operator === null && !z.dogTop ? YOK : tlSaat(z.dogTop)) },
          { anahtar: 'ucret', baslik: 'Kullanılan saat ücreti', hizala: 'sag', hucre: (z) => tlSaat(z.tezgah.ucret ?? null) },
        ]}
      />
      <Tablo
        etiket="Gider kalemleri" satirlar={M.kalemler} satirAnahtari={(k) => k.id} bosMesaj="Gider kalemi girilmedi."
        sutunlar={[
          { anahtar: 'ad', baslik: 'Kalem', hucre: (k) => k.ad },
          { anahtar: 'tur', baslik: 'Tür', hucre: (k) => turAdi(k.tur) },
          { anahtar: 'aylik', baslik: 'Aylık', hizala: 'sag', hucre: (k) => tl(kalemTutari(k, M, ms)) },
          { anahtar: 'anahtar', baslik: 'Dağıtım ölçüsü', hucre: (k) => anahtarAdi(k.anahtar) },
          { anahtar: 'kapsam', baslik: 'Kapsam', hucre: (k) => k.kapsam || 'bütün atölye' },
        ]}
      />
      <Tablo
        etiket="Dolaylı personel" satirlar={M.dolayli} satirAnahtari={(g) => g.id} bosMesaj="Dolaylı personel girilmedi."
        sutunlar={[
          { anahtar: 'gorev', baslik: 'Görev', hucre: (g) => g.gorev },
          { anahtar: 'brut', baslik: 'Brüt aylık', hizala: 'sag', hucre: (g) => tl(g.brut) },
          { anahtar: 'isveren', baslik: 'İşverene maliyet', hizala: 'sag', hucre: (g) => tl(g.brut === null ? null : g.brut * sgkKatsayisi(ms)) },
        ]}
      />
    </>
  );
}
