declare module '*.svg' {
  import type { FunctionComponent } from 'react';
  import type { SvgProps } from 'react-native-svg';

  const SvgComponent: FunctionComponent<SvgProps>;
  export default SvgComponent;
}