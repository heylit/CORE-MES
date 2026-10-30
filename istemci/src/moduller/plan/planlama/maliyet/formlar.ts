import type { PlanlamaCalismasi, PlanVerisi } from '../tipler.ts';
import {
  fasonTalasId, gunNo, isoGun, kalemTutari, kgFiyatlari, maliyetSistemi, malzemeler, mesaiSistemi, ML_CINS, ML_FORM, MS_ANAHTAR, sayi, tl, UFUK_GUN, vardiyalar, vardiyaSaati, ymAyar, ekMesailer,
  type FasonIsi, type IsTanimi, type TezgahGideri,
} from './kurallar.ts';
import { degisti, metinYaz, sayiAl, type Degerler, type FormTanimi } from './ortak.tsx';
import {
  ayarlar, fasonAlanYaz, fasonFiyatAlani, fasonTerminYaz, kalemYaz, kgAlanYaz, kgEkleYaz,
  kgVarMi, siparisFiyatYaz, maliyetAyariYaz, nesneMi, tezGiderYaz, tezUcretYaz, ucretYaz, type Yaz,
} from './yazmalar.ts';

export type { Yaz } from './yazmalar.ts';

// Görünümlerin adımlı formları: bugünkü sayfanın formlarıyla aynı alan, sınır ve denetim (zz25-sade-maliyet, zz25-sade-plan).
// Kayıt alan başına bir değişiklik olarak çalışmaya gider (zz25 formlarının alan döngüsü; her alanın kendi "Geri al"ı); yetki görünümde süzülür (para formları finans.maliyet-oku, hepsi plan.yaz, 223 a).

const DEGISMEDI = 'Hiçbir şey değişmedi.';
const alanAyni = (eski: Record<string, unknown>, d: Degerler, k: readonly string[]): boolean => k.every((a) => !degisti(eski[a], d[a]));

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
      return tezUcretYaz(yaz, D, t.id, u);
    },
    bitti: (d) => `${d.tez ?? ''} saat ücreti ${sayi(sayiAl(d, 'ucret'), 0)} TL/sa oldu`,
  };
}

const cinsSecenek = ML_CINS.map((c) => ({ deger: c, baslik: c }));
const formSecenek = ML_FORM.map((c) => ({ deger: c, baslik: c }));

// 1280 a: kg fiyatı Satın Alma'da girilir (Satın Alma > kg fiyatları); planda yalnız kalite ve formun fire payı yazılır.
export function kgYeniFormu(D: PlanVerisi, yaz: Yaz, kim: string): FormTanimi {
  const ml = malzemeler(D);
  return {
    id: 'kgyeni', ad: 'Malzeme fire payı ekle', simge: 'box', ne: 'Bir kalite için fire payı; o kalitedeki bütün malzemeler bunu kullanır. Kg fiyatı Satın Alma\'dan gelir.',
    alanlar: () => [
      { k: 'kalite', ad: 'Kalite', tur: 'metin', zorunlu: true, ipucu: 'Malzemenin kalite adı' },
      { k: 'cins', ad: 'Cins', tur: 'secim', zorunlu: true, secenek: cinsSecenek },
      { k: 'form', ad: 'Form', tur: 'secim', secenek: formSecenek, ipucu: 'Seçmezseniz kalitenin bütün formlarına geçer' },
      { k: 'fire', ad: 'Fire payı (%)', tur: 'sayi', min: 0, max: 200, zorunlu: true, ipucu: 'Talaş ve hurda için eklenen pay' },
    ],
    adimlar: [{ ad: 'Hangi malzeme', ne: 'Fire payı olmayan malzemenin kalitesi önerildi.', k: ['kalite', 'cins', 'form'] }, { ad: 'Fire payı', k: ['fire'] }],
    ilk: (): Degerler => { const m = ml.find((z) => z.kalite && !kgVarMi(D, z.kalite, z.form) && !kgVarMi(D, z.kalite, '')); return m ? { kalite: m.kalite, cins: m.cins, form: m.form } : { cins: ML_CINS[0] }; },
    kontrol: (d, i) => {
      if (i === 0 || i === -1) {
        const kal = (d.kalite ?? '').trim();
        if (kal && kgVarMi(D, kal, d.form ?? '')) return 'Bu kalite ve form için fire payı zaten var; Fire payı değiştir formunu kullanın.';
      }
      const f = sayiAl(d, 'fire');
      if ((i === 1 || i === -1) && f !== null && f < 0) return 'Fire payı eksi olamaz.';
      return null;
    },
    sonuc: 'fire payı listeye eklenir; bu kalitedeki malzemelerin ihtiyacı ve maliyeti hemen yeniden hesaplanır.',
    kaydet: (d) => {
      const kal = (d.kalite ?? '').trim(); const fo = d.form ?? ''; const fi = sayiAl(d, 'fire');
      if (!kal || fi === null) return false;
      return kgEkleYaz(yaz, { cins: d.cins ?? '', kalite: kal, form: fo, fire: fi }, kim);
    },
    bitti: (d) => `${(d.kalite ?? '').trim()} için fire payı %${sayi(sayiAl(d, 'fire'), 1)} eklendi`,
  };
}

export function kgDegisFormu(D: PlanVerisi, yaz: Yaz, kim: string): FormTanimi | null {
  const l = kgFiyatlari(D) ?? [];
  if (!l.length) return null;
  const sat = (id: string | undefined) => l.find((r) => r.id === id);
  return {
    id: 'kgdegis', ad: 'Fire payı değiştir', simge: 'edit', ne: 'Talaş ve hurda payı değiştiğinde. Kg fiyatı Satın Alma\'da değişir.',
    alanlar: () => [
      { k: 'r', ad: 'Fire satırı', tur: 'secim', zorunlu: true, secenek: l.map((r) => ({ deger: r.id, baslik: `${r.kalite} · ${r.form || 'her form'} · ${r.fire === null ? 'fire yok' : `%${sayi(r.fire, 1)}`}` })) },
      { k: 'fire', ad: 'Fire payı (%)', tur: 'sayi', min: 0, max: 200, ipucu: 'Talaş ve hurda için eklenen pay; boş: yok' },
    ],
    adimlar: [{ ad: 'Hangi satır', k: ['r'] }, { ad: 'Yeni değer', ne: 'Şimdiki değer dolu geldi.', k: ['fire'] }],
    ileri: (d, i) => { const r = sat(d.r); return i === 0 && r ? { ...d, fire: metinYaz(r.fire) } : d; },
    kontrol: (d, i) => { if (i !== 1 && i !== -1) return null; const r = sat(d.r); return r && !degisti(r.fire, d.fire) ? DEGISMEDI : null; },
    sonuc: 'bu satırı kullanan malzemelerin ihtiyacı ve maliyeti yeniden hesaplanır.',
    kaydet: (d) => { const r = sat(d.r); return r ? kgAlanYaz(yaz, D, r.id, sayiAl(d, 'fire'), kim) : false; },
    bitti: (d) => `${sat(d.r)?.kalite ?? d.r ?? ''} fire payı güncellendi`,
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
      let ok = false;
      const a = sayiAl(d, 'ayarciUcret');
      if (a !== null && degisti(A.ayarciUcret, d.ayarciUcret)) ok = ucretYaz(yaz, D, 'ayarciUcret', a) || ok;
      for (const k of ['operatorUcret', 'karHedef'] as const) if (degisti(Y[k], d[k])) ok = maliyetAyariYaz(yaz, D, k, sayiAl(d, k)) || ok;
      return ok;
    },
    bitti: () => 'İşçilik ücretleri kaydedildi',
  };
}

export function fasonFiyatFormu(D: PlanVerisi, yaz: Yaz): FormTanimi | null {
  const F = D.fasoncular ?? [];
  if (!F.length) return null;
  const tal = fasonTalasId(D);
  const fs = (id: string | undefined) => F.find((f) => f.id === id);
  const fk = (id: string): 'saatFiyat' | 'fiyat' => fasonFiyatAlani(D, id);
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
      let ok = false;
      for (const [k, v] of [[fk(f.id), d.fiyat], ['tasima', d.tasima]] as const) if (degisti(f[k], v)) ok = fasonAlanYaz(yaz, D, f.id, k, sayiAl({ x: v ?? '' }, 'x')) || ok;
      return ok;
    },
    bitti: (d) => `${fs(d.fas)?.ad ?? d.fas ?? ''} fiyatı güncellendi`,
  };
}

// Siparişin tutarı ve ödeme vadesi (zz24-sade ysiparis "fiyat"); maliyet açılımının kâr ve gecikme hücresinden açılır.
export function fiyatFormu(D: PlanVerisi, yaz: Yaz, urunAd: (id: string) => string): FormTanimi | null {
  const L = D.siparisler;
  if (!L.length) return null;
  const sip = (id: string | undefined) => L.find((s) => s.id === id);
  return {
    id: 'fiyat', ad: 'Fiyat ve ödeme vadesi', simge: 'lira', ne: 'Siparişin tutarı ve kaç günde ödeneceği.',
    alanlar: () => [
      { k: 'sip', ad: 'Sipariş', tur: 'secim', zorunlu: true, secenek: L.map((s) => ({ deger: s.id, baslik: `${s.id} · ${urunAd(s.urun)} · ${s.gelir === null || s.gelir === undefined ? 'fiyatsız' : tl(s.gelir)}` })) },
      { k: 'gelir', ad: 'Tutar (TL)', tur: 'sayi', min: 0, zorunlu: true },
      { k: 'vade', ad: 'Ödeme vadesi (gün)', tur: 'sayi', min: 0, max: 365, ipucu: 'Boş: peşin' },
    ],
    adimlar: [{ ad: 'Hangi sipariş', ne: 'Fiyatı olmayanlar listede "fiyatsız" yazar.', k: ['sip'] }, { ad: 'Tutar ve vade', k: ['gelir', 'vade'] }],
    ilk: (): Degerler => { const s = L.find((z) => z.gelir === null || z.gelir === undefined); return s ? { sip: s.id } : {}; },
    ileri: (d, i) => { const s = sip(d.sip); return i === 0 && s ? { ...d, gelir: metinYaz(s.gelir ?? null), vade: metinYaz(sayiAl({ x: String(s.vade ?? '') }, 'x')) } : d; },
    kontrol: (d, i) => { const v = sayiAl(d, 'vade'); return (i === 1 || i === -1) && v !== null && !Number.isInteger(v) ? 'Ödeme vadesi (gün) tam sayı olmalı.' : null; },
    sonuc: 'kâr ve gecikme bedeli bu tutarla yeniden hesaplanır.',
    kaydet: (d) => { const s = sip(d.sip); const g = sayiAl(d, 'gelir'); return s !== undefined && g !== null && siparisFiyatYaz(yaz, D, s.id, g, sayiAl(d, 'vade')); },
    bitti: (d) => `${d.sip ?? ''} fiyatı kaydedildi`,
  };
}

// ---------- Genel gider ----------
const grupSecenek = (D: PlanVerisi) => [{ deger: '*', baslik: 'Bütün atölye' }, ...[...new Set(D.tezgahlar.map((t) => t.grup ?? ''))].filter(Boolean).map((g) => ({ deger: g, baslik: g }))];
const anahtarSecenek = MS_ANAHTAR.map(([k, a]) => ({ deger: k, baslik: a }));
export const amortismanEksik = (D: PlanVerisi): string[] => {
  const M = maliyetSistemi(D);
  return D.tezgahlar.filter((t) => { const x = M.tez[t.id]; return !(x && x.bedel !== null && x.bedel > 0 && x.omur !== null && x.omur > 0); }).map((t) => t.id);
};

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
      const ad = (d.ad ?? '').trim(); const kap = d.kapsam === '*' ? '' : d.kapsam ?? '';
      let ok = false;
      if (ad && ad !== k.ad) ok = kalemYaz(yaz, D, k.id, 'ad', ad) || ok;
      if (!hesap(d.kal) && degisti(k.aylik, d.aylik)) ok = kalemYaz(yaz, D, k.id, 'aylik', sayiAl(d, 'aylik')) || ok;
      if (d.anahtar && d.anahtar !== k.anahtar) ok = kalemYaz(yaz, D, k.id, 'anahtar', d.anahtar) || ok;
      if (kap !== k.kapsam) ok = kalemYaz(yaz, D, k.id, 'kapsam', kap) || ok;
      return ok;
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
      let ok = false;
      for (const k of s.k) if (degisti(M.tez[id]?.[k], d[k])) ok = tezGiderYaz(yaz, D, id, k, sayiAl(d, k)) || ok;
      return ok;
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
      return fasonTerminYaz(yaz, z.id, d.t, Number.isFinite(z.r.C) ? isoSaatYaz(z.r.C) : null);
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
