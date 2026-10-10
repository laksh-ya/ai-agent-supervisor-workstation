// src/pages/Settings.js — supervisor preferences and workstation controls
import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Flex, Grid, Text, Input, Switch, Button, RadioGroup, Radio, Stack, Link, Select,
  AlertDialog, AlertDialogOverlay, AlertDialogContent, AlertDialogHeader, AlertDialogBody, AlertDialogFooter, useToast
} from '@chakra-ui/react';
import { useSettings } from '../context/SettingsContext';
import { useWebSocket } from '../context/WebSocketContext';
import * as api from '../api';
import { Card, SectionTitle, Pill } from '../components/ui';
import { money, INR_PER_USD } from '../utils/format';

const Row = ({ title, hint, children }) => (
  <Flex justify="space-between" align="center" gap="24px" py="14px" borderBottom="1px solid" borderColor="line.200" _last={{ borderBottom: 'none' }}>
    <Box>
      <Text fontSize="12px" fontWeight={700} color="ink.700">{title}</Text>
      {hint && <Text fontSize="11px" color="ink.300" mt="3px" maxW="460px">{hint}</Text>}
    </Box>
    <Box flexShrink={0}>{children}</Box>
  </Flex>
);

const Settings = () => {
  const s = useSettings();
  const { status } = useWebSocket();
  const toast = useToast();
  const [simulation, setSimulation] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const cancelRef = useRef();
  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8080';

  useEffect(() => { api.getSystemStatus().then((r) => setSimulation(r.simulation)).catch(() => {}); }, []);

  const reset = async () => {
    setResetting(true);
    try {
      await api.resetDemoData();
      toast({ status: 'success', title: 'Demo data restored', position: 'bottom-right', duration: 3000 });
      setResetOpen(false);
    } catch (err) {
      toast({ status: 'error', title: 'Reset failed', description: err.message, position: 'bottom-right' });
    } finally {
      setResetting(false);
    }
  };

  return (
    <Box pt="20px" maxW="980px">
      <Text as="h1" fontSize="24px" fontWeight={700} color="ink.900">Settings</Text>
      <Text fontSize="11px" color="ink.400" mt="8px" mb="24px">Preferences for this workstation. Saved in this browser.</Text>

      <Grid templateColumns="1fr 1fr" gap="16px" alignItems="start">
        <Card px="20px" pt="18px" pb="8px">
          <SectionTitle title="Profile" subtitle="Used in replies, templates and the activity feed" />
          <Row title="Supervisor name">
            <Input size="sm" w="200px" borderRadius="10px" value={s.supervisorName} onChange={(e) => s.update({ supervisorName: e.target.value })} aria-label="Supervisor name" />
          </Row>
          <Row title="Company name" hint="Fills the {{company_name}} template variable and the top bar">
            <Input size="sm" w="200px" borderRadius="10px" value={s.companyName} onChange={(e) => s.update({ companyName: e.target.value })} aria-label="Company name" />
          </Row>
          <Row title="Voice input language" hint="Used by the microphone in the reply composer (Web Speech API)">
            <Select size="sm" w="200px" borderRadius="10px" value={s.voiceLang} onChange={(e) => s.update({ voiceLang: e.target.value })} aria-label="Voice input language">
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">Hindi (India)</option>
              <option value="es-ES">Spanish (Spain)</option>
            </Select>
          </Row>
        </Card>

        <Card px="20px" pt="18px" pb="8px">
          <SectionTitle title="Display currency" subtitle="Amounts are stored in INR; USD uses a fixed demo rate" />
          <Row title="Currency" hint={`Example: ${money(124000, s.currency)} lifetime value · 1 USD = ₹${INR_PER_USD}`}>
            <RadioGroup value={s.currency} onChange={(v) => s.update({ currency: v })}>
              <Stack direction="row" spacing="16px">
                <Radio value="INR" colorScheme="purple" size="sm"><Text fontSize="12px">₹ INR</Text></Radio>
                <Radio value="USD" colorScheme="purple" size="sm"><Text fontSize="12px">$ USD</Text></Radio>
              </Stack>
            </RadioGroup>
          </Row>
        </Card>

        <Card px="20px" pt="18px" pb="8px">
          <SectionTitle title="Alerts" subtitle="How the workstation gets your attention" />
          <Row title="High-risk conversation toasts" hint="Pop-up when a conversation crosses an escalation threshold">
            <Switch isChecked={s.alertToasts} onChange={(e) => s.update({ alertToasts: e.target.checked })} aria-label="High-risk conversation toasts" />
          </Row>
          <Row title="Auto-refresh dashboard & feed" hint="Pause to freeze the dashboard while you investigate">
            <Switch isChecked={s.autoRefresh} onChange={(e) => s.update({ autoRefresh: e.target.checked })} aria-label="Auto-refresh" />
          </Row>
        </Card>

        <Card px="20px" pt="18px" pb="8px">
          <SectionTitle title="Live traffic & data" subtitle="Controls for the demo environment" />
          <Row title="Real-time connection">
            <Pill tone={status === 'open' ? 'green' : status === 'connecting' ? 'amber' : 'red'} dot>
              {status === 'open' ? 'Connected' : status === 'connecting' ? 'Connecting' : 'Offline'}
            </Pill>
          </Row>
          <Row title="Conversation simulator" hint="Generates customer messages, AI replies and new chats">
            <Switch isChecked={!!simulation} isDisabled={simulation === null} aria-label="Conversation simulator"
              onChange={(e) => api.setSimulation(e.target.checked).then((r) => setSimulation(r.simulation))} />
          </Row>
          <Row title="Reset demo data" hint="Restores the seeded conversations, agents, templates and presets">
            <Button size="sm" variant="outline" onClick={() => setResetOpen(true)}>Reset…</Button>
          </Row>
          <Row title="API documentation">
            <Link href={`${apiBase}/api-docs`} isExternal fontSize="12px" color="brand.500" fontWeight={700}>Open Swagger ↗</Link>
          </Row>
        </Card>
      </Grid>

      <AlertDialog isOpen={resetOpen} leastDestructiveRef={cancelRef} onClose={() => setResetOpen(false)} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent borderRadius="20px">
            <AlertDialogHeader fontSize="16px">Reset all demo data?</AlertDialogHeader>
            <AlertDialogBody fontSize="13px" color="ink.500">Conversations, agents, templates, presets and the activity feed return to the seeded state. Your local preferences are kept.</AlertDialogBody>
            <AlertDialogFooter gap="8px">
              <Button ref={cancelRef} variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
              <Button bg="tint.redBar" _hover={{ bg: 'tint.redText' }} onClick={reset} isLoading={resetting}>Reset data</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
};

export default Settings;
