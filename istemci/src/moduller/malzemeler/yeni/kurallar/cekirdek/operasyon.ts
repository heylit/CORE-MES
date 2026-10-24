import type { OperasyonSatiri } from '../../tipler.ts';
import { D, OPG_DIS, OPG_VARSAYILAN, OP_AD_ESKI, OP_DIS, OP_KOD_ESKI, OP_SURUM, OP_VARSAYILAN, OpStore, _MALIYET_ANAHTAR } from './durum.ts';
import { stokOzeti__2 } from './kod-yapisi.ts';
import type { OperasyonGrubu, OperasyonTanimi, Taslak } from './tipler.ts';
import type { BomSatiri } from './turler.ts';
import { _gnum, gUyarilar__0 } from './turler.ts';
import { clone, isNum } from './yardimcilar.ts';

// Operasyon listesi kaydı (yerel depo ya da sunucu): sürüm yükseltmesi eksik varsayılanları ekler.
export interface OperasyonListesi { ops?: OperasyonTanimi[] | null; gruplar?: OperasyonGrubu[] | null; surum?: number; [alan: string]: unknown }
export interface RotaAdimi { no: number; kod: string; ad: string; grup: string; grupAdi: string; tanimli: boolean }
// Stok özeti katmanları birbirinin üstüne anahtar ekler ve siler.
export type StokOzeti = Record<string, unknown>;
export type GUyarisi = ReturnType<typeof gUyarilar__0>[number];

export function opGuncelle(v: OperasyonListesi | null | undefined): boolean {
    if (!v || !Array.isArray(v.ops))
        return false;
    if ((v.surum || 1) >= OP_SURUM)
        return false;
    v.gruplar = Array.isArray(v.gruplar) ? v.gruplar : [];
    OPG_VARSAYILAN.forEach(g => { const m = v.gruplar!.find(x => x.kod === g.kod); if (!m)
        v.gruplar!.push(clone(g));
    else if (g.kod === 'YZY' && m.ad === 'Yüzey işlem')
        m.ad = g.ad; });
    v.gruplar.sort((a, b) => { const i = OPG_VARSAYILAN.findIndex(g => g.kod === a.kod), j = OPG_VARSAYILAN.findIndex(g => g.kod === b.kod); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); });
    OP_VARSAYILAN.forEach(o => { const m = v.ops!.find(x => x.kod === o.kod); if (!m)
        v.ops!.push(clone(o));
    else if (m.varsayilan) {
        m.grup = o.grup;
        m.ad = o.ad;
    } });
    v.surum = OP_SURUM;
    return true;
}
export function opGruplar(): OperasyonGrubu[] { return (OPG_DIS || OpStore.gruplar || OPG_VARSAYILAN); }
export function opGrupAd(k: string | null | undefined): string { return ((opGruplar().find(g => g.kod === k) || {}).ad || k || ''); }
export function opTumu(): OperasyonTanimi[] { return OP_DIS || OpStore.ops || OP_VARSAYILAN; }
export function opListe(): OperasyonTanimi[] { return opTumu().filter(o => o.aktif !== false); }
export function opBul(kod: string): OperasyonTanimi | null { return opTumu().find(o => o.kod === kod) || null; }
export function opKod(o: OperasyonSatiri | null | undefined): string { if (!o)
    return ''; const k = o.kod && (OP_KOD_ESKI[o.kod] || o.kod); return k || OP_AD_ESKI[String(o.ad)] || ''; }
export function opNoDuzenle(d: Taslak): OperasyonSatiri[] { const ops = d.ops || []; let son = 0; ops.forEach(o => { const n = _gnum(o.no); if (isNum(n) && n > 0) {
    son = n;
}
else {
    o.no = son + 10;
    son = o.no as number;
} }); return ops; }
export function opSirala(d: Taslak): void { (d.ops || []).sort((a, b) => (_gnum(a.no) || 0) - (_gnum(b.no) || 0)); }
export function opSonrakiNo(d: Taslak): number { const m = (d.ops || []).reduce((a, o) => Math.max(a, _gnum(o.no) || 0), 0); return Math.floor(m / 10) * 10 + 10; }
export function rota(d: Taslak = D): RotaAdimi[] {
    opNoDuzenle(d);
    return (d.ops || []).map((x, i) => {
        const kod = opKod(x);
        const t = opBul(kod);
        return { no: _gnum(x.no) || (i + 1) * 10, kod, ad: (t && t.ad) || x.ad || '', grup: (t && t.grup) || '', grupAdi: opGrupAd(t && t.grup), tanimli: !!t };
    });
}
export function stokOzeti__3(x: Taslak): StokOzeti {
    const o: StokOzeti = stokOzeti__2(x);
    Object.keys(o).forEach(k => { if (_MALIYET_ANAHTAR.test(k))
        delete o[k]; });
    if (x.tur === 'yarimamul') {
        delete o.fiyat;
        delete o.para_birimi;
    }
    if (x.tur === 'yarimamul' || x.tur === 'mamul') {
        o.rota = rota(x).map(r => ({ no: r.no, kod: r.kod, ad: r.ad, operasyon_turu: r.grup }));
        o.rota_ozeti = { operasyon_sayisi: (x.ops || []).length };
    }
    return o;
}
export function gUyarilar(d: Taslak = D): GUyarisi[] {
    const u = gUyarilar__0(d);
    if (d.tur === 'yarimamul' || d.tur === 'mamul') {
        const rt = rota(d);
        const say: Record<number, number> = {};
        rt.forEach(r => { say[r.no] = (say[r.no] || 0) + 1; });
        Object.entries(say).filter(([, n]) => n > 1).forEach(([no]) => u.push({ step: 2, s: 'warn', t: 'Rota no ' + no, m: 'Bu numara birden fazla operasyonda kullanılıyor.' }));
        rt.filter(r => !r.tanimli).forEach(r => u.push({ step: 2, s: 'warn', t: 'Rota ' + r.no, m: r.kod ? `${r.kod} kodu Operasyonlar listesinde tanımlı değil.` : 'Operasyon kodu seçilmemiş.' }));
    }
    return u;
}
export function bomSatirlari(_d?: Taslak, _derin?: number): BomSatiri[] { return []; }
export function stokOzeti__4(x: Taslak): StokOzeti { const o = stokOzeti__3(x); delete o.recete; return o; }