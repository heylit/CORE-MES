import { esc } from '../merkez/util.ts';
import { CURRENCIES, type Currency, type PurchaseRequest } from '../merkez/tipler.ts';
import {
  baslikOku, bekleyenKararlar, eslestir, hesaplananToplam, kararVer, satiriBagla, satirlaraAyir, sayiOku, sayiYaz, tabloOku, tedarikciBul, toplamTutarMi,
  type BaslikBilgileri, type Eslesme, type FirmaAdayi, type IskontoSecimi, type KararTuru, type OkunanSatir, type Satir, type TalepKalemi,
} from './okuma.ts';
// pdf-oku pdf.js ve yazı tanıma kitaplığını yükler; ekran açılınca değil, PDF seçilince yüklenir.
import type { Ilerleme, OkunanSayfa } from './pdf-oku.ts';
import './ekran.css';

// 3404: PDF tekliften oku. Solda PDF sayfası (okunan satırlar boyalı ve numaralı), sağda okunanlar. Okunan değer kendiliğinden kaydedilmez:
// bekleyen her karar verilmeden "Teklif tablosuna aktar" kapalıdır; aktarım toplu teklif tablosuna taslak yazar, kayıt bugünkü Kaydet'tir.

/** Toplu teklif tablosuna giden taslak. */
export interface PdfAktarimi {
  supplierId: string; currency: Currency; date: string; validUntil: string; payDays: number; discountPct: number; shipping: number;
  leadDays: number | null; prices: Record<string, number>; note: string; pdf: { ozet: string; ad: string };
}
export interface PdfEkraniBaglami {
  r: PurchaseRequest;
  firmalar: FirmaAdayi[];
  openModal(html: string): void;
  closeModal(): void;
  toast(m: string): void;
  dosyaYukle(veri: Uint8Array): Promise<string>;
  aktar(a: PdfAktarimi): void;
}

type Asama =
  | { tur: 'sec'; hata: string | null }
  | { tur: 'okunuyor'; i: Ilerleme }
  | { tur: 'parola'; yeniden: boolean; coz: (p: string | null) => void }
  | { tur: 'kontrol' };

interface Durum {
  b: PdfEkraniBaglami;
  asama: Asama;
  dosyaAdi: string;
  bytes: Uint8Array | null;
  sayfalar: OkunanSayfa[];
  sayfa: number;
  satirlar: Satir[];
  baslik: BaslikBilgileri | null;
  okunan: OkunanSatir[];
  eslesmeler: Eslesme[];
  artan: OkunanSatir[];
  tedarikciId: string | null;
  tedarikciNedeni: string;
  tedarikciOnay: boolean;
  paraBirimi: Currency | null;
  iskonto: IskontoSecimi;
  tarih: string;
  gecerlilik: string;
  vade: number | null;
  nakliye: number | null;
  teklifNo: string;
  secili: string | null;
  aktariliyor: boolean;
}

let D: Durum | null = null;

const SIMGE = {
  pdf: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  tamam: '<path d="M5 12l4 4 10-10"/>',
  dikkat: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
  yok: '<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/>',
  bilgi: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  bag: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  yukle: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
} as const;
const simge = (k: keyof typeof SIMGE, boy: 'k' | 'o' | 'b' = 'k'): string => `<svg class="tc-simge tc-simge-${boy} pt-simge" viewBox="0 0 24 24" aria-hidden="true">${SIMGE[k]}</svg>`;
const ROZET: Record<'emin' | 'kontrol' | 'yok' | 'ek', [string, keyof typeof SIMGE, string]> = {
  emin: ['pt-iyi', 'tamam', 'Emin'], kontrol: ['pt-uyari', 'dikkat', 'Kontrol edin'], yok: ['pt-kotu', 'yok', 'Bulunamadı'], ek: ['pt-bilgi', 'bag', 'Ek alan'],
};
const rozet = (d: keyof typeof ROZET, yazi?: string): string => { const [c, s, t] = ROZET[d]; return `<span class="pt-rozet ${c}">${simge(s)}${esc(yazi ?? t)}</span>`; };
const sayi = (n: number | null | undefined): string => (n === null || n === undefined ? '' : sayiYaz(n));

export function pdfOkuAc(b: PdfEkraniBaglami): void {
  D = {
    b, asama: { tur: 'sec', hata: null }, dosyaAdi: '', bytes: null, sayfalar: [], sayfa: 1, satirlar: [], baslik: null, okunan: [], eslesmeler: [], artan: [],
    tedarikciId: null, tedarikciNedeni: '', tedarikciOnay: false, paraBirimi: null, iskonto: null, tarih: '', gecerlilik: '', vade: null, nakliye: null, teklifNo: '',
    secili: null, aktariliyor: false,
  };
  b.openModal(`<div class="mh"><h2>PDF tekliften oku</h2><span class="spacer"></span><span class="muted small">${esc(b.r.no)}, ${esc(b.r.title)}</span></div>
    <div class="mb pt-kok" id="pt-kok"></div><div class="mf pt-alt" id="pt-alt"></div>`);
  const kok = document.getElementById('pt-kok')?.closest<HTMLElement>('.tc-pencere');
  kok?.classList.add('pt-pencere');
  kok?.addEventListener('click', tikla);
  kok?.addEventListener('change', degisti);
  kok?.addEventListener('dragover', (e) => { e.preventDefault(); });
  kok?.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) void dosyaOku(f); });
  ciz();
}

/* ---------------- okuma ---------------- */

async function dosyaOku(f: File): Promise<void> {
  const d = D; if (!d) return;
  d.dosyaAdi = f.name.slice(0, 120);
  d.asama = { tur: 'okunuyor', i: { asama: 'acma', sayfa: 0, sayfaSayisi: 0, oran: 0 } }; ciz();
  const { PdfOkumaHatasi, pdfTeklifOku } = await import('./pdf-oku.ts');
  try {
    d.bytes = new Uint8Array(await f.arrayBuffer());
    const parolaSor = (yeniden: boolean) => new Promise<string | null>((coz) => { d.asama = { tur: 'parola', yeniden, coz }; ciz(); });
    const { sayfalar } = await pdfTeklifOku(d.bytes, parolaSor, (i) => { d.asama = { tur: 'okunuyor', i }; ciz(); });
    if (D !== d) return;
    d.sayfalar = sayfalar;
    d.satirlar = sayfalar.flatMap((s) => satirlaraAyir(s.ogeler, s.no));
    d.baslik = baslikOku(d.satirlar);
    d.okunan = tabloOku(d.satirlar, d.baslik.tarih.deger);
    if (d.okunan.length === 0) { d.asama = { tur: 'sec', hata: 'Sayfada fiyat satırı bulunamadı. Teklifi elle girin.' }; ciz(); return; }
    const kalemler: TalepKalemi[] = (d.b.r.items || []).map((i) => ({ id: i.id, ad: [i.name, i.spec].filter(Boolean).join(' '), kod: null, miktar: i.qty, birim: i.unit, karsilik: i.karsilik ?? null }));
    const e = eslestir(kalemler, d.okunan);
    d.eslesmeler = e.eslesmeler; d.artan = e.artan;
    const t = tedarikciBul(d.baslik, d.satirlar, d.b.firmalar);
    d.tedarikciId = t.id; d.tedarikciNedeni = t.neden; d.tedarikciOnay = false;
    const pb = d.baslik.paraBirimi.deger;
    d.paraBirimi = pb !== null && (CURRENCIES as readonly string[]).includes(pb) ? pb as Currency : null;
    d.tarih = d.baslik.tarih.deger ?? ''; d.gecerlilik = d.baslik.gecerlilik.deger ?? ''; d.vade = d.baslik.vadeGun.deger; d.teklifNo = d.baslik.teklifNo.deger ?? '';
    const nak = d.artan.find((o) => o.ek === 'nakliye');
    d.nakliye = nak ? (nak.tutar?.deger ?? nak.fiyat?.deger ?? null) : null;
    d.iskonto = d.baslik.iskontoYuzde.deger === null ? 'uygulanmis' : null;
    d.secili = d.eslesmeler.find((x) => x.durum !== 'emin')?.kalem.id ?? null;
    d.asama = { tur: 'kontrol' };
  } catch (h) {
    if (D !== d) return;
    const m = h instanceof PdfOkumaHatasi ? h.message : h instanceof Error && /şifre/i.test(h.message) ? 'PDF parolalı; parola girilmedi.' : 'PDF okunamadı. Teklifi elle girin.';
    d.asama = { tur: 'sec', hata: m };
  }
  ciz();
}

/* ---------------- çizim ---------------- */

function ciz(): void {
  const d = D; if (!d) return;
  const kok = document.getElementById('pt-kok'), alt = document.getElementById('pt-alt');
  if (!kok || !alt) { D = null; return; }
  const a = d.asama;
  if (a.tur === 'sec') { kok.innerHTML = secimHTML(a.hata); alt.innerHTML = '<span class="spacer"></span><button class="btn ghost" data-act="close">Vazgeç</button>'; return; }
  if (a.tur === 'okunuyor') { kok.innerHTML = okunuyorHTML(a.i); alt.innerHTML = '<span class="spacer"></span><button class="btn ghost" data-act="close">Vazgeç</button>'; return; }
  if (a.tur === 'parola') {
    kok.innerHTML = `<div class="pt-kutu pt-uyari-kutu">${simge('dikkat')}<div><b>Parolalı PDF</b><p>${a.yeniden ? 'Parola yanlış; yeniden girin.' : 'Parolayı girin; parola kaydedilmez. Bu PDF teklife eklenirse sonradan yalnız parolayla açılır.'}</p>
      <label class="f"><span>Parola</span><input type="password" id="pt-parola" autocomplete="off"></label>
      <div class="pt-dugmeler"><button class="btn primary" data-pa="parola">Aç</button><button class="btn ghost" data-pa="parola-vazgec">Vazgeç</button></div></div></div>`;
    alt.innerHTML = '';
    document.getElementById('pt-parola')?.focus();
    return;
  }
  const kaydir = kok.querySelector('.pt-okunan')?.scrollTop ?? 0;
  kok.innerHTML = `<div class="pt-iki">${pdfPaneli(d)}${okunanPaneli(d)}</div>`;
  const ok = kok.querySelector('.pt-okunan'); if (ok) ok.scrollTop = kaydir;
  alt.innerHTML = altCubuk(d);
}

function secimHTML(hata: string | null): string {
  return `${hata ? `<div class="pt-kutu pt-kotu-kutu">${simge('yok')}<div><b>Okunamadı</b><p>${esc(hata)}</p></div></div>` : ''}
    <label class="pt-birak">${simge('yukle', 'b')}<b>Tedarikçinin PDF teklifini buraya bırakın</b>
      <span class="muted small">ya da dosya seçin. En çok 20 sayfa, 25 MB. PDF bu bilgisayarda okunur, dışarı gönderilmez.</span>
      <input type="file" id="pt-dosya" accept="application/pdf,.pdf"></label>`;
}

function okunuyorHTML(i: Ilerleme): string {
  const ad = i.asama === 'acma' ? 'PDF açılıyor' : i.asama === 'metin' ? `Sayfa ${String(i.sayfa)} / ${String(i.sayfaSayisi)}: yazı katmanı okunuyor` : `Sayfa ${String(i.sayfa)} / ${String(i.sayfaSayisi)}: yazı katmanı yok, yazı tanıma bu bilgisayarda çalışıyor`;
  const oran = i.asama === 'tanima' ? Math.round(i.oran * 100) : null;
  return `<div class="pt-kutu">${simge('pdf')}<div><b>${esc(ad)}</b>${oran !== null ? `<progress class="pt-ilerleme" max="100" value="${String(oran)}"></progress><p class="muted small">Taranmış sayfa birkaç saniye sürebilir; sayılar daha çok "kontrol edin" çıkar.</p>` : ''}</div></div>`;
}

function satirDurumu(d: Durum, o: OkunanSatir): 'emin' | 'kontrol' | 'ek' | 'bos' {
  if (o.ek) return 'ek';
  const e = d.eslesmeler.find((x) => x.okunan === o);
  return e ? (e.durum === 'emin' ? 'emin' : 'kontrol') : 'bos';
}

function pdfPaneli(d: Durum): string {
  const s = d.sayfalar.find((x) => x.no === d.sayfa) ?? d.sayfalar[0]!;
  const secili = d.eslesmeler.find((e) => e.kalem.id === d.secili)?.okunan ?? null;
  // Sayfa resmi COZUNURLUK genişliğinde; işaretler ekranda okunur boyda kalsın diye sayfa genişliğine göre ölçeklenir.
  const o1 = s.w / 600, p = 3 * o1, r = 9 * o1, cx = (x0: number) => (x0 - p - r - 2 * o1).toFixed(1);
  const kutular = d.okunan.filter((o) => o.satir.sayfa === s.no).map((o) => {
    const [x0, y0, x1, y1] = o.satir.kutu, dur = satirDurumu(d, o), ym = (y0 + y1) / 2;
    return `<g class="pt-r pt-r-${dur}${o === secili ? ' pt-r-secili' : ''}" role="img" aria-label="PDF satırı ${String(o.no)}"><rect x="${(x0 - p).toFixed(1)}" y="${(y0 - p).toFixed(1)}" width="${(x1 - x0 + 2 * p).toFixed(1)}" height="${(y1 - y0 + 2 * p).toFixed(1)}" vector-effect="non-scaling-stroke"/>
      <circle cx="${cx(x0)}" cy="${ym.toFixed(1)}" r="${r.toFixed(1)}"/><text x="${cx(x0)}" y="${(ym + 4 * o1).toFixed(1)}" font-size="${(11 * o1).toFixed(1)}">${String(o.no)}</text></g>`;
  }).join('');
  const sayfaDugmeleri = d.sayfalar.length > 1
    ? `<span class="spacer"></span><button class="btn sm ghost" data-pa="sayfa" data-n="${String(s.no - 1)}" ${s.no <= 1 ? 'disabled' : ''} aria-label="Önceki sayfa">‹</button><span class="small">Sayfa ${String(s.no)} / ${String(d.sayfalar.length)}</span><button class="btn sm ghost" data-pa="sayfa" data-n="${String(s.no + 1)}" ${s.no >= d.sayfalar.length ? 'disabled' : ''} aria-label="Sonraki sayfa">›</button>`
    : '';
  return `<section class="pt-pdf" aria-label="PDF sayfası"><div class="pt-bas">${simge('pdf', 'o')}<b class="pt-ad">${esc(d.dosyaAdi)}</b><span class="pt-rozet pt-gri">${s.tanima ? 'Taranmış PDF, yazı tanıma' : 'Metinli PDF'}</span>${sayfaDugmeleri}</div>
    <div class="pt-sayfa"><svg viewBox="${(-24 * o1).toFixed(1)} 0 ${(s.w + 24 * o1).toFixed(1)} ${String(s.h)}" role="group" aria-label="Sayfa ${String(s.no)}"><image href="${s.resim}" x="0" y="0" width="${String(s.w)}" height="${String(s.h)}"/>${kutular}</svg></div></section>`;
}

function baslikAlanlari(d: Durum): string {
  const b = d.baslik!;
  const firmalar = [...d.b.firmalar].sort((x, y) => x.ad.localeCompare(y.ad, 'tr'));
  const tedDurum = !d.tedarikciId ? 'yok' : d.tedarikciOnay ? 'emin' : 'kontrol';
  const isk = b.iskontoYuzde.deger;
  const alanCls = (dur: string) => (dur === 'kontrol' ? ' pt-k-uyari' : dur === 'yok' ? ' pt-k-kotu' : '');
  return `<div class="pt-alanlar">
    <div class="pt-alan pt-genis"><label for="pt-ted">Tedarikçi</label><select id="pt-ted" class="${alanCls(tedDurum)}" data-pf="ted"><option value="">Seçin</option>${firmalar.map((f) => `<option value="${esc(f.id)}" ${f.id === d.tedarikciId ? 'selected' : ''}>${esc(f.ad)}</option>`).join('')}</select>
      <span class="pt-not">${d.tedarikciOnay ? 'Onaylandı.' : esc(d.tedarikciNedeni)}</span>${d.tedarikciId && !d.tedarikciOnay ? `<button class="btn sm" data-pa="ted-onay">${simge('tamam')}Doğru firma</button>` : ''}</div>
    <div class="pt-alan"><label for="pt-tarih">Teklif tarihi</label><input type="date" id="pt-tarih" data-pf="tarih" value="${esc(d.tarih)}" class="${alanCls(b.tarih.durum)}">${b.tarih.not ? `<span class="pt-not">${esc(b.tarih.not)}</span>` : ''}</div>
    <div class="pt-alan"><label for="pt-gec">Geçerlilik</label><input type="date" id="pt-gec" data-pf="gecerlilik" value="${esc(d.gecerlilik)}"></div>
    <div class="pt-alan"><label for="pt-pb">Para birimi</label><select id="pt-pb" data-pf="pb" class="${alanCls(d.paraBirimi ? b.paraBirimi.durum : 'yok')}"><option value="">Seçin</option>${CURRENCIES.map((c) => `<option ${c === d.paraBirimi ? 'selected' : ''}>${c}</option>`).join('')}</select>${!d.paraBirimi ? '<span class="pt-not">Para birimi bulunamadı; seçin.</span>' : b.paraBirimi.not ? `<span class="pt-not">${esc(b.paraBirimi.not)}</span>` : ''}</div>
    <div class="pt-alan"><label for="pt-vade">Vade (gün)</label><input type="text" inputmode="numeric" id="pt-vade" data-pf="vade" value="${sayi(d.vade)}"></div>
    <div class="pt-alan"><label for="pt-nak">Nakliye</label><input type="text" inputmode="decimal" id="pt-nak" data-pf="nakliye" value="${sayi(d.nakliye)}">${d.artan.some((o) => o.ek === 'nakliye') ? `<span class="pt-not">PDF satırı ${String(d.artan.find((o) => o.ek === 'nakliye')!.no)}</span>` : ''}</div>
    <div class="pt-alan"><label for="pt-no">Teklif no</label><input type="text" id="pt-no" data-pf="no" maxlength="60" value="${esc(d.teklifNo)}"></div>
    <div class="pt-alan pt-genis"><span class="pt-etiket">İskonto</span>${isk === null ? '<span class="pt-not">Belgede iskonto bulunamadı.</span>' : `
      <span class="pt-not">${esc(b.iskontoYuzde.not ?? '')}</span>
      <div class="pt-dugmeler" role="group" aria-label="İskonto"><button class="btn sm${d.iskonto === 'uygulanmis' ? ' primary' : ''}" data-pa="iskonto" data-v="uygulanmis" aria-pressed="${String(d.iskonto === 'uygulanmis')}">Uygulanmış (0)</button>
      <button class="btn sm${d.iskonto === 'ayrica' ? ' primary' : ''}" data-pa="iskonto" data-v="ayrica" aria-pressed="${String(d.iskonto === 'ayrica')}">Ayrıca uygula (%${sayi(isk)})</button></div>`}</div>
  </div>`;
}

const KARAR_DUGMESI: Record<KararTuru, (e: Eslesme) => string> = {
  satir: () => `<button class="btn sm" data-pa="karar" data-t="satir">${simge('tamam')}Satır doğru</button>`,
  fiyat: (e) => `<button class="btn sm" data-pa="karar" data-t="fiyat">${simge('tamam')}${esc(sayi(e.fiyat))} doğru</button>`,
  miktar: (e) => `<button class="btn sm" data-pa="karar" data-t="miktar">${simge('tamam')}Miktar ${esc(sayi(e.okunan?.miktar?.deger))} doğru</button>`,
  tutar: () => `<button class="btn sm" data-pa="karar" data-t="tutar">${simge('tamam')}Fiyat doğru</button>`,
  birim: (e) => (e.cevirmeCarpani !== null ? `<button class="btn sm" data-pa="cevir">Çevir (${esc(e.kalem.birim)})</button>` : '<span class="pt-not">Fiyatı kalem birimine göre yazın.</span>'),
};

function kalemSatiri(d: Durum, e: Eslesme): string {
  const o = e.okunan, dur = e.durum;
  const secenekler = d.okunan.filter((x) => !x.ek).map((x) => `<option value="${String(x.no)}" ${x === o ? 'selected' : ''}>${String(x.no)}. ${esc(x.ad.slice(0, 50))}</option>`).join('');
  const duzeltilmis = o?.fiyat && (o.fiyat.duzeltildi || o.fiyat.supheli) ? `<span class="pt-not">okunan ${esc(o.fiyat.ham)}</span>` : '';
  return `<div class="pt-kalem pt-d-${dur}${d.secili === e.kalem.id ? ' pt-secili' : ''}" data-k="${esc(e.kalem.id)}">
    <button class="pt-kalem-ad" data-pa="sec" aria-label="${esc(e.kalem.ad)}: PDF'te göster"><b>${esc(e.kalem.ad)}</b><span class="pt-not">Talep: ${esc(sayi(e.kalem.miktar))} ${esc(e.kalem.birim)}</span>
      ${o ? `<span class="pt-not"><span class="pt-no" aria-label="PDF satırı ${String(o.no)}">${String(o.no)}</span>${esc(o.ad)}</span>` : ''}</button>
    <div class="pt-deger"><span class="pt-etiket">Miktar</span><span class="pt-salt${e.bekleyen.includes('birim') ? ' pt-k-uyari' : ''}">${o?.miktar ? `${esc(sayi(o.miktar.deger))} ${esc(o.birim ?? o.birimHam ?? '')}` : '–'}</span></div>
    <div class="pt-deger"><label class="pt-etiket" for="pt-f-${esc(e.kalem.id)}">Birim fiyat / ${esc(e.kalem.birim)}</label>${duzeltilmis}<input type="text" inputmode="decimal" id="pt-f-${esc(e.kalem.id)}" data-pf="fiyat" value="${sayi(e.fiyat)}" class="${e.bekleyen.some((t) => t !== 'satir') ? 'pt-k-uyari' : e.fiyat === null ? 'pt-k-bos' : ''}" placeholder="boş"></div>
    <div class="pt-deger"><label class="pt-etiket" for="pt-t-${esc(e.kalem.id)}">Termin (gün)</label><input type="text" inputmode="numeric" id="pt-t-${esc(e.kalem.id)}" data-pf="termin" value="${sayi(e.terminGun)}"></div>
    <div class="pt-durum">${rozet(dur)}</div>
    ${e.nedenler.length || e.bekleyen.length || !o ? `<div class="pt-neden">${e.nedenler.map((n) => `<p class="${dur === 'yok' ? 'pt-y-kotu' : dur === 'emin' ? 'pt-y-bilgi' : 'pt-y-uyari'}">${simge(dur === 'yok' ? 'yok' : dur === 'emin' ? 'bilgi' : 'dikkat')}<span>${esc(n)}</span></p>`).join('')}
      <div class="pt-dugmeler">${e.bekleyen.map((t) => KARAR_DUGMESI[t](e)).join('')}
        <label class="pt-satir-sec"><span class="pt-etiket">${o ? 'Başka satır' : 'PDF\'ten satır seç'}</span><select data-pf="satir"><option value="">${o ? 'Satır yok' : 'Seçin'}</option>${secenekler}</select></label></div></div>` : ''}
  </div>`;
}

function okunanPaneli(d: Durum): string {
  const sayac = { emin: 0, kontrol: 0, yok: 0 };
  for (const e of d.eslesmeler) sayac[e.durum]++;
  const pdfToplam = d.baslik!.toplam.deger;
  const hesap = hesaplananToplam(d.okunan, d.eslesmeler, d.baslik!.iskontoYuzde.deger, d.iskonto);
  const tutuyor = toplamTutarMi(pdfToplam, hesap);
  const ekler = d.artan;
  return `<section class="pt-okunan" aria-label="Okunanlar">
    <div class="pt-ozet">${rozet('emin', `${String(sayac.emin)} emin`)}${rozet('kontrol', `${String(sayac.kontrol)} kontrol edin`)}${rozet('yok', `${String(sayac.yok)} bulunamadı`)}${ekler.length ? rozet('ek', `${String(ekler.length)} ek satır`) : ''}</div>
    <p class="pt-toplam">PDF toplamı ${pdfToplam === null ? 'bulunamadı' : esc(sayi(pdfToplam))} · hesaplanan ${esc(sayi(hesap))} ${tutuyor === null ? '' : tutuyor ? rozet('emin', 'tutuyor') : rozet('yok', `tutmuyor: fark ${sayi(Math.abs(hesap - (pdfToplam ?? 0)))}`)}</p>
    ${baslikAlanlari(d)}
    <div class="pt-kalemler" role="list">${d.eslesmeler.map((e) => kalemSatiri(d, e)).join('')}</div>
    ${ekler.length ? `<div class="pt-ekler"><h3>Kaleme bağlanmayan satırlar</h3>${ekler.map((o) => `<p><span class="pt-no" aria-label="PDF satırı ${String(o.no)}">${String(o.no)}</span>${esc(o.ad)} ${o.ek === 'nakliye' ? rozet('ek', 'Nakliyeye yazılır') : '<span class="pt-not">aktarılmaz</span>'}</p>`).join('')}</div>` : ''}
  </section>`;
}

function kararlar(d: Durum): string[] {
  return bekleyenKararlar(d.eslesmeler, d.baslik!, { tedarikciId: d.tedarikciId, tedarikciOnay: d.tedarikciOnay, paraBirimi: d.paraBirimi, iskonto: d.iskonto });
}

function altCubuk(d: Durum): string {
  const k = kararlar(d);
  return `<span class="pt-bilgi muted small">${simge('bilgi')}Kararlar verilince aktar açılır. Aktar, değerleri teklif tablosuna taslak yazar; kayıt "Teklifleri kaydet" ile olur. PDF teklifin eki olur.</span>
    ${k.length ? `<span class="pt-rozet pt-uyari" title="${esc(k.join('\n'))}">${simge('dikkat')}${String(k.length)} karar bekliyor</span>` : ''}
    <button class="btn ghost" data-act="close">Vazgeç</button><button class="btn primary" data-pa="aktar" ${k.length || d.aktariliyor ? 'disabled' : ''}>${d.aktariliyor ? 'Aktarılıyor…' : 'Teklif tablosuna aktar'}</button>`;
}

/* ---------------- olaylar ---------------- */

const kalemIdsi = (el: Element): string | null => el.closest<HTMLElement>('[data-k]')?.dataset.k ?? null;
function eslesmeDegistir(d: Durum, id: string, f: (e: Eslesme) => Eslesme): void {
  d.eslesmeler = d.eslesmeler.map((e) => (e.kalem.id === id ? f(e) : e));
}

function tikla(ev: Event): void {
  const d = D; if (!d) return;
  const el = (ev.target as Element).closest<HTMLElement>('[data-pa]'); if (!el) return;
  const pa = el.dataset.pa, id = kalemIdsi(el);
  const a = d.asama;
  if (pa === 'parola' && a.tur === 'parola') { const v = (document.getElementById('pt-parola') as HTMLInputElement | null)?.value ?? ''; d.asama = { tur: 'okunuyor', i: { asama: 'acma', sayfa: 0, sayfaSayisi: 0, oran: 0 } }; a.coz(v); ciz(); return; }
  if (pa === 'parola-vazgec' && a.tur === 'parola') { a.coz(null); return; }
  if (pa === 'sayfa') { d.sayfa = Number(el.dataset.n) || 1; ciz(); return; }
  if (pa === 'ted-onay') d.tedarikciOnay = true;
  if (pa === 'iskonto') d.iskonto = el.dataset.v === 'ayrica' ? 'ayrica' : 'uygulanmis';
  if (pa === 'sec' && id) {
    d.secili = id;
    const o = d.eslesmeler.find((e) => e.kalem.id === id)?.okunan; if (o) d.sayfa = o.satir.sayfa;
  }
  if (pa === 'karar' && id) eslesmeDegistir(d, id, (e) => kararVer(e, el.dataset.t as KararTuru));
  if (pa === 'cevir' && id) eslesmeDegistir(d, id, (e) => kararVer(e, 'birim', { cevir: true }));
  if (pa === 'aktar') { void aktar(d); return; }
  ciz();
}

function degisti(ev: Event): void {
  const d = D; if (!d) return;
  const el = ev.target as HTMLInputElement | HTMLSelectElement;
  if (el.id === 'pt-dosya') { const f = (el as HTMLInputElement).files?.[0]; if (f) void dosyaOku(f); return; }
  const pf = el.dataset.pf; if (!pf) return;
  const v = el.value.trim(), id = kalemIdsi(el);
  const n = v === '' ? null : sayiOku(v)?.deger ?? null;
  if (pf === 'ted') { d.tedarikciId = v || null; d.tedarikciOnay = v !== ''; }
  else if (pf === 'pb') d.paraBirimi = (CURRENCIES as readonly string[]).includes(v) ? v as Currency : null;
  else if (pf === 'tarih') d.tarih = v;
  else if (pf === 'gecerlilik') d.gecerlilik = v;
  else if (pf === 'vade') d.vade = n === null ? null : Math.round(n);
  else if (pf === 'nakliye') d.nakliye = n;
  else if (pf === 'no') d.teklifNo = v;
  else if (pf === 'fiyat' && id) {
    // Elle yazılan fiyat fiyat, birim ve tutar kararlarını kapatır: kullanıcı değeri PDF'e bakarak kendisi verdi.
    eslesmeDegistir(d, id, (e) => {
      let x: Eslesme = { ...e, fiyat: n };
      for (const t of ['fiyat', 'birim', 'tutar'] as const) if (x.bekleyen.includes(t)) x = kararVer(x, t, { fiyat: n });
      if (!x.okunan && n !== null) x = { ...x, durum: 'emin', nedenler: ['PDF\'te satırı yok; fiyat elle girildi.'] };
      if (!x.okunan && n === null) x = satiriBagla(x.kalem, null);
      return x;
    });
  } else if (pf === 'termin' && id) eslesmeDegistir(d, id, (e) => ({ ...e, terminGun: n === null ? null : Math.round(n) }));
  else if (pf === 'satir' && id) {
    const o = d.okunan.find((x) => String(x.no) === v) ?? null;
    eslesmeDegistir(d, id, (e) => satiriBagla(e.kalem, o));
    // Aynı satır iki kaleme bağlanmaz: önceki sahibinden düşer.
    if (o) d.eslesmeler = d.eslesmeler.map((e) => (e.kalem.id !== id && e.okunan === o ? satiriBagla(e.kalem, null) : e));
    d.artan = d.okunan.filter((x) => x.ek !== null || !d.eslesmeler.some((e) => e.okunan === x));
    d.secili = id;
  }
  ciz();
}

async function aktar(d: Durum): Promise<void> {
  if (kararlar(d).length || !d.bytes || !d.tedarikciId || !d.paraBirimi || d.aktariliyor) return;
  d.aktariliyor = true; ciz();
  try {
    const ozet = await d.b.dosyaYukle(d.bytes);
    const prices: Record<string, number> = {};
    for (const e of d.eslesmeler) if (e.fiyat !== null) prices[e.kalem.id] = e.fiyat;
    const terminler = d.eslesmeler.filter((e) => e.fiyat !== null && e.terminGun !== null).map((e) => e.terminGun!);
    const isk = d.baslik!.iskontoYuzde.deger;
    d.b.aktar({
      supplierId: d.tedarikciId, currency: d.paraBirimi, date: d.tarih, validUntil: d.gecerlilik, payDays: d.vade ?? 0,
      discountPct: d.iskonto === 'ayrica' && isk !== null ? isk : 0, shipping: d.nakliye ?? 0,
      // Satır terminleri farklıysa teklifin termini en uzunudur (teklifte tek termin tutulur).
      leadDays: terminler.length ? Math.max(...terminler) : null, prices,
      note: d.teklifNo ? `PDF teklif ${d.teklifNo}` : 'PDF teklif', pdf: { ozet, ad: d.dosyaAdi },
    });
    D = null;
    d.b.closeModal();
  } catch {
    d.aktariliyor = false;
    d.b.toast('PDF yüklenemedi; yeniden deneyin.');
    ciz();
  }
}

/** Test için: açık ekranın durumu. */
export const pdfEkraniDurumu = (): Readonly<Durum> | null => D;
