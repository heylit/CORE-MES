import { KM_CMM_SATIR_SINIRI } from '#paylasilan/sozlesme/kalite-merkezi-cmm.ts';
import type { KmCmmEsleme, KmCmmPlanSatiri, KmCmmSatiri } from '#paylasilan/sozlesme/kalite-merkezi-cmm.ts';
import { ondalikKarsilastir } from './kurallar.ts';

// CMM sonuç dosyası okuma ve balon eşleme (1439 a). Saf: dosya metni ve balonlar girer, satır kararları çıkar. Biçim CMM yazılımına
// özgü değildir: CSV'de sütunlar eşlenir, QIF 3.0 Results'ta karakteristik ölçümleri okunur.

export const CMM_ILETILER = {
  bosDosya: 'Dosyada okunacak satır yok.',
  cokSatir: `Dosyada en çok ${String(KM_CMM_SATIR_SINIRI)} satır okunur.`,
  sutunYok: 'Eşlenen sütun dosyada yok.',
  xmlBozuk: 'QIF dosyası okunamadı (XML bozuk).',
  xmlTanim: 'QIF dosyasında belge tanımı (DOCTYPE, ENTITY) kabul edilmez.',
  xmlBuyuk: 'QIF dosyası çok derin ya da çok büyük.',
  qifSonucYok: 'QIF dosyasında karakteristik ölçümü yok (Results bölümü).',
  yazilacakYok: 'Yazılacak eşleşmiş satır yok.',
  cokOlcum: 'Bir yüklemede en çok 500 ölçü yazılır.',
  onayDisi: 'Onaylanan satır nominal farkı olan satır değil.',
} as const;
export type CmmIletisi = keyof typeof CMM_ILETILER;

const KESIR = 6;
const TAM = 9;

// Hücre yalnız sayı olarak okunur: ondalık nokta ya da virgül, isteğe bağlı üs ve birim (mm, derece). Değer en çok altı ondalığa
// yuvarlanır (yarım yukarı, sıfırdan uzağa); ölçümün kayıt biçimi budur (kalite-merkezi-studyo olcumGirdisi). Sayı değilse null.
export function ondalikNormal(hucre: string): string | null {
  const s = hucre.trim().replace(/[\s  ]+/g, '').replace(/(mm|°|deg)$/i, '');
  const m = /^([+-])?(\d*)(?:[.,](\d*))?(?:e([+-]?\d{1,3}))?$/i.exec(s);
  if (m === null) return null;
  const tamKisim = m[2] ?? '';
  const kesirKisim = m[3] ?? '';
  if (tamKisim === '' && kesirKisim === '') return null;
  let rakamlar = (tamKisim + kesirKisim).replace(/^0+(?=\d)/, '');
  let kesirBasamagi = kesirKisim.length - Number(m[4] ?? '0');
  if (kesirBasamagi < 0) { rakamlar += '0'.repeat(-kesirBasamagi); kesirBasamagi = 0; }
  let olcekli: bigint;
  if (kesirBasamagi <= KESIR) olcekli = BigInt(rakamlar || '0') * 10n ** BigInt(KESIR - kesirBasamagi);
  else {
    const at = kesirBasamagi - KESIR;
    const tutulan = rakamlar.length > at ? rakamlar.slice(0, rakamlar.length - at) : '0';
    const sonraki = rakamlar.length >= at ? rakamlar[rakamlar.length - at] ?? '0' : '0';
    olcekli = BigInt(tutulan) + (sonraki >= '5' ? 1n : 0n);
  }
  const metin = olcekli.toString().padStart(KESIR + 1, '0');
  const tam = metin.slice(0, -KESIR);
  const kesir = metin.slice(-KESIR).replace(/0+$/, '');
  if (tam.length > TAM) return null;
  const isaret = m[1] === '-' && olcekli !== 0n ? '-' : '';
  return `${isaret}${tam}${kesir ? `.${kesir}` : ''}`;
}

// --- CSV ---

function satirBol(satir: string, ayirici: string): string[] {
  const hucreler: string[] = [];
  let h = '';
  let tirnak = false;
  for (let i = 0; i < satir.length; i++) {
    const c = satir[i]!;
    if (tirnak) {
      if (c === '"' && satir[i + 1] === '"') { h += '"'; i++; } else if (c === '"') tirnak = false; else h += c;
    } else if (c === '"' && h.trim() === '') { tirnak = true; h = ''; } else if (c === ayirici) { hucreler.push(h.trim()); h = ''; } else h += c;
  }
  hucreler.push(h.trim());
  return hucreler;
}

const AYIRICILAR = [';', '\t', ','] as const;

// Ayırıcı ilk 20 dolu satırda en çok satırı aynı (birden çok) sütuna bölen adaydır; eşitlikte ; sonra sekme sonra virgül.
export function csvOku(metin: string): { ayirici: string; satirlar: string[][] } | { ret: CmmIletisi } {
  const satirlar = metin.replace(/^﻿/, '').split(/\r\n|\n|\r/).filter((s) => s.trim() !== '');
  if (satirlar.length === 0) return { ret: 'bosDosya' };
  if (satirlar.length > KM_CMM_SATIR_SINIRI + 1) return { ret: 'cokSatir' };
  const ornek = satirlar.slice(0, 20);
  let enIyi: { ayirici: string; puan: number } = { ayirici: ';', puan: -1 };
  for (const a of AYIRICILAR) {
    const sayilar = ornek.map((s) => satirBol(s, a).length);
    const sik = new Map<number, number>();
    for (const n of sayilar) if (n > 1) sik.set(n, (sik.get(n) ?? 0) + 1);
    const puan = Math.max(0, ...sik.values());
    if (puan > enIyi.puan) enIyi = { ayirici: a, puan };
  }
  return { ayirici: enIyi.ayirici, satirlar: satirlar.map((s) => satirBol(s, enIyi.ayirici)) };
}

// İlk satır, sayı olmayan hücreleri çoğunluktaysa ve ikinci satırda sayı varsa başlıktır.
export function baslikVarMi(satirlar: readonly (readonly string[])[]): boolean {
  const ilk = satirlar[0];
  if (!ilk || satirlar.length < 2) return false;
  const sayi = ilk.filter((h) => ondalikNormal(h) !== null).length;
  return sayi * 2 < ilk.length && (satirlar[1] ?? []).some((h) => ondalikNormal(h) !== null);
}

const KALIP = {
  karakteristik: /balon|karakter|ozellik|özellik|feature|charac|name|label|^ad$|^no$|^id$|kimlik/i,
  olculen: /ölçülen|olculen|measured|actual|gerçek|gercek|^deger$|^değer$|^value$|result|sonuc|sonuç/i,
  nominal: /nominal|^nom|hedef|target/i,
};

// Başlık adından öneri; bulunmazsa sayı olmayan ilk sütun karakteristik, sayı olan ilk iki sütun ölçülen ve nominal sayılmaz:
// eşlemesiz satır yazılmaz, kullanıcı sütunu seçer.
export function eslemeOner(basliklar: readonly string[]): KmCmmEsleme | null {
  const bul = (k: RegExp, harici: readonly number[]) => basliklar.findIndex((b, i) => !harici.includes(i) && k.test(b.trim()));
  const olculen = bul(KALIP.olculen, []);
  const nominal = bul(KALIP.nominal, [olculen]);
  const karakteristik = bul(KALIP.karakteristik, [olculen, nominal]);
  if (olculen < 0 || karakteristik < 0) return null;
  return { karakteristik, olculen, nominal: nominal < 0 ? null : nominal };
}

export interface CmmHamSatir { satir: number; karakteristik: string; olculen: string | null; nominal: string | null }

const kisalt = (s: string) => (s.length > 80 ? `${s.slice(0, 79)}…` : s);

export function csvSatirlari(satirlar: readonly (readonly string[])[], esleme: KmCmmEsleme, baslik: boolean): CmmHamSatir[] | { ret: CmmIletisi } {
  const enGenis = Math.max(...satirlar.map((s) => s.length));
  if ([esleme.karakteristik, esleme.olculen, esleme.nominal ?? 0].some((i) => i >= enGenis)) return { ret: 'sutunYok' };
  const ilk = baslik ? 1 : 0;
  return satirlar.slice(ilk).map((s, i) => ({
    satir: i + ilk + 1,
    karakteristik: kisalt(s[esleme.karakteristik] ?? ''),
    olculen: ondalikNormal(s[esleme.olculen] ?? ''),
    nominal: esleme.nominal === null ? null : ondalikNormal(s[esleme.nominal] ?? ''),
  }));
}

// --- QIF (kısıtlı XML) ---

export interface XmlDugum { ad: string; oz: Record<string, string>; cocuk: XmlDugum[]; metin: string }

const VARLIK: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
function varlikCoz(s: string): string | null {
  let bozuk = false;
  const sonuc = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (_, v: string) => {
    if (v.startsWith('#x') || v.startsWith('#X')) return String.fromCodePoint(Math.min(parseInt(v.slice(2), 16), 0x10ffff));
    if (v.startsWith('#')) return String.fromCodePoint(Math.min(Number(v.slice(1)), 0x10ffff));
    const k = VARLIK[v];
    if (k === undefined) bozuk = true;
    return k ?? '';
  });
  return bozuk ? null : sonuc;
}
const yerelAd = (ad: string) => ad.slice(ad.indexOf(':') + 1);

// Yalnız öğe, öznitelik ve metin okunur. Belge tanımı (DOCTYPE, ENTITY) reddedilir: dış varlık ya da varlık çoğaltma yoktur.
export function xmlOku(metin: string, sinir = { dugum: 300000, derinlik: 64 }): XmlDugum | { ret: CmmIletisi } {
  if (/<!DOCTYPE|<!ENTITY/i.test(metin)) return { ret: 'xmlTanim' };
  const kok: XmlDugum = { ad: '', oz: {}, cocuk: [], metin: '' };
  const yigin: XmlDugum[] = [kok];
  let sayi = 0;
  let i = 0;
  while (i < metin.length) {
    const lt = metin.indexOf('<', i);
    const parca = metin.slice(i, lt < 0 ? metin.length : lt);
    if (parca.trim() !== '') {
      const t = varlikCoz(parca);
      if (t === null) return { ret: 'xmlBozuk' };
      yigin[yigin.length - 1]!.metin += t;
    }
    if (lt < 0) break;
    if (metin.startsWith('<!--', lt)) { const s = metin.indexOf('-->', lt); if (s < 0) return { ret: 'xmlBozuk' }; i = s + 3; continue; }
    if (metin.startsWith('<?', lt)) { const s = metin.indexOf('?>', lt); if (s < 0) return { ret: 'xmlBozuk' }; i = s + 2; continue; }
    if (metin.startsWith('<![CDATA[', lt)) {
      const s = metin.indexOf(']]>', lt);
      if (s < 0) return { ret: 'xmlBozuk' };
      yigin[yigin.length - 1]!.metin += metin.slice(lt + 9, s);
      i = s + 3;
      continue;
    }
    if (metin.startsWith('<!', lt)) return { ret: 'xmlTanim' };
    const gt = metin.indexOf('>', lt);
    if (gt < 0) return { ret: 'xmlBozuk' };
    const ic = metin.slice(lt + 1, gt);
    i = gt + 1;
    if (ic.startsWith('/')) {
      const ad = yerelAd(ic.slice(1).trim());
      const ust = yigin.pop();
      if (ust === undefined || yigin.length === 0 || ust.ad !== ad) return { ret: 'xmlBozuk' };
      continue;
    }
    const kendi = ic.endsWith('/');
    const govde = kendi ? ic.slice(0, -1) : ic;
    const m = /^([^\s/>]+)/.exec(govde);
    if (m === null) return { ret: 'xmlBozuk' };
    const oz: Record<string, string> = {};
    for (const o of govde.slice(m[1]!.length).matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const v = varlikCoz(o[2] ?? o[3] ?? '');
      if (v === null) return { ret: 'xmlBozuk' };
      oz[yerelAd(o[1]!)] = v;
    }
    const d: XmlDugum = { ad: yerelAd(m[1]!), oz, cocuk: [], metin: '' };
    if (++sayi > sinir.dugum) return { ret: 'xmlBuyuk' };
    yigin[yigin.length - 1]!.cocuk.push(d);
    if (!kendi) {
      yigin.push(d);
      if (yigin.length > sinir.derinlik) return { ret: 'xmlBuyuk' };
    }
  }
  if (yigin.length !== 1 || kok.cocuk.length !== 1) return { ret: 'xmlBozuk' };
  return kok.cocuk[0]!;
}

function* gez(d: XmlDugum): Generator<XmlDugum> {
  const yigin = [d];
  while (yigin.length) {
    const x = yigin.pop()!;
    yield x;
    for (let i = x.cocuk.length - 1; i >= 0; i--) yigin.push(x.cocuk[i]!);
  }
}
const cocukMetni = (d: XmlDugum, ad: string): string | null => {
  const c = d.cocuk.find((x) => x.ad === ad);
  return c === undefined ? null : c.metin.trim();
};

// QIF 3.0: karakteristik öğesi (…CharacteristicItem, id) adını ve tasarımcı numarasını (CharacteristicDesignator/Designator: balon no),
// nominaline bağını (CharacteristicNominalId) taşır; nominal (…CharacteristicNominal) hedef değeri (TargetValue); ölçüm
// (…CharacteristicMeasurement) öğe bağını (CharacteristicItemId) ve değeri (Value). Birden çok parça sonucu varsa her ölçüm ayrı satırdır.
export function qifSatirlari(kok: XmlDugum): CmmHamSatir[] | { ret: CmmIletisi } {
  const ogeler = new Map<string, { ad: string; nominalId: string | null }>();
  const nominaller = new Map<string, string | null>();
  const olcumler: { ogeId: string; deger: string | null }[] = [];
  for (const d of gez(kok)) {
    const id = d.oz.id;
    if (d.ad.endsWith('CharacteristicItem') && id !== undefined) {
      const tasarim = d.cocuk.find((x) => x.ad === 'CharacteristicDesignator');
      const ad = (tasarim ? cocukMetni(tasarim, 'Designator') : null) || cocukMetni(d, 'Name') || `#${id}`;
      ogeler.set(id, { ad, nominalId: cocukMetni(d, 'CharacteristicNominalId') });
    } else if (d.ad.endsWith('CharacteristicNominal') && id !== undefined) {
      nominaller.set(id, cocukMetni(d, 'TargetValue'));
    } else if (d.ad.endsWith('CharacteristicMeasurement')) {
      const ogeId = cocukMetni(d, 'CharacteristicItemId');
      if (ogeId !== null) olcumler.push({ ogeId, deger: cocukMetni(d, 'Value') });
    }
  }
  if (olcumler.length === 0) return { ret: 'qifSonucYok' };
  if (olcumler.length > KM_CMM_SATIR_SINIRI) return { ret: 'cokSatir' };
  return olcumler.map((o, i) => {
    const oge = ogeler.get(o.ogeId);
    const nominal = oge?.nominalId ? nominaller.get(oge.nominalId) ?? null : null;
    return {
      satir: i + 1,
      karakteristik: kisalt(oge?.ad ?? `#${o.ogeId}`),
      olculen: o.deger === null ? null : ondalikNormal(o.deger),
      nominal: nominal === null ? null : ondalikNormal(nominal),
    };
  });
}

export function bicimSez(metin: string): 'csv' | 'qif' {
  return metin.replace(/^﻿/, '').trimStart().startsWith('<') ? 'qif' : 'csv';
}

// --- Balon eşleme ---

// Karakteristik adından balon numarası: yalnız sayı; "B12", "#12", "Balon 12", "No 12" gibi önekli; ya da baştaki "12 - …".
// Birden çok farklı aday belirsizdir. Sondaki sayı (CIRCLE_3 gibi özellik adları) balon sayılmaz.
export function balonNoBul(ad: string): number | 'belirsiz' | null {
  const s = ad.trim();
  if (/^\d{1,4}$/.test(s)) return Number(s);
  const onekli = [...s.matchAll(/(?:^|[\s_\-/(])(?:balon|b|#|no\.?)\s*[-_.:]?\s*(\d{1,4})(?=$|[\s_\-/.):])/gi)].map((m) => Number(m[1]));
  const adaylar = new Set(onekli.length ? onekli : [...s.matchAll(/^(\d{1,4})[\s_\-.:)]+\D/g)].map((m) => Number(m[1])));
  if (adaylar.size === 0) return null;
  return adaylar.size === 1 ? [...adaylar][0]! : 'belirsiz';
}

// Balon nominali metindir (Ø10, 10 ±0,05, R2); karşılaştırmada ilk sayı alınır.
export function nominalSayisi(nominal: string): string | null {
  const m = /\d+(?:[.,]\d+)?/.exec(nominal);
  return m === null ? null : ondalikNormal(m[0]);
}

export interface CmmBalon { id: number; no: number; nominal: string; alt: string | null; ust: string | null }

export function satirlariDegerlendir(ham: readonly CmmHamSatir[], balonlar: readonly CmmBalon[]): KmCmmSatiri[] {
  const noIle = new Map(balonlar.map((b) => [b.no, b]));
  const eslesen = ham.map((h) => {
    const no = balonNoBul(h.karakteristik);
    return { h, no, balon: typeof no === 'number' ? noIle.get(no) ?? null : null };
  });
  const sayac = new Map<number, number>();
  for (const e of eslesen) if (e.balon && e.h.olculen !== null) sayac.set(e.balon.id, (sayac.get(e.balon.id) ?? 0) + 1);
  return eslesen.map(({ h, no, balon }) => {
    const uygun = balon && h.olculen !== null && balon.alt !== null && balon.ust !== null
      ? ondalikKarsilastir(balon.alt, h.olculen) <= 0 && ondalikKarsilastir(h.olculen, balon.ust) <= 0 : null;
    const balonNominali = balon ? nominalSayisi(balon.nominal) : null;
    const durum: KmCmmSatiri['durum'] = no === 'belirsiz' ? 'belirsiz'
      : balon === null ? 'eslesmedi'
        : h.olculen === null ? 'degerYok'
          : (sayac.get(balon.id) ?? 0) > 1 ? 'yinelenen'
            : balon.alt === null || balon.ust === null ? 'nitelBalon'
              : h.nominal !== null && balonNominali !== null && ondalikKarsilastir(h.nominal, balonNominali) !== 0 ? 'nominalFarki'
                : 'eslesti';
    return {
      satir: h.satir, karakteristik: h.karakteristik, olculen: h.olculen, dosyaNominali: h.nominal,
      balonId: balon?.id ?? null, balonNo: balon?.no ?? null, balonNominali: balon?.nominal ?? null, alt: balon?.alt ?? null, ust: balon?.ust ?? null,
      uygun, durum,
    };
  });
}

// Yazılacak satırlar: eşleşenler ve satır satır onaylanan nominal farkları. Onaylanan numara nominal farkı olmayan satırı gösteriyorsa
// istek reddedilir (önizleme ile yazma arasında dosya ya da plan değişmiş olabilir).
export function yazilacakSatirlar(satirlar: readonly KmCmmSatiri[], onaylananlar: readonly number[]): KmCmmSatiri[] | { ret: CmmIletisi } {
  const onay = new Set(onaylananlar);
  const farklar = new Set(satirlar.filter((s) => s.durum === 'nominalFarki').map((s) => s.satir));
  if ([...onay].some((n) => !farklar.has(n))) return { ret: 'onayDisi' };
  const yazilacak = satirlar.filter((s) => s.durum === 'eslesti' || (s.durum === 'nominalFarki' && onay.has(s.satir)));
  if (yazilacak.length === 0) return { ret: 'yazilacakYok' };
  if (yazilacak.length > 500) return { ret: 'cokOlcum' };
  return yazilacak;
}

// --- CMM-2 ölçüm planı ---

// Özellik ve en az nokta sayısı balonun türünden ve nominal simgesinden önerilir. Sayılar yaygın uygulamadan başlangıç değeridir
// (atölye ayarı değil); dar toleransta (aralık 0,02 ya da altı) iki katına çıkar. Hizalama ve prob geometri ister, programcıya kalır.
interface OzellikKurali { kalip: RegExp; ozellik: string; uydurma: string | null; nokta: number | null; not?: string }
const MESAFE: OzellikKurali = { kalip: /(?:)/, ozellik: 'Uzunluk / mesafe (iki özellik arası)', uydurma: 'En küçük kareler', nokta: 6 };
const OZELLIKLER: readonly OzellikKurali[] = [
  { kalip: /^M\d|diş|dis\b|thread/i, ozellik: 'Diş', uydurma: null, nokta: null, not: 'CMM ile değil, mastarla ölçülür.' },
  { kalip: /⌖|konum|position/i, ozellik: 'Delik ekseni ve datum çerçevesi', uydurma: 'En küçük kareler', nokta: 8 },
  { kalip: /⌭|silindiriklik|cylindricity/i, ozellik: 'Silindir', uydurma: 'En küçük bölge', nokta: 16 },
  { kalip: /○|dairesellik|yuvarlaklık|roundness|circularity/i, ozellik: 'Çember', uydurma: 'En küçük bölge', nokta: 8 },
  { kalip: /⏥|düzlemsellik|duzlemsellik|flatness/i, ozellik: 'Düzlem', uydurma: 'En küçük bölge', nokta: 9 },
  { kalip: /⊥|∥|∠|diklik|paralellik|açısallık|perpendicular|parallel/i, ozellik: 'Düzlem ya da eksen, datuma göre', uydurma: 'En küçük kareler', nokta: 9 },
  { kalip: /◎|eş ?merkez|concentric|coaxial/i, ozellik: 'İki silindir ekseni', uydurma: 'En küçük kareler', nokta: 16 },
  { kalip: /^\s*[Ø⌀]|çap|cap\b|delik|diameter|bore/i, ozellik: 'Silindir / delik', uydurma: 'En küçük kareler', nokta: 8 },
  { kalip: /^\s*S?R\s*\d|yarıçap|yaricap|radius/i, ozellik: 'Yay', uydurma: 'En küçük kareler', nokta: 5 },
  { kalip: /°|açı\b|aci\b|angle/i, ozellik: 'Açı (iki çizgi ya da düzlem)', uydurma: 'En küçük kareler', nokta: 8 },
];
const DAR_TOLERANS = '0.02';

function aralik(alt: string, ust: string): string | null {
  const a = ondalikNormal(alt);
  const u = ondalikNormal(ust);
  if (a === null || u === null) return null;
  const olcek = (s: string) => { const [t, k = ''] = s.replace('-', '').split('.'); return (s.startsWith('-') ? -1n : 1n) * BigInt(t! + k.padEnd(KESIR, '0')); };
  const fark = olcek(u) - olcek(a);
  return ondalikNormal(`${fark.toString()}e-${String(KESIR)}`);
}

export function planSatiri(b: {
  no: number; tur: string | null; nominal: string; tolerans: string | null; alt: string | null; ust: string | null; kritik: boolean;
}): KmCmmPlanSatiri {
  const metin = `${b.nominal} ${b.tur ?? ''} ${b.tolerans ?? ''}`;
  const o = OZELLIKLER.find((x) => x.kalip.test(metin)) ?? MESAFE;
  const genislik = b.alt !== null && b.ust !== null ? aralik(b.alt, b.ust) : null;
  const dar = genislik !== null && ondalikKarsilastir(genislik, DAR_TOLERANS) <= 0;
  const notlar = [o.not ?? null, dar && o.nokta !== null ? 'Dar tolerans: nokta sayısı iki katı.' : null, b.alt === null || b.ust === null ? 'Sınırsız ölçü: geçer/geçmez.' : null]
    .filter((n): n is string => n !== null);
  return {
    no: b.no, tur: b.tur, nominal: b.nominal, tolerans: b.tolerans, alt: b.alt, ust: b.ust, kritik: b.kritik,
    ozellik: o.ozellik, uydurma: o.uydurma, enAzNokta: o.nokta === null ? null : dar ? o.nokta * 2 : o.nokta, not: notlar.length ? notlar.join(' ') : null,
  };
}
