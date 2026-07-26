import { colors } from './colors';

export const fontFamily = {
  regular: 'Monda_400Regular',
  medium: 'Monda_700Bold',
  bold: 'Monda_700Bold',
} as const;

export const typography = {
  display: {
    color: colors.text,
    fontFamily: fontFamily.bold,
    fontSize: 34,
    lineHeight: 40,
  },
  title: {
    color: colors.text,
    fontFamily: fontFamily.bold,
    fontSize: 20,
    lineHeight: 26,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fontFamily.bold,
    fontSize: 17,
    lineHeight: 22,
  },
  body: {
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 21,
  },
  bodyStrong: {
    color: colors.text,
    fontFamily: fontFamily.bold,
    fontSize: 15,
    lineHeight: 21,
  },
  caption: {
    color: colors.textMuted,
    fontFamily: fontFamily.bold,
    fontSize: 11,
    lineHeight: 16,
  },
  button: {
    color: colors.textInverse,
    fontFamily: fontFamily.bold,
    fontSize: 15,
    lineHeight: 20,
  },
} as const;