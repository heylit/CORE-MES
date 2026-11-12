import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dugme, Simge } from '../../ortak/arayuz/index.ts';
import { api, ApiHatasi } from '../../ortak/veri/api.ts';
import type { MalKabulTaslagiCevabi, MalKabulTaslagiKaydetCevabi } from '#paylasilan/sozlesme/stok-mal-kabul-taslagi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { korumaliPost } from './ortak.tsx';
import { MAL_KABUL_TURU, zamanMetni } from './gorunum.ts';
import type { MalKabulTuru } from '#paylasilan/sozlesme/stok.ts';

// 3087 a: yarım kalan mal kabul kişinin hesabında taslak olarak durur; başka cihazda kalınan yerden sürer.
// Kişi başına tek taslak; bu cihazdaki irsaliye fotoğrafları taslağa girmez (dosya cihazdadır).
export interface TaslakFormu<S> { tur: MalKabulTuru; irsaliye: string; satirlar: S[] }

const BEKLE_MS = 2000;
const ANAHTAR = [...anahtarlar.hepsi, 'mal-kabul-taslagi'] as const;

type Durum = { tur: 'yok' } | { tur: 'kaydediliyor' } | { tur: 'kaydedildi'; zaman: string } | { tur: 'hata' } | { tur: 'cakisma' };

export function useMalKabulTaslagi<S>(form: TaslakFormu<S>, bos: boolean, gonderiliyor: boolean, uygula: (f: TaslakFormu<S>) => void) {
  const istemci = useQueryClient();
  const q = useQuery({ queryKey: ANAHTAR, queryFn: () => api.get<MalKabulTaslagiCevabi>('/stok/mal-kabul-taslagi') });
  // Bekleyen taslak varken kişi karar vermeden form yazılmaz: yoksa başka cihazdaki taslak ezilir.
  const [karar, setKarar] = useState<'bekliyor' | 'verildi'>('bekliyor');
  const [durum, setDurum] = useState<Durum>({ tur: 'yok' });
  const surum = useRef<number | null>(null);
  // Teslimde taslak yalnız bu form ondan devam ettiyse ya da onu kendisi yazdıysa silinir; karar bekleyen başka taslak kalır.
  const sahip = useRef(false);
  // Teslimden önce yola çıkmış kayıt: teslim ondan önce işlenirse taslak sunucuda kalırdı (aynı teslim ikinci kez yapılabilirdi).
  const ucus = useRef<Promise<MalKabulTaslagiKaydetCevabi | null> | null>(null);
  // Teslimden sonra dönen kayıt cevabı formun yeni durumuna yazılmaz.
  const nesil = useRef(0);
  // Satırlar formun kendi durumudur; sunucu yalnız saklar (sözleşme bunları açık nesne olarak taşır).
  const bekleyen = (q.data?.taslak ?? null) as { govde: TaslakFormu<S>; surum: number; guncellendi: string } | null;
  const kutuAcik = karar === 'bekliyor' && bekleyen !== null;
  const yazabilir = q.isSuccess && !kutuAcik;
  if (q.isSuccess && bekleyen === null && karar === 'bekliyor') setKarar('verildi');

  const kaydet = (f: TaslakFormu<S>) => {
    const n = nesil.current;
    setDurum({ tur: 'kaydediliyor' });
    const yaz = async (): Promise<MalKabulTaslagiKaydetCevabi | null> => {
      try {
        const c = await korumaliPost<MalKabulTaslagiKaydetCevabi>('/stok/mal-kabul-taslagi/kaydet', { govde: f, surum: surum.current });
        if (n === nesil.current) { surum.current = c.surum; sahip.current = true; setDurum({ tur: 'kaydedildi', zaman: c.guncellendi }); }
        return c;
      } catch (e) {
        // Sürüm tutmadı: aynı kişi başka cihazda taslağı değiştirdi; sessizce ezilmez.
        if (n === nesil.current) setDurum(e instanceof ApiHatasi && e.govde.kod === 'CAKISMA' ? { tur: 'cakisma' } : { tur: 'hata' });
        return null;
      }
    };
    const p = yaz();
    ucus.current = p;
    void p.finally(() => { if (ucus.current === p) ucus.current = null; });
  };

  const metin = JSON.stringify(form);
  useEffect(() => {
    // Teslim sürerken kayıt başlamaz: bekleyen zamanlayıcı da burada düşer.
    if (!yazabilir || bos || gonderiliyor || durum.tur === 'cakisma') return;
    const t = setTimeout(() => kaydet(JSON.parse(metin) as TaslakFormu<S>), BEKLE_MS);
    return () => clearTimeout(t);
  }, [metin, yazabilir, bos, gonderiliyor, durum.tur]);

  const devamEt = () => {
    if (!bekleyen) return;
    surum.current = bekleyen.surum;
    sahip.current = true;
    uygula(bekleyen.govde);
    setDurum({ tur: 'kaydedildi', zaman: bekleyen.guncellendi });
    setKarar('verildi');
  };
  const yeniBasla = async () => {
    try { await korumaliPost('/stok/mal-kabul-taslagi/sil', { surum: bekleyen?.surum ?? null }); } catch { /* taslak sonraki kayıtta ezilir */ }
    surum.current = null;
    setKarar('verildi');
    void istemci.invalidateQueries({ queryKey: ANAHTAR });
  };

  const kutu = kutuAcik && bekleyen ? (
    <div className="tc-stok-bilgi tc-stok-taslak" role="status" aria-label="Yarım kalan mal kabul">
      <Simge ad="clock" boyut="k" />
      <span className="tc-stok-taslak-metin">
        <strong>Yarım kalan mal kabul</strong>
        <span>{zamanMetni(bekleyen.guncellendi)} · {MAL_KABUL_TURU[bekleyen.govde.tur]}{bekleyen.govde.irsaliye ? ` · İrsaliye ${bekleyen.govde.irsaliye}` : ''} · {bekleyen.govde.satirlar.length} satır</span>
        <span className="tc-stok-taslak-not">İrsaliye fotoğrafları taslakta tutulmaz; gerekirse yeniden çekin.</span>
      </span>
      <span className="tc-stok-taslak-dugmeler">
        <Dugme tur="birincil" type="button" onClick={devamEt}>Devam et</Dugme>
        <Dugme type="button" onClick={() => void yeniBasla()}>Sil, yeni başla</Dugme>
      </span>
    </div>
  ) : null;

  const oradakiniAc = () => { setDurum({ tur: 'yok' }); setKarar('bekliyor'); void istemci.invalidateQueries({ queryKey: ANAHTAR }); };
  const durumYazisi = durum.tur === 'yok' ? null : (
    <span className="tc-stok-taslak-durum" aria-live="polite">
      {durum.tur === 'kaydediliyor' && 'Taslak kaydediliyor…'}
      {durum.tur === 'kaydedildi' && `Taslak kaydedildi · ${zamanMetni(durum.zaman)}`}
      {durum.tur === 'hata' && 'Taslak kaydedilemedi'}
      {durum.tur === 'cakisma' && <>Taslak başka cihazda değişti · <button type="button" className="tc-stok-bag" onClick={oradakiniAc}>Oradakini aç</button></>}
    </span>
  );

  const temizle = () => {
    const p = ucus.current;
    nesil.current += 1;
    surum.current = null; sahip.current = false; setDurum({ tur: 'yok' });
    void (async () => {
      // Teslimle yarışan kayıt teslimden sonra yazıldıysa o sürümle silinir; sonradan başka cihazda değişen taslağa dokunulmaz.
      const c = p ? await p : null;
      if (c) { try { await korumaliPost('/stok/mal-kabul-taslagi/sil', { surum: c.surum }); } catch { /* sürüm değiştiyse taslak oradakinindir */ } }
      void istemci.invalidateQueries({ queryKey: ANAHTAR });
    })();
  };
  return { kutu, durumYazisi, temizle, silinsinMi: () => sahip.current || ucus.current !== null };
}
