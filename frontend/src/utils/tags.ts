export const formatTagLabel = (value: string): string =>
  value.replace(/(^|\s)\S/g, (wordStart) => wordStart.toUpperCase());