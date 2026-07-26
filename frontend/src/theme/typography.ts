import { colors } from './colors';

export const fontFamily = {
  regular: undefined,
  medium: undefined,
  bold: undefined,
} as const;

export const typography = {
  display: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '700' as const,
    lineHeight: 40,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700' as const,
    lineHeight: 26,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700' as const,
    lineHeight: 22,
  },
  body: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 21,
  },
  bodyStrong: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
    lineHeight: 21,
  },
  caption: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 16,
  },
  button: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '700' as const,
    lineHeight: 20,
  },
} as const;