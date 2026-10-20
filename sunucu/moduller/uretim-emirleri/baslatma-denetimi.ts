import type { Db } from '#cekirdek/db.ts';
import { hazirlikDenetimi } from './hazirlik.ts';

// Başlatma denetimi (kart #1289): iş emri başlamadan önce dinleyicilere sorulur. Stok bu modülü okur; bu modül stoku ithal etseydi
// modüller döngüye girerdi, bu yüzden denetçi kendini kaydeder. Engel bütün işlemi geri alır; uyarı başlatmayı durdurmaz, başlatma
// cevabında kullanıcıya gösterilir (karar 110 b: girdi istasyonda yoksa iş uyarıyla başlar). Uyarı veren denetçinin yazdığı
// başlatmayla aynı işlemdedir.
export interface BaslatmaOlayi { uretimEmriId: number; isEmriId: number; istasyonId: number; kisiId: number }
export type BaslatmaDenetimi = { engel: string } | { uyari: string } | null;
export type BaslatmaDenetcisi = (db: Db, olay: BaslatmaOlayi) => Promise<BaslatmaDenetimi>;

const denetciler: BaslatmaDenetcisi[] = [];

// Dönen işlev kaydı kaldırır (testler kendi denetçisini bırakır).
export function baslatmaDenetle(denetci: BaslatmaDenetcisi): () => void {
  denetciler.push(denetci);
  return () => {
    const i = denetciler.indexOf(denetci);
    if (i >= 0) denetciler.splice(i, 1);
  };
}

// İlk engelde durur; uyarılar sırayla toplanır. Hazırlık durdurucuları (120 a) önce bakılır: eksik hazırlıkta stok denenmez.
export async function baslatmaDenetimi(db: Db, olay: BaslatmaOlayi): Promise<{ engel: string | null; uyarilar: string[] }> {
  const hazirlikEngeli = await hazirlikDenetimi(db, olay);
  if (hazirlikEngeli !== null) return { engel: hazirlikEngeli, uyarilar: [] };
  const uyarilar: string[] = [];
  for (const d of [...denetciler]) {
    const sonuc = await d(db, olay);
    if (sonuc === null) continue;
    if ('engel' in sonuc) return { engel: sonuc.engel, uyarilar };
    uyarilar.push(sonuc.uyari);
  }
  return { engel: null, uyarilar };
}
