// Başka modül ekranlarının ithal edebildiği tek dosya.

// Okutulan mamulün sevkleri ve sevk işini ilerleten düğmeler (kart #96); Malzeme · Teslim paneli Teslim et altında gösterir.
export { UrunSevkleri } from './UrunSevki.tsx';

// 3389 a: depo terminalindeki Yükle sekmesi (bugünün onaylı planı, durak durak); sayı yüklemesi bitmemiş araçtır.
export { CikisOnayi, DurakBitir, DurakKalemleri, useYukDuraklari, useYukleSayisi, yukKalemAdi, type YukDuragi } from './TerminalYukle.tsx';
