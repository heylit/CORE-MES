import { useState } from 'react';
import { Dugme, Girdi, Pencere, Secim } from '../../../../ortak/arayuz/index.ts';
import { adSoyad, para, YOK } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { ikSabitleri, type IkMotoru } from '../motor.ts';
import { useIkKomutu } from '../veri.ts';
import { gelecekAyBasi, sayi, ucretEkle, yeniUcret, ZAM_NEDENLERI, type ZamYontemi } from './kurallar.ts';
import { ayar, ayarSayisi, donemde, ucretTarihte } from './motor-yuzu.ts';
import { sayiMetni, useYaz } from './parcalar.tsx';

const YONTEMLER: readonly { deger: ZamYontemi; baslik: string }[] = [
  { deger: 'yuzde', baslik: 'Yüzde artış' }, { deger: 'sabit', baslik: 'Sabit tutar artışı' }, { deger: 'min', baslik: 'En az şu tutara tamamla' },
];
const tarihMetni = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`;

// Toplu ücret güncelleme (app.js bulkRaise): önizleme ve yürürlük tarihli ücret geçmişi satırı; yazma ik.ucret-yaz ister.
export function TopluZam({ o, m, bugun, kapat }: { o: IkEkranOzellikleri; m: IkMotoru; bugun: string; kapat: () => void }) {
  const komut = useIkKomutu();
  const yaz = useYaz();
  const sabit = ikSabitleri();
  const [tarih, tarihYaz] = useState(gelecekAyBasi(bugun));
  const [departman, departmanYaz] = useState('');
  const [yaka, yakaYaz] = useState('');
  const [yontem, yontemYaz] = useState<ZamYontemi>('yuzde');
  const [deger, degerYaz] = useState('10');
  const [yuvarla, yuvarlaYaz] = useState('100');
  const [neden, nedenYaz] = useState<string>(ZAM_NEDENLERI[0]);
  const t = tarih || gelecekAyBasi(bugun);
  const asgari = donemde(m, t, () => ayarSayisi(m, 'asgariBrut'));

  const degisen = m.activeEmps()
    .filter((p) => (!departman || p.departmanId === departman) && (!yaka || (sabit ? sabit.collarOf(p) : '') === yaka))
    .map((p) => { const cur = ucretTarihte(m, p, t); return { p, cur, nb: yeniUcret(cur, yontem, sayi(deger), sayi(yuvarla)) }; })
    .filter((x) => x.nb !== x.cur);
  const artis = degisen.reduce((s, x) => s + x.nb - x.cur, 0);
  const maliyetOrani = 1 + (sayi(ayar(m, 'sgkIsverenOran')) + sayi(ayar(m, 'issizlikIsverenOran'))) / 100;
  const ipucu = yontem === 'yuzde' ? 'Ör. 10 = %10 artış' : yontem === 'sabit' ? 'Her çalışana eklenecek brüt tutar' : `Bu tutarın altındakiler yükseltilir (dönem asgari ücreti: ${para(asgari)})`;
  const depAdi = (id: string | undefined) => o.depo.tur('dept').find((d) => d.id === id)?.ad ?? '';

  const yontemDegisti = (y: ZamYontemi) => {
    yontemYaz(y);
    degerYaz(y === 'yuzde' ? '10' : y === 'sabit' ? '2000' : String(asgari));
  };
  const uygula = async () => {
    const kayitlar = degisen.map((x) => ucretEkle(x.p, t, x.nb, neden, 'Toplu güncelleme', bugun));
    const tamam = await yaz(() => komut.topluKaydet(kayitlar), `${kayitlar.length} çalışanın ücreti ${tarihMetni(t)} itibarıyla güncellendi.`, 'Ücretler güncellenemedi.');
    if (tamam) kapat();
  };

  return (
    <Pencere
      acik baslik="Toplu ücret güncelleme" kapat={kapat} tur="yan"
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" disabled={!degisen.length} yukleniyor={komut.calisiyor} onClick={() => { void uygula(); }}>Uygula</Dugme>
        </>
      )}
    >
      <div className="tc-ikb-alanlar">
        <Girdi etiket="Yürürlük tarihi" type="date" value={tarih} onChange={(e) => { tarihYaz(e.target.value); }} />
        <Secim etiket="Departman" value={departman} onChange={(e) => { departmanYaz(e.target.value); }}
          secenekler={[{ deger: '', baslik: 'Tüm departmanlar' }, ...m.sortedDepts().map((d) => ({ deger: d.id, baslik: d.ad ?? '' }))]} />
        <Secim etiket="Yaka tipi" value={yaka} onChange={(e) => { yakaYaz(e.target.value); }}
          secenekler={[{ deger: '', baslik: 'Tümü' }, ...(sabit?.COLLARS ?? []).map((c) => ({ deger: c, baslik: c }))]} />
        <Secim etiket="Yöntem" value={yontem} onChange={(e) => { yontemDegisti(e.target.value as ZamYontemi); }} secenekler={YONTEMLER} />
        <Girdi etiket="Değer" type="number" step="any" inputMode="decimal" value={deger} ipucu={ipucu} onChange={(e) => { degerYaz(e.target.value); }} />
        <Secim etiket="Yuvarlama" value={yuvarla} onChange={(e) => { yuvarlaYaz(e.target.value); }}
          secenekler={[{ deger: '0', baslik: 'Yok' }, { deger: '10', baslik: '10 TL' }, { deger: '100', baslik: '100 TL' }, { deger: '500', baslik: '500 TL' }]} />
        <div className="tc-ikb-tam">
          <Secim etiket="Neden" value={neden} onChange={(e) => { nedenYaz(e.target.value); }} secenekler={ZAM_NEDENLERI.map((n) => ({ deger: n, baslik: n }))} />
        </div>
      </div>
      <h3 className="tc-ikb-ara-baslik">Önizleme</h3>
      {degisen.length ? (
        <>
          <p className="tc-ikb-kucuk">
            <b>{`${degisen.length} çalışan`}</b>, aylık brüt ücret yükü artışı <b>{para(artis)}</b>. İşveren maliyeti artışı yaklaşık {para(artis * maliyetOrani)}.
          </p>
          <div className="tc-ikb-liste tc-ikb-sinirli">
            <table className="tc-ikb-tablo" aria-label="Ücret önizlemesi">
              <thead><tr><th>Çalışan</th><th data-sag="">Mevcut</th><th data-sag="">Yeni</th><th data-sag="">Fark</th></tr></thead>
              <tbody>
                {degisen.map((x) => (
                  <tr key={x.p.id}>
                    <td>{adSoyad(x.p)} <span className="tc-ikb-soluk">{depAdi(x.p.departmanId)}</span></td>
                    <td data-sag="">{para(x.cur)}</td>
                    <td data-sag=""><b>{para(x.nb)}</b></td>
                    <td data-sag="">{x.cur ? `+${sayiMetni(Math.round((x.nb / x.cur - 1) * 1000) / 10)}%` : YOK}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="tc-ikb-soluk">Seçilen ölçütlerle değişecek çalışan yok.</p>}
    </Pencere>
  );
}
