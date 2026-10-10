import React, { useEffect, useState } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton, Box, Flex, Text, Button, Textarea,
  Checkbox, Input, Grid, Spinner
} from '@chakra-ui/react';
import { Pill } from '../ui';
import { ResultBody } from './SimulationConsole';

export function ReviewDeployModal({ isOpen, onClose, agent, diff, risk, evaluation, evalIsDraft, evalStale, onDeploy, busy }) {
  const [notes, setNotes] = useState('');
  const [savePreset, setSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  useEffect(() => { if (isOpen) { setNotes(''); setSavePreset(false); setPresetName(''); } }, [isOpen]);
  const failing = (evaluation?.results || []).filter((r) => r.status === 'risk');
  const evaluated = evalIsDraft && !evalStale;
  const nextVersion = (() => { const m = /^v(\d+)\.(\d+)$/.exec(agent.version || ''); return m ? `v${m[1]}.${Number(m[2]) + 1}` : `${agent.version}.1`; })();

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent borderRadius="24px">
        <ModalHeader pb="4px">
          <Text fontSize="17px">Review &amp; deploy · {agent.name}</Text>
          <Text fontSize="12px" color="ink.400" fontWeight={400} mt="2px">
            CR-{(agent.changeRequestSeq || 1841) + 1} · {agent.version} → {nextVersion} · Owner: Neha Prasad · Reviewer: Ops Governance
          </Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Flex gap="8px" mb="14px" wrap="wrap">
            <Pill tone={risk.tone}>Risk: {risk.level}</Pill>
            <Pill tone="neutral">{diff.length} field{diff.length === 1 ? '' : 's'} modified</Pill>
            {evaluated ? (
              failing.length ? <Pill tone="red">{failing.length} eval{failing.length > 1 ? 's' : ''} at risk</Pill> : <Pill tone="green">Draft evals passing</Pill>
            ) : <Pill tone="amber">Draft not evaluated</Pill>}
          </Flex>
          <Box border="1px solid" borderColor="line.300" borderRadius="12px" overflow="hidden">
            <Grid templateColumns="1.1fr 1.6fr 1fr 1fr" bg="#f8f6fb" px="12px" py="8px" fontSize="9px" fontWeight={700} color="ink.200" textTransform="uppercase">
              <Text>Section</Text><Text>Field</Text><Text>Live</Text><Text>Draft</Text>
            </Grid>
            {diff.map((d) => (
              <Grid key={d.key} templateColumns="1.1fr 1.6fr 1fr 1fr" px="12px" py="8px" fontSize="11px" borderTop="1px solid" borderColor="line.200">
                <Text color="ink.300">{d.group}</Text>
                <Text color="ink.700" fontWeight={600}>{d.label}</Text>
                <Text color="ink.300" textDecoration="line-through">{d.from}</Text>
                <Text color="brand.500" fontWeight={700}>{d.to}</Text>
              </Grid>
            ))}
          </Box>
          {!evaluated && (
            <Text fontSize="11px" color="tint.amberText" bg="tint.amber" borderRadius="10px" px="12px" py="8px" mt="12px">
              Tip: run evals on the draft first so the reviewer sees the impact. You can still deploy.
            </Text>
          )}
          <Text fontSize="12px" fontWeight={700} color="ink.700" mt="16px" mb="6px">Change notes</Text>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} fontSize="13px" placeholder="Explain why this change is needed" />
          <Checkbox mt="12px" isChecked={savePreset} onChange={(e) => setSavePreset(e.target.checked)} size="sm">
            <Text fontSize="12px">Also save this configuration as a preset</Text>
          </Checkbox>
          {savePreset && (
            <Input mt="8px" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" fontSize="13px" />
          )}
        </ModalBody>
        <ModalFooter gap="8px">
          <Button variant="outline" onClick={onClose}>Keep editing</Button>
          <Button onClick={() => onDeploy({ notes: notes.trim(), presetName: savePreset ? presetName.trim() : '' })} isLoading={busy}
            isDisabled={!diff.length || (savePreset && !presetName.trim())}>
            Deploy {nextVersion}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export function CompareModal({ isOpen, onClose, data, loading }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent borderRadius="24px">
        <ModalHeader fontSize="17px" pb="0">Version comparison</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb="24px">
          {loading || !data ? (
            <Flex h="240px" align="center" justify="center" direction="column" gap="10px" role="status"><Spinner color="brand.500" /><Text fontSize="12px" color="ink.300">Replaying the scenario on both versions</Text></Flex>
          ) : (
            <>
              <Box bg="#f8f6fb" borderRadius="12px" px="16px" py="12px" mt="12px">
                <Text fontSize="8px" fontWeight={700} color="ink.200">CUSTOMER PROMPT · SCENARIO {data.current.index + 1}</Text>
                <Text fontSize="12px" color="#403a49" mt="6px">“{data.current.prompt}”</Text>
              </Box>
              <Grid templateColumns="1fr 1fr" gap="20px">
                {[data.previous, data.current].filter(Boolean).map((sim, i) => (
                  <Box key={sim.versionLabel + i}>
                    <Flex mt="16px" align="center" gap="8px">
                      <Text fontSize="13px" fontWeight={700}>{sim.versionLabel}</Text>
                      <Pill tone={i === 0 ? 'neutral' : 'purple'} h="20px">{i === 0 ? 'Previous' : 'Current / draft'}</Pill>
                    </Flex>
                    <ResultBody sim={sim} compact />
                  </Box>
                ))}
              </Grid>
              {!data.previous && <Text fontSize="12px" color="ink.300" mt="12px">No previous version is recorded for this agent.</Text>}
            </>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
