import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import type { KmRolu } from '../yetki.ts';
import { Panel } from '../gostergeler/index.tsx';
import '../gostergeler/k4.css';

const ROLLER: readonly KmRolu[] = ['Muayeneci', 'Kalite mühendisi', 'Kalite yöneticisi'];
// Uygulamanın rol tablosu (seviye 1 muayeneci, 2 mühendis, 3 yönetici). Rol TMI yetkisinden gelir (195 a, 200 a); kişi listesi ve
// ekleme bugünkü gibi yoktur.
export const ROL_TABLOSU: readonly [string, number][] = [
  ['Muayene, ölçüm, lot kabul, NCR bildirme, form doldurma', 1],
  ['Onaylama, NCR kapatma, MRB kararı, DÖF kapatma', 2],
  ['Kilitli kaydı gerekçeyle açma', 2],
  ['Cihaz, tedarikçi ve form şablonu düzenleme', 2],
  ['Kayıt silme, arşivleme, ayarlar, kullanıcı yönetimi', 3],
];

export function Kullanicilar({ yetki }: EkranOzellikleri) {
  return (
    <div className="tc-km4">
      <SayfaBasligi baslik="Kullanıcılar" simge="users" alt="Kim hangi işlemi yapabilir. Giriş TMI oturumuyla yapılır; kayıtlardaki &quot;kim yaptı&quot; bilgisi oturumdaki kişidir." />
      <div className="tc-km-not">
        <p><b>Rol TMI yetkisinden gelir.</b> TMI yöneticisi Kalite yöneticisi, kalite onay yetkisi olan Kalite mühendisi, öteki kişiler Muayenecidir. Yetki Personel sayfasında rolle verilir.</p>
        <p className="tc-km-soluk">Sizin rolünüz: <b>{yetki.rol}</b></p>
      </div>
      <Panel baslik="Rollerin yetkileri">
        <div className="tc-km-tablo-kap">
          <table className="tc-km-tablo">
            <thead><tr><th>İşlem</th>{ROLLER.map((r) => <th key={r}>{r}</th>)}</tr></thead>
            <tbody>
              {ROL_TABLOSU.map(([t, sev]) => (
                <tr key={t}>
                  <td>{t}</td>
                  {ROLLER.map((r, i) => <td key={r}>{i + 1 >= sev ? <span className="tc-km4-evet">Evet</span> : <span className="tc-km-soluk">Hayır</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tc-km-soluk">Not: Giriş TMI oturumuyla yapılır; kullanıcı ve ayar kayıtlarını yalnız TMI yöneticisi değiştirir. Değişiklik izi sunucuda silinemez şekilde tutulur.</p>
      </Panel>
    </div>
  );
}

export const KullanicilarSayaci: KmSayaci = null;
