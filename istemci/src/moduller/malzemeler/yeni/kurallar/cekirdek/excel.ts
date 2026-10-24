import { ALAN, BIRIMLER, BIRIM_T, DB_KAT, FAMS, FORMS, ONAY, OP_KOD_ESKI, SARF_KAT, SERTIFIKA, TURLER, XL_ISLEM, XL_SAYFA } from './durum.ts';
import { varsayilanlariUygula } from './hizli-arama.ts';
import { _asc, alanZorunlu, finalAc, teknikKod } from './kod-yapisi.ts';
import { _nm, benzerKartlar, onayDurum } from './onay.ts';
import { opBul, opListe, rota } from './operasyon.ts';
import { C, F, dimsErr, finalAd, grade, newDraft } from './taslak.ts';
import type { Alan, Kalite, Kategori, Sinif, Sozluk, Taslak } from './tipler.ts';
import { _katalog, birimFarki, diffItems, finalBirim, gEksik, gStepOk, gtinGecerli, turAdimlari } from './turler.ts';
import { clsKeyFor } from './uyumluluk.ts';
import { clone, isNum, parseNum } from './yardimcilar.ts';

type TurAdi = Taslak['tur'];

// Şablonun bir sütunu: kimlik (`com.kod`, `g.kat`, `dims.d` ...), başlık, hücre tipi ve açılır liste (dizi ya da Listeler sayfasındaki
// ortak listenin adı).
export interface XlKolon {
    id: string;
    baslik: string;
    tip: string;
    zorunlu?: boolean;
    liste?: string[] | string | null;
    not?: string;
    oto?: boolean;
    salt?: boolean;
    grup?: string;
    oneri?: (string | number)[] | null;
    alan?: Alan;
    kategoriler?: string[];
}
export interface XlAlanKolonu extends XlKolon { zorunlu: boolean; liste: string[] | null; oneri: (string | number)[] | null; not: string; alan: Alan }
export interface XlBirlesikKolon extends XlAlanKolonu { kategoriler: string[] }
export interface XlOlcuAnahtari { k: string; u: string; anlam: string[] }
export interface XlOptAnahtari { k: string; ad: string; coklu: boolean; sayi: boolean; aileler: string[]; degerler: string[] }
export interface XlKartSonucu { kayit: Taslak; hatalar: string[]; uyarilar: string[] }
// Okunan satır: sütun kimliğinden hücre değerine.
export type XlSatirVerisi = Sozluk<unknown>;
export interface XlOkunanSatir { tur: TurAdi; sayfa: string; satir: number; r: XlSatirVerisi }
export type XlIslem = 'atla' | 'guncelle' | 'ekle' | 'ayni';
export interface XlPlanSatiri extends XlOkunanSatir {
    islem: XlIslem;
    hatalar: string[];
    uyarilar: string[];
    kayit: Taslak | null;
    eslesen: Taslak | null;
    mukerrer: string[];
    farklar?: ReturnType<typeof diffItems>;
}

// ExcelJS'in burada kullanılan kısmı; kitaplık çağıran taraftan verilir.
export interface XlRenk { argb: string }
export interface XlYazi { name?: string; size?: number; bold?: boolean; italic?: boolean; color?: XlRenk }
export interface XlDolgu { type: string; pattern: string; fgColor: XlRenk }
export interface XlNot { texts: { text: string; font: XlYazi }[]; margins: { insetmode: string } }
export interface XlHucreNesnesi {
    value: unknown;
    font: XlYazi;
    alignment: { wrapText?: boolean; vertical?: string };
    fill: XlDolgu;
    border: { bottom?: { style: string; color: XlRenk } };
    note: XlNot;
}
export interface XlSutun { width?: number; numFmt?: string; readonly letter: string }
export interface XlSatirNesnesi {
    height: number;
    getCell(c: number): XlHucreNesnesi;
    eachCell(o: { includeEmpty: boolean }, f: (cell: XlHucreNesnesi) => void): void;
}
export interface XlVeriDogrulama {
    type: string;
    allowBlank: boolean;
    formulae: string[];
    showErrorMessage: boolean;
    errorStyle: string;
    errorTitle: string;
    error: string;
}
export interface XlSayfaSecenekleri {
    properties?: { tabColor?: XlRenk };
    views?: { state: string; ySplit?: number; xSplit?: number }[];
}
export interface XlSayfa {
    columns: { header?: string; key?: string; width?: number }[];
    getCell(r: number, c: number): XlHucreNesnesi;
    getColumn(c: number): XlSutun;
    getRow(r: number): XlSatirNesnesi;
    addRow(o: Sozluk<unknown>): XlSatirNesnesi;
    dataValidations: { add(adres: string, k: XlVeriDogrulama): void };
    autoFilter: { from: { row: number; column: number }; to: { row: number; column: number } };
}
export interface XlKitap {
    creator: string;
    created: Date;
    views: { activeTab: number }[];
    addWorksheet(ad?: string, o?: XlSayfaSecenekleri): XlSayfa;
}
export interface XlExcelJS { Workbook: new () => XlKitap }

export function _xlBos(v: unknown): boolean { return (v === undefined || v === null || String(v).trim() === ''); }
export function _xlStr(v: unknown): string { return (_xlBos(v) ? '' : String(v).trim()); }
export function _xlCoklu(v: unknown): string[] { return (_xlBos(v) ? [] : String(v).split(/[,;\n]/).map(x => x.trim()).filter(Boolean)); }
export function _xlTarih(v: unknown): string { if (_xlBos(v))
    return ''; if (v instanceof Date && !isNaN(+v))
    return v.toISOString().slice(0, 10); const s = String(v).trim(); let m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/); if (m)
    return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`; m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : s; }
export function _xlSayi(v: unknown): number | '' { if (_xlBos(v))
    return ''; if (typeof v === 'number')
    return v; const n = parseNum(String(v)); return isNum(n) ? n : ''; }
export function aileSinifAd(f: string, c: string): string { return (`${FAMS[f]!.ad} › ${FAMS[f]!.classes[c]!.ad}`); }
export function aileSinifBul(t: unknown): { fam: string; cls: string | null } | null { const s = _nm(t); for (const [fk, f] of Object.entries(FAMS))
    for (const [ck, c] of Object.entries(f.classes))
        if (_nm(`${f.ad} › ${c.ad}`) === s || _nm(`${f.ad} ${c.ad}`) === s)
            return { fam: fk, cls: ck }; for (const [fk, f] of Object.entries(FAMS))
    if (_nm(f.ad) === s || _nm(f.kod) === s)
        return { fam: fk, cls: null }; return null; }
export function _xlOlcuAnahtarlari(): XlOlcuAnahtari[] { const m = new Map<string, XlOlcuAnahtari>(); Object.entries(FORMS).forEach(([fk, f]) => f.dims.forEach(([k, ad, u]) => { if (!m.has(k))
    m.set(k, { k, u: u || 'mm', anlam: [] }); m.get(k)!.anlam.push(`${f.ad}: ${ad}`); })); return [...m.values()]; }
export function _xlOptAnahtarlari(): XlOptAnahtari[] {
    const m = new Map<string, XlOptAnahtari>();
    Object.entries(FAMS).forEach(([fk, f]) => f.opts.forEach(o => {
        if (!m.has(o.k))
            m.set(o.k, { k: o.k, ad: o.ad, coklu: o.type === 'multi', sayi: o.type === 'number', aileler: [], degerler: [] });
        const x = m.get(o.k)!;
        x.aileler.push(f.ad);
        if (o.type === 'multi')
            x.coklu = true;
        const vals = o.from ? Object.values(f.classes).flatMap(c => (c[o.from!] as string[] | undefined) || []) : (o.opts || []);
        vals.forEach(v => { if (!x.degerler.includes(v))
            x.degerler.push(v); });
    }));
    return [...m.values()];
}
export function _xlAlanKol(a: Alan, tur?: TurAdi): XlAlanKolonu { const z = tur ? alanZorunlu({ tur } as Taslak, a) : !!a.gerekli; const u = a.u ? ` (${a.u})` : ''; return { id: 'g.' + a.k, baslik: `${a.ad}${u}${z ? ' *' : ''}`, zorunlu: z, tip: a.tip === 'num' ? 'sayi' : a.tip === 'tarih' ? 'tarih' : a.tip === 'coklu' ? 'coklu' : 'metin', liste: (a.tip === 'sec' && a.opts) ? a.opts : null, oneri: a.oneri || null, not: a.tip === 'coklu' ? 'Birden fazla değeri virgülle ayır.' + (a.opts ? ' Değerler: ' + a.opts.join(', ') : '') : (a.oneri ? 'Öneriler: ' + a.oneri.join(', ') : ''), alan: a }; }
export function _xlAlanBirlesik(gruplar: [string, Alan[]][]): XlBirlesikKolon[] {
    const m = new Map<string, XlBirlesikKolon>();
    gruplar.forEach(([kat, l]) => (l || []).forEach(a => { if (!m.has(a.k)) {
        const c = _xlAlanKol(a);
        c.zorunlu = false;
        c.baslik = c.baslik.replace(/ \*$/, '');
        c.kategoriler = [];
        c.liste = c.liste ? [...c.liste] : null;
        m.set(a.k, c as XlBirlesikKolon);
    } const c = m.get(a.k)!; c.kategoriler.push(kat); if (a.opts && c.liste)
        a.opts.forEach(v => { if (!c.liste!.includes(v))
            c.liste!.push(v); }); }));
    return [...m.values()].map(c => ({ ...c, not: `${c.kategoriler.length < Object.keys(gruplar).length ? 'Kategoriler: ' + c.kategoriler.join(', ') + '. ' : ''}${c.not || ''}` }));
}
export function xlKolonlar(tur: TurAdi): XlKolon[] {
    const bas: XlKolon[] = [{ id: 'islem', baslik: 'İşlem', tip: 'metin', liste: XL_ISLEM, not: 'Boş ya da "Ekle": yeni kart. "Güncelle": Kart ID ya da stok koduyla eşleşen kartı günceller (boş hücreler değişmez). "Atla": satır okunmaz.' },
        { id: 'id', baslik: 'Kart ID', tip: 'metin', oto: true, not: 'Dışa aktarımda dolar; güncellemede eşleştirme için kullanılır. Yeni satırlarda boş bırak.' },
        { id: 'com.kod', baslik: 'Stok kodu', tip: 'metin', not: 'Boşsa kod yapısına göre otomatik verilir (ör. HM-ISL-00001).' }, { id: 'com.eskiKod', baslik: 'Eski / ERP kodu', tip: 'metin', not: 'Varsa mevcut stok kodu; aynı ERP kodlu ikinci kart açılmaz, birleştirme listesinde kullanılır.' }];
    const son: XlKolon[] = [{ id: 'com.ac1', baslik: 'Açıklama 1', tip: 'metin', not: 'Boşsa seçimlerden türetilir.' }, { id: 'com.ac2', baslik: 'Açıklama 2', tip: 'metin', not: 'Boşsa seçimlerden türetilir.' }, { id: 'com.ac3', baslik: 'Açıklama 3', tip: 'metin', not: 'Boşsa seçimlerden türetilir.' },
        { id: 'com.not', baslik: 'Notlar', tip: 'metin' }, { id: 'tkod', baslik: 'Teknik kod', tip: 'metin', oto: true, salt: true, not: 'Yalnız dışa aktarımda; içe aktarımda okunmaz.' }, { id: 'onay', baslik: 'Onay durumu', tip: 'metin', oto: true, salt: true, not: 'Yalnız dışa aktarımda; içe aktarımda okunmaz.' }];
    const birim: XlKolon = { id: 'com.birim', baslik: 'Stok birimi', tip: 'metin', liste: tur === 'hammadde' ? BIRIMLER : (BIRIM_T[tur] || ['adet']) };
    const sert: XlKolon = { id: 'com.sertifika', baslik: 'Sertifikalar', tip: 'coklu', not: 'Virgülle ayır. Değerler: ' + SERTIFIKA.join(', ') };
    const ted: XlKolon = { id: 'com.ted', baslik: 'Tedarikçi', tip: 'metin' }, depo: XlKolon = { id: 'g.depoYeri', baslik: 'Depo yeri', tip: 'metin' };
    const rota: XlKolon = { id: 'ops', baslik: 'Rota', tip: 'metin', not: 'Operasyon no ve kodları; ör. "10 TST; 20 TRN; 30 BM". Numarasız yazarsan 10\'ar verilir: "TST; TRN; BM". Kodlar Operasyonlar listesinden.' };
    const tedarik: XlKolon = { id: 'g.tedarik', baslik: 'Tedarik tipi', tip: 'metin', liste: ['Üretim', 'Fason üretim', 'Satın alma'] };
    if (tur === 'hammadde') {
        const olc = _xlOlcuAnahtarlari().map((o): XlKolon => ({ id: 'dims.' + o.k, baslik: `Ölçü ${o.k} (${o.u})`, tip: 'sayi', not: o.anlam.join('\n'), grup: 'olcu' }));
        const opt = _xlOptAnahtarlari().map((o): XlKolon => ({ id: 'opts.' + o.k, baslik: o.ad + (o.coklu ? ' (virgülle)' : ''), tip: o.sayi ? 'sayi' : o.coklu ? 'coklu' : 'metin', liste: (!o.coklu && o.degerler.length) ? o.degerler : null, not: `Aileler: ${o.aileler.join(', ')}.${o.coklu && o.degerler.length ? ' Değerler: ' + o.degerler.slice(0, 60).join(', ') : ''}`, grup: 'opt' }));
        return [...bas, { id: 'com.ad', baslik: 'Malzeme adı', tip: 'metin', not: 'Boşsa seçimlerden otomatik oluşur.' },
            { id: 'aileSinif', baslik: 'Aile › Sınıf *', tip: 'metin', zorunlu: true, liste: 'aileSinif', not: 'Listeden seç. Kalite kodu ailede tekse sınıf boş bırakılabilir (yalnız aile adı).' },
            { id: 'grade', baslik: 'Kalite kodu *', tip: 'metin', zorunlu: true, liste: 'kalite', not: 'Listeden seç ya da yaz (ör. 42CRMO4, 304, 6082). Malzeme ayarlarında eklediğin kaliteler de geçerli.' },
            { id: 'stds', baslik: 'Standartlar', tip: 'coklu', not: 'Kalitenin standartlarından; birden fazlası çift sertifika demektir. Boşsa kalitenin ana standardı.' },
            { id: 'form', baslik: 'Form *', tip: 'metin', zorunlu: true, liste: Object.values(FORMS).map(f => f.ad) }, ...olc, { id: 'tol', baslik: 'Tolerans', tip: 'metin' }, ...opt, ted, birim, sert, ...son];
    }
    if (tur === 'yarimamul' || tur === 'mamul') {
        const al = (tur === 'yarimamul' ? [...ALAN.ym_tanim!, ...ALAN.ym_olcu!] : [...ALAN.mm_tanim!, ...ALAN.mm_ambalaj!]).map(a => _xlAlanKol(a, tur));
        const ek: XlKolon[] = tur === 'mamul' ? [{ id: 'g.gtin', baslik: 'Barkod (GTIN / EAN)', tip: 'metin' }, { id: 'g.gtip', baslik: 'GTİP (HS kodu)', tip: 'metin' }, { id: 'g.mensei', baslik: 'Menşei', tip: 'metin' }] : [ted];
        return [...bas, ...al, rota, birim, ...ek, depo, tedarik, sert, ...son];
    }
    if (tur === 'sarf') {
        const katlar = Object.entries(SARF_KAT).filter(([k, c]) => !c.gizli);
        return [...bas, { id: 'com.ad', baslik: 'Malzeme adı', tip: 'metin', not: 'Boşsa seçimlerden otomatik oluşur.' }, { id: 'g.kat', baslik: 'Kategori *', tip: 'metin', zorunlu: true, liste: katlar.map(([k, c]) => c.ad) },
            ..._xlAlanBirlesik(katlar.map(([k, c]) => [c.ad, c.alanlar])), { id: 'g.marka', baslik: 'Marka', tip: 'metin' }, { id: 'g.urunKodu', baslik: 'Üretici ürün kodu', tip: 'metin' }, birim, ted, depo, sert, ...son];
    }
    const katlar = Object.entries(DB_KAT).filter(([k, c]) => !c.gizli);
    return [...bas, { id: 'g.kat', baslik: 'Kategori *', tip: 'metin', zorunlu: true, liste: katlar.map(([k, c]) => c.ad) }, ...[...ALAN.db_kimlik!, ...ALAN.db_alis!, ...ALAN.db_bakim!].map(a => _xlAlanKol(a, 'demirbas')),
        ..._xlAlanBirlesik(katlar.filter(([k, c]) => (c.alanlar || []).length).map(([k, c]) => [c.ad, c.alanlar])), birim, ted, depo, ...son];
}
export function xlSatir(x: Taslak, tur: TurAdi): XlSatirVerisi {
    // Ticari bilgisi olmayan eski kart boş ticari bilgiyle yazılır; kod, ad ve standart hesapları com'u okur.
    if (!x.com)
        x = { ...x, com: newDraft().com };
    const kol = xlKolonlar(tur);
    const r: XlSatirVerisi = {};
    const g: Sozluk<unknown> = x.g || {};
    kol.forEach(c => {
        const id = c.id;
        let v: unknown = '';
        if (id === 'islem')
            v = 'Güncelle';
        else if (id === 'id')
            v = x.id;
        else if (id === 'tkod')
            v = (x.com && x.com.tkod) || teknikKod(x);
        else if (id === 'onay')
            v = ONAY[onayDurum(x)]!.ad;
        else if (id === 'aileSinif') {
            // Anahtar String ile çevrilir: boş aile ya da sınıf prototipteki gibi "null" anahtarına bakar.
            const fam = FAMS[String(x.fam)];
            v = fam && fam.classes[String(clsKeyFor(x))] ? aileSinifAd(String(x.fam), String(clsKeyFor(x))) : '';
        }
        else if (id === 'grade')
            v = x.grade === '__ozel' ? (x.custom && (x.custom.kod || x.custom.ad)) || '' : x.grade;
        else if (id === 'stds')
            v = (x.stds || []).join(', ');
        else if (id === 'form') {
            const fm = FORMS[String(x.form)];
            v = fm ? fm.ad : '';
        }
        else if (id === 'tol')
            v = x.tol || '';
        else if (id.startsWith('dims.')) {
            const dims: Taslak['dims'] = x.dims || {};
            v = dims[id.slice(5)];
        }
        else if (id.startsWith('opts.')) {
            const opts: Taslak['opts'] = x.opts || {};
            const o = opts[id.slice(5)];
            v = Array.isArray(o) ? o.join(', ') : o;
        }
        else if (id === 'ops')
            v = rota(x).map(r => `${r.no} ${r.kod || r.ad}`).join('; ');
        else if (id === 'g.kat') {
            const T: Sozluk<Kategori> = tur === 'sarf' ? SARF_KAT : DB_KAT;
            const kat = T[String(g.kat)];
            v = kat ? kat.ad : '';
        }
        else if (id.startsWith('g.')) {
            const o = g[id.slice(2)];
            v = Array.isArray(o) ? o.join(', ') : o;
        }
        else if (id === 'com.sertifika') {
            const com: Partial<Taslak['com']> = x.com || {};
            v = (com.sertifika || []).join(', ');
        }
        else if (/^com\.ac[123]$/.test(id))
            v = finalAc(x, +id.slice(-1) - 1);
        else if (id === 'com.ad')
            v = (x.com && x.com.ad) || finalAd(x);
        else if (id.startsWith('com.')) {
            const com: Partial<Taslak['com']> = x.com || {};
            v = com[id.slice(4)];
        }
        r[id] = v === undefined || v === null ? '' : v;
    });
    return r;
}
export function xlSatirdanKart(tur: TurAdi, r: XlSatirVerisi, mevcut: Taslak | null): XlKartSonucu {
    const hata: string[] = [], uyari: string[] = [];
    const kol = xlKolonlar(tur);
    const d: Taslak = mevcut ? clone(mevcut) : { ...newDraft(), tur: tur === 'hammadde' ? 'hammadde' : tur };
    // İçe aktarılan eski kartta com olmayabilir; prototip boş nesneyle başlar.
    d.com = d.com || ({} as Taslak['com']);
    d.g = d.g || {};
    d.opts = d.opts || {};
    d.dims = d.dims || {};
    const al = (id: string): unknown => r[id];
    const var_ = (id: string): boolean => !_xlBos(r[id]);
    if (tur === 'hammadde') {
        if (var_('aileSinif')) {
            const as = aileSinifBul(r.aileSinif);
            if (!as)
                hata.push(`"${_xlStr(r.aileSinif)}" aile / sınıf bulunamadı.`);
            else {
                d.fam = as.fam;
                if (as.cls)
                    d.cls = as.cls;
            }
        }
        if (var_('grade')) {
            const kod = _asc(_xlStr(r.grade)).replace(/\s+/g, '');
            const ara = (f: string): { ck: string; g: Kalite } | null => { for (const [ck, c] of Object.entries(FAMS[f]!.classes)) {
                const g = c.grades.find(x => _nm(x.kod) === _nm(kod) || _nm(x.ad) === _nm(r.grade));
                if (g)
                    return { ck, g };
            } return null; };
            let bul = d.fam && FAMS[d.fam] ? ara(d.fam) : null;
            if (!bul && !var_('aileSinif'))
                for (const f of Object.keys(FAMS)) {
                    const b = ara(f);
                    if (b) {
                        d.fam = f;
                        bul = b;
                        break;
                    }
                }
            if (!bul)
                hata.push(`"${_xlStr(r.grade)}" kalitesi ${d.fam && FAMS[d.fam] ? FAMS[d.fam]!.ad + ' ailesinde ' : ''}bulunamadı (Malzeme ayarlarından ekleyebilirsin).`);
            else {
                if (d.cls && d.cls !== bul.ck && var_('aileSinif'))
                    uyari.push(`Kalite ${FAMS[d.fam!]!.classes[bul.ck]!.ad} sınıfında; sınıf buna göre düzeltildi.`);
                d.cls = bul.ck;
                d.grade = bul.g.kod;
                if (bul.g.gizli)
                    uyari.push(`${bul.g.kod} Malzeme ayarlarında gizli.`);
            }
        }
        if (var_('form')) {
            const fk = Object.keys(FORMS).find(k => _nm(FORMS[k]!.ad) === _nm(r.form) || _nm(k) === _nm(r.form));
            if (!fk)
                hata.push(`"${_xlStr(r.form)}" formu bilinmiyor.`);
            else {
                if (d.form !== fk)
                    d.dims = {};
                d.form = fk;
                if (d.fam && FAMS[d.fam] && !FAMS[d.fam]!.forms.includes(fk))
                    uyari.push(`${FORMS[fk]!.ad} bu aile için tipik bir form değil.`);
            }
        }
        if (d.form) {
            FORMS[d.form]!.dims.forEach(([k]) => { if (var_('dims.' + k)) {
                const n = _xlSayi(al('dims.' + k));
                if (n === '')
                    hata.push(`Ölçü ${k} sayı değil.`);
                else
                    d.dims[k] = n;
            } });
            Object.keys(r).filter(k => k.startsWith('dims.') && var_(k)).forEach(k => { if (!FORMS[d.form!]!.dims.some(([x]) => 'dims.' + x === k))
                uyari.push(`Ölçü ${k.slice(5)} ${FORMS[d.form!]!.ad} formunda kullanılmıyor; okunmadı.`); });
        }
        if (var_('stds')) {
            const g = grade(d);
            const l = _xlCoklu(al('stds'));
            const gec = (g && g.stds) || [];
            const ok = l.filter(s => gec.some(x => _nm(x) === _nm(s))).map(s => gec.find(x => _nm(x) === _nm(s))!);
            if (ok.length)
                d.stds = ok;
            if (ok.length < l.length)
                uyari.push('Kalitenin standart listesinde olmayan standartlar okunmadı: ' + l.filter(s => !gec.some(x => _nm(x) === _nm(s))).join(', '));
        }
        if (var_('tol'))
            d.tol = _xlStr(al('tol'));
        if (d.fam && FAMS[d.fam]) {
            const F = FAMS[d.fam]!;
            const C: Partial<Sinif> = F.classes[String(d.cls)] || {};
            F.opts.forEach(o => {
                const id = 'opts.' + o.k;
                if (!var_(id))
                    return;
                const izin = o.from ? ((C[o.from] as string[] | undefined) || []) : (o.opts || []);
                if (o.type === 'multi') {
                    const l = _xlCoklu(al(id));
                    d.opts[o.k] = l;
                    const yok = l.filter(v => izin.length && !izin.includes(v));
                    if (yok.length)
                        uyari.push(`${o.ad}: listede olmayan değer(ler): ${yok.join(', ')}`);
                }
                else if (o.type === 'number') {
                    const n = _xlSayi(al(id));
                    if (n !== '')
                        d.opts[o.k] = n;
                }
                else {
                    const v = _xlStr(al(id));
                    d.opts[o.k] = v;
                    if (izin.length && !izin.includes(v))
                        uyari.push(`${o.ad}: "${v}" listede yok.`);
                }
            });
            Object.keys(r).filter(k => k.startsWith('opts.') && var_(k)).forEach(k => { if (!F.opts.some(o => 'opts.' + o.k === k))
                uyari.push(`"${kol.find(c => c.id === k)!.baslik}" ${F.ad} ailesinde kullanılmıyor; okunmadı.`); });
        }
        if (!mevcut && d.fam && d.grade)
            varsayilanlariUygula(d);
        if (!mevcut) {
            if (!d.fam && !var_('grade') && !var_('aileSinif'))
                hata.push('Aile › Sınıf ya da kalite kodu zorunlu.');
            if (!d.grade && !var_('grade'))
                hata.push('Kalite kodu zorunlu.');
            if (!d.form && !var_('form'))
                hata.push('Form zorunlu.');
        }
        if (d.form && d.grade && !hata.length) {
            const e = dimsErr(d);
            if (e)
                hata.push(e);
        }
    }
    else {
        d.tur = tur;
        if (tur === 'sarf' || tur === 'demirbas') {
            if (var_('g.kat')) {
                const T: Sozluk<Kategori> = tur === 'sarf' ? SARF_KAT : DB_KAT;
                const k = Object.keys(T).find(k => _nm(T[k]!.ad) === _nm(r['g.kat']) || _nm(T[k]!.kod) === _nm(r['g.kat']) || _nm(k) === _nm(r['g.kat']));
                if (!k)
                    hata.push(`"${_xlStr(r['g.kat'])}" kategorisi bulunamadı.`);
                else
                    d.g.kat = k;
            }
            else if (!mevcut)
                hata.push('Kategori zorunlu.');
        }
        kol.filter(c => c.alan).forEach(c => {
            const id = c.id;
            if (!var_(id))
                return;
            const k = id.slice(2);
            const a = c.alan!;
            if (tur === 'sarf' || tur === 'demirbas') {
                const T: Sozluk<Kategori> = tur === 'sarf' ? SARF_KAT : DB_KAT;
                const kat = T[String(d.g.kat)];
                const ortak = tur === 'demirbas' && [...ALAN.db_kimlik!, ...ALAN.db_alis!, ...ALAN.db_bakim!].some(x => x.k === k);
                if (kat && !ortak && !(kat.alanlar || []).some(x => x.k === k)) {
                    uyari.push(`"${c.baslik}" ${kat.ad} kategorisinde kullanılmıyor; okunmadı.`);
                    return;
                }
            }
            if (c.tip === 'sayi') {
                const n = _xlSayi(al(id));
                if (n === '')
                    hata.push(`${c.baslik}: sayı değil.`);
                else
                    d.g[k] = n;
            }
            else if (c.tip === 'tarih')
                d.g[k] = _xlTarih(al(id));
            else if (c.tip === 'coklu')
                d.g[k] = _xlCoklu(al(id));
            else {
                const v = _xlStr(al(id));
                d.g[k] = v;
                const katT: Sozluk<Kategori> = tur === 'sarf' ? SARF_KAT : tur === 'demirbas' ? DB_KAT : {};
                const kat = katT[String(d.g.kat)];
                const ad = kat && (kat.alanlar || []).find(x => x.k === k) || a;
                if (ad.tip === 'sec' && ad.opts && !ad.opts.includes(v))
                    uyari.push(`${a.ad}: "${v}" listede yok.`);
            }
        });
        ['g.marka', 'g.urunKodu', 'g.gtin', 'g.gtip', 'g.mensei', 'g.depoYeri', 'g.tedarik'].forEach(id => { if (var_(id))
            d.g[id.slice(2)] = _xlStr(al(id)); });
        if (var_('g.gtin') && !gtinGecerli(d.g.gtin))
            uyari.push('Barkod (GTIN) kontrol hanesi geçersiz.');
        if (var_('ops')) {
            const ops: Taslak['ops'] = [];
            let son = 0;
            _xlCoklu(String(al('ops')).replace(/[>›]/g, ';')).forEach(p => { const m = p.match(/^(\d+)\s+(.+)$/); const no = m ? +m[1]! : son + 10; const kod = _asc((m ? m[2]! : p).trim()).replace(/\s+/g, ''); const t = opBul(kod) || opBul(OP_KOD_ESKI[kod] || ''); son = no; if (!t)
                uyari.push(`Rota: ${kod} Operasyonlar listesinde yok.`); ops.push({ no, kod: t ? t.kod : kod, ad: t ? t.ad : kod }); });
            d.ops = ops;
        }
    }
    if (var_('com.kod')) {
        d.com.kod = _xlStr(al('com.kod'));
        d.kodManual = true;
    }
    if (var_('com.ad')) {
        d.com.ad = _xlStr(al('com.ad'));
        d.adManual = true;
    }
    if (var_('com.ted')) {
        const ted = _xlStr(al('com.ted'));
        // Excel'deki tedarikçi metindir: ad değişince kartın finans firma bağı düşer (kart #466).
        if (ted !== d.com.ted)
            delete d.com.tedId;
        d.com.ted = ted;
    }
    if (var_('com.eskiKod'))
        d.com.eskiKod = _xlStr(al('com.eskiKod'));
    if (var_('com.birim')) {
        const b = _xlStr(al('com.birim'));
        d.com.birim = b;
        const izin = tur === 'hammadde' ? BIRIMLER : (BIRIM_T[tur] || []);
        if (izin.length && !izin.includes(b))
            uyari.push(`Stok birimi "${b}" listede yok.`);
    }
    if (var_('com.sertifika')) {
        const l = _xlCoklu(al('com.sertifika'));
        d.com.sertifika = l;
        const yok = l.filter(x => !SERTIFIKA.includes(x));
        if (yok.length)
            uyari.push('Listede olmayan sertifika: ' + yok.join(', '));
    }
    if (var_('com.not'))
        d.com.not = _xlStr(al('com.not'));
    d.acManual = d.acManual || [false, false, false];
    [1, 2, 3].forEach(i => { if (var_('com.ac' + i)) {
        d.com['ac' + i] = _xlStr(al('com.ac' + i));
        (d.acManual as boolean[])[i - 1] = true;
    } });
    if (tur !== 'hammadde' && !hata.length) {
        const n = turAdimlari(d).length;
        for (let i = 0; i <= n; i++)
            if (!gStepOk(i, d)) {
                const e = i === 0 ? 'Kategori seçilmemiş.' : `Eksik zorunlu alan: ${gEksik(i, d)}`;
                if (!hata.includes(e))
                    hata.push(e);
            }
    }
    return { kayit: d, hatalar: hata, uyarilar: uyari };
}
// Gerçek ExcelJS kitabı burada kullanılan alt kümeden geniştir; çağıran kendi kitap tipini geri alır.
export function xlCalismaKitabi<K = XlKitap>(ExcelJS: { Workbook: new () => K }, { kayitlar = null, turler = ['hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas'] }: { kayitlar?: readonly Taslak[] | null; turler?: TurAdi[] } = {}): K {
    const kitap = new ExcelJS.Workbook();
    const wb = kitap as unknown as XlKitap;
    wb.creator = 'Malzeme Kataloğu';
    wb.created = new Date();
    const F: XlYazi = { name: 'Arial', size: 10 };
    const FB: XlYazi = { name: 'Arial', size: 10, bold: true };
    const RENK = { zorunlu: 'FFF2C14E', normal: 'FFDCE4DE', oto: 'FFC9CDCB', ornek: 'FF7A8580' };
    // --- Nasıl kullanılır
    const n = wb.addWorksheet('Nasıl kullanılır', { properties: { tabColor: { argb: 'FF2E7D74' } } });
    n.columns = [{ width: 4 }, { width: 30 }, { width: 96 }];
    let nr = 2;
    const hucre = (r: number, c: number, v: unknown, st?: XlYazi): XlHucreNesnesi => { const x = n.getCell(r, c); x.value = v; x.font = st || F; x.alignment = { wrapText: true, vertical: 'top' }; return x; };
    hucre(nr++, 2, 'Malzeme Kataloğu — toplu giriş ve çıkış şablonu', { name: 'Arial', size: 14, bold: true });
    hucre(nr++, 2, kayitlar ? `Dışa aktarım: ${new Date().toLocaleString('tr-TR')} · ${kayitlar.length} kart` : `Boş şablon · ${new Date().toLocaleDateString('tr-TR')}`, { name: 'Arial', size: 10, italic: true, color: { argb: 'FF56636A' } });
    nr++;
    ([['Nasıl doldurulur', ''], ['1. Sayfa seç', 'Her malzeme türünün kendi sayfası var: Hammadde, Yarı mamul, Mamul, Sarf, Demirbaş. Yalnız ihtiyacın olan sayfaları doldur.'],
        ['2. Satır ekle', 'Her satır bir malzeme kartıdır. 2. satırdaki gri örnek satır (İşlem: Atla) okunmaz; silebilir ya da üzerine yazabilirsin.'],
        ['3. Zorunlu sütunlar', 'Başlığı sarı ve * işaretli sütunlar zorunludur. Yeşilimsi başlıklar isteğe bağlıdır. Gri başlıklar (Kart ID, Teknik kod, Onay durumu) dışa aktarımda dolar, elle doldurma. Başlık hücresinin notunda açıklama vardır.'],
        ['4. Listeden seç', 'Açılır listeli hücrelerde değeri listeden seç (Aile › Sınıf, kalite, form, kategori, birim, durum …). Listeler "Listeler" sayfasındadır ve uygulamadaki Malzeme ayarlarını yansıtır.'],
        ['5. Birden fazla değer', 'İşlemler, testler, sertifikalar gibi çoklu alanlarda değerleri virgülle ayır: "Kumlama, Boyama".'],
        ['6. Ölçüler', 'Hammaddede yalnız seçtiğin formun ölçülerini doldur. Başlık notu hangi ölçünün hangi formda ne anlama geldiğini söyler (ör. t: levhada kalınlık, boruda et kalınlığı; D: boru dış çapı). Birim başlıkta yazar (çoğunlukla mm).'],
        ['7. Rota', 'Yarı mamul ve mamulde "10 TST; 20 TRN; 30 BM" biçiminde; numarasız yazarsan 10\'ar verilir. Kodlar Listeler sayfasındaki Operasyonlar sütunundadır.'],
        ['8. Tarihler', 'Demirbaş tarihleri GG.AA.YYYY ya da Excel tarih hücresi olabilir.'],
        ['9. Boş bırakınca', 'Stok kodu boşsa kod yapısına göre otomatik verilir. Malzeme adı ve Açıklama 1-3 boşsa seçimlerden türetilir.'],
        ['', ''], ['Güncelleme', ''], ['Dışa aktar → düzelt → içe aktar', 'Uygulamadan "Excel\'e aktar" ile aldığın dosyada İşlem "Güncelle", Kart ID dolu gelir. Değiştirdiğin hücreler karta yazılır; boş bıraktığın hücreler kartta değişmez. Yeni satır için İşlem\'i boş bırak ya da "Ekle" seç.'],
        ['İçe aktarım', 'Uygulamada Katalog → "Excel" → "Excel\'den içe aktar". Önce her satırın sonucu gösterilir (eklenecek, güncellenecek, değişmeyen, mükerrer, hatalı); onaylayınca kartlar oluşturulur. Onay akışı açıksa yeni kartlar "Onay bekliyor" olur.'],
    ] satisfies [string, string][]).forEach(([a, b]) => { if (!a) {
        nr++;
        return;
    } if (!b) {
        hucre(nr++, 2, a, { name: 'Arial', size: 11, bold: true });
        return;
    } hucre(nr, 2, a, FB); hucre(nr, 3, b, F); nr++; });
    nr++;
    hucre(nr++, 2, 'Başlık renkleri', { name: 'Arial', size: 11, bold: true });
    ([['Zorunlu', RENK.zorunlu], ['İsteğe bağlı', RENK.normal], ['Otomatik / salt okunur', RENK.oto]] satisfies [string, string][]).forEach(([a, c]) => { const x = hucre(nr++, 2, a, FB); x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } }; });
    // --- Listeler
    const L = wb.addWorksheet('Listeler', { properties: { tabColor: { argb: 'FF8E979B' } } });
    const listeler: { ad: string; v: string[] }[] = [];
    const listeEkle = (ad: string, vals: readonly unknown[] | null | undefined): string | null => {
        const v = [...new Set((vals || []).map(x => String(x)))].filter(Boolean);
        if (!v.length)
            return null;
        const ix = listeler.length;
        listeler.push({ ad, v });
        const col = ix + 1;
        L.getCell(1, col).value = ad;
        L.getCell(1, col).font = FB;
        L.getCell(1, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RENK.normal } };
        v.forEach((x, i) => { const c = L.getCell(i + 2, col); c.value = x; c.font = F; });
        L.getColumn(col).width = Math.min(48, Math.max(14, ad.length + 2, ...v.map((x) => x.length * 0.9)));
        const harf = L.getColumn(col).letter;
        return `Listeler!$${harf}$2:$${harf}$${v.length + 1}`;
    };
    const aileSinif: string[] = [];
    Object.entries(FAMS).filter(([k, f]) => !f.gizli).forEach(([fk, f]) => Object.entries(f.classes).filter(([ck, c]) => !c.gizli).forEach(([ck]) => aileSinif.push(aileSinifAd(fk, ck))));
    const kaliteler: string[] = [];
    Object.values(FAMS).filter(f => !f.gizli).forEach(f => Object.values(f.classes).filter(c => !c.gizli).forEach(c => c.grades.filter(g => !g.gizli).forEach(g => kaliteler.push(g.kod))));
    const ref: Sozluk<string | null> = { aileSinif: listeEkle('Aile › Sınıf', aileSinif), kalite: listeEkle('Kalite kodu', kaliteler) };
    listeEkle('Operasyonlar (kod — ad)', opListe().map(o => `${o.kod} — ${o.ad}`));
    listeEkle('Sertifikalar', SERTIFIKA);
    // --- tür sayfaları
    turler.forEach(tur => {
        const kol = xlKolonlar(tur);
        const ws = wb.addWorksheet(XL_SAYFA[tur], { views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }] });
        ws.columns = kol.map(c => ({ header: c.baslik, key: c.id, width: Math.min(40, Math.max(11, c.baslik.length + 3, c.id === 'aileSinif' ? 34 : 0, /^com\.ac/.test(c.id) ? 30 : 0)) }));
        const h = ws.getRow(1);
        h.height = 32;
        kol.forEach((c, i) => {
            const cell = h.getCell(i + 1);
            cell.font = { ...FB, color: { argb: 'FF1C2427' } };
            cell.alignment = { wrapText: true, vertical: 'middle' };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.oto ? RENK.oto : c.zorunlu ? RENK.zorunlu : RENK.normal } };
            cell.border = { bottom: { style: 'thin', color: { argb: 'FF8E979B' } } };
            if (c.not)
                cell.note = { texts: [{ text: c.not, font: { name: 'Arial', size: 9 } }], margins: { insetmode: 'auto' } };
        });
        const sonSatir = Math.max(1000, (kayitlar ? kayitlar.length : 0) + 500);
        kol.forEach((c, i) => {
            if (!c.liste)
                return;
            const harf = ws.getColumn(i + 1).letter;
            const r = typeof c.liste === 'string' ? ref[c.liste] : listeEkle(`${XL_SAYFA[tur]}: ${c.baslik.replace(/ \*$/, '')}`, c.liste);
            if (!r)
                return;
            ws.dataValidations.add(`${harf}2:${harf}${sonSatir}`, { type: 'list', allowBlank: true, formulae: [r], showErrorMessage: true, errorStyle: c.id === 'islem' || c.id === 'form' || c.id === 'g.kat' || c.id === 'aileSinif' ? 'stop' : 'information', errorTitle: 'Listede yok', error: 'Bu değer listede yok. Listeden seçmen önerilir.' });
        });
        kol.forEach((c, i) => { const col = ws.getColumn(i + 1); if (c.tip === 'tarih')
            col.numFmt = 'dd.mm.yyyy'; if (c.tip === 'sayi')
            col.numFmt = '0.###'; });
        const yaz = (vals: XlSatirVerisi, ornek: boolean): void => {
            const o: Sozluk<unknown> = {};
            // Desen yalnız metinde tutar (RegExp.test değeri metne çevirir); tarih hücresi ISO metnidir.
            kol.forEach(c => { let v = vals[c.id]; if (v === undefined || v === '')
                v = null; if (c.tip === 'tarih' && v && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
                const s = v as string;
                v = s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4);
            } o[c.id] = v; });
            const row = ws.addRow(o);
            row.eachCell({ includeEmpty: true }, cell => { cell.font = ornek ? { name: 'Arial', size: 10, italic: true, color: { argb: RENK.ornek } } : F; });
        };
        const liste = kayitlar ? kayitlar.filter(x => (x.tur || 'hammadde') === tur) : [];
        if (!liste.length)
            yaz(xlOrnek(tur), true);
        liste.forEach(x => yaz(xlSatir(x, tur), false));
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: kol.length } };
    });
    wb.views = [{ activeTab: kayitlar ? 2 : 0 }];
    return kitap;
}
export function xlOrnek(tur: TurAdi): XlSatirVerisi {
    const o: XlSatirVerisi = { islem: 'Atla' };
    if (tur === 'hammadde')
        Object.assign(o, { 'com.ad': '', 'aileSinif': FAMS.metal && FAMS.metal.classes.islah ? aileSinifAd('metal', 'islah') : '', 'grade': '42CRMO4', 'stds': 'EN 10083-3, ASTM A29/A29M', 'form': 'Yuvarlak çubuk', 'dims.d': 50, 'dims.l': 6000, 'tol': 'EN 10060', 'opts.durum': 'Islah (+QT)', 'opts.yuzey': 'Siyah (hadde)', 'com.ted': 'Örnek Çelik A.Ş.', 'com.birim': 'adet', 'com.sertifika': 'EN 10204 3.1', 'com.not': 'ÖRNEK SATIR — okunmaz' });
    if (tur === 'yarimamul')
        Object.assign(o, { 'g.ad': 'Motor bağlantı braketi', 'g.tip': ((ALAN.ym_tanim || []).find(a => a.k === 'tip')?.opts || [''])[0], 'g.resim': 'TR-2045-01', 'g.rev': 'A', 'g.net': 1.25, 'ops': '10 TST; 20 TRN; 30 FRZ; 40 BM', 'com.birim': 'adet', 'g.tedarik': 'Üretim', 'com.not': 'ÖRNEK SATIR — okunmaz' });
    if (tur === 'mamul')
        Object.assign(o, { 'g.ad': 'Hidrolik güç ünitesi', 'g.model': 'HGU-7,5', 'g.marka': 'Örnek', 'ops': '10 MNT; 20 FNT; 30 PKT', 'com.birim': 'adet', 'g.gtin': '8690000000005', 'g.gtip': '8412.21', 'g.mensei': 'Türkiye', 'com.not': 'ÖRNEK SATIR — okunmaz' });
    if (tur === 'sarf')
        Object.assign(o, { 'g.kat': (SARF_KAT.kaynak || ({} as Partial<Kategori>)).ad, 'g.tur': 'Gazaltı teli (MIG/MAG)', 'g.sinif': 'AWS A5.18 ER70S-6', 'g.cap': 1.2, 'g.ambalaj': '15 kg makara', 'g.marka': 'Örnek', 'com.birim': 'makara', 'com.not': 'ÖRNEK SATIR — okunmaz' });
    if (tur === 'demirbas')
        Object.assign(o, { 'g.kat': (DB_KAT.olcu || ({} as Partial<Kategori>)).ad, 'g.ad': 'Dijital kumpas 0-150 mm', 'g.marka': 'Örnek', 'g.seri': 'SN123', 'g.konum': 'Kalite kontrol', 'g.alis': '2025-03-01', 'g.kalibrasyon': 'Gerekli', 'g.kalAy': 12, 'g.sonKal': '2025-09-15', 'com.birim': 'adet', 'com.not': 'ÖRNEK SATIR — okunmaz' });
    return o;
}
// Sayfa adından satırlara; her satır hücre değerlerinin dizisidir, ilk satır başlıktır.
export type XlSayfalar = Sozluk<unknown[][] | undefined>;
export function xlSatirlariOku(sayfalar: XlSayfalar): XlOkunanSatir[] {
    const out: XlOkunanSatir[] = [];
    // XL_SAYFA'nın anahtarları malzeme türleridir.
    for (const [tur, ad] of Object.entries(XL_SAYFA) as [TurAdi, string][]) {
        const benzer = Object.keys(sayfalar).find(k => _nm(k) === _nm(ad));
        const rows = sayfalar[ad] || (benzer === undefined ? undefined : sayfalar[benzer]);
        if (!rows || !rows.length)
            continue;
        const kol = xlKolonlar(tur);
        const bas: Sozluk<string> = {};
        const tem = (x: unknown): string => String(x ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
        (rows[0] || []).forEach((h, i) => { const ham = tem(h); if (!ham)
            return; const t = _nm(ham); let k = kol.find(x => tem(x.baslik) === ham); if (!k) {
            const l = kol.filter(x => _nm(tem(x.baslik)) === t);
            if (l.length === 1)
                k = l[0];
        } if (!k) {
            const l = kol.filter(x => _nm(tem(x.baslik)).startsWith(t));
            if (l.length === 1)
                k = l[0];
        } if (k && !Object.values(bas).includes(k.id))
            bas[i] = k.id; });
        rows.slice(1).forEach((row, ri) => {
            const r: XlSatirVerisi = {};
            (row || []).forEach((v, i) => { if (bas[i] !== undefined && v !== null && v !== undefined && v !== '')
                r[bas[i]] = v; });
            const dolu = Object.entries(r).some(([k, v]) => k !== 'islem' && !_xlBos(v));
            if (!dolu)
                return;
            out.push({ tur, sayfa: ad, satir: ri + 2, r });
        });
    }
    return out;
}
export function xlPlan(satirlar: readonly XlOkunanSatir[], katalog?: readonly Taslak[] | null): XlPlanSatiri[] {
    katalog = katalog || _katalog();
    const plan: XlPlanSatiri[] = [];
    const kodlar: string[] = [];
    satirlar.forEach(s => {
        const isl = _asc(s.r.islem || '').toLowerCase().replace(/[^a-z]/g, '');
        const p: XlPlanSatiri = { ...s, islem: isl === 'atla' ? 'atla' : isl === 'guncelle' ? 'guncelle' : 'ekle', hatalar: [], uyarilar: [], kayit: null, eslesen: null, mukerrer: [] };
        if (p.islem === 'atla') {
            plan.push(p);
            return;
        }
        const id = _xlStr(s.r.id), kod = _xlStr(s.r['com.kod']);
        const es = (id && katalog.find(x => x.id === id)) || (kod && katalog.find(x => x.com && x.com.kod === kod)) || null;
        if (p.islem === 'guncelle' && !es) {
            p.hatalar.push(id || kod ? 'Güncellenecek kart bulunamadı (Kart ID / stok kodu).' : 'Güncelleme için Kart ID ya da stok kodu gerekli.');
            plan.push(p);
            return;
        }
        if (p.islem === 'ekle' && es) {
            if (id && es.id === id) {
                p.islem = 'guncelle';
            }
            else {
                p.hatalar.push(`${kod} stok kodu katalogda zaten var; güncellemek için İşlem'i "Güncelle" yap.`);
                plan.push(p);
                return;
            }
        }
        // Buradan sonra "guncelle" satırının eşleşen kartı vardır (yoksa yukarıda döndü).
        if (p.islem === 'guncelle' && (es!.tur || 'hammadde') !== s.tur) {
            p.hatalar.push(`Kart ${TURLER[es!.tur || 'hammadde']!.ad} türünde; ${s.sayfa} sayfasından güncellenemez.`);
            plan.push(p);
            return;
        }
        const res = xlSatirdanKart(s.tur, s.r, p.islem === 'guncelle' ? es : null);
        p.hatalar.push(...res.hatalar);
        p.uyarilar.push(...res.uyarilar);
        p.kayit = res.kayit;
        p.eslesen = es;
        if (p.islem === 'ekle' && p.kayit)
            p.kayit.id = 'xl_' + s.sayfa + '_' + s.satir;
        if (p.islem === 'guncelle' && !p.hatalar.length) {
            p.farklar = diffItems(es!, p.kayit);
            const bf = birimFarki(es!, { com: { birim: finalBirim(p.kayit) } } as Taslak);
            if (bf && !p.farklar.some(x => x.f === bf.f))
                p.farklar.push(bf);
            if (!p.farklar.length)
                p.islem = 'ayni';
        }
        if (!p.hatalar.length && p.islem === 'ekle') {
            const b = benzerKartlar(p.kayit, [...katalog, ...plan.filter(x => x.kayit && x.islem === 'ekle' && !x.hatalar.length).map(x => x.kayit!)]).filter(r => r.seviye === 'ayni');
            p.mukerrer = b.map(r => String(r.x.id || '').startsWith('xl_') ? String(r.x.id).replace(/^xl_/, '').replace(/_(\d+)$/, ' satır $1') : ((r.x.com && r.x.com.kod) || '?'));
        }
        if (!p.hatalar.length && kod && p.islem === 'ekle') {
            if (kodlar.includes(kod))
                p.hatalar.push(`${kod} stok kodu dosyada birden fazla kez geçiyor.`);
            kodlar.push(kod);
        }
        plan.push(p);
    });
    return plan;
}
