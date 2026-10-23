import { useState } from 'react';
import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import { Tablo, type Sutun } from '../../../../ortak/arayuz/Tablo.tsx';
import { useSayfaKomutlari, type SayfaKomutu } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { paraKisa, YOK } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { ikSabitleri } from '../motor.ts';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import type { Departman, Personel } from '../tipler.ts';
import { DepartmanFormu } from './DepartmanFormu.tsx';
import { adSoyadMetni, aktifMi, bugun, orgAgaci, siraliDepartman, siraliPersonel, ucretTarihte } from './kurallar.ts';
import { Bolum } from './parcalar.tsx';
import './personel.css';

interface DepartmanSatiri { d: Departman; calisanlar: Personel[]; beyaz: number | null; mavi: number | null; brut: number }

// Departmanlar ve raporlama ilişkileri; şema personel kartlarındaki "bağlı olduğu yönetici" alanından oluşur.
export function Organizasyon(o: IkEkranOzellikleri) {
  const { depo, yetki, motor, git } = o;
  const gun = bugun();
  const [form, formYaz] = useState<{ kayit: Departman | null } | null>(null);
  const sabit = ikSabitleri();
  const aktifler = siraliPersonel(depo.tur('emp').filter((p) => aktifMi(p, gun)), gun);
  const departmanAdi = (id: string | undefined) => (id ? depo.tur('dept').find((d) => d.id === id)?.ad ?? '' : '');
  const personelAdi = (id: string | undefined) => (id ? adSoyadMetni(depo.tur('emp').find((p) => p.id === id)) || YOK : YOK);

  const satirlar: DepartmanSatiri[] = siraliDepartman(depo.tur('dept')).map((d) => {
    const calisanlar = aktifler.filter((p) => p.departmanId === d.id);
    const yaka = (t: string) => (sabit ? calisanlar.filter((p) => sabit.collarOf(p) === t).length : null);
    return { d, calisanlar, beyaz: yaka('Beyaz yaka'), mavi: yaka('Mavi yaka'), brut: calisanlar.reduce((a, p) => a + ucretTarihte(p, gun), 0) };
  });

  const sutunlar: Sutun<DepartmanSatiri>[] = [
    { anahtar: 'ad', baslik: 'Departman', hucre: (r) => <b>{r.d.ad ?? ''}</b>, csv: (r) => r.d.ad ?? '' },
    { anahtar: 'kod', baslik: 'Kod', hucre: (r) => r.d.kod || YOK, mono: true },
    { anahtar: 'yonetici', baslik: 'Yönetici', hucre: (r) => personelAdi(r.d.yoneticiId) },
    { anahtar: 'calisan', baslik: 'Çalışan', hizala: 'sag', hucre: (r) => r.calisanlar.length },
    {
      anahtar: 'yaka', baslik: 'Beyaz / mavi yaka', csv: (r) => (r.beyaz === null ? null : `${r.beyaz} / ${r.mavi ?? 0}`),
      hucre: (r) => {
        if (!r.calisanlar.length || r.beyaz === null) return YOK;
        const metin = `${r.beyaz} beyaz, ${r.mavi ?? 0} mavi yaka`;
        return (
          <span className="tc-ikp-yaka" title={metin}>
            <progress max={r.calisanlar.length} value={r.beyaz} aria-label={metin} />
            <small>{`${r.beyaz} / ${r.mavi ?? 0}`}</small>
          </span>
        );
      },
    },
    { anahtar: 'brut', baslik: 'Aylık brüt toplamı', hizala: 'sag', hucre: (r) => paraKisa(r.brut), csv: (r) => r.brut },
    { anahtar: 'butce', baslik: 'Yıllık bütçe', hizala: 'sag', hucre: (r) => (r.d.butce ? paraKisa(r.d.butce) : YOK), csv: (r) => r.d.butce ?? null },
  ];

  const { kokler, altlar } = orgAgaci(aktifler);
  const gorulen = new Set<string>();
  const dugum = (p: Personel) => {
    if (gorulen.has(p.id)) return null;
    gorulen.add(p.id);
    const alt = altlar.get(p.id) ?? [];
    const yer = [p.pozisyon, departmanAdi(p.departmanId)].filter(Boolean).join(', ');
    return (
      <li key={p.id}>
        <button type="button" className="tc-ikp-dugum" onClick={() => { git('calisan', p.id); }}>
          <KisiHucresi personel={p} alt={yer || undefined} />
        </button>
        {alt.length > 0 && <ul>{alt.map(dugum)}</ul>}
      </li>
    );
  };

  const komutlar: SayfaKomutu[] = [
    ...(yetki.personelYaz ? [{ anahtar: 'yeni', baslik: 'Departman ekle', simge: 'building' as const, aciklama: null, sozcukler: ['yeni', 'departman', 'ekle'], calistir: () => { formYaz({ kayit: null }); } }] : []),
    ...satirlar.map((r) => ({
      anahtar: `dept-${r.d.id}`, baslik: r.d.ad ?? '', simge: 'building' as const, aciklama: `${r.calisanlar.length} çalışan`, sozcukler: [r.d.kod ?? ''].filter(Boolean),
      calistir: () => { if (yetki.personelYaz) formYaz({ kayit: r.d }); },
    })),
  ];
  useSayfaKomutlari('ik-org', komutlar);

  return (
    <div className="tc-ikp">
      <SayfaBasligi
        baslik="Organizasyon" simge="building" alt="Departmanlar ve raporlama ilişkileri. Şema, personel kartlarındaki “bağlı olduğu yönetici” alanından oluşur."
        birincil={yetki.personelYaz ? { etiket: 'Departman ekle', simge: 'plus', yap: () => { formYaz({ kayit: null }); } } : undefined}
      />
      <Bolum baslik="Departmanlar">
        <Tablo
          etiket="Departmanlar" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(r) => r.d.id}
          satirSec={yetki.personelYaz ? (r) => { formYaz({ kayit: r.d }); } : undefined}
          bosMesaj="Departman yok. Personeli gruplamak için departman ekleyin."
        />
      </Bolum>
      <Bolum baslik="Organizasyon şeması">
        {kokler.length ? <ul className="tc-ikp-agac">{kokler.map(dugum)}</ul> : <p className="tc-ikp-ipucu">Aktif personel yok.</p>}
      </Bolum>
      {yetki.personelYaz && (
        <DepartmanFormu acik={form !== null} kayit={form?.kayit ?? null} depo={depo} motor={motor} kapat={() => { formYaz(null); }} />
      )}
    </div>
  );
}
