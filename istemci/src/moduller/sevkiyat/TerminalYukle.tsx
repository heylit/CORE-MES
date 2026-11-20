import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GunPlaniCevabi, Is, Nokta, TumIslerCevabi, TumIsSatiri } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Dugme, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { isBasligi } from './BekleyenIsler.tsx';
import { bugun, sayiMetni } from './bicim.ts';
import { isKalemleri } from './TetikDugmesi.tsx';
import { anahtarlar } from './anahtarlar.ts';
import { useDepoCikisi, useIsKomutu } from './veri.ts';
import { yukDurumu } from './YukleAdimi.tsx';
import './sevkiyat.css';

// 3389 a: depo terminalinde bugünün onaylı planının yüklemesi, durak durak (terminalin standart düzeninde, DepoTerminali). Uçlar Sevkiyat sayfasının Yükle adımıyla aynıdır
// (çıkış `/stok/depo-sevk/:id/cikis` stok.cikis, irsaliye no `/sevkiyat/isler/:id/belge-no` sevkiyat.is-yaz); ikisi de tekrar korumalı.
// Okutma doğrudan yazmaz, onay ister; okutulan kod yalnız ekrandaki durağın kalemleriyle eşlenir. Yanlış çıkışın geri alınması
// Sevkiyat sayfasındadır (stok.geri-al). Teslim (durak sonucu) sürücünün telefonundadır, burada yoktur.

export interface AracYuku { aracId: number; ad: string; duraklar: Is[] }

export function aracYukleri(veri: GunPlaniCevabi, isler: ReadonlyMap<number, Is>): AracYuku[] {
  return veri.rotalar.filter((r) => r.ogeler.length > 0).map((r) => {
    const duraklar: Is[] = [];
    for (const o of r.ogeler) { if ('isId' in o) { const is = isler.get(o.isId); if (is && !duraklar.includes(is)) duraklar.push(is); } }
    return { aracId: r.aracId, ad: veri.araclar.find((a) => a.id === r.aracId)?.ad ?? 'Araç', duraklar };
  });
}

export const cikisBekleyenler = (k: readonly TumIsSatiri[] | undefined): TumIsSatiri[] =>
  (k ?? []).filter((x) => x.yon === 'gidis' && x.asama === 'depoda' && x.kalemId !== null);
export const irsaliyeIster = (is: Is): boolean => is.tur !== 'alim';
// Durak, çıkış bekleyen kalemi kalmayınca ve irsaliye no'su (gerekiyorsa) yazılınca biter.
export const durakBitti = (is: Is, k: readonly TumIsSatiri[] | undefined): boolean => cikisBekleyenler(k).length === 0 && (!irsaliyeIster(is) || !!is.belgeNo);
export const aracBitti = (a: AracYuku, kalemler: ReadonlyMap<number, TumIsSatiri[]>): boolean => a.duraklar.every((is) => durakBitti(is, kalemler.get(is.id)));

// Okutulan kod durağın çıkış bekleyen kalemlerinden biriyle eşlenir: kalem anahtarı, emir no, sipariş no ya da malzeme no (VARSAYIM:
// etiket bunlardan birini taşır). Büyük-küçük harf ve boşluk gözetilmez.
export function kodaUyanKalem(k: readonly TumIsSatiri[], kod: string): TumIsSatiri | null {
  const n = (s: string | number | null) => (s === null ? '' : String(s).replace(/\s+/g, '').toLocaleUpperCase('tr'));
  const aranan = n(kod);
  if (!aranan) return null;
  return k.find((x) => [x.anahtar, x.emirNo, x.siparisNo, x.malzemeNo].some((v) => n(v) === aranan)) ?? null;
}

const kalemAdi = (k: TumIsSatiri): string => k.malzemeAd ?? k.aciklama ?? k.emirNo ?? 'Kalem';
const adetMetni = (k: TumIsSatiri): string => (k.adet === null ? '' : `${sayiMetni(k.adet)} adet`);

// Sevkiyat sayfasındaki sorgularla aynı anahtar ve uç; yetkisizde istek gitmez.
function useYukVerisi(etkin: boolean) {
  const gun = bugun();
  const plan = useQuery({ queryKey: anahtarlar.gunPlani(gun), queryFn: () => api.get<GunPlaniCevabi>(`/sevkiyat/planlar/${gun}`), enabled: etkin });
  const satirlar = useQuery({
    queryKey: anahtarlar.tumIsler(gun, gun), queryFn: () => api.get<TumIslerCevabi>(`/sevkiyat/tum-isler?baslangic=${gun}&bitis=${gun}`), select: (c) => c.satirlar, enabled: etkin,
  });
  const veri = plan.data;
  const isler = useMemo(() => new Map((veri?.isler ?? []).map((i) => [i.id, i])), [veri]);
  const noktalar = useMemo(() => new Map((veri?.noktalar ?? []).map((n) => [n.id, n])), [veri]);
  const kalemler = useMemo(() => isKalemleri(satirlar.data), [satirlar.data]);
  const araclar = useMemo(() => (veri ? aracYukleri(veri, isler) : []), [veri, isler]);
  return { plan, satirlar, veri, noktalar, kalemler, araclar };
}

// Terminal sekmesindeki sayı: onaylı planda yüklemesi bitmemiş araç; yetkisizde, yüklenirken ve onaysız planda null.
export function useYukleSayisi(): number | null {
  const cikis = (useOturum().data?.islemler ?? []).includes('stok.cikis');
  const y = useYukVerisi(cikis);
  if (!cikis || !y.veri?.onaylandi || !y.satirlar.data) return null;
  return y.araclar.filter((a) => !aracBitti(a, y.kalemler)).length;
}

// 3389 a (standart terminal düzeni): her durak bir iştir. Sayı çıkışı yazılan kalemdir (sunucudan), hedef durağın depo kalemleri.
export interface YukDuragi {
  is: Is; arac: string; sira: number; durakSayisi: number; baslik: string;
  kalemler: TumIsSatiri[]; bekleyen: TumIsSatiri[]; toplam: number; cikan: number; irsaliye: boolean; bitti: boolean;
}
const depoKalemi = (x: TumIsSatiri): boolean => x.yon === 'gidis' && x.kalemId !== null;
export function yukDuraklari(araclar: readonly AracYuku[], kalemler: ReadonlyMap<number, TumIsSatiri[]>, noktalar: ReadonlyMap<number, Nokta>): YukDuragi[] {
  return araclar.flatMap((a) => a.duraklar.map((is, i) => {
    const k = kalemler.get(is.id) ?? [];
    const bekleyen = cikisBekleyenler(k);
    const toplam = k.filter(depoKalemi).length;
    return { is, arac: a.ad, sira: i + 1, durakSayisi: a.duraklar.length, baslik: isBasligi(is, noktalar), kalemler: k, bekleyen, toplam, cikan: toplam - bekleyen.length, irsaliye: irsaliyeIster(is), bitti: durakBitti(is, k) };
  }));
}

// Terminalin yükleme işleri; onaysız planda liste boştur ve neden `plansiz`dadır (yazma yoktur).
export function useYukDuraklari(): { duraklar: YukDuragi[] | null; plansiz: string | null; yukleniyor: boolean; hata: string | null; yenile: () => void } {
  const cikis = (useOturum().data?.islemler ?? []).includes('stok.cikis');
  const y = useYukVerisi(cikis);
  const duraklar = useMemo(() => yukDuraklari(y.araclar, y.kalemler, y.noktalar), [y.araclar, y.kalemler, y.noktalar]);
  const hata = y.plan.error ?? y.satirlar.error;
  const onayli = !!y.veri?.onaylandi;
  return {
    duraklar: cikis && y.veri && y.satirlar.data ? (onayli ? duraklar : []) : null,
    plansiz: y.veri && !onayli ? 'Plan onaylanmadı: yükleme plan onaylanınca başlar.' : y.veri && duraklar.length === 0 ? 'Bugünün planında araç yok.' : null,
    yukleniyor: cikis && (y.plan.isPending || y.satirlar.isPending),
    hata: hata ? hataIletisi(hata, 'Plan okunamadı') : null,
    yenile: () => { void y.plan.refetch(); void y.satirlar.refetch(); },
  };
}

export const yukKalemAdi = (k: TumIsSatiri): string => kalemAdi(k);

// Yüklendi +1: sıradaki kalemin çıkışı onayla yazılır (Sevkiyat sayfasının Yükle adımıyla aynı uç, tekrar korumalı).
export function CikisOnayi({ kalem, vazgec, yazildi }: { kalem: TumIsSatiri; vazgec: () => void; yazildi: (ileti: string) => void }) {
  const cikis = useDepoCikisi();
  const kilit = useRef(false);
  const [hata, hataYaz] = useState<string | null>(null);
  const yaz = () => {
    if (kalem.kalemId === null || kilit.current) return;
    kilit.current = true;
    cikis.mutate(kalem.kalemId, {
      onSuccess: (c) => yazildi([`${kalemAdi(kalem)} çıkış yazıldı.`, ...(c.uyarilar ?? [])].join(' ')),
      onError: (h) => hataYaz(hataIletisi(h, 'Çıkış yapılamadı')),
      onSettled: () => { kilit.current = false; },
    });
  };
  return (
    <div className="tc-sevkiyat-ty-onay" role="group" aria-label="Çıkış onayı">
      <p><b>{kalemAdi(kalem)}</b>{adetMetni(kalem) ? ` ${adetMetni(kalem)}` : ''} çıkış yazılsın mı?</p>
      <small className="tc-sevkiyat-ince">{[kalem.emirNo, kalem.siparisNo, kalem.malzemeNo].filter(Boolean).join(' · ')}</small>
      {hata ? <p className="tc-sevkiyat-ty-ileti" data-ton="kotu" role="alert"><Simge ad="alert" />{hata}</p> : null}
      <div className="tc-sevkiyat-ty-alt">
        <Dugme onClick={vazgec} disabled={cikis.isPending}>Vazgeç</Dugme>
        <Dugme tur="birincil" boyut="ana" simge="upload" yukleniyor={cikis.isPending} onClick={yaz}>Çıkışı yaz</Dugme>
      </div>
    </div>
  );
}

// Bitir: irsaliye gereken durakta irsaliye no yazılmadan durak bitmez; eksik kalan kalemler söylenir (VARSAYIM: eksik durak bitirilebilir,
// kalemi depoda kalır ve Sevkiyat sayfasında görünür).
export function DurakBitir({ durak, eksik, irsaliyeYazar, vazgec, bitti }: {
  durak: YukDuragi; eksik: number; irsaliyeYazar: boolean; vazgec: () => void; bitti: (ileti: string) => void;
}) {
  const isKomutu = useIsKomutu();
  const [irsaliye, irsaliyeYaz] = useState<string>(durak.is.belgeNo ?? '');
  const [hata, hataYaz] = useState<string | null>(null);
  const gerek = durak.irsaliye && !durak.is.belgeNo;
  const kalan = durak.bekleyen.length;
  const bitir = () => {
    if (!gerek) { bitti(kalan > 0 ? `${String(durak.sira)}. durak ${String(kalan)} kalem eksik bitti.` : `${String(durak.sira)}. durak yüklendi.`); return; }
    if (!irsaliye.trim()) { hataYaz('İrsaliye no girin.'); return; }
    isKomutu.mutate({ tur: 'belge-no', id: durak.is.id, govde: { belgeNo: irsaliye.trim(), surum: durak.is.surum } }, {
      onSuccess: () => bitti(`İrsaliye no yazıldı; ${String(durak.sira)}. durak ${kalan > 0 ? `${String(kalan)} kalem eksik bitti` : 'yüklendi'}.`),
      onError: (h) => hataYaz(hataIletisi(h, 'İrsaliye no yazılamadı')),
    });
  };
  return (
    <div className="tc-sevkiyat-ty-onay" role="group" aria-label="Durağı bitir">
      <dl className="tc-sevkiyat-ty-ozet">
        <div><dt>Durak</dt><dd>{durak.sira}. · {durak.baslik}</dd></div>
        <div><dt>Yüklenen</dt><dd>{durak.cikan} / {durak.toplam} kalem</dd></div>
        {kalan > 0 ? <div><dt>Eksik kalan</dt><dd>{kalan} kalem{eksik > 0 ? ` (${String(eksik)} eksik işaretli)` : ''}</dd></div> : null}
        {durak.irsaliye ? <div><dt>İrsaliye no</dt><dd className="tc-sevkiyat-mono">{durak.is.belgeNo ?? '—'}</dd></div> : null}
      </dl>
      {gerek && !irsaliyeYazar ? <p className="tc-sevkiyat-ty-ileti" data-ton="kotu" role="alert"><Simge ad="alert" />İrsaliye no için sevkiyat işi yazma yetkisi gerekir.</p> : null}
      {gerek && irsaliyeYazar ? <IrsaliyeGirisi deger={irsaliye} degistir={irsaliyeYaz} kaydet={bitir} /> : null}
      {hata ? <p className="tc-sevkiyat-ty-ileti" data-ton="kotu" role="alert"><Simge ad="alert" />{hata}</p> : null}
      <div className="tc-sevkiyat-ty-alt">
        <Dugme onClick={vazgec} disabled={isKomutu.isPending}>Vazgeç</Dugme>
        <Dugme tur="birincil" boyut="ana" simge="flag" yukleniyor={isKomutu.isPending} disabled={gerek && !irsaliyeYazar} onClick={bitir}>{gerek ? 'İrsaliyeyi yaz, bitir' : 'Durağı bitir'}</Dugme>
      </div>
    </div>
  );
}

// Kalemler sekmesi: durağın kalemleri ve okutma; okutulan kod yalnız bu durağın çıkış bekleyen kalemiyle eşlenir, yazmadan önce onay ister.
export function DurakKalemleri({ durak, cikisAc, bildir }: { durak: YukDuragi; cikisAc: (k: TumIsSatiri) => void; bildir: (m: string) => void }) {
  const okundu = (kod: string) => { const x = kodaUyanKalem(durak.bekleyen, kod); if (x) cikisAc(x); else bildir(`Bu durakta yok: ${kod}`); };
  return (
    <div className="tc-sevkiyat-ty-durak">
      {durak.bekleyen.length > 0 ? <OkutmaAlani okundu={okundu} /> : null}
      <ul className="tc-sevkiyat-ty-kalemler" aria-label="Kalemler">
        {durak.kalemler.length === 0 ? <li className="tc-sevkiyat-ince">Kalemsiz iş; depo işi yok.</li> : null}
        {durak.kalemler.map((x) => {
          const d = yukDurumu([x]);
          return (
            <li key={x.anahtar}>
              <span><b>{kalemAdi(x)}</b><small>{[adetMetni(x), x.emirNo, x.siparisNo].filter(Boolean).join(' · ')}</small></span>
              <Rozet ton={d.ton}>{d.metin}</Rozet>
              {durak.bekleyen.includes(x) ? <Dugme simge="upload" onClick={() => cikisAc(x)}>Çıkış yap</Dugme> : null}
            </li>
          );
        })}
      </ul>
      <small className="tc-sevkiyat-ince">Yanlış çıkış Sevkiyat sayfasındaki Yükle adımında geri alınır.</small>
    </div>
  );
}

function OkutmaAlani({ okundu }: { okundu: (kod: string) => void }) {
  const [v, vYaz] = useState('');
  const gonder = (e: FormEvent) => { e.preventDefault(); if (v.trim()) { okundu(v.trim()); vYaz(''); } };
  return (
    <form className="tc-sevkiyat-ty-okut" onSubmit={gonder}>
      <Simge ad="scan" />
      <input value={v} onChange={(e) => vYaz(e.target.value)} placeholder="Kalemin etiketini okutun" aria-label="Okutulan kod" autoCapitalize="characters" />
    </form>
  );
}

// İrsaliye no: okutma ya da ekran klavyesi. Sunucu en çok 60 karakter alır (sevkiyat sözleşmesi isBelgeNoGovdesi).
const IRSALIYE_TUSLARI = [...'1234567890', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '-', '/'];
function IrsaliyeGirisi({ deger, degistir, kaydet }: { deger: string; degistir: (d: string) => void; kaydet: () => void }) {
  return (
    <>
      <input className="tc-sevkiyat-ty-girdi tc-sevkiyat-mono" value={deger} maxLength={60} aria-label="İrsaliye no" autoFocus
        onChange={(e) => degistir(e.target.value.toLocaleUpperCase('tr'))} onKeyDown={(e) => { if (e.key === 'Enter') kaydet(); }} />
      <div className="tc-sevkiyat-ty-klavye" role="group" aria-label="Klavye">
        {IRSALIYE_TUSLARI.map((t) => <button key={t} type="button" onClick={() => degistir((deger + t).slice(0, 60))}>{t}</button>)}
        <button type="button" aria-label="Sil" onClick={() => degistir(deger.slice(0, -1))}><Simge ad="backspace" /></button>
      </div>
    </>
  );
}
