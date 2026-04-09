import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import hi from './locales/hi.json';
import bn from './locales/bn.json';
import ta from './locales/ta.json';
import te from './locales/te.json';
import mr from './locales/mr.json';
import gu from './locales/gu.json';
import kn from './locales/kn.json';
import ml from './locales/ml.json';
import pa from './locales/pa.json';
import uk from './locales/uk.json';
import pl from './locales/pl.json';
import ko from './locales/ko.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      bn: { translation: bn },
      ta: { translation: ta },
      te: { translation: te },
      mr: { translation: mr },
      gu: { translation: gu },
      kn: { translation: kn },
      ml: { translation: ml },
      pa: { translation: pa },
      uk: { translation: uk },
      pl: { translation: pl },
      ko: { translation: ko },
      ja: { translation: ja },
      zh: { translation: zh },
    },
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'stash-language',
    },
  });

export default i18n;
