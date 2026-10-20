import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { HareketlerCevabi, MalzemelerCevabi, StokDurumuSuzgeci } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Rozet, Sayfalama, type RozetTonu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { BolumHatasi } from './BolumHatasi.tsx';
import { csvIndir, ondalik } from './csv.ts';
import { kisaZaman } from './usePlan.ts';
import './kaynak.css';
import './plan.css';
import './rotalar.css';

const BOY = 50;
const DURUM: Record<MalzemelerCevabi['satirlar'][number]['durum'], { ad: string; ton: RozetTonu }> = {
  yeterli: { ad: 'Yeterli', ton: 'tamam' }, kritik: { ad: 'Minimumun altında', ton: 'uyari' }, eksi: { ad: 'Eksi', ton: 'hata' }, tanimsiz: { ad: 'Minimum yok', ton: 'pasif' },
};
const HAREKET: Record<HareketlerCevabi['satirlar'][number]['tur'], string> = {
  giris: 'Giriş', cikis: 'Çıkış', transfer: 'Taşıma', sayim_fazla: 'Sayım fazlası', sayim_eksik: 'Sayım eksiği', geri_alma: 'Geri alma',
};
const SUZGEC: [StokDurumuSuzgeci | '', string][] = [['', 'Hepsi'], ['kritik', 'Yalnızca minimumun altındakiler'], ['eksi', 'Eksi'], ['kabulde', 'Kabulde']];
const ANAHTAR = ['rotalar', 'stok'] as const;

// Prototipin Stok bölümü, salt okunur (kullanıcı kararı, #448): kart, miktar, minimum, düşük stok ve son hareketler stok modülünün
// uçlarından okunur; yazma (geri alma dahil) yalnız Stok Merkezi'ndedir, iki ekrandan yazılmaz. Statüler stok modülünde yok.
export function StokEkrani() {
  const oturum = useOturum();
  const merkez = ((oturum.data?.islemler ?? []) as readonly string[]).includes('sayfa.stok');
  const yonlendir = useNavigate();
  const [durum, durumYaz] = useState<StokDurumuSuzgeci | ''>('');
  const [metin, metinYaz] = useState('');
  const [sayfa, sayfaYaz] = useState(1);
  const sorgu = new URLSearchParams({ sayfa: String(sayfa), sayfaBoyu: String(BOY), ...(durum ? { durum } : {}), ...(metin.trim() ? { metin: metin.trim() } : {}) });
  const liste = useQuery({ queryKey: [...ANAHTAR, 'liste', sorgu.toString()], queryFn: () => api.get<MalzemelerCevabi>(`/stok/malzemeler?${sorgu.toString()}`) });
  const hareketler = useQuery({ queryKey: [...ANAHTAR, 'hareketler'], queryFn: () => api.get<HareketlerCevabi>('/stok/hareketler?sayfaBoyu=20') });
  const satirlar = liste.data?.satirlar ?? [];
  return (
    <div className="tc-merkez">
      <section className="tc-sch2" aria-label="Stok">
        <div className="tc-sec-head">
          <h2>Stok</h2>
          <p className="tc-rota-ipucu">Salt okunur: eldeki miktar, minimum ve hareketler Stok Merkezi'nden gelir. Mal kabul, çıkış, taşıma, sayım ve geri alma Stok Merkezi'ndedir.</p>
        </div>
        <div className="tc-satir">
          <span className="tc-seg" role="group" aria-label="Stok süzgeci">
            {SUZGEC.map(([d, ad]) => <button key={d || 'hepsi'} type="button" aria-pressed={durum === d} onClick={() => { durumYaz(d); sayfaYaz(1); }}>{ad}</button>)}
          </span>
          <input className="tc-inp tc-inp-orta" aria-label="Stokta ara" placeholder="Kart adı, stok kodu, konum ya da parti" value={metin} maxLength={40} onChange={(e) => { metinYaz(e.target.value); sayfaYaz(1); }} />
          <span className="tc-grow" />
          {merkez && <Dugme simge="box" onClick={() => { void yonlendir('/stok'); }}>Stok Merkezi'nde aç</Dugme>}
          <Dugme simge="download" disabled={satirlar.length === 0} onClick={() => csvIndir('stok', ['Stok kodu', 'Ad', 'Birim', 'Miktar', 'Minimum', 'Durum', 'Konumlar'],
            satirlar.map((m) => [m.stokKodu, m.ad, m.birim, ondalik(m.toplam), ondalik(m.kritikSeviye), DURUM[m.durum].ad, m.konumlar.map((k) => k.kod).join(' ')]))}>CSV indir</Dugme>
        </div>
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <BolumHatasi hata={liste.error} modul="Stok" yenile={() => { void liste.refetch(); }} />}
        {liste.data && (
          <div className="tc-panel">
            {satirlar.length === 0 ? <p className="tc-rota-ipucu">Bu süzgeçte stok kartı yok.</p> : (
              <div className="tc-matris-kap">
                <table className="tc-pmatris" aria-label="Stok kartları">
                  <thead><tr><th>Stok kodu</th><th>Ad</th><th>Miktar</th><th>Minimum</th><th>Durum</th><th>Konumlar</th></tr></thead>
                  <tbody>
                    {satirlar.map((m) => (
                      <tr key={m.malzemeId}>
                        <th>{m.stokKodu ?? '–'}</th><td>{m.ad ?? '–'}</td><td>{m.toplam} {m.birim ?? ''}</td><td>{m.kritikSeviye ?? '–'}</td>
                        <td><Rozet ton={DURUM[m.durum].ton}>{DURUM[m.durum].ad}</Rozet></td><td>{m.konumlar.map((k) => `${k.kod} (${k.miktar})`).join(', ') || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Sayfalama sayfa={liste.data.sayfa} sayfaBoyu={liste.data.sayfaBoyu} toplam={liste.data.toplam} satirSayisi={satirlar.length} degistir={sayfaYaz} etiket="Stok sayfaları" />
          </div>
        )}
        <div className="tc-panel">
          <h3>Statüler ve statülü stok</h3>
          <p className="tc-rota-ipucu">Ara hal ve kalite statüleri Stok Merkezi'nde henüz yok; geldiğinde statü tanımı, kartın statülü stokları ve "Statü atlat" burada görünür.</p>
        </div>
        <div className="tc-panel" aria-label="Stok hareketleri">
          <div className="tc-satir"><h3>Stok hareketleri</h3><span className="tc-grow" />
            {merkez && <Dugme simge="back" onClick={() => { void yonlendir('/stok/hareketler'); }}>Geri almak için Stok Merkezi</Dugme>}
          </div>
          {hareketler.isPending && <DurumKutusu durum="yukleniyor" />}
          {hareketler.isError && <BolumHatasi hata={hareketler.error} modul="Stok" yenile={() => { void hareketler.refetch(); }} />}
          {hareketler.data && (hareketler.data.satirlar.length === 0 ? <p className="tc-rota-ipucu">Hareket yok.</p> : (
            <div className="tc-matris-kap">
              <table className="tc-pmatris" aria-label="Son stok hareketleri">
                <thead><tr><th>Zaman</th><th>Tür</th><th>Malzeme</th><th>Miktar</th><th>Nereden</th><th>Nereye</th><th>Kişi</th></tr></thead>
                <tbody>
                  {hareketler.data.satirlar.map((h) => (
                    <tr key={h.id}>
                      <th>{kisaZaman(h.zaman)}</th><td>{HAREKET[h.tur]}{h.geriAlindi ? ' (geri alındı)' : ''}</td><td>{h.malzemeAd ?? h.malzemeId}</td><td>{h.miktar}</td>
                      <td>{h.kaynakKonumKod ?? '–'}</td><td>{h.hedefKonumKod ?? '–'}</td><td>{h.kisiAd ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
