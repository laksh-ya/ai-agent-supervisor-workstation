// src/theme.js
// Design tokens taken from the Figma file (Supervisor Workstation).
import { extendTheme } from '@chakra-ui/react';

const colors = {
  brand: {
    50: '#f4f1ff',
    100: '#ecebf2', // Primary/100
    200: '#dad8e4', // Primary/200
    300: '#c9c4d8',
    400: '#6e5ba5',
    500: '#514184', // buttons
    600: '#463a7a', // Primary/1000
    700: '#453674', // top bar
    800: '#3d3480',
    900: '#242033'
  },
  ink: {
    900: '#242033', // page titles
    800: '#20212b',
    700: '#322a3c', // Grey/1000
    600: '#3f3947',
    500: '#4f4858',
    400: '#756e82',
    300: '#827b90',
    200: '#8a8394',
    100: '#98949d' // Grey/500
  },
  line: {
    100: '#efeef0', // Grey/100
    200: '#ece9f1',
    300: '#e5e1ec',
    400: '#d9d3e4',
    500: '#dcdde3'
  },
  canvas: '#f6f5fa',
  tint: {
    red: '#fce4e4',
    redText: '#b24747',
    redBar: '#d95b5b',
    amber: '#fff3c7',
    amberText: '#6b551e',
    amberBar: '#e1a43a',
    blue: '#e8f0fa',
    blueText: '#476b9c',
    blueBar: '#638cc7',
    green: '#e7f5ec',
    greenText: '#2e7d50',
    greenBar: '#4e9a68',
    purple: '#eeeaf8',
    purpleText: '#6e5ba5'
  }
};

const theme = extendTheme({
  colors,
  fonts: {
    heading: `'Inter', system-ui, sans-serif`,
    body: `'Inter', system-ui, sans-serif`,
    display: `'General Sans', 'Inter', system-ui, sans-serif`
  },
  radii: { card: '12px', panel: '24px' },
  shadows: {
    card: '0px 2px 9px rgba(130, 130, 130, 0.25)',
    soft: '0 1px 2px rgba(36, 32, 51, 0.04), 0 1px 6px rgba(36, 32, 51, 0.04)',
    lift: '0 2px 4px rgba(36, 32, 51, 0.05), 0 8px 24px rgba(36, 32, 51, 0.08)',
    pop: '0 12px 40px rgba(36, 32, 51, 0.16)',
    outline: '0 0 0 3px rgba(81, 65, 132, 0.28)'
  },
  styles: {
    global: {
      'html, body': { bg: 'canvas', color: 'ink.700' },
      body: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', fontFeatureSettings: '"cv11", "ss01"', textRendering: 'optimizeLegibility' },
      '::selection': { background: '#dad8e4' },
      '.tnum': { fontVariantNumeric: 'tabular-nums' },
      '*::-webkit-scrollbar': { width: '8px', height: '8px' },
      '*::-webkit-scrollbar-thumb': { background: '#dad8e4', borderRadius: '8px' },
      '*::-webkit-scrollbar-track': { background: 'transparent' },
      '@media (prefers-reduced-motion: reduce)': {
        '*, *::before, *::after': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important' }
      }
    }
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: 700,
        borderRadius: '12px',
        transition: 'background 150ms ease, box-shadow 150ms ease, transform 80ms ease, opacity 150ms ease',
        _focusVisible: { boxShadow: 'outline' },
        _active: { transform: 'scale(0.98)' },
        // Processing / unavailable: visibly inert, never silently clickable
        _disabled: { opacity: 0.45, cursor: 'not-allowed', boxShadow: 'none', transform: 'none' }
      },
      sizes: {
        xs: { h: '24px', fontSize: '10px', px: '12px' },
        sm: { h: '30px', fontSize: '10px', px: '16px' },
        md: { h: '36px', fontSize: '10px', px: '24px' },
        lg: { h: '40px', fontSize: '14px', px: '24px' }
      },
      variants: {
        solid: {
          bg: 'brand.500',
          color: 'white',
          _hover: { bg: 'brand.600', _disabled: { bg: 'brand.500' } },
          _active: { bg: 'brand.700' }
        },
        outline: {
          bg: 'white',
          borderColor: 'line.400',
          color: 'brand.500',
          _hover: { bg: 'brand.50' },
          _active: { bg: 'brand.100' }
        },
        soft: {
          bg: 'brand.100',
          color: 'brand.500',
          _hover: { bg: 'brand.200' },
          _active: { bg: 'brand.200' }
        },
        ghost: { color: 'ink.600', _hover: { bg: 'brand.100' } },
        danger: { bg: 'tint.red', color: 'tint.redText', _hover: { bg: '#f8d0d0' } }
      },
      defaultProps: { variant: 'solid', size: 'md' }
    },
    Input: {
      variants: {
        outline: {
          field: {
            bg: 'white',
            borderColor: 'line.500',
            borderRadius: '12px',
            fontSize: '12px',
            color: 'ink.800',
            _placeholder: { color: '#6e7180' },
            _hover: { borderColor: 'line.400' },
            _focusVisible: { borderColor: 'brand.500', boxShadow: '0 0 0 1px #514184' }
          }
        }
      }
    },
    Textarea: {
      variants: {
        outline: {
          borderColor: 'line.300',
          borderRadius: '10px',
          _focusVisible: { borderColor: 'brand.500', boxShadow: '0 0 0 1px #514184' }
        }
      }
    },
    Tooltip: {
      baseStyle: { bg: 'ink.900', color: 'white', borderRadius: '8px', fontSize: '11px', px: '10px', py: '6px', maxW: '280px' }
    },
    Menu: {
      baseStyle: {
        list: { borderRadius: '12px', borderColor: 'line.300', boxShadow: 'pop', py: '6px', minW: '180px', fontSize: '12px' },
        item: { fontSize: '12px', color: 'ink.700', px: '12px', py: '8px', _focus: { bg: 'brand.100' } },
        groupTitle: { fontSize: '10px', color: 'ink.200', textTransform: 'uppercase', letterSpacing: '0.02em', mx: '12px' }
      }
    },
    Modal: {
      baseStyle: {
        overlay: { bg: 'rgba(138, 131, 148, 0.4)', backdropFilter: 'blur(1px)' },
        dialog: { borderRadius: '24px', boxShadow: 'pop' }
      }
    },
    // Toasts render through Alert: themed card with a status accent instead of Chakra's solid blocks
    Alert: {
      variants: {
        toast: (props) => {
          const accent = { success: '#2e9e5b', error: '#d95b5b', warning: '#e1a43a', info: '#514184', loading: '#514184' }[props.status] || '#514184';
          return {
            container: {
              bg: 'white', color: 'ink.700', borderRadius: '12px', boxShadow: 'lift', border: '1px solid', borderColor: 'line.300',
              borderLeft: '4px solid', borderLeftColor: accent, px: '14px', py: '11px', minW: '300px', maxW: '380px'
            },
            icon: { color: accent, mt: '1px' },
            spinner: { color: accent },
            title: { fontSize: '13px', fontWeight: 700, color: 'ink.900', lineHeight: '18px' },
            description: { fontSize: '12px', color: 'ink.400', lineHeight: '17px', mt: '2px' }
          };
        }
      }
    },
    Skeleton: {
      baseStyle: { borderRadius: '8px' },
      defaultProps: { startColor: '#f1eff6', endColor: '#e6e2ee' }
    },
    Switch: {
      baseStyle: { track: { _checked: { bg: 'brand.500' } } }
    },
    Checkbox: {
      baseStyle: { control: { borderRadius: '4px', _checked: { bg: 'brand.500', borderColor: 'brand.500', _hover: { bg: 'brand.600', borderColor: 'brand.600' } } } }
    }
  }
});

export default theme;
