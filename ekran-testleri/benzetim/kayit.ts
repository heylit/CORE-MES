import { appendFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOSYA, SOZLESME_SURUMU, bosSayac } from './sozlesme.ts';
import type { AdimSatiri, KosuOzeti, ModelKipi } from './sozlesme.ts';

export interface KayitAcilisi {
  kok: string;
  kosuId: string;
  taban: string | null;
  tohum: number;
  gunSayisi: number;
  roller: string[];
  senaryolar: string[];
  model: { kip: ModelKipi; ustSinir: number };
  simdi?: () => Date;
}

// Koşu klasörüne yazan tek yer. İzleme dosyayı koşu sürerken okur: özet yeni dosyaya yazılıp yerine taşınır,
// adım satırı tek appendFileSync ile eklenir; okuyan yarım özet görmez.
export class KosuKaydi {
  readonly klasor: string;
  readonly ozet: KosuOzeti;
  private readonly simdi: () => Date;

  constructor(a: KayitAcilisi) {
    if (!/^[A-Za-z0-9_-]+$/.test(a.kosuId)) throw new Error(`Koşu kimliği geçersiz: ${a.kosuId}`);
    this.simdi = a.simdi ?? (() => new Date());
    this.klasor = join(a.kok, a.kosuId);
    mkdirSync(join(this.klasor, DOSYA.ekler), { recursive: true, mode: 0o700 });
    this.ozet = {
      surum: SOZLESME_SURUMU,
      kosuId: a.kosuId,
      taban: a.taban,
      baslangic: this.simdi().toISOString(),
      bitis: null,
      durum: 'kosuyor',
      tohum: a.tohum,
      gunSayisi: a.gunSayisi,
      gun: 0,
      roller: a.roller,
      senaryolar: a.senaryolar,
      sayac: bosSayac(),
      model: { kip: a.model.kip, cagri: 0, ustSinir: a.model.ustSinir },
      ileti: null,
    };
    writeFileSync(join(this.klasor, DOSYA.adimlar), '');
    this.ozetYaz();
  }

  adim(satir: Omit<AdimSatiri, 'zaman'>): void {
    const tam: AdimSatiri = { zaman: this.simdi().toISOString(), ...satir };
    appendFileSync(join(this.klasor, DOSYA.adimlar), `${JSON.stringify(tam)}\n`);
    this.ozet.sayac[tam.sonuc] += 1;
  }

  // Ek dosya koşu klasöründe kalır; satıra göreli yolu yazılır.
  ek(ad: string, veri: Buffer | string): string {
    const temiz = ad.replace(/[^A-Za-z0-9._-]/g, '_');
    writeFileSync(join(this.klasor, DOSYA.ekler, temiz), veri);
    return `${DOSYA.ekler}/${temiz}`;
  }

  gunBasladi(gun: number): void {
    this.ozet.gun = gun;
    this.ozetYaz();
  }

  modelCagrisi(): void {
    this.ozet.model.cagri += 1;
    this.ozetYaz();
  }

  yorumYaz(metin: string): void {
    writeFileSync(join(this.klasor, DOSYA.yorum), metin);
  }

  bitir(durum: 'bitti' | 'durdu', ileti: string | null = null): void {
    this.ozet.durum = durum;
    this.ozet.bitis = this.simdi().toISOString();
    this.ozet.ileti = ileti;
    this.ozetYaz();
  }

  ozetYaz(): void {
    const hedef = join(this.klasor, DOSYA.ozet);
    writeFileSync(`${hedef}.yeni`, JSON.stringify(this.ozet, null, 2));
    renameSync(`${hedef}.yeni`, hedef);
  }
}
