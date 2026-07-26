export const colors = {
  background: '#FFFBFB',
  backgroundMuted: '#F4F7F2',
  surface: '#FFFFFF',
  surfaceSubtle: '#E9F6DF',
  primary: '#147C36',
  primaryDark: '#0E2E12',
  primaryLight: '#96F9A3',
  primaryMuted: '#DFF0DD',
  text: '#1D2820',
  textMuted: '#647067',
  textInverse: '#FFFFFF',
  border: '#DCE3DC',
  borderStrong: '#BFCABF',
  success: '#167438',
  savings: '#147C36',
  mapWater: '#1C9FE8',
  danger: '#D94C3A',
  warning: '#E7A928',
} as const;

export type ColorToken = keyof typeof colors;