import { guncellemeEtkisi } from './degisiklikler.ts';
import { adimKimligi, adimPaylari, sureYaz, type KokpitModeli } from './kurallar.ts';

// 3792: "Planda böl > Etkisini gör" bölünmüş planı tahtada taslak olarak gösterir. Önce (taslağın bölmeden önceki modeli) ile sonra (sunucunun
// döndüğü plan) karşılaştırılır; tahta, onay çubuğu ve 360 süzgeci bu sonucu okur. Saf.

type Model = Pick<KokpitModeli, 'isler' | 'emirler' | 'tezgahlar'>;
export interface BolEskiYeri { id: string; m: string; S: number; C: number }
export interface BolOnizlemesi {
  isId: string;
  // Bölmeden gelen payların iş kimlikleri (eski planda yoktur, "yeni" sayılır).
  taslak: ReadonlySet<string>;
  // Bölünen adımın eski yeri (payı varsa her pay); tahtada satırın alt şeridinde çizilir.
  eski: readonly BolEskiYeri[];
  // Bölünen adım dışında kayan işlerin eski yeri (Tahta eskiYer kalıbı: iş yeni yerindedir).
  kayanEski: Record<string, { m: string; S: number; C: number }>;
  kayanSayisi: number;
  // Paylar, eski yer ve kayan işlerin tezgâhları (360 süzgeci).
  tezgahlar: ReadonlySet<string>;
  aralik: { bas: number; son: number };
  cumle: string;
  kisa: string;
}

export const BOL_UYGULA_NOTU = 'Uygula taslağınıza yazar, plan "Canlıya al" ile değişir';
export const BOL_UYGULA_KISA = 'Uygula taslağa yazar; plan Canlıya al ile değişir.';

// Sonuçta adım iki ya da daha çok paylıysa önizleme kurulur; tek parçaya dönen (Bölmeyi kaldır) ya da planda yeri olmayan adımda null.
export function bolOnizlemesiKur(once: Model, sonra: Model, isId: string, zaman: (t: number) => string): BolOnizlemesi | null {
  const paylar = adimPaylari(sonra, isId);
  if (paylar.length < 2) return null;
  const kod = new Map(sonra.tezgahlar.map((t) => [t.id, t.kod])), tz = (id: string): string => kod.get(id) ?? id;
  const eskiPay = adimPaylari(once, isId);
  const eski = eskiPay.map((x): BolEskiYeri => ({ id: x.id, m: x.m, S: x.S, C: x.C }));
  const aralikYaz = (x: { S: number; C: number }): string => `${zaman(x.S).slice(6)}–${zaman(x.C).slice(-5)}`;
  const e = sonra.emirler.find((y) => y.id === paylar[0]!.job), eskiE = once.emirler.find((y) => y.id === e?.id);
  const no = e?.no ?? paylar[0]!.job, ad = paylar[0]!.ad;

  const etki = guncellemeEtkisi(once, sonra);
  const kayan = etki.kayan.filter((k) => { const x = sonra.isler[k.isId]; return x !== undefined && adimKimligi(x) !== isId; });
  const kayanEski: BolOnizlemesi['kayanEski'] = {};
  for (const k of kayan) { const x = once.isler[k.isId]; if (x) kayanEski[k.isId] = { m: x.m, S: x.S, C: x.C }; }

  const tezgahlar = new Set<string>([...paylar.map((x) => x.m), ...eski.map((x) => x.m)]);
  const noktalar: number[] = [...paylar.flatMap((x) => [x.S, x.C]), ...eski.flatMap((x) => [x.S, x.C])];
  for (const k of kayan) {
    const y = sonra.isler[k.isId]!, x = once.isler[k.isId]!;
    tezgahlar.add(y.m); tezgahlar.add(x.m); noktalar.push(y.S, y.C, x.S, x.C);
  }

  const payYazisi = paylar.map((x) => `${tz(x.m)} ${String(x.pay?.adet ?? '')} adet`);
  const eskiYazisi = eski.length === 0 ? '' : `eski yer: ${eski.map((x) => `${tz(x.m)} ${aralikYaz(x)}`).join(', ')}`;
  const erken = kayan.filter((k) => k.fark < 0).length, gec = kayan.filter((k) => k.fark > 0).length;
  const en = kayan.reduce<(typeof kayan)[number] | null>((a, b) => (a === null || Math.abs(b.fark) > Math.abs(a.fark) ? b : a), null);
  const enAd = en === null ? '' : ` (${sonra.isler[en.isId]?.ad ?? ''} ${en.fark < 0 ? '−' : '+'}${sureYaz(en.fark)})`;
  const kayanYazisi = [erken > 0 ? `${String(erken)} iş erkene çekilir` : '', gec > 0 ? `${String(gec)} iş geç kalır` : ''].filter((x) => x !== '').join(', ');
  const bitis = e?.bitis != null && eskiE?.bitis != null ? `emir bitişi ${zaman(eskiE.bitis).slice(-5)} → ${zaman(e.bitis).slice(-5)}` : e?.bitis != null ? `emir bitişi ${zaman(e.bitis).slice(-5)}` : '';
  const termin = e?.bitis != null && e.termin !== null ? (e.bitis > e.termin + 1e-6 ? 'termini aşar' : 'termine yetişir') : '';
  const sonuc = [kayanYazisi === '' ? '' : `${kayanYazisi}${enAd}`, [bitis, termin].filter((x) => x !== '').join(', ')].filter((x) => x !== '');

  const cumle = [`${no} · ${ad} ${String(paylar.length)} paya bölünür: ${payYazisi.join(', ')}${eskiYazisi === '' ? '' : ` (${eskiYazisi})`}`, ...sonuc, BOL_UYGULA_NOTU].join(' · ');
  const kisa = [`${no} · ${ad}: ${paylar.map((x) => `${tz(x.m)} ${String(x.pay?.adet ?? '')}`).join(' · ')}${eskiYazisi === '' ? '' : ` (${eskiYazisi})`}`, ...sonuc].join(' · ');
  return {
    isId, taslak: new Set(paylar.map((x) => x.id)), eski, kayanEski, kayanSayisi: kayan.length, tezgahlar,
    aralik: { bas: Math.min(...noktalar), son: Math.max(...noktalar) }, cumle, kisa,
  };
}

// Önizleme okları: eski yerden yeni yere kesik ok (bölünen adımın eski yerinden paylara, kayan işin eski yerinden yeni yerine).
// Kutular tahta içi px'tir; hedef yatayda ayrışıksa ok kenar ortasından, üst üste biniyorsa dikey kenardan çıkar. Saf.
export interface OkKutu { x1: number; x2: number; y1: number; y2: number }
const yuvarla = (n: number): string => String(Math.round(n * 10) / 10);
export function bolOkYolu(a: OkKutu, b: OkKutu): { yol: string; uc: string } {
  const ay = (a.y1 + a.y2) / 2, by = (b.y1 + b.y2) / 2;
  let p: [number, number], q: [number, number];
  const ax = (a.x1 + a.x2) / 2;
  // Yatayda ayrışıksa ok eski yerin ortasından çıkar (yan yana duran hayalette boyu görünsün).
  if (b.x1 >= a.x2) { p = [ax, ay]; q = [b.x1, by]; }
  else if (b.x2 <= a.x1) { p = [ax, ay]; q = [b.x2, by]; }
  else {
    const x = (Math.max(a.x1, b.x1) + Math.min(a.x2, b.x2)) / 2;
    if (by >= ay) { p = [x, a.y2]; q = [x, b.y1]; } else { p = [x, a.y1]; q = [x, b.y2]; }
  }
  const dx = q[0] - p[0], dy = q[1] - p[1], uz = Math.hypot(dx, dy), ux = uz < 1 ? 1 : dx / uz, uy = uz < 1 ? 0 : dy / uz;
  const tx = q[0] - ux * 6, ty = q[1] - uy * 6;
  return {
    yol: `M${yuvarla(p[0])},${yuvarla(p[1])} L${yuvarla(tx)},${yuvarla(ty)}`,
    uc: `M${yuvarla(q[0])},${yuvarla(q[1])} L${yuvarla(tx - uy * 3.5)},${yuvarla(ty + ux * 3.5)} L${yuvarla(tx + uy * 3.5)},${yuvarla(ty - ux * 3.5)} z`,
  };
}
