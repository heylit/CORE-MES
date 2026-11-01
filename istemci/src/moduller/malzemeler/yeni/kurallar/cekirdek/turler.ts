import type { Nesne, ReceteSatiri, Revizyon, RevizyonFarki } from '../../tipler.ts';
import { ALAN, BIRIM_T, D, DB_KAT, FAM_ICON, G_ALAN_IKON, HZ_KAT, KAT_ICON, OPT_ICON, SARF_KAT, Store, TURLER, TUR_ICON, myUid } from './durum.ts';
import { prices } from './fiyat.ts';
import { specHTML__0, specMD__0 } from './foy.ts';
import { flatItem__0 } from './karsilastirma.ts';
import { stokOzeti__0 } from './kilavuz.ts';
import { alanZorunlu, flatItem, kalipUygula, kodGrubu, turKurali } from './kod-yapisi.ts';
import { _nm } from './onay.ts';
import { bomSatirlari, gUyarilar, rota } from './operasyon.ts';
import type { KartBelgesi } from './hizli-arama.ts';
import { Host } from './ortam.ts';
import { autoAd__0, autoKod__0, autoStd__0, dimsStr__0, finalAd, finalBirim__0, finalKod, weight__0 } from './taslak.ts';
import type { Agirlik, Alan, DemirbasKategorisi, HizmetCesidi, HizmetKategorisi, Kategori, Sozluk, Taslak, Tur, TurAdimi } from './tipler.ts';
import { compatIssues__0 } from './uyumluluk.ts';
import type { UyumSorunu } from './uyumluluk.ts';
import { cleanKod, esc, fmt, fmtD, isNum, parseNum, r4 } from './yardimcilar.ts';

// Türün alan değerleri (taslağın `g`'si). Yalnız metin ya da liste olarak işlenen alanlar adıyla yazılır; gerisi kullanıldığı yerde daraltılır.
export interface TurDegerleri {
    kat?: string;
    cesit?: string;
    std?: string;
    sinif?: string;
    tur?: string;
    marka?: string;
    yontem?: string;
    durum?: string;
    kalibrasyon?: string;
    uygun?: string[];
    ghs?: string[];
    [alan: string]: unknown;
}
// Karta eklenmiş belge (fatura, SDS, sertifika ...).
export interface Belge extends KartBelgesi { ad: string; tip?: string; url?: string }
// Yarı mamulden hizmete kadar türlerin taslağı; Taslak buna olduğu gibi verilir.
export interface TurTaslagi extends Taslak { g: TurDegerleri; docs?: Belge[] }
// Düz satır: [bölüm, alan, değer].
export type DuzSatir = [string, string, string];
export interface BomSatiri extends ReceteSatiri { it: Taslak | null | undefined; q: number; birimFiyat: number | null; tutar: number | null; pb: unknown; kg: number | null }
export interface Maliyet { malzeme: number; iscilik: number; toplam: number; dakika: number; eksikFiyat: number; paraBirimleri: unknown[]; bomKg: number }
export interface TakvimKaydi { ad: string; son?: Date; sonraki: Date; kalanGun: number; bitis?: boolean }

export function birimFarki(onceki: Taslak | null | undefined, yeni: Taslak | null | undefined): RevizyonFarki | null {
    const b = yeni && yeni.com ? String(yeni.com.birim || '').trim() : '';
    return b && !String((onceki && onceki.com && onceki.com.birim) || '').trim() ? { f: 'Stok birimi', a: '—', b } : null;
}
export function diffItems(a: Taslak, b: Taslak): RevizyonFarki[] {
    const skip = /^(Kod ve açıklama\||Eşdeğerler\||Form ve ölçüler\|(Ağırlık|Metre ağırlığı|m² ağırlığı)|Ticari\|(kg fiyatı|Parça fiyatı))/;
    const m = (rows: DuzSatir[]): Sozluk<string> => Object.fromEntries(rows.map(([s, k, v]) => [s + '|' + k, v]));
    const A = m(flatItem(a, true)), B = m(flatItem(b, true));
    const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])].filter(k => !skip.test(k));
    return keys.filter(k => (A[k] ?? '—') !== (B[k] ?? '—')).map(k => ({ f: k.split('|')[1]!, a: A[k] ?? '—', b: B[k] ?? '—' })).slice(0, 40);
}
export function withRev(item: Taslak, prev?: Taslak | null): Taslak {
    const entry: Revizyon = { t: Date.now(), by: myUid || null };
    if (Host.on && Host.kullaniciAd)
        entry.byAd = Host.kullaniciAd;
    if (!prev) {
        entry.yeni = true;
        item.rev = [entry];
        return item;
    }
    entry.ch = diffItems(prev, item);
    item.rev = [...(prev.rev || []), entry].slice(-30);
    return item;
}
export function katIkon(tur: string, kat: unknown): string | null { return (KAT_ICON[tur] && KAT_ICON[tur][kat as string]) || null; }
export function kartIkon(x: TurTaslagi | null | undefined): string | undefined { if (!x)
    return TUR_ICON.hammadde; if (isGen(x))
    return katIkon(x.tur, x.g && x.g.kat) || TUR_ICON[x.tur]; return FAM_ICON[x.fam as string] || TUR_ICON.hammadde; }
export function gAlanIkon(a: Alan, d: TurTaslagi = D): string | undefined { const m = G_ALAN_IKON[a.k]; if (m === '@olcu')
    return KAT_ICON.demirbas!.olcu; if (m && OPT_ICON[m])
    return OPT_ICON[m]; return katIkon(d.tur, d.g && d.g.kat) || TUR_ICON[d.tur] || OPT_ICON.wrench; }
// Prototipte kart deposu yoksa sayfanın genel kataloğuna düşülürdü; çekirdekte depo hep vardır.
export function _katalog(): Taslak[] { return Store.items; }
export function isGen(d: Taslak | null | undefined): boolean { return (!!(d && d.tur && d.tur !== 'hammadde')); }
export function sarfKat(d: TurTaslagi): Kategori | null { return SARF_KAT[(d.g && d.g.kat) as string] || null; }
export function dbKat(d: TurTaslagi): DemirbasKategorisi | null { return DB_KAT[(d.g && d.g.kat) as string] || null; }
export function hzKat(d: TurTaslagi): HizmetKategorisi | null { return HZ_KAT[(d.g && d.g.kat) as string] || null; }
export function hzCesit(d: TurTaslagi): HizmetCesidi | null { const k = hzKat(d); return (k && d.g.cesit && k.cesitler!.find(c => c.ad === d.g.cesit)) || null; }
export function hzCesitAdi(d: TurTaslagi): string { const c = hzCesit(d); return !c ? '' : c.diger ? String(d.g.cesitAd || '').trim() : (c.kisa || c.ad); }
export function HZ_YON(): Alan[] { return (ALAN.hz_tanim!.filter(a => a.k === 'yon')); }
export function HZ_SON(): Alan[] { return (ALAN.hz_tanim!.filter(a => a.k !== 'yon')); }
export function hzAlanlari(d: TurTaslagi): Alan[] { const k = hzKat(d); const c = hzCesit(d); return [...HZ_YON(), ...(k ? [k.cesitAlani!] : []), ...(c ? [c.stdAlani!, ...c.alanlar!] : []), ...HZ_SON()]; }
export function _hzDeger(d: TurTaslagi, a: Alan): string { const v = gAlanDegeri(d, a); return a.tip === 'sec' ? v.replace(/\s*\(.*\)$/, '') : v; }
export function hzOnerilenAd(d: TurTaslagi): string { const c = hzCesit(d); if (!c)
    return (hzKat(d) || {} as Partial<HizmetKategorisi>).ad || ''; const g: TurDegerleri = d.g || {}; return [hzCesitAdi(d), String(g.std || '').trim(), ...c.alanlar!.filter(a => a.ada && a.k !== 'cesitAd' && gAlanGorunur(d, a)).map(a => _hzDeger(d, a))].filter(Boolean).join(' '); }
export function hzKodu(d: TurTaslagi): string { const c = hzCesit(d); const k = hzKat(d); return (c && c.kod) || (k && k.kod) || 'DGR'; }
export function hzImza(d: TurTaslagi): string { const c = hzCesit(d); if (!c)
    return ''; const g: TurDegerleri = d.g || {}; return ['HZ', _nm(g.yon || ''), g.kat, _nm(hzCesitAdi(d)), _nm(g.std || ''), JSON.stringify(c.alanlar!.filter(a => a.k !== 'cesitAd' && gAlanGorunur(d, a)).map(a => [a.k, _nm(gAlanDegeri(d, a))]))].join('|'); }
export function katTablosu(t: unknown): Sozluk<Kategori> { return (t === 'sarf' ? SARF_KAT : t === 'demirbas' ? DB_KAT : t === 'hizmet' ? HZ_KAT : {}); }
export function turKat(d: TurTaslagi | null | undefined): Kategori | null { return (katTablosu(d && d.tur)[(d && d.g && d.g.kat) as string] || null); }
export function _gnum(v: unknown): number | null { return (isNum(v) ? v : (isNum(parseNum(v)) ? parseNum(v) as number : null)); }
export function _tarih(s: unknown): Date | null { if (!s)
    return null; const t = new Date(s + 'T00:00:00'); return isNaN(+t) ? null : t; }
export function _ayEkle(t: Date, ay: number): Date { const r = new Date(t); r.setMonth(r.getMonth() + ay); return r; }
export function _tStr(t: Date | null | undefined): string { return (t ? t.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''); }
// Takvim tarihleri yerel gece yarısıdır (_tarih); toISOString UTC gününü verir, Türkiye'de bir gün geri düşer.
export function _isoGun(t: Date): string { return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; }
export function _gun(a: Date, b: Date): number { return (Math.round((+a - +b) / 86400000)); }
export function turAdimlari(d: TurTaslagi = D): TurAdimi[] {
    const t = d.tur;
    if (t === 'yarimamul')
        return [{ ad: 'Tanım', help: 'Parçanın adı, tipi ve teknik resim bilgileri.', alanlar: ALAN.ym_tanim }, { ad: 'Operasyonlar', help: 'Üretim rotası: soldan operasyon seç; her satırda numara ve kod belirlenir.', ozel: 'ops' }, { ad: 'Ölçü ve kalite', help: 'Genel ölçüler, ağırlık, tolerans ve kontrol planı.', alanlar: ALAN.ym_olcu }, { ad: 'Ticari bilgiler', help: 'Kod, ad, birim ve tedarik tipi.', ozel: 'ticari' }, { ad: 'Özet ve kayıt', help: 'Kartı kontrol et ve kataloğa kaydet.', ozel: 'ozet' }];
    if (t === 'mamul')
        return [{ ad: 'Tanım', help: 'Ürünün adı, grubu, modeli ve teknik resim bilgileri.', alanlar: ALAN.mm_tanim }, { ad: 'Operasyonlar', help: 'Montaj, test ve paketleme gibi son işlemler.', ozel: 'ops' }, { ad: 'Ambalaj ve uygunluk', help: 'Ürün ölçüleri, ambalaj, uygunluk işaretleri ve garanti.', alanlar: ALAN.mm_ambalaj }, { ad: 'Ticari bilgiler', help: 'Kod, ad, stok birimi, barkod (GTIN) ve gümrük bilgileri.', ozel: 'ticari' }, { ad: 'Özet ve kayıt', help: 'Kartı kontrol et ve kataloğa kaydet.', ozel: 'ozet' }];
    if (t === 'sarf') {
        const k = sarfKat(d);
        return [{ ad: 'Özellikler', help: k ? `${k.ad} için teknik özellikler.` : 'Önce bir kategori seç.', alanlar: k ? k.alanlar : [] }, { ad: 'Ticari bilgiler', help: 'Marka, birim, ambalaj, sipariş noktası ve tedarik bilgileri.', ozel: 'ticari' }, { ad: 'Özet ve kayıt', help: 'Kartı kontrol et ve kataloğa kaydet.', ozel: 'ozet' }];
    }
    if (t === 'demirbas') {
        const k = dbKat(d);
        return [{ ad: 'Kimlik ve konum', help: 'Demirbaşın marka, model, seri numarası, konumu ve zimmeti.', alanlar: [...ALAN.db_kimlik!, ...(k ? k.alanlar : [])] }, { ad: 'Satın alma ve garanti', help: 'Alış tarihi, fatura, tedarikçi ve garanti bilgileri.', ozel: 'alis', alanlar: ALAN.db_alis }, { ad: 'Bakım ve kalibrasyon', help: 'Bakım ve kalibrasyon periyotları; sonraki tarihler otomatik hesaplanır.', alanlar: ALAN.db_bakim, ozel: 'bakim' }, { ad: 'Belgeler ve notlar', help: 'Fatura, garanti belgesi, kalibrasyon sertifikası, kullanım kılavuzu.', ozel: 'belge' }, { ad: 'Özet ve kayıt', help: 'Kartı kontrol et ve kataloğa kaydet.', ozel: 'ozet' }];
    }
    if (t === 'ticari_mal')
        return [{ ad: 'Tanım', help: 'Ürünün adı, grubu, markası ve üretici kodu. Ticari mal üretilmez; operasyon ve reçete yoktur.', alanlar: ALAN.tm_tanim }, { ad: 'Ticari bilgiler', help: 'Kod, ad, birim, tedarikçi, depo yeri ve barkod.', ozel: 'ticari' }, { ad: 'Özet ve kayıt', help: 'Kartı kontrol et ve kataloğa kaydet.', ozel: 'ozet' }];
    if (t === 'hizmet') {
        const k = hzKat(d);
        return [{ ad: 'Hizmet tanımı', help: k ? `${k.ad}: yönü ve çeşidi; çeşidin standardı ve isterleri. Aynı iş hem alınıp hem veriliyorsa iki kart açılır.` : 'Önce bir hizmet grubu seç.', alanlar: hzAlanlari(d) }, { ad: 'Ticari bilgiler', help: 'Kod, ad, birim ve tedarikçi. Hizmet stoklanmaz; depo yeri yoktur.', ozel: 'ticari' }, { ad: 'Özet ve kayıt', help: 'Kartı kontrol et ve kataloğa kaydet.', ozel: 'ozet' }];
    }
    return [];
}
export function gAlanDegeri(d: TurTaslagi, a: Alan): string { const v = d.g && d.g[a.k]; if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length))
    return ''; if (Array.isArray(v))
    return v.join(', '); if (a.tip === 'tarih')
    return _tStr(_tarih(v)); if (a.tip === 'num')
    return fmt(v) + (a.u ? ' ' + a.u : ''); return String(v); }
export function gAlanGorunur(d: TurTaslagi, a: Alan): unknown { try {
    return !a.kosul || a.kosul(d);
}
catch (e) {
    return true;
} }
export function gStepOk(i: number, d: TurTaslagi = D): boolean {
    if (i === 0)
        return !!d.tur && (d.tur === 'yarimamul' || d.tur === 'mamul' || d.tur === 'ticari_mal' || (d.tur === 'sarf' && !!sarfKat(d)) || (d.tur === 'demirbas' && !!dbKat(d)) || (d.tur === 'hizmet' && !!hzKat(d)));
    const st = turAdimlari(d)[i - 1];
    if (!st)
        return true;
    for (const a of (st.alanlar || []))
        if (alanZorunlu(d, a) && gAlanGorunur(d, a) && !gAlanDegeri(d, a))
            return false;
    return true;
}
export function gEksik(i: number, d: TurTaslagi = D): string { const st = turAdimlari(d)[i - 1]; if (!st)
    return ''; const a = (st.alanlar || []).find(a => alanZorunlu(d, a) && gAlanGorunur(d, a) && !gAlanDegeri(d, a)); return a ? a.ad : ''; }
export function bomSatirlari__0(d: TurTaslagi, derin = 0): BomSatiri[] {
    return (d.bom || []).map(r => {
        const it = r.ref ? _katalog().find(x => x.id === r.ref) : null;
        const m = _gnum(r.miktar) || 0, f = _gnum(r.fire) || 0, q = m * (1 + f / 100);
        let bf: number | null = null, kg: number | null = null, pb: unknown = null;
        if (it && (it.tur === 'yarimamul' || it.tur === 'mamul')) {
            const c = derin < 5 ? gMaliyet(it, derin + 1) : null;
            bf = (c && c.toplam > 0) ? c.toplam : _gnum(it.com && it.com.fiyat);
            pb = (it.com && it.com.pb) || null;
            const nk = _gnum(it.g && it.g.net) || (c && c.bomKg) || null;
            if (isNum(nk) && !['kg', 'm', 'm²'].includes(r.birim as string))
                kg = q * nk;
            else if (r.birim === 'kg')
                kg = q;
        }
        else if (it) {
            const pr = prices(it);
            const key = ({ kg: 'kg', m: 'm', 'm²': 'm²' } as Sozluk<'kg' | 'm' | 'm²'>)[r.birim as string] || 'adet';
            bf = pr && isNum(pr[key]) ? pr[key] as number : null;
            pb = it.com && it.com.pb;
            const w = weight(it);
            if (r.birim === 'kg')
                kg = q;
            else if (r.birim === 'm' && w && isNum(w.perM))
                kg = q * w.perM;
            else if (r.birim === 'm²' && w && isNum(w.perM2))
                kg = q * w.perM2;
            else if (w && isNum(w.kg) && !['kg', 'm', 'm²'].includes(r.birim as string))
                kg = q * w.kg;
        }
        else {
            bf = _gnum(r.fiyat);
            pb = r.fiyat !== undefined && r.fiyat !== '' ? (d.com && d.com.pb) || 'TRY' : null;
            if (r.birim === 'kg')
                kg = q;
        }
        return { ...r, it, q, birimFiyat: bf, tutar: isNum(bf) ? bf * q : null, pb, kg };
    });
}
export function gMaliyet(d: TurTaslagi = D, derin = 0): Maliyet {
    const rows = bomSatirlari(d, derin);
    const malz = rows.reduce((a, r) => a + (isNum(r.tutar) ? r.tutar : 0), 0);
    const eksik = rows.filter(r => !isNum(r.tutar)).length;
    const dk = (d.ops || []).reduce((a, o) => a + (_gnum(o.sure) || 0), 0);
    const su = _gnum(d.g && d.g.saat);
    const isc = isNum(su) ? dk / 60 * su : 0;
    const pbs = [...new Set(rows.map(r => r.pb).filter(Boolean))];
    return { malzeme: malz, iscilik: isc, toplam: malz + isc, dakika: dk, eksikFiyat: eksik, paraBirimleri: pbs, bomKg: rows.reduce((a, r) => a + (isNum(r.kg) ? r.kg : 0), 0) };
}
export function gTarihler(d: TurTaslagi = D): TakvimKaydi[] {
    const g: TurDegerleri = d.g || {};
    const out: TakvimKaydi[] = [];
    const k = dbKat(d);
    const ekle = (ad: string, son: unknown, ay: unknown) => { const t = _tarih(son); const a = _gnum(ay); if (t && a) {
        const n = _ayEkle(t, a);
        out.push({ ad, son: t, sonraki: n, kalanGun: _gun(n, new Date()) });
    } };
    ekle('Bakım', g.sonBakim, g.bakimAy ?? (k && k.bakim));
    // 885 a: aleti bağlı kartın vadesi Kalibrasyon'dadır; eski tarihler yalnız bağsız kartta hesaplanır.
    if (g.kalibrasyon === 'Gerekli' && !g.aletNo)
        ekle('Kalibrasyon', g.sonKal, g.kalAy ?? 12);
    if (k && k.periyodik)
        ekle('Periyodik kontrol', g.periyodik, g.periyodikAy ?? 12);
    ([['Garanti', g.garantiBitis], ['Muayene', g.muayene], ['Sigorta / kasko', g.sigorta]] satisfies [string, unknown][]).forEach(([ad, s]) => { const t = _tarih(s); if (t)
        out.push({ ad, sonraki: t, kalanGun: _gun(t, new Date()), bitis: true }); });
    return out;
}
export function gtinGecerli(s: unknown): boolean { s = String(s || '').replace(/\s/g, ''); if (!/^\d{8}$|^\d{12,14}$/.test(s as string))
    return false; const n = (s as string).split('').map(Number); const c = n.pop(); let t = 0; n.reverse().forEach((x, i) => t += x * (i % 2 === 0 ? 3 : 1)); return (10 - t % 10) % 10 === c; }
export function gSira(d: Taslak, onek: string): string { let m = 0; const re = new RegExp('^' + onek.replace(/[-]/g, '\\-') + '(\\d{4,})$'); _katalog().forEach(x => { if (x.id === d.id)
    return; const r = re.exec(x.com && x.com.kod || ''); if (r)
    m = Math.max(m, +r[1]!); }); return String(m + 1).padStart(4, '0'); }
export function gKod(d: TurTaslagi): string {
    const t = TURLER[d.tur]!;
    const g: TurDegerleri = d.g || {};
    if (d.tur === 'sarf') {
        const k = sarfKat(d);
        const on = `SF-${k ? k.kod : 'GEN'}-`;
        return on + gSira(d, on);
    }
    if (d.tur === 'demirbas') {
        const k = dbKat(d);
        const on = `DB-${k ? k.kod : 'DGR'}-`;
        return on + gSira(d, on);
    }
    if (d.tur === 'hizmet') {
        const on = `HZ-${hzKodu(d)}-`;
        return on + gSira(d, on);
    }
    if (d.tur === 'ticari_mal') {
        const on = `TM-${kodGrubu(d)}-`;
        return on + gSira(d, on);
    }
    if (g.resim)
        return `${t.kod}-${cleanKod(g.resim).slice(0, 24)}${g.rev ? '-' + cleanKod(g.rev) : ''}`;
    const on = `${t.kod}-`;
    return on + gSira(d, on);
}
export function gAd(d: TurTaslagi): string {
    const g: TurDegerleri = d.g || {};
    const j = (...a: unknown[]) => a.filter(x => x !== undefined && x !== null && String(x).trim() !== '').join(' ');
    if (d.tur === 'yarimamul')
        return j(g.ad, g.resim ? `(${g.resim}${g.rev ? ' rev ' + g.rev : ''})` : '');
    if (d.tur === 'mamul')
        return j(g.ad, g.model);
    if (d.tur === 'demirbas')
        return j(g.ad, g.marka, g.model) + (g.seri ? `, S/N ${g.seri}` : '');
    if (d.tur === 'hizmet')
        return j(g.ad) || hzOnerilenAd(d);
    if (d.tur === 'ticari_mal')
        return j(g.ad, g.marka, g.model);
    if (d.tur === 'sarf') {
        const k = d.g.kat;
        const m = d.g.marka;
        if (k === 'kaynak')
            return j(g.tur, g.sinif, isNum(g.cap) && g.tur !== 'Koruyucu gaz' ? `Ø${fmt(g.cap)} mm` : '', g.ambalaj ? ',' + ' ' + g.ambalaj : '').replace(' ,', ',');
        if (k === 'takim')
            return j(g.tur, g.malz, g.kaplama && g.kaplama !== 'Kaplamasız' ? g.kaplama : '', isNum(g.cap) ? `Ø${fmt(g.cap)} mm` : '', g.iso);
        if (k === 'asindirici')
            return j(g.tur, g.olcu, g.kum, g.tane);
        if (k === 'kimyasal')
            return j(m, g.tur, g.vg || g.nlgi || '', g.ambalaj ? ',' + ' ' + g.ambalaj : '').replace(' ,', ',');
        if (k === 'kkd')
            return j(g.tur, g.std, g.beden ? 'beden ' + g.beden : '');
        if (k === 'baglanti')
            return j(g.tur, g.std, g.olcu ? (g.olcu + (isNum(g.boy) ? '×' + fmt(g.boy) : '')) : '', g.sinif, g.yuzey);
        if (k === 'ambalaj')
            return j(g.tur, g.olcu, g.malz);
        return j(g.tur, g.olcu, m);
    }
    return '';
}
export function gUyarilar__0(d: TurTaslagi = D): UyumSorunu[] {
    const out: UyumSorunu[] = [];
    const g: TurDegerleri = d.g || {};
    const P = (step: number, s: string, t: string, m: string) => out.push({ step, s, t, m });
    if (d.tur === 'yarimamul' || d.tur === 'mamul') {
        if (d.tur === 'yarimamul' && !(d.ops || []).length)
            P(3, 'warn', 'Operasyonlar', 'Rota tanımlı değil.');
        if (isNum(_gnum(g.net)) && isNum(_gnum(g.brut)) && _gnum(g.net)! > _gnum(g.brut)!)
            P(4, 'warn', 'Ağırlık', 'Net ağırlık brüt ağırlıktan büyük.');
        if (d.tur === 'mamul' && g.gtin && !gtinGecerli(g.gtin))
            P(5, 'no', 'Barkod (GTIN)', 'Kontrol hanesi geçersiz ya da uzunluk 8, 12, 13 veya 14 hane değil.');
        if (d.tur === 'mamul' && (g.uygun || []).includes('ATEX') && !(d.docs || []).length)
            P(5, 'warn', 'ATEX', 'ATEX işaretli ürün için uygunluk beyanı ve sertifika eklenmeli.');
    }
    if (d.tur === 'ticari_mal' && g.gtin && !gtinGecerli(g.gtin))
        P(2, 'no', 'Barkod (GTIN)', 'Kontrol hanesi geçersiz ya da uzunluk 8, 12, 13 veya 14 hane değil.');
    if (d.tur === 'sarf' && g.kat === 'kimyasal') {
        if (!(d.docs || []).some(x => /SDS|Güvenlik bilgi/i.test(x.tip || '')))
            P(2, (g.ghs || []).length ? 'no' : 'warn', 'Güvenlik bilgi formu', 'Kimyasal ürün için SDS (güvenlik bilgi formu) eklenmemiş.');
        if (!isNum(_gnum(g.raf)))
            P(1, 'warn', 'Raf ömrü', 'Kimyasal ürünlerde raf ömrü girilmesi önerilir.');
    }
    if (d.tur === 'sarf' && g.kat === 'asindirici' && ['Kesme diski', 'Taşlama diski', 'Flap disk', 'Fiber disk'].includes(g.tur as string) && !isNum(_gnum(g.devir)))
        P(1, 'warn', 'Maks. devir', 'Disklerde maksimum devir (rpm) iş güvenliği için girilmeli.');
    if (d.tur === 'demirbas') {
        gTarihler(d).forEach(x => { if (x.kalanGun < 0)
            P(3, x.bitis && x.ad === 'Garanti' ? 'warn' : 'no', x.ad, `${x.ad} ${_tStr(x.sonraki)} tarihinde ${x.bitis ? 'bitti' : 'yapılmalıydı'} (${-x.kalanGun} gün geçti).`);
        else if (x.kalanGun <= 30)
            P(3, 'warn', x.ad, `${x.ad} ${_tStr(x.sonraki)} (${x.kalanGun} gün kaldı).`); });
        if (g.kalibrasyon === 'Gerekli' && !g.aletNo)
            P(3, 'warn', 'Kalibrasyon', 'Kalibrasyon gerekli ama ölçü aleti bağlanmamış (Alet no).');
        if (['Hurdaya ayrıldı', 'Satıldı'].includes(g.durum as string))
            P(1, 'warn', 'Durum', `Demirbaş "${g.durum}" durumunda; envanterden çıkış kaydı yapılmalı.`);
    }
    return out;
}
export function gFlat(d: TurTaslagi): DuzSatir[] {
    const rows: DuzSatir[] = [];
    const P = (s: string, k: string, v: unknown) => rows.push([s, k, (v === undefined || v === null || v === '') ? '—' : String(v)]);
    const t = TURLER[d.tur] || {} as Partial<Tur>;
    P('Tanım', 'Kod', finalKod(d));
    P('Tanım', 'Ad', finalAd(d));
    P('Tanım', 'Malzeme türü', t.ad);
    const k = turKat(d);
    if (k)
        P('Tanım', d.tur === 'hizmet' ? 'Hizmet grubu' : 'Kategori', k.ad);
    turAdimlari(d).forEach(st => { (st.alanlar || []).forEach(a => { if (gAlanGorunur(d, a)) {
        const v = gAlanDegeri(d, a);
        if (v)
            P(st.ad, a.ad, v);
    } }); });
    bomSatirlari(d).forEach(r => P('Reçete', (r.it ? r.it.com.kod + ' ' : '') + (r.it ? r.it.com.ad : r.ad || '—'), `${fmt(_gnum(r.miktar) || 0)} ${r.birim || ''}${_gnum(r.fire) ? ` (+%${fmt(_gnum(r.fire))} fire)` : ''}`));
    rota(d).forEach(r => P('Operasyonlar', `${r.no}`, `${r.kod ? r.kod + ' ' : ''}${r.ad}${r.grupAdi ? ' (' + r.grupAdi + ')' : ''}`));
    const cm = d.com || {};
    P('Ticari', 'Stok birimi', finalBirim(d));
    const gg: TurDegerleri = d.g || {};
    ([['tedarik', 'Tedarik tipi'], ...(d.tur === 'sarf' ? [['marka', 'Marka']] satisfies [string, string][] : []), ['urunKodu', 'Üretici ürün kodu'], ['gtin', 'Barkod (GTIN)'], ['gtip', 'GTİP'], ['mensei', 'Menşei'], ['depoYeri', 'Depo yeri'], ['siparisNoktasi', 'Sipariş noktası']] satisfies [string, string][]).forEach(([kk, ad]) => { if (gg[kk])
        P('Ticari', ad, gg[kk]); });
    if (cm.ted)
        P('Ticari', 'Tedarikçi', cm.ted);
    if ((cm.sertifika || []).length)
        P('Ticari', 'Sertifikalar', cm.sertifika.join(', '));
    if (cm.not)
        P('Ticari', 'Notlar', cm.not);
    if ((d.docs || []).length)
        P('Ticari', 'Belgeler', d.docs!.map(x => x.ad).join(', '));
    if (d.tur === 'demirbas') {
        gTarihler(d).forEach(x => P('Takvim', x.ad + (x.bitis ? ' bitiş' : ' (sonraki)'), _tStr(x.sonraki)));
    }
    return rows;
}
export function gStokOzeti(d: TurTaslagi): Nesne {
    const g: TurDegerleri = d.g || {};
    const c = (d.tur === 'yarimamul' || d.tur === 'mamul') ? gMaliyet(d) : null;
    const k = turKat(d);
    const o: Nesne = { stok_kodu: d.com.kod || finalKod(d), stok_adi: d.com.ad || finalAd(d), tur: d.tur, tur_adi: (TURLER[d.tur] || {} as Partial<Tur>).ad, kategori: g.kat || null, kategori_adi: k ? k.ad : null,
        stok_birimi: finalBirim(d), fiyat: isNum(d.com.fiyat) ? d.com.fiyat : null, para_birimi: d.com.pb, tedarikci: d.com.ted || '', min_siparis: isNum(d.com.moq) ? d.com.moq : null,
        sertifikalar: d.com.sertifika || [], belge_sayisi: (d.docs || []).length, uyumluluk_notlari: gUyarilar(d).map(i => ({ seviye: i.s === 'no' ? 'uyumsuz' : 'dikkat', konu: i.t, aciklama: i.m })), ozellikler: { ...g } };
    if (c)
        Object.assign(o, { resim_no: g.resim || '', revizyon: g.rev || '', net_agirlik_kg: _gnum(g.net) ?? (c.bomKg ? r4(c.bomKg) : null), malzeme_maliyeti: r4(c.malzeme), iscilik_maliyeti: r4(c.iscilik), toplam_maliyet: r4(c.toplam),
            recete: bomSatirlari(d).map(r => ({ stok_kodu: r.it ? r.it.com.kod : null, ad: r.it ? r.it.com.ad : r.ad, miktar: _gnum(r.miktar), birim: r.birim, fire_yuzde: _gnum(r.fire) || 0 })),
            rota: (d.ops || []).map((x, i) => ({ sira: i + 1, operasyon: x.ad, istasyon: x.merkez || '', sure_dk: _gnum(x.sure) })), gtin: g.gtin || null, gtip: g.gtip || null });
    // Amortisman finansın sabit kıymet kaydındadır (1596 teyit a); kart kendi kaba hesabını yazmaz, değer yoksa null.
    if (d.tur === 'demirbas')
        Object.assign(o, { demirbas_no: d.com.kod || finalKod(d), seri_no: g.seri || '', konum: g.konum || '', zimmet: g.sorumlu || '', durum: g.durum || '', alis_tarihi: g.alis || null,
            net_defter_degeri: null, yillik_amortisman: null, takvim: gTarihler(d).map(x => ({ ad: x.ad, tarih: _isoGun(x.sonraki), kalan_gun: x.kalanGun })) });
    return o;
}
export function gSablonOzet(t: TurTaslagi): string {
    const tt = TURLER[t.tur] || {} as Partial<Tur>;
    const k = turKat(t);
    const bits = [tt.ad, k ? k.ad : '', ...Object.entries(t.g || {}).filter(([kk, v]) => v && kk !== 'kat' && !Array.isArray(v)).map(([, v]) => v).slice(0, 4)];
    const s = bits.filter(Boolean).join(', ');
    return s.length > 110 ? s.slice(0, 108) + '…' : s;
}
export function autoKod__1(d: TurTaslagi = D): string { return isGen(d) ? gKod(d) : autoKod__0(d); }
export function autoAd(d: TurTaslagi = D): string { const oto = isGen(d) ? gAd(d) : autoAd__0(d); const k = turKurali(d.tur).ad; return k ? (kalipUygula(k, d, oto) || oto) : oto; }
export function autoStd(d: TurTaslagi = D): string { return isGen(d) ? ((d.g && d.g.std) || (d.g && d.g.sinif) || '') : autoStd__0(d); }
export function finalBirim(d: TurTaslagi = D): string { if (!isGen(d))
        return finalBirim__0(d); return d.com.birim || (BIRIM_T[d.tur] || ['adet'])[0]!; }
export function weight(d: TurTaslagi = D): Agirlik | null { if (!isGen(d))
        return weight__0(d); if (d.tur === 'yarimamul' || d.tur === 'mamul') {
        const n = _gnum(d.g && d.g.net);
        if (isNum(n))
            return { kg: n };
        const c = gMaliyet(d);
        return c.bomKg ? { kg: c.bomKg } : null;
    } return null; }
export function dimsStr(d: TurTaslagi = D, metric?: boolean): string { if (!isGen(d))
        return dimsStr__0(d, metric); const g: TurDegerleri = d.g || {}; const v = [g.boy, g.en, g.yuk].map(_gnum).filter(isNum); return v.length ? v.map(fmtD).join('×') + ' mm' : ''; }
export function compatIssues(d: TurTaslagi = D): UyumSorunu[] { return isGen(d) ? gUyarilar(d) : compatIssues__0(d); }
export function flatItem__1(d: TurTaslagi, metric?: boolean): DuzSatir[] { return isGen(d) ? gFlat(d) : flatItem__0(d, metric); }
export function specMD(d: TurTaslagi): string { if (!isGen(d))
        return specMD__0(d); const L = [`# ${finalAd(d)}`, '', `**Kod:** ${finalKod(d)}  `, `**Tür:** ${TURLER[d.tur]!.ad}`, '']; let sec = ''; gFlat(d).forEach(([s, k, v]) => { if (s === 'Tanım' && ['Kod', 'Ad'].includes(k))
        return; if (s !== sec) {
        sec = s;
        L.push('', '## ' + s, '');
    } L.push(`- ${k}: ${v}`); }); return L.join('\n'); }
export function stokOzeti__1(x: TurTaslagi): Nesne { return isGen(x) ? gStokOzeti(x) : stokOzeti__0(x); }
export function specHTML__1(d: TurTaslagi, compact?: boolean): string {
        if (!isGen(d))
            return specHTML__0(d, compact);
        const t = TURLER[d.tur]!;
        const row = (k: string, v: string) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`;
        const rows = gFlat(d);
        let h = `<div class="sd-head" style="--cc:${t.c}"><div class="sd-kod">${esc(finalKod(d))}</div><h3 class="sd-ad">${esc(finalAd(d) || t.ad)}</h3></div>`;
        if (compact) {
            return `<div class="pv">${h}<dl class="dl">${rows.filter(r => r[0] !== 'Tanım' || !['Kod', 'Ad'].includes(r[1])).slice(0, 9).map(r => row(r[1], r[2])).join('')}</dl></div>`;
        }
        let sec = '', body = '';
        rows.forEach(([s, k, v]) => { if (s === 'Tanım' && ['Kod', 'Ad'].includes(k))
            return; if (s !== sec) {
            if (sec)
                body += '</dl></div>';
            sec = s;
            body += `<div class="sd-sec"><h3>${esc(s)}</h3><dl class="dl">`;
        } body += row(k, v); });
        if (sec)
            body += '</dl></div>';
        if ((d.docs || []).length)
            body += `<div class="sd-sec"><h3>Belgeler</h3><ul class="docs">${d.docs!.map(x => `<li><a href="${esc(x.url || '/_blob/' + x.id)}" target="_blank" rel="noopener">${esc(x.ad)}</a><span class="dtype">${esc(x.tip)}</span></li>`).join('')}</ul></div>`;
        return `<div class="sheetdoc">${h}${body}</div>`;
    }
