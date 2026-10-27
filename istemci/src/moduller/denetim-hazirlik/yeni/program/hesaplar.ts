import { OZF, seviyeAdi } from '../icerik/programlar.ts';
import { siradakiDenetim, kalanGun, onerilenAsama } from '../kurallar/denetim-takvimi.ts';
import { WKT, haftalariKur } from '../kurallar/hafta.ts';
import { kalibrasyonIstatistigi } from '../kurallar/kalibrasyon.ts';
import { kysIstatistigi } from '../kurallar/kys.ts';
import { ozNotu, ozSonrakiVade, turPuani } from '../kurallar/oz.ts';
import { aktifSorular, grupYuzdesi, kapananlar, type KuralBaglami, type PuanSonucu } from '../kurallar/puan.ts';
import { gunEkle, gunFarki, isoTarih, tarihMetni, tariheGore } from '../tarih.ts';
import type { Cevap, Cihaz, GorunumKodu, Soru } from '../tipler.ts';

// P1 ekranlarının saf hesapları (prototip quickRound, simList, vDash adımları, reportText, rubricQ). Kayda yazmaz; çağıran
// sonucu `degistir` içinde uygular.

export const HIZLI_TUR_SORU_SAYISI = 10;

// Simülasyonda gezilen liste: hızlı turda turun soruları, değilse programın etkin soruları.
export function simListesi(kb: KuralBaglami, kip: string): Soru[] {
  const hepsi = aktifSorular(kb.pg, kb.calisma.def);
  if (kip !== 'quick' || kb.calisma.quick.length === 0) return hepsi;
  const soruyla = new Map(kb.pg.Q.map((q) => [q.id, q]));
  return kb.calisma.quick.map((id) => soruyla.get(id)).filter((q): q is Soru => !!q);
}

// Hızlı tur: kritik sorular öne çıkacak biçimde ağırlıklı rastgele 10 soru, program sırasıyla.
export function hizliTurSec(kb: KuralBaglami, rastgele: () => number = Math.random): string[] {
  const qs = aktifSorular(kb.pg, kb.calisma.def);
  const havuz = qs.map((x) => ({ x, k: Math.pow(rastgele(), 1 / (x.w * x.w)) }));
  havuz.sort((a, b) => b.k - a.k);
  const secilen = havuz.slice(0, HIZLI_TUR_SORU_SAYISI).map((p) => p.x);
  secilen.sort((a, b) => qs.indexOf(a) - qs.indexOf(b));
  return secilen.map((x) => x.id);
}

export type Ton = 'iyi' | 'uyari' | 'kotu' | 'bilgi' | 'soluk';

// Puan rengi (prototip pctColor): 85 ve üstü iyi, 70 ve üstü uyarı, altı kötü.
export const puanTonu = (p: number | null): Ton => (p == null ? 'soluk' : p >= 85 ? 'iyi' : p >= 70 ? 'uyari' : 'kotu');
// Not rengi (prototip gradeCol).
export const notTonu = (g: string): Ton => (g === 'A' ? 'iyi' : g === 'B' ? 'bilgi' : g === 'C' ? 'uyari' : g === 'D' ? 'kotu' : 'soluk');
export const kararTonu = (k: 'ok' | 'warn' | 'bad' | undefined): Ton => (k === 'ok' ? 'iyi' : k === 'warn' ? 'uyari' : k === 'bad' ? 'kotu' : 'soluk');

// Puanın gösterimi: EYDEP puan, öbürleri yüzde.
export const puanYazisi = (kb: Pick<KuralBaglami, 'program'>, pct: number | null): string =>
  pct == null ? '–' : kb.program === 'eydep' ? String(pct) : `%${String(pct)}`;

// Sıradaki denetim satırı (prototip auditLine).
export function denetimSatiri(kb: KuralBaglami): string {
  const na = siradakiDenetim(kb.profil, kb.program);
  if (!na) return 'Denetim tarihi girilmedi';
  const d = gunFarki(na.date);
  return `${na.type || 'Denetim'} · ${tarihMetni(na.date)} · ${d > 0 ? `${String(d)} gün kaldı` : d === 0 ? 'bugün' : 'tarih geçti'}`;
}

export interface Adim {
  t: string;
  s: string;
  ic: string;
  go: GorunumKodu;
  risk: boolean;
  // Hazırlık dönemine gidilecekse dönem sırası.
  ph?: number;
}

// Genel bakışın "Sıradaki adımlar" listesi (prototip vDash steps): en çok 5.
export function siradakiAdimlar(kb: KuralBaglami, cihazlar: readonly Cihaz[], r: PuanSonucu): Adim[] {
  const adimlar: Adim[] = [];
  const w = kb.calisma;
  const o = w.oz;
  const vade = ozSonrakiVade(o);
  const kys = kysIstatistigi(kb.profil, kb.program);
  const kal = kalibrasyonIstatistigi(cihazlar);
  const dm = kapananlar(kb);
  if (kal.gec) adimlar.push({ t: `Kalibrasyon: ${String(kal.gec)} cihaz gecikmiş veya kaydı yok`, s: 'Bu cihazlarla yapılan ölçümler geçerli sayılmaz', ic: 'ruler', go: 'kalib', risk: true });
  else if (kal.yak) adimlar.push({ t: `Kalibrasyon: ${String(kal.yak)} cihazın süresi 30 gün içinde doluyor`, s: 'Laboratuvar randevusunu planlayın', ic: 'ruler', go: 'kalib', risk: false });
  if (kys.late) adimlar.push({ t: `KYS: ${String(kys.late)} yapı taşının gözden geçirmesi gecikti`, s: 'Kalite yönetim sistemi · yapı taşları', ic: 'layers', go: 'kys', risk: true });
  if (o.cur) adimlar.push({ t: 'Açık öz değerlendirme turunu tamamlayın', s: `${tarihMetni(o.cur.date)} · ${String(o.cur.qids.length)} soru`, ic: 'repeat', go: 'kontrol', risk: false });
  else if (vade && gunFarki(vade) <= 3) {
    const f = gunFarki(vade);
    adimlar.push({ t: 'Öz değerlendirme turu zamanı', s: f < 0 ? `${String(-f)} gün gecikti` : f === 0 ? 'Bugün' : `${String(f)} gün kaldı`, ic: 'repeat', go: 'kontrol', risk: f < 0 });
  }
  const sonGun = kb.profil.audits
    .filter((a) => a.kind === 'deadline' && a.prog === kb.program && a.status === 'plan' && gunFarki(a.date) >= 0 && gunFarki(a.date) <= 30)
    .sort(tariheGore)[0];
  if (sonGun) {
    const n = gunFarki(sonGun.date);
    adimlar.push({ t: sonGun.type, s: `${tarihMetni(sonGun.date)} · ${n ? `${String(n)} gün kaldı` : 'bugün'}`, ic: 'flag', go: 'takvim', risk: true });
  }
  const plan = haftalariKur(kb);
  const buHafta = plan?.weeks.find((x) => x.cur);
  const rp = onerilenAsama(kalanGun(kb.profil, kb.program), kb.pg);
  const ph = buHafta ? -1 : rp >= 0 ? rp : kb.pg.PREP.findIndex((p) => p.items.some((i) => !w.checks[i[0]]));
  if (ph >= 0) {
    kb.pg.PREP.slice(0, ph + 1).forEach((p, pi) => {
      for (const it of p.items) {
        if (!w.checks[it[0]] && adimlar.length < 3) adimlar.push({ t: it[1], s: `${p.t} ${p.s}${pi < ph ? ' · gecikmiş' : ''}`, ic: 'calcheck', go: 'hazirlik', risk: false, ph: pi });
      }
    });
  }
  for (const x of r.risks.filter((y) => !dm[y.q.id]).slice(0, 3)) {
    adimlar.push({ t: x.q.fix, s: `${x.q.c} · ${seviyeAdi(kb.pg, x.lvl)}`, ic: 'alert', go: 'rapor', risk: true });
  }
  return adimlar.slice(0, 5);
}

// Panoya kopyalanan hazırlık raporu (prototip reportText). Not alanı örnek kipinde yazılmaz.
export function raporMetni(kb: KuralBaglami, r: PuanSonucu, bugun: Date = new Date()): string {
  const P = kb.profil.profile;
  const pg = kb.pg;
  const w = kb.calisma;
  const dm = kapananlar(kb);
  const na = siradakiDenetim(kb.profil, kb.program);
  const L: string[] = [`${pg.n.toLocaleUpperCase('tr')} HAZIRLIK ÖN DEĞERLENDİRMESİ`, `Rapor tarihi: ${bugun.toLocaleDateString('tr-TR')}`];
  const alanlar: [string, string | undefined][] = [
    ['Firma', P.firma], ['Tesis', P.tesis], ['KYS kapsamı', P.kapsam], ['Belgelendirme kuruluşu', P.kurulus], ['Denetim türü', na?.type],
    ['Denetim tarihi', na ? tarihMetni(na.date) : ''], ['Hazırlayan', P.hazirlayan],
  ];
  for (const [ad, deger] of alanlar) if (deger) L.push(`${ad}: ${deger}`);
  if (w.example) L.push('NOT: Örnek (hayali) veriler');
  L.push('');
  const lv = (l: string) => seviyeAdi(pg, l);
  L.push(
    `${pg.s} puanı: %${String(r.pct)} · ${r.verdict?.t ?? ''}`,
    `Cevaplanan: ${String(r.answered)}/${String(r.total)} (N/A: ${String(r.na)})`,
    `${lv('major')}: ${String(r.major)} · ${lv('minor')}: ${String(r.minor)} · ${lv('obs')}: ${String(r.obs)}`,
  );
  if (r.defPct != null) L.push(`AS9100 / AQAP 2110 ek şartları: %${String(r.defPct)} (ISO puanına dahil değil)`);
  const turlar = w.oz.rounds;
  const sonTur = turlar[turlar.length - 1];
  if (sonTur) {
    const p = turPuani(sonTur, pg).pct;
    L.push(`Son öz değerlendirme: ${tarihMetni(sonTur.date)} · %${String(p)} (${ozNotu(p)}) · ${String(turlar.length)} tur`);
  }
  if (pg.note) L.push(pg.note);
  L.push('', `${pg.unitPl} BAZINDA`);
  for (const g of pg.GORDER) {
    const G = r.groups[g];
    if (!G) continue;
    const p = grupYuzdesi(G);
    L.push(`  ${g} ${pg.CL[g]?.n ?? g}: ${p == null ? '–' : `%${String(p)}`}`);
  }
  L.push('', 'AKSİYON PLANI');
  for (const x of r.risks) {
    L.push(`[${lv(x.lvl).toLocaleUpperCase('tr')}]${dm[x.q.id] ? ' [KAPANDI]' : ''} ${x.q.c} · ${x.q.q}`);
    L.push(`   Aksiyon: ${x.q.fix}`);
    const not = w.notes[x.q.id];
    if (!w.example && not) L.push(`   Not: ${not}`);
  }
  return L.join('\n');
}

// Soruya özel puanlama rehberi (prototip rubricQ): kanıt listesinden 0-3 ve N/A örnekleri.
export interface RehberSatiri { v: Cevap; t: string; d: string }
export function puanlamaRehberi(q: Soru): RehberSatiri[] {
  const ev = q.ev;
  const n = ev.length;
  const tirnak = (x: string) => `“${x}”`;
  const hepsi = ev.map(tirnak).join(', ');
  const ilk = ev[0] ?? '';
  const ikinci = ev[1] ?? '';
  const son = ev[n - 1] ?? '';
  return [
    { v: '0', t: 'Kanıt yok', d: n > 1 ? `Bunların hiçbirini gösteremiyorsunuz: ${hepsi}.` : n ? `${tirnak(ilk)} gösterilemiyor ya da uygulanmıyor.` : 'Uygulanmıyor ya da gösterilemiyor.' },
    { v: '1', t: 'Kısmen', d: n > 1 ? `Yalnızca bir kısmı var. Örnek: ${tirnak(ilk)} var, ama ${tirnak(ikinci)}${n > 2 ? ' ve diğerleri' : ''} yok ya da güncel değil. “Yapıyoruz” deniyor ama kaydı yoksa da 1.` : 'Var ama eksik veya tutarsız; kaydı tam gösterilemiyor.' },
    { v: '2', t: 'Uygun', d: n > 1 ? `Çoğu kayıtla gösteriliyor, tek bir zayıf nokta var. Örnek: ${tirnak(son)} eksik, eski ya da imzasız.` : 'Gösteriliyor ama güncellik, imza veya süreklilikte zayıflık var.' },
    { v: '3', t: 'Tam uygun', d: `${n ? `Hepsi kayıtla ve sahada tutarlı: ${hepsi}. ` : ''}Denetçi bulgu yazamaz.` },
    { v: 'na', t: 'Uygulanmaz', d: 'Şart firmanıza uymuyorsa seçin; gerekçesi KYS kapsamında yazılı olmalı.' },
  ];
}
export const PUANLAMA_KURALI = 'Kural: kayıt yoksa en fazla 1. Kanıtın tamamı var ama bir zayıflık varsa 2. Denetçi her şeyi görse bile bulgu yazamıyorsa 3.';

// .ics metin kaçışı (RFC 5545 3.3.11): ters bölü, noktalı virgül, virgül ve satır sonu.
const icsKacis = (v: string): string => v.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDamgasi = (simdi: Date): string => simdi.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
const icsTarihi = (v: string): string => v.replace(/-/g, '');
const ICS_BAS = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Denetim Hazirlik//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];

// Öz değerlendirme için tekrarlayan hatırlatma (prototip ozIcs). Satırlar katlanmadan döner; çağıran icsKatla ile birleştirir.
export function ozIcsSatirlari(kb: KuralBaglami, profilId: string, simdi: Date = new Date()): string[] {
  const o = kb.calisma.oz;
  const f = OZF[o.freq];
  const t = isoTarih(simdi);
  let bas = ozSonrakiVade(o) || t;
  if (bas < t) bas = t;
  const firma = kb.profil.profile.firma;
  const baslik = `${kb.pg.s} öz değerlendirme turu${firma ? ` · ${firma}` : ''}`;
  return [
    ...ICS_BAS, 'BEGIN:VEVENT', `UID:oz-${profilId}-${kb.program}@denetim-hazirlik`, `DTSTAMP:${icsDamgasi(simdi)}`,
    `DTSTART;VALUE=DATE:${icsTarihi(bas)}`, `DTEND;VALUE=DATE:${icsTarihi(gunEkle(bas, 1))}`, `RRULE:${f.rr}`, `SUMMARY:${icsKacis(baslik)}`,
    `DESCRIPTION:${icsKacis(`${String(o.size)} soruluk öz değerlendirme turu (${f.n.toLocaleLowerCase('tr')}). Denetim Hazırlık aracında Öz değerlendirme sayfasından başlatın.`)}`,
    'TRANSP:TRANSPARENT', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT9H', `DESCRIPTION:${icsKacis(baslik)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR',
  ];
}

// Haftalık hazırlık toplantıları (prototip weeksIcs): bugünden sonraki her hafta bir tam gün olayı. Hafta yoksa null.
export function haftaIcsSatirlari(kb: KuralBaglami, profilId: string, simdi: Date = new Date()): { satirlar: string[]; adet: number } | null {
  const B = haftalariKur(kb);
  if (!B) return null;
  const t = isoTarih(simdi);
  const firma = kb.profil.profile.firma;
  const L = [...ICS_BAS];
  let adet = 0;
  for (const x of B.weeks) {
    if (x.e < t) continue;
    adet++;
    const gun = x.m < t ? t : x.m;
    const baslik = `${kb.pg.s} hazırlık · ${String(x.n)}. hafta${firma ? ` · ${firma}` : ''}`;
    const tema = WKT[kb.program][x.ph] ?? '';
    const aciklama = `${tema}\n${x.items.map((it) => `${it.done ? '[x] ' : '[ ] '}${it.t}${it.sub ? ` (${it.sub})` : ''}`).join('\n')}\n\nDenetim Hazırlık aracındaki haftalık programdan oluşturuldu.`;
    L.push(
      'BEGIN:VEVENT', `UID:wk-${profilId}-${kb.program}-${x.m}@denetim-hazirlik`, `DTSTAMP:${icsDamgasi(simdi)}`, `DTSTART;VALUE=DATE:${icsTarihi(gun)}`,
      `DTEND;VALUE=DATE:${icsTarihi(gunEkle(gun, 1))}`, `SUMMARY:${icsKacis(baslik)}`, `DESCRIPTION:${icsKacis(aciklama)}`, 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT9H', `DESCRIPTION:${icsKacis(baslik)}`, 'END:VALARM', 'END:VEVENT',
    );
  }
  L.push('END:VCALENDAR');
  return adet ? { satirlar: L, adet } : null;
}
