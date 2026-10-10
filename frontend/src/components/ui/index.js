// src/components/ui/index.js — design-system primitives shared by every screen
import React from 'react';
import { Box, Flex, Image, Text, Skeleton, Tooltip } from '@chakra-ui/react';
import { firstInitial } from '../../utils/format';

export const TONES = {
  red: { bg: 'tint.red', fg: 'tint.redText', bar: 'tint.redBar', dot: '#d95b5b' },
  amber: { bg: 'tint.amber', fg: 'tint.amberText', bar: 'tint.amberBar', dot: '#e1a43a' },
  blue: { bg: 'tint.blue', fg: 'tint.blueText', bar: 'tint.blueBar', dot: '#638cc7' },
  green: { bg: 'tint.green', fg: 'tint.greenText', bar: 'tint.greenBar', dot: '#2e9e5b' },
  purple: { bg: 'brand.100', fg: 'brand.500', bar: 'brand.500', dot: '#514184' },
  neutral: { bg: '#f5f2f9', fg: 'brand.500', bar: 'ink.200', dot: '#8a8394' }
};

export const SEVERITY = {
  critical: { tone: 'red', label: 'Critical' },
  high: { tone: 'amber', label: 'High' },
  watch: { tone: 'blue', label: 'Watch' },
  stable: { tone: 'green', label: 'Stable' }
};

export function riskTone(score) {
  if (score >= 80) return 'red';
  if (score >= 65) return 'amber';
  return 'blue';
}

export const FigmaIcon = ({ src, size = 20, alt = '', ...rest }) => (
  <Image src={src} alt={alt} w={`${size}px`} h={`${size}px`} flexShrink={0} draggable={false} {...rest} />
);

export const Card = React.forwardRef(({ children, ...rest }, ref) => (
  <Box ref={ref} bg="white" border="1px solid" borderColor="line.300" borderRadius="12px" boxShadow="soft" {...rest}>
    {children}
  </Box>
));

export const SectionTitle = ({ title, subtitle, size = 15, children, ...rest }) => (
  <Flex justify="space-between" align="flex-start" gap="12px" {...rest}>
    <Box minW={0}>
      <Text as="h2" fontSize={`${size}px`} fontWeight={700} color="ink.900" lineHeight="normal">{title}</Text>
      {subtitle && <Text fontSize="10px" color="ink.300" mt="5px" lineHeight="normal">{subtitle}</Text>}
    </Box>
    {children}
  </Flex>
);

export const Pill = React.forwardRef(({ tone = 'neutral', dot = false, children, h = '24px', fontSize = '10px', ...rest }, ref) => {
  const t = TONES[tone] || TONES.neutral;
  return (
    <Flex ref={ref} as="span" display="inline-flex" align="center" justify="center" gap="6px" h={h} px="12px" borderRadius="12px"
      bg={t.bg} color={t.fg} fontSize={fontSize} fontWeight={700} whiteSpace="nowrap" lineHeight={1} {...rest}>
      {dot && <Box as="span" w="7px" h="7px" borderRadius="full" bg={t.dot} flexShrink={0} />}
      {children}
    </Flex>
  );
});

export const Bar = ({ value = 0, tone = 'purple', color, h = '6px', trackColor = '#ecebf2', label, ...rest }) => (
  <Box h={h} bg={trackColor} borderRadius="full" overflow="hidden" role="progressbar" aria-valuenow={Math.round(value * 100)}
    aria-valuemin={0} aria-valuemax={100} aria-label={label} {...rest}>
    <Box h="100%" w={`${Math.max(0, Math.min(1, value)) * 100}%`} bg={color || (TONES[tone] || TONES.purple).bar}
      borderRadius="full" transition="width 600ms cubic-bezier(0.22, 1, 0.36, 1)" />
  </Box>
);

export const InitialAvatar = ({ name, size = 26, fontSize = '10px', ...rest }) => (
  <Flex w={`${size}px`} h={`${size}px`} borderRadius="full" bg="#e9cdb2" color="#5b3f2c" align="center" justify="center"
    fontSize={fontSize} fontWeight={700} flexShrink={0} aria-hidden {...rest}>
    {firstInitial(name)}
  </Flex>
);

export const StatLabel = ({ children, ...rest }) => (
  <Text fontSize="8px" fontWeight={700} color="ink.200" textTransform="uppercase" letterSpacing="0.02em" lineHeight="normal" {...rest}>{children}</Text>
);

export const Delta = ({ value, suffix = '', positiveIsGood = true, digits = 1, format }) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const good = value === 0 ? true : (value > 0) === positiveIsGood;
  const text = format ? format(value) : `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(digits)}${suffix}`;
  return (
    <Text as="span" fontSize="9px" fontWeight={700} color={good ? 'tint.greenText' : 'tint.redText'}>{text}</Text>
  );
};

export const Divider = (props) => <Box h="1px" bg="line.200" w="100%" {...props} />;

export const EmptyState = ({ title, hint, icon: IconCmp, action, ...rest }) => (
  <Flex direction="column" align="center" justify="center" textAlign="center" py="28px" px="16px" color="ink.300" role="status" {...rest}>
    {IconCmp && (
      <Flex w="36px" h="36px" borderRadius="full" bg="brand.100" color="brand.500" align="center" justify="center" mb="10px">
        <IconCmp size={16} />
      </Flex>
    )}
    <Text fontSize="12px" fontWeight={700} color="ink.600">{title}</Text>
    {hint && <Text fontSize="11px" mt="4px" maxW="280px" lineHeight="16px">{hint}</Text>}
    {action && <Box mt="12px">{action}</Box>}
  </Flex>
);

// Skeleton rows with a caption so a loading area always says what it is waiting for
export const LoadingState = ({ label, lines = 3, h = '14px', ...rest }) => (
  <Box role="status" aria-live="polite" aria-label={label} {...rest}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} h={h} mb="10px" borderRadius="8px" w={`${92 - i * 11}%`} />
    ))}
    {label && <Text fontSize="10px" color="ink.200" mt="2px">{label}</Text>}
  </Box>
);

export const LoadingLines = ({ lines = 3, h = '14px', ...rest }) => (
  <Box {...rest}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} h={h} mb="10px" borderRadius="6px" startColor="#f1eff6" endColor="#e6e2ee" w={`${90 - i * 12}%`} />
    ))}
  </Box>
);

export const InfoTip = ({ label, children }) => (
  <Tooltip label={label} hasArrow placement="top" openDelay={250}>
    <Box as="span" display="inline-flex">{children}</Box>
  </Tooltip>
);

export const LiveDot = ({ color = '#2e9e5b', pulse = true }) => (
  <Box as="span" position="relative" display="inline-flex" w="8px" h="8px">
    {pulse && (
      <Box as="span" position="absolute" inset={0} borderRadius="full" bg={color} opacity={0.5}
        sx={{ animation: 'livePulse 1.8s ease-out infinite', '@keyframes livePulse': { '0%': { transform: 'scale(1)', opacity: 0.5 }, '100%': { transform: 'scale(2.4)', opacity: 0 } } }} />
    )}
    <Box as="span" position="relative" w="8px" h="8px" borderRadius="full" bg={color} />
  </Box>
);
