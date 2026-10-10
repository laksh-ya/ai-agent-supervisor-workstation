// src/components/Header.js — top bar: brand, global search, supervisor menu
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Flex, Text, Input, InputGroup, InputLeftElement, Menu, MenuButton, MenuList, MenuItem, MenuDivider,
  MenuGroup, Switch, Kbd, useOutsideClick, Spinner
} from '@chakra-ui/react';
import { FiSearch } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import { useWebSocket, useSocketEvent } from '../context/WebSocketContext';
import { useSettings } from '../context/SettingsContext';
import { initials } from '../utils/format';
import { MobileNav } from './Sidebar';

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const debounced = useDebounced(q, 180);
  const navigate = useNavigate();
  const ref = useRef();
  const inputRef = useRef();
  useOutsideClick({ ref, handler: () => setOpen(false) });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !/input|textarea/i.test(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (debounced.trim().length < 2) { setResults(null); return undefined; }
    setLoading(true);
    api.search(debounced)
      .then((r) => { if (!cancelled) { setResults(r); setCursor(0); } })
      .catch(() => { if (!cancelled) setResults({ conversations: [], agents: [], templates: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  const items = useMemo(() => {
    if (!results) return [];
    return [
      ...results.conversations.map((c) => ({ key: `c-${c.id}`, group: 'Conversations', title: `${c.customer} · #${c.caseNumber}`, meta: `${c.issue || c.queue} · ${c.status}`, to: `/conversation/${c.id}` })),
      ...results.agents.map((a) => ({ key: `a-${a.id}`, group: 'AI agents', title: `${a.name}`, meta: `${a.version} · ${a.status}`, to: `/agent-config?agent=${a.id}` })),
      ...results.templates.map((t) => ({ key: `t-${t.id}`, group: 'Templates', title: t.name, meta: t.category, to: `/templates?template=${t.id}` }))
    ];
  }, [results]);

  const go = (item) => {
    if (!item) return;
    navigate(item.to);
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(items.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter') go(items[cursor]);
    else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  };

  let lastGroup = null;
  return (
    <Box ref={ref} position="relative" w={{ base: '100%', md: '283px' }} maxW="283px">
      <InputGroup size="md">
        <InputLeftElement pointerEvents="none" h="40px" color="#bfb6dc" display={q ? 'flex' : 'none'}>
          <FiSearch />
        </InputLeftElement>
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search conversations, agents…"
          aria-label="Search conversations, agents and templates"
          role="combobox"
          aria-expanded={open && !!results}
          aria-controls="global-search-results"
          h="40px"
          pl={q ? '36px' : '12px'}
          bg="#55458b"
          border="none"
          borderRadius="12px"
          color="white"
          fontSize="14px"
          _placeholder={{ color: '#dcd6eb' }}
          _hover={{ bg: '#5b4b93' }}
          _focusVisible={{ bg: '#5b4b93', boxShadow: '0 0 0 2px rgba(255,255,255,0.35)' }}
        />
      </InputGroup>
      {open && q.trim().length >= 2 && (
        <Box id="global-search-results" role="listbox" position="absolute" top="46px" left={0} right={0} bg="white" borderRadius="12px"
          boxShadow="pop" border="1px solid" borderColor="line.300" py="6px" zIndex={30} maxH="380px" overflowY="auto">
          {loading && !results && <Flex justify="center" align="center" gap="8px" py="14px"><Spinner size="sm" color="brand.500" /><Text fontSize="11px" color="ink.300">Searching</Text></Flex>}
          {results && !items.length && <Text fontSize="12px" color="ink.300" px="14px" py="12px">No conversations, agents or templates match “{q}”</Text>}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <React.Fragment key={item.key}>
                {header && <Text fontSize="9px" fontWeight={700} color="ink.200" textTransform="uppercase" px="14px" pt={i ? '8px' : '4px'} pb="4px">{header}</Text>}
                <Box role="option" aria-selected={i === cursor} px="14px" py="7px" cursor="pointer" bg={i === cursor ? 'brand.100' : 'transparent'}
                  onMouseEnter={() => setCursor(i)} onMouseDown={(e) => { e.preventDefault(); go(item); }}>
                  <Text fontSize="12px" fontWeight={600} color="ink.800">{item.title}</Text>
                  <Text fontSize="10px" color="ink.300" textTransform="capitalize">{item.meta}</Text>
                </Box>
              </React.Fragment>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function SupervisorMenu() {
  const { status } = useWebSocket();
  const settings = useSettings();
  const navigate = useNavigate();
  const [simulation, setSimulation] = useState(null);

  useEffect(() => { api.getSystemStatus().then((s) => setSimulation(s.simulation)).catch(() => {}); }, []);
  useSocketEvent('system_update', (m) => { if (m.data?.simulation !== undefined) setSimulation(m.data.simulation); });

  const connection = { open: ['#2e9e5b', 'Live'], connecting: ['#e1a43a', 'Connecting…'], closed: ['#d95b5b', 'Offline. Retrying'] }[status];

  return (
    <Menu placement="bottom-end">
      <MenuButton aria-label="Supervisor menu" position="relative" borderRadius="full" _focusVisible={{ boxShadow: '0 0 0 2px rgba(255,255,255,0.6)', outline: 'none' }}>
        <Flex w="36px" h="36px" borderRadius="full" bg="#f1c9a5" color="#5b3f2c" align="center" justify="center" fontSize="12px" fontWeight={700}>
          {initials(settings.supervisorName)}
        </Flex>
        <Box position="absolute" right="-1px" bottom="-1px" w="10px" h="10px" borderRadius="full" bg={connection[0]} border="2px solid #453674" />
      </MenuButton>
      <MenuList>
        <Box px="12px" py="6px">
          <Text fontSize="13px" fontWeight={700} color="ink.900">{settings.supervisorName}</Text>
          <Text fontSize="11px" color="ink.300">Supervisor · Ops Governance</Text>
          <Flex align="center" gap="6px" mt="6px">
            <Box w="7px" h="7px" borderRadius="full" bg={connection[0]} />
            <Text fontSize="11px" color="ink.500">{connection[1]}</Text>
          </Flex>
        </Box>
        <MenuDivider />
        <MenuGroup title="Live traffic">
          <Flex px="12px" py="6px" align="center" justify="space-between">
            <Text fontSize="12px">Conversation simulator</Text>
            <Switch size="sm" isChecked={!!simulation} isDisabled={simulation === null} aria-label="Toggle conversation simulator"
              onChange={(e) => api.setSimulation(e.target.checked).then((s) => setSimulation(s.simulation))} />
          </Flex>
        </MenuGroup>
        <MenuDivider />
        <MenuItem onClick={() => navigate('/settings')}>Settings</MenuItem>
        <MenuItem onClick={() => navigate('/templates')}>Response templates <Kbd ml="auto" fontSize="9px">/</Kbd></MenuItem>
      </MenuList>
    </Menu>
  );
}

const Header = () => {
  const settings = useSettings();
  return (
    <Box as="header" position="sticky" top={0} zIndex={20} bg="brand.700" h="72px" px={{ base: '12px', md: '32px' }} py="16px">
      <Flex justify="space-between" align="center" h="40px" gap="12px">
        <Flex align="center" minW={0} flexShrink={0}>
          <MobileNav />
          <Text fontSize={{ base: '16px', md: '18px' }} fontWeight={700} color="white" letterSpacing="-0.01em" whiteSpace="nowrap">{settings.companyName}</Text>
        </Flex>
        <Flex align="center" gap={{ base: '12px', md: '24px' }} flex={{ base: 1, md: 'initial' }} justify="flex-end" minW={0}>
          <GlobalSearch />
          <SupervisorMenu />
        </Flex>
      </Flex>
    </Box>
  );
};

export default Header;
