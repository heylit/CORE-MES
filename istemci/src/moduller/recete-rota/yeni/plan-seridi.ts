import type { PlanCanliOzeti, PlanSurumCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { PlanMotoru } from '../kopru.ts';
import type { EkranYerlesimi } from './veri.ts';

// Plan şeridi (eski ekranın planSeridi): plan motorunun yerleşimi canlı planla karşılaştırılır (Soru 491/1 a). Eski ekran kendi
// tarayıcı planını karşılaştırıyordu; yeni ekranda o plan yok, karşılaştırılan motorun yerleşimidir. Sayım eskininkidir (Soru 492/2 a):
// canlıda olmayan iş; canlıda başka makinede, başka sırada, dondurması ya da parça adedi farklı duran iş (adet motordan, 493/1 a). Canlıda
// kilitli iş sayılmaz (yazma onu taşımaz); canlıda yerleşemeyen bölünmüş iş "canlıda yok" sayılmaz, ayrı uyarıyla söylenir. Emirde karşılığı
// olmayan adım, makine kuyruğuna girmeyen adım ve bölmesi yazılamayan iş (motorun adedi yok) yazılamaz: sayılmaz, uyarı olur.
export interface PlanFarki { yok: number; farkli: number; emirdeYok: string[]; makinesiz: string[] }

const adimAdi = (anahtar: string) => (anahtar.split('~')[0] ?? anahtar).replace('|', ' OP ');

export function planFarki(canli: PlanCanliOzeti, yerlesim: EkranYerlesimi, adetler: PlanMotoru['parcaAdetleri'] = {}): PlanFarki {
  const canliIsler = new Map<string, { makine: number; sira: number; sabit: boolean; dondurulmus: boolean; adet: number }>();
  for (const k of canli.kuyruklar) {
    k.isler.forEach((x, sira) => {
      canliIsler.set(x.parca ? `${x.anahtar}~${String(x.parca.no)}` : x.anahtar, { makine: k.makineId, sira, sabit: x.sabit, dondurulmus: x.dondurulmus, adet: x.parca?.adet ?? 0 });
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
    if (adetler[anahtar] === null) continue;
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
      // Motor parça adedini vermediyse (eski sürüm cevabı) adet karşılaştırılmaz.
      const adet = x.anahtar.includes('~') ? adetler[x.anahtar] : 0;
      if (c.makine !== makine || c.dondurulmus || (adet !== undefined && adet !== c.adet)) { farkli++; continue; }
      ayni.push(c.sira);
    }
    const sirali = [...ayni].sort((a, b) => a - b);
    ayni.forEach((v, i) => { if (v !== sirali[i]) farkli++; });
  }
  return { yok, farkli, emirdeYok: [...emirdeYok], makinesiz: [...makinesiz] };
}

const ilkUc = (l: readonly string[]) => `${l.slice(0, 3).join(', ')}${l.length > 3 ? '…' : ''}`;

// Eski metin; motor önerisi canlıdan farklıyken "bu ekrandaki sıra" yanlış olur, o durumda canlı planın sırası denir.
const ESKI_CANLI_METNI = 'Terminal ve Arkon Hazırlık bu ekrandaki sırayı kullanıyor.';
const CANLI_METNI = 'Terminal ve Arkon Hazırlık canlı planın sırasını kullanıyor.';

export type SeritTuru = 'canli' | 'bekliyor' | 'degisti';
// motorFarki: plan canlıyken motor önerisinin canlıdan farklı iş sayısı (500 a); değişiklik sayısı değildir, yalnız bilgi.
export interface SeritDurumu { tur: SeritTuru; rozet: string; degisiklik: number; motorFarki: number; parca: string; metin: string; uyarilar: string[] }

// Şeridin durumu: canlı plan sürümü açılıştakinden farklıysa "plan değişti", kimin ne zaman canlıya aldığıyla (Soru 491/2 a, 492/2 a).
// Canlı plan varsa "plan canlı"dır (500 a): bu ekran plan yazmaz, motorun önerisi canlıdan farklıysa bu ayrıca "Motor önerisi canlıdan
// N iş farklı" diye söylenir, "canlıya alınmadı" denmez. Hiç canlı plan yoksa "canlıya alınmadı" ve motor önerisinin iş sayısı; motor
// yerleşimi okunamazsa fark bilinmez, şerit bunu söyler. Rotası değişen emir (motorun rotaEski'si) değişiklik sayılmaz; sunucu motoru onu
// yürürlükteki rotanın süreleriyle dizer, şerit bunu uyarır (983 b). Bölmesi yazılamayan iş (motorun bolmeYazilamaz'ı) uyarıdır.
export function seritDurumu(
  canli: PlanCanliOzeti, yerlesim: EkranYerlesimi | null, guncel: PlanSurumCevabi | null, motor: PlanMotoru | null = null,
): SeritDurumu {
  if (guncel !== null && guncel.planSurumu !== canli.planSurumu) {
    const s = guncel.sonCanliyaAlma;
    const kim = [s?.kisi ?? '', s ? planZamani(s.zaman) : ''].filter(Boolean).join(', ');
    return {
      tur: 'degisti', rozet: 'PLAN DEĞİŞTİ', degisiklik: 0, motorFarki: 0, parca: '', uyarilar: [],
      metin: `Plan başkası tarafından canlıya alındı${kim ? ` (${kim})` : ''}. Ekranı yenileyin; yenilemeden onaya gönderme reddedilir.`,
    };
  }
  // Canlı plan: en az bir kez canlıya alınmış ya da kuyruğunda iş olan plan.
  const canliVar = canli.sonCanliyaAlma !== null || canli.kuyruklar.some((k) => k.isler.length > 0);
  if (yerlesim === null) {
    return canliVar
      ? { tur: 'canli', rozet: 'PLAN CANLI', degisiklik: 0, motorFarki: 0, parca: '', uyarilar: ['Plan motorunun yerleşimi okunamadı; motor önerisiyle fark gösterilemiyor.'], metin: CANLI_METNI }
      : { tur: 'bekliyor', rozet: 'CANLIYA ALINMADI', degisiklik: 0, motorFarki: 0, parca: '', uyarilar: [], metin: 'Plan motorunun yerleşimi okunamadı; canlı planla farkı gösterilemiyor.' };
  }
  const f = planFarki(canli, yerlesim, motor?.parcaAdetleri);
  const rotadaKalan = (motor?.emirler ?? []).filter((e) => e.rotaEski).length;
  const bolmeYazilamaz = (motor?.emirler ?? []).flatMap((e) => e.bolmeYazilamaz.map((op) => `${e.emirNo} OP ${String(op)}`));
  const uyarilar = [
    rotadaKalan ? `${String(rotadaKalan)} emir eski rota revizyonundan açıldı; plan yürürlükteki rotanın süreleriyle kurulur.` : '',
    f.emirdeYok.length ? `${String(f.emirdeYok.length)} adım emirde yok, canlıya alınmaz (${ilkUc(f.emirdeYok)}): emir, adım eklenmeden önceki rotadan açıldı.` : '',
    f.makinesiz.length
      ? `${String(f.makinesiz.length)} adım makinesi olmayan istasyonda, canlıya alınmaz (${ilkUc(f.makinesiz)}): istasyona makine tanımlayın ya da rotada adımın makinesini seçin.`
      : '',
    bolmeYazilamaz.length
      ? `${String(bolmeYazilamaz.length)} bölünmüş iş canlıya alınmaz (${ilkUc(bolmeYazilamaz)}): adımın adedi plandan okunamadı ya da bir parça bir tam adetten az kaldı; iş kartında parçaları birleştirip yeniden bölün.`
      : '',
  ].filter(Boolean);
  const n = f.yok + f.farkli;
  const parca = [
    f.yok ? `${String(f.yok)} iş canlı planda yok` : '',
    f.farkli ? `${String(f.farkli)} iş canlıda başka sırada ya da makinede` : '',
  ].filter(Boolean).join(', ');
  if (canliVar || n === 0) return { tur: 'canli', rozet: 'PLAN CANLI', degisiklik: 0, motorFarki: n, parca, uyarilar, metin: n === 0 ? ESKI_CANLI_METNI : CANLI_METNI };
  return { tur: 'bekliyor', rozet: 'CANLIYA ALINMADI', degisiklik: n, motorFarki: 0, parca, uyarilar, metin: 'Onaylanıp canlıya alınana kadar terminal ve Arkon Hazırlık eski planı kullanır.' };
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
