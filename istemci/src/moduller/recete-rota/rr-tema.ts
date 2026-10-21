import tokens from '../../ortak/tasarim/tokens.css?raw';
import tema from './cerceve/rr-tema.css?raw';

// Reçete ve Rota prototipi uygulamanın tasarım değişkenleriyle çizilir: değişkenler ve prototipin renklerini onlara bağlayan
// stil prototipin stillerinden sonra gelir (sayfaKur sonStil). Prototipin kendisi değişmez.
export const RR_TEMA_STILI = `${tokens}\n${tema}`;
