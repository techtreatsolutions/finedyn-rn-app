import { Platform } from 'react-native';

const fontFamily = Platform.select({ ios: 'System', android: 'Roboto' });

export const typography = {
  h1: { fontSize: 28, fontWeight: '700', fontFamily, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700', fontFamily },
  h3: { fontSize: 18, fontWeight: '600', fontFamily },
  h4: { fontSize: 16, fontWeight: '600', fontFamily },
  body: { fontSize: 14, fontWeight: '400', fontFamily },
  bodyBold: { fontSize: 14, fontWeight: '600', fontFamily },
  caption: { fontSize: 12, fontWeight: '400', fontFamily },
  captionBold: { fontSize: 12, fontWeight: '600', fontFamily },
  tiny: { fontSize: 10, fontWeight: '500', fontFamily },
  button: { fontSize: 14, fontWeight: '600', fontFamily, letterSpacing: 0.3 },
};
