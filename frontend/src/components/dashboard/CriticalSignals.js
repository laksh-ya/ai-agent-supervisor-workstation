import React from 'react';
import { Box, Flex, Text, VStack } from '@chakra-ui/react';
import { Card, SectionTitle, LoadingState } from '../ui';

const CriticalSignals = ({ signals, loading, onSelect }) => (
  <Card px="16px" pt="18px" pb="16px" h="100%" display="flex" flexDirection="column">
    <SectionTitle title="Critical signals" subtitle="Needs supervisor action" />
    <VStack spacing="10px" align="stretch" mt="14px" flex="1" overflowY="auto">
      {loading && !signals?.length && <LoadingState label="Scanning queues, regions and agents" lines={3} h="44px" />}
      {!loading && !signals?.length && (
        <Flex direction="column" align="center" justify="center" flex="1" bg="tint.green" borderRadius="10px" p="16px">
          <Text fontSize="11px" fontWeight={700} color="tint.greenText">All clear</Text>
          <Text fontSize="10px" color="#43765a" mt="2px" textAlign="center">No SLA clusters, sentiment drops or degraded agents</Text>
        </Flex>
      )}
      {(signals || []).map((s) => {
        const critical = s.severity === 'critical';
        return (
          <Flex key={s.id} as="button" type="button" onClick={() => onSelect(s)} textAlign="left" align="center" gap="11px"
            minH="54px" px="14px" py="10px" borderRadius="10px" bg={critical ? '#fce9e9' : '#f5f3f9'}
            transition="transform 150ms ease, box-shadow 150ms ease"
            _hover={{ boxShadow: '0 2px 8px rgba(36,32,51,0.08)' }} _active={{ transform: 'scale(0.99)' }}
            _focusVisible={{ boxShadow: 'outline', outline: 'none' }}>
            <Box w="9px" h="9px" borderRadius="full" bg={critical ? '#d95b5b' : '#e1a43a'} flexShrink={0} />
            <Box minW={0}>
              <Text fontSize="10px" fontWeight={700} color="ink.900">{s.title}</Text>
              <Text fontSize="8.5px" color="ink.300" mt="4px" noOfLines={1}>{s.detail}</Text>
            </Box>
          </Flex>
        );
      })}
    </VStack>
  </Card>
);

export default CriticalSignals;
