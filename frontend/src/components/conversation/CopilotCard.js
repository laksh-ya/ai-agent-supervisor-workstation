import React from 'react';
import { Box, Flex, Text, Button, Skeleton, Tooltip } from '@chakra-ui/react';
import { Pill } from '../ui';

const CopilotCard = ({ recommendation, loading, decision, busy, onApprove, onEdit, onEscalate, highlight }) => (
  <Box border="1px solid" borderColor={highlight ? 'brand.300' : 'line.300'} borderRadius="10px" bg="#fcfbfe" px="18px" pt="16px" pb="14px"
    boxShadow={highlight ? '0 0 0 3px rgba(81,65,132,0.12)' : 'none'} transition="box-shadow 400ms ease, border-color 400ms ease">
    <Text fontSize="14px" fontWeight={700} color="ink.900">Co-pilot recommendation</Text>
    <Text fontSize="10px" color="ink.300" mt="3px">{recommendation?.basis || 'Based on policy, customer tier and conversation sentiment'}</Text>

    {loading && !recommendation ? (
      <Box mt="12px"><Skeleton h="12px" w="80%" mb="8px" /><Skeleton h="10px" w="60%" /></Box>
    ) : recommendation ? (
      <Flex justify="space-between" align="flex-end" gap="12px" mt="11px">
        <Box minW={0}>
          <Text fontSize="11px" color="ink.600" lineHeight="1.45">{recommendation.title}</Text>
          <Tooltip hasArrow placement="top-start" label={(recommendation.citations || []).map((c) => `${c.source} › ${c.section.split(' > ').pop()}`).join('  •  ') || 'No policy citations'}>
            <Text fontSize="9px" color="ink.300" mt="9px" cursor="help" noOfLines={1}>Evidence: {recommendation.evidence.join(' • ')}</Text>
          </Tooltip>
        </Box>
        <Pill tone="green" dot flexShrink={0} mb="18px">Confidence {Math.round(recommendation.confidence * 100)}%</Pill>
      </Flex>
    ) : (
      <Text fontSize="11px" color="ink.300" mt="12px">No recommendation for this case. Reply manually or use a template.</Text>
    )}

    <Flex gap="8px" mt="12px" align="center">
      {decision === 'approve' ? (
        <Pill tone="green" h="30px" px="16px">✓ {recommendation?.actionLabel || 'Approved'}. Reply sent</Pill>
      ) : (
        <Button h="30px" w="116px" fontSize="9px" borderRadius="10px" onClick={onApprove} isLoading={busy === 'approve'} isDisabled={!recommendation || !!busy || decision === 'escalate'}>
          Approve action
        </Button>
      )}
      <Button variant="outline" h="30px" w="106px" fontSize="9px" borderRadius="10px" onClick={onEdit} isDisabled={!recommendation || !!busy}>
        Edit response
      </Button>
      {decision === 'escalate' ? (
        <Pill tone="red" h="30px" px="14px">Escalated to Ops Governance</Pill>
      ) : (
        <Button variant="outline" h="30px" w="116px" fontSize="9px" borderRadius="10px" onClick={onEscalate} isLoading={busy === 'escalate'} isDisabled={!recommendation || !!busy || decision === 'approve'}>
          Escalate policy
        </Button>
      )}
    </Flex>
  </Box>
);

export default CopilotCard;
