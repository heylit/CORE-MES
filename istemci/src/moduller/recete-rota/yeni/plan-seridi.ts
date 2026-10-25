import type { PlanCanliOzeti } from '#paylasilan/sozlesme/plan.ts';
import type { EkranYerlesimi } from './veri.ts';

// Plan şeridi (eski ekranın planSeridi): plan motorunun yerleşimi canlı planla karşılaştırılır (Soru 491/1, öneri a). Eski ekran kendi
// tarayıcı planını karşılaştırıyordu; yeni ekranda o plan yok, karşılaştırılan motorun yerleşimidir. Fark: canlıda olmayan iş, canlıda başka
// makinede ya da başka sırada duran iş. Canlıda kilitli ya da dondurulmuş iş sayılmaz (yazma onu taşımaz); canlıda yerleşemeyen bölünmüş
// iş "canlıda yok" sayılmaz, ayrı uyarıyla söylenir.
export interface PlanFarki { yok: number; farkli: number }

export function planFarki(canli: PlanCanliOzeti, yerlesim: EkranYerlesimi): PlanFarki {
  const canliIsler = new Map<string, { makine: number; sira: number; sabit: boolean }>();
  for (const k of canli.kuyruklar) {
    k.isler.forEach((x, sira) => {
      canliIsler.set(x.parca ? `${x.anahtar}~${String(x.parca.no)}` : x.anahtar, { makine: k.makineId, sira, sabit: x.sabit || x.dondurulmus });
    });
  }
  const yersiz = new Set((canli.yersizBolmeler ?? []).map((y) => y.anahtar));

  // Motorun yerleşimi makine kuyruklarına çevrilir (başlangıç sırasıyla); kişi kaynağındaki iş makine kuyruğunda olmadığından sayılmaz.
  const kuyruklar = new Map<number, { anahtar: string; baslangic: string }[]>();
  for (const [anahtar, yerler] of Object.entries(yerlesim)) {
    for (const y of yerler) {
      if (y.makineId === null) continue;
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
      if (c.makine !== makine) { farkli++; continue; }
      ayni.push(c.sira);
    }
    const sirali = [...ayni].sort((a, b) => a - b);
    ayni.forEach((v, i) => { if (v !== sirali[i]) farkli++; });
  }
  return { yok, farkli };
}

export type SeritTuru = 'canli' | 'bekliyor' | 'degisti';
export interface SeritDurumu { tur: SeritTuru; rozet: string; degisiklik: number; parca: string; metin: string }

// Şeridin durumu: canlı plan sürümü açılıştakinden farklıysa "plan değişti" (Soru 491/2, öneri a); fark yoksa "plan canlı"; varsa
// "canlıya alınmadı" ve değişiklik sayısı. Motor yerleşimi okunamazsa fark bilinmez: şerit yalnız son canlıya almayı söyler.
export function seritDurumu(canli: PlanCanliOzeti, yerlesim: EkranYerlesimi | null, guncelSurum: number | null): SeritDurumu {
  if (guncelSurum !== null && guncelSurum !== canli.planSurumu) {
    return { tur: 'degisti', rozet: 'PLAN DEĞİŞTİ', degisiklik: 0, parca: '', metin: 'Plan başkası tarafından canlıya alındı. Ekranı yenileyin; yenilemeden onaya gönderme reddedilir.' };
  }
  if (yerlesim === null) {
    return { tur: 'bekliyor', rozet: 'CANLIYA ALINMADI', degisiklik: 0, parca: '', metin: 'Plan motorunun yerleşimi okunamadı; canlı planla farkı gösterilemiyor.' };
  }
  const f = planFarki(canli, yerlesim);
  const n = f.yok + f.farkli;
  if (n === 0) return { tur: 'canli', rozet: 'PLAN CANLI', degisiklik: 0, parca: '', metin: 'Terminal ve Arkon Hazırlık bu ekrandaki sırayı kullanıyor.' };
  const parca = [f.yok ? `${String(f.yok)} iş canlı planda yok` : '', f.farkli ? `${String(f.farkli)} iş canlıda başka sırada ya da makinede` : '']
    .filter(Boolean).join(', ');
  return { tur: 'bekliyor', rozet: 'CANLIYA ALINMADI', degisiklik: n, parca, metin: 'Onaylanıp canlıya alınana kadar terminal ve Arkon Hazırlık eski planı kullanır.' };
}

export function sonCanliyaAlmaMetni(canli: PlanCanliOzeti): string {
  const s = canli.sonCanliyaAlma;
  if (!s) return 'Plan henüz hiç canlıya alınmadı';
  const t = new Date(s.zaman);
  const zaman = Number.isNaN(t.getTime()) ? '' : t.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `Son canlıya alma: ${zaman}${s.kisi ? `, ${s.kisi}` : ''}`;
}
