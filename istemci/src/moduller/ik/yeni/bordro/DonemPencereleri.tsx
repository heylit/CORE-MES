import { useRef, useState } from 'react';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { Dugme, Girdi, Pencere, Rozet, Secim, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import type { IkMotoru } from '../motor.ts';
import { useIkKomutu } from '../veri.ts';
import { donemEtiketi } from './Hesaplamalar.tsx';
import { AYLAR, donemleriIceAl, donemSilinir, enErkenDonem, gelecekAyBasi, yeniDonemDenetle, type DonemKaydi } from './kurallar.ts';
import { donemBitis, donemDurumu, donemler, type Donem } from './motor-yuzu.ts';
import { Aciklama, useYaz } from './parcalar.tsx';

// Parametre dönemleri (app.js periodNew, periodManage, periodImport): dönemler ayarın `donemler` listesidir ve ayarla birlikte
// sürüm denetimli yazılır (ik.ayar-yaz).

const donemKimligi = (): string => `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const kayitlar = (m: IkMotoru): DonemKaydi[] => structuredClone(donemler(m)) as unknown as DonemKaydi[];
const kesinAylar = (o: IkEkranOzellikleri): string[] =>
  o.depo.tur('pay').filter((k) => k.snap && k.donem).map((k) => k.donem as string);

export function DonemPenceresi({ o, m, secili, kapat, olustu }: {
  o: IkEkranOzellikleri; m: IkMotoru; secili: Donem; kapat: () => void; olustu: (id: string) => void;
}) {
  const komut = useIkKomutu();
  const yazici = useYaz();
  const { bildir } = useBildirim();
  const bugun = tesisGunu(Date.now());
  const enErken = enErkenDonem(bugun, kesinAylar(o));
  const sonrakiAy = gelecekAyBasi(bugun);
  const ilk = sonrakiAy < enErken ? enErken : sonrakiAy;
  const [ad, adYaz] = useState(`${AYLAR[Number(ilk.slice(5, 7)) - 1] ?? ''} ${ilk.slice(0, 4)} sonrası`);
  const [baslangic, baslangicYaz] = useState(ilk);
  const [kaynak, kaynakYaz] = useState(secili.id);
  const [not, notYaz] = useState('');
  const liste = donemler(m);

  const olustur = async () => {
    const d = kayitlar(m);
    const r = yeniDonemDenetle(baslangic, enErken, d, tarih);
    if (r.tur === 'hata') { bildir('hata', r.ileti); return; }
    if (r.duzeltildi) bildir('bilgi', `Başlangıç ayın ilk gününe çekildi: ${tarih(r.baslangic)}.`);
    const kopya = d.find((x) => x.id === kaynak) ?? d[d.length - 1];
    const yeni: DonemKaydi = { id: donemKimligi(), ad: ad.trim() || 'Yeni dönem', baslangic: r.baslangic, not: not.trim(), params: structuredClone(kopya?.params ?? {}) };
    const tamam = await yazici(
      () => komut.ayarKaydet({ ...o.depo.ayarlar, donemler: [...d, yeni] }),
      `${yeni.ad} oluşturuldu. ${tarih(r.baslangic)} ve sonrası bu değerlerle hesaplanır.`, 'Dönem oluşturulamadı.',
    );
    if (tamam) { kapat(); olustu(yeni.id); }
  };

  return (
    <Pencere
      acik tur="orta" baslik="Yeni parametre dönemi" kapat={kapat}
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" yukleniyor={komut.calisiyor} onClick={() => { void olustur(); }}>Dönemi oluştur</Dugme>
        </>
      )}
    >
      <form className="tc-ikb-alanlar" onSubmit={(e) => { e.preventDefault(); void olustur(); }}>
        <Girdi etiket="Dönem adı" value={ad} required onChange={(e) => { adYaz(e.target.value); }} />
        <Girdi etiket="Geçerlilik başlangıcı" type="date" value={baslangic} min={enErken} ipucu={`Ayın ilk günü olmalı. En erken ${tarih(enErken)}.`} onChange={(e) => { baslangicYaz(e.target.value); }} />
        <div className="tc-ikb-tam">
          <Secim etiket="Değerleri kopyala" value={kaynak} onChange={(e) => { kaynakYaz(e.target.value); }} ipucu="Yeni dönem bu dönemin değerleriyle başlar; sonra yalnızca değişenleri güncellersiniz."
            secenekler={liste.map((d) => ({ deger: d.id, baslik: donemEtiketi(m, d) }))} />
        </div>
        <div className="tc-ikb-tam">
          <Girdi etiket="Not" value={not} placeholder="Ör. Temmuz asgari ücret artışı, yeni kıdem tavanı" onChange={(e) => { notYaz(e.target.value); }} />
        </div>
      </form>
      <Aciklama html="<p>Değişiklikler yalnızca bu tarihten sonraki aylara uygulanır. Önceki dönemlerin parametreleri ve kesinleşmiş bordrolar olduğu gibi kalır.</p>" />
    </Pencere>
  );
}

export function DonemlerPenceresi({ o, m, kapat, silindi }: { o: IkEkranOzellikleri; m: IkMotoru; kapat: () => void; silindi: (id: string) => void }) {
  const komut = useIkKomutu();
  const yazici = useYaz();
  const { bildir } = useBildirim();
  const dosya = useRef<HTMLInputElement>(null);
  const [adlar, adlarYaz] = useState<Readonly<Record<string, string>>>({});
  const yazabilir = o.yetki.ayarYaz;
  const liste = donemler(m);
  const kesin = [...new Set(kesinAylar(o))];
  const bugun = tesisGunu(Date.now());

  const kaydet = (d: DonemKaydi[], tamamIleti: string, hataIleti: string) =>
    yazici(() => komut.ayarKaydet({ ...o.depo.ayarlar, donemler: d }), tamamIleti, hataIleti);

  const sil = async (id: string) => {
    if (await kaydet(kayitlar(m).filter((d) => d.id !== id), 'Dönem silindi.', 'Dönem silinemedi.')) silindi(id);
  };
  const adlariKaydet = async () => {
    const d = kayitlar(m);
    for (const x of d) { const yeni = adlar[x.id]?.trim(); if (yeni) x.ad = yeni; }
    if (await kaydet(d, 'Dönem adları kaydedildi.', 'Dönem adları kaydedilemedi.')) kapat();
  };
  const disaAktar = () => {
    const metin = JSON.stringify({ app: 'ik-modulu', tur: 'parametre-donemleri', surum: 1, donemler: liste }, null, 1);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([metin], { type: 'application/json' }));
    a.download = `parametre-donemleri-${bugun}.json`;
    a.click();
    const birak = URL.revokeObjectURL.bind(URL);
    setTimeout(() => { birak(a.href); }, 1000);
  };
  const iceAl = async (f: File | undefined) => {
    if (!f) return;
    let veri: unknown;
    try { veri = JSON.parse(await f.text()); } catch { bildir('hata', 'Dosya okunamadı; geçerli bir JSON dosyası seçin.'); return; }
    const mevcut = kayitlar(m);
    const r = donemleriIceAl(veri, enErkenDonem(bugun, kesin), mevcut, donemKimligi, (p) => m.pickParams(p) as Record<string, unknown>);
    if (!r) { bildir('hata', 'Dosyada parametre dönemi bulunamadı.'); return; }
    const ozet = `${r.eklenen.length} dönem eklendi${r.atlanan.length ? `; ${r.atlanan.length} atlandı (${r.atlanan.slice(0, 3).join(', ')}${r.atlanan.length > 3 ? '…' : ''})` : ''}.`;
    if (!r.eklenen.length) { bildir(r.atlanan.length ? 'hata' : 'bilgi', ozet); return; }
    await kaydet([...mevcut, ...r.eklenen], ozet, 'Dönemler içe aktarılamadı.');
  };

  return (
    <Pencere
      acik tur="orta" baslik="Parametre dönemleri" kapat={kapat}
      alt={(
        <>
          {yazabilir && <Dugme onClick={() => { if (dosya.current) { dosya.current.value = ''; dosya.current.click(); } }}>Dönem içe aktar</Dugme>}
          <Dugme simge="download" onClick={disaAktar}>Dönemleri dışa aktar</Dugme>
          <span className="tc-ikb-uzar" />
          <Dugme onClick={kapat}>Kapat</Dugme>
          {yazabilir && <Dugme tur="birincil" yukleniyor={komut.calisiyor} onClick={() => { void adlariKaydet(); }}>Adları kaydet</Dugme>}
        </>
      )}
    >
      <div className="tc-ikb-liste">
        <table className="tc-ikb-tablo" aria-label="Parametre dönemleri">
          <thead><tr><th>Dönem</th><th>Başlangıç</th><th>Bitiş</th><th>Durum</th><th data-sag="">Kesin bordro</th><th /></tr></thead>
          <tbody>
            {liste.map((d) => {
              const durum = donemDurumu(m, d);
              const bitis = donemBitis(m, d);
              const ay = kesin.filter((x) => `${x}-01` >= d.baslangic && (!bitis || `${x}-01` <= bitis)).length;
              return (
                <tr key={d.id}>
                  <td>
                    <input className="tc-ikb-hucre-metin" data-genis="" aria-label="Dönem adı" disabled={!yazabilir} value={adlar[d.id] ?? d.ad}
                      onChange={(e) => { adlarYaz((a) => ({ ...a, [d.id]: e.target.value })); }} />
                  </td>
                  <td>{tarih(d.baslangic)}</td>
                  <td>{bitis ? tarih(bitis) : '—'}</td>
                  <td>
                    <Rozet ton={durum.k === 'active' ? 'tamam' : durum.k === 'future' ? 'bilgi' : 'pasif'}>{durum.l}</Rozet>
                    {durum.lock && <Simge ad="lock" />}
                  </td>
                  <td data-sag="">{ay ? `${ay} ay` : '—'}</td>
                  <td>{yazabilir && donemSilinir(durum, liste.length) && <Dugme tur="tehlike" onClick={() => { void sil(d.id); }}>Sil</Dugme>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tc-ikb-not">Yalnızca henüz başlamamış ve kesinleşmiş bordrosu olmayan dönemler silinebilir. Dönem adlarını değiştirip “Adları kaydet”e basın.</p>
      <Aciklama baslik="İnternete kapalı kurulumlar için" html="<p>Yeni yılın parametrelerini başka bir kurulumda hazırlayıp <b>Dönemleri dışa aktar</b> ile JSON dosyası alabilir, bu kurulumda <b>Dönem içe aktar</b> ile yükleyebilirsiniz. Geçmişe dönük veya aynı tarihte başlayan dönemler atlanır; mevcut dönemler değişmez.</p>" />
      <input ref={dosya} type="file" accept=".json,application/json" className="tc-ikb-gizli" aria-label="Dönem dosyası" onChange={(e) => { void iceAl(e.target.files?.[0]); }} />
    </Pencere>
  );
}
