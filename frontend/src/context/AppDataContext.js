// src/context/AppDataContext.js
// Live state shared by every screen: open conversations (with risk), agents and knowledge
// bases. REST provides the initial state; WebSocket events keep it current.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Text, Button, useToast } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import { useSocketEvent } from './WebSocketContext';
import { useSettings } from './SettingsContext';

const AppDataContext = createContext(null);
export const useAppData = () => useContext(AppDataContext);

const LIVE = 'active,waiting,escalated';

function AlertToast({ alert, onOpen, onClose }) {
  return (
    <Box bg="white" borderRadius="12px" boxShadow="pop" borderLeft="4px solid" borderColor="tint.redBar" p="12px 14px" w="340px" role="alert">
      <Flex justify="space-between" align="flex-start" gap="12px">
        <Box>
          <Text fontSize="12px" fontWeight={700} color="ink.900">
            High-risk conversation · {alert.customer}{alert.caseNumber ? ` #${alert.caseNumber}` : ''}
          </Text>
          <Text fontSize="11px" color="ink.300" mt="2px">{alert.reason}</Text>
        </Box>
        <Button size="xs" variant="ghost" onClick={onClose} aria-label="Dismiss alert" px="6px">✕</Button>
      </Flex>
      <Button size="xs" mt="8px" onClick={onOpen}>Open conversation</Button>
    </Box>
  );
}

export const AppDataProvider = ({ children }) => {
  const [conversations, setConversations] = useState({}); // id -> summary
  const [agents, setAgents] = useState([]);
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [loading, setLoading] = useState({ conversations: true, agents: true });
  const [error, setError] = useState({ conversations: null, agents: null });
  const [revision, setRevision] = useState(0); // bumps on any live change (dashboards refetch)
  const settings = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const loadConversations = useCallback(async () => {
    try {
      const res = await api.getConversations({ view: 'summary', status: LIVE, sort: 'risk', limit: 200 });
      setConversations(Object.fromEntries(res.data.map((c) => [c.id, c])));
      setError((e) => ({ ...e, conversations: null }));
    } catch (err) {
      setError((e) => ({ ...e, conversations: err.message }));
    } finally {
      setLoading((l) => ({ ...l, conversations: false }));
    }
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      const [a, kb] = await Promise.all([api.getAgents(), api.getKnowledgeBases()]);
      setAgents(a);
      setKnowledgeBases(kb);
      setError((e) => ({ ...e, agents: null }));
    } catch (err) {
      setError((e) => ({ ...e, agents: err.message }));
    } finally {
      setLoading((l) => ({ ...l, agents: false }));
    }
  }, []);

  useEffect(() => {
    loadConversations();
    loadAgents();
  }, [loadConversations, loadAgents]);

  const upsert = useCallback((summary) => {
    if (!summary?.id) return;
    setConversations((prev) => ({ ...prev, [summary.id]: { ...(prev[summary.id] || {}), ...summary } }));
    setRevision((r) => r + 1);
  }, []);

  useSocketEvent('conversations_update', (m) => {
    if (Array.isArray(m.data) && m.data.length && m.data[0].risk) {
      setConversations(Object.fromEntries(m.data.map((c) => [c.id, c])));
      setLoading((l) => ({ ...l, conversations: false }));
    }
  });
  useSocketEvent(['new_conversation', 'conversation_updated'], (m) => upsert(m.data));
  useSocketEvent('message_update', (m) => {
    setConversations((prev) => {
      const c = prev[m.conversationId];
      if (!c) return prev;
      return { ...prev, [c.id]: { ...c, lastMessage: m.message, messageCount: (c.messageCount || 0) + 1 } };
    });
  });
  useSocketEvent('metrics_update', (m) => {
    setConversations((prev) => {
      const c = prev[m.conversationId];
      if (!c) return prev;
      return { ...prev, [c.id]: { ...c, metrics: { ...c.metrics, ...m.metrics } } };
    });
  });
  useSocketEvent('agent_update', (m) => {
    setAgents((prev) => prev.map((a) => (a.id === m.agentId ? { ...a, ...m.data } : a)));
  });
  useSocketEvent('socket_open', () => {
    // Reconnected: resync anything missed while offline
    loadConversations();
    loadAgents();
  });
  useSocketEvent('system_update', (m) => {
    if (m.data?.reset) { loadConversations(); loadAgents(); setRevision((r) => r + 1); }
  });
  useSocketEvent('alert', (m) => {
    if (!settingsRef.current.alertToasts) return;
    const alert = m.data || {};
    const id = `alert-${alert.conversationId}`;
    if (toast.isActive(id)) return;
    toast({
      id,
      position: 'bottom-right',
      duration: 9000,
      render: ({ onClose }) => (
        <AlertToast alert={alert} onClose={onClose} onOpen={() => { onClose(); navigate(`/conversation/${alert.conversationId}`); }} />
      )
    });
  });

  const notifyError = useCallback((title, err) => {
    toast({ status: 'error', title, description: err?.message, position: 'bottom-right', duration: 6000, isClosable: true });
  }, [toast]);

  // ---- Actions (server is the source of truth; WS echoes keep every tab in sync) ----
  const refreshOne = useCallback(async (id) => {
    const full = await api.getConversation(id);
    const { messages, ...summary } = full;
    upsert({ ...summary, messageCount: messages.length, lastMessage: messages[messages.length - 1] });
    return full;
  }, [upsert]);

  const takeOver = useCallback(async (id, notes = '') => {
    await api.interveneInConversation(id, notes);
    return refreshOne(id);
  }, [refreshOne]);

  const release = useCallback(async (id, notes) => {
    await api.releaseIntervention(id, notes);
    return refreshOne(id);
  }, [refreshOne]);

  const sendMessage = useCallback(async (id, text, templateId) => {
    const message = await api.addMessage(id, { sender: 'supervisor', text, templateId });
    return message;
  }, []);

  const setStatus = useCallback(async (id, status) => {
    await api.updateConversationStatus(id, status);
    return refreshOne(id);
  }, [refreshOne]);

  const liveList = useMemo(
    () => Object.values(conversations).filter((c) => c.status !== 'resolved').sort((a, b) => (b.risk?.score ?? 0) - (a.risk?.score ?? 0)),
    [conversations]
  );

  const value = useMemo(() => ({
    conversations,
    liveList,
    agents,
    knowledgeBases,
    loading,
    error,
    revision,
    reload: loadConversations,
    reloadAgents: loadAgents,
    upsertConversation: upsert,
    takeOver,
    release,
    sendMessage,
    setStatus,
    notifyError,
    // aliases kept for older call sites
    updateConversation: (id, data) => upsert({ id, ...data }),
    updateAgent: (id, data) => setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a))),
    interveneInConversation: takeOver
  }), [conversations, liveList, agents, knowledgeBases, loading, error, revision, loadConversations, loadAgents, upsert, takeOver, release, sendMessage, setStatus, notifyError]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};
