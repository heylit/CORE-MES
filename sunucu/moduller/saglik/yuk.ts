import { ekranYukunuAl, izlemeAyari, takilmaAnlariniAl, tekrarSerileriniAl } from '#cekirdek/istek-izleme.ts';
import type { TakilmaAni, TekrarSerisi } from '#cekirdek/istek-izleme.ts';
import { istekBoyutlari, istekSayaclari } from '#cekirdek/istek-olcumu.ts';
import type { EkranYuku, TakilmaKaydi, TekrarSerisiKaydi, YukCevabi, YukDonemi } from '#paylasilan/sozlesme/saglik.ts';
import { mesguUclariOzetle, yukAnligiYap, yukDakikasiHesapla } from './kurallar.ts';
import type { UcYukSayaci, YukDakikasi } from './kurallar.ts';

// Yük ve davranış ekranının belleği (3668 B): çekirdeğin tamponlarını boşaltıp dakikalık farkları ve seri/takılma kayıtlarını
// 24 saat tutar. Yalnız bellektedir; süreç yeniden açılınca sıfırlanır (kapanma kaydı o ana kadarını zaten saklar).
export const YUK_PENCERESI_DAKIKA = 24 * 60;
const AZAMI_TEKRAR = 200;
const AZAMI_TAKILMA = 50;
const DAKIKA_MS = 60_000;
const DONEM_MS: Record<YukDonemi, number> = { '1s': 60 * DAKIKA_MS, '24s': YUK_PENCERESI_DAKIKA * DAKIKA_MS };

export interface YukKaynagi {
  simdi: () => number;
  anlik: () => UcYukSayaci[];
  tekrarlar: () => TekrarSerisi[];
  takilmalar: () => TakilmaAni[];
  ekranlar: () => EkranYuku[];
  esik: () => { tekrarEsik: number; tekrarPencereMs: number; takilmaEsikMs: number };
}

export const SUREC_YUK_KAYNAGI: YukKaynagi = {
  simdi: () => Date.now(),
  anlik: () => yukAnligiYap(istekSayaclari(), istekBoyutlari()),
  tekrarlar: tekrarSerileriniAl,
  takilmalar: takilmaAnlariniAl,
  ekranlar: () => ekranYukunuAl(),
  esik: () => izlemeAyari(),
};

const iso = (ms: number): string => new Date(ms).toISOString();

export class YukToplayici {
  private taban: UcYukSayaci[] | null = null;
  private readonly dakikalar: YukDakikasi[] = [];
  private readonly tekrarlar = new Map<string, TekrarSerisiKaydi>();
  private readonly takilmalar: TakilmaKaydi[] = [];
  private readonly acilis: number;
  private readonly k: YukKaynagi;

  constructor(kaynak: YukKaynagi = SUREC_YUK_KAYNAGI) {
    this.k = kaynak;
    this.acilis = kaynak.simdi();
  }

  // Çekirdeğin tamponlarını boşaltır; okuyan ve dakikalık iş aynı yoldan geçer, hiçbir kayıt iki kez sayılmaz.
  private bosalt(): void {
    for (const t of this.k.tekrarlar()) {
      // Aynı pencere tek kayıttır: daha büyük seri öncekinin yerine geçer.
      this.tekrarlar.set(`${String(t.kisiId)}|${t.yontem}|${t.adres}`, {
        kisiId: t.kisiId, yontem: t.yontem, adres: t.adres, kez: t.sayi, hatali: t.hatali, sonDurum: t.sonDurum, sonHata: t.sonHata, sonAn: iso(t.sonAn),
      });
    }
    if (this.tekrarlar.size > AZAMI_TEKRAR) {
      const en = this.tekrarlar.keys().next();
      if (en.done !== true) this.tekrarlar.delete(en.value);
    }
    for (const t of this.k.takilmalar()) {
      this.takilmalar.push({
        an: iso(t.an), takilmaMs: Math.round(t.takilmaMs),
        suren: t.suren.map((s) => ({ yontem: s.yontem, adres: s.adres, kisiId: s.kisiId, sureSn: Math.round(s.sureMs / 100) / 10 })),
        sonBiten: t.sonBiten === null ? null : { yontem: t.sonBiten.yontem, adres: t.sonBiten.adres, kisiId: t.sonBiten.kisiId, sureMs: t.sonBiten.sureMs },
      });
    }
    if (this.takilmalar.length > AZAMI_TAKILMA) this.takilmalar.splice(0, this.takilmalar.length - AZAMI_TAKILMA);
  }

  // Dakikalık iş çağırır: ilk çağrı yalnız taban alır, sonrakiler bir önceki turdan bu yana olanı yazar.
  tur(): void {
    const an = this.k.simdi();
    const anlik = this.k.anlik();
    this.bosalt();
    const onceki = this.taban;
    this.taban = anlik;
    if (onceki === null) return;
    this.dakikalar.push(yukDakikasiHesapla(onceki, anlik, an));
    if (this.dakikalar.length > YUK_PENCERESI_DAKIKA) this.dakikalar.splice(0, this.dakikalar.length - YUK_PENCERESI_DAKIKA);
  }

  // En son tamamlanmamış dakika da görünsün: okuma anındaki fark geçici olarak eklenir (kalıcı dakikaya yazılmaz).
  private anlikDakika(): YukDakikasi | null {
    return this.taban === null ? null : yukDakikasiHesapla(this.taban, this.k.anlik(), this.k.simdi());
  }

  oku(donem: YukDonemi): YukCevabi {
    this.bosalt();
    const simdi = this.k.simdi();
    const dilim = Math.max(this.acilis, simdi - DONEM_MS[donem]);
    const dakikalar = [...this.dakikalar];
    const son = this.anlikDakika();
    if (son !== null) dakikalar.push(son);
    const esik = this.k.esik();
    const tekrarlar = [...this.tekrarlar.values()]
      .filter((t) => Date.parse(t.sonAn) >= dilim)
      // Hata sonrası tekrar üstte, sonra en çok tekrar, sonra en yeni.
      .sort((a, b) => Number(b.sonDurum >= 400) - Number(a.sonDurum >= 400) || b.kez - a.kez || Date.parse(b.sonAn) - Date.parse(a.sonAn));
    return {
      donem,
      baslangic: iso(dilim),
      tekrarEsik: { kez: esik.tekrarEsik, saniye: Math.round(esik.tekrarPencereMs / 1000) },
      tekrarlar,
      mesguUclar: mesguUclariOzetle(dakikalar, dilim),
      takilmalar: this.takilmalar.filter((t) => Date.parse(t.an) >= dilim).sort((a, b) => Date.parse(b.an) - Date.parse(a.an)),
      takilmaEsikMs: esik.takilmaEsikMs,
      ekranlar: this.k.ekranlar(),
    };
  }

  sunucuAcilis(): string {
    return iso(this.acilis);
  }
}

export const surecYuku = new YukToplayici();
