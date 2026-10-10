// src/pages/AgentConfig.js — Agent configuration "Control Room"
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Flex, Grid, Text, Button, Menu, MenuButton, MenuList, MenuOptionGroup, MenuItemOption, useDisclosure, useToast,
  AlertDialog, AlertDialogOverlay, AlertDialogContent, AlertDialogHeader, AlertDialogBody, AlertDialogFooter
} from '@chakra-ui/react';
import { FiChevronDown } from 'react-icons/fi';
import { useSearchParams, useBlocker } from 'react-router-dom';
import * as api from '../api';
import { useAppData } from '../context/AppDataContext';
import { useSettings } from '../context/SettingsContext';
import { useSocketEvent } from '../context/WebSocketContext';
import BehaviorPanel from '../components/agent/BehaviorPanel';
import PerformancePanel from '../components/agent/PerformancePanel';
import SimulationConsole from '../components/agent/SimulationConsole';
import { ReviewDeployModal, CompareModal } from '../components/agent/DeployModals';
import { configFromAgent, diffConfig, changeRisk } from '../components/agent/config';
import { LoadingState, EmptyState } from '../components/ui';

const DEFAULT_AGENT = 'agent-cs-3'; // CSR-Returns, the agent shown in the design
const DEFAULT_SCENARIO = 17; // "Scenario 18/24"

function mergePreset(draft, preset) {
  const c = preset.config || {};
  const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null));
  return {
    parameters: { ...draft.parameters, ...clean(c.parameters) },
    capabilities: draft.capabilities.map((x) => ({ ...x, ...((c.capabilities || []).find((y) => y.id === x.id) || {}) })),
    knowledgeBases: draft.knowledgeBases.map((x) => ({ ...x, ...((c.knowledgeBases || []).find((y) => y.id === x.id) || {}) })),
    escalationThresholds: { ...draft.escalationThresholds, ...clean(c.escalationThresholds) }
  };
}

const AgentConfig = () => {
  const { agents, knowledgeBases, loading, reloadAgents } = useAppData();
  const { currency } = useSettings();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const agentId = params.get('agent') || (agents.some((a) => a.id === DEFAULT_AGENT) ? DEFAULT_AGENT : agents[0]?.id);
  const agent = agents.find((a) => a.id === agentId);

  const live = useMemo(() => configFromAgent(agent), [agent]);
  const [draft, setDraft] = useState(null);
  const [presets, setPresets] = useState([]);
  const [range, setRange] = useState('7d');
  const [performance, setPerformance] = useState(null);
  const [perfLoading, setPerfLoading] = useState(true);
  const [evaluation, setEvaluation] = useState(null);
  const [evalMeta, setEvalMeta] = useState({ draft: false, snapshot: null });
  const [evalRunning, setEvalRunning] = useState(false);
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO);
  const [sim, setSim] = useState(null);
  const [simLoading, setSimLoading] = useState(false);
  const [compare, setCompare] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [pendingAgent, setPendingAgent] = useState(null);
  const deploy = useDisclosure();
  const compareModal = useDisclosure();
  const cancelRef = useRef();

  // Reset the draft whenever the live config of the selected agent changes identity
  const liveKey = agent ? `${agent.id}:${agent.version}:${agent.updatedAt}` : '';
  const lastAgentId = useRef(null);
  useEffect(() => {
    if (!live) return;
    // Keep an in-progress draft across unrelated agent_update echoes for the same agent
    if (lastAgentId.current === agent.id && draft) return;
    lastAgentId.current = agent.id;
    setDraft(live);
  }, [liveKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const diff = useMemo(() => (agent && draft ? diffConfig(live, draft, agent, currency) : []), [live, draft, agent, currency]);
  const dirty = diff.length > 0;
  const risk = useMemo(() => changeRisk(diff), [diff]);

  // Block in-app navigation away from unsaved drafts
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    const onUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  useEffect(() => { api.getPresets().then(setPresets).catch(() => {}); }, []);
  useSocketEvent('preset_created', (m) => setPresets((p) => (p.some((x) => x.id === m.data.id) ? p : [m.data, ...p])));
  useSocketEvent('preset_deleted', (m) => setPresets((p) => p.filter((x) => x.id !== m.data.id)));

  // Performance
  useEffect(() => {
    if (!agentId) return;
    setPerfLoading(true);
    api.getAgentPerformance(agentId, range).then(setPerformance).catch(() => setPerformance(null)).finally(() => setPerfLoading(false));
  }, [agentId, range, liveKey]);

  // Latest stored evaluation
  useEffect(() => {
    if (!agentId) return;
    setEvaluation(null);
    setEvalMeta({ draft: false, snapshot: null });
    api.getAgentEvaluation(agentId).then(setEvaluation).catch(() => {});
  }, [agentId]);

  // Simulation console follows the draft (debounced) so every tweak is visible immediately
  const draftJson = draft ? JSON.stringify(draft) : '';
  useEffect(() => {
    if (!agentId || !draft) return undefined;
    setSimLoading(true);
    const t = setTimeout(() => {
      api.simulateAgent(agentId, { index: scenario, config: draft, currency })
        .then((r) => setSim(r.current))
        .catch(() => {})
        .finally(() => setSimLoading(false));
    }, sim ? 450 : 0);
    return () => clearTimeout(t);
  }, [agentId, scenario, draftJson, currency]); // eslint-disable-line react-hooks/exhaustive-deps

  const runEvals = async () => {
    setEvalRunning(true);
    try {
      const res = await api.runAgentEvaluation(agentId, dirty ? draft : undefined);
      setEvaluation(res);
      setEvalMeta({ draft: dirty, snapshot: draftJson });
      const risky = res.results.filter((r) => r.status === 'risk').length;
      toast({ status: risky ? 'warning' : 'success', title: `Evaluation complete · ${res.scenarios} scenarios`, description: risky ? `${risky} check${risky > 1 ? 's' : ''} at risk` : 'No checks at risk', position: 'bottom-right', duration: 3500 });
    } catch (err) {
      toast({ status: 'error', title: 'Evaluation failed', description: err.message, position: 'bottom-right' });
    } finally {
      setEvalRunning(false);
    }
  };

  const openCompare = async () => {
    compareModal.onOpen();
    setCompareLoading(true);
    try {
      setCompare(await api.simulateAgent(agentId, { index: scenario, config: draft, compare: true, currency }));
    } catch (err) {
      toast({ status: 'error', title: 'Comparison failed', description: err.message });
    } finally {
      setCompareLoading(false);
    }
  };

  const doDeploy = async ({ notes, presetName }) => {
    setDeploying(true);
    try {
      const res = await api.updateAgentConfig(agentId, { ...draft, changeRequest: { notes } });
      if (presetName) {
        await api.createPreset({ name: presetName, description: notes, sourceAgentId: agentId, config: draft }).catch((e) =>
          toast({ status: 'warning', title: 'Deployed, but the preset was not saved', description: e.message }));
      }
      lastAgentId.current = null; // accept the new live config as the draft baseline
      await reloadAgents();
      deploy.onClose();
      setEvalMeta({ draft: false, snapshot: null });
      toast({ status: 'success', title: `Deployed ${res.agent.version}`, description: `${res.deployment?.id} · ${res.changed.length} field${res.changed.length === 1 ? '' : 's'} · routed to live traffic`, position: 'bottom-right', duration: 4500 });
    } catch (err) {
      toast({ status: 'error', title: 'Deploy failed', description: err.message, position: 'bottom-right' });
    } finally {
      setDeploying(false);
    }
  };

  const applyPreset = (preset) => {
    setDraft((d) => mergePreset(d, preset));
    toast({ status: 'info', title: `Loaded ${preset.name} into the draft`, description: 'Review the diff, run evals, then deploy.', position: 'bottom-right', duration: 3500 });
  };
  const savePreset = async ({ name, description }) => {
    const p = await api.createPreset({ name, description, sourceAgentId: agentId, config: draft });
    setPresets((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev]));
    toast({ status: 'success', title: 'Preset saved', description: name, position: 'bottom-right', duration: 3000 });
  };
  const removePreset = async (preset) => {
    await api.deletePreset(preset.id);
    setPresets((prev) => prev.filter((x) => x.id !== preset.id));
    toast({ status: 'success', title: 'Preset deleted', description: preset.name, position: 'bottom-right', duration: 2500 });
  };

  const switchAgent = useCallback((id) => {
    if (id === agentId) return;
    if (dirty) { setPendingAgent(id); return; }
    setParams({ agent: id });
  }, [agentId, dirty, setParams]);

  const confirmSwitch = () => {
    const id = pendingAgent;
    setPendingAgent(null);
    lastAgentId.current = null;
    setParams({ agent: id });
  };

  if ((loading.agents && !agent) || (agent && !draft)) return <Box pt="20px"><LoadingState label="Loading agent configuration" lines={6} h="40px" /></Box>;
  if (!agent) return <Box pt="20px"><EmptyState title="No AI agents found" hint="Agents appear here once the backend has seeded or created them." /></Box>;

  const evalStale = evalMeta.draft ? evalMeta.snapshot !== draftJson : dirty;

  return (
    <Box pt="20px">
      <Flex justify="space-between" align="center" mb="26px">
        <Box>
          <Menu placement="bottom-start">
            <MenuButton data-testid="agent-selector" role="combobox" aria-haspopup="listbox" aria-label={`Selected agent: ${agent.name}. Change agent`}
              borderRadius="8px" _focusVisible={{ boxShadow: 'outline', outline: 'none' }}>
              <Flex align="center" gap="8px">
                <Text as="h1" fontSize="24px" fontWeight={700} color="ink.900" lineHeight="normal">{agent.name} · Control Room</Text>
                <Box color="ink.300" mt="4px"><FiChevronDown /></Box>
              </Flex>
            </MenuButton>
            <MenuList>
              <MenuOptionGroup type="radio" title="AI agents" value={agentId} onChange={switchAgent}>
                {agents.map((a) => (
                  <MenuItemOption key={a.id} value={a.id}>
                    <Flex justify="space-between" gap="12px" w="100%"><Text>{a.name}</Text><Text color="ink.300">{a.version}</Text></Flex>
                  </MenuItemOption>
                ))}
              </MenuOptionGroup>
            </MenuList>
          </Menu>
          <Text fontSize="11px" color="ink.400" mt="8px">Configure, evaluate, and deploy agent behavior with governed change controls</Text>
        </Box>
        <Flex gap="12px">
          <Button variant="outline" w="112px" h="36px" onClick={runEvals} isLoading={evalRunning} loadingText="Running">Run evals</Button>
          <Button w="160px" h="36px" onClick={deploy.onOpen} isDisabled={!dirty}>Review &amp; deploy</Button>
        </Flex>
      </Flex>

      <Grid templateColumns="397fr 532fr 332fr" gap="16px" h="calc(100vh - 200px)" minH="780px">
        <BehaviorPanel agent={agent} draft={draft} setDraft={setDraft} dirty={dirty} diff={diff} risk={risk} currency={currency}
          knowledgeCatalog={knowledgeBases} presets={presets} onApplyPreset={applyPreset} onSavePreset={savePreset} onDeletePreset={removePreset} />
        <PerformancePanel agent={agent} performance={performance} perfLoading={perfLoading} range={range} setRange={setRange}
          evaluation={evaluation} evalRunning={evalRunning} evalIsDraft={evalMeta.draft} evalStale={evalStale && !!evaluation} />
        <SimulationConsole sim={sim} loading={simLoading} isDraft={dirty} previousVersion={agent.previous?.version}
          onNext={() => setScenario((s) => (s + 1) % 24)} onPrev={() => setScenario((s) => (s + 23) % 24)}
          onCompare={openCompare} compareDisabled={!agent.previous} />
      </Grid>

      <ReviewDeployModal isOpen={deploy.isOpen} onClose={deploy.onClose} agent={agent} diff={diff} risk={risk}
        evaluation={evaluation} evalIsDraft={evalMeta.draft} evalStale={evalStale} onDeploy={doDeploy} busy={deploying} />
      <CompareModal isOpen={compareModal.isOpen} onClose={compareModal.onClose} data={compare} loading={compareLoading} />

      <AlertDialog isOpen={!!pendingAgent || blocker.state === 'blocked'} leastDestructiveRef={cancelRef} isCentered
        onClose={() => { setPendingAgent(null); if (blocker.state === 'blocked') blocker.reset(); }}>
        <AlertDialogOverlay>
          <AlertDialogContent borderRadius="20px">
            <AlertDialogHeader fontSize="16px">Discard draft changes?</AlertDialogHeader>
            <AlertDialogBody fontSize="13px" color="ink.500">
              {diff.length} field{diff.length === 1 ? '' : 's'} on {agent.name} ha{diff.length === 1 ? 's' : 've'} not been deployed. Save them as a preset first if you want to keep them.
            </AlertDialogBody>
            <AlertDialogFooter gap="8px">
              <Button ref={cancelRef} variant="outline" onClick={() => { setPendingAgent(null); if (blocker.state === 'blocked') blocker.reset(); }}>Keep editing</Button>
              <Button bg="tint.redBar" _hover={{ bg: 'tint.redText' }} onClick={() => (blocker.state === 'blocked' ? blocker.proceed() : confirmSwitch())}>
                Discard draft
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
};

export default AgentConfig;
