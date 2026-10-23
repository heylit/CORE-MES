import { EslesmeHatasi, okumaDegeri, yazimDegeri } from './eslesme.ts';
import type { SatirDegeri } from './eslesme.ts';
import { DONEM_ANAHTARLARI } from '#paylasilan/ik-motor/arayuz.ts';
import {
  AYAR_LISTE_ANAHTARLARI, DONEM_ALANLARI, GENEL_AYAR_ALANLARI, GOREV_ALANLARI, KANAL_ALANLARI, PLAN_ALANLARI, PLAN_KADRO_ALANLARI, PRIM_ALANLARI,
  SORU_SETI_ALANLARI, TESVIK_ALANLARI,
} from './sema.ts';
import type { Alan } from './sema.ts';
import type { AyarSatirlari, AyarYazimi } from './sorgular.ts';

/* Uygulamanın ayar nesnesi <-> ayar tabloları (saf). Metin listeleri (tatiller, belgeler, kriterler, vergi dilimleri,
   soru metinleri) satırlara ayrılır; kurarken aynı metin biçimi geri gelir. */

type Nesne = Record<string, unknown>;
const nesneMi = (v: unknown): v is Nesne => v !== null && typeof v === 'object' && !Array.isArray(v);
const satirlar = (v: unknown): string[] => String(v ?? '').split('\n').map((x) => x.trim()).filter(Boolean);

function alanlar(tanim: readonly Alan[], kaynak: Nesne, yol: string): SatirDegeri {
  const bilinen = tanim.map((a) => a.a);
  const fazla = Object.keys(kaynak).filter((k) => !bilinen.includes(k) && kaynak[k] !== undefined);
  if (fazla.length) throw new EslesmeHatasi(`${yol}: tanımsız alan: ${fazla.join(', ')}.`, `${yol}.${fazla[0]}`);
  const s: SatirDegeri = {};
  for (const a of tanim) {
    const v = yazimDegeri(a, kaynak[a.a], `${yol}.${a.a}`);
    if (a.zorunlu && v === null) throw new EslesmeHatasi(`${yol}.${a.a}: boş olamaz.`, `${yol}.${a.a}`);
    s[a.s] = v;
  }
  return s;
}
function geri(tanim: readonly Alan[], s: SatirDegeri): Nesne {
  const o: Nesne = {};
  for (const a of tanim) { const v = okumaDegeri(a, s[a.s]); if (v !== undefined) o[a.a] = v; }
  return o;
}
const dizi = (v: unknown, yol: string): Nesne[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new EslesmeHatasi(`${yol}: liste bekleniyor.`, yol);
  return v.map((x, i) => { if (!nesneMi(x)) throw new EslesmeHatasi(`${yol}[${i}]: nesne bekleniyor.`, yol); return x; });
};

// Resmî tatil satırı: "AA-GG ad" (her yıl) ya da "GGGG-AA-GG ad".
const TATIL = /^(?:(\d{4})-)?(\d{2})-(\d{2})(?:\s+(.*))?$/;
// Vergi dilimi satırı: "üst sınır:oran"; son dilim ":oran".
const DILIM = /^(\d+(?:\.\d+)?)?:(\d+(?:\.\d+)?)$/;

export function ayarParcala(g: Nesne): AyarYazimi {
  const bilinen = [...GENEL_AYAR_ALANLARI.map((a) => a.a), ...AYAR_LISTE_ANAHTARLARI, ...DONEM_ANAHTARLARI];
  const fazla = Object.keys(g).filter((k) => !bilinen.includes(k) && g[k] !== undefined);
  if (fazla.length) throw new EslesmeHatasi(`govde: tanımsız ayar: ${fazla.join(', ')} (yeni ayar göç ister).`, `govde.${fazla[0]}`);
  const genel: Nesne = {};
  for (const a of GENEL_AYAR_ALANLARI) if (g[a.a] !== undefined) genel[a.a] = g[a.a];
  const tatiller = satirlar(g['tatiller']).map((x, i) => {
    const m = TATIL.exec(x);
    if (!m) throw new EslesmeHatasi(`govde.tatiller[${i}]: "${x}" AA-GG ya da GGGG-AA-GG ile başlamalı.`, 'govde.tatiller');
    const ay = Number(m[2]); const gun = Number(m[3]);
    if (ay < 1 || ay > 12 || gun < 1 || gun > 31) throw new EslesmeHatasi(`govde.tatiller[${i}]: tarih geçersiz.`, 'govde.tatiller');
    return { yil: m[1] ? Number(m[1]) : null, ay, gun, ad: m[4] ?? '' };
  });
  const kriterler = [
    ...satirlar(g['perfKriterler']).map((ad) => ({ kullanim: 'performans', ad })),
    ...satirlar(g['mulakatKriterler']).map((ad) => ({ kullanim: 'mulakat', ad })),
  ];
  const soruSetleri = dizi(g['soruSetleri'], 'govde.soruSetleri').map((s, i) => {
    const { sorular, ...ust } = s;
    return { satir: alanlar(SORU_SETI_ALANLARI, ust, `govde.soruSetleri[${i}]`), sorular: satirlar(sorular) };
  });
  const kanallar = dizi(g['ilanKanallari'], 'govde.ilanKanallari').map((k, i) => alanlar(KANAL_ALANLARI, k, `govde.ilanKanallari[${i}]`));
  const gorevNesnesi = g['gorevler'];
  if (gorevNesnesi !== undefined && gorevNesnesi !== null && !nesneMi(gorevNesnesi)) throw new EslesmeHatasi('govde.gorevler: nesne bekleniyor.', 'govde.gorevler');
  const gorevler = Object.entries(nesneMi(gorevNesnesi) ? gorevNesnesi : {}).map(([anahtar, v]) => {
    if (!nesneMi(v)) throw new EslesmeHatasi(`govde.gorevler.${anahtar}: nesne bekleniyor.`, 'govde.gorevler');
    return { anahtar, ...alanlar(GOREV_ALANLARI, v, `govde.gorevler.${anahtar}`) };
  });
  let plan: SatirDegeri | null = null;
  let planKadrosu: SatirDegeri[] = [];
  if (g['maliyetPlani'] !== undefined && g['maliyetPlani'] !== null) {
    if (!nesneMi(g['maliyetPlani'])) throw new EslesmeHatasi('govde.maliyetPlani: nesne bekleniyor.', 'govde.maliyetPlani');
    const { ekler, ...ust } = g['maliyetPlani'];
    plan = alanlar(PLAN_ALANLARI, ust, 'govde.maliyetPlani');
    planKadrosu = dizi(ekler, 'govde.maliyetPlani.ekler').map((k, i) => alanlar(PLAN_KADRO_ALANLARI, k, `govde.maliyetPlani.ekler[${i}]`));
  }
  const donemler = g['donemler'] === undefined || g['donemler'] === null ? null : dizi(g['donemler'], 'govde.donemler').map((d, i) => {
    const yol = `govde.donemler[${i}]`;
    const fazlaD = Object.keys(d).filter((k) => !['id', 'ad', 'baslangic', 'not', 'params'].includes(k));
    if (fazlaD.length) throw new EslesmeHatasi(`${yol}: tanımsız alan: ${fazlaD.join(', ')}.`, `${yol}.${fazlaD[0]}`);
    const kod = yazimDegeri({ a: 'id', s: 'kod', t: 'metin' }, d['id'], `${yol}.id`);
    if (kod === null || !/^[A-Za-z0-9_-]{1,80}$/.test(String(kod))) throw new EslesmeHatasi(`${yol}.id: dönem kimliği geçersiz.`, `${yol}.id`);
    const baslangic = yazimDegeri({ a: 'baslangic', s: 'baslangic', t: 'tarih' }, d['baslangic'], `${yol}.baslangic`);
    if (baslangic === null) throw new EslesmeHatasi(`${yol}.baslangic: boş olamaz.`, `${yol}.baslangic`);
    const params = nesneMi(d['params']) ? d['params'] : {};
    const { dilimler, primler, tesvikler, ...tek } = params;
    const satir: SatirDegeri = {
      kod, ad: yazimDegeri({ a: 'ad', s: 'ad', t: 'metin' }, d['ad'], `${yol}.ad`) ?? String(kod), baslangic,
      notu: yazimDegeri({ a: 'not', s: 'notu', t: 'metin' }, d['not'], `${yol}.not`), ...alanlar(DONEM_ALANLARI, tek, `${yol}.params`),
    };
    return {
      satir,
      dilimler: dilimler === undefined ? [] : satirlar(dilimler).map((x, j) => {
        const m = DILIM.exec(x.replace(/\s/g, ''));
        if (!m) throw new EslesmeHatasi(`${yol}.params.dilimler[${j}]: "${x}" sınır:oran biçiminde olmalı.`, `${yol}.params.dilimler`);
        return { ust_sinir: m[1] === undefined ? null : Number(m[1]), oran: Number(m[2]) };
      }),
      primler: dizi(primler, `${yol}.params.primler`).map((p, j) => alanlar(PRIM_ALANLARI, p, `${yol}.params.primler[${j}]`)),
      tesvikler: dizi(tesvikler, `${yol}.params.tesvikler`).map((t, j) => alanlar(TESVIK_ALANLARI, t, `${yol}.params.tesvikler[${j}]`)),
    };
  });
  return {
    genel: alanlar(GENEL_AYAR_ALANLARI, genel, 'govde'), tatiller, belgeler: satirlar(g['belgeler']), kriterler, soruSetleri, kanallar, gorevler, plan, planKadrosu,
    donemler,
  };
}

const iki = (n: number): string => String(n).padStart(2, '0');
const sayiMetni = (v: unknown): string => String(Number(v));

export function ayarKur(a: AyarSatirlari): Nesne | null {
  if (a.genel === null) return null;
  const g: Nesne = geri(GENEL_AYAR_ALANLARI, a.genel);
  g['tatiller'] = a.tatiller.map((t) => `${t['yil'] ? `${String(t['yil'])}-` : ''}${iki(Number(t['ay']))}-${iki(Number(t['gun']))}${t['ad'] ? ` ${String(t['ad'])}` : ''}`).join('\n');
  g['belgeler'] = a.belgeler.join('\n');
  g['perfKriterler'] = a.kriterler.filter((k) => k.kullanim === 'performans').map((k) => k.ad).join('\n');
  g['mulakatKriterler'] = a.kriterler.filter((k) => k.kullanim === 'mulakat').map((k) => k.ad).join('\n');
  g['soruSetleri'] = a.soruSetleri.map((s) => ({ ...geri(SORU_SETI_ALANLARI, s.satir), sorular: s.sorular.join('\n') }));
  g['ilanKanallari'] = a.kanallar.map((k) => geri(KANAL_ALANLARI, k));
  g['gorevler'] = Object.fromEntries(a.gorevler.map((x) => [String(x['anahtar']), geri(GOREV_ALANLARI, x)]));
  if (a.plan) g['maliyetPlani'] = { ...geri(PLAN_ALANLARI, a.plan), ekler: a.planKadrosu.map((k) => geri(PLAN_KADRO_ALANLARI, k)) };
  if (a.donemler.length) {
    g['donemler'] = a.donemler.map((d) => {
      const params: Nesne = geri(DONEM_ALANLARI, d.satir);
      if (d.dilimler.length) params['dilimler'] = d.dilimler.map((x) => `${x['ust_sinir'] === null || x['ust_sinir'] === undefined ? '' : sayiMetni(x['ust_sinir'])}:${sayiMetni(x['oran'])}`).join('\n');
      if (d.primler.length) params['primler'] = d.primler.map((p) => geri(PRIM_ALANLARI, p));
      if (d.tesvikler.length) params['tesvikler'] = d.tesvikler.map((t) => geri(TESVIK_ALANLARI, t));
      return { id: d.satir['kod'], ad: d.satir['ad'], baslangic: d.satir['baslangic'], ...(d.satir['notu'] ? { not: d.satir['notu'] } : {}), params };
    });
  }
  return g;
}
