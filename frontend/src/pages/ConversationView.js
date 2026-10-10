// src/pages/ConversationView.js — Intervention interface
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Text, Button, useDisclosure, useToast } from '@chakra-ui/react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as api from '../api';
import { useAppData } from '../context/AppDataContext';
import { useSettings } from '../context/SettingsContext';
import { useSocketEvent } from '../context/WebSocketContext';
import useNow from '../hooks/useNow';
import useTemplates from '../hooks/useTemplates';
import ConversationList from '../components/conversation/ConversationList';
import MessageList from '../components/conversation/MessageList';
import CopilotCard from '../components/conversation/CopilotCard';
import ReplyComposer from '../components/conversation/ReplyComposer';
import CustomerIntel from '../components/conversation/CustomerIntel';
import ReturnToAiModal from '../components/conversation/ReturnToAiModal';
import TemplatePickerModal from '../components/templates/TemplatePickerModal';
import { InitialAvatar, Pill, SEVERITY, LoadingState, EmptyState } from '../components/ui';
import { clock } from '../utils/format';
import { conversationValues, renderTemplate } from '../utils/templates';

const SLA_SECONDS = 15 * 60;
const QUEUE_SHORT = { Refund: 'Returns', Delivery: 'Delivery', Product: 'Product', Account: 'Account', Billing: 'Billing' };
const msgKey = (m) => `${m.sender}|${new Date(m.timestamp).getTime()}|${m.text}`;

function Banner({ tone, title, subtitle }) {
  const styles = {
    amber: { bg: 'tint.amber', dot: '#e1a43a', title: 'tint.amberText', sub: '#8a6d25' },
    red: { bg: 'tint.red', dot: '#d95b5b', title: 'tint.redText', sub: '#a04c4c' },
    purple: { bg: 'brand.100', dot: '#514184', title: 'brand.500', sub: 'ink.400' },
    green: { bg: 'tint.green', dot: '#2e9e5b', title: 'tint.greenText', sub: '#43765a' },
    blue: { bg: 'tint.blue', dot: '#638cc7', title: 'tint.blueText', sub: '#5b7aa6' }
  }[tone];
  return (
    <Flex bg={styles.bg} borderRadius="8px" px="18px" py="8px" minH="43px" align="center" gap="11px" mt="13px" role="status" aria-live="polite">
      <Box w="9px" h="9px" borderRadius="full" bg={styles.dot} flexShrink={0} />
      <Box>
        <Text fontSize="10px" fontWeight={700} color={styles.title} sx={{ fontVariantNumeric: 'tabular-nums' }}>{title}</Text>
        {subtitle && <Text fontSize="9px" color={styles.sub} mt="3px">{subtitle}</Text>}
      </Box>
    </Flex>
  );
}

const ConversationView = () => {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const { liveList, loading: appLoading, takeOver, release, sendMessage, setStatus, notifyError } = useAppData();
  const { templates, loading: templatesLoading, upsertLocal } = useTemplates();
  const now = useNow();

  const [conversation, setConversation] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [copilot, setCopilot] = useState(null);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [decision, setDecision] = useState(null);
  const [busy, setBusy] = useState(null); // takeover | release | send | approve | escalate | resolve
  const [draft, setDraft] = useState('');
  const [draftTemplate, setDraftTemplate] = useState(null);
  const [highlightCopilot, setHighlightCopilot] = useState(false);
  const picker = useDisclosure();
  const returnModal = useDisclosure();
  const composerRef = useRef();
  const copilotRef = useRef();

  // /conversations → open the highest-risk conversation
  useEffect(() => {
    if (!id && !appLoading.conversations && liveList.length) navigate(`/conversation/${liveList[0].id}`, { replace: true });
  }, [id, appLoading.conversations, liveList, navigate]);

  const loadCopilot = useCallback((cid) => {
    setCopilotLoading(true);
    api.getCopilot(cid, settings.currency).then(setCopilot).catch(() => setCopilot(null)).finally(() => setCopilotLoading(false));
  }, [settings.currency]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setConversation(null);
    setLoadError(null);
    setCopilot(null);
    setDecision(null);
    setDraft('');
    setDraftTemplate(null);
    api.getConversation(id)
      .then((c) => {
        if (cancelled) return;
        setConversation(c);
        const tags = c.tags || [];
        if (tags.includes('override-approved')) setDecision('approve');
        else if (tags.includes('policy-escalated')) setDecision('escalate');
      })
      .catch((err) => !cancelled && setLoadError(err.status === 404 ? 'This conversation was removed or the link is out of date.' : err.message));
    loadCopilot(id);
    return () => { cancelled = true; };
  }, [id, loadCopilot]);

  // Deep links from the dashboard and the template workspace
  useEffect(() => {
    if (!conversation || conversation.id !== id) return;
    let changed = false;
    if (params.get('templates') === 'open') { picker.onOpen(); params.delete('templates'); changed = true; }
    const tid = params.get('template');
    if (tid && templates.length) {
      const t = templates.find((x) => x.id === tid);
      if (t) {
        setDraft(renderTemplate(t.content, conversationValues(conversation, settings)).text);
        setDraftTemplate(t);
        setTimeout(() => composerRef.current?.focus(), 50);
      }
      params.delete('template');
      changed = true;
    }
    if (params.get('focus') === 'copilot') {
      setHighlightCopilot(true);
      setTimeout(() => copilotRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      setTimeout(() => setHighlightCopilot(false), 2600);
      params.delete('focus');
      changed = true;
    }
    if (changed) setParams(params, { replace: true });
  }, [conversation, id, params, setParams, templates, picker, settings]);

  // ---- Real-time updates for this conversation ----
  const refetchCopilot = useRef(null);
  useSocketEvent('message_update', (m) => {
    if (m.conversationId !== id) return;
    setConversation((c) => {
      if (!c || c.messages.some((x) => msgKey(x) === msgKey(m.message))) return c;
      return { ...c, messages: [...c.messages, m.message] };
    });
    if (m.message.sender === 'customer') {
      clearTimeout(refetchCopilot.current);
      refetchCopilot.current = setTimeout(() => { if (!decision) loadCopilot(id); }, 1200);
    }
  });
  useSocketEvent('conversation_updated', (m) => {
    if (m.data?.id !== id) return;
    setConversation((c) => (c ? { ...c, ...m.data, messages: c.messages } : c));
  });
  useSocketEvent('metrics_update', (m) => {
    if (m.conversationId !== id) return;
    setConversation((c) => (c ? { ...c, metrics: { ...c.metrics, ...m.metrics } } : c));
  });

  const values = useMemo(() => conversationValues(conversation, settings), [conversation, settings]);

  const applyFull = (full) => {
    if (full?.id === id) setConversation((c) => ({ ...full, messages: mergeMessages(c?.messages, full.messages) }));
  };

  const doTakeOver = async (notes = 'Supervisor took over', { announce = true } = {}) => {
    setBusy('takeover');
    try {
      applyFull(await takeOver(id, notes));
      if (announce) {
        toast({ status: 'success', title: 'You own this conversation', description: `${conversation.agent?.name || 'The AI agent'} is paused. Replies now come from you.` });
      }
    } catch (err) {
      notifyError('Takeover failed', err);
      throw err;
    } finally {
      setBusy(null);
    }
  };

  const doRelease = async (notes) => {
    setBusy('release');
    try {
      applyFull(await release(id, notes));
      returnModal.onClose();
      toast({ status: 'success', title: `${conversation.agent?.name || 'AI agent'} is back in control`, description: notes ? 'Your guidance is in the transcript and case notes.' : 'No guidance note was added.' });
    } catch (err) {
      if (err.status === 409) {
        // Already released (another tab / double submit) — the server guard kept the transcript clean
        applyFull(await api.getConversation(id).catch(() => null));
        returnModal.onClose();
        toast({ status: 'info', title: 'Already returned to the AI', description: 'No duplicate handoff note was added.' });
      } else {
        notifyError('Return to AI failed', err);
      }
    } finally {
      setBusy(null);
    }
  };

  const ensureControl = async () => {
    if (!conversation.humanIntervention?.active) {
      await doTakeOver('Took over to reply to the customer', { announce: false });
      toast({ status: 'info', title: 'You took over to reply', description: `${conversation.agent?.name || 'The AI agent'} is paused.` });
    }
  };

  const send = async (text = draft, templateId = draftTemplate?.id) => {
    setBusy('send');
    try {
      await ensureControl();
      const message = await sendMessage(id, text.trim(), templateId);
      setConversation((c) => (c.messages.some((x) => msgKey(x) === msgKey(message)) ? c : { ...c, messages: [...c.messages, message] }));
      setDraft('');
      setDraftTemplate(null);
      return true;
    } catch (err) {
      notifyError('Message not sent', err);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    setBusy('approve');
    try {
      await ensureControl();
      const message = await sendMessage(id, copilot.reply);
      setConversation((c) => (c.messages.some((x) => msgKey(x) === msgKey(message)) ? c : { ...c, messages: [...c.messages, message] }));
      await api.recordCopilotDecision(id, 'approve', copilot.actionLabel);
      setDecision('approve');
    } catch (err) {
      notifyError('Approval failed', err);
    } finally {
      setBusy(null);
    }
  };

  const escalate = async () => {
    setBusy('escalate');
    try {
      await api.recordCopilotDecision(id, 'escalate');
      setDecision('escalate');
      toast({ status: 'info', title: 'Sent to Ops Governance', description: 'The policy exception is queued for review.' });
    } catch (err) {
      notifyError('Escalation failed', err);
    } finally {
      setBusy(null);
    }
  };

  const toggleResolved = async () => {
    setBusy('resolve');
    try {
      const resolved = conversation.status === 'resolved';
      const full = await setStatus(id, resolved ? (conversation.humanIntervention?.active ? 'escalated' : 'active') : 'resolved');
      applyFull(full);
      toast({ status: 'success', title: resolved ? 'Conversation reopened' : 'Conversation resolved', description: `${conversation.customer?.name} · #${conversation.caseNumber}` });
    } catch (err) {
      notifyError('Status update failed', err);
    } finally {
      setBusy(null);
    }
  };

  const insertTemplate = (template, filled = {}) => {
    // Values typed in the picker override what was resolved from the conversation
    const { text, unresolved } = renderTemplate(template.content, { ...values, ...filled });
    setDraft(text);
    setDraftTemplate(template);
    toast({
      status: unresolved.length ? 'warning' : 'success',
      title: `Inserted ${template.name}`,
      description: unresolved.length
        ? `Fill ${unresolved.length} highlighted variable${unresolved.length > 1 ? 's' : ''} before sending.`
        : 'All variables filled. Review the reply, then send.'
    });
    setTimeout(() => composerRef.current?.focus(), 80);
  };

  const toggleStar = async (t) => {
    upsertLocal({ ...t, starred: !t.starred });
    try { await api.updateTemplate(t.id, { starred: !t.starred }); } catch { upsertLocal(t); }
  };

  // ---- Render ----
  const shell = (center) => (
    <Flex gap="18px" h="calc(100vh - 102px)" minH="640px" pt="0">
      <ConversationList selectedId={id} />
      {center}
    </Flex>
  );

  if (!id) {
    return shell(
      <Flex flex="1" bg="white" borderRadius="8px" align="center" justify="center" data-testid="message-list">
        {appLoading.conversations ? <LoadingState label="Finding the highest-risk conversation" lines={3} w="60%" /> : <EmptyState title="No open conversations" hint="New conversations open here as customers write in." />}
      </Flex>
    );
  }

  if (loadError) {
    return shell(
      <Flex flex="1" bg="white" borderRadius="8px" align="center" justify="center" direction="column" gap="10px" data-testid="message-list">
        <EmptyState title="Conversation not found" hint={loadError} />
        <Button variant="outline" onClick={() => navigate('/conversations')}>Open highest-risk conversation</Button>
      </Flex>
    );
  }

  if (!conversation) {
    return shell(
      <Box flex="1" bg="white" borderRadius="8px" p="24px" data-testid="message-list"><LoadingState label="Loading transcript and customer profile" lines={6} h="40px" /></Box>
    );
  }

  const human = !!conversation.humanIntervention?.active;
  const resolved = conversation.status === 'resolved';
  const elapsed = resolved && conversation.endTime
    ? (new Date(conversation.endTime) - new Date(conversation.startTime)) / 1000
    : (now - new Date(conversation.startTime).getTime()) / 1000;
  const remaining = SLA_SECONDS - elapsed;
  const risk = conversation.risk || {};
  const sev = SEVERITY[risk.severity] || SEVERITY.stable;

  let banner = null;
  if (resolved) banner = { tone: 'green', title: `Resolved · handled in ${clock(elapsed)}`, subtitle: 'Reopen from the customer panel if the customer writes back.' };
  else if (human) banner = { tone: 'purple', title: `You own this conversation. ${conversation.agent?.name} is paused`, subtitle: remaining > 0 ? `SLA clock ${clock(remaining)} remaining · return control with guidance when you finish.` : 'SLA already breached. Resolve, or hand back with guidance.' };
  else if (remaining <= 0) banner = { tone: 'red', title: `SLA breached ${clock(-remaining)} ago`, subtitle: risk.cause || risk.breaches?.[0] || 'Chat resolution SLA is 15 minutes' };
  else if (remaining <= 300) banner = { tone: 'amber', title: `SLA breach likely in ${clock(remaining)}`, subtitle: risk.cause || risk.breaches?.[0] || 'Chat resolution SLA is 15 minutes' };
  else if (conversation.status === 'escalated') banner = { tone: 'amber', title: 'Escalated. Waiting for a supervisor', subtitle: risk.breaches?.[0] || 'Escalation threshold met' };
  else if (risk.cause) banner = { tone: 'blue', title: risk.cause, subtitle: `SLA clock ${clock(remaining)} remaining` };

  const meta = [QUEUE_SHORT[conversation.queue] || conversation.queue, conversation.channel, conversation.customer?.locale, conversation.customer?.tier && `${conversation.customer.tier} tier`].filter(Boolean).join(' • ');

  return shell(
    <>
      <Flex direction="column" flex="651" minW="520px" bg="white" borderRadius="8px" px="10px" pt="20px" pb="20px" minH={0}>
        {/* Header */}
        <Flex bg="#f5f4f8" borderRadius="4px" minH="67px" px="16px" py="10px" align="center" justify="space-between" gap="12px">
          <Flex align="center" gap="18px" minW={0}>
            <InitialAvatar name={conversation.customer?.name} size={28} />
            <Box minW={0}>
              <Text as="h1" fontSize="15px" fontWeight={700} color="ink.900" noOfLines={1}>{conversation.customer?.name} · Case #{conversation.caseNumber}</Text>
              <Text fontSize="10px" color="ink.300" mt="4px" noOfLines={1}>{meta}</Text>
            </Box>
          </Flex>
          <Flex align="center" gap="10px" flexShrink={0}>
            {resolved ? <Pill tone="green" dot>Resolved</Pill> : human ? <Pill tone="purple" dot>You own this</Pill> : <Pill tone={sev.tone} dot>{sev.label}</Pill>}
            {human ? (
              <Button variant="outline" h="36px" w="112px" onClick={returnModal.onOpen} isLoading={busy === 'release'} isDisabled={resolved || !!busy}>Return to AI</Button>
            ) : (
              <Button h="36px" w="88px" onClick={() => doTakeOver().catch(() => {})} isLoading={busy === 'takeover'} isDisabled={resolved || !!busy}>Take over</Button>
            )}
          </Flex>
        </Flex>

        {banner && <Banner {...banner} />}

        <MessageList messages={conversation.messages} supervisorName={settings.supervisorName} customerName={conversation.customer?.name} />

        <Box ref={copilotRef} mt="14px">
          <CopilotCard recommendation={copilot} loading={copilotLoading} decision={decision} busy={busy} highlight={highlightCopilot}
            onApprove={approve} onEscalate={escalate}
            onEdit={() => { setDraft(copilot.reply); setDraftTemplate(null); setTimeout(() => composerRef.current?.focus(), 50); }} />
        </Box>
        <Box mt="20px">
          <ReplyComposer ref={composerRef} value={draft} onChange={setDraft} onSend={() => send()} sending={busy === 'send'}
            onOpenTemplates={picker.onOpen} template={draftTemplate} onClearTemplate={() => setDraftTemplate(null)}
            aiInControl={!human && !resolved} disabled={false} supervisorName={settings.supervisorName}
            voiceLang={settings.voiceLang} onVoiceError={(msg) => toast({ status: 'warning', title: 'Voice input stopped', description: msg, duration: 5000 })} />
        </Box>
      </Flex>

      <Box flex="340" minW="300px" maxW="360px" h="100%">
        <CustomerIntel conversation={{ ...conversation, risk }} currency={settings.currency} onResolve={toggleResolved} resolving={busy === 'resolve'} />
      </Box>

      <TemplatePickerModal isOpen={picker.isOpen} onClose={picker.onClose} templates={templates} loading={templatesLoading}
        conversation={conversation} values={values} onInsert={insertTemplate} onToggleStar={toggleStar} />
      <ReturnToAiModal isOpen={returnModal.isOpen} onClose={returnModal.onClose} onConfirm={doRelease} busy={busy === 'release'} agentName={conversation.agent?.name} />
    </>
  );
};

function mergeMessages(current = [], incoming = []) {
  const seen = new Set(incoming.map(msgKey));
  return [...incoming, ...current.filter((m) => !seen.has(msgKey(m)) && new Date(m.timestamp) > new Date(incoming[incoming.length - 1]?.timestamp || 0))];
}

export default ConversationView;
