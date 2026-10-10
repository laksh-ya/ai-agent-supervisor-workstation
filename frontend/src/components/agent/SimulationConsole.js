import React from 'react';
import { Box, Flex, Text, Button, Skeleton, IconButton, Tooltip } from '@chakra-ui/react';
import { FiChevronLeft } from 'react-icons/fi';
import { Pill, StatLabel } from '../ui';

const VERDICT = {
  PASS: { bg: 'tint.green', title: 'tint.greenText', body: '#43765a' },
  REVIEW: { bg: 'tint.amber', title: 'tint.amberText', body: '#8a6d25' },
  FAIL: { bg: 'tint.red', title: 'tint.redText', body: '#a04c4c' }
};

const Heading = ({ title, subtitle }) => (
  <Box mt="23px">
    <Text as="h3" fontSize="14px" fontWeight={700} color="ink.900">{title}</Text>
    <Text fontSize="10px" color="ink.300" mt="5px">{subtitle}</Text>
  </Box>
);

export function ResultBody({ sim, compact, headings }) {
  const v = VERDICT[sim.evaluation.verdict] || VERDICT.REVIEW;
  const reason = sim.tags.includes('Escalated') ? 'escalation' : sim.tags.includes('Injection blocked') ? 'to refuse' : 'to resolve';
  return (
    <>
      <Box bg="#eeeaf8" borderRadius="12px" pl="16px" pr={compact ? '16px' : '28px'} pt="14px" pb="16px" mt="16px">
        <Text fontSize="8px" fontWeight={700} color="#6e5ba5">AGENT RESPONSE · {sim.versionLabel}</Text>
        <Text fontSize="10px" color="#403a49" mt="12px" lineHeight="16px">{sim.response}</Text>
        <Flex gap="8px" mt="14px" wrap="wrap">
          {sim.tags.map((t) => <Pill key={t} bg="white" color="brand.500" px="12px">{t}</Pill>)}
        </Flex>
      </Box>
      {headings && <Heading title="Decision trace" subtitle={`Why the agent chose ${reason}`} />}
      <Box mt={headings ? '12px' : '16px'}>
        {sim.trace.map((row) => (
          <Flex key={row.label} justify="space-between" fontSize="9px" py="7px" borderBottom="1px solid" borderColor="line.200">
            <Text fontWeight={700} color="ink.200">{row.label}</Text>
            <Text color="#403a49" textAlign="right">{row.value}</Text>
          </Flex>
        ))}
      </Box>
      {headings && <Heading title="Evaluation result" subtitle="Automated and human rubric" />}
      <Box bg={v.bg} borderRadius="12px" pl="17px" pr="17px" pt="18px" pb="16px" mt={headings ? '12px' : '16px'}>
        <Text fontSize="16px" fontWeight={700} color={v.title}>{sim.evaluation.verdict} · {sim.evaluation.score}/100</Text>
        <Text fontSize="9px" color={v.body} mt="10px">{sim.evaluation.summary}</Text>
        <Text fontSize="9px" color={v.body} mt="7px">{sim.evaluation.improve}</Text>
      </Box>
    </>
  );
}

const SimulationConsole = ({ sim, loading, isDraft, onNext, onPrev, onCompare, compareDisabled, previousVersion }) => (
  <Flex direction="column" bg="white" border="1px solid" borderColor="line.300" borderRadius="12px" px="20px" pt="15px" pb="20px" h="100%" overflowY="auto">
    <Flex justify="space-between" align="center">
      <Text as="h2" fontSize="15px" fontWeight={700} color="ink.900">Simulation console</Text>
      <Flex align="center" gap="4px">
        <Tooltip label="Previous scenario" hasArrow>
          <IconButton aria-label="Previous scenario" icon={<FiChevronLeft />} size="xs" variant="ghost" onClick={onPrev} isDisabled={loading} />
        </Tooltip>
        <Pill tone="blue" minW="104px">Scenario {sim ? sim.index + 1 : '–'}/{sim?.total || 24}</Pill>
      </Flex>
    </Flex>

    {!sim ? (
      <Box mt="16px"><Skeleton h="92px" borderRadius="12px" /><Skeleton h="178px" borderRadius="12px" mt="16px" /></Box>
    ) : (
      <Box opacity={loading ? 0.6 : 1} transition="opacity 200ms" aria-busy={loading}>
        <Box bg="#f8f6fb" borderRadius="12px" pl="16px" pr="24px" pt="14px" pb="18px" mt="16px" minH="92px">
          <StatLabel>Customer prompt</StatLabel>
          <Text fontSize="10px" color="#403a49" mt="10px" lineHeight="16px">“{sim.prompt}”</Text>
        </Box>
        {isDraft && <Text fontSize="9px" color="tint.amberText" mt="8px">Running against your draft configuration</Text>}
        <ResultBody sim={sim} headings />
      </Box>
    )}

    <Box flex="1" />
    <Flex gap="8px" mt="16px">
      <Button variant="outline" w="138px" h="36px" onClick={onCompare} isDisabled={!sim || compareDisabled}>
        Compare {previousVersion || 'previous'}
      </Button>
      <Button flex="1" h="36px" onClick={onNext} isLoading={loading}>Run next case</Button>
    </Flex>
  </Flex>
);

export default SimulationConsole;
