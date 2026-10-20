import { useQuery } from '@tanstack/react-query';
import type { AcilDurumCevabi } from '#paylasilan/sozlesme/nizamiye.ts';
import { Dugme, DurumKutusu, Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { NEDEN_ADLARI, adi, saat, tarihSaat } from './gorunum.ts';
import './nizamiye.css';

// Toplanma alanında yoklama listesi: sık tazelenir, A4'e tek tuşla basılır. Personel PDKS dosyasından gelir (243 a).
export function AcilDurum() {
  const veri = useQuery({ queryKey: anahtarlar.acil, queryFn: () => api.get<AcilDurumCevabi>('/nizamiye/acil-durum'), refetchInterval: 15_000 });
  if (veri.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (veri.isError) return <DurumKutusu durum="hata" yenile={() => { void veri.refetch(); }} />;
  const { zaman, yazdiran, ziyaretler, personel, pdksSonAktarim } = veri.data;

  return (
    <div className="tc-nz tc-nz-acil-sayfa">
      <div className="tc-nz-acil-ust">
        <h1 className="tc-nz-sayfa-baslik"><Simge ad="alert" /> ACİL DURUM: içerideki kişiler</h1>
        <Dugme tur="tehlike" boyut="ana" simge="printer" onClick={() => window.print()}>Yazdır</Dugme>
      </div>
      <p className="tc-nz-acil-ozet">
        <strong>{`${String(ziyaretler.length)} ziyaretçi, ${pdksSonAktarim === null ? '—' : String(personel.length)} personel içeride.`}</strong>
        <span>{`${tarihSaat(zaman)} · yazdıran ${yazdiran}`}</span>
      </p>
      <h2 className="tc-nz-panel-baslik"><Simge ad="users" /> Personel</h2>
      {pdksSonAktarim === null
        ? <p className="tc-nz-soluk">PDKS dosyası hiç aktarılmadı; personel yoklaması vardiya listesinden yapılır.</p>
        : (
          <>
            <p className="tc-nz-soluk">{`PDKS son aktarım ${tarihSaat(pdksSonAktarim)}; sonrasındaki giriş ve çıkışlar listede yok.`}</p>
            <table className="tc-nz-acil-tablo">
              <thead><tr><th>Var</th><th>Personel</th><th>Sicil</th><th>Giriş</th></tr></thead>
              <tbody>
                {personel.map((p) => (
                  <tr key={p.kisiId}>
                    <td><span className="tc-nz-yoklama" aria-label="Yoklama kutusu" /></td>
                    <td><strong>{p.ad}</strong></td>
                    <td>{p.sicilNo ?? '—'}</td>
                    <td>{saat(p.giris)}</td>
                  </tr>
                ))}
                {personel.length === 0 && <tr><td colSpan={4}>PDKS'ye göre içeride personel yok.</td></tr>}
              </tbody>
            </table>
          </>
        )}
      <h2 className="tc-nz-panel-baslik"><Simge ad="user" /> Ziyaretçiler</h2>
      <table className="tc-nz-acil-tablo">
        <thead>
          <tr><th>Var</th><th>Ziyaretçi</th><th>Firma</th><th>Kart</th><th>Ev sahibi</th><th>Neden</th><th>Giriş</th><th>Telefon</th></tr>
        </thead>
        <tbody>
          {ziyaretler.map((z) => (
            <tr key={z.id}>
              <td><span className="tc-nz-yoklama" aria-label="Yoklama kutusu" /></td>
              <td><strong>{adi(z)}</strong>{z.atolye && <span className="tc-nz-soluk"> · atölyede</span>}</td>
              <td>{z.firmaAdi ?? '—'}</td>
              <td className="tc-nz-kartno">{z.kartNo ?? '—'}</td>
              <td>{z.evSahibiAd ?? '—'}</td>
              <td>{NEDEN_ADLARI[z.neden]}</td>
              <td>{saat(z.giris)}</td>
              <td>{z.telefon ?? '—'}</td>
            </tr>
          ))}
          {ziyaretler.length === 0 && <tr><td colSpan={8}>İçeride ziyaretçi yok.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
