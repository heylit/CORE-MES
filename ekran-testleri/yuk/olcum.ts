// Ölçüm saf hesaptır: koşu her isteği bir örnek olarak toplar, özet koşu bitince çıkar.

export interface Ornek {
  kalip: string;
  // null: cevap gelmedi (ağ hatası ya da süre aşımı).
  durum: number | null;
  sureMs: number;
}

export interface Ozet {
  kalip: string;
  sayi: number;
  saniyede: number;
  // Ölçülecek örnek yoksa null; sıfır uydurulmaz.
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  enCokMs: number | null;
  istemciHatasi: number;
  sunucuHatasi: number;
  // 503 aynı zamanda sunucu hatasıdır; havuz dolu ya da veritabanına ulaşılamıyor demektir, ayrıca sayılır.
  mesgul: number;
  cevapsiz: number;
}

// En yakın sıra yöntemi: değer her zaman gerçekten ölçülmüş bir örnektir.
export function yuzdelik(sirali: readonly number[], yuzde: number): number | null {
  if (sirali.length === 0) return null;
  const sira = Math.max(1, Math.ceil((yuzde / 100) * sirali.length));
  return sirali[sira - 1] ?? null;
}

function ozetCikar(kalip: string, ornekler: readonly Ornek[], sureSn: number): Ozet {
  const sureler = ornekler.filter((o) => o.durum !== null).map((o) => o.sureMs).sort((a, b) => a - b);
  const say = (kosul: (d: number) => boolean): number => ornekler.filter((o) => o.durum !== null && kosul(o.durum)).length;
  return {
    kalip,
    sayi: ornekler.length,
    saniyede: sureSn > 0 ? Math.round((ornekler.length / sureSn) * 10) / 10 : 0,
    p50Ms: yuzdelik(sureler, 50),
    p95Ms: yuzdelik(sureler, 95),
    p99Ms: yuzdelik(sureler, 99),
    enCokMs: sureler.at(-1) ?? null,
    istemciHatasi: say((d) => d >= 400 && d < 500),
    sunucuHatasi: say((d) => d >= 500),
    mesgul: say((d) => d === 503),
    cevapsiz: ornekler.filter((o) => o.durum === null).length,
  };
}

export interface KosuOzeti { toplam: Ozet; uclar: Ozet[] }

// Uçlar en yavaştan (p95) sıralanır: bakılacak satır üstte olsun.
export function ozetle(ornekler: readonly Ornek[], sureSn: number): KosuOzeti {
  const gruplar = new Map<string, Ornek[]>();
  for (const o of ornekler) {
    const grup = gruplar.get(o.kalip);
    if (grup === undefined) gruplar.set(o.kalip, [o]);
    else grup.push(o);
  }
  const uclar = [...gruplar].map(([kalip, g]) => ozetCikar(kalip, g, sureSn))
    .sort((a, b) => (b.p95Ms ?? -1) - (a.p95Ms ?? -1) || a.kalip.localeCompare(b.kalip));
  return { toplam: ozetCikar('TOPLAM', ornekler, sureSn), uclar };
}

const hucre = (deger: number | null): string => (deger === null ? '-' : String(deger));

export function tabloMetni(ozet: KosuOzeti): string {
  const baslik = ['Uc', 'Sayi', '/sn', 'p50', 'p95', 'p99', 'En cok', '4xx', '5xx', '503', 'Cevapsiz'];
  const satirlar = [...ozet.uclar, ozet.toplam].map((o) => [
    o.kalip, String(o.sayi), String(o.saniyede), hucre(o.p50Ms), hucre(o.p95Ms), hucre(o.p99Ms), hucre(o.enCokMs),
    String(o.istemciHatasi), String(o.sunucuHatasi), String(o.mesgul), String(o.cevapsiz),
  ]);
  const genislik = baslik.map((b, i) => Math.max(b.length, ...satirlar.map((s) => (s[i] ?? '').length)));
  const yaz = (s: readonly string[]): string => s.map((h, i) => (i === 0 ? h.padEnd(genislik[i] ?? 0) : h.padStart(genislik[i] ?? 0))).join('  ');
  return [yaz(baslik), ...satirlar.map(yaz)].join('\n');
}

export interface SunucuOlcusu { an: number; olayDongusuMs: number | null; vtBaglanti: number | null; rssBayt: number | null }

export interface SunucuOzeti { olcumSayisi: number; enCokOlayDongusuMs: number | null; enCokVtBaglanti: number | null; enCokRssBayt: number | null }

const enCok = (degerler: ReadonlyArray<number | null>): number | null => {
  const dolu = degerler.filter((d): d is number => d !== null);
  return dolu.length === 0 ? null : Math.max(...dolu);
};

export function sunucuOzeti(olcumler: readonly SunucuOlcusu[]): SunucuOzeti {
  return {
    olcumSayisi: olcumler.length,
    enCokOlayDongusuMs: enCok(olcumler.map((o) => o.olayDongusuMs)),
    enCokVtBaglanti: enCok(olcumler.map((o) => o.vtBaglanti)),
    enCokRssBayt: enCok(olcumler.map((o) => o.rssBayt)),
  };
}
