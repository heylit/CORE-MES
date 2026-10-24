import type { DegisiklikTalebi } from '../../tipler.ts';
import type { Taslak } from './tipler.ts';
import type { OperasyonListesi, StokOzeti } from './operasyon.ts';
import { AYAR, GA, ROLLER, Roller, YETKI, _sahip, myUid } from './durum.ts';
import { stokOzeti__5 } from './hizli-arama.ts';
import { kodlariSabitle } from './kod-yapisi.ts';
import { _kim, _nm } from './onay.ts';
import { Host } from './ortam.ts';
import { _katalog, birimFarki, diffItems, withRev } from './turler.ts';
import { A } from './uyumluluk.ts';
import { clone } from './yardimcilar.ts';

export function aktifRol(): string {
    try {
        if (Host.on && Host.ayar && Host.ayar.rol && ROLLER[Host.ayar.rol as string])
            return Host.ayar.rol as string;
    }
    catch (e) { }
    if (!Roller.db)
        return (AYAR.yerelRol && ROLLER[AYAR.yerelRol as string]) ? AYAR.yerelRol as string : 'yonetici';
    if (_sahip)
        return 'yonetici';
    const u = (typeof myUid !== 'undefined' && myUid) || null;
    if (u && Roller.v.atama[u] && ROLLER[Roller.v.atama[u]])
        return Roller.v.atama[u];
    return ROLLER[Roller.v.varsayilan] ? Roller.v.varsayilan : 'talep';
}
export function yetki(e: string): boolean { return (e === 'talepGonder' || (YETKI[e] || []).includes(aktifRol())); }
export function opFarkOzeti(a: OperasyonListesi | null | undefined, b: OperasyonListesi | null | undefined): string[] {
    const L: string[] = [];
    const A = new Map(((a && a.ops) || []).map(o => [o.kod, o])), B = new Map(((b && b.ops) || []).map(o => [o.kod, o]));
    B.forEach((o, k) => { const x = A.get(k); if (!x)
        L.push(`Operasyon eklendi: ${k} ${o.ad}`);
    else {
        const f = (['ad', 'grup', 'aciklama', 'merkez', 'fason', 'aktif'] as const).filter(p => JSON.stringify(x[p] ?? '') !== JSON.stringify(o[p] ?? ''));
        if (f.length)
            L.push(`Operasyon değiştirildi: ${k} (${f.map(p => ({ ad: 'ad', grup: 'tür', aciklama: 'açıklama', merkez: 'istasyon', fason: 'fason', aktif: o.aktif === false ? 'kapatıldı' : 'açıldı' })[p]).join(', ')})`);
    } });
    A.forEach((o, k) => { if (!B.has(k))
        L.push(`Operasyon silindi: ${k} ${o.ad}`); });
    const GA = new Map(((a && a.gruplar) || []).map(g => [g.kod, g.ad])), GB = new Map(((b && b.gruplar) || []).map(g => [g.kod, g.ad]));
    GB.forEach((ad, k) => { if (!GA.has(k))
        L.push(`Operasyon türü eklendi: ${k} ${ad}`);
    else if (GA.get(k) !== ad)
        L.push(`Operasyon türü adı: ${GA.get(k)} → ${ad}`); });
    GA.forEach((ad, k) => { if (!GB.has(k))
        L.push(`Operasyon türü silindi: ${k} ${ad}`); });
    return L;
}
export function talepVar(x: Taslak | null | undefined): x is Taslak & { talep: DegisiklikTalebi } { return (!!(x && x.talep && x.talep.durum === 'beklemede')); }
export function talepOlustur(onceki: Taslak, yeni: Taslak): Taslak {
    const k = _kim();
    const y = clone(yeni);
    ['talep', 'rev', 'onay', 'mukerrerOnay', 'yerine', 'birlesen'].forEach(p => delete y[p]);
    const f = diffItems(onceki, y);
    const bf = birimFarki(onceki, y);
    if (bf && !f.some(x => x.f === bf.f))
        f.push(bf);
    const o = clone(onceki);
    o.talep = { id: 't' + k.t.toString(36), durum: 'beklemede', yeni: y, farklar: f, by: k.by, byAd: k.byAd, t: k.t };
    o.updatedAt = k.t;
    o.rev = [...(o.rev || []), { t: k.t, by: k.by, byAd: k.byAd, ch: [{ f: 'Değişiklik talebi', a: '—', b: `${f.length} alan` }], not: f.slice(0, 4).map(x => x.f).join(', ') }].slice(-30);
    return o;
}
export function talepUygula(kart: Taslak, islem: string, neden?: string): Taslak {
    const t = kart.talep;
    if (!t)
        return clone(kart);
    const k = _kim();
    if (islem === 'onayla') {
        const y = clone(t.yeni);
        y.id = kart.id;
        y.rev = clone(kart.rev || []);
        if (kart.birlesen)
            y.birlesen = clone(kart.birlesen);
        kodlariSabitle(y);
        withRev(y, kart);
        const e = y.rev[y.rev.length - 1];
        if (e)
            e.not = `Değişiklik talebi onaylandı (talep: ${t.byAd || (t.by ? 'bir kullanıcı' : 'bu tarayıcı')})`;
        y.onay = { ...(kart.onay || {}), durum: 'aktif', onay: k };
        delete y.talep;
        y.updatedAt = k.t;
        return y;
    }
    const o = clone(kart);
    delete o.talep;
    o.updatedAt = k.t;
    o.rev = [...(o.rev || []), { t: k.t, by: k.by, byAd: k.byAd, ch: [{ f: 'Değişiklik talebi', a: 'Bekliyor', b: islem === 'geri' ? 'Geri çekildi' : 'Reddedildi' }], not: neden || '' }].slice(-30);
    return o;
}
export function talepYetkili(x: Taslak | null | undefined): boolean { if (!talepVar(x) || !yetki('onay') || !AYAR.onayYetkisi)
    return false; if (AYAR.dortGoz && x.talep.by && x.talep.by === ((typeof myUid !== 'undefined' && myUid) || null))
    return false; return true; }
export function qrMetni(x: Taslak): string { const s = ((Host && Host.on && Host.ayar && Host.ayar.qrAdres) || AYAR.qrAdres || '') as string; const kod = (x.com && x.com.kod) || ''; if (s)
    return s.replace(/\{kod\}/g, encodeURIComponent(kod)).replace(/\{id\}/g, encodeURIComponent(x.id || '')); return 'MK:' + kod; }
export function qrKartBul(metin: unknown, liste?: readonly Taslak[] | null): Taslak | null {
    liste = liste || _katalog();
    let t = String(metin || '').trim();
    if (!t)
        return null;
    let aday: string[] = [];
    try {
        const u = new URL(t);
        ['kart', 'kod', 'id'].forEach(p => { const v = u.searchParams.get(p); if (v)
            aday.push(v); });
        const h = u.hash.replace(/^#/, '');
        new URLSearchParams(h).forEach(v => aday.push(v));
        const son = u.pathname.split('/').filter(Boolean).pop();
        if (son)
            aday.push(decodeURIComponent(son));
    }
    catch (e) { }
    if (/^MK:/i.test(t))
        aday.unshift(t.slice(3).trim());
    aday.push(t.split(/\r?\n/)[0]!.trim(), t);
    for (const a of aday) {
        const n = _nm(a);
        if (!n)
            continue;
        const x = liste.find(i => i.id === a) || liste.find(i => i.com && (_nm(i.com.kod) === n || _nm(i.com.eskiKod || '') === n || _nm(i.com.tkod || '') === n));
        if (x)
            return x;
    }
    return null;
}
export function stokOzeti(x: Taslak): StokOzeti { const o: StokOzeti = stokOzeti__5(x); o.degisiklik_talebi = talepVar(x); o.qr_icerik = qrMetni(x); return o; }