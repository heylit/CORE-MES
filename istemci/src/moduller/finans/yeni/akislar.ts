import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { firmaEtiketi, KAT_KOD, sayi, tlKuru, yuvarla, type Belge, type Hesap, type HazirVeri, type SunucuCeki } from './donustur.ts';
import { addDays, CATS, type FinansMotoru, type Islem } from './motor.ts';

// "Kayıt gir": olay seçici ve her olayın komutu (prototipte EVENTS, akisGonder, ekFormGonder). Burası saftır: form
// değerleri ve sunucu verisinden gönderilecek komutu kurar; göndermez. Kural sunucudadır, burada yalnız ön denetim var.

export type OlayTuru =
  | 'satis' | 'tahsilat' | 'cekal' | 'iadesat'
  | 'alis' | 'odeme' | 'sabit' | 'cekver' | 'iadealis'
  | 'cekdurum' | 'banka'
  | 'virman' | 'mahsup' | 'avans';

export interface Olay { tur: OlayTuru; baslik: string; aciklama: string; simge: SimgeAdi }
export interface OlayGrubu { baslik: string; olaylar: Olay[] }

// Sıra prototiptekidir; iade olayları kendi gruplarının sonunda (260 a), aktarım ve mahsup en sonda.
// Ekranda çağrılmayan dört komut (virman, mahsup ve dağıtım iptali, KDV oranı kapatma) burada da yoktur (210.2).
export const OLAY_GRUPLARI: readonly OlayGrubu[] = [
  { baslik: 'Satış ve tahsilat', olaylar: [
    { tur: 'satis', baslik: 'Satış yaptım', aciklama: 'Fatura kestim. Para sonra gelecek, peşin geldi ya da çek aldım.', simge: 'tag' },
    { tur: 'tahsilat', baslik: 'Müşteriden para geldi', aciklama: 'Havale, EFT, nakit veya kart ile tahsilat. Hangi faturayı kapattığını seçersiniz.', simge: 'download' },
    { tur: 'cekal', baslik: 'Müşteriden çek / senet aldım', aciklama: 'Hangi faturalara karşılık aldığınızı seçin; çek portföye eklenir.', simge: 'layers' },
    { tur: 'iadesat', baslik: 'Müşteri iade etti', aciklama: 'Satış faturasının iadesi; tutarı siz girersiniz, KDV ve kur asıl faturadan gelir.', simge: 'rotate' },
  ] },
  { baslik: 'Alış ve ödeme', olaylar: [
    { tur: 'alis', baslik: 'Alış yaptım / fatura geldi', aciklama: 'Mal, hammadde, kira, enerji, kargo, reklam gibi tedarikçi faturaları.', simge: 'cart' },
    { tur: 'odeme', baslik: 'Tedarikçiye ödeme yaptım', aciklama: 'Gelen faturaları kapatın; kısmi ödeme de olur.', simge: 'upload' },
    { tur: 'sabit', baslik: 'Maaş, SGK, vergi, kredi ödedim', aciklama: 'Faturasız ödemeler ve bu ayın düzenli ödemeleri tek tıkla.', simge: 'users' },
    { tur: 'cekver', baslik: 'Tedarikçiye çek / senet verdim', aciklama: 'Verilen çek, vadesinde nakit çıkışı olarak planlanır.', simge: 'file' },
    { tur: 'iadealis', baslik: 'Tedarikçiye iade ettim', aciklama: 'Alış faturasının iadesi; tutarı siz girersiniz, KDV ve kur asıl faturadan gelir.', simge: 'rotate' },
  ] },
  { baslik: 'Çek ve banka', olaylar: [
    { tur: 'cekdurum', baslik: 'Çekin durumu değişti', aciklama: 'Bankaya verdim, tahsil edildi, ciro ettim, karşılıksız çıktı.', simge: 'clipboard-check' },
    { tur: 'banka', baslik: 'Banka / kasa bakiyemi düzelt', aciklama: 'Sistemdeki nakit gerçek bakiyeden farklıysa eşitleyin.', simge: 'building' },
  ] },
  { baslik: 'Aktarım ve mahsup', olaylar: [
    { tur: 'virman', baslik: 'Hesaplar arası para aktardım', aciklama: 'Kasadan bankaya, bankadan kredi kartı borcuna; kâr/zararı etkilemez.', simge: 'route' },
    { tur: 'mahsup', baslik: 'Alacak ve borcu mahsup ettim', aciklama: 'Aynı firmanın satış ve alış faturası parasız birbirini kapatır.', simge: 'sort' },
    { tur: 'avans', baslik: 'Avansı faturaya mahsup et', aciklama: 'Faturaya dağıtılmamış tahsilat ya da ödemeyi sonradan bir faturaya düşer.', simge: 'check' },
  ] },
];
export const OLAYLAR: Record<OlayTuru, Olay> = Object.fromEntries(OLAY_GRUPLARI.flatMap((g) => g.olaylar.map((o) => [o.tur, o]))) as Record<OlayTuru, Olay>;
export const olayTarafi = (tur: OlayTuru): 'gelir' | 'gider' => (['satis', 'tahsilat', 'cekal', 'iadesat'].includes(tur) ? 'gelir' : 'gider');

// Gönderilecek komut: uç (sözleşmedeki yol), yol parametresi, gövde. `tekrar` tekrar korumalı uçtur (istek kimliğiyle gider).
export interface Komut {
  uc: string;
  parametre?: { id: number };
  govde: unknown;
  tekrar: boolean;
  basari: string;
}
export type KomutSonucu = { komutlar: Komut[] } | { hata: string };

export const NAKIT_YONTEMI: Record<Hesap['tur'], 'nakit' | 'banka' | 'kredi_karti'> = { kasa: 'nakit', banka: 'banka', kredi_karti: 'kredi_karti' };
export type OdemeSekli = 'vadeli' | 'pesin' | 'cek' | 'banka' | 'senet';

// Formun bütün alanları metindir (girdi değeri); komut kurulurken sayıya çevrilir.
export interface AkisDegerleri {
  party: string;
  cat: string;
  date: string;
  desc: string;
  amount: string;
  kdv: string;
  incl: boolean;
  method: OdemeSekli;
  due: string;
  cbank: string;
  cno: string;
  cdue: string;
  ckind: 'Çek' | 'Senet';
  pb: string;
  pbKur: string;
  tevk: string;
  hesap: string;
  siparis: string;
  sevk: string;
  capraz: string;
  secili: string[];
  principal: string;
  interest: string;
  gercek: string;
  kaynak: string;
  hedef: string;
  aciklama: string;
  satis: string;
  alis: string;
  satisTutari: string;
  alisTutari: string;
  odeme: string;
  belge: string;
  asil: string;
}

export const OLAY_KATEGORILERI: Record<'satis' | 'alis' | 'sabit', readonly (readonly [string, string])[]> = {
  satis: [['Ürün satışı', 'Ürün'], ['Hizmet geliri', 'Hizmet'], ['Diğer gelir', 'Diğer'], ['Kur farkı geliri', 'Kur farkı']],
  alis: [['Mal / hammadde alımı', 'Mal / hammadde'], ['Kira', 'Kira'], ['Enerji & faturalar', 'Elektrik, su, gaz, telefon'], ['Lojistik', 'Kargo / nakliye'],
    ['Pazarlama', 'Reklam / pazarlama'], ['Diğer gider', 'Diğer'], ['Kur farkı gideri', 'Kur farkı']],
  // Tam kipte "Diğer gider" bu listeden çıkar: faturasız ödeme kategorileri sunucuda sınırlıdır.
  sabit: [['Personel (net maaş)', 'Maaş'], ['SGK & stopaj', 'SGK / stopaj'], ['KDV / vergi ödemesi', 'KDV / vergi'], ['kredi', 'Kredi taksiti']],
};

export function bosDegerler(tur: OlayTuru, bugun: string): AkisDegerleri {
  const kat = tur === 'satis' ? OLAY_KATEGORILERI.satis : tur === 'alis' ? OLAY_KATEGORILERI.alis : tur === 'sabit' ? OLAY_KATEGORILERI.sabit : null;
  return {
    party: '', cat: kat?.[0]?.[0] ?? '', date: bugun, desc: '', amount: '', kdv: '20', incl: false,
    method: tur === 'satis' || tur === 'alis' ? 'vadeli' : tur === 'cekal' || tur === 'cekver' ? 'cek' : 'banka',
    due: addDays(bugun, 30), cbank: '', cno: '', cdue: addDays(bugun, 30), ckind: 'Çek', pb: 'TRY', pbKur: '', tevk: '', hesap: '', siparis: '', sevk: '',
    capraz: '', secili: [], principal: '', interest: '', gercek: '', kaynak: '', hedef: '', aciklama: '', satis: '', alis: '', satisTutari: '', alisTutari: '',
    odeme: '', belge: '', asil: '',
  };
}

/* ---------- Seçim yardımcıları ---------- */
export const aktifHesaplar = (V: HazirVeri, turler?: readonly Hesap['tur'][] | null): Hesap[] =>
  V.hesaplar.filter((h) => h.aktif && (!turler || turler.includes(h.tur)));
export const paraBirimleri = (V: HazirVeri): string[] => [...new Set(['TRY', 'EUR', 'USD', ...V.hesaplar.map((h) => h.paraBirimi), ...Object.keys(V.kurlar)])];
export const gecerliKdvOranlari = (V: HazirVeri, tarih: string): number[] =>
  [...new Set(V.kdvOranlari.filter((o) => o.gecerlilikBaslangic <= tarih && (!o.gecerlilikBitis || tarih < o.gecerlilikBitis)).map((o) => sayi(o.oran)))].sort((a, b) => b - a);
export const firmaEtiketleri = (V: HazirVeri, yon?: 'gelir' | 'gider'): string[] =>
  V.firmalar.filter((f) => f.aktif && (!yon || f.tur === 'ikisi' || f.tur === (yon === 'gelir' ? 'musteri' : 'tedarikci')))
    .map((f) => V.etiket.get(f.id)!).sort((a, b) => a.localeCompare(b, 'tr'));

export function firmaCoz(V: HazirVeri, etiket: string, yon?: 'gelir' | 'gider'): { id: number } | { hata: string } {
  const id = V.etiketten.get((etiket || '').trim());
  if (!id) return { hata: "Firmayı listeden seçin. Listede yoksa önce Firmalar'dan açın." };
  const f = V.firmaById.get(id)!;
  if (!f.aktif) return { hata: 'Bu firma pasif: yeni kayıt açılamaz.' };
  if (yon && f.tur !== 'ikisi' && f.tur !== (yon === 'gelir' ? 'musteri' : 'tedarikci')) return { hata: yon === 'gelir' ? 'Bu firma müşteri değil.' : 'Bu firma tedarikçi değil.' };
  return { id };
}
export const islemBelgesi = (V: HazirVeri, motor: FinansMotoru, txId: string): Belge | null => {
  const t = motor.durum.tx.find((x) => x.id === txId);
  return t && t._belgeId ? V.belgeById.get(t._belgeId) ?? null : null;
};
// Firmanın açık kalemleri, en yakın vadeden (kapatılacak fatura listesi).
export const acikKalemler = (motor: FinansMotoru, yon: 'gelir' | 'gider', party: string): Islem[] =>
  motor.openItems(yon).filter((t) => t.party === party).sort((a, b) => (a.due < b.due ? -1 : 1));

// Tutarı açık kalemlere dağıtır (en eski vadeden): kaç fatura tam, kaç kısmen kapanır, ne kadar avansa kalır.
export function planAlloc(motor: FinansMotoru, side: 'gelir' | 'gider', party: string, amount: number, selectedIds?: readonly string[] | null) {
  let items = acikKalemler(motor, side, party);
  if (selectedIds && selectedIds.length) items = items.filter((t) => selectedIds.includes(t.id));
  let rem = amount;
  const full: Islem[] = [], part: { t: Islem; paid: number }[] = [];
  for (const t of items) {
    if (rem <= 0.5) break;
    const g = t.amount * (1 + (t.kdv || 0) / 100);
    if (rem >= g - 0.5) { full.push(t); rem -= g; } else { part.push({ t, paid: rem }); rem = 0; }
  }
  return { full, part, left: Math.max(0, rem) };
}

// Ödemenin belgelere dağıtımı (sunucu satırları): kuruş tamsayısıyla; farklı para biriminde çapraz kur zorunlu.
export function dagitimPlani(V: HazirVeri, motor: FinansMotoru, side: 'gelir' | 'gider', firmaEt: string, tutar: number, seciliTxIdleri: readonly string[], odemePb: string, caprazKur: number):
  { satirlar: { belgeId: number; belgeTutari: number; caprazKur?: number }[] } | { hata: string } {
  const adaylar = seciliTxIdleri.length
    ? seciliTxIdleri.map((i) => islemBelgesi(V, motor, i))
    : V.belgeler.filter((b) => b.yon === side && b.durum === 'acik' && firmaEtiketi(V, b.firmaId) === firmaEt);
  const belgeler = adaylar
    .filter((b, i, a): b is Belge => !!b && sayi(b.kalan) > 0 && a.findIndex((x) => x && x.id === b.id) === i)
    .sort((a, b) => (a.vade < b.vade ? -1 : a.vade > b.vade ? 1 : a.id - b.id));
  const satirlar: { belgeId: number; belgeTutari: number; caprazKur?: number }[] = [];
  let kalan = Math.round(tutar * 100);
  for (const b of belgeler) {
    if (kalan <= 0) break;
    const ayni = b.paraBirimi === odemePb;
    if (!ayni && !(caprazKur > 0)) return { hata: `${b.paraBirimi} belge için çapraz kur girin.` };
    const ihtiyac = ayni ? Math.round(sayi(b.kalan) * 100) : Math.round(sayi(b.kalan) * caprazKur * 100);
    const odenen = Math.min(kalan, ihtiyac);
    const belgeTutari = ayni ? odenen / 100 : Math.floor(odenen / caprazKur) / 100;
    if (belgeTutari <= 0) continue;
    satirlar.push({ belgeId: b.id, belgeTutari, ...(ayni ? {} : { caprazKur }) });
    kalan -= ayni ? odenen : Math.round(belgeTutari * caprazKur * 100);
  }
  return { satirlar };
}

const kurDegeri = (d: AkisDegerleri): { pb: string; kur: number } => ({ pb: d.pb || 'TRY', kur: (d.pb || 'TRY') === 'TRY' ? 1 : sayi(d.pbKur) });
const tek = (k: Komut): KomutSonucu => ({ komutlar: [k] });
const hata = (m: string): KomutSonucu => ({ hata: m });
const fmtPb = (v: number, pb: string): string =>
  (pb === 'TRY' ? `${Math.round(v).toLocaleString('tr-TR')} ₺` : `${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${pb}`);

// Olayın komutu. Firma, hesap ve tutar ön denetimi prototiptekidir; asıl kural uçtadır.
export function akisKomutu(tur: OlayTuru, d: AkisDegerleri, V: HazirVeri, motor: FinansMotoru): KomutSonucu {
  const date = d.date || motor.bugun;
  const side = olayTarafi(tur);
  if (tur === 'satis' || tur === 'alis') {
    const fr = firmaCoz(V, d.party, side);
    if ('hata' in fr) return hata(fr.hata);
    const k = sayi(d.kdv), a = sayi(d.amount);
    if (!(a > 0)) return hata('Tutar girin.');
    const { pb, kur } = kurDegeri(d);
    if (!(kur > 0)) return hata('Kur girin.');
    const [tp, tpd] = (d.tevk || '').split('/').map(Number);
    const tutar = yuvarla(d.incl ? a / (1 + k / 100) : a);
    const govde: Record<string, unknown> = {
      yon: side, tur: 'fatura', kategori: KAT_KOD[d.cat], firmaId: fr.id, aciklama: d.desc.trim() || null, belgeTarihi: date,
      vade: d.method === 'vadeli' ? (d.due || date) : date, paraBirimi: pb, kur, tutar, kdvOrani: k, ...(tp ? { tevkifatPay: tp, tevkifatPayda: tpd } : {}),
    };
    if (tur === 'satis' && d.siparis) govde['siparisId'] = Number(d.siparis);
    if (tur === 'satis' && d.siparis && d.sevk) govde['sevkiyatIsiId'] = Number(d.sevk);
    if (d.method === 'pesin') {
      const h = V.hesapById.get(Number(d.hesap));
      if (!h) return hata('Hesap seçin.');
      govde['pesin'] = { yontem: NAKIT_YONTEMI[h.tur], hesapId: h.id, tarih: date };
    }
    if (d.method === 'cek') govde['cek'] = { tur: d.ckind === 'Senet' ? 'senet' : 'cek', banka: d.cbank || null, seriNo: d.cno || null, vade: d.cdue || addDays(date, 30) };
    return tek({ uc: 'POST /finans/belgeler/ekle', govde, tekrar: true, basari: `${side === 'gelir' ? 'Satış' : 'Alış'} kaydedildi.` });
  }
  if (tur === 'tahsilat' || tur === 'odeme' || tur === 'cekal' || tur === 'cekver') {
    const fr = firmaCoz(V, d.party, side);
    if ('hata' in fr) return hata(fr.hata);
    const cekli = tur === 'cekal' || tur === 'cekver' || d.method !== 'banka';
    let odemePb = 'TRY', h: Hesap | undefined;
    if (!cekli) {
      h = V.hesapById.get(Number(d.hesap));
      if (!h) return hata('Hesap seçin.');
      odemePb = h.paraBirimi;
    } else odemePb = d.pb || 'TRY';
    const kurOdeme = odemePb === 'TRY' ? 1 : (cekli ? kurDegeri(d).kur : tlKuru(V, odemePb));
    if (!(kurOdeme !== null && kurOdeme > 0)) return hata(`${odemePb} için kur yok: Ayarlar > Kurlar'dan bugünün kurunu girin.`);
    const caprazKur = sayi(d.capraz);
    let tutar = sayi(d.amount);
    if (!(tutar > 0)) {
      tutar = d.secili.map((i) => islemBelgesi(V, motor, i)).filter((b): b is Belge => !!b)
        .reduce((t, b) => t + (b.paraBirimi === odemePb ? sayi(b.kalan) : sayi(b.kalan) * caprazKur), 0);
    }
    tutar = yuvarla(tutar);
    if (!(tutar > 0)) return hata('Tutar girin veya kapatılan faturaları işaretleyin.');
    const plan = dagitimPlani(V, motor, side, d.party.trim(), tutar, d.secili, odemePb, caprazKur);
    if ('hata' in plan) return hata(plan.hata);
    if (cekli) {
      const senet = d.method === 'senet';
      const govde = {
        yon: side === 'gelir' ? 'alinan' : 'verilen', tur: senet ? 'senet' : 'cek', firmaId: fr.id, banka: d.cbank || null, seriNo: d.cno || null,
        duzenlemeTarihi: date, vade: d.cdue || addDays(date, 30), paraBirimi: odemePb, kur: kurOdeme, tutar, dagitimlar: plan.satirlar,
      };
      return tek({ uc: 'POST /finans/cekler/ekle', govde, tekrar: true, basari: `${senet ? 'Senet' : 'Çek'} kaydedildi.` });
    }
    const govde = { yon: side, firmaId: fr.id, tarih: date, yontem: NAKIT_YONTEMI[h!.tur], hesapId: h!.id, paraBirimi: odemePb, kur: kurOdeme, tutar, dagitimlar: plan.satirlar };
    return tek({ uc: 'POST /finans/odemeler/ekle', govde, tekrar: true, basari: `${fmtPb(tutar, odemePb)} kaydedildi.` });
  }
  if (tur === 'sabit') {
    const h = V.hesapById.get(Number(d.hesap));
    if (!h) return hata('Hesap seçin.');
    const pesin = { yontem: NAKIT_YONTEMI[h.tur], hesapId: h.id, tarih: date };
    const belge = (kategori: string, tutar: number, ac: string, basari: string): Komut => ({
      uc: 'POST /finans/belgeler/ekle', tekrar: true, basari,
      govde: { yon: 'gider', tur: 'faturasiz', kategori, firmaId: null, aciklama: ac, belgeTarihi: date, vade: date, paraBirimi: h.paraBirimi, kur: tlKuru(V, h.paraBirimi) || 1, tutar, kdvOrani: 0, pesin },
    });
    if (d.cat === 'kredi') {
      const pr = sayi(d.principal), ir = sayi(d.interest);
      if (!(pr + ir > 0)) return hata('Anapara veya faiz tutarı girin.');
      const k: Komut[] = [];
      if (pr) k.push(belge('kredi_anapara', pr, d.desc || 'Kredi taksiti (anapara)', 'Kredi taksiti kaydedildi.'));
      if (ir) k.push(belge('faiz', ir, d.desc || 'Kredi taksiti (faiz)', 'Kredi taksiti kaydedildi.'));
      return { komutlar: k };
    }
    const a = sayi(d.amount);
    if (!(a > 0)) return hata('Tutar girin.');
    return tek(belge(KAT_KOD[d.cat] ?? '', a, d.desc.trim() || d.cat, 'Ödeme kaydedildi.'));
  }
  if (tur === 'banka') {
    const h = V.hesapById.get(Number(d.hesap));
    if (!h) return hata('Hesap seçin.');
    return tek({ uc: 'POST /finans/hesaplar/:id/esitle', parametre: { id: h.id }, govde: { tarih: motor.bugun, gercekBakiye: sayi(d.gercek) }, tekrar: true, basari: 'Bakiye eşitlendi.' });
  }
  if (tur === 'virman') {
    return tek({
      uc: 'POST /finans/virmanlar/ekle', tekrar: true, basari: 'Aktarım kaydedildi.',
      govde: { kaynakHesapId: Number(d.kaynak), hedefHesapId: Number(d.hedef), tarih: date, tutar: sayi(d.amount), aciklama: d.aciklama || null },
    });
  }
  if (tur === 'mahsup') {
    const s = V.belgeById.get(Number(d.satis));
    if (!s) return hata('Satış faturası seçin.');
    return tek({
      uc: 'POST /finans/mahsuplar/ekle', tekrar: true, basari: 'Mahsup kaydedildi.',
      govde: { firmaId: s.firmaId, satisBelgeId: Number(d.satis), alisBelgeId: Number(d.alis), satisTutari: sayi(d.satisTutari), ...(sayi(d.alisTutari) > 0 ? { alisTutari: sayi(d.alisTutari) } : {}), tarih: date },
    });
  }
  if (tur === 'avans') {
    return tek({
      uc: 'POST /finans/odemeler/:id/dagit', parametre: { id: Number(d.odeme) }, tekrar: true, basari: 'Avans faturaya düşüldü.',
      govde: { tarih: date, dagitimlar: [{ belgeId: Number(d.belge), belgeTutari: sayi(d.amount), ...(sayi(d.capraz) > 0 ? { caprazKur: sayi(d.capraz) } : {}) }] },
    });
  }
  if (tur === 'iadesat' || tur === 'iadealis') {
    const a = V.belgeById.get(Number(d.asil));
    if (!a) return hata('İade edilen faturayı seçin.');
    if (!(sayi(d.amount) > 0)) return hata('İade tutarını girin.');
    return tek({
      uc: 'POST /finans/belgeler/ekle', tekrar: true, basari: 'İade kaydedildi.',
      govde: {
        yon: a.yon === 'gelir' ? 'gider' : 'gelir', tur: 'iade', kategori: a.yon === 'gelir' ? 'satis_iadesi' : 'alis_iadesi', firmaId: a.firmaId, iadeBelgeId: a.id,
        aciklama: d.aciklama.trim() || null, belgeTarihi: date, vade: date, paraBirimi: a.paraBirimi, kur: sayi(a.kur), tutar: sayi(d.amount), kdvOrani: sayi(a.kdvOrani),
        ...(a.tevkifatPay ? { tevkifatPay: a.tevkifatPay, tevkifatPayda: a.tevkifatPayda } : {}),
      },
    });
  }
  // cekdurum ayrı düğmelerle çalışır (cekDurumKomutu).
  return hata('Bu olay form ile kaydedilmez.');
}

/* ---------- Çekin durumu (çek satırındaki düğmeler) ---------- */
export type CekDurumu = 'tahsilde' | 'tahsil' | 'ciro' | 'karsiliksiz' | 'odendi';
// Takipteki çekler: portföyde ya da tahsilde alınan, bekleyen verilen; vadeye göre.
export const takiptekiCekler = (V: HazirVeri): SunucuCeki[] =>
  V.cekler.filter((c) => (c.yon === 'alinan' && ['portfoy', 'tahsilde'].includes(c.durum)) || (c.yon === 'verilen' && c.durum === 'bekliyor'))
    .sort((a, b) => (a.vade < b.vade ? -1 : 1));
// Karşılıksız kaydı faturaları yeniden açar; uç finans.yonet ister, yalnız yazan düğmeyi görmez.
export function cekDugmeleri(c: SunucuCeki, yonet: boolean): { durum: CekDurumu; baslik: string; tehlike?: true }[] {
  if (c.yon === 'verilen') return [{ durum: 'odendi', baslik: 'Ödendi' }];
  return [
    ...(c.durum === 'portfoy' ? [{ durum: 'tahsilde' as const, baslik: 'Bankaya tahsile verdim' }] : []),
    { durum: 'tahsil', baslik: 'Tahsil edildi' },
    { durum: 'ciro', baslik: 'Ciro ettim' },
    ...(yonet ? [{ durum: 'karsiliksiz' as const, baslik: 'Karşılıksız çıktı', tehlike: true as const }] : []),
  ];
}
// Tahsil ve ödendi hesap, ciro tedarikçi ister (ek alan); öteki ikisi doğrudan gider.
export const cekEkAlanIster = (durum: CekDurumu): 'hesap' | 'firma' | null => (durum === 'tahsil' || durum === 'odendi' ? 'hesap' : durum === 'ciro' ? 'firma' : null);

export function cekDurumKomutu(V: HazirVeri, motor: FinansMotoru, c: SunucuCeki, durum: CekDurumu, ek: { hesap?: string; party?: string; tarih?: string } = {}): KomutSonucu {
  const tarih = ek.tarih || motor.bugun;
  const uc = `POST /finans/cekler/:id/${durum === 'tahsilde' ? 'tahsile-ver' : durum}`;
  if (durum === 'tahsilde') return tek({ uc, parametre: { id: c.id }, govde: { surum: c.surum }, tekrar: false, basari: 'Çek tahsile verildi.' });
  if (durum === 'karsiliksiz') return tek({ uc, parametre: { id: c.id }, govde: { surum: c.surum, tarih: motor.bugun }, tekrar: false, basari: 'Çek karşılıksız; kapattığı faturalar yeniden açıldı.' });
  if (durum === 'tahsil' || durum === 'odendi') {
    const h = V.hesapById.get(Number(ek.hesap));
    if (!h) return hata('Hesap seçin.');
    return tek({ uc, parametre: { id: c.id }, govde: { surum: c.surum, hesapId: h.id, tarih }, tekrar: false, basari: durum === 'tahsil' ? 'Çek tahsil edildi; tutar hesaba girdi.' : 'Verilen çek ödendi.' });
  }
  const fr = firmaCoz(V, ek.party ?? '', 'gider');
  if ('hata' in fr) return hata(fr.hata);
  const plan = dagitimPlani(V, motor, 'gider', (ek.party ?? '').trim(), sayi(c.tutar), [], c.paraBirimi, 0);
  return tek({ uc, parametre: { id: c.id }, govde: { surum: c.surum, firmaId: fr.id, tarih, dagitimlar: 'hata' in plan ? [] : plan.satirlar }, tekrar: true, basari: 'Ciro kaydedildi.' });
}

/* ---------- Düzenli ödeme "Ödendi" ---------- */
export function duzenliOdendiKomutu(V: HazirVeri, motor: FinansMotoru, duzenliId: number): KomutSonucu {
  const dz = V.duzenliById.get(duzenliId);
  if (!dz) return hata('Düzenli ödeme bulunamadı.');
  const h = (dz.hesapId ? V.hesapById.get(dz.hesapId) : undefined) ?? aktifHesaplar(V, ['banka', 'kasa']).find((x) => x.paraBirimi === dz.paraBirimi);
  if (!h) return hata("Önce Ayarlar > Hesaplar'dan bir hesap açın.");
  return tek({
    uc: 'POST /finans/duzenli-odemeler/:id/odendi', parametre: { id: dz.id }, tekrar: true, basari: `${dz.ad} ödendi (${h.ad}).`,
    govde: { tarih: motor.bugun, hesapId: h.id, yontem: NAKIT_YONTEMI[h.tur] },
  });
}

// Formda gösterilen kategori listesinin motor kategorileriyle aynı kaldığı testte sınanır.
export const MOTOR_KATEGORILERI = [...CATS.gelir, ...CATS.gider].map((c) => c.k);
