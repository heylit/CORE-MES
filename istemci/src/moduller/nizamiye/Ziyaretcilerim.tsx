import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BenimZiyaretcim, Neden, OnKayitGovdesi, ZiyaretcilerimCevabi } from '#paylasilan/sozlesme/nizamiye.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Girdi, Pencere, Rozet, Simge, type RozetTonu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { EvetHayir } from './EvetHayir.tsx';
import { useKomut } from './komut.ts';
import { NEDENLER, NEDEN_ADLARI, NEDEN_SIMGELERI, ZIYARET_DURUM_ADLARI, adi, saat, tarihSaat } from './gorunum.ts';
import './nizamiye.css';

const DURUM_TONU: Record<BenimZiyaretcim['durum'], RozetTonu> = { beklenen: 'bilgi', iceride: 'tamam', cikti: 'pasif', iptal: 'pasif' };

// Tesis saatiyle gün ve saat: sunucuya saat dilimli an gider (tarayıcının saat dilimi kullanılmaz).
const anOf = (gun: string, saatMetni: string): string => {
  const [s, d] = saatMetni.split(':').map(Number) as [number, number];
  return new Date(tesisGunBasi(gun) + (s * 60 + d) * 60_000).toISOString();
};

function YeniZiyaretci({ bitti, vazgec }: { bitti: (z: BenimZiyaretcim) => void; vazgec: () => void }) {
  const [ad, adYaz] = useState('');
  const [firma, firmaYaz] = useState('');
  const [telefon, telefonYaz] = useState('');
  const [neden, nedenYaz] = useState<Neden | null>(null);
  const [aciklama, aciklamaYaz] = useState('');
  const [gun, gunYaz] = useState(() => tesisGunu(Date.now()));
  const [zaman, zamanYaz] = useState('10:00');
  const [yemek, yemekYaz] = useState(false);
  const kaydet = useKomut<OnKayitGovdesi, BenimZiyaretcim>('Ön kayıt açılamadı.', { tekrarKorumali: true });
  const eksik = [ad.trim() === '' && 'ad', neden === null && 'neden', (gun === '' || zaman === '') && 'gün ve saat'].filter(Boolean);

  const gonder = (o: FormEvent) => {
    o.preventDefault();
    if (eksik.length > 0 || neden === null) return;
    kaydet.mutate({
      yol: '/ziyaretcilerim/on-kayit',
      govde: { ad, firmaAdi: firma, telefon, neden, aciklama, beklenenZaman: anOf(gun, zaman), ogleYemegi: yemek },
    }, { onSuccess: bitti });
  };

  return (
    <form className="tc-nz-panel-form" onSubmit={gonder}>
      <Girdi etiket="Ziyaretçinin adı soyadı" required maxLength={120} value={ad} onChange={(o) => adYaz(o.target.value)} />
      <div className="tc-nz-iki">
        <Girdi etiket="Firma (isteğe bağlı)" maxLength={120} value={firma} onChange={(o) => firmaYaz(o.target.value)} />
        <Girdi etiket="Telefon (isteğe bağlı)" inputMode="tel" maxLength={20} value={telefon} onChange={(o) => telefonYaz(o.target.value)} />
      </div>
      <div className="tc-nz-nedenler" role="group" aria-label="Neden geliyor">
        {NEDENLER.map((n) => (
          <button key={n} type="button" className="tc-nz-neden" aria-pressed={neden === n} onClick={() => nedenYaz(n)}>
            <Simge ad={NEDEN_SIMGELERI[n]} />{NEDEN_ADLARI[n]}
          </button>
        ))}
      </div>
      <Girdi etiket="Not (isteğe bağlı)" maxLength={200} value={aciklama} onChange={(o) => aciklamaYaz(o.target.value)} />
      <div className="tc-nz-iki">
        <Girdi etiket="Gün" type="date" required value={gun} onChange={(o) => gunYaz(o.target.value)} />
        <Girdi etiket="Saat" type="time" required value={zaman} onChange={(o) => zamanYaz(o.target.value)} />
      </div>
      <EvetHayir simge="coffee" ad="Öğle yemeğine kalacak" deger={yemek} degistir={yemekYaz} />
      <p className="tc-nz-soluk" role="status">{eksik.length > 0 ? `Eksik: ${eksik.join(', ')}` : 'Kapı görevlisi ziyaretçiyi beklenenler listesinde görür.'}</p>
      <div className="tc-nz-panel-alt">
        <Dugme onClick={vazgec}>Vazgeç</Dugme>
        <Dugme tur="birincil" type="submit" simge="check" disabled={eksik.length > 0} yukleniyor={kaydet.isPending}>Kaydet</Dugme>
      </div>
    </form>
  );
}

// Her çalışanın kendi ziyaretçileri (217 a): ön kayıt açar, yalnız kendininkini görür, gelmeden iptal eder.
export function ZiyaretcilerimPenceresi({ kapat }: { kapat: () => void }) {
  const veri = useQuery({ queryKey: anahtarlar.ziyaretcilerim, queryFn: () => api.get<ZiyaretcilerimCevabi>('/ziyaretcilerim') });
  const [yeni, yeniYaz] = useState(false);
  const [son, sonYaz] = useState<string | null>(null);
  const iptal = useKomut<{ surum: number }, BenimZiyaretcim>('İptal edilemedi.');

  return (
    <Pencere acik baslik="Ziyaretçilerim" tur="yan" kapat={kapat}>
      <div className="tc-nz">
        {son && <div className="tc-nz-serit" role="status"><Simge ad="check" /><span>{son}</span></div>}
        {yeni
          ? <YeniZiyaretci vazgec={() => yeniYaz(false)} bitti={(z) => { yeniYaz(false); sonYaz(`${adi(z)} için ön kayıt açıldı (${z.ziyaretNo}).`); }} />
          : <Dugme tur="birincil" boyut="ana" simge="plus" onClick={() => { sonYaz(null); yeniYaz(true); }}>Ziyaretçi bekliyorum</Dugme>}
        {veri.isPending && <DurumKutusu durum="yukleniyor" />}
        {veri.isError && <DurumKutusu durum="hata" yenile={() => { void veri.refetch(); }} />}
        {veri.data?.ziyaretler.length === 0 && <p className="tc-nz-bos">Kayıtlı ziyaretçin yok.</p>}
        {veri.data?.ziyaretler.map((z) => (
          <article key={z.id} className="tc-nz-satir">
            <span className="tc-nz-satir-simge" aria-hidden="true"><Simge ad={NEDEN_SIMGELERI[z.neden]} /></span>
            <div className="tc-nz-satir-ad">
              <strong>{adi(z)}</strong>
              <span className="tc-nz-soluk">{[z.firmaAdi, NEDEN_ADLARI[z.neden]].filter(Boolean).join(' · ')}</span>
              <span className="tc-nz-soluk">
                {z.durum === 'iceride' ? `Giriş ${saat(z.giris)}${z.kartNo ? ` · kart ${z.kartNo}` : ''}`
                  : z.durum === 'cikti' ? `Çıkış ${saat(z.cikis)}` : tarihSaat(z.beklenenZaman)}
              </span>
            </div>
            <Rozet ton={DURUM_TONU[z.durum]}>{ZIYARET_DURUM_ADLARI[z.durum]}</Rozet>
            {z.durum === 'beklenen' && (
              <Dugme simge="x" yukleniyor={iptal.isPending && iptal.variables.yol.includes(`/${z.id}/`)}
                onClick={() => iptal.mutate({ yol: `/ziyaretcilerim/${z.id}/iptal`, govde: { surum: z.surum } })}>İptal</Dugme>
            )}
          </article>
        ))}
      </div>
    </Pencere>
  );
}
