import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { KartlaAlGovdesi, RefakatKartSatiri, RefakatPartisi, SepetCevabi, SepetEkleGovdesi, TeslimCevabi, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Girdi, Secim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { birimliMiktar, KONUM_ETIKETI, miktarGirdisi, miktarMetni } from './gorunum.ts';
import { hataMetni, KaliteRozeti, korumaliPost, useStokKomutu } from './ortak.tsx';
import { useStatuAdi } from './statu.ts';

const satirAnahtari = (x: RefakatKartSatiri): string => `${x.konumId}:${x.partiId}:${x.statuId ?? 0}:${x.kaliteDurumu}`;
const yerMetni = (x: RefakatKartSatiri): string => `${x.konumAd ?? x.konumKod} · ${KONUM_ETIKETI[x.konumTur]}`;

// Üretim Terminali kartın işini kişinin istasyonunda açar (Soru 134); iş orada değilse terminal sıradaki adımın istasyonunu söyler.
export function IsEmriniAc({ r }: { r: RefakatPartisi }) {
  const yonlendir = useNavigate();
  if (r.durum !== 'acik') return null;
  return <Dugme tur="birincil" simge="play" onClick={() => { void yonlendir(`/uretim-terminali?emir=${String(r.uretimEmriId)}&kart=${String(r.id)}`); }}>İş emrini aç</Dugme>;
}

// Kartın satırları (Soru 128): malzeme rota boyunca nerede. Satır seçilince miktarla Serbest Al (kendi istasyonuna, kaynak onayı yok,
// kaynak taraf itiraz eder) ya da Sepete ekle. Yalnız serbest ve yoldaki düşülünce kalan alınır.
export function KartSatirlari({ r, satirlar }: { r: RefakatPartisi; satirlar: RefakatKartSatiri[] }) {
  const statuAdi = useStatuAdi();
  const [secili, setSecili] = useState<string | null>(null);
  const s = satirlar.find((x) => satirAnahtari(x) === secili) ?? null;
  if (satirlar.length === 0) return <p className="tc-stok-not">Kartın malzemesi stokta görünmüyor.</p>;
  return (
    <div className="tc-stok-form" role="region" aria-label="Kartın satırları">
      <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Kartın satırları listesi">
        {satirlar.map((x) => (
          <li key={satirAnahtari(x)} className="tc-stok-is tc-stok-teslim-satir">
            <div>
              <strong>{x.malzemeAd ?? x.malzemeKod ?? `Malzeme #${x.malzemeId}`} · {birimliMiktar(x.miktar, x.birim)}</strong>
              <span>{yerMetni(x)} · {statuAdi(x.statuId)} <KaliteRozeti durum={x.kaliteDurumu} /></span>
              <span className="tc-stok-mono">{x.partiEtiketi}{Number(x.yolda) > 0 ? ` · yolda ${miktarMetni(x.yolda)}` : ''}</span>
            </div>
            {Number(x.alinabilir) > 0 && r.durum === 'acik' && (
              <Dugme tur={secili === satirAnahtari(x) ? 'birincil' : 'ikincil'} aria-pressed={secili === satirAnahtari(x)}
                onClick={() => setSecili((a) => (a === satirAnahtari(x) ? null : satirAnahtari(x)))}>Seç</Dugme>
            )}
          </li>
        ))}
      </ul>
      {s && <SatirIslemi key={satirAnahtari(s)} r={r} s={s} bitti={() => setSecili(null)} />}
    </div>
  );
}

function SatirIslemi({ r, s, bitti }: { r: RefakatPartisi; s: RefakatKartSatiri; bitti: () => void }) {
  const kutu = useQuery({ queryKey: ['stok', 'teslim-kutusu'], queryFn: () => api.get<TeslimKutusuCevabi>('/stok/teslim-kutusu') });
  const istasyonlar = kutu.data?.istasyonlar ?? [];
  const [istasyon, setIstasyon] = useState('');
  const istasyonId = Number(istasyon || (kutu.data?.buradakiIstasyonId ?? istasyonlar[0]?.id ?? 0));
  const [miktar, setMiktar] = useState(miktarMetni(s.alinabilir).replace(/\./g, ''));
  // Kaynak kimliği seçim başına bir kez: yeniden gönderim ikinci teslim açmaz.
  const [kimlik] = useState(yeniIstekKimligi);
  const al = useStokKomutu((g: KartlaAlGovdesi) => korumaliPost<TeslimCevabi>(`/stok/refakat-partileri/${r.id}/serbest-al`, g).then((c) => { bitti(); return c; }), 'Alındı; kaynak tarafa bildirildi.');
  const sepete = useStokKomutu((g: SepetEkleGovdesi) => korumaliPost<SepetCevabi>('/stok/sepet/satir-ekle', g).then((c) => { bitti(); return c; }), 'Sepete eklendi.');
  const m = miktarGirdisi(miktar);
  const buradaMi = s.istasyonId !== null && s.istasyonId === istasyonId;
  const hata = al.komut.isError ? al.komut.error : sepete.komut.isError ? sepete.komut.error : null;
  return (
    <div className="tc-stok-form" role="group" aria-label="Seçilen satır">
      <div className="tc-stok-iki">
        <Girdi etiket="Miktar" inputMode="decimal" value={miktar} onChange={(e) => setMiktar(e.target.value)} />
        {istasyonlar.length > 1 && (
          <Secim etiket="İstasyonum" value={String(istasyonId)} onChange={(e) => setIstasyon(e.target.value)}
            secenekler={istasyonlar.map((i) => ({ deger: String(i.id), baslik: `${i.ad} (${i.kod})` }))} />
        )}
      </div>
      {hata && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(hata)}</p>}
      <div className="tc-stok-eylem">
        {istasyonId > 0 && !buradaMi && (
          <Dugme tur="birincil" simge="download" disabled={miktar.trim() === ''} yukleniyor={al.komut.isPending}
            onClick={() => al.komut.mutate({ konumId: s.konumId, partiId: s.partiId, statuId: s.statuId, miktar: m, istasyonId, kaynakKimligi: kimlik })}>Teslim al</Dugme>
        )}
        {/* Sepet satırı statü tutmaz (STK-S3): adım statüsündeki parça Teslim al ya da okutup Teslim et ile gider. */}
        {s.statuId === null && <Dugme simge="box" disabled={miktar.trim() === ''} yukleniyor={sepete.komut.isPending}
          onClick={() => sepete.komut.mutate({ malzemeId: s.malzemeId, miktar: m, kaynakKonumId: s.konumId, partiId: s.partiId, refakatPartisiId: r.id })}>Sepete ekle</Dugme>}
      </div>
      {al.onayPenceresi}{sepete.onayPenceresi}
    </div>
  );
}
