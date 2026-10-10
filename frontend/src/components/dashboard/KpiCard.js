import React from 'react';
import { Box, Flex, Text, Tooltip, Skeleton } from '@chakra-ui/react';
import { FiArrowUpRight, FiArrowDownRight, FiMinus } from 'react-icons/fi';

// Delta pill tone follows whether the move is good for the operation, not its sign
const PILL = {
  good: { bg: 'tint.green', color: 'tint.greenText' },
  bad: { bg: 'tint.red', color: 'tint.redText' },
  flat: { bg: 'brand.100', color: 'brand.500' }
};

function direction(delta) {
  const text = String(delta ?? '').trim();
  if (!text || text.startsWith('±')) return FiMinus;
  return text.startsWith('−') || text.startsWith('-') ? FiArrowDownRight : FiArrowUpRight;
}

const KpiCard = ({ label, value, delta, good, tooltip, loading, gridColumn, caption }) => {
  const tone = delta === null || delta === undefined ? null : good === null ? 'flat' : good ? 'good' : 'bad';
  const Arrow = direction(delta);
  return (
    <Tooltip label={tooltip} hasArrow placement="bottom" openDelay={300} isDisabled={!tooltip}>
      <Box bg="white" border="1px solid" borderColor="line.300" borderRadius="12px" boxShadow="soft" h="96px"
        px={{ base: '12px', md: '16px' }} pt="16px" pb="12px" display="flex" flexDirection="column"
        flex="1" minW="0" gridColumn={gridColumn} tabIndex={0} aria-label={`${label}: ${value}${delta ? `, change ${delta}` : ''}`}
        transition="box-shadow 180ms ease, border-color 180ms ease"
        _hover={{ borderColor: 'line.400', boxShadow: 'lift' }} _focusVisible={{ boxShadow: 'outline', outline: 'none' }}>
        <Flex justify="space-between" align="center" gap="8px">
          <Text fontSize="9px" fontWeight={700} color="ink.400" textTransform="uppercase" letterSpacing="0.04em" noOfLines={1}>{label}</Text>
          {tone && (
            <Flex h="18px" px="7px" gap="2px" align="center" borderRadius="10px" bg={PILL[tone].bg} color={PILL[tone].color}
              fontSize="10px" fontWeight={700} flexShrink={0} className="tnum">
              <Arrow size={11} aria-hidden />
              {delta}
            </Flex>
          )}
        </Flex>
        {loading ? (
          <Skeleton h="26px" w="90px" mt="10px" />
        ) : (
          <Text fontSize={{ base: '24px', md: '28px' }} fontWeight={700} color="ink.900" mt="4px" lineHeight="34px" letterSpacing="-0.02em" className="tnum">
            {value}
          </Text>
        )}
        {caption && <Text fontSize="9px" color="ink.200" mt="auto" noOfLines={1}>{caption}</Text>}
      </Box>
    </Tooltip>
  );
};

export default KpiCard;
