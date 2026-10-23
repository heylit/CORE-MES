import { useMemo, useState } from 'react';
import { Rozet } from '../../../../ortak/arayuz/Rozet.tsx';
import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import { Secim } from '../../../../ortak/arayuz/Alan.tsx';
import { Tablo, type Sutun } from '../../../../ortak/arayuz/Tablo.tsx';
import type { MenuOgesi } from '../../../../ortak/arayuz/Menu.tsx';
import { useSayfaKomutlari, type SayfaKomutu } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { csvIndir, type CsvDegeri } from '../../../../ortak/veri/csv.ts';
import type { Siralama } from '../../../../ortak/veri/liste-durumu.ts';
import { tarih, YOK } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { ikSabitleri } from '../motor.ts';
import { DurumCipi } from '../ortak/DurumCipi.tsx';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import type { Personel } from '../tipler.ts';
import { PERSONEL_ALANLARI, PERSONEL_SECENEKLERI } from './alanlar.ts';
import { IceAktarma } from './IceAktarma.tsx';
import {
  aktifMi, BOS_SUZGEC, DURUM_TONU, bugun, kidemMetni, kucuk, personelDurumu, personelSirala, personelSuz, siraliDepartman, siraliPersonel,
  type DurumSuzgeci, type PersonelSiraAlani, type PersonelSuzgeci,
} from './kurallar.ts';
import { PersonelFormPenceresi } from './PersonelFormu.tsx';
import './personel.css';

const DURUMLAR = [{ deger: 'aktif', baslik: 'Aktif' }, { deger: 'pasif', baslik: 'Ayrılanlar' }, { deger: 'tum', baslik: 'Tümü' }] as const;
const sayi = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

// Personel listesi: süzgeç, sıralama, liste indirme, içe aktarma ve yeni personel. Kalan izin ve eksik belge motordan gelir.
export function PersonelListesi(o: IkEkranOzellikleri) {
  const { depo, yetki, motor, git } = o;
  const gun = bugun();
  const [s, sYaz] = useState<PersonelSuzgeci>(BOS_SUZGEC);
  const [sira, siraYaz] = useState<Siralama<PersonelSiraAlani> | null>({ alan: 'ad', yon: 'artan' });
  const [yeniAcik, yeniAcikYaz] = useState(false);
  const [aktarimAcik, aktarimAcikYaz] = useState(false);

  const tumu = depo.tur('emp');
  const izinler = depo.tur('leave');
  const departmanlar = siraliDepartman(depo.tur('dept'));
  const departmanAdi = (id: string | undefined) => (id ? departmanlar.find((d) => d.id === id)?.ad ?? YOK : YOK);
  const sabit = ikSabitleri();
  const kalan = useMemo(() => new Map(motor ? tumu.map((p) => [p.id, motor.leaveBalance(p, new Date()).kalan]) : []), [motor, tumu]);
  const eksik = (p: Personel) => (motor?.missingDocs(p) ?? []);

  const liste = useMemo(() => {
    const suzulen = personelSuz(siraliPersonel(tumu, gun), s, {
      gun, yaka: sabit?.collarOf, kademe: sabit?.levelOf, eksikBelge: motor ? (p) => motor.missingDocs(p) : undefined,
    });
    return sira ? personelSirala(suzulen, sira.alan, sira.yon, { departmanAdi, kalanIzin: (p) => kalan.get(p.id) ?? null }) : suzulen;
  }, [tumu, s, sira, motor, kalan]);
  const aktifSayisi = tumu.filter((p) => aktifMi(p, gun)).length;

  const sutunlar: Sutun<Personel>[] = [
    { anahtar: 'ad', baslik: 'Çalışan', hucre: (p) => <KisiHucresi personel={p} />, sirala: true, csv: (p) => `${p.ad ?? ''} ${p.soyad ?? ''}`.trim() },
    { anahtar: 'sicil', baslik: 'Sicil', hucre: (p) => p.sicilNo || YOK, sirala: true, mono: true },
    { anahtar: 'dept', baslik: 'Departman', hucre: (p) => departmanAdi(p.departmanId), sirala: true },
    { anahtar: 'giris', baslik: 'İşe giriş', hucre: (p) => tarih(p.iseGiris), sirala: true, kirilmaz: true },
    { anahtar: 'kidem', baslik: 'Kıdem', hucre: (p) => kidemMetni(p, gun) ?? YOK },
    {
      anahtar: 'izin', baslik: 'Kalan izin', hizala: 'sag', sirala: Boolean(motor),
      hucre: (p) => {
        const k = kalan.get(p.id);
        if (!aktifMi(p, gun) || k === undefined) return YOK;
        return k < 0 ? <Rozet ton="hata">{`${sayi(k)} gün`}</Rozet> : `${sayi(k)} gün`;
      },
      csv: (p) => (aktifMi(p, gun) ? kalan.get(p.id) ?? null : null),
    },
    {
      anahtar: 'durum', baslik: 'Durum', csv: (p) => personelDurumu(p, izinler, gun),
      hucre: (p) => {
        const md = aktifMi(p, gun) ? eksik(p) : [];
        return (
          <span className="tc-ikp-durumlar">
            <DurumCipi metin={personelDurumu(p, izinler, gun)} ton={DURUM_TONU[personelDurumu(p, izinler, gun)]} />
            {md.length > 0 && <span title={md.join(', ')}><Rozet ton="uyari">{`${md.length} eksik belge`}</Rozet></span>}
          </span>
        );
      },
    },
  ];

  const listeyiIndir = () => {
    const alanlar = PERSONEL_ALANLARI;
    const ad = (id: string | undefined) => { const x = tumu.find((p) => p.id === id); return x ? `${x.ad ?? ''} ${x.soyad ?? ''}`.trim() : ''; };
    const satirlar = siraliPersonel(tumu, gun).map((p): CsvDegeri[] => [
      ...alanlar.map((f): CsvDegeri => {
        const v = p[f.k];
        if (v === undefined || v === null || v === '') return '';
        if (f.tur === 'departman') return departmanAdi(String(v));
        if (f.tur === 'personel') return ad(String(v));
        if (f.tur === 'tarih') return tarih(String(v));
        if (typeof v === 'number' || typeof v === 'string') return v;
        if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır';
        return '';
      }),
      kidemMetni(p, gun) ?? '', motor ? motor.leaveBalance(p, new Date()).kalan : null, motor ? motor.missingDocs(p).length : null,
    ]);
    csvIndir('personel-listesi', [...alanlar.map((f) => f.l), 'Kıdem', 'Kalan yıllık izin', 'Eksik belge sayısı'], satirlar);
  };

  const eylemler: MenuOgesi[] = [
    ...(tumu.length ? [{ anahtar: 'indir', baslik: 'Listeyi indir', simge: 'download' as const, sec: listeyiIndir }] : []),
    ...(yetki.personelYaz ? [{ anahtar: 'aktar', baslik: 'Excel’den aktar', simge: 'upload' as const, sec: () => { aktarimAcikYaz(true); } }] : []),
  ];

  const komutlar: SayfaKomutu[] = [
    ...(yetki.personelYaz ? [{ anahtar: 'yeni', baslik: 'Personel ekle', simge: 'user-plus' as const, aciklama: null, sozcukler: ['yeni', 'personel', 'ekle', 'çalışan'], calistir: () => { yeniAcikYaz(true); } }] : []),
    ...tumu.map((p) => ({
      anahtar: `kisi-${p.id}`, baslik: `${p.ad ?? ''} ${p.soyad ?? ''}`.trim() || 'İsimsiz', simge: 'user' as const,
      aciklama: [p.pozisyon, departmanAdi(p.departmanId) === YOK ? '' : departmanAdi(p.departmanId)].filter(Boolean).join(', ') || null,
      sozcukler: [p.sicilNo ?? '', kucuk(p.pozisyon)].filter(Boolean), calistir: () => { git('calisan', p.id); },
    })),
  ];
  useSayfaKomutlari('ik-personel', komutlar);

  const secim = (k: keyof PersonelSuzgeci, etiket: string, secenekler: readonly { deger: string; baslik: string }[], hepsi: string) => (
    <Secim etiket={etiket} value={s[k]} secenekler={secenekler} bosSecenek={hepsi} onChange={(e) => { sYaz({ ...s, [k]: e.target.value }); }} />
  );
  const duz = (l: readonly string[]) => l.map((x) => ({ deger: x, baslik: x }));

  return (
    <div className="tc-ikp">
      <SayfaBasligi
        baslik="Personel" simge="user" alt={`${aktifSayisi} aktif, ${tumu.length - aktifSayisi} pasif kayıt.`} eylemler={eylemler}
        birincil={yetki.personelYaz ? { etiket: 'Personel ekle', simge: 'user-plus', yap: () => { yeniAcikYaz(true); } } : undefined}
      />
      <div className="tc-ikp-suzgecler">
        {secim('departman', 'Departman', departmanlar.map((d) => ({ deger: d.id, baslik: d.ad ?? '' })), 'Tüm departmanlar')}
        {secim('sozlesme', 'Sözleşme türü', duz(PERSONEL_SECENEKLERI.sozlesmeTuru), 'Tüm sözleşmeler')}
        {sabit && secim('yaka', 'Yaka tipi', duz(sabit.COLLARS), 'Tüm yaka tipleri')}
        {sabit && secim('kademe', 'Rol kademesi', duz(sabit.LEVELS), 'Tüm kademeler')}
        {motor && secim('belge', 'Belge durumu', [{ deger: 'eksik', baslik: 'Eksik belgesi olanlar' }], 'Tüm belge durumları')}
      </div>
      <Tablo
        etiket="Personel listesi" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(p) => p.id} satirSec={(p) => { git('calisan', p.id); }}
        siralama={sira} siralamaDegistir={(x) => { siraYaz(x as Siralama<PersonelSiraAlani> | null); }}
        bosMesaj={tumu.length ? 'Sonuç bulunamadı. Arama veya filtreleri değiştirin.' : 'Henüz personel yok. İlk çalışanı ekleyerek özlük dosyasını oluşturun.'}
        arac={{
          arama: { deger: s.arama, degistir: (v) => { sYaz({ ...s, arama: v }); }, etiket: 'Personel ara', yerTutucu: 'Ad, sicil, pozisyon veya T.C. no ile ara' },
          suzgec: { etiket: 'Durum', secenekler: DURUMLAR, secili: s.durum, sec: (v) => { sYaz({ ...s, durum: v as DurumSuzgeci }); } },
        }}
      />
      {yetki.personelYaz && (
        <PersonelFormPenceresi
          acik={yeniAcik} depo={depo} motor={motor} kayit={null} bolum={null} kapat={() => { yeniAcikYaz(false); }}
          kaydedildi={(p) => { git('calisan', p.id); }}
        />
      )}
      {yetki.personelYaz && <IceAktarma acik={aktarimAcik} kapat={() => { aktarimAcikYaz(false); }} depo={depo} />}
    </div>
  );
}
