// 3574-1: sipariş satırları. Sipariş verilirken her kalem bir ya da birden çok firmaya pay olarak gider; firma, miktar, birim fiyat
// ve satır termini siparişte girilir. Saf kurallar: talebin yeni hâlini kurar, onay gerekip gerekmediğini söyler (S1 a).
import type { SiparisVerYazimi, Talep, TalepYazimi } from '#paylasilan/sozlesme/satin-alma.ts';
import { kararOnayliMi } from './kurallar.ts';

export const SIPARIS_ILETILERI = {
  // SAT-3574-1 K1
  onaysiz: 'Sipariş yalnız onaylanmış kararla, onaydaki talepte verilir.',
  bekleyenVar: 'Bu talepte onay bekleyen bir sipariş var; önce onaylanmalı ya da reddedilmeli.',
  // K2
  kapsamDisi: (ad: string) => `${ad}: kalem onaylı kararın kapsamında değil.`,
  paysiz: (adlar: readonly string[]) => `Her kalemin en az bir payı olur: ${adlar.join(', ')}.`,
  // K3
  ciftPay: (ad: string) => `${ad}: aynı firmaya iki pay yazılmaz; miktarı tek payda toplayın.`,
  // K4
  siparissizPay: 'Payın siparişi (firma başlığı) yok.',
  bossiparis: 'Payı olmayan firma başlığı gönderilmez.',
  ciftSiparis: 'Aynı sipariş iki kez gönderilmez.',
  // K5
  yeniFirmaGerekir: 'Teklifi olmayan firma için firma ve para birimi seçilir.',
  teklifliFirma: (ad: string) => `${ad} firmasının bu talepte teklifi var; o satırdan seçin.`,
  ciftFirma: 'Aynı firma iki ayrı başlıkta yazılmaz.',
  // K6 (Risk R1): bağlı kalem bölünmez; bağı yeni paya taşımak ayrı karardır.
  bagliBolunmez: (ad: string) => `${ad}: kaleme bağlı kayıt (fason adımı, emir, satış siparişi, kabul sınırı, birleşen talep ya da Logo'ya gitmiş talep satırı) var; kalem firmalara bölünmez.`,
  ozelFiyatBolunmez: (ad: string) => `${ad}: kademeli fiyat, en az miktar ya da alternatif teklif edilen kalem firmalara bölünmez.`,
  // K7
  kademeFiyati: (ad: string) => `${ad}: kademeli fiyatlı kalemin birim fiyatı siparişte değişmez.`,
  paraBirimi: (pb: string) => `${pb} kararda sabitlenmedi; yeni firmanın para birimi TRY ya da kararda kullanılan bir para birimi olur.`,
  gerekceZorunlu: 'Onaya giden siparişte gerekçe zorunlu.',
  oneriYok: 'Onay bekleyen sipariş yok.',
  kalemArtisiOnayIster: 'Siparişteki miktarı artırmak ya da birimi değiştirmek onay yetkisi ister; miktarı düşürmek satın almanındır.',
  oneriTutarDegisti: 'Talep öneriden sonra değişti; tutar öneridekini aşıyor. Öneriyi reddedip yeniden gönderin.',
} as const;

export interface SiparisDuzeni {
  yazim: Pick<TalepYazimi, 'kalemler' | 'teklifler' | 'karar' | 'durum'>;
  // Pay başına satırın termini ve notu (sipariş satırı yazıldıktan sonra).
  satirBilgileri: { teklifId: string; kalemId: string; beklenenTeslim: string | null; notlar: string }[];
  // Siparişte açılan firmaların kaydı ('siparis' kaynaklı).
  yeniTeklifler: string[];
  // Bölünen kalemin yeni payları: kaynağın kalem başına alanları taşınır.
  kalemKopyalari: { kaynak: string; yeni: string }[];
  bolunenler: string[];
  // Onaylı kararda olmayan siparişlerin firma adları (S1 a).
  yeniFirmalar: string[];
}

export interface SiparisOrtami {
  yeniKimlik: () => string;
  bugun: string;
  firmaAdi: (firmaId: number) => string | null;
  // Bağlı kalemler (R1): fason, emir, satış siparişi, kabul sınırı, birleşen talep kaynağı, Logo'ya gitmiş talep satırı (Risk L1).
  bagliKalemler: ReadonlySet<string>;
}

type Govde = Omit<SiparisVerYazimi, 'surum'>;
type Fiyat = TalepYazimi['teklifler'][number]['fiyatlar'][number];

const ayniFiyat = (a: string, b: string): boolean => Math.abs(Number(a) - Number(b)) < 0.00005;

// Onaylı kararın kapsadığı kalemler ve teklifleri: tek kararda teklifin fiyat verdiği miktarlı kalemler, bölünmüş kararda dağılım.
export function kararKapsami(t: Pick<Talep, 'karar' | 'kalemler' | 'teklifler'>): Map<string, string> {
  const k = t.karar;
  if (k === null) return new Map();
  if (k.mod === 'bolunmus') return new Map(k.bolunme.map((b) => [b.kalemId, b.teklifId]));
  const q = t.teklifler.find((x) => x.id === k.teklifId);
  const miktarli = new Set(t.kalemler.filter((x) => x.miktar !== null).map((x) => x.id));
  return new Map((q?.fiyatlar ?? []).filter((f) => miktarli.has(f.kalemId)).map((f) => [f.kalemId, q!.id]));
}

// SAT-3574-1: talebin sipariş verilmiş hâli. Kural ihlalinde ileti döner, hiçbir şey kısmen kurulmaz.
export function siparisDuzeniKur(eski: Talep, g: Govde, o: SiparisOrtami): SiparisDuzeni | string {
  if (eski.durum !== 'onayda' || eski.karar === null || !kararOnayliMi(eski.onaylar)) return SIPARIS_ILETILERI.onaysiz;
  const kapsam = kararKapsami(eski);
  const kalemAdi = (id: string) => eski.kalemler.find((x) => x.id === id)?.ad ?? id;
  const teklifler = new Map(eski.teklifler.map((q) => [q.id, q]));
  // K4: başlıklar tekil, her payın başlığı var, her başlığın payı var.
  const basliklar = new Map<string, Govde['siparisler'][number]>();
  for (const s of g.siparisler) {
    if (basliklar.has(s.teklifId)) return SIPARIS_ILETILERI.ciftSiparis;
    basliklar.set(s.teklifId, s);
  }
  for (const p of g.paylar) if (!basliklar.has(p.teklifId)) return SIPARIS_ILETILERI.siparissizPay;
  for (const id of basliklar.keys()) if (!g.paylar.some((p) => p.teklifId === id)) return SIPARIS_ILETILERI.bossiparis;
  // K5: var olan teklifin firması tekliften; yeni başlık firma ister, o firmanın talepte teklifi olmaz, aynı firma iki başlıkta olmaz.
  const firmalar = new Set<number>();
  for (const s of g.siparisler) {
    const q = teklifler.get(s.teklifId);
    if (q !== undefined) {
      if (s.yeniFirma !== null) return SIPARIS_ILETILERI.yeniFirmaGerekir;
      if (q.firmaId !== null) firmalar.add(q.firmaId);
      continue;
    }
    if (s.yeniFirma === null) return SIPARIS_ILETILERI.yeniFirmaGerekir;
    const mevcut = eski.teklifler.find((x) => x.firmaId === s.yeniFirma!.firmaId);
    if (mevcut !== undefined) return SIPARIS_ILETILERI.teklifliFirma(mevcut.tedarikciAdi);
    if (firmalar.has(s.yeniFirma.firmaId)) return SIPARIS_ILETILERI.ciftFirma;
    firmalar.add(s.yeniFirma.firmaId);
    const pb = s.yeniFirma.paraBirimi;
    if (pb !== 'TRY' && !eski.karar.sabitKurlar.some((x) => x.paraBirimi === pb)) return SIPARIS_ILETILERI.paraBirimi(pb);
  }
  // K2, K3: paylar kapsamdaki kalemlere; her kapsam kalemi en az bir pay; kalem-firma çifti tekil.
  const paylar = new Map<string, Govde['paylar']>();
  for (const p of g.paylar) {
    if (!kapsam.has(p.kalemId)) return SIPARIS_ILETILERI.kapsamDisi(kalemAdi(p.kalemId));
    const l = paylar.get(p.kalemId) ?? [];
    if (l.some((x) => x.teklifId === p.teklifId)) return SIPARIS_ILETILERI.ciftPay(kalemAdi(p.kalemId));
    l.push(p);
    paylar.set(p.kalemId, l);
  }
  const paysiz = [...kapsam.keys()].filter((id) => !paylar.has(id));
  if (paysiz.length > 0) return SIPARIS_ILETILERI.paysiz(paysiz.map(kalemAdi));
  // K6: bölünen kalemde bağ ya da kaleme özel teklif alanı (kademe, en az miktar, alternatif) yok.
  for (const [kalemId, l] of paylar) {
    if (l.length < 2) continue;
    if (o.bagliKalemler.has(kalemId)) return SIPARIS_ILETILERI.bagliBolunmez(kalemAdi(kalemId));
    const ozel = eski.teklifler.some((q) => q.fiyatlar.some((f) => f.kalemId === kalemId
      && ((f.basamaklar ?? []).length > 0 || f.enAzMiktar != null || f.alternatif != null)));
    if (ozel) return SIPARIS_ILETILERI.ozelFiyatBolunmez(kalemAdi(kalemId));
  }
  // K7: kademeli fiyatın tabanı siparişte değişmez (basamak kilidiyle aynı kural).
  for (const p of g.paylar) {
    const f = teklifler.get(p.teklifId)?.fiyatlar.find((x) => x.kalemId === p.kalemId);
    if (f !== undefined && (f.basamaklar ?? []).length > 0 && !ayniFiyat(f.birimFiyat, p.birimFiyat)) return SIPARIS_ILETILERI.kademeFiyati(kalemAdi(p.kalemId));
  }

  // Kalemler: kalemin ilk payı kalemin kimliğini korur (bağlar, Logo talep satırı, emir); sonraki paylar yeni kimlikli kopyadır.
  const kalemler: TalepYazimi['kalemler'] = [];
  const atama: { kalemId: string; teklifId: string; pay: Govde['paylar'][number] }[] = [];
  const kalemKopyalari: SiparisDuzeni['kalemKopyalari'] = [];
  const bolunenler: string[] = [];
  const firmaAdi = (teklifId: string): string => {
    const q = teklifler.get(teklifId);
    if (q !== undefined) return q.tedarikciAdi;
    const y = basliklar.get(teklifId)?.yeniFirma;
    return (y ? o.firmaAdi(y.firmaId) : null) ?? '';
  };
  const kartBagi = new Map(g.kartBaglari.map((b) => [b.kalemId, b.katalogId]));
  for (const x of eski.kalemler) {
    const l = paylar.get(x.id);
    const katalogId = x.katalogId ?? kartBagi.get(x.id) ?? null;
    if (l === undefined) { kalemler.push({ id: x.id, katalogId, ad: x.ad, ozellik: x.ozellik, miktar: x.miktar, birim: x.birim, kategori: x.kategori }); continue; }
    l.forEach((p, i) => {
      const id = i === 0 ? x.id : o.yeniKimlik();
      kalemler.push({ id, katalogId, ad: x.ad, ozellik: x.ozellik, miktar: p.miktar, birim: x.birim, kategori: x.kategori });
      if (i > 0) kalemKopyalari.push({ kaynak: x.id, yeni: id });
      atama.push({ kalemId: id, teklifId: p.teklifId, pay: p });
    });
    if (l.length > 1) bolunenler.push(`${x.ad} ${x.miktar ?? ''} ${x.birim} → ${l.map((p) => `${p.miktar} ${firmaAdi(p.teklifId)}`).join(' + ')}`);
  }

  // Teklifler: bölünen kalemin fiyatı her teklifte yeni paya da yazılır (karşılaştırma değişmez); payın firmasında fiyat paydandır.
  const yeniler = new Map(kalemKopyalari.map((c) => [c.yeni, c.kaynak]));
  const fiyatKopyala = (fiyatlar: readonly Fiyat[]): Fiyat[] => [
    ...fiyatlar,
    ...[...yeniler].flatMap(([yeni, kaynak]) => fiyatlar.filter((f) => f.kalemId === kaynak).map((f) => ({ ...f, kalemId: yeni }))),
  ];
  const yeniTeklifler: string[] = [];
  const tekliflerYeni: TalepYazimi['teklifler'] = eski.teklifler.map((q) => ({
    ...q, iskontoYuzdesi: q.iskontoYuzdesi ?? '0', nakliye: q.nakliye ?? '0', digerMasraf: q.digerMasraf ?? '0', fiyatlar: fiyatKopyala(q.fiyatlar),
  }));
  for (const s of g.siparisler) {
    if (s.yeniFirma === null) continue;
    yeniTeklifler.push(s.teklifId);
    tekliflerYeni.push({
      id: s.teklifId, firmaId: s.yeniFirma.firmaId, tedarikciAdi: (o.firmaAdi(s.yeniFirma.firmaId) ?? '').slice(0, 160), teklifTarihi: o.bugun, gecerlilik: null,
      paraBirimi: s.yeniFirma.paraBirimi, kur: null, iskontoYuzdesi: '0', nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true,
      terminGun: s.yeniFirma.terminGun, vadeGun: s.yeniFirma.vadeGun, avansYuzdesi: '0', odemeYontemi: null, garantiAy: null, teknikUygun: true,
      notlar: '', ilkToplam: null, revizyon: 0, fiyatlar: [],
    });
  }
  for (const a of atama) {
    const q = tekliflerYeni.find((x) => x.id === a.teklifId)!;
    const i = q.fiyatlar.findIndex((f) => f.kalemId === a.kalemId);
    if (i < 0) q.fiyatlar = [...q.fiyatlar, { kalemId: a.kalemId, birimFiyat: a.pay.birimFiyat }];
    else if (!ayniFiyat(q.fiyatlar[i]!.birimFiyat, a.pay.birimFiyat)) q.fiyatlar = q.fiyatlar.map((f, j) => (j === i ? { ...f, birimFiyat: a.pay.birimFiyat } : f));
  }

  // Karar: tek firma ve tek kararın kendi teklifi kalırsa tek karar; değilse kalem bazlı dağılım.
  const kullanilan = [...new Set(atama.map((a) => a.teklifId))];
  const k = eski.karar;
  const tekKalir = k.mod === 'tek' && kullanilan.length === 1 && kullanilan[0] === k.teklifId;
  const karar: NonNullable<TalepYazimi['karar']> = {
    mod: tekKalir ? 'tek' : 'bolunmus', teklifId: tekKalir ? k.teklifId : null,
    bolunme: tekKalir ? [] : atama.map((a) => ({ kalemId: a.kalemId, teklifId: a.teklifId })),
    gerekce: k.gerekce, kararVerenKisiId: k.kararVerenKisiId, kararTarihi: k.kararTarihi, ogrenilenler: k.ogrenilenler,
    sabitKurlar: k.sabitKurlar, kurKilidi: k.kurKilidi ?? null,
    siparisler: g.siparisler.map((s) => ({
      teklifId: s.teklifId, siparisNo: s.siparisNo, siparisTarihi: s.siparisTarihi, beklenenTeslim: s.beklenenTeslim, vadeBaslangici: s.vadeBaslangici,
      teslimYeri: s.teslimYeri, tedarikciNotu: s.tedarikciNotu, icNot: s.icNot,
    })),
  };
  const onayli = new Set(kapsam.values());
  const yeniFirmalar = kullanilan.filter((id) => !onayli.has(id)).map(firmaAdi);
  return {
    yazim: { kalemler, teklifler: tekliflerYeni, karar, durum: 'siparis_verildi' },
    satirBilgileri: atama.map((a) => ({ teklifId: a.teklifId, kalemId: a.kalemId, beklenenTeslim: a.pay.beklenenTeslim, notlar: a.pay.notlar })),
    yeniTeklifler, kalemKopyalari, bolunenler, yeniFirmalar,
  };
}

// S1 a (22.11): onaylı tutarı aşan ya da onaylı kararda olmayan firmaya giden sipariş onaya düşer; karşılaştırma siparişin toplam
// tutarıyladır (TL, KDV hariç). Tutar hesaplanamıyorsa onaya düşer (sessizce onaysız geçmez).
export function siparisOnayiGerekirMi(x: { onayliTutar: number | null; yeniTutar: number | null; yeniFirmalar: readonly string[] }): boolean {
  if (x.yeniFirmalar.length > 0) return true;
  if (x.onayliTutar === null || x.yeniTutar === null) return true;
  return x.yeniTutar > x.onayliTutar + 0.005;
}

// S2 a: siparişteki kalemin miktarını düşüren (birim aynı) değişiklik onaysız sınıftadır.
export function kalemDegisikligiOnaysizMi(kalem: { miktar: string | null; birim: string }, g: { miktar: string; birim: string }): boolean {
  return kalem.birim === g.birim && kalem.miktar !== null && Number(g.miktar) <= Number(kalem.miktar);
}

// Hareket metni: sipariş verildi; bölünen kalemler ve onaya düşen siparişin onayı (kim önerdi) yazılır.
export function siparisHareketi(x: { bolunenler: readonly string[]; onay?: { oneren: string; onayliTutar: string | null; yeniTutar: string | null } }): string {
  const bol = x.bolunenler.length > 0 ? `; bölünen: ${x.bolunenler.join('; ')}` : '';
  const onay = x.onay === undefined ? '' : `; onaya düşen sipariş onaylandı (öneren ${x.onay.oneren}, tutar ${x.onay.onayliTutar ?? '-'} → ${x.onay.yeniTutar ?? '-'} TL)`;
  return `Sipariş verildi${bol}${onay}`.slice(0, 1000);
}
export function oneriHareketi(x: { gerekce: string; onayliTutar: string | null; yeniTutar: string | null; yeniFirmalar: readonly string[] }): string {
  const firma = x.yeniFirmalar.length > 0 ? `; yeni firma: ${x.yeniFirmalar.join(', ')}` : '';
  return `Sipariş onaya gönderildi: ${x.gerekce}; tutar ${x.onayliTutar ?? '-'} → ${x.yeniTutar ?? '-'} TL${firma}`.slice(0, 1000);
}
