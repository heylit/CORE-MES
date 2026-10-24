import type { PlanlamaCalismasi, PlanVerisi } from '../tipler.ts';
import {
  fasonTalasId, gunNo, isoGun, kalemTutari, kgFiyatlari, maliyetSistemi, malzemeler, mesaiSistemi, ML_CINS, ML_FORM, MS_ANAHTAR, MS_TUR, norm,
  sayi, sgkKatsayisi, sonrakiKimlik, tl, turAnahtari, UFUK_GUN, vardiyalar, vardiyaSaati, ymAyar, ekMesailer,
  type FasonIsi, type IsTanimi, type MaliyetSistemi, type MesaiSistemi, type TezgahGideri,
} from './kurallar.ts';
import { degisti, metinYaz, sayiAl, type Degerler, type FormTanimi } from './ortak.tsx';

// Görünümlerin adımlı formları: bugünkü sayfanın formlarıyla aynı alan, sınır ve denetim (zz25-sade-maliyet, zz25-sade-plan).
// Kayıt `yaz` ile tek değişiklik olarak çalışmaya gider; yetki görünümde süzülür (para formları finans.maliyet-oku, hepsi plan.yaz, 223 a).

export type Yaz = (ne: string, ayrinti: string, fn: (t: PlanlamaCalismasi) => boolean | void) => boolean;
type Nesne = Record<string, unknown>;
const nesneMi = (v: unknown): v is Nesne => typeof v === 'object' && v !== null && !Array.isArray(v);
const bugunIso = (): string => new Date().toISOString().slice(0, 10);
const DEGISMEDI = 'Hiçbir şey değişmedi.';
const alanAyni = (eski: Record<string, unknown>, d: Degerler, k: readonly string[]): boolean => k.every((a) => !degisti(eski[a], d[a]));

function dYaz(t: PlanlamaCalismasi, alanlar: Nesne): void { t.D = { ...t.D, ...alanlar }; }
// Genel gider ve mesai sisteminin belgedeki bilinmeyen alanları korunur.
function msYaz(t: PlanlamaCalismasi, f: (M: MaliyetSistemi) => void): void {
  const M = maliyetSistemi(t.D);
  f(M);
  dYaz(t, { maliyetSis: { ...(nesneMi(t.D.maliyetSis) ? t.D.maliyetSis : {}), ...M } });
}
function mesYaz(t: PlanlamaCalismasi, f: (M: MesaiSistemi) => void): void {
  const M = mesaiSistemi(t.D);
  f(M);
  dYaz(t, { mesaiSis: { ...(nesneMi(t.D.mesaiSis) ? t.D.mesaiSis : {}), ...M } });
}
const ayarlar = (D: PlanVerisi): Nesne => (nesneMi(D.ayarlar) ? D.ayarlar : {});
const planTL = (D: PlanVerisi): Nesne => (nesneMi(D.planTL) ? D.planTL : {});

// ---------- Maliyetler ----------
export function tezUcretFormu(D: PlanVerisi, yaz: Yaz): FormTanimi {
  const tez = (id: string | undefined) => D.tezgahlar.find((t) => t.id === id);
  return {
    id: 'tezucret', ad: 'Tezgâh saat ücreti', simge: 'cpu', ne: 'Bir tezgâhın bir saatlik doğrudan maliyeti.',
    alanlar: () => [
      { k: 'tez', ad: 'Tezgâh', tur: 'secim', zorunlu: true, secenek: D.tezgahlar.map((t) => ({ deger: t.id, baslik: `${t.id} · ${t.ad ?? ''} · ${t.ucret === null || t.ucret === undefined ? 'ücret yok' : `${sayi(t.ucret, 0)} TL/sa`}` })) },
      { k: 'ucret', ad: 'Saat ücreti (TL/sa)', tur: 'sayi', min: 0, zorunlu: true, ipucu: 'Enerji, bakım, takım ve sarf. Kira ve amortisman genel giderdedir.' },
    ],
    adimlar: [{ ad: 'Hangi tezgâh', ne: 'Ücreti olmayanlar listede "ücret yok" yazar.', k: ['tez'] }, { ad: 'Saat ücreti', ne: 'Şimdiki değer dolu geldi.', k: ['ucret'] }],
    ilk: (): Degerler => { const t = D.tezgahlar.find((z) => z.ucret === null || z.ucret === undefined); return t ? { tez: t.id } : {}; },
    ileri: (d, i) => (i === 0 ? { ...d, ucret: metinYaz(tez(d.tez)?.ucret) } : d),
    kontrol: (d, i) => { if (i !== 1 && i !== -1) return null; const t = tez(d.tez); return t && !degisti(t.ucret, d.ucret) ? DEGISMEDI : null; },
    sonuc: 'bu tezgâhta yapılan işlerin maliyeti yeni ücretle hesaplanır.',
    // Elle yazılan ücret istasyon maliyetini izlemeyi bırakır (girdi.betik ucretIzle, 71 b).
    kaydet: (d) => {
      const t = tez(d.tez); const u = sayiAl(d, 'ucret');
      if (!t || u === null) return false;
      return yaz('Tezgâh saat maliyeti değişti', `${t.id}: ${metinYaz(t.ucret) || '—'} → ${String(u)} TL/sa`, (x) => {
        x.D = { ...x.D, tezgahlar: x.D.tezgahlar.map((z) => (z.id === t.id ? { ...z, ucret: u } : z)) };
      });
    },
    bitti: (d) => `${d.tez ?? ''} saat ücreti ${sayi(sayiAl(d, 'ucret'), 0)} TL/sa oldu`,
  };
}

const cinsSecenek = ML_CINS.map((c) => ({ deger: c, baslik: c }));
const formSecenek = ML_FORM.map((c) => ({ deger: c, baslik: c }));

export function kgYeniFormu(D: PlanVerisi, yaz: Yaz, kim: string): FormTanimi {
  const ml = malzemeler(D);
  return {
    id: 'kgyeni', ad: 'Malzeme kg fiyatı ekle', simge: 'box', ne: 'Bir kalite için kg fiyatı; o kalitedeki bütün malzemeler bunu kullanır.',
    alanlar: () => [
      { k: 'kalite', ad: 'Kalite', tur: 'metin', zorunlu: true, ipucu: 'Malzemenin kalite adı' },
      { k: 'cins', ad: 'Cins', tur: 'secim', zorunlu: true, secenek: cinsSecenek },
      { k: 'form', ad: 'Form', tur: 'secim', secenek: formSecenek, ipucu: 'Seçmezseniz kalitenin bütün formlarına geçer' },
      { k: 'fiyat', ad: 'Fiyat (TL/kg)', tur: 'sayi', min: 0, zorunlu: true },
    ],
    adimlar: [{ ad: 'Hangi malzeme', ne: 'Fiyatı olmayan malzemenin kalitesi önerildi.', k: ['kalite', 'cins', 'form'] }, { ad: 'Kg fiyatı', k: ['fiyat'] }],
    ilk: (): Degerler => { const m = ml.find((z) => z.kaynakFiyat === null && z.kalite); return m ? { kalite: m.kalite, cins: m.cins, form: m.form } : { cins: ML_CINS[0] }; },
    kontrol: (d, i) => {
      if (i === 0 || i === -1) {
        const kal = (d.kalite ?? '').trim();
        if (kal && (kgFiyatlari(D) ?? []).some((r) => norm(r.kalite) === norm(kal) && norm(r.form) === norm(d.form ?? ''))) return 'Bu kalite ve form için fiyat zaten var; Kg fiyatı değiştir formunu kullanın.';
      }
      const f = sayiAl(d, 'fiyat');
      if ((i === 1 || i === -1) && f !== null && !(f > 0)) return 'Kg fiyatı sıfırdan büyük olmalı.';
      return null;
    },
    sonuc: 'fiyat listeye eklenir; bu kalitedeki malzemelerin birim maliyeti hemen hesaplanır.',
    kaydet: (d) => {
      const kal = (d.kalite ?? '').trim(); const fo = d.form ?? ''; const fi = sayiAl(d, 'fiyat');
      if (!kal || fi === null) return false;
      return yaz('Kg fiyatı eklendi', `${kal} ${fo || 'her form'}: ${String(fi)} TL/kg`, (t) => {
        const l = Array.isArray(t.D.kgFiyat) ? (t.D.kgFiyat as unknown[]) : [];
        const n = sonrakiKimlik((kgFiyatlari(t.D) ?? []).map((r) => ({ id: r.id })), 'KG-');
        dYaz(t, { kgFiyat: [...l, { id: n, cins: d.cins ?? '', kalite: kal, form: fo, fiyat: fi, fire: null, tarih: bugunIso(), kim }] });
      });
    },
    bitti: (d) => `${(d.kalite ?? '').trim()} için ${sayi(sayiAl(d, 'fiyat'), 2)} TL/kg eklendi`,
  };
}

export function kgDegisFormu(D: PlanVerisi, yaz: Yaz, kim: string): FormTanimi | null {
  const l = kgFiyatlari(D) ?? [];
  if (!l.length) return null;
  const sat = (id: string | undefined) => l.find((r) => r.id === id);
  return {
    id: 'kgdegis', ad: 'Kg fiyatı ya da fire değiştir', simge: 'edit', ne: 'Tedarikçi fiyatı değiştiğinde.',
    alanlar: () => [
      { k: 'r', ad: 'Fiyat satırı', tur: 'secim', zorunlu: true, secenek: l.map((r) => ({ deger: r.id, baslik: `${r.kalite} · ${r.form || 'her form'} · ${r.fiyat === null ? 'fiyat yok' : `${sayi(r.fiyat, 2)} TL/kg`}` })) },
      { k: 'fiyat', ad: 'Fiyat (TL/kg)', tur: 'sayi', min: 0, zorunlu: true },
      { k: 'fire', ad: 'Fire payı (%)', tur: 'sayi', min: 0, max: 200, ipucu: 'Talaş ve hurda için eklenen pay; boş: yok' },
    ],
    adimlar: [{ ad: 'Hangi fiyat', k: ['r'] }, { ad: 'Yeni değer', ne: 'Şimdiki değerler dolu geldi; yalnız değişeni düzeltin.', k: ['fiyat', 'fire'] }],
    ileri: (d, i) => { const r = sat(d.r); return i === 0 && r ? { ...d, fiyat: metinYaz(r.fiyat), fire: metinYaz(r.fire) } : d; },
    kontrol: (d, i) => { if (i !== 1 && i !== -1) return null; const r = sat(d.r); return r && !degisti(r.fiyat, d.fiyat) && !degisti(r.fire, d.fire) ? DEGISMEDI : null; },
    sonuc: 'bu fiyatı kullanan malzemelerin birim maliyeti yeniden hesaplanır.',
    kaydet: (d) => {
      const r = sat(d.r); if (!r) return false;
      const fi = sayiAl(d, 'fiyat'), fr = sayiAl(d, 'fire');
      return yaz('Kg fiyatı değişti', `${r.kalite} ${r.form || 'her form'}: ${metinYaz(r.fiyat) || '—'} → ${metinYaz(fi) || '—'} TL/kg, fire ${metinYaz(fr) || '—'}`, (t) => {
        const ham = Array.isArray(t.D.kgFiyat) ? (t.D.kgFiyat as unknown[]) : [];
        dYaz(t, { kgFiyat: ham.map((z) => (nesneMi(z) && String(z.id) === r.id ? { ...z, fiyat: fi, fire: fr, tarih: bugunIso(), kim } : z)) });
      });
    },
    bitti: (d) => `${sat(d.r)?.kalite ?? d.r ?? ''} fiyatı güncellendi`,
  };
}

export function iscilikFormu(D: PlanVerisi, yaz: Yaz): FormTanimi {
  const A = ayarlar(D); const Y = ymAyar(D);
  const eski = { ayarciUcret: A.ayarciUcret, operatorUcret: Y.operatorUcret, karHedef: Y.karHedef };
  return {
    id: 'iscilik', ad: 'Ayarcı, operatör ücreti ve hedef kâr', simge: 'user', ne: 'Saat başı işçilik ücretleri ve teklif için kâr oranı.',
    alanlar: () => [
      { k: 'ayarciUcret', ad: 'Ayarcı ücreti (TL/sa)', tur: 'sayi', min: 0, max: 100000, zorunlu: true, ipucu: 'Ayar süresince tezgâh ücretine eklenir' },
      { k: 'operatorUcret', ad: 'Operatör ücreti (TL/sa)', tur: 'sayi', min: 0, ipucu: 'Boş: tezgâh ücretine dahil' },
      { k: 'karHedef', ad: 'Hedef kâr oranı (%)', tur: 'sayi', min: 0, max: 300, zorunlu: true, ipucu: 'Maliyetten fiyat önerirken kullanılır' },
    ],
    adimlar: [{ ad: 'Ücretler', ne: 'Şimdiki değerler dolu geldi.', k: ['ayarciUcret', 'operatorUcret'] }, { ad: 'Hedef kâr', k: ['karHedef'] }],
    ilk: (): Degerler => ({ ayarciUcret: metinYaz(sayiAl({ x: String(A.ayarciUcret ?? '') }, 'x')), operatorUcret: metinYaz(Y.operatorUcret), karHedef: metinYaz(Y.karHedef) }),
    kontrol: (d, i) => (i === -1 && alanAyni(eski, d, ['ayarciUcret', 'operatorUcret', 'karHedef']) ? DEGISMEDI : null),
    sonuc: 'ayar ve işleme maliyeti yeni ücretlerle hesaplanır.',
    kaydet: (d) => {
      const a = sayiAl(d, 'ayarciUcret'), o = sayiAl(d, 'operatorUcret'), k = sayiAl(d, 'karHedef');
      return yaz('Ücret değişti', `Ayarcı ${metinYaz(a)} TL/sa, operatör ${metinYaz(o) || '—'} TL/sa, hedef kâr %${metinYaz(k)}`, (t) => {
        dYaz(t, { ayarlar: { ...ayarlar(t.D), ayarciUcret: a }, planTL: { ...planTL(t.D), operatorUcret: o, karHedef: k } });
      });
    },
    bitti: () => 'İşçilik ücretleri kaydedildi',
  };
}

export function fasonFiyatFormu(D: PlanVerisi, yaz: Yaz): FormTanimi | null {
  const F = D.fasoncular ?? [];
  if (!F.length) return null;
  const tal = fasonTalasId(D);
  const fs = (id: string | undefined) => F.find((f) => f.id === id);
  const fk = (id: string): 'saatFiyat' | 'fiyat' => (id === tal ? 'saatFiyat' : 'fiyat');
  return {
    id: 'fason', ad: 'Fason fiyatı', simge: 'truck', ne: 'Dışarıda yaptırılan işin fiyatı ve taşıması.',
    alanlar: (d) => {
      const t = d.fas === tal && tal !== '';
      return [
        { k: 'fas', ad: 'Fasoncu', tur: 'secim', zorunlu: true, secenek: F.map((f) => { const v = f[fk(f.id)]; return { deger: f.id, baslik: `${f.ad ?? f.id} · ${v === undefined || v === null ? 'fiyat yok' : fk(f.id) === 'saatFiyat' ? `${sayi(Number(v), 0)} TL/sa` : `${sayi(Number(v), 2)} TL/adet`}` }; }) },
        { k: 'fiyat', ad: t ? 'Saat fiyatı (TL/sa)' : 'Fiyat (TL/adet)', tur: 'sayi', min: 0, ipucu: t ? 'Talaşlı fason tezgâh saatiyle fiyatlanır' : undefined },
        { k: 'tasima', ad: 'Taşıma (TL/adet)', tur: 'sayi', min: 0, ipucu: 'Boş: yok' },
      ];
    },
    adimlar: [{ ad: 'Hangi fasoncu', k: ['fas'] }, { ad: 'Fiyat ve taşıma', ne: 'Şimdiki değerler dolu geldi.', k: ['fiyat', 'tasima'] }],
    ileri: (d, i) => { const f = fs(d.fas); return i === 0 && f ? { ...d, fiyat: metinYaz(sayiAl({ x: String(f[fk(f.id)] ?? '') }, 'x')), tasima: metinYaz(sayiAl({ x: String(f.tasima ?? '') }, 'x')) } : d; },
    kontrol: (d, i) => { if (i !== 1 && i !== -1) return null; const f = fs(d.fas); return f && !degisti(f[fk(f.id)], d.fiyat) && !degisti(f.tasima, d.tasima) ? DEGISMEDI : null; },
    sonuc: 'fason önerileri ve maliyet yeni fiyatla hesaplanır.',
    kaydet: (d) => {
      const f = fs(d.fas); if (!f) return false;
      const fi = sayiAl(d, 'fiyat'), ta = sayiAl(d, 'tasima'); const k = fk(f.id);
      return yaz('Fason fiyatı değişti', `${f.ad ?? f.id}: ${metinYaz(fi) || '—'}, taşıma ${metinYaz(ta) || '—'}`, (t) => {
        t.D = { ...t.D, fasoncular: (t.D.fasoncular ?? []).map((z) => {
          if (z.id !== f.id) return z;
          const y: Nesne = { ...z };
          if (fi === null) delete y[k]; else y[k] = fi;
          if (ta === null) delete y.tasima; else y.tasima = ta;
          return y as typeof z;
        }) };
      });
    },
    bitti: (d) => `${fs(d.fas)?.ad ?? d.fas ?? ''} fiyatı güncellendi`,
  };
}

// ---------- Genel gider ----------
const grupSecenek = (D: PlanVerisi) => [{ deger: '*', baslik: 'Bütün atölye' }, ...[...new Set(D.tezgahlar.map((t) => t.grup ?? ''))].filter(Boolean).map((g) => ({ deger: g, baslik: g }))];
const anahtarSecenek = MS_ANAHTAR.map(([k, a]) => ({ deger: k, baslik: a }));
const turSecenek = MS_TUR.map(([k, a]) => ({ deger: k, baslik: a }));
export const amortismanEksik = (D: PlanVerisi): string[] => {
  const M = maliyetSistemi(D);
  return D.tezgahlar.filter((t) => { const x = M.tez[t.id]; return !(x && x.bedel !== null && x.bedel > 0 && x.omur !== null && x.omur > 0); }).map((t) => t.id);
};

export function kalemYeniFormu(D: PlanVerisi, yaz: Yaz): FormTanimi {
  return {
    id: 'kalemyeni', ad: 'Gider kalemi ekle', simge: 'plus', ne: 'Kira, enerji, sigorta gibi aylık bir gider.',
    alanlar: () => [
      { k: 'ad', ad: 'Kalem adı', tur: 'metin', zorunlu: true, ipucu: 'Örnek: Kompresör bakımı' },
      { k: 'tur', ad: 'Tür', tur: 'secim', zorunlu: true, secenek: turSecenek },
      { k: 'aylik', ad: 'Aylık tutar (TL)', tur: 'sayi', min: 0, zorunlu: true },
      { k: 'anahtar', ad: 'Tezgâhlara neye göre paylaşılsın', tur: 'secim', zorunlu: true, secenek: anahtarSecenek, ipucu: 'Türüne göre önerildi; kira alanla, enerji kurulu güçle, su ve yemek kişiyle' },
    ],
    adimlar: [{ ad: 'Ne gideri', k: ['ad', 'tur'] }, { ad: 'Ne kadar', ne: 'Bir aylık tutarı yazın.', k: ['aylik'] }, { ad: 'Nasıl paylaşılsın', k: ['anahtar'] }],
    ilk: (): Degerler => ({ tur: 'diger' }),
    ileri: (d, i) => (i === 0 && !d.anahtar ? { ...d, anahtar: turAnahtari(d.tur ?? '') } : d),
    sonuc: 'kalem eklenir ve tezgâhların saatlik genel gideri yeniden hesaplanır.',
    kaydet: (d) => {
      const a = sayiAl(d, 'aylik'); const ad = (d.ad ?? '').trim();
      if (!ad) return false;
      return yaz('Gider kalemi eklendi', `${ad}: ${tl(a)}`, (t) => {
        msYaz(t, (M) => { M.kalemler = [...M.kalemler, { id: sonrakiKimlik(M.kalemler, 'K'), ad, tur: d.tur ?? 'diger', aylik: a, anahtar: d.anahtar ?? 'saat', kapsam: '' }]; });
      });
    },
    bitti: (d) => `${(d.ad ?? '').trim()} eklendi: ayda ${tl(sayiAl(d, 'aylik'))}`,
  };
}

export function kalemDegisFormu(D: PlanVerisi, yaz: Yaz): FormTanimi | null {
  const M = maliyetSistemi(D); const ms = mesaiSistemi(D);
  if (!M.kalemler.length) return null;
  const kal = (id: string | undefined) => M.kalemler.find((z) => z.id === id);
  const hesap = (id: string | undefined) => { const k = kal(id); return Boolean(k && k.tur === 'personel' && k.aylik === null); };
  return {
    id: 'kalemdegis', ad: 'Gider kalemini değiştir', simge: 'edit', ne: 'Tutar, paylaşım ölçüsü ya da hangi tezgâhlara yazıldığı.',
    alanlar: (d) => [
      { k: 'kal', ad: 'Kalem', tur: 'secim', zorunlu: true, secenek: M.kalemler.map((z) => ({ deger: z.id, baslik: `${z.ad} · ${tl(kalemTutari(z, M, ms))}/ay` })) },
      { k: 'ad', ad: 'Kalem adı', tur: 'metin', zorunlu: true },
      ...(hesap(d.kal) ? [] : [{ k: 'aylik', ad: 'Aylık tutar (TL)', tur: 'sayi' as const, min: 0, ipucu: 'Boş: tutar yok' }]),
      { k: 'anahtar', ad: 'Paylaşım ölçüsü', tur: 'secim', zorunlu: true, secenek: anahtarSecenek },
      { k: 'kapsam', ad: 'Hangi tezgâhlara', tur: 'secim', zorunlu: true, secenek: grupSecenek(D), ipucu: 'Bir grubun kendi gideri yalnız o gruba yazılır' },
    ],
    adimlar: [{ ad: 'Hangi kalem', k: ['kal'] }, { ad: 'Ad ve tutar', ne: 'Dolaylı personel kaleminin tutarı kişilerden hesaplanır.', k: ['ad', 'aylik'] }, { ad: 'Paylaşım', k: ['anahtar', 'kapsam'] }],
    ilk: (): Degerler => ({ kal: M.kalemler[0]?.id ?? '' }),
    ileri: (d, i) => { const k = kal(d.kal); return i === 0 && k ? { ...d, ad: k.ad, aylik: metinYaz(k.aylik), anahtar: k.anahtar, kapsam: k.kapsam || '*' } : d; },
    kontrol: (d, i) => {
      if (i !== -1) return null;
      const k = kal(d.kal); if (!k) return null;
      const kap = d.kapsam === '*' ? '' : d.kapsam ?? '';
      return k.ad === (d.ad ?? '').trim() && (hesap(d.kal) || !degisti(k.aylik, d.aylik)) && k.anahtar === d.anahtar && k.kapsam === kap ? DEGISMEDI : null;
    },
    sonuc: 'tezgâhların saatlik genel gideri yeniden hesaplanır.',
    kaydet: (d) => {
      const k = kal(d.kal); if (!k) return false;
      const ad = (d.ad ?? '').trim() || k.ad; const kap = d.kapsam === '*' ? '' : d.kapsam ?? ''; const h = hesap(d.kal); const a = sayiAl(d, 'aylik');
      return yaz('Gider kalemi değişti', `${k.ad}: ${h ? 'kişilerden' : tl(a)}, ${MS_ANAHTAR.find((x) => x[0] === d.anahtar)?.[1] ?? d.anahtar ?? ''}, ${kap || 'bütün atölye'}`, (t) => {
        msYaz(t, (MM) => { MM.kalemler = MM.kalemler.map((z) => (z.id === k.id ? { ...z, ad, aylik: h ? z.aylik : a, anahtar: d.anahtar ?? z.anahtar, kapsam: kap } : z)); });
      });
    },
    bitti: (d) => `${(d.ad ?? '').trim()} güncellendi`,
  };
}

function tezGiderFormu(D: PlanVerisi, yaz: Yaz, s: { id: string; ad: string; simge: 'cpu' | 'gauge'; ne: string; k: (keyof TezgahGideri)[]; adimlar: FormTanimi['adimlar']; ilkTez: string | undefined; ozet: (x: TezgahGideri | undefined) => string; alan: FormTanimi['alanlar']; sonuc: string; bitti: (d: Degerler) => string }): FormTanimi {
  const M = maliyetSistemi(D);
  return {
    id: s.id, ad: s.ad, simge: s.simge, ne: s.ne,
    alanlar: (d) => [
      { k: 'tez', ad: 'Tezgâh', tur: 'secim', zorunlu: true, secenek: D.tezgahlar.map((t) => ({ deger: t.id, baslik: `${t.id} · ${t.ad ?? ''} · ${s.ozet(M.tez[t.id])}` })) },
      ...s.alan(d),
    ],
    adimlar: s.adimlar,
    ilk: (): Degerler => (s.ilkTez ? { tez: s.ilkTez } : {}),
    ileri: (d, i) => { if (i !== 0) return d; const x = M.tez[d.tez ?? '']; return { ...d, ...Object.fromEntries(s.k.map((k) => [k, metinYaz(x?.[k])])) }; },
    kontrol: (d, i) => {
      if (i !== s.adimlar.length - 1 && i !== -1) return null;
      const x = M.tez[d.tez ?? ''];
      return alanAyni((x ?? {}) as unknown as Record<string, unknown>, d, s.k) ? DEGISMEDI : null;
    },
    sonuc: s.sonuc,
    kaydet: (d) => {
      const id = d.tez ?? ''; if (!D.tezgahlar.some((t) => t.id === id)) return false;
      return yaz('Tezgâh maliyet bilgisi', `${id}: ${s.k.map((k) => `${k} ${metinYaz(sayiAl(d, k)) || '—'}`).join(', ')}`, (t) => {
        msYaz(t, (MM) => {
          const x: TezgahGideri = MM.tez[id] ?? { bedel: null, omur: null, hurda: null, kw: null, yuk: null, alan: null, sarf: null, bakim: null };
          MM.tez = { ...MM.tez, [id]: { ...x, ...Object.fromEntries(s.k.map((k) => [k, sayiAl(d, k)])) } };
        });
      });
    },
    bitti: s.bitti,
  };
}

export function amortFormu(D: PlanVerisi, yaz: Yaz, tez?: string): FormTanimi {
  return tezGiderFormu(D, yaz, {
    id: 'amort', ad: 'Tezgâh amortismanı', simge: 'cpu', ne: 'Alış bedeli, kaç yıl kullanılacağı ve hurda değeri.', k: ['bedel', 'omur', 'hurda'],
    adimlar: [{ ad: 'Hangi tezgâh', k: ['tez'] }, { ad: 'Bedel ve ömür', ne: 'Şimdiki değerler dolu geldi.', k: ['bedel', 'omur', 'hurda'] }],
    ilkTez: tez ?? amortismanEksik(D)[0],
    ozet: (x) => (x && x.bedel !== null && x.bedel > 0 && x.omur !== null && x.omur > 0 ? `${tl(x.bedel)}, ${sayi(x.omur, 0)} yıl` : 'bilgi eksik'),
    alan: () => [
      { k: 'bedel', ad: 'Alış bedeli (TL)', tur: 'sayi', min: 0, zorunlu: true },
      { k: 'omur', ad: 'Kullanım ömrü (yıl)', tur: 'sayi', min: 1, max: 50, zorunlu: true },
      { k: 'hurda', ad: 'Hurda değeri (alış bedelinin %)', tur: 'sayi', min: 0, max: 100, ipucu: 'Ömür sonunda satılırsa getireceği' },
    ],
    sonuc: 'tezgâhın aylık amortismanı ve saatlik genel gideri yeniden hesaplanır.',
    bitti: (d) => { const b = sayiAl(d, 'bedel') ?? 0, o = sayiAl(d, 'omur') ?? 0, h = sayiAl(d, 'hurda') ?? 0; return `${d.tez ?? ''} amortismanı ayda ${o > 0 ? tl((b * (1 - h / 100)) / (o * 12)) : '—'}`; },
  });
}

export function tezBilgiFormu(D: PlanVerisi, yaz: Yaz, tez?: string): FormTanimi {
  const M = maliyetSistemi(D);
  return tezGiderFormu(D, yaz, {
    id: 'tezbilgi', ad: 'Tezgâh enerji, alan, takım ve bakım', simge: 'gauge', ne: 'Saat ücreti önerisi ve gider paylaşımı için.', k: ['kw', 'yuk', 'alan', 'sarf', 'bakim'],
    adimlar: [{ ad: 'Hangi tezgâh', k: ['tez'] }, { ad: 'Enerji ve alan', ne: 'Şimdiki değerler dolu geldi.', k: ['kw', 'yuk', 'alan'] }, { ad: 'Saatlik gider', k: ['sarf', 'bakim'] }],
    ilkTez: tez ?? D.tezgahlar.find((t) => !((M.tez[t.id]?.kw ?? 0) > 0))?.id,
    ozet: (x) => (x && x.kw !== null && x.kw > 0 ? `${sayi(x.kw, 1)} kW` : 'güç yok'),
    alan: () => [
      { k: 'kw', ad: 'Kurulu güç (kW)', tur: 'sayi', min: 0 },
      { k: 'yuk', ad: 'Ortalama yük oranı', tur: 'sayi', min: 0, max: 1, ipucu: '0 ile 1 arası; 0,6: gücün %60’ını çeker' },
      { k: 'alan', ad: 'Kapladığı alan (m²)', tur: 'sayi', min: 0 },
      { k: 'sarf', ad: 'Takım ve sarf (TL/sa)', tur: 'sayi', min: 0 },
      { k: 'bakim', ad: 'Bakım (TL/sa)', tur: 'sayi', min: 0 },
    ],
    sonuc: 'enerji gideri, gider paylaşımı ve önerilen saat ücreti yeniden hesaplanır.',
    bitti: (d) => `${d.tez ?? ''} bilgileri kaydedildi`,
  });
}

export function dolayliFormu(D: PlanVerisi, yaz: Yaz): FormTanimi {
  const kat = sgkKatsayisi(mesaiSistemi(D));
  return {
    id: 'dolayli', ad: 'Dolaylı personel ekle', simge: 'user', ne: 'Üretimde doğrudan çalışmayan bir görev (kalite, depo, idari).',
    alanlar: () => [
      { k: 'gorev', ad: 'Görev', tur: 'metin', zorunlu: true, ipucu: 'Örnek: Kalite kontrol' },
      { k: 'brut', ad: 'Brüt aylık ücret (TL)', tur: 'sayi', min: 0, zorunlu: true, ipucu: `İşverene maliyet SGK ve yan haklarla hesaplanır (×${sayi(kat, 3)})` },
    ],
    adimlar: [{ ad: 'Görev ve ücret', k: ['gorev', 'brut'] }],
    kontrol: (d, i) => { const b = sayiAl(d, 'brut'); return (i === 0 || i === -1) && b !== null && !(b > 0) ? 'Brüt ücret sıfırdan büyük olmalı.' : null; },
    sonuc: 'görev dolaylı personel kalemine eklenir.',
    kaydet: (d) => {
      const g = (d.gorev ?? '').trim(); const b = sayiAl(d, 'brut');
      if (!g) return false;
      return yaz('Dolaylı personel eklendi', `${g}: ${tl(b)}`, (t) => { msYaz(t, (M) => { M.dolayli = [...M.dolayli, { id: sonrakiKimlik(M.dolayli, 'G'), gorev: g, brut: b }]; }); });
    },
    bitti: (d) => `${(d.gorev ?? '').trim()} eklendi: işverene ayda ${tl((sayiAl(d, 'brut') ?? 0) * kat)}`,
  };
}

export function genelFormu(D: PlanVerisi, yaz: Yaz): FormTanimi {
  const M = maliyetSistemi(D);
  return {
    id: 'genel', ad: 'Verim ve elektrik fiyatı', simge: 'gear', ne: 'Çalışabilir saatin ne kadarı verimli ve kWh fiyatı.',
    alanlar: () => [
      { k: 'verim', ad: 'Verim (%)', tur: 'sayi', min: 10, max: 100, zorunlu: true, ipucu: 'Açık saatlerin ne kadarı gerçekten üretime gider' },
      { k: 'kwh', ad: 'Elektrik fiyatı (TL/kWh)', tur: 'sayi', min: 0, max: 100, zorunlu: true },
    ],
    adimlar: [{ ad: 'Değerler', ne: 'Şimdiki değerler dolu geldi.', k: ['verim', 'kwh'] }],
    ilk: (): Degerler => ({ verim: metinYaz(M.verim), kwh: metinYaz(M.kwh) }),
    kontrol: (d, i) => ((i === 0 || i === -1) && !degisti(M.verim, d.verim) && !degisti(M.kwh, d.kwh) ? DEGISMEDI : null),
    sonuc: 'kapasite ve enerji gideri yeniden hesaplanır.',
    kaydet: (d) => {
      const v = sayiAl(d, 'verim'), k = sayiAl(d, 'kwh');
      return yaz('Kapasite verimi ve elektrik fiyatı', `%${metinYaz(v)}, ${metinYaz(k)} TL/kWh`, (t) => { msYaz(t, (MM) => { MM.verim = v ?? MM.verim; MM.kwh = k; }); });
    },
    bitti: () => 'Verim ve elektrik fiyatı kaydedildi',
  };
}

// ---------- Ek mesai ----------
export function ekMesaiFormu(c: PlanlamaCalismasi, yaz: Yaz, gun0: number): FormTanimi {
  const D = c.D;
  const V = vardiyalar(D);
  return {
    id: 'ekle', ad: 'Ek mesai ekle', simge: 'plus', ne: 'Bir tezgâha belli bir gün ek vardiya açar.',
    alanlar: () => [
      { k: 'm', ad: 'Tezgâh', tur: 'secim', zorunlu: true, secenek: D.tezgahlar.map((t) => ({ deger: t.id, baslik: `${t.id} · ${t.ad ?? ''}` })) },
      { k: 'gun', ad: 'Gün', tur: 'tarih', zorunlu: true },
      { k: 'vardiya', ad: 'Vardiya', tur: 'secim', zorunlu: true, secenek: V.map((v) => ({ deger: v.id, baslik: `${v.id} · ${v.bas}-${v.bit} (${sayi(vardiyaSaati(D, v.id), 1)} sa)` })) },
    ],
    adimlar: [{ ad: 'Hangi tezgâh', k: ['m'] }, { ad: 'Ne zaman', ne: 'Ek vardiya o gün seçilen vardiyada tezgâhı, bir operatörü ve bir ayarcıyı açar.', k: ['gun', 'vardiya'] }],
    ilk: (): Degerler => ({ gun: isoGun(D, gun0 + 5), vardiya: V[0]?.id ?? '' }),
    kontrol: (d, i) => {
      if (i === 0) return null;
      const g = gunNo(D, d.gun ?? '');
      if (g === null || g < 0 || g >= UFUK_GUN) return 'Gün plan ufku içinde olmalı.';
      return ekMesailer(c).some((e) => e.m === d.m && e.gun === g && e.vardiya === d.vardiya) ? 'Bu ek mesai zaten var.' : null;
    },
    sonuc: 'ek vardiya listeye "Elle girildi" olarak eklenir; plan yeniden kurulunca kullanılır.',
    kaydet: (d) => {
      const g = gunNo(D, d.gun ?? '');
      if (g === null || !d.m || !d.vardiya) return false;
      return yaz('Ek mesai eklendi', `${d.m} ${d.gun ?? ''} ${d.vardiya}`, (t) => { t.ekMesai = [...t.ekMesai, { m: d.m, gun: g, vardiya: d.vardiya }]; });
    },
    bitti: (d) => `${d.m ?? ''} için ${d.gun ?? ''} ${d.vardiya ?? ''} ek vardiyası eklendi`,
  };
}

export function kisiFormu(D: PlanVerisi, yaz: Yaz): FormTanimi | null {
  const P = D.personel ?? [];
  if (!P.length) return null;
  const m = mesaiSistemi(D);
  return {
    id: 'kisi', ad: 'Kişi ücreti ve yapılan mesai', simge: 'user', ne: 'Ek vardiyanın bedeli ve yıllık sınır bunlardan hesaplanır.',
    alanlar: () => [
      { k: 'p', ad: 'Kişi', tur: 'secim', zorunlu: true, secenek: P.map((p) => ({ deger: p.id, baslik: `${p.ad ?? p.id} · ${p.vardiya ?? ''}` })) },
      { k: 'brut', ad: 'Brüt aylık ücret (TL)', tur: 'sayi', min: 0 },
      { k: 'yil', ad: 'Bu yıl yaptığı fazla mesai (sa)', tur: 'sayi', min: 0, max: 2000, ipucu: 'Bordrodan' },
    ],
    adimlar: [{ ad: 'Hangi kişi', k: ['p'] }, { ad: 'Ücret ve mesai', ne: 'Şimdiki değer dolu geldi; yalnız değişeni düzeltin.', k: ['brut', 'yil'] }],
    ileri: (d, i) => { const u = m.ucret[d.p ?? '']; return i === 0 ? { ...d, brut: metinYaz(u?.brut), yil: metinYaz(u?.yil) } : d; },
    kontrol: (d, i) => { if (i === 0) return null; const u = m.ucret[d.p ?? '']; return !degisti(u?.brut, d.brut) && !degisti(u?.yil, d.yil) ? DEGISMEDI : null; },
    sonuc: 'ek vardiyanın bedeli ve kişinin yıllık sınırı yeniden hesaplanır.',
    kaydet: (d) => {
      const id = d.p ?? ''; if (!P.some((p) => p.id === id)) return false;
      const b = sayiAl(d, 'brut'), y = sayiAl(d, 'yil');
      return yaz('Kişi ücreti ve yapılan mesai', `${id}: ${tl(b)}, ${metinYaz(y) || '0'} sa`, (t) => { mesYaz(t, (M) => { M.ucret = { ...M.ucret, [id]: { brut: b, yil: y } }; }); });
    },
    bitti: (d) => `${P.find((p) => p.id === d.p)?.ad ?? d.p ?? ''} kaydedildi`,
  };
}

// ---------- Fason ----------
const tarihGir = (D: PlanVerisi, t: number | null): string => (t === null ? '' : isoGun(D, Math.floor(t / 24)));
export function fasonTerminFormu(c: PlanlamaCalismasi, L: FasonIsi[], yaz: Yaz, gunYaz: (t: number | null) => string, isoSaatYaz: (t: number) => string): FormTanimi | null {
  if (!L.length) return null;
  const D = c.D;
  const bul = (id: string | undefined) => L.find((x) => x.id === id);
  return {
    id: 'termin', ad: 'Fason dönüş termini gir', simge: 'flag', ne: 'Fasoncunun söylediği dönüş günü.',
    alanlar: () => [
      { k: 'is', ad: 'Fasondaki iş', tur: 'secim', zorunlu: true, secenek: L.map((x) => ({ deger: x.id, baslik: `${x.id} · ${x.f?.ad ?? x.r.m} · çıkış ${gunYaz(x.r.S)} · ${x.T === null ? 'termin yok' : `termin ${gunYaz(x.T)}`}` })) },
      { k: 't', ad: 'Dönüş günü', tur: 'tarih', zorunlu: true, ipucu: 'Saat 16:00 sayılır' },
    ],
    adimlar: [{ ad: 'Hangi iş', ne: 'Termini olmayanlar "termin yok" yazar.', k: ['is'] }, { ad: 'Dönüş günü', ne: 'Girilen gün kesin süre sayılır; plan onu kullanır.', k: ['t'] }],
    ilk: (): Degerler => { const x = [...L].filter((z) => z.T === null).sort((a, b) => Number(b.yakin) - Number(a.yakin))[0]; return x ? { is: x.id } : {}; },
    ileri: (d, i) => (i === 0 ? { ...d, t: tarihGir(D, bul(d.is)?.T ?? null) } : d),
    kontrol: (d, i) => { if (i === 0) return null; const z = bul(d.is); return z && z.T !== null && tarihGir(D, z.T) === d.t ? DEGISMEDI : null; },
    sonuc: 'dönüş termini kaydedilir; plan yeniden kurulunca bu günü kullanır.',
    kaydet: (d) => {
      const z = bul(d.is); if (!z || !d.t) return false;
      return yaz('Fason dönüş termini girildi', `${z.id}: ${d.t}`, (t) => {
        const k = nesneMi(t.D.fasonTermin) ? t.D.fasonTermin : {};
        const ref = nesneMi(t.D.fasonRef) ? t.D.fasonRef : {};
        dYaz(t, { fasonTermin: { ...k, [z.id]: `${d.t ?? ''} 16:00` }, ...(ref[z.id] === undefined && Number.isFinite(z.r.C) ? { fasonRef: { ...ref, [z.id]: isoSaatYaz(z.r.C) } } : {}) });
      });
    },
    bitti: (d) => `${d.is ?? ''} dönüş termini ${d.t ?? ''} oldu`,
  };
}

// Fasona verilebilir adımlar: rotada fasonIzin işaretli ya da kararı olan, başlamamış iş (sdFsAdaylar; derlemenin "opt" seçeneği fasonIzin'dir).
export function fasonAdaylari(c: PlanlamaCalismasi, I: Map<string, IsTanimi>, ops: { id: string; S: number; fas: boolean; done: boolean; act: boolean }[]) {
  const k = nesneMi(c.D.fasonKarar) ? c.D.fasonKarar : {};
  return ops.filter((r) => { const o = I.get(r.id); return o && !r.done && !r.act && (k[r.id] !== undefined || o.fasonIzin); })
    .sort((a, b) => a.S - b.S).map((r) => { const v = k[r.id]; return { r, o: I.get(r.id), karar: nesneMi(v) ? String(v.karar) : null }; });
}
export function fasonKararFormu(c: PlanlamaCalismasi, I: Map<string, IsTanimi>, ops: Parameters<typeof fasonAdaylari>[2], yaz: Yaz, kim: string): FormTanimi | null {
  const ad = fasonAdaylari(c, I, ops);
  if (!ad.length) return null;
  const karar = (id: string | undefined) => ad.find((x) => x.r.id === id)?.karar ?? null;
  return {
    id: 'karar', ad: 'Fasona ver ya da içeride yap', simge: 'truck', ne: 'Bir adımın nerede yapılacağına plan yazma yetkisi olan karar verir.',
    alanlar: () => [
      { k: 'is', ad: 'İş', tur: 'secim', zorunlu: true, secenek: ad.map(({ r, o, karar: k }) => ({ deger: r.id, baslik: `${r.id} · ${o?.ad ?? ''} · ${sayi(o?.adet ?? null, 0)} adet · şimdi ${r.fas ? 'fasonda' : 'tezgâhta'}${k ? ` · karar: ${k === 'kabul' ? 'fasonda' : 'içeride'}` : ''}` })) },
      { k: 'karar', ad: 'Karar', tur: 'secim', zorunlu: true, secenek: [{ deger: 'kabul', baslik: 'Fasona ver' }, { deger: 'red', baslik: 'İçeride yap' }, { deger: 'geri', baslik: 'Kararı kaldır, plan seçsin' }] },
    ],
    adimlar: [{ ad: 'Hangi iş', ne: 'Yalnız fasona verilebilir işaretli adımlar listede.', k: ['is'] }, { ad: 'Karar', ne: 'Karar plana kural olarak girer; plan yeniden kurulunca uygulanır.', k: ['karar'] }],
    kontrol: (d, i) => {
      if (i === 0) return null;
      const k = karar(d.is);
      if (d.karar === 'geri' && !k) return 'Bu işte kaldırılacak karar yok.';
      return k && k === d.karar ? 'Karar zaten bu.' : null;
    },
    sonuc: 'karar kaydedilir; plan yeniden kurulunca uygulanır.',
    kaydet: (d) => {
      const id = d.is ?? ''; if (!ad.some((x) => x.r.id === id)) return false;
      const ne = d.karar === 'geri' ? 'Fason kararı kaldırıldı' : d.karar === 'kabul' ? 'Fason kararı: fasona ver' : 'Fason kararı: içeride yap';
      return yaz(ne, id, (t) => {
        const k: Nesne = { ...(nesneMi(t.D.fasonKarar) ? t.D.fasonKarar : {}) };
        if (d.karar === 'geri') delete k[id]; else k[id] = { karar: d.karar === 'kabul' ? 'kabul' : 'red', kim, t: Date.now() };
        dYaz(t, { fasonKarar: k });
      });
    },
    bitti: (d) => `${d.is ?? ''}: ${d.karar === 'kabul' ? 'fasona verilecek' : d.karar === 'red' ? 'içeride yapılacak' : 'kararı plan verecek'}`,
  };
}
