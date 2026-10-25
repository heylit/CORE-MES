import type { PlanCanliOzeti, PlanSurumCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { EkranYerlesimi } from './veri.ts';

// Plan şeridi (eski ekranın planSeridi): plan motorunun yerleşimi canlı planla karşılaştırılır (Soru 491/1 a). Eski ekran kendi
// tarayıcı planını karşılaştırıyordu; yeni ekranda o plan yok, karşılaştırılan motorun yerleşimidir. Sayım eskininkidir (Soru 492/2 a):
// canlıda olmayan iş; canlıda başka makinede, başka sırada ya da dondurması farklı duran iş. Canlıda kilitli iş sayılmaz (yazma onu
// taşımaz); canlıda yerleşemeyen bölünmüş iş "canlıda yok" sayılmaz, ayrı uyarıyla söylenir. Emirde karşılığı olmayan adım ve makine
// kuyruğuna girmeyen adım yazılamaz: sayılmaz, uyarı olur.
export interface PlanFarki { yok: number; farkli: number; emirdeYok: string[]; makinesiz: string[] }

const adimAdi = (anahtar: string) => (anahtar.split('~')[0] ?? anahtar).replace('|', ' OP ');

export function planFarki(canli: PlanCanliOzeti, yerlesim: EkranYerlesimi): PlanFarki {
  const canliIsler = new Map<string, { makine: number; sira: number; sabit: boolean; dondurulmus: boolean }>();
  for (const k of canli.kuyruklar) {
    k.isler.forEach((x, sira) => {
      canliIsler.set(x.parca ? `${x.anahtar}~${String(x.parca.no)}` : x.anahtar, { makine: k.makineId, sira, sabit: x.sabit, dondurulmus: x.dondurulmus });
    });
  }
  const yersiz = new Set((canli.yersizBolmeler ?? []).map((y) => y.anahtar));
  const planlanacak = new Set(canli.planlanacak);
  const emirdeYok = new Set<string>();
  const makinesiz = new Set<string>();

  // Motorun yerleşimi makine kuyruklarına çevrilir (başlangıç sırasıyla).
  const kuyruklar = new Map<number, { anahtar: string; baslangic: string }[]>();
  for (const [anahtar, yerler] of Object.entries(yerlesim)) {
    const taban = anahtar.split('~')[0] ?? anahtar;
    if (!planlanacak.has(taban)) { emirdeYok.add(adimAdi(anahtar)); continue; }
    for (const y of yerler) {
      if (y.makineId === null) { makinesiz.add(adimAdi(anahtar)); continue; }
      const k = kuyruklar.get(y.makineId) ?? [];
      k.push({ anahtar, baslangic: y.baslangic });
      kuyruklar.set(y.makineId, k);
    }
  }

  let yok = 0;
  let farkli = 0;
  for (const [makine, isler] of kuyruklar) {
    isler.sort((a, b) => a.baslangic.localeCompare(b.baslangic));
    const ayni: number[] = [];
    for (const x of isler) {
      const c = canliIsler.get(x.anahtar);
      if (!c) { if (!yersiz.has(x.anahtar.split('~')[0] ?? x.anahtar)) yok++; continue; }
      if (c.sabit) continue;
      // Yeni ekran işi dondurmaz: canlıda dondurulmuş duran iş farklıdır (eski ekranda tarayıcıdaki dondurmayla karşılaştırılırdı).
      if (c.makine !== makine || c.dondurulmus) { farkli++; continue; }
      ayni.push(c.sira);
    }
    const sirali = [...ayni].sort((a, b) => a - b);
    ayni.forEach((v, i) => { if (v !== sirali[i]) farkli++; });
  }
  return { yok, farkli, emirdeYok: [...emirdeYok], makinesiz: [...makinesiz] };
}

const ilkUc = (l: readonly string[]) => `${l.slice(0, 3).join(', ')}${l.length > 3 ? '…' : ''}`;

export type SeritTuru = 'canli' | 'bekliyor' | 'degisti';
export interface SeritDurumu { tur: SeritTuru; rozet: string; degisiklik: number; parca: string; metin: string; uyarilar: string[] }

// Şeridin durumu: canlı plan sürümü açılıştakinden farklıysa "plan değişti", kimin ne zaman canlıya aldığıyla (Soru 491/2 a, 492/2 a);
// fark yoksa "plan canlı"; varsa "canlıya alınmadı" ve değişiklik sayısı. Rotası yürürlükteki rotadan eski açık emir de değişiklik sayılır
// (eskide "N emrin rotası değişti"). Motor yerleşimi okunamazsa fark bilinmez: şerit bunu söyler, "canlı" demez.
export function seritDurumu(
  canli: PlanCanliOzeti, yerlesim: EkranYerlesimi | null, guncel: PlanSurumCevabi | null, rotasiDegisen = 0,
): SeritDurumu {
  if (guncel !== null && guncel.planSurumu !== canli.planSurumu) {
    const s = guncel.sonCanliyaAlma;
    const kim = [s?.kisi ?? '', s ? planZamani(s.zaman) : ''].filter(Boolean).join(', ');
    return {
      tur: 'degisti', rozet: 'PLAN DEĞİŞTİ', degisiklik: 0, parca: '', uyarilar: [],
      metin: `Plan başkası tarafından canlıya alındı${kim ? ` (${kim})` : ''}. Ekranı yenileyin; yenilemeden onaya gönderme reddedilir.`,
    };
  }
  if (yerlesim === null) {
    return { tur: 'bekliyor', rozet: 'CANLIYA ALINMADI', degisiklik: 0, parca: '', uyarilar: [], metin: 'Plan motorunun yerleşimi okunamadı; canlı planla farkı gösterilemiyor.' };
  }
  const f = planFarki(canli, yerlesim);
  const uyarilar = [
    f.emirdeYok.length ? `${String(f.emirdeYok.length)} adım emirde yok, canlıya alınmaz (${ilkUc(f.emirdeYok)}): emir, adım eklenmeden önceki rotadan açıldı.` : '',
    f.makinesiz.length
      ? `${String(f.makinesiz.length)} adım makinesi olmayan istasyonda, canlıya alınmaz (${ilkUc(f.makinesiz)}): istasyona makine tanımlayın ya da rotada adımın makinesini seçin.`
      : '',
  ].filter(Boolean);
  const n = f.yok + f.farkli + rotasiDegisen;
  if (n === 0) return { tur: 'canli', rozet: 'PLAN CANLI', degisiklik: 0, parca: '', uyarilar, metin: 'Terminal ve Arkon Hazırlık bu ekrandaki sırayı kullanıyor.' };
  const parca = [
    f.yok ? `${String(f.yok)} iş canlı planda yok` : '',
    f.farkli ? `${String(f.farkli)} iş canlıda başka sırada ya da makinede` : '',
    rotasiDegisen ? `${String(rotasiDegisen)} emrin rotası değişti` : '',
  ].filter(Boolean).join(', ');
  return { tur: 'bekliyor', rozet: 'CANLIYA ALINMADI', degisiklik: n, parca, uyarilar, metin: 'Onaylanıp canlıya alınana kadar terminal ve Arkon Hazırlık eski planı kullanır.' };
}

function planZamani(z: string): string {
  const t = new Date(z);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function sonCanliyaAlmaMetni(canli: PlanCanliOzeti): string {
  const s = canli.sonCanliyaAlma;
  if (!s) return 'Plan henüz hiç canlıya alınmadı';
  return `Son canlıya alma: ${planZamani(s.zaman)}${s.kisi ? `, ${s.kisi}` : ''}`;
}
