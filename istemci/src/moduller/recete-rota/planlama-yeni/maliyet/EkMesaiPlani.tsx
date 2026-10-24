import { useMemo } from 'react';
import { Dugme, SayiKarti, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi, Tezgah } from '../tipler.ts';
import { ekMesaiFormu, kisiFormu } from './formlar.ts';
import {
  baslangicMs, calisilir, ekMesailer, GUN_TURU_ADI, gunYaz, isoGun, sayiOku, mesaiAtamasi, mesaiBedeli, planIsleri, saatYaz, simdiSaati, takvimKur, tl,
  vardiyalar, zamanYaz, YOK, type EkMesai, type MesaiAtamasi, type Takvim,
} from './kurallar.ts';
import { hucreKoy, IsiSayfasi, kdOran, yazici, type Acilim, type FormTanimi, type Hucre, type IsiBos, type IsiSatiri, type IsiSutunu, type IsiVerisi } from './ortak.tsx';

// Plan motoru tarayıcıda yoktur: ek vardiyayı tek tek deneyip gecikme kazancını ölçen öneri, motor bağlanınca açılır (357 b).
export const MOTOR_KAPALI = 'Plan motoru bağlanınca açılır.';
interface Satir { t: Tezgah; mx: number; ek: Record<string, number[]> }

// Şimdiki günden başlayan n günlük sütunlar (isGunSut).
export function gunSutunlari(c: PlanlamaCalismasi, n: number): { g0: number; l: (IsiSutunu & { g: number })[] } {
  const g0 = Math.floor(simdiSaati(c) / 24);
  const l: (IsiSutunu & { g: number })[] = [];
  for (let g = g0; g < g0 + n; g++) { const s = zamanYaz(c.D, g * 24); l.push({ k: `g${String(g)}`, g, ad: s.slice(0, 5), alt: s.slice(6, 9).trim(), bugun: g === g0 }); }
  return { g0, l };
}

// Tezgâh × gün, günün açık saatlerinde dolu yüzde; planlı ek vardiya işaretli (zz30-isi ISI.mesaiplan).
export function mesaiIsisi(c: PlanlamaCalismasi, T: Takvim): IsiVerisi<Satir> | IsiBos {
  if (!c.plan || baslangicMs(c.D) === null) return { bos: 'Plan kurulunca tezgâhların günlük doluluğu burada görünür.' };
  const now = simdiSaati(c);
  const G = gunSutunlari(c, 14);
  const ops = planIsleri(c).filter((r) => !r.fas && Number.isFinite(r.S) && Number.isFinite(r.C));
  const EK = ekMesailer(c);
  const satirlar: IsiSatiri<Satir>[] = c.D.tezgahlar.map((t) => {
    const M = T.M[t.id];
    const h: Record<string, Hucre> = {};
    const ekler: Record<string, number[]> = {};
    let mx = 0, ozel = false;
    for (const col of G.l) {
      const a = col.g * 24, b = a + 24;
      const acik = M ? calisilir(M.rw, Math.max(a, now), b) : 0;
      const dolu = M ? ops.filter((r) => r.m === t.id && r.C > a && r.S < b).reduce((s, r) => s + calisilir(M.rw, Math.max(r.S, a, now), Math.min(r.C, b)), 0) : 0;
      const ek = EK.map((e, i) => ({ e, i })).filter((x) => x.e.m === t.id && x.e.gun === col.g);
      if (acik <= 0.05 && !ek.length) { h[col.k] = { etiket: '', kapali: true }; continue; }
      const pct = acik > 0.05 ? Math.min(100, (dolu / acik) * 100) : null;
      if (pct !== null) mx = Math.max(mx, pct);
      if (ek.length) { ozel = true; ekler[col.k] = ek.map((x) => x.i); }
      hucreKoy(h, col.k, {
        v: pct === null ? '' : String(Math.round(pct)), kd: pct === null ? undefined : kdOran(pct, [50, 75, 90, 98]), sm: ek.length ? 'plus' : undefined,
        etiket: `${pct === null ? 'vardiya yok' : `%${String(Math.round(pct))} dolu (${saatYaz(dolu)} / ${saatYaz(acik)})`}${ek.length ? `, ${ek.map((x) => x.e.vardiya).join(', ')} ek vardiya planlı` : ''}`,
      });
    }
    return { k: t.id, ad: t.id, alt: t.ad, simge: 'cpu' as const, ton: mx >= 98 ? 'hata' as const : mx >= 90 ? 'uyari' as const : '' as const, gizli: mx < 75 && !ozel, h, veri: { t, mx, ek: ekler } };
  }).sort((a, b) => b.veri.mx - a.veri.mx);
  const dolu = satirlar.filter((r) => r.veri.mx >= 98);
  const en = satirlar[0];
  let blok: string | null = null;
  if (en) { const gl = G.l.filter((col) => (en.h[col.k]?.kd ?? 0) >= 4); const ilk = gl[0], son = gl[gl.length - 1]; if (ilk && son) blok = `${ilk.ad}${gl.length > 1 ? `–${son.ad}` : ''}`; }
  const metin = `${en && blok ? `En sıcak blok ${en.ad}, ${blok}: tezgâh tam dolu. ` : ''}İki haftada ${String(dolu.length)} tezgâh en az bir gün tam dolu; ${String(EK.length)} ek vardiya planlı. Öneriler plan motoru bağlanınca hesaplanır.`;
  return {
    baslik: 'Tezgâh × gün, doluluk ve ek mesai', satirAd: 'Tezgâh', sutunlar: G.l, satirlar, gizliAd: 'doluluğu %75 altında',
    ust: { ton: dolu.length ? 'uyari' : 'tamam', simge: 'clock', metin },
    lejant: { kdAd: { 1: '%50-75', 2: '%75-90', 3: '%90-98', 4: 'Tam dolu' }, simge: [['plus', 'Planlı ek vardiya']] },
    not: 'Hücre, günün açık saatlerinde tezgâhın dolu olduğu yüzdedir; boş hücre o gün vardiya olmadığını söyler.',
  };
}

export function EkMesaiPlani(o: PlanlamaEkranOzellikleri) {
  const c = o.calisma;
  const T = useMemo(() => (c && baslangicMs(c.D) !== null ? takvimKur(c) : null), [c]);
  const V = useMemo(() => (c && T ? mesaiIsisi(c, T) : { bos: 'Plan kurulunca tezgâhların günlük doluluğu burada görünür.' }), [c, T]);
  const yaz = yazici(o.komut);
  const yazabilir = o.komut !== null;
  const g0 = c ? Math.floor(simdiSaati(c) / 24) : 0;
  const F = useMemo(() => {
    if (!c || !yazabilir) return null;
    return { ekle: ekMesaiFormu(c, yaz, g0), kisi: o.yetki.maliyetOku ? kisiFormu(c.D, yaz) : null };
  // yaz her çizimde yeniden kurulur; formlar çalışma ve yetkiyle değişir.
  }, [c, yazabilir, g0, o.yetki.maliyetOku]);

  const kaldir = (e: EkMesai, i: number) => {
    yaz('Ek mesai kaldırıldı', `${e.m} ${c ? gunYaz(c.D, e.gun * 24) : ''} ${e.vardiya}`, (t) => {
      // Sıra ekMesailer'in süzdüğü listeyle aynıdır: günü sayı olmayan kayıt atlanır.
      const hedef = t.ekMesai.map((x, j) => ({ x, j })).filter(({ x }) => sayiOku(x.gun) !== null)[i]?.j;
      t.ekMesai = t.ekMesai.filter((_, j) => j !== hedef);
    });
  };

  const acilim = (r: IsiSatiri<Satir>, ck: string): Acilim | null => {
    if (!c) return null;
    const D = c.D;
    const cel = r.h[ck];
    const g = Number(ck.slice(1));
    const gAd = gunYaz(D, g * 24);
    const EK = ekMesailer(c);
    const ekI = r.veri.ek[ck] ?? [];
    const vard = vardiyalar(D).find((v) => !EK.some((e) => e.m === r.k && e.gun === g && e.vardiya === v.id))?.id;
    const sec: NonNullable<Acilim['secenekler']> = [];
    const ilkEk = ekI[0] !== undefined ? EK[ekI[0]] : undefined;
    if (ilkEk && ekI[0] !== undefined && yazabilir) { const i = ekI[0]; sec.push({ ad: `${ilkEk.vardiya} ek vardiyasını kaldır`, etki: 'Ek vardiya takvimden çıkar; plan yeniden kurulunca kullanılmaz.', simge: 'trash', yap: () => { kaldir(ilkEk, i); } }); }
    sec.push({ ad: 'Önerileri hesapla', etki: '', simge: 'play', pasif: MOTOR_KAPALI });
    const kd = cel?.kd ?? 0;
    return {
      baslik: `${r.k} · ${gAd}`, simge: 'clock', ton: kd >= 4 ? 'hata' : kd >= 3 ? 'uyari' : '',
      neden: `${r.k} ${gAd}: ${cel?.etiket || 'vardiya yok'}.${kd >= 3 ? ' Tezgâh dolu; ek vardiya bekleyen işleri öne çeker.' : ''}`,
      formlar: vard && F ? [{ tanim: F.ekle, deg: { m: r.k, gun: isoGun(D, g), vardiya: vard }, adim: 1, etki: `${r.k} ${gAd} günü ek vardiyayla açılır.` }] : [],
      secenekler: sec, kilitli: Boolean(vard) && !yazabilir,
    };
  };

  const formlar = F ? [F.ekle, F.kisi].filter((x): x is FormTanimi => x !== null) : [];
  return (
    <IsiSayfasi
      ad="Ek mesai planı" simge="clock" veri={V} acilim={acilim} formlar={formlar}
      eylemler={[{ anahtar: 'oner', baslik: 'Önerileri hesapla', simge: 'play', sec: () => undefined, pasif: true, pasifNedeni: MOTOR_KAPALI }]}
      tum={c && T ? <TumMesailer c={c} T={T} para={o.yetki.maliyetOku} kaldir={yazabilir ? kaldir : null} /> : null}
    />
  );
}

function TumMesailer({ c, T, para, kaldir }: { c: PlanlamaCalismasi; T: Takvim; para: boolean; kaldir: ((e: EkMesai, i: number) => void) | null }) {
  const D = c.D;
  const A = mesaiAtamasi(c);
  const sat = A.liste.map((a) => ({ a, bedel: mesaiBedeli(c, T, a.e) })).sort((x, y) => x.a.e.gun - y.a.e.gun);
  const ihlal = sat.filter((x) => x.a.ihlal.length).length;
  const bedeller = sat.map((x) => x.bedel);
  const top = bedeller.some((x) => x === null) ? null : bedeller.reduce<number>((s, x) => s + (x ?? 0), 0);
  const sutunlar: Sutun<{ a: MesaiAtamasi; bedel: number | null }>[] = [
    { anahtar: 'tez', baslik: 'Tezgâh', mono: true, hucre: (x) => x.a.tezgah.id },
    { anahtar: 'gun', baslik: 'Gün', hucre: (x) => gunYaz(D, x.a.e.gun * 24) },
    { anahtar: 'tur', baslik: 'Gün türü', hucre: (x) => GUN_TURU_ADI[x.a.tur] },
    { anahtar: 'vardiya', baslik: 'Vardiya', hucre: (x) => x.a.e.vardiya },
    { anahtar: 'saat', baslik: 'Süre', hizala: 'sag', hucre: (x) => saatYaz(x.a.h) },
    { anahtar: 'kisi', baslik: 'Gelecek kişi', hucre: (x) => x.a.kisiler.map((k) => k.ad).join(', ') || YOK },
    ...(para ? [{ anahtar: 'bedel', baslik: 'Bedel', hizala: 'sag' as const, hucre: (x: { bedel: number | null }) => tl(x.bedel) }] : []),
    { anahtar: 'ihlal', baslik: 'Uyarı', hucre: (x) => x.a.ihlal.join('; ') || YOK },
    ...(kaldir ? [{ anahtar: 'sil', baslik: 'İşlem', csv: false as const, hucre: (x: { a: MesaiAtamasi }) => <Dugme simge="trash" aria-label={`${x.a.tezgah.id} ${gunYaz(D, x.a.e.gun * 24)} ${x.a.e.vardiya} ek mesaisini kaldır`} onClick={() => { kaldir(x.a.e, x.a.i); }}>Kaldır</Dugme> }] : []),
  ];
  return (
    <>
      <div className="tc-pyk-kartlar">
        <SayiKarti baslik="Planlı ek vardiya" simge="clock" sayi={sat.length} altMetin={`${saatYaz(sat.reduce((s, x) => s + x.a.h, 0))} toplam`} />
        {para && <SayiKarti baslik="Ek mesai bedeli" simge="lira" metin={tl(top)} altMetin={top === null ? 'kişi ya da mesai ücreti girilmedi' : 'planlı ek vardiyalar'} />}
        <SayiKarti baslik="Sınır uyarısı olan vardiya" simge="alert" sayi={ihlal} altMetin="günlük, gece ve yıllık sınırlar" ton={ihlal ? 'uyari' : 'bilgi'} />
      </div>
      <Tablo etiket="Ek mesailer" sutunlar={sutunlar} satirlar={sat} satirAnahtari={(x) => `${x.a.e.m}-${String(x.a.e.gun)}-${x.a.e.vardiya}-${String(x.a.i)}`} bosMesaj="Planlı ek mesai yok." />
    </>
  );
}
