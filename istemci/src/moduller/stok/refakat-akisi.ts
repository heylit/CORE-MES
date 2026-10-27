import type { AdimOlcusu, KartAkisiCevabi, KartAni, KartAniTuru, KartKonumuTuru, KartOzetleriCevabi, SureOzeti } from '#paylasilan/sozlesme/akis.ts';

// Refakat kartı sayfasının saf hesabı (kart #708): Akış Süresi'nin kart cevabından rotanın aşamalarını (lot, stok, operasyon, sırada
// ve kapanış), lead dağılımını, özet kutularını ve iki tablonun satırlarını kurar. Saat girdidir (cevaptaki "şimdi"); sayılar
// yuvarlanır, ölçülemeyen değer null kalır ve ekranda "—" yazılır.

export type Ton = 'stok' | 'yol' | 'bekle' | 'run' | 'ayar' | 'stop' | 'fason' | 'soluk';
export type AsamaDurumu = 'gecti' | 'simdi' | 'sirada';

const DK = 60_000;
const an = (z: string): number => Date.parse(z);
const dakika = (ms: number): number => Math.max(0, Math.round(ms / DK));

// Süre dakikadır; ekranda gün, saat ve dakika. Ölçülemeyen süre "—" (sıfır uydurulmaz).
export function sureMetni(dk: number | null): string {
  if (dk === null) return '—';
  const t = Math.round(dk);
  const g = Math.floor(t / 1440), sa = Math.floor((t % 1440) / 60), d = t % 60;
  if (g > 0) return `${g} g ${sa} sa`;
  if (sa > 0) return `${sa} sa ${String(d).padStart(2, '0')} dk`;
  return `${d} dk`;
}
export const ondalik = (n: number | null, basamak = 1): string =>
  (n === null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: basamak, maximumFractionDigits: basamak }));
const birimDk = (n: number | null): string => (n === null ? '—' : `${ondalik(n)} dk`);
// Miktar numeric metindir; tam sayıysa ondalıksız yazılır.
export const miktar = (m: string | null): string => (m === null ? '—' : Number(m).toLocaleString('tr-TR', { maximumFractionDigits: 3 }));
export const yuzdeFark = (gercek: number | null, plan: number | null): number | null =>
  (gercek === null || plan === null || plan <= 0 ? null : Math.round((gercek - plan) / plan * 100));
export const farkMetni = (y: number | null): string => (y === null ? '' : `${y >= 0 ? '+' : ''}${y}%`);

const SAAT = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const TARIH = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const KISA = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit' });
const GUN_ADI = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' });
export const saat = (ms: number): string => SAAT.format(ms);
export const tarihSaat = (ms: number): string => `${TARIH.format(ms)} ${SAAT.format(ms)}`;
export const kisaZaman = (ms: number): string => `${KISA.format(ms)} ${SAAT.format(ms)}`;
export const gunBasligi = (ms: number): string => `${GUN_ADI.format(ms).replace(/^./, (h) => h.toLocaleUpperCase('tr-TR'))} ${TARIH.format(ms)}`;
const ayniGun = (a: number, b: number): boolean => TARIH.format(a) === TARIH.format(b);
// Aşamanın tarih aralığı: aynı gün biterse bitişte yalnız saat.
export function aralikMetni(bas: number | null, bit: number | null, acik: boolean): string {
  if (bas === null) return 'başlamadı';
  if (acik) return `${tarihSaat(bas)} → sürüyor`;
  if (bit === null || bit === bas) return tarihSaat(bas);
  return `${tarihSaat(bas)} → ${ayniGun(bas, bit) ? saat(bit) : tarihSaat(bit)}`;
}
// Plan aralığı: gerçek başlangıçla aynı gündeyse yalnız saat, değilse tarihle.
export function planAraligi(bas: number, bit: number, gercek: number | null): string {
  const b = gercek !== null && ayniGun(gercek, bas) ? saat(bas) : tarihSaat(bas);
  return `${b} → ${ayniGun(bas, bit) ? saat(bit) : tarihSaat(bit)}`;
}

export const KONUM: Record<KartKonumuTuru, { metin: string; ton: Ton }> = {
  depoda: { metin: 'Stokta · depo', ton: 'stok' },
  yolda: { metin: 'Stokta · yolda', ton: 'yol' },
  bekliyor: { metin: 'Stokta · bekliyor', ton: 'bekle' },
  ayarda: { metin: 'Operasyonda · ayar', ton: 'ayar' },
  uretimde: { metin: 'Operasyonda', ton: 'run' },
  duraklatildi: { metin: 'Operasyonda · duraklatıldı', ton: 'bekle' },
  durdu: { metin: 'Operasyonda · durdu', ton: 'stop' },
  fasonda: { metin: 'Fasonda', ton: 'fason' },
  sevke_hazir: { metin: 'Sevke hazır', ton: 'yol' },
  sevk_edildi: { metin: 'Sevk edildi', ton: 'soluk' },
  kapandi: { metin: 'Kapandı', ton: 'soluk' },
};

export const AN: Record<KartAniTuru, { ad: string; ton: Ton }> = {
  mal_kabul: { ad: 'Mal kabul edildi', ton: 'stok' },
  kart_acildi: { ad: 'Karta yüklendi', ton: 'stok' },
  teslim_gonderildi: { ad: 'Teslim edildi', ton: 'yol' },
  teslim_alindi: { ad: 'Teslim alındı', ton: 'yol' },
  teslim_reddedildi: { ad: 'Teslim reddedildi', ton: 'stop' },
  ayar: { ad: 'Ayar başladı', ton: 'ayar' },
  baslat: { ad: 'Üretim başladı', ton: 'run' },
  duraklat: { ad: 'Duraklatıldı', ton: 'bekle' },
  durdur: { ad: 'Durdu', ton: 'stop' },
  devam: { ad: 'Devam etti', ton: 'run' },
  bitir: { ad: 'Bitti', ton: 'run' },
  saglam: { ad: 'Sağlam sayıldı', ton: 'run' },
  hurda: { ad: 'Hurda sayıldı', ton: 'stop' },
  fason_gidis: { ad: 'Fasona gitti', ton: 'fason' },
  fason_donus: { ad: 'Fasondan döndü', ton: 'fason' },
  sevke_hazir: { ad: 'Sevke hazır', ton: 'yol' },
  sevk: { ad: 'Sevk edildi', ton: 'yol' },
};

// Anlar tablosundaki durum: kartın o andan sonraki hâli.
const AN_SONRASI: Record<KartAniTuru, { metin: string; ton: Ton }> = {
  mal_kabul: { metin: 'Stokta', ton: 'stok' }, kart_acildi: { metin: 'Stokta', ton: 'stok' },
  teslim_gonderildi: { metin: 'Yolda', ton: 'yol' }, teslim_alindi: { metin: 'Stokta', ton: 'stok' }, teslim_reddedildi: { metin: 'Stokta', ton: 'stok' },
  ayar: { metin: 'Ayar', ton: 'ayar' }, baslat: { metin: 'Operasyonda', ton: 'run' }, devam: { metin: 'Operasyonda', ton: 'run' },
  duraklat: { metin: 'Duraklatıldı', ton: 'bekle' }, durdur: { metin: 'Duruş', ton: 'stop' }, bitir: { metin: 'Stokta', ton: 'stok' },
  saglam: { metin: 'Operasyonda', ton: 'run' }, hurda: { metin: 'Operasyonda', ton: 'run' },
  fason_gidis: { metin: 'Fasonda', ton: 'fason' }, fason_donus: { metin: 'Stokta', ton: 'stok' },
  sevke_hazir: { metin: 'Stokta', ton: 'stok' }, sevk: { metin: 'Sevk edildi', ton: 'yol' },
};

const sayimAni = (a: KartAni): boolean => a.tur === 'saglam' || a.tur === 'hurda';
const opKodu = (opNo: number): string => `OP${String(opNo)}`;
const adimAdi = (a: Pick<AdimOlcusu, 'opNo' | 'fason' | 'istasyon'>): string => `${opKodu(a.opNo)} ${a.fason ? 'Fason' : a.istasyon ?? ''}`.trim();
// Teslim anının yeri "kaynak → hedef"tir.
const teslimUclari = (yer: string | null): { kaynak: string; hedef: string } | null => {
  const p = yer?.split(' → ');
  return p?.length === 2 ? { kaynak: p[0]!, hedef: p[1]! } : null;
};

export interface Kalem { miktar: string; ad: string; ton?: Ton }
export interface Alan { ad: string; deger: string }
export interface AsamaAni {
  zaman: number;
  // Bir önceki görünen andan geçen dakika; ilk anda null.
  farkDk: number | null;
  ad: string;
  ton: Ton;
  alanlar: Alan[];
  simdi: boolean;
}
export interface Asama {
  anahtar: string;
  tur: 'lot' | 'stok' | 'op' | 'son';
  durum: AsamaDurumu;
  kod: string;
  baslik: string;
  alt: string;
  bas: number | null;
  bit: number | null;
  acik: boolean;
  // Gerçek süre; sıradaki adımda plan süresi (planli).
  sureDk: number | null;
  planli: boolean;
  giren: Kalem[];
  cikan: Kalem[];
  anlar: AsamaAni[];
  adim: KartAdimi | null;
  // Teslim yolunda geçen dakika (stok aşamasında).
  yoldaDk: number;
  // Plan saati ve plana göre fark (750 a: güncel canlı plan); taban, adımın ilk canlıya alınan yeri.
  plan?: PlanBilgisi;
}
export interface PlanBilgisi { metin: string; fark: string; farkTon: Ton; taban: string; bas: number | null }

export interface KartBaglami {
  urun: string | null;
}

// Adım ölçüsü, kartın rotasındaki başlama, bitiş ve kartla sayılan hurdayla.
type PlanAraligi = KartAkisiCevabi['rota'][number]['plan'];
export type KartAdimi = AdimOlcusu & { baslama: string | null; bitis: string | null; hurdaAdet: number; plan: PlanAraligi; taban: PlanAraligi };
export const kartAdimlari = (d: KartAkisiCevabi): KartAdimi[] => d.adimlar.map((a) => {
  const r = d.rota.find((x) => x.isEmriId === a.isEmriId);
  return { ...a, baslama: r?.baslama ?? null, bitis: r?.bitis ?? null, hurdaAdet: r?.hurdaAdet ?? 0, plan: r?.plan ?? null, taban: r?.taban ?? null };
});

// Kartın parça sayısı: ilk adımda kartla sayılan sağlam ve hurda; sayım yoksa null.
export function kartAdedi(d: KartAkisiCevabi): number | null {
  const ilk = kartAdimlari(d).find((a) => a.saglamAdet + a.hurdaAdet > 0);
  return ilk === undefined ? null : ilk.saglamAdet + ilk.hurdaAdet;
}

export const sureOzetiBul = (d: KartAkisiCevabi, isEmriId: number): { kart: SureOzeti; emir: SureOzeti } | null =>
  d.sureOzetleri.find((s) => s.isEmriId === isEmriId) ?? null;

// Adımın plan süresi: ayar artı birim süre çarpı adet; ikisi de yoksa null.
export function adimPlaniDk(a: AdimOlcusu, adet: number | null): number | null {
  if (a.standartHazirlikDk === null && (a.standartBirimDk === null || adet === null)) return null;
  return (a.standartHazirlikDk ?? 0) + (a.standartBirimDk !== null && adet !== null ? a.standartBirimDk * adet : 0);
}

function teslimYoldaDk(d: KartAkisiCevabi, bas: number, bit: number, simdi: number): number {
  let ms = 0;
  for (const t of d.teslimler) {
    if (t.durum === 'iptal') continue;
    const a = Math.max(bas, an(t.gonderim));
    const b = Math.min(bit, t.kapanis === null ? simdi : an(t.kapanis));
    if (b > a) ms += b - a;
  }
  return dakika(ms);
}

// Rotanın aşamaları, yukarıdan aşağı. Lot aşaması kabul, karta yükleme ve ilk teslim gönderimini taşır; her adımın önünde
// (ve son adımın ardında) kartın stokta beklediği ya da yolda olduğu aşama vardır; kapanış aşaması sevki taşır. Sayım anları
// akışta ayrı satır değildir: adımın "o ana kadar" ve "bitti" alanlarına toplanır.
export function asamalar(d: KartAkisiCevabi, b: KartBaglami): Asama[] {
  const simdi = an(d.simdi);
  const gorunur = d.anlar.filter((a) => !sayimAni(a));
  const malzeme = d.kart.malzeme ?? 'Malzeme';
  const urun = b.urun ?? 'Ürün';
  const birimli = (m: string | null, birim: string | null) => (birim ? `${miktar(m)} ${birim}` : miktar(m));
  const adimlar = kartAdimlari(d);
  const rotaDurumu = new Map(d.rota.map((r) => [r.isEmriId, r.durum]));
  const opAnlari = (id: number) => gorunur.filter((a) => a.isEmriId === id);
  const ilkAn = (id: number): number | null => { const x = opAnlari(id)[0]; return x === undefined ? null : an(x.zaman); };
  const sonAn = (a: KartAdimi): number | null => {
    if (a.bitis !== null) return an(a.bitis);
    const x = opAnlari(a.isEmriId).at(-1);
    return x === undefined ? null : an(x.zaman);
  };
  const saglamOAna = (id: number, t: number): number =>
    d.anlar.filter((a) => a.isEmriId === id && a.tur === 'saglam' && an(a.zaman) <= t).reduce((s, a) => s + Number(a.miktar ?? 0), 0);

  // Anların aşamalara dağılımı.
  const lotAnlari: KartAni[] = [];
  const stokAnlari = new Map<number, KartAni[]>();
  const sonAnlari: KartAni[] = [];
  const baslayanlar = adimlar.map((a, i) => ({ i, t: ilkAn(a.isEmriId) })).filter((x): x is { i: number; t: number } => x.t !== null);
  let ilkTeslim = true;
  for (const a of gorunur) {
    if (a.isEmriId !== null) continue;
    if (a.tur === 'mal_kabul' || a.tur === 'kart_acildi') { lotAnlari.push(a); continue; }
    if (a.tur === 'sevke_hazir' || a.tur === 'sevk') { sonAnlari.push(a); continue; }
    const t = an(a.zaman);
    if (ilkTeslim && a.tur === 'teslim_gonderildi' && baslayanlar.every((x) => x.t >= t)) { lotAnlari.push(a); ilkTeslim = false; continue; }
    ilkTeslim = false;
    // Sonra başlayan ilk adımın önüne; yoksa önce başlamış son adımın ardına.
    const sonraki = baslayanlar.find((x) => x.t > t);
    const onceki = [...baslayanlar].reverse().find((x) => x.t <= t);
    const k = sonraki !== undefined ? sonraki.i : onceki !== undefined ? onceki.i + 1 : 0;
    stokAnlari.set(k, [...(stokAnlari.get(k) ?? []), a]);
  }

  // Kartın şimdi bulunduğu aşama: operasyonda ise o adım; değilse son anın aşaması, son an adımın bitişi ya da lottan çıkış
  // ise bir sonraki stok aşaması.
  const k = d.konum;
  const sonGorunur = gorunur.at(-1) ?? null;
  type Yer = { tur: 'lot' } | { tur: 'stok'; k: number } | { tur: 'op'; id: number } | { tur: 'son' } | null;
  let simdiki: Yer = null;
  if (k.durum === 'kapandi' || k.durum === 'sevk_edildi') simdiki = null;
  else if (k.durum === 'sevke_hazir') simdiki = { tur: 'son' };
  else if (['ayarda', 'uretimde', 'duraklatildi', 'durdu', 'fasonda'].includes(k.durum) && k.isEmriId !== null) simdiki = { tur: 'op', id: k.isEmriId };
  else if (sonGorunur === null || lotAnlari.includes(sonGorunur)) simdiki = sonGorunur?.tur === 'teslim_gonderildi' ? { tur: 'stok', k: baslayanlar[0]?.i ?? 0 } : { tur: 'lot' };
  else if (sonGorunur.isEmriId !== null) {
    const i = adimlar.findIndex((a) => a.isEmriId === sonGorunur.isEmriId);
    simdiki = { tur: 'stok', k: i + 1 };
  } else {
    const yer = [...stokAnlari.entries()].find(([, l]) => l.includes(sonGorunur));
    simdiki = yer === undefined ? null : { tur: 'stok', k: yer[0] };
  }

  const sonuc: Asama[] = [];
  let oncekiBitis: number | null = null;
  const asamaAnlari = (l: readonly KartAni[], alanlar: (a: KartAni) => Alan[], ad?: (a: KartAni) => string): AsamaAni[] =>
    l.map((a) => ({ zaman: an(a.zaman), farkDk: null, ad: ad?.(a) ?? AN[a.tur].ad, ton: AN[a.tur].ton, alanlar: alanlar(a), simdi: false }));
  const teslimAlanlari = (a: KartAni): Alan[] => {
    const u = teslimUclari(a.yer);
    const l: Alan[] = [];
    if (a.tur === 'teslim_gonderildi' && u) l.push({ ad: 'Hedef', deger: u.hedef });
    if (a.miktar !== null) l.push({ ad: 'Miktar', deger: miktar(a.miktar) });
    if (a.kim !== null) l.push({ ad: a.tur === 'teslim_gonderildi' ? 'Gönderen' : 'Okutan', deger: a.kim });
    return l;
  };

  // Lot aşaması.
  const lotBas = d.hammadde.reduce<number | null>((m, h) => (h.malKabul === null ? m : m === null ? an(h.malKabul) : Math.min(m, an(h.malKabul))), null) ?? an(d.kart.acilis);
  const lotSon = lotAnlari.length === 0 ? an(d.kart.acilis) : an(lotAnlari.at(-1)!.zaman);
  const hammaddeYasi = d.hammadde.some((h) => h.malKabul !== null) ? dakika(an(d.kart.acilis) - lotBas) : null;
  sonuc.push({
    anahtar: 'lot', tur: 'lot', durum: simdiki?.tur === 'lot' ? 'simdi' : 'gecti', kod: 'LOT',
    baslik: d.kart.lotNo === null ? 'Hammadde lotu bekleniyor' : `Hammadde lotu · ${d.kart.lotNo}`,
    alt: hammaddeYasi === null ? 'mal kabulü bilinmiyor' : `mal kabulden karta yüklemeye ${sureMetni(hammaddeYasi)}`,
    bas: lotBas, bit: lotSon, acik: simdiki?.tur === 'lot', sureDk: dakika((simdiki?.tur === 'lot' ? simdi : lotSon) - lotBas), planli: false,
    giren: [{ miktar: '—', ad: `${malzeme} · mal kabul` }],
    cikan: [{ miktar: birimli(d.kart.verilen, d.kart.birim), ad: `${malzeme} · karta` }],
    anlar: asamaAnlari(lotAnlari, (a) => {
      if (a.tur === 'mal_kabul') {
        return [
          { ad: 'Lot', deger: a.yer ?? '—' },
          ...(d.kart.dokumNo ? [{ ad: 'Döküm', deger: d.kart.dokumNo }] : []),
          ...(d.kart.sertifikaNo ? [{ ad: 'Sertifika', deger: d.kart.sertifikaNo }] : []),
          ...(d.kart.tedarikciPartiNo ? [{ ad: 'Tedarikçi parti', deger: d.kart.tedarikciPartiNo }] : []),
        ];
      }
      if (a.tur === 'kart_acildi') return [{ ad: 'Kart', deger: d.kart.etiket }, { ad: 'Verilen', deger: birimli(d.kart.verilen, d.kart.birim) }];
      return teslimAlanlari(a);
    }, (a) => (a.tur === 'teslim_gonderildi' ? 'Yola çıktı' : AN[a.tur].ad)),
    adim: null, yoldaDk: 0,
  });
  oncekiBitis = lotSon;

  const adet = kartAdedi(d);
  let oncekiSaglam: { adet: number; op: number } | null = null;
  const stokAsamasi = (i: number, sonraki: KartAdimi | null) => {
    const l = stokAnlari.get(i) ?? [];
    const simdiMi = simdiki?.tur === 'stok' && simdiki.k === i;
    const sonrakiBas = sonraki === null ? null : ilkAn(sonraki.isEmriId);
    const ilerisiBasladi = sonrakiBas !== null || (sonraki === null && sonAnlari.length > 0);
    const bas = oncekiBitis ?? (l[0] === undefined ? null : an(l[0].zaman));
    const bit = simdiMi ? simdi : sonrakiBas ?? (sonraki === null && sonAnlari[0] ? an(sonAnlari[0].zaman) : null);
    if (l.length === 0 && !simdiMi && (!ilerisiBasladi || bas === null || bit === null || bit <= bas)) return;
    const sonTeslim = [...l].reverse().find((a) => a.tur === 'teslim_gonderildi' || a.tur === 'teslim_alindi' || a.tur === 'teslim_reddedildi');
    const u = teslimUclari(sonTeslim?.yer ?? null);
    const istasyon = sonraki === null ? null : sonraki.fason ? 'Fason' : sonraki.istasyon;
    const baslik = u === null
      ? `${istasyon ?? (sonraki === null ? 'Çıkış' : opKodu(sonraki.opNo))} önünde`
      : sonTeslim?.tur === 'teslim_gonderildi' ? `${u.kaynak} → ${u.hedef}` : `${u.hedef} önünde`;
    const sure = bas === null || bit === null ? null : dakika(bit - bas);
    const yolda = bas === null || bit === null ? 0 : teslimYoldaDk(d, bas, bit, simdi);
    const bekledi = sure === null ? null : Math.max(0, sure - yolda);
    const parcalar = [yolda > 0 && `yolda ${sureMetni(yolda)}`, bekledi !== null && bekledi > 0 && `bekledi ${sureMetni(bekledi)}`].filter(Boolean) as string[];
    const gonderilen = l.filter((a) => a.tur === 'teslim_gonderildi');
    const alinan = l.filter((a) => a.tur === 'teslim_alindi');
    const ad = oncekiSaglam === null ? malzeme : `${urun} · ${opKodu(oncekiSaglam.op)}`;
    const anlar = asamaAnlari(l, teslimAlanlari);
    if (simdiMi) {
      const yer = KONUM[k.durum];
      anlar.push({
        zaman: simdi, farkDk: null, ad: k.durum === 'yolda' ? 'Yolda' : 'Bekliyor', ton: yer.ton, simdi: true,
        alanlar: k.durum === 'yolda' && u !== null ? [{ ad: 'Bekleyen', deger: `${u.hedef} teslim alacak` }] : [],
      });
    }
    sonuc.push({
      anahtar: `stok-${String(i)}`, tur: 'stok', durum: simdiMi ? 'simdi' : ilerisiBasladi || l.length > 0 ? 'gecti' : 'sirada', kod: '', baslik,
      alt: `${parcalar.join(' · ') || 'beklemedi'}${simdiMi ? ', sürüyor' : ''}`,
      bas, bit, acik: simdiMi, sureDk: sure, planli: false,
      giren: gonderilen.length === 0 ? [] : gonderilen.map((a) => ({ miktar: miktar(a.miktar), ad })),
      cikan: gonderilen.length === 0 ? [] : alinan.length === 0
        ? [{ miktar: '—', ad: 'teslim alınmadı', ton: 'soluk' as const }]
        : alinan.map((a) => ({ miktar: miktar(a.miktar), ad: `${ad}, ${teslimUclari(a.yer)?.hedef ?? ''}`.replace(/, $/, '') })),
      anlar, adim: null, yoldaDk: yolda,
    });
    if (bit !== null && !simdiMi) oncekiBitis = bit;
  };

  adimlar.forEach((a, i) => {
    stokAsamasi(i, a);
    const durum = simdiki?.tur === 'op' && simdiki.id === a.isEmriId ? 'simdi' : rotaDurumu.get(a.isEmriId) === 'gecti' ? 'gecti'
      : rotaDurumu.get(a.isEmriId) === 'simdi' ? 'simdi' : 'sirada';
    const l = opAnlari(a.isEmriId);
    const so = sureOzetiBul(d, a.isEmriId);
    const bas = ilkAn(a.isEmriId);
    const bit = sonAn(a);
    const acik = durum === 'simdi' && a.bitis === null;
    const girenAdet = oncekiSaglam?.adet ?? null;
    const giren: Kalem[] = oncekiSaglam === null
      ? [{ miktar: d.kart.sarf !== null ? birimli(d.kart.sarf, d.kart.birim) : birimli(d.kart.verilen, d.kart.birim), ad: `${malzeme} · ${d.kart.sarf !== null ? 'sarf' : 'verilen'}` }]
      : [{ miktar: String(oncekiSaglam.adet), ad: `${urun} · ${opKodu(oncekiSaglam.op)}` }];
    if (durum === 'sirada') {
      const planAdet = girenAdet ?? adet;
      sonuc.push({
        anahtar: `op-${String(a.isEmriId)}`, tur: 'op', durum, kod: opKodu(a.opNo), baslik: a.fason ? `${opKodu(a.opNo)} · Fason` : `${opKodu(a.opNo)} · ${a.istasyon ?? '—'}`,
        alt: `plan: ${[a.standartHazirlikDk !== null && `ayar ${sureMetni(a.standartHazirlikDk)}`, a.standartBirimDk !== null && `cycle ${ondalik(a.standartBirimDk)} dk`].filter(Boolean).join(', ') || 'süre yok'}`,
        bas: null, bit: null, acik: false, sureDk: adimPlaniDk(a, planAdet), planli: true,
        giren, cikan: [{ miktar: planAdet === null ? '—' : String(planAdet), ad: `${urun} · ${opKodu(a.opNo)}`, ton: 'soluk' }],
        anlar: [], adim: a, yoldaDk: 0,
      });
      return;
    }
    const hurdaNedenleri = [...new Set(d.anlar.filter((x) => x.isEmriId === a.isEmriId && x.tur === 'hurda' && x.neden !== null).map((x) => x.neden!))];
    const cikan: Kalem[] = [{ miktar: String(a.saglamAdet), ad: `${urun} · ${opKodu(a.opNo)}` }];
    if (a.hurdaAdet > 0) cikan.push({ miktar: String(a.hurdaAdet), ad: `hurda${hurdaNedenleri.length > 0 ? ` · ${hurdaNedenleri.join(', ')}` : ''}`, ton: 'stop' });
    if (oncekiSaglam === null && d.kart.sarf !== null) {
      const kalan = Number(d.kart.verilen) - Number(d.kart.sarf);
      if (kalan > 0) cikan.push({ miktar: birimli(String(kalan), d.kart.birim), ad: `${malzeme} · kalan`, ton: 'soluk' });
    }
    const durus = (a.durusDk ?? 0) + (a.duraklamaDk ?? 0);
    const alt = a.fason
      ? `fasonda ${sureMetni(a.fasonDk)}`
      : [`ayar ${sureMetni(a.hazirlikDk)}`, `üretim ${sureMetni(a.islemeDk)}`, `duruş ${sureMetni(a.durusDk === null && a.duraklamaDk === null ? null : durus)}`].join(' · ');
    sonuc.push({
      anahtar: `op-${String(a.isEmriId)}`, tur: 'op', durum, kod: opKodu(a.opNo), baslik: a.fason ? `${opKodu(a.opNo)} · Fason` : `${opKodu(a.opNo)} · ${a.istasyon ?? '—'}`,
      alt, bas, bit: acik ? simdi : bit, acik, sureDk: bas === null ? null : dakika((acik ? simdi : bit ?? simdi) - bas), planli: false,
      giren, cikan,
      anlar: asamaAnlari(l, (x) => {
        const kim = x.kim === null ? [] : [{ ad: 'Operatör', deger: x.kim }];
        if (x.tur === 'durdur' || x.tur === 'duraklat') {
          return [...(x.neden === null ? [] : [{ ad: 'Neden', deger: x.neden }]), { ad: 'O ana kadar', deger: `${String(saglamOAna(a.isEmriId, an(x.zaman)))} sağlam` }, ...kim];
        }
        if (x.tur === 'bitir' && so !== null) {
          return [
            { ad: 'Sağlam', deger: String(a.saglamAdet) }, { ad: 'Hurda', deger: String(a.hurdaAdet) },
            { ad: 'Brüt birim', deger: birimDk(so.kart.brutBirimDk) }, { ad: 'Net birim', deger: birimDk(so.kart.netBirimDk) },
            { ad: 'Tekli ort.', deger: birimDk(so.kart.tekliOrtalamaDk) },
          ];
        }
        if (x.tur === 'fason_gidis' || x.tur === 'fason_donus') return [{ ad: 'Adet', deger: miktar(x.miktar) }];
        return kim;
      }),
      adim: a, yoldaDk: 0,
    });
    if (acik) {
      const yer = KONUM[k.durum];
      sonuc.at(-1)!.anlar.push({ zaman: simdi, farkDk: null, ad: yer.metin.replace(/^Operasyonda · /, '').replace(/^./, (h) => h.toLocaleUpperCase('tr-TR')), ton: yer.ton, alanlar: [], simdi: true });
    }
    if (a.saglamAdet > 0) oncekiSaglam = { adet: a.saglamAdet, op: a.opNo };
    if (bit !== null && !acik) oncekiBitis = bit;
  });
  stokAsamasi(adimlar.length, null);

  const sevk = sonAnlari.find((a) => a.tur === 'sevk');
  const kapali = k.durum === 'kapandi' || k.durum === 'sevk_edildi';
  sonuc.push({
    anahtar: 'son', tur: 'son', durum: kapali ? 'gecti' : simdiki?.tur === 'son' ? 'simdi' : 'sirada', kod: 'SON', baslik: 'Mamul deposu ya da sevk',
    alt: k.durum === 'kapandi' ? 'kart kapandı' : 'kart burada kapanır',
    bas: sonAnlari[0] ? an(sonAnlari[0].zaman) : null, bit: sevk ? an(sevk.zaman) : null, acik: false, sureDk: null, planli: false,
    giren: [], cikan: [], anlar: asamaAnlari(sonAnlari, () => []), adim: null, yoldaDk: 0,
  });

  planiIsle(sonuc, simdi, d.emir.teslim);

  // Fark: görünen anların zaman sırasında bir öncekine uzaklığı.
  let onceki: number | null = null;
  for (const a of sonuc.flatMap((x) => x.anlar).sort((p, q) => p.zaman - q.zaman)) {
    a.farkDk = onceki === null ? null : dakika(a.zaman - onceki);
    onceki = a.zaman;
  }
  return sonuc;
}

// Plan saatleri (750 a): adım aşamasında canlı plan aralığı; biten adımda bitiş farkı, süren ya da sıradaki adımda plan bitişi ya da
// başlangıcı geçtiyse gecikme. Başlamış adımın önündeki stok aşaması planlanan başlangıcı ve başlama farkını taşır; önünde stok aşaması
// yoksa başlama farkı adımdadır. Bir dakikadan küçük fark yazılmaz. Kapanış aşaması emrin terminini taşır.
function planiIsle(liste: Asama[], simdi: number, termin: string | null): void {
  type Fark = { metin: string; ton: Ton };
  // İşaretli fark (gerçek eksi plan); geç bekle tonunda, erken soluk.
  const fark = (ms: number, metin: (sure: string, yon: string) => string): Fark | null => {
    const dk = Math.round(ms / DK);
    return Math.abs(dk) < 1 ? null : { metin: metin(sureMetni(Math.abs(dk)), dk > 0 ? 'geç' : 'erken'), ton: dk > 0 ? 'bekle' : 'soluk' };
  };
  const ton = (l: readonly Fark[]): Ton => l.find((f) => f.ton === 'stop')?.ton ?? l.find((f) => f.ton === 'bekle')?.ton ?? 'soluk';
  liste.forEach((s, i) => {
    if (s.tur === 'son') {
      if (termin !== null) s.plan = { metin: `termin ${termin.split('-').reverse().join('.')}`, fark: '', farkTon: 'soluk', taban: '', bas: null };
      return;
    }
    const a = s.adim;
    if (s.tur !== 'op' || a === null || a.plan === null) return;
    const pb = an(a.plan.baslangic);
    const pt = an(a.plan.bitis);
    const farklar: Fark[] = [];
    const baslama = s.bas === null ? null : fark(s.bas - pb, (sure, yon) => `${sure} ${yon} başladı`);
    const once = liste[i - 1];
    if (once?.tur === 'stok' && once.durum === 'gecti' && s.bas !== null) {
      once.plan = {
        metin: `${once.bas !== null && ayniGun(once.bas, pb) ? saat(pb) : tarihSaat(pb)} başlangıç`,
        fark: baslama?.metin ?? '', farkTon: baslama?.ton ?? 'soluk', taban: '', bas: null,
      };
    } else if (baslama !== null) farklar.push(baslama);
    if (s.durum === 'gecti' && s.bit !== null) {
      const f = fark(s.bit - pt, (sure, yon) => `bitiş ${sure} ${yon}`);
      if (f !== null) farklar.push(f);
    } else if (s.durum === 'simdi' && simdi - pt >= DK) farklar.push({ metin: `plan bitişi ${sureMetni(dakika(simdi - pt))} geçti`, ton: 'stop' });
    else if (s.durum === 'sirada' && simdi - pb >= DK) farklar.push({ metin: `plana göre ${sureMetni(dakika(simdi - pb))} gecikmede`, ton: 'stop' });
    const t = a.taban;
    s.plan = {
      metin: planAraligi(pb, pt, s.bas),
      fark: farklar.map((f) => f.metin).join(' · '),
      farkTon: ton(farklar),
      taban: t === null || (an(t.baslangic) === pb && an(t.bitis) === pt) ? '' : `taban ${planAraligi(an(t.baslangic), an(t.bitis), s.bas ?? pb)}`,
      bas: pb,
    };
  });
}

// Planlanan lead: gerçek lead gibi karta yüklemeden, rotadaki son plan bitişine; plan yoksa ya da bitiş yüklemeden önceyse null.
export function planLeadDk(d: KartAkisiCevabi): number | null {
  const bitisler = d.rota.flatMap((r) => (r.plan === null ? [] : [an(r.plan.bitis)]));
  const ms = Math.max(...bitisler) - an(d.kart.acilis);
  return bitisler.length === 0 || ms <= 0 ? null : dakika(ms);
}

// Lead dağılımı: karta yüklemeden lead sonuna; her an önce adımın bölümüne (duruş, ayar, üretim, fason), değilse teslim yoluna,
// değilse stokta beklemeye sayılır. Adım bölümleri emrin olaylarıdır (olaylar emrin).
export type DagilimTuru = 'stok' | 'yol' | 'ayar' | 'uretim' | 'durus' | 'fason';
export const DAGILIM: Record<DagilimTuru, { ad: string; ton: Ton }> = {
  stok: { ad: 'Stokta bekleme', ton: 'stok' }, yol: { ad: 'Yolda', ton: 'yol' }, ayar: { ad: 'Ayar', ton: 'ayar' },
  uretim: { ad: 'Üretim', ton: 'run' }, durus: { ad: 'Duruş', ton: 'stop' }, fason: { ad: 'Fasonda', ton: 'fason' },
};
export interface DagilimParcasi { tur: DagilimTuru; ad: string; bas: number; bit: number; dk: number; pay: number }
export interface LeadDagilimi { bas: number; bit: number; parcalar: DagilimParcasi[]; toplamlar: Record<DagilimTuru, number> }

export function leadDagilimi(d: KartAkisiCevabi): LeadDagilimi | null {
  if (d.lead.dk === null) return null;
  const bas = an(d.kart.acilis);
  const bit = bas + d.lead.dk * DK;
  const simdi = an(d.simdi);
  const ONCELIK: DagilimTuru[] = ['durus', 'ayar', 'uretim', 'fason'];
  const opAraliklari: { tur: DagilimTuru; ad: string; a: number; b: number }[] = [];
  for (const s of d.seritler) {
    if (s.tur !== 'adim') continue;
    for (const p of s.bolumler) {
      const tur: DagilimTuru | null = p.tur === 'hazirlik' ? 'ayar' : p.tur === 'isleme' ? 'uretim' : p.tur === 'durus' || p.tur === 'duraklama' ? 'durus' : p.tur === 'fason' ? 'fason' : null;
      if (tur !== null) opAraliklari.push({ tur, ad: s.baslik, a: an(p.baslangic), b: an(p.bitis) });
    }
  }
  const yollar = d.teslimler.filter((t) => t.durum !== 'iptal').map((t) => ({ ad: `${t.kaynak} → ${t.hedef}`, a: an(t.gonderim), b: t.kapanis === null ? simdi : an(t.kapanis) }));
  const sinirlar = [...new Set([bas, bit, ...opAraliklari.flatMap((x) => [x.a, x.b]), ...yollar.flatMap((x) => [x.a, x.b])])].filter((t) => t >= bas && t <= bit).sort((x, y) => x - y);
  const parcalar: DagilimParcasi[] = [];
  for (let i = 0; i < sinirlar.length - 1; i++) {
    const a = sinirlar[i]!, b = sinirlar[i + 1]!, orta = (a + b) / 2;
    const op = ONCELIK.map((t) => opAraliklari.find((x) => x.tur === t && x.a <= orta && x.b >= orta)).find((x) => x !== undefined);
    const yol = op === undefined ? yollar.find((x) => x.a <= orta && x.b >= orta) : undefined;
    const tur: DagilimTuru = op?.tur ?? (yol ? 'yol' : 'stok');
    const ad = op ? `${DAGILIM[tur].ad} · ${op.ad}` : yol ? `Yolda · ${yol.ad}` : 'Stokta bekledi';
    const son = parcalar.at(-1);
    if (son && son.tur === tur && son.ad === ad) son.bit = b;
    else parcalar.push({ tur, ad, bas: a, bit: b, dk: 0, pay: 0 });
  }
  const toplam = Math.max(1, bit - bas);
  const toplamlar: Record<DagilimTuru, number> = { stok: 0, yol: 0, ayar: 0, uretim: 0, durus: 0, fason: 0 };
  for (const p of parcalar) {
    p.dk = dakika(p.bit - p.bas);
    p.pay = (p.bit - p.bas) / toplam;
    toplamlar[p.tur] += (p.bit - p.bas) / DK;
  }
  for (const t of Object.keys(toplamlar) as DagilimTuru[]) toplamlar[t] = Math.round(toplamlar[t]);
  return { bas, bit, parcalar: parcalar.filter((p) => p.bit > p.bas), toplamlar };
}

// Süre özetinin gösterildiği adım: kart bir adımda çalışıyorsa o, değilse kartın sayıldığı son adım, o da yoksa ilk adım.
export function odakAdimi(d: KartAkisiCevabi): AdimOlcusu | null {
  const op = d.adimlar.filter((a) => !a.fason);
  const calisan = op.find((a) => a.isEmriId === d.konum.isEmriId && ['ayarda', 'uretimde', 'duraklatildi', 'durdu'].includes(d.konum.durum));
  if (calisan) return calisan;
  const sayilan = [...op].reverse().find((a) => { const s = sureOzetiBul(d, a.isEmriId); return s !== null && s.kart.saglam + s.kart.hurda > 0; });
  return sayilan ?? op[0] ?? null;
}

// İşlem planı: başlamış adımların plan süresi (ayar artı birim süre çarpı kartın o adımdaki adedi).
export function islemPlaniDk(d: KartAkisiCevabi): number | null {
  const adet = kartAdedi(d);
  const l = kartAdimlari(d).filter((a) => d.rota.find((r) => r.isEmriId === a.isEmriId)?.durum !== 'sirada')
    .map((a) => adimPlaniDk(a, a.saglamAdet + a.hurdaAdet > 0 ? a.saglamAdet + a.hurdaAdet : adet));
  return l.every((x) => x === null) ? null : Math.round(l.reduce<number>((t, x) => t + (x ?? 0), 0));
}

export interface OzetKutusu { ad: string; deger: string; fark: string; ton: Ton }
export function ozetKutulari(d: KartAkisiCevabi, dagilim: LeadDagilimi | null): OzetKutusu[] {
  const planLead = planLeadDk(d);
  const plan = planLead ?? islemPlaniDk(d);
  const leadFark = yuzdeFark(d.lead.dk, plan);
  const t = dagilim?.toplamlar;
  const operasyonda = t === undefined ? null : t.ayar + t.uretim + t.durus + t.fason;
  const odak = odakAdimi(d);
  const so = odak === null ? null : sureOzetiBul(d, odak.isEmriId);
  const cycleFark = yuzdeFark(so?.kart.netBirimDk ?? null, odak?.standartBirimDk ?? null);
  const malKabul = d.hammadde.reduce<number | null>((m, h) => (h.malKabul === null ? m : m === null ? an(h.malKabul) : Math.min(m, an(h.malKabul))), null);
  return [
    {
      ad: 'Lead time · gerçek', deger: `${sureMetni(d.lead.dk)}${d.lead.acik ? ' (sürüyor)' : ''}`,
      // Açık kartın lead'i plana henüz ulaşmadıysa eksi yüzde yerine kalan süre: yüzde ancak lead kapanınca ya da planı aşınca anlamlıdır.
      fark: plan === null ? 'plan yok' : `${planLead === null ? 'işlem planı' : 'plan'} ${sureMetni(plan)}${leadFark === null ? ''
        : d.lead.acik && leadFark < 0 && d.lead.dk !== null ? ` · ${sureMetni(plan - d.lead.dk)} kaldı` : ` · ${farkMetni(leadFark)}`}`,
      ton: leadFark !== null && leadFark > 0 ? 'bekle' : 'soluk',
    },
    {
      ad: 'Operasyonda / lead', deger: operasyonda === null || d.lead.dk === null || d.lead.dk <= 0 ? '—' : `%${String(Math.round(operasyonda / d.lead.dk * 100))}`,
      fark: `${sureMetni(operasyonda)} / ${sureMetni(d.lead.dk)}`, ton: 'soluk',
    },
    {
      ad: `${odak === null ? 'Adım' : opKodu(odak.opNo)} cycle · gerçek`, deger: birimDk(so?.kart.netBirimDk ?? null),
      fark: [`plan ${ondalik(odak?.standartBirimDk ?? null)}`, `emir ${ondalik(so?.emir.netBirimDk ?? null)}`, farkMetni(cycleFark)].filter(Boolean).join(' · '),
      ton: cycleFark !== null && cycleFark > 0 ? 'bekle' : 'soluk',
    },
    {
      ad: 'Hammadde yaşı', deger: sureMetni(malKabul === null ? null : dakika(an(d.kart.acilis) - malKabul)),
      fark: 'mal kabulden karta yüklemeye', ton: 'soluk',
    },
  ];
}

export interface CycleSatiri { anahtar: number; ad: string; plan: number | null; gercek: number | null; planPay: number; gercekPay: number; ton: Ton }
export function cycleSatirlari(d: KartAkisiCevabi): CycleSatiri[] {
  const l = d.adimlar.filter((a) => !a.fason).map((a) => ({ a, gercek: sureOzetiBul(d, a.isEmriId)?.kart.netBirimDk ?? null }));
  const enBuyuk = Math.max(1, ...l.flatMap((x) => [x.a.standartBirimDk ?? 0, x.gercek ?? 0])) * 1.2;
  return l.map(({ a, gercek }) => ({
    anahtar: a.isEmriId, ad: adimAdi(a), plan: a.standartBirimDk, gercek,
    planPay: (a.standartBirimDk ?? 0) / enBuyuk, gercekPay: (gercek ?? 0) / enBuyuk,
    ton: gercek === null ? 'soluk' : a.standartBirimDk !== null && gercek > a.standartBirimDk ? 'bekle' : 'run',
  }));
}

export interface SureSatiri { ad: string; plan: string; kart: string; emir: string; nasil: string; ton: Ton }
export function sureOzetiSatirlari(d: KartAkisiCevabi, a: AdimOlcusu): SureSatiri[] {
  const so = sureOzetiBul(d, a.isEmriId);
  const k = so?.kart, e = so?.emir;
  const plan = a.standartBirimDk;
  const giren = (() => { const i = d.adimlar.findIndex((x) => x.isEmriId === a.isEmriId); const o = d.adimlar[i - 1]; return o === undefined ? kartAdedi(d) : o.saglamAdet; })();
  return [
    { ad: 'Hazırlık (ayar)', plan: sureMetni(a.standartHazirlikDk), kart: sureMetni(k?.hazirlikDk ?? null), emir: sureMetni(e?.hazirlikDk ?? null), nasil: 'son ayar olayından başlatmaya', ton: 'soluk' },
    { ad: 'Brüt birim', plan: '—', kart: birimDk(k?.brutBirimDk ?? null), emir: birimDk(e?.brutBirimDk ?? null), nasil: 'başlatmadan bitişe ÷ (sağlam + hurda)', ton: 'soluk' },
    {
      ad: 'Net birim (cycle)', plan: birimDk(plan), kart: birimDk(k?.netBirimDk ?? null), emir: birimDk(e?.netBirimDk ?? null),
      nasil: 'brüt süreden duraklama ve duruş düşülür', ton: k?.netBirimDk != null && plan !== null && k.netBirimDk > plan ? 'bekle' : 'soluk',
    },
    { ad: 'Tekli ortalama', plan: birimDk(plan), kart: birimDk(k?.tekliOrtalamaDk ?? null), emir: birimDk(e?.tekliOrtalamaDk ?? null), nasil: 'art arda 1\'er girilen sayımlar arası', ton: 'soluk' },
    {
      ad: 'Sağlam / hurda', plan: giren === null ? '—' : `${String(giren)} / 0`, kart: k ? `${String(k.saglam)} / ${String(k.hurda)}` : '—',
      emir: e ? `${String(e.saglam)} / ${String(e.hurda)}` : '—', nasil: 'sayımlar; kart sütunu kartın sayımlarıdır', ton: 'soluk',
    },
  ];
}

export interface TekliCubuk { sira: number; dk: number; pay: number; ton: Ton }
export function tekliCubuklar(d: KartAkisiCevabi, a: AdimOlcusu): { cubuklar: TekliCubuk[]; planPay: number | null } {
  const l = sureOzetiBul(d, a.isEmriId)?.kart.tekliAraliklarDk ?? [];
  const plan = a.standartBirimDk;
  const ust = Math.max(1, ...l, plan ?? 0) * 1.1;
  return {
    cubuklar: l.map((dk, i) => ({
      sira: i + 1, dk, pay: dk / ust, ton: plan === null ? 'run' : dk > plan * 1.25 ? 'stop' : dk > plan ? 'bekle' : 'run',
    })),
    planPay: plan === null ? null : plan / ust,
  };
}

export interface AdimSatiri {
  anahtar: string; adim: string; yer: string; giren: string; cikan: string; bekleme: string; ayar: string; cycle: string; sure: string;
  sapma: string; sapmaTon: Ton; durum: AsamaDurumu;
}
const kalemMetni = (l: readonly Kalem[]): string => (l.length === 0 ? '—' : l.map((k) => `${k.miktar} ${k.ad}`.trim()).join(', '));
// Adımlar tablosu: lot, her adım (önündeki stok bekleme "önce bekleme" sütununda) ve kartın şu an bulunduğu stok aşaması.
export function adimSatirlari(liste: readonly Asama[], d: KartAkisiCevabi): AdimSatiri[] {
  const satirlar: AdimSatiri[] = [];
  let bekleme: number | null = null;
  for (const s of liste) {
    if (s.tur === 'lot') {
      satirlar.push({
        anahtar: s.anahtar, adim: 'Lot', yer: d.kart.lotNo ?? '—', giren: kalemMetni(s.giren), cikan: kalemMetni(s.cikan),
        bekleme: sureMetni(s.sureDk), ayar: '', cycle: '', sure: sureMetni(s.sureDk), sapma: 'lead dışı', sapmaTon: 'soluk', durum: s.durum,
      });
    } else if (s.tur === 'stok') {
      if (s.durum === 'simdi') {
        satirlar.push({
          anahtar: s.anahtar, adim: s.yoldaDk > 0 && d.konum.durum === 'yolda' ? 'Yolda' : 'Bekliyor', yer: s.baslik, giren: kalemMetni(s.giren), cikan: kalemMetni(s.cikan),
          bekleme: sureMetni(s.sureDk), ayar: '', cycle: '', sure: 'sürüyor', sapma: '', sapmaTon: 'soluk', durum: s.durum,
        });
      } else bekleme = (bekleme ?? 0) + (s.sureDk ?? 0);
    } else if (s.tur === 'op' && s.adim !== null) {
      const a = s.adim;
      const so = sureOzetiBul(d, a.isEmriId);
      const gercek = so?.kart.netBirimDk ?? null;
      const sapma = s.planli ? null : yuzdeFark(gercek, a.standartBirimDk);
      satirlar.push({
        anahtar: s.anahtar, adim: adimAdi(a), yer: a.fason ? 'Fason' : a.istasyon ?? '—', giren: kalemMetni(s.giren),
        cikan: s.planli ? `plan ${s.cikan[0]?.miktar ?? '—'}` : kalemMetni(s.cikan),
        bekleme: s.planli ? '' : sureMetni(bekleme), ayar: `${ondalik(a.standartHazirlikDk, 0)} / ${s.planli ? '—' : ondalik(so?.kart.hazirlikDk ?? a.hazirlikDk, 0)} dk`,
        cycle: `${ondalik(a.standartBirimDk)} / ${s.planli ? '—' : ondalik(gercek)} dk`,
        sure: s.planli ? `plan ${sureMetni(s.sureDk)}` : `${sureMetni(s.sureDk)}${s.acik ? ' (sürüyor)' : ''}`,
        sapma: farkMetni(sapma), sapmaTon: sapma !== null && sapma > 0 ? 'bekle' : 'soluk', durum: s.durum,
      });
      bekleme = null;
    }
  }
  return satirlar;
}

export interface AnSatiri {
  no: number; zaman: string; fark: string; farkTon: Ton; durum: string; durumTon: Ton; ad: string; yer: string; giren: string; cikan: string; kim: string;
}
// Anlar tablosu: kartın görünen anları ve kart sürüyorsa "şimdi"; sayım anları adımın bitiş ve duruş satırına toplanır.
export function anSatirlari(d: KartAkisiCevabi, b: KartBaglami): AnSatiri[] {
  const malzeme = d.kart.malzeme ?? 'malzeme';
  const urun = b.urun ?? 'ürün';
  const gorunur = d.anlar.filter((a) => !sayimAni(a));
  const adim = new Map(kartAdimlari(d).map((a) => [a.isEmriId, a]));
  const ilkOp = d.adimlar[0]?.isEmriId ?? null;
  const satirlar: AnSatiri[] = [];
  let onceki: number | null = null;
  const ekle = (zaman: number, s: Omit<AnSatiri, 'no' | 'zaman' | 'fark' | 'farkTon'>, simdiMi = false) => {
    const fark = onceki === null ? null : dakika(zaman - onceki);
    satirlar.push({
      no: satirlar.length + 1, zaman: simdiMi ? `şimdi ${saat(zaman)}` : kisaZaman(zaman), fark: fark === null ? '—' : sureMetni(fark),
      farkTon: fark !== null && fark >= 60 ? 'bekle' : 'soluk', ...s,
    });
    onceki = zaman;
  };
  for (const a of gorunur) {
    const op = a.isEmriId === null ? undefined : adim.get(a.isEmriId);
    const durum = AN_SONRASI[a.tur];
    let giren = '', cikan = '';
    if (a.tur === 'kart_acildi') cikan = `${miktar(d.kart.verilen)} ${d.kart.birim ?? ''} karta`.replace(/ {2}/, ' ');
    if (a.tur === 'teslim_alindi') giren = miktar(a.miktar);
    if (a.tur === 'teslim_gonderildi') cikan = miktar(a.miktar);
    if (a.tur === 'bitir' && op) {
      if (op.isEmriId === ilkOp && d.kart.sarf !== null) giren = `${miktar(d.kart.sarf)} ${malzeme} sarf`;
      cikan = `${String(op.saglamAdet)} ${urun}${op.hurdaAdet > 0 ? `, ${String(op.hurdaAdet)} hurda` : ''}`;
    }
    if ((a.tur === 'durdur' || a.tur === 'duraklat') && op) {
      cikan = `${String(d.anlar.filter((x) => x.isEmriId === op.isEmriId && x.tur === 'saglam' && x.zaman <= a.zaman).reduce((t, x) => t + Number(x.miktar ?? 0), 0))} sağlam`;
    }
    if ((a.tur === 'fason_gidis' || a.tur === 'fason_donus') && a.miktar !== null) (a.tur === 'fason_gidis' ? (cikan = miktar(a.miktar)) : (giren = miktar(a.miktar)));
    ekle(an(a.zaman), {
      durum: durum.metin, durumTon: durum.ton,
      ad: `${op ? `${opKodu(op.opNo)} ` : ''}${AN[a.tur].ad}${a.neden !== null ? ` · ${a.neden}` : ''}`.replace(/^(OP\d+) (.)/, (_m, o: string, h: string) => `${o} ${h.toLocaleLowerCase('tr-TR')}`),
      yer: a.yer ?? '—', giren, cikan, kim: a.kim ?? '—',
    });
  }
  const k = d.konum;
  if (k.durum !== 'kapandi' && k.durum !== 'sevk_edildi') {
    const yer = KONUM[k.durum];
    ekle(an(d.simdi), { durum: yer.metin.split(' · ').at(-1)!.replace(/^./, (h) => h.toLocaleUpperCase('tr-TR')), durumTon: yer.ton, ad: yer.metin, yer: k.yer ?? '—', giren: '', cikan: '', kim: '—' }, true);
  }
  return satirlar;
}

// Kart listesindeki küçük rota: lot, her adım; geçti dolu, şimdi halkalı, sırada boş. Kart iki adım arasındaysa (yolda ya da
// bekliyor) halka sıradaki ilk adımdadır.
export type RotaNoktasi = 'gecti' | 'simdi' | 'sirada';
export function miniRota(o: KartOzetleriCevabi['kartlar'][number]): RotaNoktasi[] {
  const adimlar: RotaNoktasi[] = o.rota.map((r) => r.durum);
  const kapali = o.konum.durum === 'kapandi' || o.konum.durum === 'sevk_edildi';
  const lot: RotaNoktasi = o.konum.durum === 'depoda' && adimlar.every((x) => x === 'sirada') ? 'simdi' : 'gecti';
  if (!kapali && lot !== 'simdi' && !adimlar.includes('simdi')) {
    const i = adimlar.indexOf('sirada');
    if (i >= 0) adimlar[i] = 'simdi';
  }
  return [lot, ...adimlar];
}

export function sonAnMetni(o: KartOzetleriCevabi['kartlar'][number]): string {
  const a = o.sonAn;
  if (a === null) return 'Kayıt yok';
  const u = teslimUclari(a.yer);
  if (a.tur === 'teslim_gonderildi' && u) return `${u.kaynak} → ${u.hedef} yolunda`;
  if (a.tur === 'teslim_alindi' && u) return `${u.hedef} önünde bekliyor`;
  return `${a.opNo === null ? '' : `${opKodu(a.opNo)} `}${AN[a.tur].ad.toLocaleLowerCase('tr-TR')}${a.yer && a.opNo !== null ? ` · ${a.yer}` : ''}`
    .replace(/^./, (h) => h.toLocaleUpperCase('tr-TR'));
}
