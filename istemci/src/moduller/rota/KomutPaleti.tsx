import { useEffect, useState, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { MalzemeAraCevabi, RotaListesiCevabi, SeceneklerCevabi } from '#paylasilan/sozlesme/rota.ts';
import type { AdimliListeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Pencere } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { TUM_BOLUMLER } from './bolumler.ts';
import './merkez.css';

export interface PaletOgesi { tur: string; ad: string; alt?: string; yol: string }

const kucuk = (m: string) => m.toLocaleLowerCase('tr-TR');

// Prototipin "Hızlı git" listesi: bölüm, üretim emri, ürün ya da malzeme, istasyon; en çok 12 satır. Rotası olan ürün şemada, olmayan kart
// Malzemeler bölümünde açılır.
export function paletOgeleri(q: string, girdi: {
  rotalilar: ReadonlySet<number>;
  malzemeler: MalzemeAraCevabi['satirlar'];
  istasyonlar: SeceneklerCevabi['istasyonlar'];
  emirler?: AdimliListeCevabi['emirler'];
}): PaletOgesi[] {
  const s = kucuk(q.trim());
  const cikti: PaletOgesi[] = TUM_BOLUMLER.filter((b) => s === '' || kucuk(b.baslik).includes(s)).map((b) => ({ tur: 'Bölüm', ad: b.baslik, yol: b.yol }));
  if (s !== '') {
    for (const e of girdi.emirler ?? []) {
      if (kucuk(`${e.emirNo} ${e.urun.kod} ${e.urun.ad}`).includes(s)) cikti.push({ tur: 'Emir', ad: `${e.emirNo} ${e.urun.kod}`, alt: 'üretim emirleri', yol: `/uretim-emirleri?ara=${encodeURIComponent(e.emirNo)}` });
    }
    for (const m of girdi.malzemeler) {
      const rotali = girdi.rotalilar.has(m.id);
      cikti.push({
        tur: 'Malzeme', ad: `${m.stokKodu ?? ''} ${m.ad}`.trim(), alt: rotali ? 'rotayı aç' : 'malzemeler',
        yol: rotali ? `/rota/${m.id}` : `/rota/malzemeler?ara=${encodeURIComponent(m.stokKodu ?? m.ad)}`,
      });
    }
    for (const i of girdi.istasyonlar) {
      if (kucuk(`${i.kod} ${i.ad}`).includes(s)) cikti.push({ tur: 'İstasyon', ad: `${i.kod} ${i.ad}`, alt: 'kaynaklar', yol: '/rota/kaynaklar' });
    }
  }
  return cikti.slice(0, 12);
}

export function KomutPaleti() {
  const [acik, acikYaz] = useState(false);
  const [metin, metinYaz] = useState('');
  const [sira, siraYaz] = useState(0);
  const yonlendir = useNavigate();

  useEffect(() => {
    const tus = (o: KeyboardEvent) => {
      if ((o.ctrlKey || o.metaKey) && o.key.toLowerCase() === 'k') { o.preventDefault(); metinYaz(''); siraYaz(0); acikYaz(true); }
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, []);

  const ara = metin.trim();
  const malzeme = useQuery({
    queryKey: anahtarlar.malzemeArama('hepsi', ara),
    queryFn: () => api.get<MalzemeAraCevabi>(`/rota/malzeme-ara?${new URLSearchParams({ metin: ara }).toString()}`),
    enabled: acik && ara !== '',
  });
  const liste = useQuery({ queryKey: anahtarlar.liste, queryFn: () => api.get<RotaListesiCevabi>('/rota/urunler'), enabled: acik });
  const secenekler = useQuery({ queryKey: anahtarlar.secenekler, queryFn: () => api.get<SeceneklerCevabi>('/rota/secenekler'), enabled: acik });
  const emirler = useQuery({ queryKey: ['rotalar', 'emirler', 'liste', false], queryFn: () => api.get<AdimliListeCevabi>('/adimli-emirler'), enabled: acik && ara !== '' });
  const ogeler = paletOgeleri(metin, {
    rotalilar: new Set((liste.data?.rotalar ?? []).map((r) => r.urun.id)),
    malzemeler: malzeme.data?.satirlar ?? [],
    istasyonlar: secenekler.data?.istasyonlar ?? [],
    emirler: emirler.data?.emirler ?? [],
  });
  const git = (o: PaletOgesi | undefined) => { if (!o) return; acikYaz(false); void yonlendir(o.yol); };

  return (
    <Pencere acik={acik} kapat={() => acikYaz(false)} baslik="Hızlı git">
      <input className="tc-inp" data-ilk-odak aria-label="Hızlı git" placeholder="Emir no, ürün kodu, malzeme, istasyon ya da bölüm yaz…" value={metin}
        onChange={(o) => { metinYaz(o.target.value); siraYaz(0); }}
        onKeyDown={(o) => {
          if (o.key === 'ArrowDown') { o.preventDefault(); siraYaz((i) => Math.min(ogeler.length - 1, i + 1)); }
          else if (o.key === 'ArrowUp') { o.preventDefault(); siraYaz((i) => Math.max(0, i - 1)); }
          else if (o.key === 'Enter') { o.preventDefault(); git(ogeler[sira]); }
        }} />
      <div className="tc-pal-liste" role="listbox" aria-label="Sonuçlar">
        {ogeler.length === 0 && <p className="tc-rota-ipucu">Sonuç yok.</p>}
        {ogeler.map((o, i) => (
          <button key={`${o.tur}${o.yol}${o.ad}`} type="button" role="option" aria-selected={i === sira} className="tc-pal-oge" onClick={() => git(o)}>
            <span className="tc-pal-tur">{o.tur}</span><b>{o.ad}</b>{o.alt && <small>{o.alt}</small>}
          </button>
        ))}
      </div>
      <p className="tc-rota-ipucu">↑↓ ile seç, Enter ile git, Esc ile kapat.</p>
    </Pencere>
  );
}

// Her bölüm ekranı paletle birlikte açılır (Ctrl / Cmd + K bütün merkezde çalışır).
export function paletli(Ekran: ComponentType): ComponentType {
  const Paletli = () => <><Ekran /><KomutPaleti /></>;
  Paletli.displayName = `Paletli(${Ekran.displayName ?? Ekran.name})`;
  return Paletli;
}
