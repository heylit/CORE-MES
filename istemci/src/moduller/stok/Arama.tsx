import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { AraCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Girdi, Pencere } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { RAF_TURU, miktarMetni } from './gorunum.ts';

// Önizlemedeki "her yerden arama" (openSearch): Ctrl+K ya da "/" ile açılır; Enter ilk sonucu açar.
// Malzeme adıyla arama malzemeler modülünün arama işlevi gelince eklenir; bugün kart numarası, konum, raf ve parti no.
const SAYFALAR = [
  ['İş kutusu', '/stok', 'panel ana'], ['Okut', '/stok/okut', 'tara qr barkod'], ['Taşı', '/stok/sepet', 'sepet teslim fiş taşı çıkış'], ['Hazırlık', '/stok/hazirlik', 'toplama sipariş rota liste istek'],
  ['Mal kabul', '/stok/mal-kabul', 'giriş irsaliye'], ['Malzemeler', '/stok/malzemeler', 'ürün stok'], ['Hareketler', '/stok/hareketler', 'giriş çıkış geçmiş'],
  ['Depo', '/stok/depo', 'raf bölme göz harita'], ['Fabrika Haritası', '/atolye', 'plan raf ekle yerleşim düzenleyici göz'], ['Konumlar', '/stok/konumlar', 'dama tahtası kare zemin'],
  ['Ayarlar', '/stok/ayarlar', 'etiket depocu'],
] as const;
interface Sonuc { anahtar: string; baslik: string; alt: string; yol: string }
const sade = (s: string): string => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function sonuclar(c: AraCevabi | undefined, q: string): Sonuc[] {
  const l: Sonuc[] = (c?.sonuclar ?? []).map((x): Sonuc => {
    switch (x.tur) {
      case 'malzeme': return { anahtar: `m${x.malzemeId}`, baslik: x.ad ?? x.kod, alt: `${x.kod} · depoda ${miktarMetni(x.toplam)}`, yol: `/stok/malzemeler/${x.malzemeId}` };
      case 'konum': return { anahtar: `k${x.konumId}`, baslik: x.kod, alt: `${x.ad ? `${x.ad} · ` : ''}${x.satirSayisi ? `${x.satirSayisi} stok satırı` : 'boş'}`, yol: `/stok/konumlar/${x.konumId}` };
      case 'raf': return { anahtar: `r${x.rafId}`, baslik: `Raf ${x.kod}`, alt: RAF_TURU[x.rafTuru], yol: `/stok/raflar/${x.rafId}` };
      case 'parti': return { anahtar: `p${x.partiId}`, baslik: x.etiket, alt: `Parti · kart ${x.malzemeId}`, yol: `/stok/hareketler?partiId=${x.partiId}` };
    }
  });
  const s = sade(q);
  for (const [b, y, k] of SAYFALAR) if (s && (sade(b).includes(s) || k.includes(s))) l.push({ anahtar: y, baslik: b, alt: 'Sayfa', yol: y });
  return l.slice(0, 12);
}

export function AramaPenceresi({ kapat }: { kapat: () => void }) {
  const yonlendir = useNavigate();
  const [q, setQ] = useState('');
  const [gecikmeli, setGecikmeli] = useState('');
  useEffect(() => { const t = setTimeout(() => setGecikmeli(q.trim()), 200); return () => clearTimeout(t); }, [q]);
  const c = useQuery({ queryKey: [...anahtarlar.hepsi, 'ara', gecikmeli], queryFn: () => api.get<AraCevabi>(`/stok/ara?q=${encodeURIComponent(gecikmeli)}`), enabled: gecikmeli.length > 0 });
  const l = sonuclar(c.data, gecikmeli);
  const git = (y: string) => { kapat(); void yonlendir(y); };
  return (
    <Pencere acik kapat={kapat} baslik="Ara" tur="yan">
      <form className="tc-stok-form" onSubmit={(e) => { e.preventDefault(); if (l[0]) git(l[0].yol); }}>
        <Girdi etiket="Ara" placeholder="Konum (A-03-02), raf, parti no ya da kart no" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </form>
      {!gecikmeli ? (
        <div className="tc-stok-form">
          <p className="tc-stok-not">İpucu: Ctrl + K ya da / ile her stok ekranından açılır. Konum kodu yazarak doğrudan gidebilirsin.</p>
          <div className="tc-stok-ed-ekle">{SAYFALAR.map(([b, y]) => <button key={y} type="button" className="tc-stok-ambalaj" onClick={() => git(y)}><strong>{b}</strong></button>)}</div>
        </div>
      ) : l.length === 0 && !c.isPending ? <p className="tc-stok-not">Sonuç yok. Konum kodu, parti no ya da kart numarası dene. Malzeme adıyla arama Malzeme Kartları'nın arama işlevi gelince açılır.</p> : (
        <ul className="tc-stok-satirlar">
          {l.map((s, i) => (
            <li key={s.anahtar}><button type="button" className="tc-stok-ed-satir tc-stok-ara-sonuc" onClick={() => git(s.yol)}>
              <span className="tc-stok-ad"><strong>{s.baslik}</strong><span>{s.alt}</span></span>{i === 0 && <span className="tc-stok-not">Enter</span>}
            </button></li>
          ))}
        </ul>
      )}
    </Pencere>
  );
}

// Kısayol: Ctrl+K (Cmd+K) ya da yazı alanında değilken "/".
export function useAramaKisayolu(ac: () => void) {
  const acRef = useRef(ac);
  acRef.current = ac;
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      const g = e.target as HTMLElement | null, yaziyor = !!g && (g.tagName === 'INPUT' || g.tagName === 'TEXTAREA' || g.tagName === 'SELECT' || g.isContentEditable);
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !yaziyor)) { e.preventDefault(); acRef.current(); }
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, []);
}
export function AraDugmesi({ ac }: { ac: () => void }) {
  return <Dugme tur="ikincil" simge="search" onClick={ac} title="Ctrl + K">Ara</Dugme>;
}
