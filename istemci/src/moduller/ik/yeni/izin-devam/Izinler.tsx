import { useMemo, useState } from 'react';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { DurumKutusu, Rozet, Secim, Sekmeler, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari, type SayfaKomutu } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { csvIndir } from '../../../../ortak/veri/csv.ts';
import { adSoyad, tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { MOTOR_HAZIRLANIYOR } from '../motor.ts';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import type { Izin, Personel } from '../tipler.ts';
import { aktifPersonel, bakiye, isGunuMu, listeler, type IzinBakiyesi } from './hesap.ts';
import { IzinFormu } from './IzinFormu.tsx';
import { IzinTablosu } from './IzinTablosu.tsx';
import { AyYilSecici, Baslik, type BaslikDugmesi } from './parcalar.tsx';
import {
  ayGunleri, haftaGunu, izinleriSuz, izinYillari, onaylananGun, PUANTAJ_GUN_ADI, sayi, sayiYaz, takvimHucresi, takvimSatirlari, TUM_YILLAR,
} from './kurallar.ts';
import './izin-devam.css';

type IzinSekmesi = 'talepler' | 'bakiye' | 'takvim';
const SEKMELER = [{ anahtar: 'talepler', baslik: 'Talepler' }, { anahtar: 'bakiye', baslik: 'Bakiyeler' }, { anahtar: 'takvim', baslik: 'Takvim' }] as const;

// Izinler: talepler, kanuni yillik izin bakiyeleri ve aylik izin takvimi.
export function Izinler(o: IkEkranOzellikleri) {
  const bugun = tesisGunu(Date.now());
  const l = listeler();
  const [sekme, sekmeYaz] = useState<IzinSekmesi>('talepler');
  const [suzgec, suzgecYaz] = useState({ ara: '', durum: '', tur: '', yil: bugun.slice(0, 4) });
  const [ay, ayYaz] = useState(bugun.slice(0, 7));
  const [yeni, yeniYaz] = useState(false);
  const [duzenle, duzenleYaz] = useState<Izin | null>(null);
  const izinler = o.depo.tur('leave');
  const personeller = o.depo.tur('emp');
  const ad = (id: string | undefined) => { const p = personeller.find((x) => x.id === id); return p ? adSoyad(p) : ''; };
  const departman = (id: string | undefined) => o.depo.tur('dept').find((d) => d.id === id)?.ad ?? '';

  const suzulen = useMemo(() => izinleriSuz(izinler, suzgec, ad), [izinler, suzgec, personeller]);
  const yillar = izinYillari(izinler, bugun.slice(0, 4));
  const bakiyeler = useMemo(() => (o.motor ? aktifPersonel(o.motor).map((p) => ({ p, b: bakiye(o.motor!, p) })) : null), [o.motor]);

  const kayitlariIndir = () => {
    const satirlar = [...izinler].sort((a, b) => (b.baslangic ?? '').localeCompare(a.baslangic ?? '')).map((l) => {
      const p = personeller.find((x) => x.id === l.empId);
      return [ad(l.empId), departman(p?.departmanId), l.tur ?? '', tarih(l.baslangic), tarih(l.bitis), sayi(l.gun), l.durum ?? '', l.aciklama ?? ''];
    });
    csvIndir('izin-kayitlari', ['Çalışan', 'Departman', 'İzin türü', 'Başlangıç', 'Bitiş', 'Gün', 'Durum', 'Açıklama'], satirlar);
  };
  const bakiyeleriIndir = () => {
    if (!bakiyeler) return;
    csvIndir('izin-bakiyeleri', ['Çalışan', 'Departman', 'İşe giriş', 'Hak edilen', 'Sistem öncesi kullanılan', 'Kullanılan (sistemde)', 'Bekleyen', 'Kalan', 'Sonraki hak ediş'],
      bakiyeler.map(({ p, b }) => [adSoyad(p), departman(p.departmanId), tarih(p.iseGiris), b.hak, b.onceki, b.kullanilan, b.bekleyen, b.kalan, b.sonraki ? tarih(b.sonraki) : '']));
  };

  const dugmeler: BaslikDugmesi[] = [
    ...(sekme === 'talepler' ? [{ anahtar: 'indir', etiket: 'Kayıtları indir', simge: 'download' as const, yap: kayitlariIndir }] : []),
    ...(sekme === 'bakiye' ? [{ anahtar: 'indir', etiket: 'Bakiyeleri indir', simge: 'download' as const, yap: bakiyeleriIndir, pasif: !bakiyeler }] : []),
    { anahtar: 'hesap', etiket: 'Hak ediş hesapla', simge: 'ruler', yap: () => { o.git('hesap'); } },
    ...(o.yetki.izinYaz ? [{ anahtar: 'yeni', etiket: 'İzin talebi', simge: 'plus' as const, birincil: true, yap: () => { yeniYaz(true); } }] : []),
  ];

  const komutlar: SayfaKomutu[] = [
    ...(o.yetki.izinYaz ? [{ anahtar: 'yeni', baslik: 'İzin talebi gir', simge: 'plus' as const, aciklama: null, sozcukler: ['izin', 'talep', 'yeni'], calistir: () => { yeniYaz(true); } }] : []),
    ...SEKMELER.map((s) => ({ anahtar: `sekme-${s.anahtar}`, baslik: `İzinler: ${s.baslik}`, simge: 'flag' as const, aciklama: null, sozcukler: ['izin', s.baslik], calistir: () => { sekmeYaz(s.anahtar); } })),
    ...izinler.filter((l) => l.durum === 'Beklemede').map((l) => ({
      anahtar: `izin-${l.id}`, baslik: `${ad(l.empId)}: ${l.tur ?? ''} talebi`, simge: 'flag' as const, aciklama: `${tarih(l.baslangic)} – ${tarih(l.bitis)}`,
      sozcukler: [ad(l.empId), l.tur ?? '', 'bekleyen'], calistir: () => { sekmeYaz('talepler'); if (o.yetki.izinYaz) duzenleYaz(l); },
    })),
  ];
  useSayfaKomutlari('ik-izin', komutlar);

  return (
    <section className="tc-iki">
      <Baslik baslik="İzinler" simge="flag" alt="İzin talepleri, onaylar, kanuni yıllık izin bakiyeleri ve aylık izin takvimi." dugmeler={dugmeler} />
      <Sekmeler etiket="Görünüm" sekmeler={SEKMELER} secili={sekme} sec={sekmeYaz} />
      {sekme === 'talepler' && (
        <>
          <IzinTablosu
            o={o} izinler={suzulen} kisiSutunu
            arac={{
              arama: { deger: suzgec.ara, degistir: (ara) => { suzgecYaz({ ...suzgec, ara }); }, etiket: 'Çalışan ara', yerTutucu: 'Çalışan ara' },
              sag: (
                <span className="tc-iki-suzgecler">
                  <Secim etiket="Durum" bosSecenek="Tüm durumlar" secenekler={(l?.izinDurumlari ?? []).map((t) => ({ deger: t, baslik: t }))} value={suzgec.durum} onChange={(e) => { suzgecYaz({ ...suzgec, durum: e.target.value }); }} />
                  <Secim etiket="İzin türü" bosSecenek="Tüm türler" secenekler={(l?.izinTurleri ?? []).map((t) => ({ deger: t, baslik: t }))} value={suzgec.tur} onChange={(e) => { suzgecYaz({ ...suzgec, tur: e.target.value }); }} />
                  <Secim etiket="Yıl" secenekler={[...yillar.map((y) => ({ deger: y, baslik: y })), { deger: TUM_YILLAR, baslik: 'Tüm yıllar' }]} value={suzgec.yil} onChange={(e) => { suzgecYaz({ ...suzgec, yil: e.target.value }); }} />
                </span>
              ),
            }}
          />
          <p className="tc-iki-not">{suzulen.length} kayıt, onaylanan toplam {sayiYaz(onaylananGun(suzulen))} gün.</p>
        </>
      )}
      {sekme === 'bakiye' && (bakiyeler ? <Bakiyeler o={o} satirlar={bakiyeler} /> : <DurumKutusu durum="yukleniyor" mesaj={MOTOR_HAZIRLANIYOR} />)}
      {sekme === 'takvim' && <IzinTakvimi o={o} ay={ay} ayYaz={ayYaz} bugun={bugun} izinler={izinler} ad={ad} duzenle={o.yetki.izinYaz ? duzenleYaz : null} />}
      <IzinFormu o={o} acik={yeni} kayit={null} onDolu={{}} kapat={() => { yeniYaz(false); }} />
      <IzinFormu o={o} acik={duzenle !== null} kayit={duzenle} onDolu={{}} kapat={() => { duzenleYaz(null); }} />
    </section>
  );
}

function Bakiyeler({ o, satirlar }: { o: IkEkranOzellikleri; satirlar: { p: Personel; b: IzinBakiyesi }[] }) {
  type Satir = { p: Personel; b: IzinBakiyesi };
  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'kisi', baslik: 'Çalışan', hucre: ({ p }) => <KisiHucresi personel={p} alt={p.pozisyon} />, csv: ({ p }) => adSoyad(p) },
    { anahtar: 'giris', baslik: 'İşe giriş', kirilmaz: true, hucre: ({ p }) => tarih(p.iseGiris) },
    { anahtar: 'yil', baslik: 'Hizmet yılı', hizala: 'sag', hucre: ({ b }) => b.hizmetYili },
    { anahtar: 'hak', baslik: 'Hak edilen', hizala: 'sag', hucre: ({ b }) => b.hak },
    { anahtar: 'onceki', baslik: 'Sistem öncesi kullanılan', hizala: 'sag', hucre: ({ b }) => sayiYaz(b.onceki) },
    { anahtar: 'kullanilan', baslik: 'Kullanılan', hizala: 'sag', hucre: ({ b }) => sayiYaz(b.kullanilan) },
    { anahtar: 'bekleyen', baslik: 'Bekleyen', hizala: 'sag', hucre: ({ b }) => sayiYaz(b.bekleyen) },
    { anahtar: 'kalan', baslik: 'Kalan', hizala: 'sag', hucre: ({ b }) => (b.kalan < 0 ? <Rozet ton="hata">{sayiYaz(b.kalan)}</Rozet> : <strong>{sayiYaz(b.kalan)}</strong>) },
    { anahtar: 'sonraki', baslik: 'Sonraki hak ediş', kirilmaz: true, hucre: ({ b }) => (b.sonraki ? <>{tarih(b.sonraki)} <small className="tc-iki-soluk">{`+${b.sonrakiGun}`}</small></> : '—'), csv: ({ b }) => (b.sonraki ? `${tarih(b.sonraki)} +${b.sonrakiGun}` : '') },
  ];
  return (
    <>
      <Tablo etiket="İzin bakiyeleri" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={({ p }) => p.id} bosMesaj="Aktif personel yok" satirSec={({ p }) => { o.git('calisan', p.id); }} />
      <p className="tc-iki-not">
        Hak ediş, işe giriş tarihinden itibaren tamamlanan her hizmet yılı için kanuni süre üzerinden hesaplanır. Sisteme geçmeden önce kullanılmış izinleri personel kartındaki “Sistem öncesi kullanılan yıllık izin” alanına girin.
      </p>
    </>
  );
}

function IzinTakvimi({ o, ay, ayYaz, bugun, izinler, ad, duzenle }: {
  o: IkEkranOzellikleri; ay: string; ayYaz: (ay: string) => void; bugun: string; izinler: readonly Izin[]; ad: (id: string) => string; duzenle: ((l: Izin) => void) | null;
}) {
  const gunler = ayGunleri(ay);
  const satirlar = takvimSatirlari(izinler, ay, ad);
  // Motor yokken kapali gun isaretlenmez (takvim ayari motorda).
  const isGunu = o.motor ? isGunuMu(o.motor) : () => true;
  return (
    <>
      <div className="tc-iki-arac"><AyYilSecici ay={ay} degistir={ayYaz} bugun={bugun} /></div>
      {satirlar.length === 0 ? <DurumKutusu durum="bos" mesaj="Bu ay izin yok. Seçilen ayda onaylı veya bekleyen izin bulunmuyor." /> : (
        <>
          <div className="tc-iki-matris-kap">
            <table className="tc-iki-matris tc-iki-dar">
              <caption className="tc-iki-gizli">{`${ay} izin takvimi`}</caption>
              <thead>
                <tr>
                  <th scope="col" className="tc-iki-ad">Çalışan</th>
                  {gunler.map((t) => (
                    <th key={t} scope="col" title={tarih(t)} data-kapali={isGunu(t) ? undefined : ''} data-bugun={t === bugun ? '' : undefined}>
                      {Number(t.slice(8))}<span className="tc-iki-gunad">{PUANTAJ_GUN_ADI[haftaGunu(t)]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {satirlar.map((s) => (
                  <tr key={s.personel}>
                    <th scope="row" className="tc-iki-ad"><button type="button" className="tc-iki-bag" onClick={() => { o.git('calisan', s.personel); }}>{ad(s.personel)}</button></th>
                    {gunler.map((t) => {
                      const h = takvimHucresi(s.izinler, t);
                      const tik = h && duzenle;
                      return (
                        <td key={t} data-kapali={isGunu(t) ? undefined : ''} data-ton={h?.tonlar.join(' ')} title={h ? `${h.izin.tur ?? ''}, ${h.izin.durum ?? ''}` : undefined}>
                          {tik ? <button type="button" className="tc-iki-hucre-dugme" aria-label={`${ad(s.personel)}, ${tarih(t)}: ${h.izin.tur ?? ''}, ${h.izin.durum ?? ''}`} onClick={() => { duzenle(h.izin); }} /> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="tc-iki-lejant">
            <li><i data-ton="onayli" />Onaylı izin</li>
            <li><i data-ton="onayli bekliyor" />Onay bekliyor</li>
            <li><i data-ton="onayli rapor" />Rapor</li>
            <li><i data-kapali="" />Hafta sonu / resmî tatil</li>
          </ul>
        </>
      )}
    </>
  );
}
