import { useMemo } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { planGuncel } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi, Tezgah } from '../tipler.ts';
import { MesaiSayfasi } from './asil/MesaiSayfasi.tsx';
import { MOTOR_KAPALI } from './asil/girdi.tsx';
import { ekMesaiFormu } from './formlar.ts';
import { ekMesaiKaldirYaz } from './yazmalar.ts';
import {
  baslangicMs, calisilir, ekMesailer, gunYaz, isoGun, planIsleri, saatYaz, simdiSaati, takvimKur, vardiyalar, zamanYaz, type Takvim,
} from './kurallar.ts';
import { hucreKoy, IsiSayfasi, kdOran, yazici, type Acilim, type Hucre, type IsiBos, type IsiSatiri, type IsiSutunu, type IsiVerisi } from './ortak.tsx';

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
    genis: 'gun', baslik: 'Tezgâh × gün, doluluk ve ek mesai', satirAd: 'Tezgâh', sutunlar: G.l, satirlar, gizliAd: 'doluluğu %75 altında',
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
  const ekleFormu = useMemo(() => (c && yazabilir ? ekMesaiFormu(c, yaz, g0) : null),
  // yaz her çizimde yeniden kurulur; form çalışma ve yetkiyle değişir.
  [c, yazabilir, g0]);

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
    const i = ekI[0];
    const ilkEk = i !== undefined ? EK[i] : undefined;
    if (ilkEk && i !== undefined && yazabilir) {
      sec.push({ ad: `${ilkEk.vardiya} ek vardiyasını kaldır`, etki: 'Ek vardiya takvimden çıkar; plan yeniden kurulunca kullanılmaz.', simge: 'trash', yap: () => { ekMesaiKaldirYaz(yaz, i, `${ilkEk.m} ${gAd} ${ilkEk.vardiya}`); } });
    }
    sec.push({ ad: 'Önerileri hesapla', etki: '', simge: 'play', pasif: MOTOR_KAPALI });
    const kd = cel?.kd ?? 0;
    return {
      baslik: `${r.k} · ${gAd}`, simge: 'clock', ton: kd >= 4 ? 'hata' : kd >= 3 ? 'uyari' : '',
      neden: `${r.k} ${gAd}: ${cel?.etiket || 'vardiya yok'}.${kd >= 3 ? ' Tezgâh dolu; ek vardiya bekleyen işleri öne çeker.' : ''}`,
      formlar: vard && ekleFormu ? [{ tanim: ekleFormu, deg: { m: r.k, gun: isoGun(D, g), vardiya: vard }, adim: 1, etki: `${r.k} ${gAd} günü ek vardiyayla açılır.` }] : [],
      secenekler: sec, kilitli: Boolean(vard) && !yazabilir,
    };
  };

  return (
    <IsiSayfasi
      ad="Ek mesai planı" simge="clock" veri={V} acilim={acilim} planEski={c !== null && c.plan !== null && !planGuncel(c)} iyilestir={o.yetki.planYaz}
      ustEylem={yazabilir ? <Dugme simge="play" disabled title={MOTOR_KAPALI}>Önerileri hesapla</Dugme> : null}
      tum={c ? <MesaiSayfasi c={c} T={T} para={o.yetki.maliyetOku} yaz={yazabilir ? yaz : null} /> : null}
    />
  );
}
