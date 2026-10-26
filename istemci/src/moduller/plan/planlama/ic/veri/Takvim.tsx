import { useState, type FormEvent } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import { VERI_NOTU } from '../../motor/ortak.tsx';
import type { CalismaKomutu } from '../../kayit.ts';
import { saatYaz } from '../../motor/kurallar.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import {
  GUNLER, GUN_AD, durusDenetle, duruslar, ekMesaiDenetle, ekMesailer, girdiSaati, girdidenSaat, gunSirasi, gunTarihi, vardiyalar, vardiyaSuresi,
  type Durus, type EkMesai, type Vardiya,
} from './kurallar.ts';
import { KucukDugme, SahipDugmesi, SahipNotu, VeriKarti, VeriTablosu, sayiYazi } from './ortak.tsx';

// Takvim (02-orta.betik sTakvim): vardiyalar, çalışma günleri, arıza ve planlı bakım, tatiller, ek mesai. Vardiya, çalışma günü ve tatil
// sahibinden gelir (222 a): yerinde, pasif. Arıza ve planlı bakım ile ek mesai planlama çalışmasının alanlarıdır (221 c: down, ekMesai) ve
// plan yazma ile çalışma komutundan yazılır. Formun ilk değerleri bugünkü sayfanınkidir (arıza ilk günün 07:00-15:00'i, ek mesai beşinci gün).

const saat = (h: number) => `${sayiYazi(h, 1)} sa`;

function DurusFormu({ c, komut }: { c: PlanlamaCalismasi; komut: CalismaKomutu }) {
  const D = c.D;
  const [m, mYaz] = useState(D.tezgahlar[0]?.id ?? '');
  const [bas, basYaz] = useState(() => girdiSaati(D, 31));
  const [bit, bitYaz] = useState(() => girdiSaati(D, 39));
  const [hata, hataYaz] = useState<string | null>(null);
  const gonder = (e: FormEvent) => {
    e.preventDefault();
    const a = girdidenSaat(D, bas), b = girdidenSaat(D, bit);
    const h = durusDenetle(a, b); hataYaz(h);
    if (h || a === null || b === null) return;
    komut.degistir('Arıza/bakım eklendi', (t) => { t.down = [...t.down, { m, from: a, to: b }].sort((x, y) => Number(x.from) - Number(y.from)); }, { ayrinti: `${m} ${saatYaz(D, a)} → ${saatYaz(D, b)}` });
  };
  return (
    <form className="tc-form tc-pyi-satir-form" noValidate onSubmit={gonder} aria-label="Arıza ya da bakım ekle">
      <label className="tc-alan"><span className="tc-alan-etiket">Tezgâh</span>
        <select className="tc-alan-kutu" value={m} onChange={(e) => { mYaz(e.target.value); }}>{D.tezgahlar.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.ad}</option>)}</select>
      </label>
      <label className="tc-alan"><span className="tc-alan-etiket">Başlangıç</span><input className="tc-alan-kutu" type="datetime-local" value={bas} onChange={(e) => { basYaz(e.target.value); }} /></label>
      <label className="tc-alan"><span className="tc-alan-etiket">Bitiş</span><input className="tc-alan-kutu" type="datetime-local" value={bit} onChange={(e) => { bitYaz(e.target.value); }} /></label>
      <div className="tc-alan tc-pyi-form-son"><button type="submit" className="tc-dugme tc-dugme-ikincil"><Simge ad="plus" boyut="k" />Arıza ya da bakım ekle</button></div>
      {hata && <p className="tc-pyi-hata tc-pyi-form-tam" role="alert">{hata}</p>}
    </form>
  );
}

function MesaiFormu({ c, komut, vs }: { c: PlanlamaCalismasi; komut: CalismaKomutu; vs: Vardiya[] }) {
  const D = c.D;
  const [m, mYaz] = useState(D.tezgahlar[0]?.id ?? '');
  const [gun, gunYaz] = useState(() => gunTarihi(D, 5));
  const [vardiya, vardiyaYaz] = useState(vs[0]?.id ?? '');
  const [hata, hataYaz] = useState<string | null>(null);
  const gonder = (e: FormEvent) => {
    e.preventDefault();
    const g = gunSirasi(D, gun);
    const h = ekMesaiDenetle(c, { m, gun: g, vardiya }); hataYaz(h);
    if (h || g === null) return;
    komut.degistir('Ek mesai eklendi', (t) => { t.ekMesai = [...t.ekMesai, { m, gun: g, vardiya }]; }, { ayrinti: `${m} ${gun} ${vardiya}` });
  };
  return (
    <form className="tc-form tc-pyi-satir-form" noValidate onSubmit={gonder} aria-label="Ek mesai ekle">
      <label className="tc-alan"><span className="tc-alan-etiket">Tezgâh</span>
        <select className="tc-alan-kutu" value={m} onChange={(e) => { mYaz(e.target.value); }}>{D.tezgahlar.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}</select>
      </label>
      <label className="tc-alan"><span className="tc-alan-etiket">Gün</span><input className="tc-alan-kutu" type="date" value={gun} onChange={(e) => { gunYaz(e.target.value); }} /></label>
      <label className="tc-alan"><span className="tc-alan-etiket">Vardiya</span>
        <select className="tc-alan-kutu" value={vardiya} onChange={(e) => { vardiyaYaz(e.target.value); }}>{vs.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}</select>
      </label>
      <div className="tc-alan tc-pyi-form-son"><button type="submit" className="tc-dugme tc-dugme-ikincil"><Simge ad="plus" boyut="k" />Ek mesai ekle</button></div>
      <p className="tc-pyi-k tc-pyi-form-tam">Ek mesai o vardiyada tezgâhı, bir operatörü ve bir ayarcıyı açar.</p>
      {hata && <p className="tc-pyi-hata tc-pyi-form-tam" role="alert">{hata}</p>}
    </form>
  );
}

export function Takvim({ c, komut, planYaz }: { c: PlanlamaCalismasi; komut: CalismaKomutu | null; planYaz: boolean }) {
  const D = c.D; const yaz = komut && planYaz ? komut : null;
  const vs = vardiyalar(D);
  const gunler = D.calismaGunleri ?? {};
  const tatiller = D.tatiller ?? [];
  // Bugünkü sayfa satırı dizinle siler (S.down.splice); okunamayan satır listede görünmediği için silinecek satır alanlarıyla bulunur.
  const ilkiniSil = <T,>(l: T[], ayni: (x: T) => boolean): T[] | false => { const i = l.findIndex(ayni); return i < 0 ? false : [...l.slice(0, i), ...l.slice(i + 1)]; };
  const durusSil = (d: Durus) => {
    yaz?.degistir('Arıza/bakım silindi', (t) => {
      const l = ilkiniSil(t.down, (x) => x.m === d.m && x.from === d.from && x.to === d.to); if (!l) return false; t.down = l;
    }, { ayrinti: `${d.m} ${saatYaz(D, d.from)}` });
  };
  const mesaiSil = (e: EkMesai) => {
    yaz?.degistir('Ek mesai silindi', (t) => {
      const l = ilkiniSil(t.ekMesai, (x) => x.m === e.m && x.gun === e.gun && x.vardiya === e.vardiya); if (!l) return false; t.ekMesai = l;
    });
  };
  const islemSutunu = <S,>(sil: ((s: S) => void) | null) => ({
    anahtar: 'islem', baslik: 'İşlem', gizliBaslik: true,
    hucre: (s: S) => (sil ? <div className="tc-pyi-dugmeler"><KucukDugme ad="Sil" simge="trash" yap={() => { sil(s); }} /></div> : null),
  });
  const durus = duruslar(c);
  const mesai = ekMesailer(c);
  return (
    <div className="tc-pyi-dik">
      <div className="tc-pyi-iki tc-pyi-iki-esit">
        <VeriKarti baslik="Vardiyalar" sag={<SahipDugmesi ad="Yeni vardiya" simge="plus" metin="Yeni" />}>
          <VeriTablosu<Vardiya>
            etiket="Vardiyalar" satirlar={vs} anahtar={(v) => v.id}
            sutunlar={[
              { anahtar: 'id', baslik: 'Kod', hucre: (v) => <b className="mono">{v.id}</b> }, { anahtar: 'bas', baslik: 'Başlangıç', hucre: (v) => v.bas },
              { anahtar: 'bit', baslik: 'Bitiş', hucre: (v) => v.bit }, { anahtar: 's', baslik: 'Süre', sag: true, hucre: (v) => saat(vardiyaSuresi(v)) },
              { anahtar: 'islem', baslik: 'İşlem', gizliBaslik: true, hucre: () => <div className="tc-pyi-dugmeler"><SahipDugmesi ad="Sil" simge="trash" /></div> },
            ]}
          />
        </VeriKarti>
        <VeriKarti baslik="Çalışma günleri">
          <div className="tc-pyi-kap">
            <table className="tc-pyi-izgara" aria-label="Çalışma günleri">
              <thead><tr><th scope="col">Vardiya</th>{GUNLER.map((g) => <th key={g} scope="col">{GUN_AD[g]}</th>)}</tr></thead>
              <tbody>
                {vs.map((v) => (
                  <tr key={v.id}>
                    <th scope="row">{v.id} <span className="tc-pyi-k">{v.bas}-{v.bit}</span></th>
                    {GUNLER.map((g) => (
                      <td key={g}>
                        <input type="checkbox" aria-label={`${GUN_AD[g]} ${v.id}`} title={VERI_NOTU} checked={(gunler[g] ?? []).map(String).includes(v.id)} disabled readOnly />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tc-pyi-k">İşaretli vardiyada fabrika açıktır. Tezgâhın kendi vardiyası Tezgâhlar sayfasında daraltılır.</p>
        </VeriKarti>
      </div>
      <SahipNotu>Vardiya, çalışma günü ve tatil sahibi ekranında değişir.</SahipNotu>
      <div className="tc-pyi-iki">
        <VeriKarti baslik="Arıza ve planlı bakım">
          <VeriTablosu<Durus>
            etiket="Arıza ve planlı bakım" satirlar={durus} anahtar={(d, i) => `${d.m}|${d.from}|${i}`}
            sutunlar={[
              { anahtar: 'm', baslik: 'Tezgâh', hucre: (d) => <b className="mono">{d.m}</b> }, { anahtar: 'a', baslik: 'Başlangıç', hucre: (d) => saatYaz(D, d.from) },
              { anahtar: 'b', baslik: 'Bitiş', hucre: (d) => saatYaz(D, d.to) }, { anahtar: 's', baslik: 'Süre', sag: true, hucre: (d) => saat(d.to - d.from) },
              islemSutunu<Durus>(yaz ? durusSil : null),
            ]}
          />
          {yaz && <DurusFormu c={c} komut={yaz} />}
        </VeriKarti>
        <VeriKarti baslik="Tatiller">
          <div className="tc-pyi-dik">
            <div className="tc-pyi-cipler">
              {tatiller.length === 0 && <span className="tc-pyi-alt">Tatil yok.</span>}
              {tatiller.map((t) => <span key={t} className="tc-pyi-cip">{t}</span>)}
            </div>
            <div className="tc-pyi-sira"><SahipDugmesi ad="Tatil ekle" simge="plus" metin="Ekle" /></div>
          </div>
        </VeriKarti>
      </div>
      <VeriKarti baslik="Ek mesai">
        <VeriTablosu<EkMesai>
          etiket="Ek mesai" bos="Ek mesai yok." satirlar={mesai} anahtar={(e, i) => `${e.m}|${e.gun}|${e.vardiya}|${i}`}
          sutunlar={[
            { anahtar: 'm', baslik: 'Tezgâh', hucre: (e) => <b className="mono">{e.m}</b> }, { anahtar: 'g', baslik: 'Gün', hucre: (e) => saatYaz(D, e.gun * 24).slice(0, 9) },
            { anahtar: 'v', baslik: 'Vardiya', hucre: (e) => e.vardiya }, islemSutunu<EkMesai>(yaz ? mesaiSil : null),
          ]}
        />
        {yaz && <MesaiFormu c={c} komut={yaz} vs={vs} />}
      </VeriKarti>
    </div>
  );
}
