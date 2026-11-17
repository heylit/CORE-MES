import { useState, type ReactNode } from 'react';
import type { TaslakCatismasi } from '#paylasilan/sozlesme/planlama.ts';
import { Dugme, OnayPenceresi, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import { taslakOzeti, type TaslakYazici } from './taslak.ts';

// Taslak çubuğu (3282 1d-2b, 1d-3): kişinin taslağı varken üst şeridin altında durur. Değişiklik sayısı, artık uygulanamayanlar ve bayat dizme
// burada görünür; Geri al son değişikliği, Vazgeç bütün taslağı siler. Tek birincil düğme (Canlıya al ya da Onaya gönder, 3282-5 a) taslağı
// ortak çalışmaya yazar ve aynı adımda Onay ve canlı bölümünü açar: canlıya alma onaylı onay akışıyla kalır (dört göz, müşteri, kayma).
// Başkası aynı emre, tezgâha ya da plan ayarına dokunduysa önce anahtar başına "benimki / onunki" seçilir.

export interface TaslakCubuguOzellikleri {
  taslak: TaslakYazici;
  // Durum sayılarının önce ve sonrası (Kokpit'in sayımı).
  ozet: ReactNode;
  // plan.canliya-al olan "Canlıya al", olmayan "Onaya gönder" görür.
  canliyaAlir: boolean;
  // Sayfanın birincil düğmeyi kapatan durumu (ör. tur sürerken); null ise yok.
  kilit?: string | null;
  yazildi: (ileti: string) => void;
  onayiAc: () => void;
}

type Secim = Record<string, 'benim' | 'onun'>;

export function TaslakCubugu({ taslak, ozet, canliyaAlir, kilit = null, yazildi, onayiAc }: TaslakCubuguOzellikleri) {
  const t = taslak.cevap?.taslak ?? null;
  const o = taslakOzeti(t);
  const [vazgecAcik, setVazgecAcik] = useState(false);
  const [catisma, setCatisma] = useState<TaslakCatismasi[] | null>(null);
  const [secim, setSecim] = useState<Secim>({});
  if (t === null && !taslak.mesgul) return null;
  const bekle = taslak.mesgul || taslak.diziliyor;
  const engel = kilit ?? (o.bozuk.length > 0 ? 'Önce artık geçerli olmayan değişikliği geri alın.' : o.bayat ? 'Önce Planla ile planı güncelleyin.' : null);
  const ad = canliyaAlir ? 'Canlıya al' : 'Onaya gönder';

  const yaz = async (s?: Secim) => {
    const r = await taslak.uygula(s);
    if (r === null) return;
    if (r.durum === 'secim') { setCatisma(r.catismalar); setSecim((x) => Object.fromEntries(Object.entries(x).filter(([k]) => r.catismalar.some((c) => c.anahtar === k)))); return; }
    setCatisma(null); setSecim({});
    // Onay ve canlı bölümünde vazgeçilirse taslak ortak planda kalır; bildirim bunu söyler.
    const dusen = r.dusen > 0 ? ` ${String(r.dusen)} değişiklik başkasınınki seçildiği için düştü.` : '';
    yazildi(`Değişiklikleriniz plana yazıldı.${dusen} ${canliyaAlir ? 'Canlıya almak' : 'Onaya göndermek'} için onay sayfasını tamamlayın.`);
    onayiAc();
  };
  const tamam = catisma !== null && catisma.every((c) => secim[c.anahtar] !== undefined);

  return (
    <div className="tc-pyq-degisim tc-pyq-taslak" role="region" aria-label="Değişiklikleriniz">
      <b>{o.n} değişiklik · canlıya alınmadı</b>
      {ozet}
      {taslak.diziliyor ? <span role="status">Planlanıyor</span> : taslak.mesgul && <span role="status">Yazılıyor</span>}
      {o.bozuk.map((b, i) => (
        <span key={`${String(i)}-${b.ne}`} className="tc-pyq-taslak-hata" role="alert"><Simge ad="alert" boyut="k" />{`Artık geçerli değil: ${b.ne} (${b.hata})`}</span>
      ))}
      {o.bayat && (
        <span className="tc-pyq-taslak-hata">
          Plan bu arada değişti; kararlarınız yeni plana göre yeniden planlanır.
          <Dugme simge="rotate" disabled={bekle} onClick={() => { void taslak.diz(); }}>Planla</Dugme>
        </span>
      )}
      <span className="tc-pyq-taslak-dugmeler">
        <Dugme simge="chev-left" disabled={bekle || o.n === 0} onClick={() => { void taslak.geriAl(); }}>Geri al</Dugme>
        <Dugme simge="x" disabled={bekle} onClick={() => { setVazgecAcik(true); }}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge={canliyaAlir ? 'check' : 'upload'} disabled={bekle || engel !== null} title={engel ?? 'Değişikliklerinizi plana yazar, onay sayfasını açar.'} onClick={() => { void yaz(); }}>{ad}</Dugme>
      </span>
      <OnayPenceresi
        acik={vazgecAcik} baslik="Değişikliklerden vazgeçilsin mi?" onayMetni="Değişiklikleri sil" tehlikeli
        vazgec={() => { setVazgecAcik(false); }} onayla={() => { setVazgecAcik(false); void taslak.vazgec(); }}
      >{`${String(o.n)} değişiklik silinir; ortak plan değişmez.`}</OnayPenceresi>
      <Pencere
        acik={catisma !== null} kapat={() => { setCatisma(null); }} baslik="Başkası da değiştirdi"
        alt={(
          <>
            <Dugme onClick={() => { setCatisma(null); }} data-ilk-odak>Vazgeç</Dugme>
            <Dugme tur="birincil" simge={canliyaAlir ? 'check' : 'upload'} disabled={!tamam || bekle} onClick={() => { void yaz(secim); }}>{ad}</Dugme>
          </>
        )}
      >
        <p className="tc-pyq-not">Siz değiştirmeye başladığınızdan beri başkası aşağıdakileri değiştirdi. Her biri için hangisinin kalacağını seçin.</p>
        <ul className="tc-pyq-catisma">
          {(catisma ?? []).map((c) => (
            <li key={c.anahtar}>
              <fieldset>
                <legend>{c.ad}</legend>
                <small>{c.komutlar.join(', ')}</small>
                <span className="tc-pyq-seg">
                  {(['benim', 'onun'] as const).map((s) => (
                    <button key={s} type="button" aria-pressed={secim[c.anahtar] === s} onClick={() => { setSecim({ ...secim, [c.anahtar]: s }); }}>
                      {s === 'benim' ? 'Benimki' : 'Onunki'}
                    </button>
                  ))}
                </span>
              </fieldset>
            </li>
          ))}
        </ul>
      </Pencere>
    </div>
  );
}
